/**
 * Rate limiter service with sliding window algorithm and Redis failover handling
 */

import { RedisClient } from './redis-client';
import {
  RateLimitCheckRequest,
  RateLimitCheckResponse,
  RateLimiterOptions,
  LocalCacheEntry,
  RateLimitAllowedResponse,
  RateLimitRejectedResponse,
} from './types';
import pino from 'pino';
import crypto from 'crypto';

const logger = pino({ name: 'rate-limiter' });

/**
 * Rate limiter service implementing sliding window algorithm with Redis
 * 
 * Features:
 * - Sliding window algorithm (not fixed window) for smooth rate limiting
 * - Atomic operations using Lua scripts
 * - Graceful degradation on Redis failure (fail open strategy)
 * - Local cache fallback for Redis slowness
 * - Input validation
 */
export class RateLimiter {
  private redisClient: RedisClient;
  private localCache: Map<string, LocalCacheEntry>;
  private options: Required<RateLimiterOptions>;
  private redisAvailable: boolean = false;
  private localCacheHits: number = 0;
  private redisFallbackCount: number = 0;

  constructor(options: RateLimiterOptions) {
    this.options = {
      enableLocalCache: true,
      localCacheTTL: 5,
      redisSlowThreshold: 100,
      ...options,
    };

    this.redisClient = new RedisClient(this.options.redis);
    this.localCache = new Map();

    // Periodic cleanup of expired cache entries
    setInterval(() => this.cleanupLocalCache(), 5000);
  }

  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<void> {
    try {
      await this.redisClient.connect();
      this.redisAvailable = true;
      logger.info('Rate limiter initialized with Redis');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Redis, operating in fail-open mode');
      this.redisAvailable = false;
    }
  }

  /**
   * Shutdown rate limiter and disconnect from Redis
   */
  async shutdown(): Promise<void> {
    await this.redisClient.disconnect();
    this.localCache.clear();
    logger.info('Rate limiter shutdown complete');
  }

  /**
   * Check if request is allowed under rate limit
   * 
   * @param request Rate limit check request
   * @returns Response indicating if allowed with remaining count
   */
  async checkRateLimit(request: RateLimitCheckRequest): Promise<RateLimitCheckResponse> {
    // Input validation
    this.validateRequest(request);

    const { identifier, resource, limit, windowSeconds } = request;

    // Hash identifier for privacy (no PII in logs)
    const hashedIdentifier = this.hashIdentifier(identifier);

    try {
      // Check if Redis is available
      if (!this.redisAvailable || !this.redisClient.getIsConnected()) {
        logger.warn(
          { resource, hashedIdentifier },
          'Redis unavailable, failing open (allowing request)'
        );
        this.redisFallbackCount++;
        return this.createAllowedResponse(limit - 1, Date.now() / 1000 + windowSeconds);
      }

      // Try Redis with timeout
      const startTime = Date.now();
      const result = await Promise.race([
        this.redisClient.checkRateLimit(identifier, resource, limit, windowSeconds),
        this.createTimeout(this.options.redisSlowThreshold),
      ]);

      const latency = Date.now() - startTime;

      // If Redis is slow, use local cache fallback
      if (!result) {
        logger.warn(
          { latency, threshold: this.options.redisSlowThreshold, resource, hashedIdentifier },
          'Redis slow, using local cache fallback'
        );
        return this.checkLocalCache(identifier, resource, limit, windowSeconds);
      }

      // Redis succeeded, return result
      const now = Math.floor(Date.now() / 1000);

      if (result.allowed) {
        logger.debug(
          { resource, hashedIdentifier, remaining: result.remaining, latency },
          'Rate limit check: allowed'
        );
        return this.createAllowedResponse(result.remaining, result.resetAt);
      } else {
        const retryAfter = Math.max(0, result.resetAt - now);
        logger.info(
          { resource, hashedIdentifier, retryAfter, latency },
          'Rate limit check: rejected'
        );
        return this.createRejectedResponse(result.resetAt, retryAfter);
      }
    } catch (error) {
      logger.error(
        { error, resource, hashedIdentifier },
        'Redis error, failing open (allowing request)'
      );
      this.redisFallbackCount++;
      this.redisAvailable = false;

      // Attempt to reconnect in background
      this.attemptReconnect();

      // Fail open: allow request
      return this.createAllowedResponse(limit - 1, Date.now() / 1000 + windowSeconds);
    }
  }

  /**
   * Check rate limit using local cache (fallback)
   */
  private checkLocalCache(
    identifier: string,
    resource: string,
    limit: number,
    windowSeconds: number
  ): RateLimitCheckResponse {
    const cacheKey = `${resource}:${identifier}`;
    const now = Math.floor(Date.now() / 1000);
    const entry = this.localCache.get(cacheKey);

    if (entry && entry.expiresAt > now) {
      // Entry exists and not expired
      if (entry.count < limit) {
        // Under limit, allow
        entry.count++;
        this.localCacheHits++;
        return this.createAllowedResponse(limit - entry.count, entry.windowStart + windowSeconds);
      } else {
        // Over limit, reject
        const retryAfter = entry.windowStart + windowSeconds - now;
        return this.createRejectedResponse(entry.windowStart + windowSeconds, Math.max(0, retryAfter));
      }
    } else {
      // New window
      const newEntry: LocalCacheEntry = {
        count: 1,
        windowStart: now,
        expiresAt: now + this.options.localCacheTTL,
      };
      this.localCache.set(cacheKey, newEntry);
      this.localCacheHits++;
      return this.createAllowedResponse(limit - 1, now + windowSeconds);
    }
  }

  /**
   * Validate rate limit request
   */
  private validateRequest(request: RateLimitCheckRequest): void {
    const { identifier, resource, limit, windowSeconds } = request;

    // Check required fields
    if (!identifier || typeof identifier !== 'string' || identifier.trim().length === 0) {
      throw new Error('Invalid identifier: must be non-empty string');
    }

    if (!resource || typeof resource !== 'string' || resource.trim().length === 0) {
      throw new Error('Invalid resource: must be non-empty string');
    }

    // Check limits
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('Invalid limit: must be positive integer');
    }

    if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
      throw new Error('Invalid windowSeconds: must be positive integer');
    }

    // Check string lengths
    if (identifier.length > 256) {
      throw new Error('Invalid identifier: maximum 256 characters');
    }

    if (resource.length > 128) {
      throw new Error('Invalid resource: maximum 128 characters');
    }

    // Check for control characters and invalid UTF-8
    if (!/^[\x20-\x7E\u00A0-\uFFFF]*$/.test(identifier)) {
      throw new Error('Invalid identifier: contains control characters');
    }

    if (!/^[\x20-\x7E\u00A0-\uFFFF]*$/.test(resource)) {
      throw new Error('Invalid resource: contains control characters');
    }

    // Check reasonable limits
    if (limit > 1000000) {
      throw new Error('Invalid limit: maximum 1,000,000');
    }

    if (windowSeconds > 86400) {
      throw new Error('Invalid windowSeconds: maximum 86400 (24 hours)');
    }
  }

  /**
   * Hash identifier for privacy (no PII in logs)
   */
  private hashIdentifier(identifier: string): string {
    return crypto.createHash('sha256').update(identifier).digest('hex').substring(0, 16);
  }

  /**
   * Create allowed response
   */
  private createAllowedResponse(remaining: number, resetAt: number): RateLimitAllowedResponse {
    return {
      allowed: true,
      remaining: Math.max(0, remaining),
      resetAt: Math.floor(resetAt),
      retryAfter: null,
    };
  }

  /**
   * Create rejected response
   */
  private createRejectedResponse(resetAt: number, retryAfter: number): RateLimitRejectedResponse {
    return {
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(resetAt),
      retryAfter: Math.max(0, Math.ceil(retryAfter)),
    };
  }

  /**
   * Create timeout promise
   */
  private createTimeout(ms: number): Promise<null> {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
  }

  /**
   * Clean up expired local cache entries
   */
  private cleanupLocalCache(): void {
    const now = Math.floor(Date.now() / 1000);
    let removed = 0;

    for (const [key, entry] of this.localCache.entries()) {
      if (entry.expiresAt <= now) {
        this.localCache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug({ removed, totalEntries: this.localCache.size }, 'Cleaned up local cache');
    }
  }

  /**
   * Attempt to reconnect to Redis (background)
   */
  private async attemptReconnect(): Promise<void> {
    if (this.redisAvailable) {
      return; // Already reconnected
    }

    try {
      logger.info('Attempting to reconnect to Redis');
      await this.redisClient.connect();
      this.redisAvailable = true;
      logger.info('Redis reconnected successfully');
    } catch (error) {
      logger.debug({ error }, 'Redis reconnection attempt failed, will retry');
      // Will retry on next request or via Redis client's built-in reconnection
    }
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    redisAvailable: boolean;
    localCacheSize: number;
    localCacheHits: number;
    redisFallbackCount: number;
  } {
    return {
      redisAvailable: this.redisAvailable,
      localCacheSize: this.localCache.size,
      localCacheHits: this.localCacheHits,
      redisFallbackCount: this.redisFallbackCount,
    };
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.localCacheHits = 0;
    this.redisFallbackCount = 0;
  }
}
