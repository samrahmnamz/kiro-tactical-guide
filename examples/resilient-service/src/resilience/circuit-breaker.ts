/**
 * Circuit Breaker Factory
 *
 * Creates configured circuit breakers for external dependencies.
 * Uses opossum library with standardized configuration, logging, and metrics.
 *
 * State machine:
 *   CLOSED (normal) → failures exceed threshold → OPEN (failing fast)
 *   OPEN (failing fast) → reset timeout expires → HALF-OPEN (testing)
 *   HALF-OPEN (testing) → test succeeds → CLOSED (normal)
 *   HALF-OPEN (testing) → test fails → OPEN (failing fast)
 */

import CircuitBreaker from 'opossum';
import { logger } from '../logger';
import { CircuitBreakerConfig, CircuitState } from '../types';

// Registry of all circuit breakers for health reporting
const breakerRegistry = new Map<string, CircuitBreaker>();

export interface CreateBreakerOptions<T> {
  name: string;
  timeout: number;
  errorThresholdPercentage: number;
  resetTimeout: number;
  volumeThreshold?: number;
  fallback?: (...args: any[]) => Promise<T>;
}

/**
 * Create a circuit breaker wrapping an async function.
 *
 * @param fn - The async function to protect
 * @param options - Circuit breaker configuration
 * @returns Configured CircuitBreaker instance
 */
export function createCircuitBreaker<T>(
  fn: (...args: any[]) => Promise<T>,
  options: CreateBreakerOptions<T>
): CircuitBreaker {
  const breaker = new CircuitBreaker(fn, {
    timeout: options.timeout,
    errorThresholdPercentage: options.errorThresholdPercentage,
    resetTimeout: options.resetTimeout,
    volumeThreshold: options.volumeThreshold ?? 5,
    rollingCountTimeout: 60000, // 1-minute rolling window
    rollingCountBuckets: 10,
  });

  // Register fallback if provided
  if (options.fallback) {
    breaker.fallback(options.fallback);
  }

  // Observability: log and emit metrics on state changes
  breaker.on('open', () => {
    logger.error(`Circuit OPEN: ${options.name}`, {
      dependency: options.name,
      state: 'open',
      stats: breaker.stats,
    });
  });

  breaker.on('halfOpen', () => {
    logger.info(`Circuit HALF-OPEN: ${options.name}, testing recovery`, {
      dependency: options.name,
      state: 'half-open',
    });
  });

  breaker.on('close', () => {
    logger.info(`Circuit CLOSED: ${options.name}, recovered`, {
      dependency: options.name,
      state: 'closed',
    });
  });

  breaker.on('fallback', () => {
    logger.warn(`Circuit fallback triggered: ${options.name}`, {
      dependency: options.name,
      state: getState(breaker),
    });
  });

  breaker.on('timeout', () => {
    logger.warn(`Circuit timeout: ${options.name}`, {
      dependency: options.name,
      timeoutMs: options.timeout,
    });
  });

  // Register for health endpoint reporting
  breakerRegistry.set(options.name, breaker);

  return breaker;
}

/**
 * Get the current state of a circuit breaker.
 */
function getState(breaker: CircuitBreaker): CircuitState {
  if (breaker.opened) return 'open';
  if (breaker.halfOpen) return 'half-open';
  return 'closed';
}

/**
 * Get health status of all registered circuit breakers.
 * Used by the /health/dependencies endpoint.
 */
export function getAllCircuitStates(): Array<{
  name: string;
  state: CircuitState;
  stats: { failures: number; successes: number; fallbacks: number };
}> {
  const states: Array<{
    name: string;
    state: CircuitState;
    stats: { failures: number; successes: number; fallbacks: number };
  }> = [];

  for (const [name, breaker] of breakerRegistry) {
    states.push({
      name,
      state: getState(breaker),
      stats: {
        failures: breaker.stats.failures ?? 0,
        successes: breaker.stats.successes ?? 0,
        fallbacks: breaker.stats.fallbacks ?? 0,
      },
    });
  }

  return states;
}

/**
 * Reset all circuit breakers (useful for testing).
 */
export function resetAllCircuitBreakers(): void {
  for (const [, breaker] of breakerRegistry) {
    breaker.close();
  }
}
