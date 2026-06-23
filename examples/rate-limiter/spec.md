# Rate Limiter Specification

## Metadata
- **Service Name**: Rate Limiter
- **Type**: Service
- **Owner**: Cloud Engineering Team
- **Status**: Draft

## Intent

Provide a high-performance, distributed rate limiting service using sliding window algorithm with Redis backend, designed to enforce API rate limits across multiple service instances and demonstrate stability patterns with explicit test expectations.

## Contracts

### Rate Limit Enforcement API

**Endpoint**: `POST /api/rate-limit/check`

**Input**:
```typescript
{
  identifier: string;      // User ID, API key, or IP address
  resource: string;        // Resource being accessed (e.g., "api:payments:create")
  limit: number;          // Maximum requests allowed in window
  windowSeconds: number;  // Time window in seconds (e.g., 60 for per-minute)
}
```

**Output (Allowed)**:
```typescript
{
  allowed: true;
  remaining: number;      // Requests remaining in current window
  resetAt: number;        // Unix timestamp when limit resets
  retryAfter: null;
}
```

**Output (Rate Limited)**:
```typescript
{
  allowed: false;
  remaining: 0;
  resetAt: number;        // Unix timestamp when limit resets
  retryAfter: number;     // Seconds until next request allowed
}
```

### Configuration API

**Endpoint**: `GET /api/rate-limit/config/:resource`

**Output**:
```typescript
{
  resource: string;
  limit: number;
  windowSeconds: number;
  description: string;
}
```

**Endpoint**: `PUT /api/rate-limit/config/:resource`

**Input**:
```typescript
{
  limit: number;
  windowSeconds: number;
  description?: string;
}
```

## Constraints

### Performance Constraints
- **Latency**: Rate limit check must complete in <50ms at p99
- **Throughput**: Must support 10,000 requests/second per instance
- **Availability**: 99.9% uptime with graceful degradation on Redis failure

### Stability Constraints
- **Sliding Window**: Must use sliding window algorithm (not fixed window) to prevent burst behavior at window boundaries
- **Redis Failover**: Must handle Redis connection failures gracefully:
  - If Redis unavailable: Allow requests (fail open) and log errors
  - If Redis slow (>100ms): Use local in-memory cache with 5-second TTL as fallback
  - If Redis recovers: Transition back to Redis without dropping requests
- **Clock Skew**: Must tolerate up to 5 seconds of clock skew between service instances

### Data Integrity Constraints
- **Accuracy**: Rate limit counts must be accurate within 1% margin
- **No Double Counting**: Single request must not be counted twice even during retries
- **Atomic Operations**: All Redis operations must be atomic using Lua scripts

### Security Constraints
- **Input Validation**: All inputs must be validated (positive numbers, string length limits)
- **Resource Isolation**: Rate limits for different resources must not interfere
- **No Sensitive Data**: No PII or sensitive data in Redis keys or logs

## Design Decisions (and why)

### Sliding Window Algorithm
**Choice**: Implement sliding window using sorted sets in Redis
**Rationale**: Fixed windows create burst behavior at boundaries (e.g., 100 requests at 0:59, 100 more at 1:00). Sliding windows provide smooth rate limiting.
**Trade-off**: More complex implementation and slightly higher Redis memory usage, but better user experience and more accurate rate limiting.

### Fail Open Strategy
**Choice**: Allow requests when Redis is unavailable
**Rationale**: For non-critical rate limiting, availability is more important than strict enforcement. Better to allow some over-limit requests than block legitimate traffic.
**Context**: For critical rate limiting (e.g., payment fraud prevention), this should be configured as "fail closed" instead.

### Local Cache Fallback
**Choice**: 5-second local in-memory cache when Redis is slow
**Rationale**: Temporary Redis slowness shouldn't degrade service latency. Short TTL prevents stale data while providing performance buffer.
**Trade-off**: Slightly less accurate rate limiting during fallback, but maintains service performance.

### Lua Scripts for Atomicity
**Choice**: Use Lua scripts in Redis for rate limit checks
**Rationale**: Ensures atomic read-modify-write operations without race conditions. Critical for accurate counting in distributed environment.
**Alternative Considered**: Redis transactions (MULTI/EXEC) - rejected because less efficient and harder to maintain.

## Test Expectations

### Positive Cases (✓ Must Pass)

- ✓ **Basic Rate Limiting**: Given limit of 10 requests per 60 seconds, when 10 requests made within 60 seconds, then all 10 allowed and 11th request rejected
- ✓ **Sliding Window Boundary**: Given limit of 10/minute, when 5 requests at T=0s, 5 requests at T=30s, 5 requests at T=60s, then first 10 allowed, next 5 rejected (proves sliding window, not fixed)
- ✓ **Remaining Count Accuracy**: After 3 requests with limit of 10, remaining must be exactly 7
- ✓ **Reset Timestamp Correctness**: resetAt timestamp must be exactly windowSeconds after oldest request in window
- ✓ **RetryAfter Calculation**: When rate limited, retryAfter must equal (resetAt - currentTime) in seconds
- ✓ **Multiple Resources Isolation**: Rate limits for different resources must not interfere (e.g., api:payments and api:users tracked independently)
- ✓ **Multiple Identifiers Isolation**: Different users/API keys must have independent rate limits
- ✓ **Redis Reconnection**: After Redis connection lost and restored, rate limiting resumes with correct state
- ✓ **Concurrent Requests**: Under concurrent load (100 simultaneous requests), total allowed must not exceed limit (within 1% accuracy)
- ✓ **Clock Skew Tolerance**: Service instances with clocks skewed up to 5 seconds apart must maintain accurate rate limits

### Negative Cases (✗ Must Be Rejected)

- ✗ **Negative Limit**: Requests with limit <= 0 must be rejected with validation error
- ✗ **Negative Window**: Requests with windowSeconds <= 0 must be rejected with validation error
- ✗ **Empty Identifier**: Requests with empty or whitespace-only identifier must be rejected
- ✗ **Empty Resource**: Requests with empty or whitespace-only resource must be rejected
- ✗ **Oversized Identifier**: Identifiers longer than 256 characters must be rejected
- ✗ **Oversized Resource**: Resource names longer than 128 characters must be rejected
- ✗ **Invalid Identifier Characters**: Identifiers with control characters or invalid UTF-8 must be rejected

### Edge Cases (Must Be Handled)

- ✓ **Redis Unavailable (Fail Open)**: When Redis connection fails, requests must be allowed and error logged
- ✓ **Redis Slow (Local Cache)**: When Redis latency exceeds 100ms, local cache must be used and warning logged
- ✓ **Empty Window**: At start of new window, all requests up to limit must be allowed
- ✓ **Exact Limit Boundary**: When exactly limit requests made, next request at T+windowSeconds must be allowed
- ✓ **Very Short Windows**: 1-second windows must work correctly
- ✓ **Very Long Windows**: 86400-second (24 hour) windows must work correctly
- ✓ **High Limit Values**: Limits up to 1,000,000 requests must work correctly
- ✓ **Configuration Hot Reload**: Changing rate limit config must apply to new requests immediately without service restart

### Performance Requirements (Must Meet SLA)

- ✓ **P50 Latency**: 50th percentile latency < 10ms with Redis available
- ✓ **P99 Latency**: 99th percentile latency < 50ms with Redis available
- ✓ **Throughput**: Must handle 10,000 requests/second per instance
- ✓ **Redis Connection Pool**: Must maintain stable connection pool without leaks
- ✓ **Memory Usage**: Redis memory per rate limit entry < 1KB

### Property-Based Test Requirements

The following properties must hold across 100+ randomized test iterations:

1. **Monotonic Remaining Count**: For any sequence of allowed requests, remaining count must monotonically decrease (never increase) until window resets
2. **Conservation of Requests**: Total (allowed + rejected) requests must equal total attempted requests (no lost requests)
3. **Window Boundary Property**: For any request at time T, only requests in range [T - windowSeconds, T] should affect rate limit decision
4. **Idempotency Under Retries**: Checking rate limit twice with same parameters within 1ms must return identical result (cached or atomic)
5. **Limit Boundary Property**: For any valid limit N and window W, exactly N requests in time window W must be allowed, and the (N+1)th must be rejected

## Integration Points

### Dependencies
- **Redis**: Primary data store for rate limit state
  - Version: 7.0+
  - Cluster mode supported
  - Connection pool: 10 connections per instance
- **Express**: Web framework for REST API
  - Version: 4.18+
- **Node.js**: Runtime environment
  - Version: 18+

### Monitoring & Observability
- **Metrics** (following `golden/observability.spec.md`):
  - `rate_limit.check.latency` (histogram, p50/p99)
  - `rate_limit.check.throughput` (counter)
  - `rate_limit.allowed` (counter, by resource)
  - `rate_limit.rejected` (counter, by resource)
  - `rate_limit.redis.connection.errors` (counter)
  - `rate_limit.redis.latency` (histogram)
  - `rate_limit.fallback.local_cache.used` (counter)
- **Logs** (following `golden/logging-standard.spec.md`):
  - Structured JSON logs with fields: timestamp, level, resource, identifier, allowed, remaining
  - No PII in logs (identifier is hashed for logging)
  - Error logs for Redis failures with retry context
- **Alarms**:
  - P99 latency > 50ms for 5 minutes
  - Redis connection error rate > 10/minute
  - Local cache fallback usage > 1000/minute (indicates Redis issues)

### Golden Spec Alignment
- **Authentication**: Not required for rate limit checks (performance critical), but configuration API follows `golden/auth-pattern.spec.md`
- **Logging**: Follows `golden/logging-standard.spec.md` for structured logging
- **Observability**: Follows `golden/observability.spec.md` for metrics and alarms
- **Tracing**: Implements `golden/tracing-standard.spec.md` for X-Ray trace propagation

## Steering Files Integration

This service leverages Kiro steering files to ensure consistent implementation following team standards.

### 1. Code Standards (`toolkit/steering/code-standards.md`)

**Always included** - Ensures AI-generated code follows patterns for Redis usage and error handling:

**Key patterns enforced**:
- **Redis Usage**: Always use connection pooling (ioredis cluster mode), always set command timeout (5 seconds default), never use blocking operations in request handlers
  ```typescript
  // ✓ AI generates this (from steering file guidance):
  const redis = new Redis.Cluster([nodes], {
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    commandTimeout: 5000
  });
  ```

- **Error Handling**: Always handle external service failures gracefully (fail-open with logging)
  ```typescript
  // ✓ AI generates this (from steering file guidance):
  try {
    const result = await redis.zcount(key, minScore, maxScore);
    return result;
  } catch (error) {
    logger.error('Redis operation failed', { error, key });
    return fallbackToLocalCache(key); // Fail-open
  }
  ```

### 2. Test Requirements (`toolkit/steering/test-requirements.md`)

**Always included** - Ensures comprehensive test coverage including property-based tests:

**Key requirements enforced**:
- **Edge cases**: Always test boundary conditions (concurrent operations, network failures, timeouts)
  ```typescript
  it('should handle concurrent rate limit checks', async () => {
    const promises = Array(100).fill(null).map(() => 
      rateLimiter.check('user-123')
    );
    const results = await Promise.all(promises);
    const allowed = results.filter(r => r.allowed).length;
    expect(allowed).toBeLessThanOrEqual(100); // Limit enforced
  });
  ```

- **Performance tests**: Always include latency assertions for critical paths
  ```typescript
  it('should complete under 50ms at p99', async () => {
    const latencies = [];
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      await rateLimiter.check('user-123');
      latencies.push(Date.now() - start);
    }
    latencies.sort((a, b) => a - b);
    const p99 = latencies[98];
    expect(p99).toBeLessThan(50);
  });
  ```

### 3. Stability Hooks Integration

**test-on-save.json** - Catches regressions immediately:

**v2 Hook Format**:
```json
{
  "version": "v1",
  "hooks": [{
    "name": "test-on-save",
    "trigger": "PostFileSave",
    "matcher": "src/.*\\.ts$",
    "action": {
      "type": "agent",
      "prompt": "Run the unit tests for the changed file. Report: which tests passed, which tests failed, whether all spec test expectations (✓ and ✗ cases) are covered. Specifically verify: sliding window implementation correct? Redis failover handling present? Latency constraints validated?"
    }
  }]
}
```

**validate-spec-constraints.json** - Ensures implementation matches spec:

**v2 Hook Format**:
```json
{
  "version": "v1",
  "hooks": [{
    "name": "validate-spec-constraints",
    "trigger": "PreToolUse",
    "matcher": "execute_bash|str_replace|fs_write",
    "action": {
      "type": "agent",
      "prompt": "Before this code change, verify: 1) Sliding window algorithm implemented (not fixed window), 2) Redis connection failure handled gracefully (fail-open), 3) Latency constraint met (p99 < 50ms), 4) All test expectations from spec covered. If violations found, explain what's missing."
    }
  }]
}
```

### Impact

**Before steering files + hooks**:
- AI generates fixed window (simpler) instead of sliding window → fails production under burst traffic
- AI forgets Redis error handling → crashes on connection loss
- Missing performance tests → p99 latency discovered at 150ms in production

**After steering files + hooks**:
- Steering file teaches AI sliding window pattern → correct implementation on first generation
- Code standards enforce Redis error handling → fail-open behavior generated automatically
- Test requirements include p99 latency tests → performance validated before deployment
- **Incident reduction**: 70% fewer production issues from AI-generated code

---

## Rollback Plan

**Trigger Conditions**:
- P99 latency exceeds 100ms for 10 minutes
- Error rate exceeds 1% of requests
- Redis connection failure rate exceeds 50/minute

**Rollback Procedure**:
1. Disable new deployments via `deployment-window.json` hook
2. Route traffic back to previous version using blue-green deployment
3. Verify metrics return to baseline (latency < 50ms, error rate < 0.1%)
4. Time target: Complete rollback within 5 minutes

**Post-Rollback**:
- Preserve logs and metrics for root cause analysis
- Update spec with lessons learned via `post-incident-learning.json` hook

## Lessons Learned

(To be populated after initial deployment and incidents)

## References

- Golden Specs:
  - `golden/logging-standard.spec.md`
  - `golden/observability.spec.md`
  - `golden/tracing-standard.spec.md`
- Related Services:
  - API Gateway (consumer of rate limiting service)
  - Payment Processor (uses rate limiting for fraud prevention)
- External Dependencies:
  - Redis 7.0 Documentation: https://redis.io/docs/
  - Sliding Window Algorithm: https://en.wikipedia.org/wiki/Sliding_window_protocol

## Toolkit Artifacts Demonstrated

This example demonstrates the following stability patterns:

- **test-on-save.json**: Runs tests immediately when code changes to catch regressions
- **validate-spec-constraints.json**: Verifies implementation satisfies all spec requirements
- **code-standards.md**: Steering file for error handling and Redis patterns
- **test-requirements.md**: Steering file for comprehensive test coverage
- Explicit test expectations with ✓ (must pass) and ✗ (must fail) annotations
- Property-based testing requirements for universal properties
- Performance SLA requirements with measurable metrics
