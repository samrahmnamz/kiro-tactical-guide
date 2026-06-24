/**
 * Retry Logic Unit Tests
 *
 * Validates:
 * - Exponential backoff calculation
 * - Jitter adds randomization
 * - Max retry limit honored
 * - Transient vs permanent failure classification
 * - Backoff cap prevents unreasonable delays
 */

import { calculateDelay, isTransientError, retryWithBackoff } from '../../src/resilience/retry';

describe('calculateDelay', () => {
  describe('full jitter', () => {
    it('returns value between 0 and capped exponential', () => {
      for (let i = 0; i < 100; i++) {
        const delay = calculateDelay(2, 100, 30000, 'full');
        // attempt 2: base * 2^2 = 400, full jitter = random(0, 400)
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(400);
      }
    });

    it('respects max delay cap', () => {
      for (let i = 0; i < 100; i++) {
        const delay = calculateDelay(10, 100, 5000, 'full');
        // attempt 10: base * 2^10 = 102400, capped to 5000
        expect(delay).toBeLessThanOrEqual(5000);
      }
    });

    it('produces varying delays (jitter working)', () => {
      const delays = Array.from({ length: 50 }, () => calculateDelay(2, 100, 30000, 'full'));
      const unique = new Set(delays.map((d) => Math.round(d)));
      // With 50 samples and full jitter, should have many unique values
      expect(unique.size).toBeGreaterThan(10);
    });
  });

  describe('equal jitter', () => {
    it('returns value between half and full exponential', () => {
      for (let i = 0; i < 100; i++) {
        const delay = calculateDelay(2, 100, 30000, 'equal');
        // attempt 2: capped = 400, equal = 200 + random(0, 200)
        expect(delay).toBeGreaterThanOrEqual(200);
        expect(delay).toBeLessThanOrEqual(400);
      }
    });
  });

  describe('decorrelated jitter', () => {
    it('uses previous delay as input', () => {
      const delay = calculateDelay(2, 100, 30000, 'decorrelated', 500);
      // decorrelated: min(30000, random(100, 500 * 3))
      expect(delay).toBeGreaterThanOrEqual(100);
      expect(delay).toBeLessThanOrEqual(1500);
    });
  });
});

describe('isTransientError', () => {
  it('identifies HTTP 5xx as transient', () => {
    expect(isTransientError({ response: { status: 500 } })).toBe(true);
    expect(isTransientError({ response: { status: 502 } })).toBe(true);
    expect(isTransientError({ response: { status: 503 } })).toBe(true);
    expect(isTransientError({ response: { status: 504 } })).toBe(true);
  });

  it('identifies HTTP 429 as transient', () => {
    expect(isTransientError({ response: { status: 429 } })).toBe(true);
  });

  it('identifies HTTP 4xx (non-429) as permanent', () => {
    expect(isTransientError({ response: { status: 400 } })).toBe(false);
    expect(isTransientError({ response: { status: 401 } })).toBe(false);
    expect(isTransientError({ response: { status: 403 } })).toBe(false);
    expect(isTransientError({ response: { status: 404 } })).toBe(false);
    expect(isTransientError({ response: { status: 422 } })).toBe(false);
  });

  it('identifies network errors as transient', () => {
    expect(isTransientError({ code: 'ECONNREFUSED' })).toBe(true);
    expect(isTransientError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isTransientError({ code: 'ECONNRESET' })).toBe(true);
  });

  it('identifies timeout errors as transient', () => {
    expect(isTransientError({ name: 'AbortError' })).toBe(true);
    expect(isTransientError({ code: 'ECONNABORTED' })).toBe(true);
  });

  it('treats unknown errors as non-transient', () => {
    expect(isTransientError(new Error('unknown'))).toBe(false);
    expect(isTransientError({})).toBe(false);
  });
});

describe('retryWithBackoff', () => {
  it('returns immediately on success', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 5000,
      jitter: 'full',
      retryIf: isTransientError,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient failure then succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 1, // Fast for tests
      maxDelayMs: 10,
      jitter: 'full',
      retryIf: isTransientError,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on permanent failure (no retry)', async () => {
    const permanentError = { response: { status: 404 } };
    const fn = jest.fn().mockRejectedValue(permanentError);

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        maxDelayMs: 10,
        jitter: 'full',
        retryIf: isTransientError,
      })
    ).rejects.toEqual(permanentError);

    // Only called once — no retries for permanent errors
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('exhausts retries and throws last error', async () => {
    const transientError = { response: { status: 503 } };
    const fn = jest.fn().mockRejectedValue(transientError);

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        maxDelayMs: 10,
        jitter: 'full',
        retryIf: isTransientError,
      })
    ).rejects.toEqual(transientError);

    // 1 initial + 3 retries = 4 calls
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('calls onRetry callback with attempt info', async () => {
    const onRetry = jest.fn();
    const fn = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValue('success');

    await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      maxDelayMs: 10,
      jitter: 'full',
      retryIf: isTransientError,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ response: { status: 503 } }),
      1, // attempt number
      expect.any(Number) // delay
    );
  });
});
