/**
 * Resilient Order Service — Entry Point
 *
 * Express server demonstrating full resiliency patterns:
 * - Circuit breakers on all external dependencies
 * - Retry with exponential backoff and jitter
 * - Explicit timeouts on all external calls
 * - Graceful degradation with meaningful fallbacks
 * - Bulkhead isolation via separate connection pools
 * - Health endpoints with circuit breaker state reporting
 */

import express from 'express';
import { processOrder } from './services/order-service';
import {
  livenessHandler,
  readinessHandler,
  dependencyHealthHandler,
} from './health/health-check';
import { logger } from './logger';
import { OrderRequest } from './types';

const app = express();
app.use(express.json());

// Health endpoints
app.get('/health/live', livenessHandler);
app.get('/health/ready', readinessHandler);
app.get('/health/dependencies', dependencyHealthHandler);

// Order processing endpoint
app.post('/api/orders', async (req, res) => {
  try {
    const request = req.body as OrderRequest;

    // Input validation
    if (!request.items || request.items.length === 0) {
      res.status(400).json({
        error: { code: 'invalid_items', message: 'Items array is required', retryable: false, retryAfter: null },
      });
      return;
    }

    if (!request.paymentMethod) {
      res.status(400).json({
        error: { code: 'missing_required_field', message: 'paymentMethod is required', retryable: false, retryAfter: null },
      });
      return;
    }

    if (!request.idempotencyKey) {
      res.status(400).json({
        error: { code: 'missing_idempotency_key', message: 'idempotencyKey is required for safe retries', retryable: false, retryAfter: null },
      });
      return;
    }

    const invalidItems = request.items.filter((i) => !i.quantity || i.quantity <= 0);
    if (invalidItems.length > 0) {
      res.status(400).json({
        error: { code: 'invalid_quantity', message: 'All items must have quantity > 0', retryable: false, retryAfter: null },
      });
      return;
    }

    // Process order with full resiliency
    const result = await processOrder(request);

    const statusCode = result.status === 'confirmed' ? 201 : 202;
    res.status(statusCode).json(result);
  } catch (error) {
    logger.error('Order processing failed', { error: (error as Error).message });

    // Database/infrastructure failure — service truly unavailable
    res.status(503).json({
      error: {
        code: 'service_unavailable',
        message: 'Service temporarily unavailable',
        retryable: true,
        retryAfter: 30,
      },
    });
  }
});

// Start server
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  logger.info(`Resilient Order Service running on port ${PORT}`);
});

export default app;
