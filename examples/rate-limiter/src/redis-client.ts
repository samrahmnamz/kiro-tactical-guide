/**
 * Redis client wrapper with connection pooling and Lua scripts for atomic operations
 */

import { createClient, RedisClientType } from 'redis';
import { RedisConfig, RedisCheckResult } from './types';
import pino from 'pino';

const logger = pino({ name: 'redis-client' });

/**
 * Lua script for atomic sliding window rate limit check
 * 
 * This script:
 * 1. Removes expired entries from the sorted set
 * 2. Counts remaining entries in the current window
 * 3. Adds the current request if under limit
 * 4. Returns: allowed (1/0), remaining count, reset timestamp
 */
const SLIDING_WINDOW_SCRIPT = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local limit = tonumber(ARGV[3])
  local request_id = ARGV[4]
  
  -- Remove expired entries (older than window)
  local min_time = now - window
  redis.call('ZREMRANGEBYSCORE', key, '-inf', min_time)
  
  -- Count current entries in window
  local current = redis.call('ZCARD', key)
  
  -- Check if under limit
  local allowed = 0
  local remaining = 0
  local reset_at = now + window
  
  if current < limit then
    -- Add current request to sorted set with timestamp as score
    redis.call('ZADD', key, now, request_id)
    redis.call('EXPIRE', key, window + 10) -- Set expiry with 10s buffer
    allowed = 1
    remaining = limit - current - 1
  else
    remaining = 0
    -- Get timestamp of oldest entry for reset time
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    if #oldest >= 2 then
      reset_at = tonumber(oldest[2]) + window
    end
  end
  
  return {allowed, remaining, reset_at}
`;

/**
 * Redis client wrapper with connection pooling and atomic operations
 */
export class RedisClient {
  private client: RedisClientType | null = null;
  private config: RedisConfig;
  private isConnected: boolean = false;
  private scriptSha: string | null = null;

  constructor(config: RedisConfig) {
    this.config = {
      poolSize: 10,
      connectTimeout: 5000,
      commandTimeout: 100,
      maxRetries: 3,
      ...config,
    };
  }

  /**
   * Connect to Redis and load Lua scripts
   */
  async connect(): Promise<void> {
    try {
      this.client = createClient({
        url: this.config.url,
        socket: {
          connectTimeout: this.config.connectTimeout,
          reconnectStrategy: (retries) => {
            if (retries > this.config.maxRetries!) {
              logger.error('Redis max retries exceeded');
              return new Error('Max retries exceeded');
            }
            // Exponential backoff: 50ms, 100ms, 200ms, etc.
            return Math.min(retries * 50, 2000);
          },
        },
      });

      this.client.on('error', (err) => {
        logger.error({ err }, 'Redis client error');
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        logger.warn('Redis client disconnected');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        logger.info('Redis client reconnecting');
      });

      await this.client.connect();

      // Load Lua script and cache SHA
      this.scriptSha = await this.client.scriptLoad(SLIDING_WINDOW_SCRIPT);
      logger.info({ scriptSha: this.scriptSha }, 'Loaded sliding window Lua script');

      this.isConnected = true;
    } catch (error) {
      logger.error({ error }, 'Failed to connect to Redis');
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      logger.info('Redis client disconnected');
    }
  }

  /**
   * Check if client is connected
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Check rate limit using atomic Lua script
   * 
   * @param identifier User ID, API key, or IP address
   * @param resource Resource being accessed
   * @param limit Maximum requests allowed in window
   * @param windowSeconds Time window in seconds
   * @returns Result with allowed status, remaining count, and reset timestamp
   */
  async checkRateLimit(
    identifier: string,
    resource: string,
    limit: number,
    windowSeconds: number
  ): Promise<RedisCheckResult> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const now = Math.floor(Date.now() / 1000);
    const key = `ratelimit:${resource}:${identifier}`;
    const requestId = `${now}:${Math.random().toString(36).substring(7)}`;

    try {
      const startTime = Date.now();

      // Execute Lua script using evalSha for better performance
      const result = await this.client.evalSha(
        this.scriptSha!,
        {
          keys: [key],
          arguments: [now.toString(), windowSeconds.toString(), limit.toString(), requestId],
        }
      );

      const latency = Date.now() - startTime;

      if (latency > this.config.commandTimeout!) {
        logger.warn(
          { latency, threshold: this.config.commandTimeout },
          'Redis command latency exceeded threshold'
        );
      }

      // Parse result from Lua script
      const [allowed, remaining, resetAt] = result as [number, number, number];

      return {
        allowed: allowed === 1,
        remaining,
        resetAt,
      };
    } catch (error) {
      logger.error({ error, identifier, resource }, 'Redis rate limit check failed');
      throw error;
    }
  }

  /**
   * Get current count for identifier/resource (for testing)
   */
  async getCurrentCount(identifier: string, resource: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const key = `ratelimit:${resource}:${identifier}`;
    const now = Math.floor(Date.now() / 1000);
    
    // Remove expired entries first
    await this.client.zRemRangeByScore(key, '-inf', now - 3600); // Clean up old entries
    
    // Get current count
    const count = await this.client.zCard(key);
    return count;
  }

  /**
   * Clear rate limit data for identifier/resource (for testing)
   */
  async clearRateLimit(identifier: string, resource: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const key = `ratelimit:${resource}:${identifier}`;
    await this.client.del(key);
  }

  /**
   * Get Redis info (for health checks)
   */
  async getInfo(): Promise<string> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected');
    }

    return await this.client.info();
  }

  /**
   * Ping Redis (for health checks)
   */
  async ping(): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error({ error }, 'Redis ping failed');
      return false;
    }
  }
}
