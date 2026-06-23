/**
 * Type definitions for the rate limiter service
 */

/**
 * Request to check if an action is allowed under rate limit
 */
export interface RateLimitCheckRequest {
  /** User ID, API key, or IP address */
  identifier: string;
  /** Resource being accessed (e.g., "api:payments:create") */
  resource: string;
  /** Maximum requests allowed in window */
  limit: number;
  /** Time window in seconds (e.g., 60 for per-minute) */
  windowSeconds: number;
}

/**
 * Response when request is allowed
 */
export interface RateLimitAllowedResponse {
  /** Whether the request is allowed */
  allowed: true;
  /** Requests remaining in current window */
  remaining: number;
  /** Unix timestamp when limit resets */
  resetAt: number;
  /** Seconds until next request allowed (null when allowed) */
  retryAfter: null;
}

/**
 * Response when request is rate limited
 */
export interface RateLimitRejectedResponse {
  /** Whether the request is allowed */
  allowed: false;
  /** Requests remaining (0 when rate limited) */
  remaining: 0;
  /** Unix timestamp when limit resets */
  resetAt: number;
  /** Seconds until next request allowed */
  retryAfter: number;
}

/**
 * Combined response type
 */
export type RateLimitCheckResponse = RateLimitAllowedResponse | RateLimitRejectedResponse;

/**
 * Rate limit configuration for a resource
 */
export interface RateLimitConfig {
  /** Resource identifier */
  resource: string;
  /** Maximum requests allowed in window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Human-readable description */
  description?: string;
}

/**
 * Configuration update request
 */
export interface RateLimitConfigUpdateRequest {
  /** Maximum requests allowed in window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Human-readable description */
  description?: string;
}

/**
 * Redis connection configuration
 */
export interface RedisConfig {
  /** Redis connection URL */
  url: string;
  /** Connection pool size */
  poolSize?: number;
  /** Connection timeout in milliseconds */
  connectTimeout?: number;
  /** Command timeout in milliseconds */
  commandTimeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
}

/**
 * Local cache entry for fallback
 */
export interface LocalCacheEntry {
  /** Current count of requests in window */
  count: number;
  /** Timestamp when window started */
  windowStart: number;
  /** Timestamp when entry expires */
  expiresAt: number;
}

/**
 * Rate limiter service options
 */
export interface RateLimiterOptions {
  /** Redis configuration */
  redis: RedisConfig;
  /** Enable local cache fallback */
  enableLocalCache?: boolean;
  /** Local cache TTL in seconds */
  localCacheTTL?: number;
  /** Redis latency threshold for fallback (ms) */
  redisSlowThreshold?: number;
}

/**
 * Rate limit check result from Redis
 */
export interface RedisCheckResult {
  /** Whether request is allowed */
  allowed: boolean;
  /** Requests remaining in window */
  remaining: number;
  /** Unix timestamp when oldest request in window expires */
  resetAt: number;
}
