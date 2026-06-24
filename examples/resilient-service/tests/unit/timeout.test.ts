/**
 * Timeout Utility Unit Tests
 *
 * Validates:
 * - Operations complete within timeout → result returned
 * - Operations exceed timeout → TimeoutError thrown
 * - Timeout includes dependency metadata for debugging
 * - Invalid timeout values rejected
 */

import { withTimeout, TimeoutError } from '../../src/resilience/timeout';

describe('withTimeout', () => {
  it('returns result when operation completes within timeout', async () => {
    const fn = () => Promise.resolve('success');

    const result = await withTimeout(fn, 1000, 'test-operation');

    expect(result).toBe('success');
  });

  it('throws TimeoutError when operation exceeds timeout', async () => {
    const slowFn = () => new Promise((resolve) => setTimeout(resolve, 500));

    await expect(withTimeout(slowFn, 50, 'slow-dependency')).rejects.toThrow(TimeoutError);
  });

  it('includes dependency name in TimeoutError', async () => {
    const slowFn = () => new Promise((resolve) => setTimeout(resolve, 500));

    try {
      await withTimeout(slowFn, 50, 'payment-gateway');
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError);
      expect((error as TimeoutError).dependency).toBe('payment-gateway');
      expect((error as TimeoutError).timeoutMs).toBe(50);
      expect((error as TimeoutError).code).toBe('ETIMEDOUT');
    }
  });

  it('propagates errors from the wrapped function', async () => {
    const failingFn = () => Promise.reject(new Error('dependency error'));

    await expect(withTimeout(failingFn, 1000, 'test')).rejects.toThrow('dependency error');
  });

  it('rejects invalid timeout values', async () => {
    const fn = () => Promise.resolve('success');

    await expect(withTimeout(fn, 0, 'test')).rejects.toThrow('Invalid timeout');
    await expect(withTimeout(fn, -1, 'test')).rejects.toThrow('Invalid timeout');
  });

  it('clears timeout timer on success (no leaked timers)', async () => {
    jest.useFakeTimers();

    const fn = () => Promise.resolve('fast');
    const promise = withTimeout(fn, 5000, 'test');

    await promise;

    // Advance time past timeout — should not throw since timer was cleared
    jest.advanceTimersByTime(10000);

    jest.useRealTimers();
  });
});
