/**
 * Retry with Exponential Backoff and Jitter
 *
 * Implements the AWS-recommended retry strategy:
 * - Exponential backoff: delay doubles with each attempt
 * - Full jitter: randomizes delay to prevent thundering herd
 * - Max delay cap: prevents unreasonably long waits
 * - Failure classification: only retries transient errors
 *
 * Reference: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 */

import { RetryConfig, JitterStrategy } from '../types';

/**
 * Calculate retry delay with exponential backoff and jitter.
 *
 * Strategies:
 * - full: random(0, min(cap, base * 2^attempt))  — best overall
 * - equal: min(cap, base * 2^attempt) / 2 + random(0, half)
 * - decorrelated: min(cap, random(base, prevDelay * 3))
 */
export function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitter: JitterStrategy,
  previousDelay?: number
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, maxDelayMs);

  switch (jitter) {
    case 'full':
      // Full jitter: best for reducing contention
      return Math.random() * capped;

    case 'equal':
      // Equal jitter: half deterministic, half random
      const half = capped / 2;
      return half + Math.random() * half;

    case 'decorrelated':
      // Decorrelated jitter: based on previous delay
      const prev = previousDelay ?? baseDelayMs;
      return Math.min(maxDelayMs, baseDelayMs + Math.random() * (prev * 3 - baseDelayMs));

    default:
      return Math.random() * capped;
  }
}

/**
 * Determine if an error is transient and safe to retry.
 *
 * Transient errors (RETRY):
 * - HTTP 429 (rate limited), 500, 502, 503, 504
 * - Network: ECONNREFUSED, ETIMEDOUT, ECONNRESET, EAI_AGAIN
 * - AWS: ThrottlingException, ServiceUnavailable
 *
 * Permanent errors (DO NOT RETRY):
 * - HTTP 400, 401, 403, 404, 409, 422
 * - AWS: ValidationException, AccessDeniedException
 * - Business logic errors
 */
export function isTransientError(error: any): boolean {
  // HTTP response errors
  if (error.response?.status) {
    const status = error.response.status;
    return [429, 500, 502, 503, 504].includes(status);
  }

  // Network-level errors
  if (error.code) {
    return ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'EPIPE'].includes(
      error.code
    );
  }

  // Timeout errors (from AbortController or axios)
  if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
    return true;
  }

  // AWS SDK errors
  if (error.name === 'ThrottlingException' || error.name === 'ServiceUnavailableException') {
    return true;
  }

  // Default: don't retry unknown errors
  return false;
}

/**
 * Execute an async function with retry logic.
 *
 * @param fn - The async function to execute
 * @param config - Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: any;
  let previousDelay = config.baseDelayMs;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if this is the last attempt
      if (attempt === config.maxRetries) {
        break;
      }

      // Don't retry permanent failures
      if (!config.retryIf(error)) {
        throw error;
      }

      // Calculate delay with backoff and jitter
      const delay = calculateDelay(
        attempt,
        config.baseDelayMs,
        config.maxDelayMs,
        config.jitter,
        previousDelay
      );
      previousDelay = delay;

      // Notify caller of retry (for logging/metrics)
      if (config.onRetry) {
        config.onRetry(error, attempt + 1, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
