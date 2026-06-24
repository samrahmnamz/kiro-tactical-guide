# Resiliency Hooks

This directory contains hooks that ensure cloud services are resilient to failures, latency spikes, and dependency outages.

## Purpose

Resiliency hooks enforce fault-tolerant patterns by:
- Validating circuit breaker implementations on save
- Enforcing retry patterns with exponential backoff and jitter
- Verifying graceful degradation and fallback behavior
- Catching missing timeout configurations in external calls
- Ensuring chaos engineering readiness

## Primary Concern Addressed

**Resiliency: Preventing Cascading Failures in Distributed Systems**
- 70% of outages caused by cascading failures from a single dependency (AWS Well-Architected)
- Mean time to recovery (MTTR) increases 3-5x without proper circuit breakers
- Retry storms amplify transient failures into full outages
- AI-generated code often omits timeout/retry/fallback logic

## Hooks

- `validate-circuit-breaker.yaml` - Verify circuit breaker patterns in service code
- `validate-retry-patterns.yaml` - Enforce proper retry logic (backoff, jitter, max retries)
- `validate-timeouts.yaml` - Ensure all external calls have explicit timeouts

## Usage

Copy hooks to your project's `.kiro/hooks/` directory and customize file paths and thresholds according to the inline guides in each hook.

## Integration with Other Hooks

These hooks complement:
- `stability/test-on-save.yaml` - Tests validate behavior, resiliency hooks validate fault tolerance patterns
- `stability/validate-spec-constraints.yaml` - Spec compliance includes resiliency constraints
- `security/validate-iam.yaml` - Security + resiliency = defense in depth
