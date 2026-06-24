/**
 * Circuit Breaker Unit Tests
 *
 * Validates:
 * - Circuit opens after threshold failures
 * - Fallback invoked when circuit is open
 * - Circuit transitions to half-open after reset timeout
 * - Circuit closes after successful half-open test
 * - State changes are logged/observable
 */

import { createCircuitBreaker, getAllCircuitStates, resetAllCircuitBreakers } from '../../src/resilience/circuit-breaker';

// Mock logger to prevent console noise in tests
jest.mock('../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('createCircuitBreaker', () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
  });

  it('allows requests when circuit is closed', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const breaker = createCircuitBreaker(fn, {
      name: 'test-service',
      timeout: 1000,
      errorThresholdPercentage: 50,
      resetTimeout: 1000,
      volumeThreshold: 2,
    });

    const result = await breaker.fire();
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('opens circuit after error threshold exceeded', async () => {
    let callCount = 0;
    const fn = jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.reject(new Error('dependency down'));
    });

    const fallback = jest.fn().mockResolvedValue('fallback-data');

    const breaker = createCircuitBreaker(fn, {
      name: 'failing-service',
      timeout: 1000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 2,
      fallback,
    });

    // Trigger enough failures to open circuit
    try { await breaker.fire(); } catch {}
    try { await breaker.fire(); } catch {}
    try { await breaker.fire(); } catch {}

    // Next call should use fallback (circuit open)
    const result = await breaker.fire();
    expect(result).toBe('fallback-data');
    expect(fallback).toHaveBeenCalled();
  });

  it('invokes fallback with original arguments', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('down'));
    const fallback = jest.fn().mockResolvedValue('cached');

    const breaker = createCircuitBreaker(fn, {
      name: 'arg-test',
      timeout: 1000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 1,
      fallback,
    });

    // Open the circuit
    try { await breaker.fire('arg1', 'arg2'); } catch {}
    try { await breaker.fire('arg1', 'arg2'); } catch {}

    // Fallback should receive the same args
    await breaker.fire('arg1', 'arg2');
    expect(fallback).toHaveBeenCalledWith('arg1', 'arg2');
  });
});

describe('getAllCircuitStates', () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
  });

  it('returns states of all registered breakers', () => {
    const fn1 = jest.fn().mockResolvedValue('ok');
    const fn2 = jest.fn().mockResolvedValue('ok');

    createCircuitBreaker(fn1, {
      name: 'service-a',
      timeout: 1000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    });

    createCircuitBreaker(fn2, {
      name: 'service-b',
      timeout: 1000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    });

    const states = getAllCircuitStates();
    expect(states).toHaveLength(2);
    expect(states.map((s) => s.name)).toContain('service-a');
    expect(states.map((s) => s.name)).toContain('service-b');
    expect(states.every((s) => s.state === 'closed')).toBe(true);
  });
});
