/**
 * SQS Queue Operations for Priority-Based Notification Processing
 * 
 * Manages three priority queues for notification delivery:
 * - **High priority**: ~30 second delivery (urgent notifications)
 * - **Normal priority**: ~5 minute delivery (standard notifications)
 * - **Low priority**: ~1 hour delivery (bulk/marketing notifications)
 * 
 * Each priority level uses a separate SQS queue to ensure high-priority
 * notifications are processed quickly without waiting for lower-priority items.
 * 
 * ## Configuration
 * Required environment variables:
 * - `AWS_REGION`: AWS region for SQS (default: us-east-1)
 * - `SQS_HIGH_PRIORITY_QUEUE_URL`: URL for high-priority queue
 * - `SQS_NORMAL_PRIORITY_QUEUE_URL`: URL for normal-priority queue
 * - `SQS_LOW_PRIORITY_QUEUE_URL`: URL for low-priority queue
 * 
 * ## Queue Processing
 * Messages include attributes for filtering and routing:
 * - `priority`: high/normal/low (for monitoring)
 * - `channel`: email/sms/push (for channel-specific processing)
 * 
 * @module queue
 */

import { SQSClient, SendMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { NotificationPriority, QueueMessage } from './types';
import logger from './logger';

const client = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Queue URL mapping by priority level.
 * 
 * Environment variables must be configured for each priority queue.
 * If a queue URL is missing, enqueueNotification will throw an error.
 */
const QUEUE_URLS: Record<NotificationPriority, string> = {
  high: process.env.SQS_HIGH_PRIORITY_QUEUE_URL || '',
  normal: process.env.SQS_NORMAL_PRIORITY_QUEUE_URL || '',
  low: process.env.SQS_LOW_PRIORITY_QUEUE_URL || '',
};

/**
 * Send notification message to the appropriate SQS queue based on priority.
 * 
 * Routes messages to high, normal, or low priority queues. Higher priority queues
 * should have more consumers or faster processing to ensure timely delivery.
 * 
 * ## Message Attributes
 * Includes attributes for filtering and monitoring:
 * - `priority`: The notification priority level
 * - `channel`: The delivery channel (email, sms, push)
 * 
 * These attributes can be used for:
 * - CloudWatch metrics and alarms
 * - Queue filtering (if using FIFO queues)
 * - Consumer-side routing decisions
 * 
 * @param message - Queue message with notification details
 * @param priority - Priority level determining which queue to use (default: 'normal')
 * @returns SQS message ID for tracking
 * @throws Error if queue URL is not configured for the given priority
 * 
 * @example
 * ```typescript
 * const message: QueueMessage = {
 *   notificationId: "abc-123",
 *   customerId: "user-456",
 *   channel: "email",
 *   templateId: "order-confirmation",
 *   params: { orderId: "ORDER-789" },
 *   priority: "high"
 * };
 * const messageId = await enqueueNotification(message, "high");
 * console.log(`Enqueued with ID: ${messageId}`);
 * ```
 */
export async function enqueueNotification(
  message: QueueMessage,
  priority: NotificationPriority = 'normal'
): Promise<string> {
  const queueUrl = QUEUE_URLS[priority];

  if (!queueUrl) {
    throw new Error(`Queue URL not configured for priority: ${priority}`);
  }

  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(message),
    MessageAttributes: {
      priority: {
        DataType: 'String',
        StringValue: priority,
      },
      channel: {
        DataType: 'String',
        StringValue: message.channel,
      },
    },
  });

  const response = await client.send(command);

  logger.info('Notification enqueued', {
    notificationId: message.notificationId,
    priority,
    channel: message.channel,
    messageId: response.MessageId,
  });

  return response.MessageId || '';
}

/**
 * Receive messages from an SQS queue for processing.
 * 
 * Uses long polling (20 second wait) to reduce empty responses and API costs.
 * Messages remain invisible to other consumers for 30 seconds (visibility timeout)
 * while being processed.
 * 
 * ## Visibility Timeout
 * After receiving a message, you have 30 seconds to:
 * 1. Process the notification
 * 2. Delete the message from the queue (on success)
 * 
 * If processing takes longer than 30 seconds or fails, the message becomes
 * visible again and may be reprocessed by another consumer.
 * 
 * ## Long Polling
 * WaitTimeSeconds=20 means the request will wait up to 20 seconds for messages
 * to arrive, reducing the number of empty responses.
 * 
 * @param priority - Priority queue to receive from (high, normal, or low)
 * @param maxMessages - Maximum number of messages to receive (1-10, default: 10)
 * @returns Array of queue messages (empty if no messages available)
 * @throws Error if queue URL is not configured for the given priority
 * 
 * @example
 * ```typescript
 * // Long polling worker loop
 * while (true) {
 *   const messages = await receiveMessages("normal", 10);
 *   for (const msg of messages) {
 *     await processNotification(msg);
 *     // Remember to delete message after successful processing
 *   }
 * }
 * ```
 */
export async function receiveMessages(
  priority: NotificationPriority,
  maxMessages = 10
): Promise<QueueMessage[]> {
  const queueUrl = QUEUE_URLS[priority];

  if (!queueUrl) {
    throw new Error(`Queue URL not configured for priority: ${priority}`);
  }

  const command = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: maxMessages,
    WaitTimeSeconds: 20, // Long polling
    VisibilityTimeout: 30, // 30 seconds to process
    MessageAttributeNames: ['All'],
  });

  const response = await client.send(command);

  if (!response.Messages || response.Messages.length === 0) {
    return [];
  }

  return response.Messages.map((msg) => JSON.parse(msg.Body || '{}') as QueueMessage);
}

/**
 * Calculate estimated delivery time based on notification priority.
 * 
 * Returns an ISO timestamp indicating when the notification is expected to be delivered.
 * These estimates reflect typical queue processing times and help users understand
 * when their notification will be sent.
 * 
 * ## Delivery Time Estimates
 * - **High priority**: ~30 seconds from now
 * - **Normal priority**: ~5 minutes from now
 * - **Low priority**: ~1 hour from now
 * 
 * Actual delivery times depend on:
 * - Queue depth (number of pending notifications)
 * - Number of active consumers
 * - Processing failures requiring retries
 * 
 * @param priority - Notification priority level
 * @returns ISO 8601 timestamp of estimated delivery
 * 
 * @example
 * ```typescript
 * const estimate = getEstimatedDeliveryTime("high");
 * // Returns: "2024-01-15T10:30:30.000Z" (30 seconds from now)
 * 
 * const estimate = getEstimatedDeliveryTime("normal");
 * // Returns: "2024-01-15T10:35:00.000Z" (5 minutes from now)
 * ```
 */
export function getEstimatedDeliveryTime(priority: NotificationPriority): string {
  const now = new Date();
  let delaySeconds: number;

  switch (priority) {
    case 'high':
      delaySeconds = 30; // 30 seconds
      break;
    case 'normal':
      delaySeconds = 5 * 60; // 5 minutes
      break;
    case 'low':
      delaySeconds = 60 * 60; // 1 hour
      break;
  }

  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
}
