/**
 * Inventory Service Client
 *
 * Demonstrates:
 * - Circuit breaker with optimistic fallback (accept order, reconcile later)
 * - Lower threshold than payment (faster failure detection)
 * - Shorter reset timeout (inventory recovers faster)
 * - Bulkhead isolation with smaller pool
 */

import { createCircuitBreaker } from '../resilience/circuit-breaker';
import { retryWithBackoff, isTransientError } from '../resilience/retry';
import { createIsolatedClient } from '../resilience/bulkhead';
import { logger } from '../logger';

// Bulkhead: isolated pool (smaller than payment — less critical)
const inventoryHttpClient = createIsolatedClient({
  name: 'inventory-service',
  baseURL: process.env.INVENTORY_SERVICE_URL ?? 'https://inventory.example.com',
  maxConnections: 15,
  timeoutMs: 3000,
});

interface ReserveRequest {
  items: Array<{ productId: string; quantity: number }>;
  orderId: string;
}

interface ReserveResponse {
  reservationId: string;
  status: 'reserved' | 'partial' | 'unavailable';
  items: Array<{ productId: string; reserved: boolean }>;
}

async function reserveWithRetry(data: ReserveRequest): Promise<ReserveResponse> {
  return retryWithBackoff(
    async () => {
      const response = await inventoryHttpClient.post('/v1/reservations', data);

      if (response.status >= 500 || response.status === 429) {
        const error: any = new Error(`Inventory service error: ${response.status}`);
        error.response = { status: response.status };
        throw error;
      }

      if (response.status >= 400) {
        const error: any = new Error(`Inventory request invalid: ${response.status}`);
        error.response = { status: response.status };
        throw error;
      }

      return response.data as ReserveResponse;
    },
    {
      maxRetries: 2, // Fewer retries than payment (faster fallback)
      baseDelayMs: 100,
      maxDelayMs: 3000,
      jitter: 'full',
      retryIf: isTransientError,
      onRetry: (error, attempt, delayMs) => {
        logger.warn('Retrying inventory reservation', {
          attempt,
          delayMs: Math.round(delayMs),
          error: error.message,
          orderId: data.orderId,
        });
      },
    }
  );
}

const inventoryBreaker = createCircuitBreaker(reserveWithRetry, {
  name: 'inventory-service',
  timeout: 3000,
  errorThresholdPercentage: 60,
  resetTimeout: 15000, // Shorter reset — inventory recovers faster
  volumeThreshold: 5,
  fallback: async (data: ReserveRequest) => {
    // Optimistic fallback: accept order, reconcile inventory async
    logger.warn('Inventory circuit open, accepting order optimistically', {
      orderId: data.orderId,
      itemCount: data.items.length,
    });
    return {
      reservationId: null,
      status: 'pending' as const,
      items: data.items.map((item) => ({ productId: item.productId, reserved: false })),
      optimistic: true,
    };
  },
});

/**
 * Public API: Reserve inventory with full resiliency.
 */
export async function reserveInventory(data: ReserveRequest): Promise<{
  reservationId: string | null;
  status: 'reserved' | 'pending' | 'unavailable';
  optimistic?: boolean;
}> {
  return inventoryBreaker.fire(data);
}
