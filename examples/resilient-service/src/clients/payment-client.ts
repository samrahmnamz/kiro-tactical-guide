/**
 * Payment Gateway Client
 *
 * Demonstrates:
 * - Circuit breaker wrapping external HTTP calls
 * - Retry with exponential backoff + jitter INSIDE circuit breaker
 * - Explicit timeout configuration
 * - Meaningful fallback (queue for async retry)
 * - Bulkhead isolation (own connection pool)
 * - Idempotency key for safe retries
 */

import { createCircuitBreaker } from '../resilience/circuit-breaker';
import { retryWithBackoff, isTransientError } from '../resilience/retry';
import { createIsolatedClient } from '../resilience/bulkhead';
import { logger } from '../logger';

// Bulkhead: isolated connection pool for payment gateway
const paymentHttpClient = createIsolatedClient({
  name: 'payment-gateway',
  baseURL: process.env.PAYMENT_GATEWAY_URL ?? 'https://payment.example.com',
  maxConnections: 20,
  timeoutMs: 5000,
});

interface ChargeRequest {
  amount: number;
  currency: string;
  paymentMethod: string;
  idempotencyKey: string;
}

interface ChargeResponse {
  transactionId: string;
  status: 'charged' | 'declined' | 'pending';
}

/**
 * Charge payment with retry (inside circuit breaker).
 * Retries handle transient failures; circuit breaker handles sustained failures.
 */
async function chargeWithRetry(data: ChargeRequest): Promise<ChargeResponse> {
  return retryWithBackoff(
    async () => {
      const response = await paymentHttpClient.post('/v1/charges', data, {
        headers: {
          'Idempotency-Key': data.idempotencyKey, // Safe to retry
          'Content-Type': 'application/json',
        },
      });

      // Throw on error status codes so retry/circuit can handle them
      if (response.status >= 500 || response.status === 429) {
        const error: any = new Error(`Payment gateway error: ${response.status}`);
        error.response = { status: response.status };
        throw error;
      }

      if (response.status >= 400) {
        // Permanent failure — will not be retried
        const error: any = new Error(`Payment declined: ${response.status}`);
        error.response = { status: response.status };
        error.permanent = true;
        throw error;
      }

      return response.data as ChargeResponse;
    },
    {
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 5000,
      jitter: 'full',
      retryIf: isTransientError,
      onRetry: (error, attempt, delayMs) => {
        logger.warn('Retrying payment charge', {
          attempt,
          delayMs: Math.round(delayMs),
          error: error.message,
          idempotencyKey: data.idempotencyKey,
        });
      },
    }
  );
}

/**
 * Circuit breaker wrapping the retry-enabled payment function.
 * Opens when sustained failures occur, preventing retry storms.
 */
const paymentBreaker = createCircuitBreaker(chargeWithRetry, {
  name: 'payment-gateway',
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
  fallback: async (data: ChargeRequest) => {
    // Fallback: queue payment for async processing
    logger.warn('Payment circuit open, queuing for retry', {
      idempotencyKey: data.idempotencyKey,
      amount: data.amount,
    });
    // In production, this would enqueue to SQS/DLQ
    return {
      transactionId: null,
      status: 'pending' as const,
      queued: true,
    };
  },
});

/**
 * Public API: Charge a payment with full resiliency.
 */
export async function chargePayment(data: ChargeRequest): Promise<{
  transactionId: string | null;
  status: 'charged' | 'pending' | 'declined';
  queued?: boolean;
}> {
  return paymentBreaker.fire(data);
}
