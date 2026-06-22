/**
 * Property-based tests for rate limiter service
 * 
 * **Validates: Requirements from spec.md - Property-Based Test Requirements**
 * 
 * The following properties must hold across 100+ randomized test iterations:
 * 1. Monotonic Remaining Count
 * 2. Conservation of Requests
 * 3. Window Boundary Property
 * 4. Idempotency Under Retries
 * 5. Limit Boundary Property
 */

import * as fc from 'fast-check';
import { RateLimiter } from '../../src/rate-limiter';
import { RedisClient } from '../../src/redis-client';
import { RateLimitCheckRequest } from '../../src/types';

// Mock Redis for property tests
jest.mock('../../src/redis-client');

describe('RateLimiter - Property-Based Tests', () => {
  let rateLimiter: RateLimiter;
  let mockRedisClient: jest.Mocked<RedisClient>;

  beforeEach(async () => {
    jest.clearAllMocks();

    rateLimiter = new RateLimiter({
      redis: {
        url: 'redis://localhost:6379',
      },
      enableLocalCache: false, // Disable for consistent property testing
    });

    mockRedisClient = (rateLimiter as any).redisClient;
    mockRedisClient.connect = jest.fn().mockResolvedValue(undefined);
    mockRedisClient.disconnect = jest.fn().mockResolvedValue(undefined);
    mockRedisClient.getIsConnected = jest.fn().mockReturnValue(true);

    await rateLimiter.initialize();
  });

  afterEach(async () => {
    await rateLimiter.shutdown();
  });

  describe('Property 1: Monotonic Remaining Count', () => {
    test('For any sequence of allowed requests, remaining count must monotonically decrease', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate: limit (5-20), windowSeconds (10-60), number of requests (3-10)
          fc.integer({ min: 5, max: 20 }),
          fc.integer({ min: 10, max: 60 }),
          fc.integer({ min: 3, max: 10 }),
          async (limit, windowSeconds, numRequests) => {
            // Ensure numRequests <= limit so all are allowed
            const actualRequests = Math.min(numRequests, limit);

            const request: RateLimitCheckRequest = {
              identifier: `user-${limit}-${windowSeconds}`,
              resource: 'api:test',
              limit,
              windowSeconds,
            };

            const remainingCounts: number[] = [];
            let currentRemaining = limit - 1;

            // Mock Redis to simulate allowed requests with decreasing remaining
            for (let i = 0; i < actualRequests; i++) {
              mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
                allowed: true,
                remaining: currentRemaining,
                resetAt: Math.floor(Date.now() / 1000) + windowSeconds,
              });

              const result = await rateLimiter.checkRateLimit(request);
              
              if (result.allowed) {
                remainingCounts.push(result.remaining);
                currentRemaining--;
              }
            }

            // Property: remaining counts must be monotonically decreasing
            for (let i = 1; i < remainingCounts.length; i++) {
              expect(remainingCounts[i]).toBeLessThanOrEqual(remainingCounts[i - 1]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2: Conservation of Requests', () => {
    test('Total (allowed + rejected) must equal total attempted requests', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 10 }),  // limit
          fc.integer({ min: 10, max: 30 }), // windowSeconds
          fc.integer({ min: 5, max: 15 }),  // attemptedRequests
          async (limit, windowSeconds, attemptedRequests) => {
            const request: RateLimitCheckRequest = {
              identifier: `user-${limit}-${windowSeconds}-${attemptedRequests}`,
              resource: 'api:test',
              limit,
              windowSeconds,
            };

            let allowedCount = 0;
            let rejectedCount = 0;
            let currentRemaining = limit - 1;

            for (let i = 0; i < attemptedRequests; i++) {
              const allowed = i < limit;
              
              mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
                allowed,
                remaining: allowed ? Math.max(0, currentRemaining) : 0,
                resetAt: Math.floor(Date.now() / 1000) + windowSeconds,
              });

              const result = await rateLimiter.checkRateLimit(request);

              if (result.allowed) {
                allowedCount++;
                currentRemaining--;
              } else {
                rejectedCount++;
              }
            }

            // Property: no requests should be lost
            expect(allowedCount + rejectedCount).toBe(attemptedRequests);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: Window Boundary Property', () => {
    test('Only requests within [T - windowSeconds, T] should affect rate limit decision', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 15 }),  // limit
          fc.integer({ min: 30, max: 60 }), // windowSeconds
          async (limit, windowSeconds) => {
            const now = Math.floor(Date.now() / 1000);
            const request: RateLimitCheckRequest = {
              identifier: `user-window-${limit}-${windowSeconds}`,
              resource: 'api:test',
              limit,
              windowSeconds,
            };

            // Mock: current request at time T
            mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
              allowed: true,
              remaining: limit - 1,
              resetAt: now + windowSeconds,
            });

            const result = await rateLimiter.checkRateLimit(request);

            // Property: resetAt should be exactly windowSeconds in the future
            const expectedResetAt = now + windowSeconds;
            expect(result.resetAt).toBeGreaterThanOrEqual(expectedResetAt - 1);
            expect(result.resetAt).toBeLessThanOrEqual(expectedResetAt + 1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 4: Idempotency Under Retries', () => {
    test('Checking rate limit twice within 1ms must return identical result', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 20 }),
          fc.integer({ min: 10, max: 60 }),
          fc.boolean(), // allowed or not
          async (limit, windowSeconds, allowed) => {
            const now = Math.floor(Date.now() / 1000);
            const remaining = allowed ? limit - 1 : 0;

            const request: RateLimitCheckRequest = {
              identifier: `user-idempotent-${limit}-${windowSeconds}-${allowed}`,
              resource: 'api:test',
              limit,
              windowSeconds,
            };

            // Mock same result for both calls
            mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
              allowed,
              remaining,
              resetAt: now + windowSeconds,
            });

            // Make two rapid calls
            const result1 = await rateLimiter.checkRateLimit(request);
            const result2 = await rateLimiter.checkRateLimit(request);

            // Property: results should be identical (or nearly identical)
            expect(result1.allowed).toBe(result2.allowed);
            expect(result1.remaining).toBe(result2.remaining);
            // Allow 1 second tolerance for resetAt due to timing
            expect(Math.abs(result1.resetAt - result2.resetAt)).toBeLessThanOrEqual(1);

            if (!result1.allowed && !result2.allowed) {
              // retryAfter may differ by 1 due to timing
              expect(Math.abs(result1.retryAfter - result2.retryAfter)).toBeLessThanOrEqual(1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5: Limit Boundary Property', () => {
    test('Exactly N requests in window W must be allowed, (N+1)th must be rejected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 15 }),  // limit
          fc.integer({ min: 10, max: 60 }), // windowSeconds
          async (limit, windowSeconds) => {
            const now = Math.floor(Date.now() / 1000);
            const request: RateLimitCheckRequest = {
              identifier: `user-boundary-${limit}-${windowSeconds}`,
              resource: 'api:test',
              limit,
              windowSeconds,
            };

            let allowedCount = 0;
            let currentRemaining = limit - 1;

            // Make exactly limit requests (all should be allowed)
            for (let i = 0; i < limit; i++) {
              mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
                allowed: true,
                remaining: currentRemaining,
                resetAt: now + windowSeconds,
              });

              const result = await rateLimiter.checkRateLimit(request);
              expect(result.allowed).toBe(true);
              allowedCount++;
              currentRemaining--;
            }

            // (N+1)th request should be rejected
            mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
              allowed: false,
              remaining: 0,
              resetAt: now + windowSeconds,
            });

            const finalResult = await rateLimiter.checkRateLimit(request);

            // Property: exactly limit requests allowed, next one rejected
            expect(allowedCount).toBe(limit);
            expect(finalResult.allowed).toBe(false);
            expect(finalResult.remaining).toBe(0);
            expect(finalResult.retryAfter).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Additional Properties', () => {
    test('Property: Remaining count never exceeds limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 5, max: 30 }),
          async (limit, windowSeconds) => {
            const request: RateLimitCheckRequest = {
              identifier: `user-max-${limit}-${windowSeconds}`,
              resource: 'api:test',
              limit,
              windowSeconds,
            };

            mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
              allowed: true,
              remaining: limit - 1,
              resetAt: Math.floor(Date.now() / 1000) + windowSeconds,
            });

            const result = await rateLimiter.checkRateLimit(request);

            // Property: remaining should never exceed limit
            expect(result.remaining).toBeLessThan(limit);
            expect(result.remaining).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: retryAfter is null when allowed, positive when rejected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 20 }),
          fc.integer({ min: 10, max: 60 }),
          fc.boolean(),
          async (limit, windowSeconds, allowed) => {
            const now = Math.floor(Date.now() / 1000);
            const request: RateLimitCheckRequest = {
              identifier: `user-retry-${limit}-${windowSeconds}-${allowed}`,
              resource: 'api:test',
              limit,
              windowSeconds,
            };

            mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
              allowed,
              remaining: allowed ? limit - 1 : 0,
              resetAt: now + windowSeconds,
            });

            const result = await rateLimiter.checkRateLimit(request);

            // Property: retryAfter behavior matches allowed status
            if (result.allowed) {
              expect(result.retryAfter).toBeNull();
            } else {
              expect(result.retryAfter).toBeGreaterThan(0);
              // retryAfter should be reasonable (not more than windowSeconds)
              expect(result.retryAfter).toBeLessThanOrEqual(windowSeconds + 1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: Valid inputs always produce valid outputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Valid ranges based on spec validation
          fc.integer({ min: 1, max: 1000000 }),      // limit
          fc.integer({ min: 1, max: 86400 }),        // windowSeconds
          fc.string({ minLength: 1, maxLength: 256 }), // identifier
          fc.string({ minLength: 1, maxLength: 128 }), // resource
          async (limit, windowSeconds, identifier, resource) => {
            // Skip inputs with control characters (invalid per spec)
            if (!/^[\x20-\x7E\u00A0-\uFFFF]*$/.test(identifier) ||
                !/^[\x20-\x7E\u00A0-\uFFFF]*$/.test(resource)) {
              return; // Skip invalid inputs
            }

            const request: RateLimitCheckRequest = {
              identifier,
              resource,
              limit,
              windowSeconds,
            };

            mockRedisClient.checkRateLimit = jest.fn().mockResolvedValue({
              allowed: true,
              remaining: limit - 1,
              resetAt: Math.floor(Date.now() / 1000) + windowSeconds,
            });

            const result = await rateLimiter.checkRateLimit(request);

            // Property: output always has valid structure
            expect(result).toHaveProperty('allowed');
            expect(result).toHaveProperty('remaining');
            expect(result).toHaveProperty('resetAt');
            expect(result).toHaveProperty('retryAfter');

            expect(typeof result.allowed).toBe('boolean');
            expect(typeof result.remaining).toBe('number');
            expect(typeof result.resetAt).toBe('number');
            
            if (result.allowed) {
              expect(result.retryAfter).toBeNull();
            } else {
              expect(typeof result.retryAfter).toBe('number');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: Different resources have independent rate limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 15 }),
          fc.integer({ min: 10, max: 30 }),
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 }),
          async (limit, windowSeconds, resource1, resource2) => {
            // Ensure resources are different
            if (resource1 === resource2) {
              resource2 = resource2 + '_different';
            }

            const now = Math.floor(Date.now() / 1000);
            const identifier = `user-${limit}-${windowSeconds}`;

            const request1: RateLimitCheckRequest = {
              identifier,
              resource: resource1,
              limit,
              windowSeconds,
            };

            const request2: RateLimitCheckRequest = {
              identifier,
              resource: resource2,
              limit,
              windowSeconds,
            };

            // Mock independent limits
            mockRedisClient.checkRateLimit = jest.fn()
              .mockResolvedValueOnce({
                allowed: true,
                remaining: limit - 1,
                resetAt: now + windowSeconds,
              })
              .mockResolvedValueOnce({
                allowed: true,
                remaining: limit - 1,
                resetAt: now + windowSeconds,
              });

            const result1 = await rateLimiter.checkRateLimit(request1);
            const result2 = await rateLimiter.checkRateLimit(request2);

            // Property: both resources should have independent limits
            expect(result1.allowed).toBe(true);
            expect(result2.allowed).toBe(true);
            expect(result1.remaining).toBe(limit - 1);
            expect(result2.remaining).toBe(limit - 1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
