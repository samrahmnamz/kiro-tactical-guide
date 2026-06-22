/**
 * Integration tests for Rate Limiter API
 * 
 * Tests comprehensive rate limit enforcement, sliding window behavior,
 * distributed counting, and burst handling scenarios.
 * 
 * **Validates: Requirements 4.2** (Stability - rate limit enforcement, sliding window)
 */

import { RedisClient } from '../../src/redis-client';
import { RateLimiter } from '../../src/rate-limiter';
import { RateLimitCheckRequest } from '../../src/types';

describe('Rate Limiter Integration Tests', () => {
  let redisClient: RedisClient;
  let rateLimiter: RateLimiter;

  const TEST_REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  const TEST_IDENTIFIER = 'test-user-integration';
  const TEST_RESOURCE = 'api:integration:test';

  beforeAll(async () => {
    // Initialize Redis client
    redisClient = new RedisClient({
      url: TEST_REDIS_URL,
      connectTimeout: 5000,
    });

    try {
      await redisClient.connect();
    } catch (error) {
      console.warn('Redis not available for integration tests, skipping');
      return;
    }

    // Initialize rate limiter
    rateLimiter = new RateLimiter({
      redis: {
        url: TEST_REDIS_URL,
      },
    });

    await rateLimiter.initialize();
  });

  afterAll(async () => {
    if (rateLimiter) {
      await rateLimiter.shutdown();
    }
    if (redisClient) {
      await redisClient.disconnect();
    }
  });

  beforeEach(async () => {
    if (!redisClient.getIsConnected()) {
      return;
    }

    // Clean up test data before each test
    await redisClient.clearRateLimit(TEST_IDENTIFIER, TEST_RESOURCE);
    await redisClient.clearRateLimit(`${TEST_IDENTIFIER}-1`, TEST_RESOURCE);
    await redisClient.clearRateLimit(`${TEST_IDENTIFIER}-2`, TEST_RESOURCE);
    await redisClient.clearRateLimit('burst-user', 'api:burst:test');
    rateLimiter.resetMetrics();
  });

  describe('Rate Limit Enforcement', () => {
    it('should enforce basic rate limit correctly', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const request: RateLimitCheckRequest = {
        identifier: TEST_IDENTIFIER,
        resource: TEST_RESOURCE,
        limit: 5,
        windowSeconds: 10,
      };

      // First 5 requests should be allowed
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkRateLimit(request);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }

      // 6th request should be rejected
      const rejectedResult = await rateLimiter.checkRateLimit(request);
      expect(rejectedResult.allowed).toBe(false);
      expect(rejectedResult.remaining).toBe(0);
      expect(rejectedResult.retryAfter).toBeGreaterThan(0);
    });

    it('should allow requests again after window expires', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const request: RateLimitCheckRequest = {
        identifier: TEST_IDENTIFIER,
        resource: TEST_RESOURCE,
        limit: 3,
        windowSeconds: 2, // Short window for test
      };

      // Use up the limit
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkRateLimit(request);
        expect(result.allowed).toBe(true);
      }

      // Should be rate limited
      let result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Should be allowed again
      result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should isolate rate limits by identifier', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const baseRequest: RateLimitCheckRequest = {
        identifier: '',
        resource: TEST_RESOURCE,
        limit: 3,
        windowSeconds: 10,
      };

      // User 1 uses up their limit
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkRateLimit({
          ...baseRequest,
          identifier: `${TEST_IDENTIFIER}-1`,
        });
        expect(result.allowed).toBe(true);
      }

      // User 1 should be rate limited
      let result = await rateLimiter.checkRateLimit({
        ...baseRequest,
        identifier: `${TEST_IDENTIFIER}-1`,
      });
      expect(result.allowed).toBe(false);

      // User 2 should still be allowed (independent limit)
      result = await rateLimiter.checkRateLimit({
        ...baseRequest,
        identifier: `${TEST_IDENTIFIER}-2`,
      });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should isolate rate limits by resource', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const baseRequest: RateLimitCheckRequest = {
        identifier: TEST_IDENTIFIER,
        resource: '',
        limit: 2,
        windowSeconds: 10,
      };

      // Use up limit for resource 1
      for (let i = 0; i < 2; i++) {
        const result = await rateLimiter.checkRateLimit({
          ...baseRequest,
          resource: 'api:resource:1',
        });
        expect(result.allowed).toBe(true);
      }

      // Resource 1 should be rate limited
      let result = await rateLimiter.checkRateLimit({
        ...baseRequest,
        resource: 'api:resource:1',
      });
      expect(result.allowed).toBe(false);

      // Resource 2 should still be allowed
      result = await rateLimiter.checkRateLimit({
        ...baseRequest,
        resource: 'api:resource:2',
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('Sliding Window Behavior', () => {
    it('should implement sliding window, not fixed window', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const request: RateLimitCheckRequest = {
        identifier: TEST_IDENTIFIER,
        resource: TEST_RESOURCE,
        limit: 4,
        windowSeconds: 3,
      };

      // T=0: Make 2 requests
      for (let i = 0; i < 2; i++) {
        const result = await rateLimiter.checkRateLimit(request);
        expect(result.allowed).toBe(true);
      }

      // T=1.5s: Make 2 more requests (total 4 in window)
      await new Promise((resolve) => setTimeout(resolve, 1500));
      for (let i = 0; i < 2; i++) {
        const result = await rateLimiter.checkRateLimit(request);
        expect(result.allowed).toBe(true);
      }

      // T=1.5s: Next request should be rejected (4 requests in 3s window)
      let result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(false);

      // T=3.5s: First 2 requests should have expired, allowing 2 more
      await new Promise((resolve) => setTimeout(resolve, 2000));
      result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('should provide accurate remaining count', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const request: RateLimitCheckRequest = {
        identifier: TEST_IDENTIFIER,
        resource: TEST_RESOURCE,
        limit: 10,
        windowSeconds: 10,
      };

      // Make requests and verify remaining count decreases
      for (let i = 0; i < 10; i++) {
        const result = await rateLimiter.checkRateLimit(request);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9 - i);
      }

      // After limit reached, remaining should be 0
      const result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should provide correct resetAt timestamp', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const windowSeconds = 5;
      const request: RateLimitCheckRequest = {
        identifier: TEST_IDENTIFIER,
        resource: TEST_RESOURCE,
        limit: 2,
        windowSeconds,
      };

      const startTime = Math.floor(Date.now() / 1000);

      // First request
      const result1 = await rateLimiter.checkRateLimit(request);
      expect(result1.allowed).toBe(true);

      // resetAt should be approximately startTime + windowSeconds
      expect(result1.resetAt).toBeGreaterThanOrEqual(startTime + windowSeconds - 1);
      expect(result1.resetAt).toBeLessThanOrEqual(startTime + windowSeconds + 1);

      // Second request
      const result2 = await rateLimiter.checkRateLimit(request);
      expect(result2.allowed).toBe(true);

      // resetAt should still be based on first request
      expect(result2.resetAt).toBe(result1.resetAt);
    });

    it('should calculate retryAfter correctly when rate limited', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const request: RateLimitCheckRequest = {
        identifier: TEST_IDENTIFIER,
        resource: TEST_RESOURCE,
        limit: 2,
        windowSeconds: 5,
      };

      // Use up limit
      await rateLimiter.checkRateLimit(request);
      await rateLimiter.checkRateLimit(request);

      // Get rate limited response
      const beforeTime = Math.floor(Date.now() / 1000);
      const result = await rateLimiter.checkRateLimit(request);
      const afterTime = Math.floor(Date.now() / 1000);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(5);

      // retryAfter should approximately equal resetAt - currentTime
      const expectedRetryAfter = result.resetAt - afterTime;
      expect(result.retryAfter).toBeGreaterThanOrEqual(expectedRetryAfter - 1);
      expect(result.retryAfter).toBeLessThanOrEqual(expectedRetryAfter + 1);
    });
  });

  describe('Distributed Counting', () => {
    it('should maintain accurate counts under concurrent requests', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const limit = 20;
      const request: RateLimitCheckRequest = {
        identifier: TEST_IDENTIFIER,
        resource: TEST_RESOURCE,
        limit,
        windowSeconds: 10,
      };

      // Simulate concurrent requests (30 requests, limit is 20)
      const promises = [];
      for (let i = 0; i < 30; i++) {
        promises.push(rateLimiter.checkRateLimit(request));
      }

      const results = await Promise.all(promises);

      // Count allowed and rejected
      const allowedCount = results.filter((r) => r.allowed).length;
      const rejectedCount = results.filter((r) => !r.allowed).length;

      // Should allow exactly 'limit' requests (within 1% accuracy)
      expect(allowedCount).toBeGreaterThanOrEqual(Math.floor(limit * 0.99));
      expect(allowedCount).toBeLessThanOrEqual(Math.ceil(limit * 1.01));
      expect(allowedCount + rejectedCount).toBe(30);
    });

    it('should handle concurrent requests from different identifiers', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const limit = 5;
      const baseRequest: RateLimitCheckRequest = {
        identifier: '',
        resource: TEST_RESOURCE,
        limit,
        windowSeconds: 10,
      };

      // Simulate concurrent requests from 3 different users
      const promises = [];
      for (let userId = 1; userId <= 3; userId++) {
        for (let i = 0; i < 7; i++) {
          promises.push(
            rateLimiter.checkRateLimit({
              ...baseRequest,
              identifier: `${TEST_IDENTIFIER}-${userId}`,
            })
          );
        }
      }

      const results = await Promise.all(promises);

      // Each user should have exactly 5 allowed requests
      for (let userId = 1; userId <= 3; userId++) {
        const userResults = results.slice((userId - 1) * 7, userId * 7);
        const allowedCount = userResults.filter((r) => r.allowed).length;
        expect(allowedCount).toBe(5);
      }
    });

    it('should not double-count requests during retries', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const request: RateLimitCheckRequest = {
        identifier: TEST_IDENTIFIER,
        resource: TEST_RESOURCE,
        limit: 5,
        windowSeconds: 10,
      };

      // Make first request
      const result1 = await rateLimiter.checkRateLimit(request);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(4);

      // Retry same request immediately (within 1ms)
      const result2 = await rateLimiter.checkRateLimit(request);

      // Should count as separate request (not idempotent by default)
      // Note: True idempotency would require request IDs from client
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(3);

      // Verify total count in Redis
      const actualCount = await redisClient.getCurrentCount(TEST_IDENTIFIER, TEST_RESOURCE);
      expect(actualCount).toBe(2);
    });
  });

  describe('Burst Handling', () => {
    it('should handle burst traffic at limit boundary', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const limit = 10;
      const request: RateLimitCheckRequest = {
        identifier: 'burst-user',
        resource: 'api:burst:test',
        limit,
        windowSeconds: 5,
      };

      // Send burst of requests exactly at limit
      const promises = [];
      for (let i = 0; i < limit; i++) {
        promises.push(rateLimiter.checkRateLimit(request));
      }

      const results = await Promise.all(promises);

      // All requests up to limit should be allowed
      const allowedCount = results.filter((r) => r.allowed).length;
      expect(allowedCount).toBe(limit);

      // Next request should be rejected
      const nextResult = await rateLimiter.checkRateLimit(request);
      expect(nextResult.allowed).toBe(false);
    });

    it('should prevent burst at window boundary with sliding window', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const request: RateLimitCheckRequest = {
        identifier: 'burst-user',
        resource: 'api:burst:test',
        limit: 5,
        windowSeconds: 2,
      };

      // T=0: Send 5 requests (fill limit)
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkRateLimit(request);
        expect(result.allowed).toBe(true);
      }

      // T=0: Should be rate limited
      let result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(false);

      // T=1s: Still rate limited (sliding window prevents window boundary burst)
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(false);

      // T=2.1s: Oldest requests expired, should allow new requests
      await new Promise((resolve) => setTimeout(resolve, 1200));
      result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(true);
    });

    it('should handle very short burst windows correctly', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const request: RateLimitCheckRequest = {
        identifier: 'burst-user',
        resource: 'api:burst:test',
        limit: 3,
        windowSeconds: 1, // Very short window
      };

      // Send burst
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkRateLimit(request);
        expect(result.allowed).toBe(true);
      }

      // Should be rate limited
      let result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be allowed again
      result = await rateLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(true);
    });

    it('should handle high limit values correctly', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const highLimit = 100;
      const request: RateLimitCheckRequest = {
        identifier: 'burst-user',
        resource: 'api:burst:test',
        limit: highLimit,
        windowSeconds: 10,
      };

      // Send burst of requests
      const promises = [];
      for (let i = 0; i < highLimit + 10; i++) {
        promises.push(rateLimiter.checkRateLimit(request));
      }

      const results = await Promise.all(promises);

      // Should allow exactly highLimit requests
      const allowedCount = results.filter((r) => r.allowed).length;
      expect(allowedCount).toBeGreaterThanOrEqual(highLimit - 1); // Allow 1% margin
      expect(allowedCount).toBeLessThanOrEqual(highLimit + 1);
    });

    it('should handle sustained high throughput', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const request: RateLimitCheckRequest = {
        identifier: 'burst-user',
        resource: 'api:burst:test',
        limit: 50,
        windowSeconds: 5,
      };

      // Send multiple waves of requests
      let totalAllowed = 0;
      let totalRejected = 0;

      for (let wave = 0; wave < 3; wave++) {
        const promises = [];
        for (let i = 0; i < 30; i++) {
          promises.push(rateLimiter.checkRateLimit(request));
        }

        const results = await Promise.all(promises);
        totalAllowed += results.filter((r) => r.allowed).length;
        totalRejected += results.filter((r) => !r.allowed).length;

        // Short delay between waves
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Should enforce limit across waves
      expect(totalAllowed).toBeLessThanOrEqual(60); // 50 limit + some buffer
      expect(totalRejected).toBeGreaterThan(0);
    });
  });

  describe('Redis Failover and Fallback', () => {
    it('should handle Redis unavailability gracefully (fail open)', async () => {
      // Create rate limiter with invalid Redis URL
      const failOpenLimiter = new RateLimiter({
        redis: {
          url: 'redis://invalid-host:6379',
        },
      });

      // Don't initialize (simulates Redis unavailable)

      const request: RateLimitCheckRequest = {
        identifier: TEST_IDENTIFIER,
        resource: TEST_RESOURCE,
        limit: 5,
        windowSeconds: 10,
      };

      // Should allow requests (fail open)
      const result = await failOpenLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(true);

      // Should increment fallback counter
      const health = failOpenLimiter.getHealthStatus();
      expect(health.redisFallbackCount).toBeGreaterThan(0);
    });

    it('should use local cache when Redis is slow', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      // Create rate limiter with very low slow threshold
      const cacheLimiter = new RateLimiter({
        redis: {
          url: TEST_REDIS_URL,
        },
        redisSlowThreshold: 1, // 1ms threshold forces local cache
      });

      await cacheLimiter.initialize();

      const request: RateLimitCheckRequest = {
        identifier: TEST_IDENTIFIER,
        resource: TEST_RESOURCE,
        limit: 5,
        windowSeconds: 10,
      };

      // Make requests - should use local cache due to slow threshold
      const result = await cacheLimiter.checkRateLimit(request);
      expect(result.allowed).toBe(true);

      // Check that local cache was used
      const health = cacheLimiter.getHealthStatus();
      expect(health.localCacheSize).toBeGreaterThan(0);

      await cacheLimiter.shutdown();
    });
  });

  describe('Performance and Latency', () => {
    it('should complete rate limit checks within latency SLA', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const request: RateLimitCheckRequest = {
        identifier: TEST_IDENTIFIER,
        resource: TEST_RESOURCE,
        limit: 100,
        windowSeconds: 60,
      };

      const latencies: number[] = [];

      // Measure latency for 20 requests
      for (let i = 0; i < 20; i++) {
        const start = Date.now();
        await rateLimiter.checkRateLimit(request);
        const latency = Date.now() - start;
        latencies.push(latency);
      }

      // Calculate p99 latency
      latencies.sort((a, b) => a - b);
      const p99Index = Math.floor(latencies.length * 0.99);
      const p99Latency = latencies[p99Index];

      // P99 should be under 50ms (spec requirement)
      expect(p99Latency).toBeLessThan(50);
    });

    it('should handle throughput requirements', async () => {
      if (!redisClient.getIsConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const request: RateLimitCheckRequest = {
        identifier: TEST_IDENTIFIER,
        resource: TEST_RESOURCE,
        limit: 1000,
        windowSeconds: 60,
      };

      const requestCount = 100; // Scaled down for test
      const start = Date.now();

      // Send concurrent requests
      const promises = [];
      for (let i = 0; i < requestCount; i++) {
        promises.push(rateLimiter.checkRateLimit(request));
      }

      await Promise.all(promises);

      const duration = Date.now() - start;
      const throughput = (requestCount / duration) * 1000; // requests/second

      // Should handle at least 1000 requests/second
      // (using 100 req/s threshold for test environment)
      expect(throughput).toBeGreaterThan(100);
    });
  });
});
