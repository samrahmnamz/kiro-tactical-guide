# Golden Spec: Cloud Service Resiliency Standard

**Status**: Golden Spec (Organizational Standard)  
**Owner**: Platform Engineering Team  
**Last Updated**: 2026  
**Applies To**: All backend services with external dependencies

---

## Intent

All services must implement resiliency patterns that prevent cascading failures, enable graceful degradation, and maintain partial availability when dependencies are unhealthy. This standard ensures services fail safely, recover automatically, and provide observable failure signals for rapid incident response.

## Why This Matters

**Problem:** Without resiliency patterns, a single slow or failing dependency can cascade through the entire system. A 5-second timeout on a payment gateway becomes connection pool exhaustion, which becomes API unavailability, which becomes customer-facing outage.

**Solution:** By enforcing circuit breakers, proper retry logic, timeouts, and graceful degradation at every service boundary:
- **Blast radius containment**: Failures isolated to affected dependency
- **Partial availability**: Service continues with degraded responses
- **Automatic recovery**: Circuit breakers restore traffic when deps recover
- **Reduced MTTR**: Observable failure patterns enable faster diagnosis

**The data:**
- 70% of cloud outages caused by cascading failures (AWS Well-Architected)
- Services without circuit breakers have 3-5x higher MTTR
- Retry storms account for 40% of amplified load during incidents
- AI-generated code omits timeout configuration 85% of the time

---

## Constraints

All services MUST satisfy the following resiliency requirements:

### 1. Circuit Breaker Protection

- **Coverage**: Every external dependency call (HTTP, gRPC, database, cache, message queue) MUST be wrapped in a circuit breaker
- **Fallback Required**: Every circuit breaker MUST have a defined fallback behavior (cached data, degraded response, or queued retry)
- **State Observability**: Circuit breaker state changes (closed → open → half-open) MUST be logged and emit metrics
- **Configuration**: Circuit breakers MUST define explicit thresholds:
  - `failureThreshold`: 3-10 failures before opening
  - `resetTimeout`: 10-60 seconds before half-open attempt
  - `halfOpenRequests`: 1-5 requests to test recovery

**Implementation Pattern (Node.js/TypeScript with opossum)**:
```typescript
import CircuitBreaker from 'opossum';

const paymentBreaker = new CircuitBreaker(
  async (data: ChargeRequest) => paymentGateway.charge(data),
  {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5,
  }
);

paymentBreaker.fallback(async (data: ChargeRequest) => {
  logger.warn('Payment circuit open, queuing for retry', { amount: data.amount });
  await retryQueue.enqueue({ type: 'payment', data });
  return { status: 'pending', message: 'Payment queued for processing' };
});

paymentBreaker.on('open', () => {
  logger.error('Circuit OPEN: payment-gateway');
  metrics.increment('circuit_breaker.payment.state_change', { state: 'open' });
});

paymentBreaker.on('halfOpen', () => {
  logger.info('Circuit HALF-OPEN: payment-gateway, testing recovery');
  metrics.increment('circuit_breaker.payment.state_change', { state: 'half_open' });
});

paymentBreaker.on('close', () => {
  logger.info('Circuit CLOSED: payment-gateway, recovered');
  metrics.increment('circuit_breaker.payment.state_change', { state: 'closed' });
});
```

### 2. Retry Logic with Exponential Backoff and Jitter

- **Backoff Type**: All retries MUST use exponential backoff (not fixed or linear delays)
- **Jitter Required**: All retries MUST add randomized jitter to prevent thundering herd
- **Max Retries**: All retry loops MUST have a bounded maximum (3-5 for sync, max 10 for async)
- **Failure Classification**: Retries MUST only apply to transient failures (5xx, timeouts, connection errors). Permanent failures (4xx) MUST NOT be retried
- **Backoff Cap**: Exponential delay MUST be capped (30s sync, 5min async)
- **Idempotency**: Retried mutation operations MUST include idempotency keys

**Implementation Pattern**:
```typescript
import { retry } from './resilience';

// Exponential backoff with full jitter
function calculateDelay(attempt: number, baseMs: number = 100, capMs: number = 30000): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, capMs);
  return Math.random() * capped; // Full jitter
}

// Transient error detection
function isTransient(error: any): boolean {
  if (error.response) {
    return [429, 500, 502, 503, 504].includes(error.response.status);
  }
  return ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(error.code);
}

// Usage
const result = await retry(
  () => paymentGateway.charge(data),
  {
    maxRetries: 3,
    backoff: calculateDelay,
    retryIf: isTransient,
    onRetry: (error, attempt) => {
      logger.warn('Retrying payment', { attempt, error: error.message });
    },
  }
);
```

### 3. Explicit Timeout Configuration

- **All External Calls**: Every HTTP, database, cache, and gRPC call MUST have an explicit timeout
- **No Infinite Timeouts**: `timeout: 0` or missing timeout configuration is NOT permitted
- **Separate Timeouts**: Connection timeout (1-5s) MUST be separate from request timeout (1-30s)
- **Budget Awareness**: Sum of sequential dependency timeouts MUST NOT exceed service SLA
- **fetch() Calls**: MUST use AbortController with timeout (fetch has no built-in timeout)

**Implementation Pattern**:
```typescript
import axios from 'axios';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';

// HTTP client with explicit timeouts
const httpClient = axios.create({
  timeout: 5000,           // Request timeout: 5 seconds
  // Connection timeout handled by underlying http agent
});

// AWS SDK with explicit timeouts
const dynamoClient = new DynamoDBClient({
  requestHandler: new NodeHttpHandler({
    requestTimeout: 3000,    // Request timeout: 3 seconds
    connectionTimeout: 1000, // Connection timeout: 1 second
  }),
});

// Redis with explicit timeouts
const redis = new Redis({
  connectTimeout: 3000,     // Connection timeout: 3 seconds
  commandTimeout: 1000,     // Command timeout: 1 second
  maxRetriesPerRequest: 3,
});

// fetch with AbortController timeout
async function fetchWithTimeout(url: string, timeoutMs: number = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### 4. Graceful Degradation

- **Fallback Hierarchy**: Services MUST define a degradation hierarchy for each dependency:
  1. Primary: Full functionality from primary dependency
  2. Degraded: Partial functionality from cache or alternative source
  3. Minimal: Acknowledge request with degraded response, queue for later
  4. Unavailable: Return clear error with appropriate HTTP status and retry-after header
- **Health Indicators**: Services MUST expose dependency health via `/health` endpoint
- **Feature Flags**: Non-critical features SHOULD be toggleable for load shedding

**Implementation Pattern**:
```typescript
async function getProductRecommendations(userId: string): Promise<Recommendations> {
  // Level 1: Full functionality (ML-based recommendations)
  try {
    return await recommendationService.getPersonalized(userId);
  } catch (error) {
    logger.warn('Recommendation service unavailable, falling back to cache', { userId });
  }

  // Level 2: Degraded (cached recommendations, may be stale)
  try {
    const cached = await redis.get(`recommendations:${userId}`);
    if (cached) return { ...JSON.parse(cached), degraded: true };
  } catch (error) {
    logger.warn('Redis cache unavailable', { userId });
  }

  // Level 3: Minimal (generic popular items)
  return {
    items: POPULAR_ITEMS_FALLBACK,
    degraded: true,
    source: 'static-fallback',
  };
}
```

### 5. Bulkhead Isolation

- **Connection Pools**: Each external dependency MUST have its own connection pool (not shared)
- **Concurrency Limits**: Services MUST limit concurrent requests per dependency
- **Thread/Worker Isolation**: Long-running operations MUST NOT block the main request thread
- **Queue Depth Limits**: Inbound request queues MUST have bounded depth with rejection when full

**Implementation Pattern**:
```typescript
// Separate connection pools per dependency (bulkhead isolation)
const paymentPool = axios.create({
  baseURL: 'https://payment.example.com',
  timeout: 5000,
  httpAgent: new http.Agent({ maxSockets: 20 }), // Limit to 20 concurrent
});

const inventoryPool = axios.create({
  baseURL: 'https://inventory.example.com',
  timeout: 3000,
  httpAgent: new http.Agent({ maxSockets: 10 }), // Limit to 10 concurrent
});

// If payment is slow, it only exhausts its own pool (20 connections)
// Inventory requests continue working on their separate pool
```

### 6. Health Checks and Dependency Monitoring

- **Liveness Check**: `/health/live` — returns 200 if process is running (no dependency checks)
- **Readiness Check**: `/health/ready` — returns 200 only if all critical dependencies are reachable
- **Dependency Status**: `/health/dependencies` — returns status of each dependency with latency
- **Circuit Breaker State**: Health endpoint MUST include circuit breaker states

**Implementation Pattern**:
```typescript
app.get('/health/dependencies', async (req, res) => {
  const checks = await Promise.allSettled([
    checkDependency('dynamodb', () => dynamoClient.send(new DescribeTableCommand({}))),
    checkDependency('redis', () => redis.ping()),
    checkDependency('payment-gateway', () => paymentClient.healthCheck()),
  ]);

  const dependencies = checks.map((result, i) => ({
    name: ['dynamodb', 'redis', 'payment-gateway'][i],
    status: result.status === 'fulfilled' ? 'healthy' : 'unhealthy',
    latencyMs: result.status === 'fulfilled' ? result.value.latencyMs : null,
    circuitState: getCircuitState(['dynamodb', 'redis', 'payment-gateway'][i]),
    error: result.status === 'rejected' ? result.reason.message : null,
  }));

  const allHealthy = dependencies.every(d => d.status === 'healthy');
  res.status(allHealthy ? 200 : 503).json({ status: allHealthy ? 'healthy' : 'degraded', dependencies });
});
```

---

## Validation

Services must validate compliance with this golden spec through:

### Automated Validation (via `validate-circuit-breaker.yaml` and `validate-retry-patterns.yaml` hooks)

The validation hooks automatically check service code for:
- ✓ All external calls wrapped in circuit breakers
- ✓ All retries use exponential backoff with jitter
- ✓ All external calls have explicit timeout configuration
- ✓ Fallback behavior defined for critical dependencies
- ✓ No infinite retry loops or missing timeout values

### Manual Testing Checklist

Before deploying a new service, verify:

1. **Circuit Breaker Behavior**:
   - Simulate dependency failure → verify circuit opens after threshold
   - Verify fallback response returned when circuit is open
   - Wait for reset timeout → verify half-open state tests recovery
   - Restore dependency → verify circuit closes and normal traffic resumes

2. **Retry Logic**:
   - Simulate transient 503 errors → verify retries with backoff
   - Simulate permanent 404 errors → verify NO retries
   - Observe retry delays → verify exponential increase with jitter
   - Verify max retries honored (no infinite loops)

3. **Timeout Behavior**:
   - Simulate slow dependency (>timeout) → verify request fails fast
   - Verify connection timeout triggers on unreachable host
   - Verify service SLA met even when dependencies are at timeout threshold

4. **Graceful Degradation**:
   - Kill primary dependency → verify fallback data returned
   - Kill cache → verify service still responds (with further degradation)
   - Verify health endpoint reflects degraded state

5. **Bulkhead Isolation**:
   - Saturate one dependency's connection pool → verify other deps unaffected
   - Verify concurrent request limits enforce backpressure

---

## Design Decisions (and why)

### Fail Open vs Fail Closed

**Decision**: Default to fail-open for non-critical dependencies, fail-closed for security/auth.

**Rationale**: For most features, partial availability is better than complete unavailability. A product page without recommendations is better than a 500 error. However, authentication and authorization MUST fail closed (deny access if auth service is down).

**Configuration**:
```typescript
// Non-critical: fail open (return degraded response)
const recommendationBreaker = createBreaker('recommendations', { failOpen: true });

// Critical: fail closed (return error, don't proceed)
const authBreaker = createBreaker('auth-service', { failOpen: false });
```

### Circuit Breaker Per-Dependency vs Per-Endpoint

**Decision**: One circuit breaker per external dependency (not per endpoint).

**Rationale**: If a service is unhealthy, all endpoints are likely affected. Per-endpoint circuits create complexity without proportional benefit. Exception: if a service has clearly independent subsystems (e.g., read vs write paths), separate circuits may be justified.

### Retry Inside vs Outside Circuit Breaker

**Decision**: Retries happen INSIDE the circuit breaker.

**Rationale**: The circuit breaker counts retried failures toward its threshold. If a call fails 3 times with retries, that's 3 failures counted. This ensures the circuit opens faster when a dependency is truly down, rather than being hidden behind retries.

```typescript
// ✓ CORRECT: Retry inside circuit breaker
const breaker = new CircuitBreaker(
  async (data) => retry(() => httpClient.post(url, data), { maxRetries: 3 }),
  { errorThresholdPercentage: 50 }
);

// ✗ WRONG: Retry outside circuit breaker (hides failures from circuit)
const result = await retry(
  () => breaker.fire(data),  // Each retry is a separate circuit breaker call
  { maxRetries: 3 }
);
```

---

## Exceptions and Waivers

Services may request exemption in the following scenarios:

1. **Internal utility services**: Services that only call internal dependencies with <1ms latency (e.g., local cache, in-process queues)
2. **Batch processing**: Offline batch jobs where latency is not a concern may use simpler retry logic (but still require bounded retries)
3. **Fire-and-forget events**: Event publishers where delivery is best-effort may omit circuit breakers (but must still have timeouts)

**Exception Process**:
1. Document exception rationale in service spec
2. Get approval from Platform Engineering team lead
3. Track exception in `docs/golden-spec-exceptions.md`
4. Review exception annually

---

## Related Standards

This golden spec should be used in conjunction with:
- `tracing-standard.spec.md` - Trace propagation through circuit breakers and retries
- `logging-standard.spec.md` - Structured logging for failure events
- `observability.spec.md` - CloudWatch metrics and alarms for resiliency patterns

---

## References

- [AWS Well-Architected Framework - Reliability Pillar](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/)
- [Circuit Breaker Pattern (Martin Fowler)](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Exponential Backoff and Jitter (AWS Architecture Blog)](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Bulkhead Pattern (Microsoft)](https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead)
- [opossum Circuit Breaker (Node.js)](https://github.com/nodeshift/opossum)

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-24 | Platform Engineering | Initial golden spec for resiliency standard |
