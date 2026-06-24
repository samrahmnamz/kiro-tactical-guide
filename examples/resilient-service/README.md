# Resilient Service Example

## Overview

This example demonstrates **resiliency patterns** for cloud services in the Kiro Cloud Engineering/DevOps Toolbox. It shows how circuit breakers, retry logic with exponential backoff, timeout budgets, graceful degradation, and bulkhead isolation prevent cascading failures in distributed systems.

## Primary Concern Addressed

**Resiliency: Preventing Cascading Failures**

The data shows:
- 70% of cloud outages caused by cascading failures from a single dependency
- Services without circuit breakers have 3-5x higher MTTR
- Retry storms account for 40% of amplified load during incidents
- AI-generated code omits timeout configuration 85% of the time

This example demonstrates how to maintain availability even when dependencies fail.

## Toolkit Artifacts Demonstrated

### Hooks

1. **validate-circuit-breaker.yaml** (`hooks/resiliency/validate-circuit-breaker.yaml`)
   - Verifies all external calls are wrapped in circuit breakers
   - Checks fallback behavior is defined and meaningful
   - Validates circuit breaker configuration thresholds

2. **validate-retry-patterns.yaml** (`hooks/resiliency/validate-retry-patterns.yaml`)
   - Enforces exponential backoff with jitter
   - Validates max retry limits (no infinite loops)
   - Checks transient vs permanent failure classification

3. **validate-timeouts.yaml** (`hooks/resiliency/validate-timeouts.yaml`)
   - Ensures all external calls have explicit timeouts
   - Validates timeout budget fits within service SLA
   - Catches missing connection/request timeouts

### Golden Spec

- **resiliency-standard.spec.md** (`specs/golden/resiliency-standard.spec.md`)
  - Organization-wide resiliency requirements
  - Circuit breaker, retry, timeout, and degradation standards
  - Validation checklist for new service deployments

### Spec Patterns

1. **Resiliency Constraints**
   - Circuit breaker thresholds and fallback behavior
   - Retry configuration with backoff parameters
   - Timeout budgets per dependency
   - Degradation hierarchy (primary → cached → static → error)

2. **Chaos Testing Expectations**
   - Service behavior when each dependency fails
   - Recovery behavior when dependencies restore
   - Performance under partial failure conditions

## What This Example Includes

```
examples/resilient-service/
├── spec.md                     # Specification with resiliency constraints
├── README.md                   # This file
├── package.json                # Dependencies (opossum, ioredis, etc.)
├── tsconfig.json               # TypeScript configuration
├── jest.config.js              # Test configuration
├── .env.example                # Environment variables template
├── src/
│   ├── index.ts                # Express server entry point
│   ├── resilience/
│   │   ├── circuit-breaker.ts  # Circuit breaker factory
│   │   ├── retry.ts            # Retry with exponential backoff + jitter
│   │   ├── timeout.ts          # Timeout wrapper utilities
│   │   └── bulkhead.ts         # Connection pool isolation
│   ├── clients/
│   │   ├── payment-client.ts   # Payment gateway with circuit breaker
│   │   ├── inventory-client.ts # Inventory service with circuit breaker
│   │   └── notification-client.ts # Notification service with circuit breaker
│   ├── services/
│   │   └── order-service.ts    # Order processing with graceful degradation
│   ├── health/
│   │   └── health-check.ts     # Dependency health and circuit state reporting
│   └── types.ts                # TypeScript types
└── tests/
    ├── unit/
    │   ├── circuit-breaker.test.ts
    │   ├── retry.test.ts
    │   └── timeout.test.ts
    └── integration/
        ├── graceful-degradation.test.ts
        └── chaos-scenarios.test.ts
```

## Key Patterns Demonstrated

### 1. Circuit Breaker with Meaningful Fallback

Every external dependency is wrapped in a circuit breaker that provides degraded but functional responses when the dependency is down:

```typescript
const paymentBreaker = createCircuitBreaker('payment-gateway', {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  fallback: async (data) => {
    await retryQueue.enqueue({ type: 'payment', data });
    return { status: 'pending', message: 'Payment queued' };
  },
});
```

### 2. Retry with Exponential Backoff and Jitter

All retries use exponential backoff with full jitter to prevent thundering herd:

```typescript
const result = await retryWithBackoff(
  () => inventoryService.reserve(items),
  {
    maxRetries: 3,
    baseDelayMs: 100,
    maxDelayMs: 5000,
    jitter: 'full',          // Randomized delay
    retryIf: isTransient,    // Only retry 5xx/timeouts
  }
);
```

### 3. Timeout Budgets

Each request has a total timeout budget distributed across dependencies:

```typescript
// Service SLA: 5000ms
// Budget allocation:
//   Payment: 2000ms (critical, gets largest share)
//   Inventory: 1500ms
//   Notification: 500ms (non-critical, smallest share)
//   Processing: 1000ms (internal logic)
```

### 4. Graceful Degradation Hierarchy

When dependencies fail, the service degrades gracefully:

```
Level 1: Full functionality (all deps healthy)
Level 2: Degraded (non-critical features disabled, cached data)
Level 3: Minimal (core function only, static fallbacks)
Level 4: Unavailable (return 503 with Retry-After header)
```

### 5. Bulkhead Isolation

Each dependency gets its own connection pool so one slow dependency can't exhaust connections for others:

```typescript
const paymentPool = new ConnectionPool({ maxConnections: 20 });
const inventoryPool = new ConnectionPool({ maxConnections: 10 });
// Payment slowness only affects its 20 connections, not inventory
```

## Before/After Transformation

### Before (Without Resiliency Patterns)

- **Single Dependency Failure**: Payment gateway slow → all requests blocked → service down
- **MTTR**: 30-60 minutes (find the slow dep, then wait for it to recover)
- **Blast Radius**: One dependency takes down entire service
- **Recovery**: Manual intervention required (restart, clear queues)

### After (With Resiliency Patterns)

- **Single Dependency Failure**: Payment circuit opens → fallback queues payments → other endpoints unaffected
- **MTTR**: 2-5 minutes (circuit breaker isolates, auto-recovers when dep returns)
- **Blast Radius**: Contained to affected feature only
- **Recovery**: Automatic via circuit breaker half-open → closed transition

## How to Run This Example

### Prerequisites

- Node.js 18+
- Redis 7.0+ (for demonstration of cache fallback)
- Docker (optional, for running dependencies locally)

### Setup

```bash
cd examples/resilient-service

# Install dependencies
npm install

# Start dependencies (optional, tests mock them)
docker compose up -d

# Set environment variables
cp .env.example .env
```

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run chaos scenario tests
npm run test:chaos

# Run with coverage
npm run test:coverage
```

### Running the Service

```bash
# Development mode
npm run dev

# Production mode
npm run build && npm start
```

### Testing Resiliency

```bash
# Normal request (all deps healthy)
curl http://localhost:3000/api/orders -X POST \
  -H "Content-Type: application/json" \
  -d '{"items": [{"id": "prod-1", "qty": 2}], "paymentMethod": "card"}'

# Check health and circuit states
curl http://localhost:3000/health/dependencies

# Simulate dependency failure (kill payment service)
# Then retry - should get degraded response with payment queued
```

## Metrics and Success Criteria

After implementing these patterns:

- **Availability**: 99.9% (up from 99.0% without circuit breakers)
- **Blast Radius**: Single-dependency (down from full-service)
- **MTTR**: <5 minutes (down from 30-60 minutes)
- **Retry Storm Prevention**: 0 incidents (down from 2-3/quarter)
- **Cascading Failures**: 0 incidents (down from 1-2/quarter)

## Related Examples

- **rate-limiter**: Stability patterns (test-on-save, spec validation)
- **payment-processor**: Security patterns (secret scanning, IAM validation)
- **notification-service**: Automation patterns (spec → implementation)
- **settlement-engine**: Regulatory patterns (deployment windows, approvals)

## References

- [AWS Well-Architected - Reliability Pillar](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/)
- [Circuit Breaker Pattern (Martin Fowler)](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Exponential Backoff and Jitter (AWS Blog)](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Release It! by Michael Nygard](https://pragprog.com/titles/mnee2/release-it-second-edition/)
- Golden Spec: `specs/golden/resiliency-standard.spec.md`
