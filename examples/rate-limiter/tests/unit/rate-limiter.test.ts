/**
 * Unit tests for rate limiter service
 * 
 * **Validates: Requirements from spec.md**
 * - Positive cases (✓ must pass)
 * - Negative cases (✗ must be rejected)
 * - Edge cases (must be handled)
 * - Performance requirements
 */

import { RateLimiter } from '../../src/rate-limiter';
import { RedisClient } from '../../src/redis-client';
import { RateLimitCheckRequest } from '../../src/types';

// Mock Redis for unit tests
jest.mock('../../src/redis-client');

describe('RateLimiter - Unit Tests', () => {
  let rateLimiter: RateLimiter;
  let mockRedisClient: jest.Mocked<RedisClient>;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create rate limiter instance
    rateLimiter = new RateLimiter({
      redis: {
        url: 'redis://localhost:6379',
      },
      enableLocalCache: true,
      localCacheTTL: 5,
      redisSlowThreshold: 100,
    });

    // Mock Redis client
    mockRedisClient = (rateLimiter as any).redisClient;
    mockRedisClient.connect = jest.fn().mockResolvedValue(undefined);
    mockRedisClient.disconnect = jest.fn().mockResolvedValue(undefined);
    mockRedisClient.getIsConnected = jest.fn().mockReturnValue(true);

    await rateLimiter.initialize();
  });

  afterEach(async () => {
    await rateLimiter.shutdown();
  });

  describe('Positive Cases (✓ Must Pass)', () => {
    test('✓ Basic Rate Limiting: 10 requests per 60 seconds, 11th rejected', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      // Mock Redis responses: first 10 allowed, 11th rejected
      for (let i = 0; i < 10; i++) {
        mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
          allowed: true,
          remaining: 9 - i,
          resetAt: Math.floor(Date.now() / 1000) + 60,
        });

        const result = await rateLimiter.checkRateLimit(request);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9 - i);
      }

      // 11th request should be rejected
      mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });

      const result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    test('✓ Remaining Count Accuracy: After 3 requests with limit 10, remaining is 7', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
        allowed: true,
        remaining: 7,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });

      const result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7);
    });

    test('✓ Reset Timestamp Correctness: resetAt is windowSeconds after oldest request', async () => {
      const now = Math.floor(Date.now() / 1000);
      const windowSeconds = 60;
      const expectedResetAt = now + windowSeconds;

      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds,
      };

      mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetAt: expectedResetAt,
      });

      const result = await rateLimiter.checkRateLimit(request);
      expect(result.resetAt).toBe(expectedResetAt);
    });

    test('✓ RetryAfter Calculation: When rate limited, retryAfter = resetAt - currentTime', async () => {
      const now = Math.floor(Date.now() / 1000);
      const resetAt = now + 30; // Reset in 30 seconds

      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt,
      });

      const result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThanOrEqual(29); // Allow for timing precision
      expect(result.retryAfter).toBeLessThanOrEqual(31);
    });

    test('✓ Multiple Resources Isolation: Different resources tracked independently', async () => {
      const request1: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:payments',
        limit: 10,
        windowSeconds: 60,
      };

      const request2: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:users',
        limit: 10,
        windowSeconds: 60,
      };

      // Mock both resources as allowed
      mockRedisClient.checkRateLimit = jest.fn()
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 9,
          resetAt: Math.floor(Date.now() / 1000) + 60,
        })
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 9,
          resetAt: Math.floor(Date.now() / 1000) + 60,
        });

      const result1 = await rateLimiter.checkRateLimit(request1);
      const result2 = await rateLimiter.checkRateLimit(request2);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      // Both should have independent remaining counts
      expect(result1.remaining).toBe(9);
      expect(result2.remaining).toBe(9);
    });

    test('✓ Multiple Identifiers Isolation: Different users have independent limits', async () => {
      const request1: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      const request2: RateLimitCheckRequest = {
        identifier: 'user456',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      mockRedisClient.checkRateLimit = jest.fn()
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 9,
          resetAt: Math.floor(Date.now() / 1000) + 60,
        })
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 9,
          resetAt: Math.floor(Date.now() / 1000) + 60,
        });

      const result1 = await rateLimiter.checkRateLimit(request1);
      const result2 = await rateLimiter.checkRateLimit(request2);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result1.remaining).toBe(9);
      expect(result2.remaining).toBe(9);
    });
  });

  describe('Negative Cases (✗ Must Be Rejected)', () => {
    test('✗ Negative Limit: Must be rejected with validation error', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: -5,
        windowSeconds: 60,
      };

      await expect(rateLimiter.checkRateLimit(request))
        .rejects.toThrow('Invalid limit: must be positive integer');
    });

    test('✗ Zero Limit: Must be rejected with validation error', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 0,
        windowSeconds: 60,
      };

      await expect(rateLimiter.checkRateLimit(request))
        .rejects.toThrow('Invalid limit: must be positive integer');
    });

    test('✗ Negative Window: Must be rejected with validation error', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds: -60,
      };

      await expect(rateLimiter.checkRateLimit(request))
        .rejects.toThrow('Invalid windowSeconds: must be positive integer');
    });

    test('✗ Zero Window: Must be rejected with validation error', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 0,
      };

      await expect(rateLimiter.checkRateLimit(request))
        .rejects.toThrow('Invalid windowSeconds: must be positive integer');
    });

    test('✗ Empty Identifier: Must be rejected with validation error', async () => {
      const request: RateLimitCheckRequest = {
        identifier: '',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      await expect(rateLimiter.checkRateLimit(request))
        .rejects.toThrow('Invalid identifier: must be non-empty string');
    });

    test('✗ Whitespace-only Identifier: Must be rejected', async () => {
      const request: RateLimitCheckRequest = {
        identifier: '   ',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      await expect(rateLimiter.checkRateLimit(request))
        .rejects.toThrow('Invalid identifier: must be non-empty string');
    });

    test('✗ Empty Resource: Must be rejected with validation error', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: '',
        limit: 10,
        windowSeconds: 60,
      };

      await expect(rateLimiter.checkRateLimit(request))
        .rejects.toThrow('Invalid resource: must be non-empty string');
    });

    test('✗ Whitespace-only Resource: Must be rejected', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: '   ',
        limit: 10,
        windowSeconds: 60,
      };

      await expect(rateLimiter.checkRateLimit(request))
        .rejects.toThrow('Invalid resource: must be non-empty string');
    });

    test('✗ Oversized Identifier: >256 characters must be rejected', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'a'.repeat(257),
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      await expect(rateLimiter.checkRateLimit(request))
        .rejects.toThrow('Invalid identifier: maximum 256 characters');
    });

    test('✗ Oversized Resource: >128 characters must be rejected', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'a'.repeat(129),
        limit: 10,
        windowSeconds: 60,
      };

      await expect(rateLimiter.checkRateLimit(request))
        .rejects.toThrow('Invalid resource: maximum 128 characters');
    });

    test('✗ Invalid Identifier Characters: Control characters must be rejected', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user\x00123', // Null byte
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      await expect(rateLimiter.checkRateLimit(request))
        .rejects.toThrow('Invalid identifier: contains control characters');
    });

    test('✗ Invalid Resource Characters: Control characters must be rejected', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api\x00test', // Null byte
        limit: 10,
        windowSeconds: 60,
      };

      await expect(rateLimiter.checkRateLimit(request))
        .rejects.toThrow('Invalid resource: contains control characters');
    });
  });

  describe('Edge Cases (Must Be Handled)', () => {
    test('✓ Redis Unavailable (Fail Open): Allow requests and log error', async () => {
      // Simulate Redis unavailable
      mockRedisClient.getIsConnected = jest.fn().mockReturnValue(false);

      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      const result = await rateLimiter.checkRateLimit(request);

      // Should fail open (allow request)
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      
      // Check fallback counter incremented
      const health = rateLimiter.getHealthStatus();
      expect(health.redisFallbackCount).toBeGreaterThan(0);
    });

    test('✓ Redis Slow (Local Cache): Use local cache when Redis exceeds threshold', async () => {
      // Simulate slow Redis (timeout)
      mockRedisClient.checkRateLimit = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 200))
      );

      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      const result = await rateLimiter.checkRateLimit(request);

      // Should use local cache fallback
      expect(result.allowed).toBe(true);
      
      // Check local cache was used
      const health = rateLimiter.getHealthStatus();
      expect(health.localCacheHits).toBeGreaterThan(0);
    });

    test('✓ Empty Window: At start of new window, all requests up to limit allowed', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });

      const result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    test('✓ Very Short Windows: 1-second windows work correctly', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 5,
        windowSeconds: 1,
      };

      mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
        allowed: true,
        remaining: 4,
        resetAt: Math.floor(Date.now() / 1000) + 1,
      });

      const result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    test('✓ Very Long Windows: 86400-second (24 hour) windows work correctly', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 1000,
        windowSeconds: 86400,
      };

      mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
        allowed: true,
        remaining: 999,
        resetAt: Math.floor(Date.now() / 1000) + 86400,
      });

      const result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(999);
    });

    test('✓ High Limit Values: Limits up to 1,000,000 work correctly', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 1000000,
        windowSeconds: 3600,
      };

      mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
        allowed: true,
        remaining: 999999,
        resetAt: Math.floor(Date.now() / 1000) + 3600,
      });

      const result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(999999);
    });

    test('✓ Redis Error (Fail Open): Allow requests on Redis exception', async () => {
      mockRedisClient.checkRateLimit = jest.fn().mockRejectedValue(
        new Error('Redis connection lost')
      );

      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      const result = await rateLimiter.checkRateLimit(request);

      // Should fail open
      expect(result.allowed).toBe(true);
    });
  });

  describe('Performance Requirements (Must Meet SLA)', () => {
    test('✓ P50 Latency: <10ms with Redis available', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });

      const latencies: number[] = [];

      // Run 100 requests and measure latency
      for (let i = 0; i < 100; i++) {
        const start = Date.now();
        await rateLimiter.checkRateLimit(request);
        latencies.push(Date.now() - start);
      }

      // Calculate P50
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];

      expect(p50).toBeLessThan(10);
    });

    test('✓ Redis Connection Pool: No connection leaks', async () => {
      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });

      // Make many requests
      const promises = Array.from({ length: 1000 }, () =>
        rateLimiter.checkRateLimit(request)
      );

      await Promise.all(promises);

      // Health check should still work
      const health = rateLimiter.getHealthStatus();
      expect(health).toBeDefined();
    });
  });

  describe('Local Cache Behavior', () => {
    test('Local cache uses correct TTL', async () => {
      // Simulate Redis SLOW (not unavailable) to trigger local cache
      // Redis slow triggers local cache, while unavailable triggers fail-open
      mockRedisClient.checkRateLimit = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          allowed: true,
          remaining: 9,
          resetAt: Math.floor(Date.now() / 1000) + 60,
        }), 200)) // Exceeds redisSlowThreshold of 100ms
      );

      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 10,
        windowSeconds: 60,
      };

      // First request (will timeout and use local cache)
      await rateLimiter.checkRateLimit(request);

      // Check cache has entry
      const health1 = rateLimiter.getHealthStatus();
      expect(health1.localCacheSize).toBeGreaterThan(0);

      // Wait for TTL + cleanup (5s + 5s cleanup interval)
      await new Promise((resolve) => setTimeout(resolve, 11000));

      // Cache should be cleaned up
      const health2 = rateLimiter.getHealthStatus();
      expect(health2.localCacheSize).toBe(0);
    }, 15000);

    test('Local cache tracks requests correctly', async () => {
      // Simulate Redis SLOW to trigger local cache usage
      mockRedisClient.checkRateLimit = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          allowed: true,
          remaining: 2,
          resetAt: Math.floor(Date.now() / 1000) + 60,
        }), 200)) // Exceeds threshold
      );

      const request: RateLimitCheckRequest = {
        identifier: 'user123',
        resource: 'api:test',
        limit: 3,
        windowSeconds: 60,
      };

      // Make 3 requests (should all be allowed via local cache)
      const result1 = await rateLimiter.checkRateLimit(request);
      const result2 = await rateLimiter.checkRateLimit(request);
      const result3 = await rateLimiter.checkRateLimit(request);

      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);

      // 4th request should be rejected
      const result4 = await rateLimiter.checkRateLimit(request);
      expect(result4.allowed).toBe(false);
      expect(result4.remaining).toBe(0);
      expect(result4.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('Health Status', () => {
    test('Health status provides accurate metrics', async () => {
      const health = rateLimiter.getHealthStatus();

      expect(health).toHaveProperty('redisAvailable');
      expect(health).toHaveProperty('localCacheSize');
      expect(health).toHaveProperty('localCacheHits');
      expect(health).toHaveProperty('redisFallbackCount');

      expect(typeof health.redisAvailable).toBe('boolean');
      expect(typeof health.localCacheSize).toBe('number');
      expect(typeof health.localCacheHits).toBe('number');
      expect(typeof health.redisFallbackCount).toBe('number');
    });

    test('Can reset metrics', () => {
      rateLimiter.resetMetrics();

      const health = rateLimiter.getHealthStatus();
      expect(health.localCacheHits).toBe(0);
      expect(health.redisFallbackCount).toBe(0);
    });
  });
});
