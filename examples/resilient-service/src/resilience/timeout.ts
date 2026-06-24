/**
 * Timeout Utilities
 *
 * Wraps async operations with explicit timeout enforcement.
 * Prevents indefinite blocking on slow dependencies.
 *
 * Key principle: Every external call MUST have an explicit timeout.
 * Default library timeouts are often 0 (infinite) or 30-120 seconds (too long).
 */

/**
 * Execute an async function with a timeout.
 * Rejects with TimeoutError if the function doesn't complete within the deadline.
 *
 * @param fn - The async function to execute
 * @param timeoutMs - Maximum time allowed in milliseconds
 * @param label - Description for error messages (e.g., "payment-gateway")
 * @returns The result of fn()
 * @throws TimeoutError if deadline exceeded
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label: string = 'operation'
): Promise<T> {
  if (timeoutMs <= 0) {
    throw new Error(`Invalid timeout: ${timeoutMs}ms for ${label}. Timeout must be positive.`);
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`${label} timed out after ${timeoutMs}ms`, timeoutMs, label));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Create a fetch-compatible AbortController with timeout.
 * Use for native fetch() calls which have no built-in timeout.
 *
 * @param timeoutMs - Timeout in milliseconds
 * @returns AbortController that will abort after timeoutMs
 */
export function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  clear: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    clear: () => clearTimeout(timeoutId),
  };
}

/**
 * Custom error class for timeout violations.
 * Includes metadata useful for debugging and metrics.
 */
export class TimeoutError extends Error {
  public readonly timeoutMs: number;
  public readonly dependency: string;
  public readonly code = 'ETIMEDOUT';

  constructor(message: string, timeoutMs: number, dependency: string) {
    super(message);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    this.dependency = dependency;
  }
}
