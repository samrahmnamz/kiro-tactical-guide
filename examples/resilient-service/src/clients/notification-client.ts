/**
 * Notification Service Client
 *
 * Demonstrates:
 * - Non-critical dependency: higher failure tolerance, fire-and-forget
 * - Longer reset timeout (no rush to recover non-critical feature)
 * - Minimal retries (1 max — don't waste time on notifications)
 * - Fallback: skip notification entirely, don't fail the order
 */

import { createCircuitBreaker } from '../resilience/circuit-breaker';
import { retryWithBackoff, isTransientError } from '../resilience/retry';
import { createIsolatedClient } from '../resilience/bulkhead';
import { logger } from '../logger';

// Bulkhead: smallest pool (least critical dependency)
const notificationHttpClient = createIsolatedClient({
  name: 'notification-service',
  baseURL: process.env.NOTIFICATION_SERVICE_URL ?? 'https://notification.example.com',
  maxConnections: 10,
  timeoutMs: 2000,
});

interface NotifyRequest {
  customerId: string;
  orderId: string;
  channel: 'email' | 'sms' | 'push';
  templateId: string;
  params: Record<string, string>;
}

async function sendWithRetry(data: NotifyRequest): Promise<{ status: string }> {
  return retryWithBackoff(
    async () => {
      const response = await notificationHttpClient.post('/v1/send', data);

      if (response.status >= 500 || response.status === 429) {
        const error: any = new Error(`Notification service error: ${response.status}`);
        error.response = { status: response.status };
        throw error;
      }

      return { status: 'sent' };
    },
    {
      maxRetries: 1, // Minimal retries — non-critical
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitter: 'full',
      retryIf: isTransientError,
      onRetry: (error, attempt) => {
        logger.info('Retrying notification', { attempt, orderId: data.orderId });
      },
    }
  );
}

const notificationBreaker = createCircuitBreaker(sendWithRetry, {
  name: 'notification-service',
  timeout: 2000,
  errorThresholdPercentage: 50,
  resetTimeout: 60000, // Long reset — non-critical, no rush
  volumeThreshold: 10, // High threshold — tolerant of failures
  fallback: async (data: NotifyRequest) => {
    // Fallback: skip notification, don't fail the order
    logger.info('Notification circuit open, skipping', { orderId: data.orderId });
    return { status: 'skipped' };
  },
});

/**
 * Public API: Send notification with best-effort delivery.
 * Never fails the parent operation — notifications are non-critical.
 */
export async function sendNotification(data: NotifyRequest): Promise<{
  status: 'sent' | 'queued' | 'skipped';
}> {
  try {
    return await notificationBreaker.fire(data);
  } catch (error) {
    // Even if circuit breaker itself errors, don't fail the order
    logger.error('Notification completely failed, skipping', {
      orderId: data.orderId,
      error: (error as Error).message,
    });
    return { status: 'skipped' };
  }
}
