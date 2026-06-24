# Resilient Order Service Specification

> **Example Project**: Demonstrates resiliency patterns — circuit breakers, retry
> with backoff, timeout budgets, graceful degradation, and bulkhead isolation
>
> **Primary Concern Addressed**:
> - Preventing cascading failures in distributed systems
> - Maintaining partial availability during dependency outages
>
> **Toolkit Artifacts Demonstrated**:
> - `hooks/resiliency/validate-circuit-breaker.yaml`
> - `hooks/resiliency/validate-retry-patterns.yaml`
> - `hooks/resiliency/validate-timeouts.yaml`
> - `specs/golden/resiliency-standard.spec.md`
> - `hooks/stability/test-on-save.yaml`

---

## Intent

Process customer orders by coordinating payment, inventory, and notification services with full resiliency patterns. Demonstrates how to maintain partial availability when any dependency fails, prevent cascading failures through circuit breakers, and recover automatically when dependencies restore.

**Why it exists**: AI-generated code typically calls external services directly without circuit breakers, retries, or timeouts. This example shows the correct patterns and provides hooks that catch missing resiliency logic before it reaches production.

---

## Contracts

### Order Processing API

#### POST /api/orders
Create a new order, process payment, reserve inventory, and send confirmation.

**Request**:
```typescript
{
  "customerId": string,
  "items": Array<{
    "productId": string,
    "quantity": number,
    "unitPrice": number
  }>,
  "paymentMethod": "card" | "bank_transfer",
  "shippingAddress": {
    "line1": string,
    "city": string,
    "state": string,
    "postalCode": string,
    "country": string
  },
  "idempotencyKey": string  // Client-generated UUID for safe retries
}
```

**Response (Success - 201)**:
```typescript
{
  "orderId": string,
  "status": "confirmed" | "pending_payment" | "degraded",
  "payment": {
    "status": "charged" | "pending" | "queued",
    "transactionId": string | null
  },
  "inventory": {
    "status": "reserved" | "pending" | "unavailable",
    "reservationId": string | null
  },
  "notification": {
    "status": "sent" | "queued" | "skipped"
  },
  "degradedFeatures": string[]  // List of features operating in degraded mode
}
```

**Response (Error - 4xx/5xx)**:
```typescript
{
  "error": {
    "code": string,
    "message": string,
    "retryable": boolean,
    "retryAfter": number | null  // Seconds until retry recommended
  }
}
```

#### GET /api/orders/:orderId
Retrieve order status including dependency health context.

#### GET /health/dependencies
Report health status of all dependencies with circuit breaker states.

**Response (200/503)**:
```typescript
{
  "status": "healthy" | "degraded" | "unhealthy",
  "dependencies": Array<{
    "name": string,
    "status": "healthy" | "unhealthy" | "unknown",
    "latencyMs": number | null,
    "circuitState": "closed" | "open" | "half-open",
    "lastFailure": string | null,
    "failureCount": number
  }>
}
```

---

## Constraints

### Resiliency Constraints

#### 1. Circuit Breaker — Payment Gateway
- **Threshold**: Open after 5 consecutive failures OR 50% error rate (min 10 requests)
- **Reset Timeout**: 30 seconds before half-open test
- **Fallback**: Queue payment for async retry, return order with `status: "pending_payment"`
- **Timeout**: 5 seconds per payment request
- **Observability**: Log + emit metric on every state change

#### 2. Circuit Breaker — Inventory Service
- **Threshold**: Open after 3 consecutive failures OR 60% error rate (min 5 requests)
- **Reset Timeout**: 15 seconds (inventory is faster to recover)
- **Fallback**: Accept order optimistically, reconcile inventory async
- **Timeout**: 3 seconds per inventory request
- **Observability**: Log + emit metric on every state change

#### 3. Circuit Breaker — Notification Service
- **Threshold**: Open after 10 failures (non-critical, higher tolerance)
- **Reset Timeout**: 60 seconds (non-critical, no rush to recover)
- **Fallback**: Queue notification for later delivery, don't fail the order
- **Timeout**: 2 seconds per notification request
- **Observability**: Log on state change (metrics optional for non-critical)

#### 4. Retry Logic
- **Backoff**: Exponential with full jitter: `random(0, min(cap, base * 2^attempt))`
- **Base Delay**: 100ms
- **Max Delay Cap**: 5 seconds
- **Max Retries**: 3 for payment, 2 for inventory, 1 for notification
- **Retry Condition**: Only 429, 500, 502, 503, 504, ECONNREFUSED, ETIMEDOUT
- **No Retry**: 400, 401, 403, 404, 409, 422 (permanent failures)
- **Idempotency**: All retried payment requests MUST include idempotency key

#### 5. Timeout Budget
- **Service SLA**: 8 seconds total (p99)
- **Payment**: 5 seconds (includes retries)
- **Inventory**: 3 seconds (includes retries)
- **Notification**: 2 seconds (no retries, fire-and-forget)
- **Internal Processing**: 1 second
- **Note**: Payment and inventory can run in parallel (total ~5s + 1s processing)

#### 6. Graceful Degradation Hierarchy
- **Level 1 (All healthy)**: Full order processing — payment charged, inventory reserved, notification sent
- **Level 2 (Payment down)**: Order accepted with `pending_payment`, payment queued for retry
- **Level 3 (Inventory down)**: Order accepted optimistically, inventory reconciled async
- **Level 4 (Multiple deps down)**: Core order recorded, all side-effects queued
- **Level 5 (Database down)**: Return 503 with `Retry-After: 30` header

#### 7. Bulkhead Isolation
- **Payment pool**: Max 20 concurrent connections
- **Inventory pool**: Max 15 concurrent connections
- **Notification pool**: Max 10 concurrent connections
- **Shared resources**: NONE — each dependency has isolated connection pool

### Security Constraints
- No PII in logs — mask card numbers, addresses
- Idempotency keys prevent duplicate charges
- All external calls over HTTPS with TLS 1.2+

### Data Integrity Constraints
- Orders persisted BEFORE calling external services (saga pattern)
- Compensation logic for partial failures (refund if inventory fails after payment)
- DynamoDB conditional writes for idempotency enforcement

---

## Design Decisions (and why)

### 1. Optimistic Order Acceptance
**Decision**: Accept orders even when non-payment dependencies are down.
**Rationale**: Better to accept an order and reconcile later than reject a customer. Payment is the only hard gate — if payment fails, order cannot proceed. Inventory and notification are soft dependencies.
**Trade-off**: May accept orders for out-of-stock items. Mitigation: async inventory check within 30 seconds, notify customer if unavailable.

### 2. Retry Inside Circuit Breaker
**Decision**: Retries happen inside the circuit breaker function.
**Rationale**: Failed retries count toward circuit breaker threshold. If payment fails 3 times with retries, that's 3 failures counting toward opening the circuit. This ensures the circuit opens quickly for truly failing dependencies rather than being masked by retries.

### 3. Separate Circuit Breakers per Dependency
**Decision**: One circuit breaker per external service, not per endpoint.
**Rationale**: If the payment service is unhealthy, all its endpoints are likely affected. Per-endpoint circuits add complexity without proportional benefit for services behind a single load balancer.

### 4. Full Jitter over Equal Jitter
**Decision**: Use full jitter (`random(0, exponential_delay)`) not equal jitter.
**Rationale**: AWS research shows full jitter provides the best overall reduction in client wait time and server load. Equal jitter still has correlation between clients. Full jitter maximally decorrelates retry timing.

### 5. Fire-and-Forget for Notifications
**Decision**: Notification is best-effort with 1 retry max.
**Rationale**: Notification failure should never fail an order. Customer can check order status via API. Email/SMS will be retried by the notification service's own retry mechanism. Our circuit breaker just prevents us from hammering a failing notification service.

---

## Test Expectations

### Positive Cases (✓ Must Pass)

- ✓ **Happy Path**: All deps healthy → order confirmed, payment charged, inventory reserved, notification sent
- ✓ **Idempotency**: Same idempotencyKey submitted twice → same orderId returned, no duplicate charge
- ✓ **Retry Success**: Payment returns 503, then succeeds on retry → order confirmed
- ✓ **Circuit Recovery**: After circuit opens and reset timeout expires, half-open test succeeds → circuit closes, normal traffic resumes
- ✓ **Parallel Execution**: Payment and inventory calls execute in parallel (not sequential)
- ✓ **Health Endpoint**: Returns dependency status with circuit states and latency

### Negative Cases (✗ Must Be Rejected)

- ✗ **Invalid Items**: Empty items array → 400 with "invalid_items"
- ✗ **Missing Payment Method**: No paymentMethod → 400 with "missing_required_field"
- ✗ **Invalid Quantity**: quantity ≤ 0 → 400 with "invalid_quantity"
- ✗ **Missing Idempotency Key**: No idempotencyKey → 400 with "missing_idempotency_key"
- ✗ **Payment Declined (Permanent)**: Payment returns 402 → order failed, no retries

### Resiliency Cases (Must Be Handled)

- ✓ **Payment Circuit Open**: Circuit opens → order accepted with `pending_payment`, payment queued
- ✓ **Inventory Circuit Open**: Circuit opens → order accepted optimistically, inventory reconciled async
- ✓ **Notification Circuit Open**: Circuit opens → notification skipped, order still confirmed
- ✓ **Payment Timeout**: Payment exceeds 5s → timeout, retry with backoff
- ✓ **All Deps Down (except DB)**: Order recorded, all side-effects queued, response includes `degradedFeatures`
- ✓ **Database Down**: Return 503 with `Retry-After: 30` header
- ✓ **Retry Storm Prevention**: Under load, jitter decorrelates retry timing (no synchronized spikes)
- ✓ **Bulkhead Isolation**: Payment pool saturated → inventory calls unaffected
- ✓ **Compensation**: Payment succeeded but inventory unavailable → refund initiated

### Edge Cases

- ✓ **Circuit Breaker Flapping**: Rapid open/close cycles → hysteresis prevents flapping (require N successes to close)
- ✓ **Timeout During Retry**: Retry attempt itself times out → counts as failure, next retry if budget allows
- ✓ **Concurrent Orders Same Item**: Two orders for last item → one succeeds, one gets async inventory reconciliation
- ✓ **Half-Open Failure**: Half-open test fails → circuit returns to open, reset timer restarts
- ✓ **Connection Pool Exhausted**: Pool full → immediate rejection with 503, not queued indefinitely

---

## Rollback Plan

### Pre-Deployment Checklist
- [ ] Circuit breaker thresholds tuned for each dependency's failure profile
- [ ] Retry backoff parameters validated (not too aggressive, not too conservative)
- [ ] Timeout budget validated against service SLA
- [ ] Fallback responses tested for each dependency failure scenario
- [ ] Health endpoint returns correct circuit states
- [ ] CloudWatch alarms configured for circuit open events
- [ ] DLQ configured for queued payments/inventory operations

### Rollback Triggers
- **Circuit breaker flapping** (>5 open/close cycles in 5 minutes): Investigate dependency, increase threshold
- **Error rate > 10%** despite circuit breakers: Rollback to previous version
- **Latency P99 > 10s**: Check timeout configuration, reduce concurrent request limits
- **Payment queue depth > 1000**: Investigate payment gateway, scale queue processors

### Rollback Procedure
1. Deploy previous Lambda version via alias switch (instant)
2. Verify circuit breakers reset to closed state
3. Monitor error rate and latency for 5 minutes
4. If stable, investigate root cause of failure before redeploying
