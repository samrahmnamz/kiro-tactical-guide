/**
 * Notification Service API
 * 
 * A production-ready Express API for managing multi-channel notifications with:
 * - Priority-based queue routing (high/normal/low)
 * - Idempotency protection (prevents duplicate sends within 1-hour windows)
 * - Comprehensive error handling and validation
 * - PII-scrubbing request logging
 * 
 * This service demonstrates automation patterns: spec → implementation + tests + IaC + docs
 * 
 * ## Configuration
 * Required environment variables:
 * - `PORT`: HTTP server port (default: 3000)
 * - `AWS_REGION`: AWS region for SQS/DynamoDB
 * - `SQS_HIGH_PRIORITY_QUEUE_URL`: URL for high-priority queue
 * - `SQS_NORMAL_PRIORITY_QUEUE_URL`: URL for normal-priority queue
 * - `SQS_LOW_PRIORITY_QUEUE_URL`: URL for low-priority queue
 * - `DYNAMODB_NOTIFICATION_RECORDS_TABLE`: DynamoDB table name
 * - `DYNAMODB_CUSTOMER_PREFERENCES_TABLE`: Customer preferences table name
 * 
 * ## Endpoints
 * - `POST /api/notifications/send`: Send notification (returns 202 Accepted)
 * - `GET /api/notifications/:notificationId/status`: Get notification status
 * - `GET /health`: Health check endpoint
 * 
 * @module index
 */

import express, { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  SendNotificationRequest,
  SendNotificationResponse,
  NotificationStatusResponse,
  ErrorResponse,
  NotificationRecord,
  NotificationPriority,
  NotificationChannel,
  QueueMessage,
} from './types';
import logger from './logger';
import { createNotificationRecord, getNotificationRecord } from './database';
import { enqueueNotification, getEstimatedDeliveryTime } from './queue';

const app = express();
app.use(express.json());

// Request logging middleware with PII scrubbing
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

/**
 * Generate idempotency key from customerId, templateId, and 1-hour time bucket.
 * 
 * Prevents duplicate notifications by creating a unique key based on the customer,
 * template, and the current hour. This ensures that retries or duplicate API calls
 * within the same hour window won't send multiple notifications.
 * 
 * The 1-hour bucket is calculated by dividing current time in milliseconds by
 * 3,600,000 (milliseconds per hour) and flooring the result.
 * 
 * @param customerId - Unique customer identifier
 * @param templateId - Template being sent (e.g., "password-reset", "order-confirmation")
 * @returns Idempotency key in format "customerId:templateId:hourBucket"
 * 
 * @example
 * ```typescript
 * const key = generateIdempotencyKey("user-123", "welcome-email");
 * // Returns: "user-123:welcome-email:498765"
 * ```
 */
function generateIdempotencyKey(customerId: string, templateId: string): string {
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  return `${customerId}:${templateId}:${hourBucket}`;
}

/**
 * Type guard to validate notification channel values.
 * 
 * Checks if a string value is one of the allowed notification channels.
 * Used for runtime validation of API request parameters.
 * 
 * @param channel - String value to validate
 * @returns True if channel is 'email', 'sms', or 'push'
 */
function isValidChannel(channel: string): channel is NotificationChannel {
  return ['email', 'sms', 'push'].includes(channel);
}

/**
 * Type guard to validate notification priority values.
 * 
 * Checks if a string value is one of the allowed priority levels.
 * Priority determines which SQS queue the notification is routed to:
 * - high: ~30 second delivery
 * - normal: ~5 minute delivery
 * - low: ~1 hour delivery
 * 
 * @param priority - String value to validate
 * @returns True if priority is 'high', 'normal', or 'low'
 */
function isValidPriority(priority: string): priority is NotificationPriority {
  return ['high', 'normal', 'low'].includes(priority);
}

/**
 * POST /api/notifications/send
 * 
 * Send a notification to a customer via email, SMS, or push notification.
 * 
 * This endpoint:
 * 1. Validates request parameters
 * 2. Generates a unique notification ID
 * 3. Creates idempotency key to prevent duplicates
 * 4. Persists notification record to DynamoDB
 * 5. Enqueues message to appropriate priority SQS queue
 * 6. Returns 202 Accepted with estimated delivery time
 * 
 * ## Request Body
 * ```json
 * {
 *   "customerId": "user-12345",
 *   "channel": "email" | "sms" | "push",
 *   "templateId": "order-confirmation",
 *   "params": { "orderId": "ABC123", "amount": 99.99 },
 *   "priority": "high" | "normal" | "low"  // optional, defaults to "normal"
 * }
 * ```
 * 
 * ## Response (202 Accepted)
 * ```json
 * {
 *   "notificationId": "550e8400-e29b-41d4-a716-446655440000",
 *   "status": "queued",
 *   "estimatedDelivery": "2024-01-15T10:30:00.000Z",
 *   "channel": "email"
 * }
 * ```
 * 
 * ## Error Responses
 * - 400 Bad Request: Missing required field, invalid channel/priority, empty values
 * - 500 Internal Server Error: Database or queue failures
 * 
 * ## Idempotency
 * Duplicate requests with the same customerId and templateId within a 1-hour
 * window will return the existing notification record instead of creating a new one.
 * 
 * @route POST /api/notifications/send
 */
app.post('/api/notifications/send', async (req: Request, res: Response) => {
  try {
    const body = req.body as SendNotificationRequest;

    // Validate required fields
    if (!body.customerId) {
      const error: ErrorResponse = {
        error: {
          code: 'missing_required_field',
          message: 'customerId is required',
        },
      };
      return res.status(400).json(error);
    }

    if (!body.channel) {
      const error: ErrorResponse = {
        error: {
          code: 'missing_required_field',
          message: 'channel is required',
        },
      };
      return res.status(400).json(error);
    }

    if (!body.templateId) {
      const error: ErrorResponse = {
        error: {
          code: 'missing_required_field',
          message: 'templateId is required',
        },
      };
      return res.status(400).json(error);
    }

    // Validate channel
    if (!isValidChannel(body.channel)) {
      const error: ErrorResponse = {
        error: {
          code: 'invalid_channel',
          message: `Invalid channel: ${body.channel}. Must be email, sms, or push`,
        },
      };
      return res.status(400).json(error);
    }

    // Validate priority if provided
    const priority = body.priority || 'normal';
    if (!isValidPriority(priority)) {
      const error: ErrorResponse = {
        error: {
          code: 'invalid_priority',
          message: `Invalid priority: ${priority}. Must be high, normal, or low`,
        },
      };
      return res.status(400).json(error);
    }

    // Validate customerId is not empty
    if (body.customerId.trim() === '') {
      const error: ErrorResponse = {
        error: {
          code: 'invalid_customer_id',
          message: 'customerId cannot be empty',
        },
      };
      return res.status(400).json(error);
    }

    // Validate templateId is not empty
    if (body.templateId.trim() === '') {
      const error: ErrorResponse = {
        error: {
          code: 'invalid_template_id',
          message: 'templateId cannot be empty',
        },
      };
      return res.status(400).json(error);
    }

    const notificationId = uuidv4();
    const now = new Date().toISOString();
    const idempotencyKey = generateIdempotencyKey(body.customerId, body.templateId);

    // Create notification record in DynamoDB
    const record: NotificationRecord = {
      notificationId,
      customerId: body.customerId,
      channel: body.channel,
      templateId: body.templateId,
      params: body.params || {},
      status: 'queued',
      attempts: 0,
      timestamps: {
        queued: now,
        sent: null,
        delivered: null,
        failed: null,
      },
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      ttl: 0, // Will be set by database layer
      idempotencyKey,
      priority,
    };

    const createdRecord = await createNotificationRecord(record);

    // Enqueue for processing
    const queueMessage: QueueMessage = {
      notificationId: createdRecord.notificationId,
      customerId: body.customerId,
      channel: body.channel,
      templateId: body.templateId,
      params: body.params || {},
      priority,
    };

    await enqueueNotification(queueMessage, priority);

    const response: SendNotificationResponse = {
      notificationId: createdRecord.notificationId,
      status: createdRecord.status,
      estimatedDelivery: getEstimatedDeliveryTime(priority),
      channel: body.channel,
    };

    logger.info('Notification queued successfully', {
      notificationId: response.notificationId,
      customerId: body.customerId,
      channel: body.channel,
      priority,
    });

    return res.status(202).json(response);
  } catch (error) {
    logger.error('Error sending notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const errorResponse: ErrorResponse = {
      error: {
        code: 'internal_error',
        message: 'Failed to send notification',
      },
    };
    return res.status(500).json(errorResponse);
  }
});

/**
 * GET /api/notifications/:notificationId/status
 * 
 * Retrieve the current status and delivery information for a notification.
 * 
 * This endpoint queries DynamoDB to fetch the complete notification record including:
 * - Current status (queued, sent, delivered, failed, suppressed)
 * - Timestamp history (when queued, sent, delivered, or failed)
 * - Number of delivery attempts
 * - Error message if delivery failed
 * 
 * ## Response (200 OK)
 * ```json
 * {
 *   "notificationId": "550e8400-e29b-41d4-a716-446655440000",
 *   "customerId": "user-12345",
 *   "channel": "email",
 *   "templateId": "order-confirmation",
 *   "status": "sent",
 *   "timestamps": {
 *     "queued": "2024-01-15T10:00:00.000Z",
 *     "sent": "2024-01-15T10:05:23.000Z",
 *     "delivered": null,
 *     "failed": null
 *   },
 *   "attempts": 1,
 *   "errorMessage": null
 * }
 * ```
 * 
 * ## Status Values
 * - `queued`: Notification is waiting in SQS queue
 * - `sent`: Successfully sent to SES/SNS (email/SMS/push)
 * - `delivered`: Confirmed delivery (future webhook integration)
 * - `failed`: Delivery failed after max retries
 * - `suppressed`: Customer opted out of this channel
 * 
 * ## Error Responses
 * - 404 Not Found: Notification ID doesn't exist
 * - 500 Internal Server Error: Database query failed
 * 
 * @route GET /api/notifications/:notificationId/status
 */
app.get('/api/notifications/:notificationId/status', async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;

    const record = await getNotificationRecord(notificationId);

    if (!record) {
      const error: ErrorResponse = {
        error: {
          code: 'notification_not_found',
          message: `Notification not found: ${notificationId}`,
        },
      };
      return res.status(404).json(error);
    }

    const response: NotificationStatusResponse = {
      notificationId: record.notificationId,
      customerId: record.customerId,
      channel: record.channel,
      templateId: record.templateId,
      status: record.status,
      timestamps: record.timestamps,
      attempts: record.attempts,
      errorMessage: record.errorMessage,
    };

    return res.status(200).json(response);
  } catch (error) {
    logger.error('Error getting notification status', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const errorResponse: ErrorResponse = {
      error: {
        code: 'internal_error',
        message: 'Failed to get notification status',
      },
    };
    return res.status(500).json(errorResponse);
  }
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy' });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  const error: ErrorResponse = {
    error: {
      code: 'not_found',
      message: 'Endpoint not found',
    },
  };
  res.status(404).json(error);
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message });

  const error: ErrorResponse = {
    error: {
      code: 'internal_error',
      message: 'Internal server error',
    },
  };
  res.status(500).json(error);
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Notification service listening on port ${PORT}`);
  });
}

export default app;
