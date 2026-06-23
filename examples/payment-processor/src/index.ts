/**
 * Payment Processor API Server
 * Express application with payment processing endpoints
 */

import express, { Request, Response, NextFunction } from 'express';
import { processPayment, retrievePayment, PaymentError } from './payment-service';
import { PaymentRequest, ErrorResponse } from './types';
import { logger } from './logger';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    // Don't log request body (may contain sensitive data)
  });
  next();
});

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

/**
 * POST /api/payments
 * Process a payment using Stripe token
 */
app.post('/api/payments', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const { stripeToken, amount, currency, orderId, metadata } = req.body;

    if (!stripeToken || !amount || !currency || !orderId || !metadata) {
      return res.status(400).json({
        error: {
          code: 'validation_error',
          message: 'Missing required fields',
        },
      } as ErrorResponse);
    }

    if (!metadata.customerEmail || !metadata.orderDescription) {
      return res.status(400).json({
        error: {
          code: 'validation_error',
          message: 'Missing required metadata fields',
        },
      } as ErrorResponse);
    }

    const paymentRequest: PaymentRequest = {
      stripeToken,
      amount,
      currency,
      orderId,
      metadata: {
        customerEmail: metadata.customerEmail,
        orderDescription: metadata.orderDescription,
      },
    };

    const result = await processPayment(paymentRequest);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof PaymentError) {
      // Map payment error codes to appropriate HTTP status codes
      const statusCode = error.code === 'card_declined' ? 402 : 400;
      return res.status(statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      } as ErrorResponse);
    }

    // Handle validation errors (non-PaymentError)
    if (error instanceof Error) {
      return res.status(400).json({
        error: {
          code: 'validation_error',
          message: error.message,
        },
      } as ErrorResponse);
    }

    logger.error('Unexpected error in payment processing', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred. Please try again.',
      },
    } as ErrorResponse);
  }
});

/**
 * GET /api/payments/:paymentId
 * Retrieve payment details
 */
app.get('/api/payments/:paymentId', async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.status(400).json({
        error: {
          code: 'validation_error',
          message: 'Payment ID is required',
        },
      } as ErrorResponse);
    }

    const result = await retrievePayment(paymentId);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof PaymentError && error.code === 'not_found') {
      return res.status(404).json({
        error: {
          code: error.code,
          message: error.message,
        },
      } as ErrorResponse);
    }

    logger.error('Unexpected error in payment retrieval', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred. Please try again.',
      },
    } as ErrorResponse);
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'not_found',
      message: 'Endpoint not found',
    },
  } as ErrorResponse);
});

// Error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'An unexpected error occurred',
    },
  } as ErrorResponse);
});

// Start server (only if not in test mode)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`Payment processor server started on port ${PORT}`);
  });
}

export default app;
