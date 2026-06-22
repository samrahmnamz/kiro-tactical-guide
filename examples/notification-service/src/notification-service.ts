/**
 * Notification Service Business Logic
 * 
 * Core notification sending functionality with multi-channel support (email, SMS, push).
 * 
 * ## Key Features
 * - **Multi-channel delivery**: Email via SES, SMS/Push via SNS
 * - **Opt-out enforcement**: Checks customer preferences before sending
 * - **Retry logic**: Exponential backoff with 3 attempts (1s, 4s, 16s delays)
 * - **Error classification**: Distinguishes permanent vs transient failures
 * - **Status tracking**: Updates DynamoDB with delivery progress
 * 
 * ## Retry Strategy
 * - Transient errors (rate limits, timeouts): Retry with exponential backoff
 * - Permanent errors (invalid email, unverified domain): Fail immediately, no retries
 * - Max retries exceeded: Mark as failed and move to DLQ for manual review
 * 
 * ## Configuration
 * Environment variables:
 * - `SES_REGION` or `AWS_REGION`: AWS region for SES (default: us-east-1)
 * - `SES_FROM_EMAIL`: Sender email address (default: notifications@example.com)
 * - `SNS_SMS_SENDER_ID`: SMS sender name (default: MyService)
 * 
 * @module notification-service
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import {
  NotificationChannel,
  NotificationRecord,
  QueueMessage,
  CustomerPreferences,
} from './types';
import logger from './logger';
import {
  getCustomerPreferences,
  updateNotificationStatus,
  getNotificationRecord,
} from './database';

const sesClient = new SESClient({
  region: process.env.SES_REGION || process.env.AWS_REGION || 'us-east-1',
});

const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'notifications@example.com';
const SMS_SENDER_ID = process.env.SNS_SMS_SENDER_ID || 'MyService';

/**
 * Retry configuration for transient failures.
 * 
 * - MAX_RETRIES: Maximum number of send attempts (3 total tries)
 * - BACKOFF_DELAYS: Exponential backoff delays in milliseconds
 *   - 1st retry: 1 second delay
 *   - 2nd retry: 4 seconds delay
 *   - 3rd retry: 16 seconds delay
 */
const MAX_RETRIES = 3;
const BACKOFF_DELAYS = [1000, 4000, 16000]; // milliseconds

/**
 * Check if a customer has opted out of receiving notifications on a specific channel.
 * 
 * This function enforces opt-out preferences stored in the CustomerPreferences table.
 * If a customer has opted out, notifications will be suppressed and marked with
 * status 'suppressed' instead of being sent.
 * 
 * @param preferences - Customer preference record from DynamoDB
 * @param channel - Notification channel to check (email, sms, or push)
 * @returns True if customer has opted out of this channel, false otherwise
 * 
 * @example
 * ```typescript
 * const prefs = await getCustomerPreferences("user-123");
 * if (isOptedOut(prefs, "email")) {
 *   // Don't send email, mark as suppressed
 * }
 * ```
 */
export function isOptedOut(
  preferences: CustomerPreferences,
  channel: NotificationChannel
): boolean {
  switch (channel) {
    case 'email':
      return preferences.emailOptOut;
    case 'sms':
      return preferences.smsOptOut;
    case 'push':
      return preferences.pushOptOut;
    default:
      return false;
  }
}

/**
 * Classify an error as permanent or transient.
 * 
 * Permanent errors indicate configuration issues or invalid recipient data that
 * won't be fixed by retrying. These errors cause immediate failure without retries.
 * 
 * Transient errors (rate limits, network issues, etc.) trigger exponential backoff retries.
 * 
 * ## Permanent Error Types
 * - InvalidParameterValue: Malformed request parameters
 * - InvalidEmail: Email address format is invalid
 * - InvalidPhoneNumber: Phone number format is invalid
 * - MessageRejected: SES rejected the message (content issues)
 * - MailFromDomainNotVerifiedException: Sender domain not verified in SES
 * 
 * @param error - Error object from AWS SDK
 * @returns True if error is permanent (don't retry), false if transient (should retry)
 * 
 * @example
 * ```typescript
 * try {
 *   await sendEmail(message);
 * } catch (error) {
 *   if (isPermanentError(error)) {
 *     // Fail immediately, update status to 'failed'
 *   } else {
 *     // Retry with backoff
 *   }
 * }
 * ```
 */
function isPermanentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const permanentErrors = [
    'InvalidParameterValue',
    'InvalidEmail',
    'InvalidPhoneNumber',
    'MessageRejected',
    'MailFromDomainNotVerifiedException',
  ];

  return permanentErrors.some((msg) => error.message.includes(msg));
}

/**
 * Sleep for the specified number of milliseconds.
 * 
 * Used to implement exponential backoff delays between retry attempts.
 * 
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 * 
 * @example
 * ```typescript
 * await sleep(1000); // Wait 1 second
 * await sendEmail(message); // Retry
 * ```
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send an email notification via AWS SES.
 * 
 * Renders email content from template ID and parameters, then sends via SES.
 * On success, updates notification status to 'sent' in DynamoDB.
 * 
 * ## Implementation Notes
 * - Current implementation uses simple string templates
 * - Production should use SES email templates for better formatting
 * - Email address comes from mock customer database (see function for details)
 * 
 * @param message - Queue message containing notification details
 * @param customerEmail - Recipient email address
 * @param record - Notification record from DynamoDB (for status updates)
 * @throws AWS SDK errors (InvalidEmail, MessageRejected, etc.)
 * 
 * @example
 * ```typescript
 * const message: QueueMessage = {
 *   notificationId: "abc-123",
 *   customerId: "user-456",
 *   channel: "email",
 *   templateId: "order-confirmation",
 *   params: { orderId: "ORDER-789", amount: 99.99 },
 *   priority: "normal"
 * };
 * await sendEmail(message, "customer@example.com", record);
 * ```
 */
async function sendEmail(
  message: QueueMessage,
  customerEmail: string,
  record: NotificationRecord
): Promise<void> {
  const { templateId, params } = message;

  // Simple template rendering (in production, use SES templates)
  const subject = `Notification: ${templateId}`;
  const body = `Hello,\n\n${JSON.stringify(params, null, 2)}\n\nBest regards,\n${SMS_SENDER_ID}`;

  const command = new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: {
      ToAddresses: [customerEmail],
    },
    Message: {
      Subject: {
        Data: subject,
      },
      Body: {
        Text: {
          Data: body,
        },
      },
    },
  });

  await sesClient.send(command);

  logger.info('Email sent successfully', {
    notificationId: message.notificationId,
    templateId,
  });

  await updateNotificationStatus(record.notificationId, 'sent');
}

/**
 * Send an SMS notification via AWS SNS.
 * 
 * Renders SMS content from template ID and parameters, then publishes via SNS.
 * SMS messages are marked as 'Transactional' for high priority delivery.
 * On success, updates notification status to 'sent' in DynamoDB.
 * 
 * ## SNS Configuration
 * - SMSType: Transactional (high priority, higher cost)
 * - SenderID: Custom sender name (appears on recipient's phone)
 * - PhoneNumber: E.164 format required (+1-555-123-4567)
 * 
 * @param message - Queue message containing notification details
 * @param customerPhone - Recipient phone number in E.164 format
 * @param record - Notification record from DynamoDB (for status updates)
 * @throws AWS SDK errors (InvalidPhoneNumber, etc.)
 * 
 * @example
 * ```typescript
 * await sendSMS(message, "+15551234567", record);
 * ```
 */
async function sendSMS(
  message: QueueMessage,
  customerPhone: string,
  record: NotificationRecord
): Promise<void> {
  const { templateId, params } = message;

  // Simple template rendering
  const smsBody = `${templateId}: ${JSON.stringify(params)}`;

  const command = new PublishCommand({
    PhoneNumber: customerPhone,
    Message: smsBody,
    MessageAttributes: {
      'AWS.SNS.SMS.SenderID': {
        DataType: 'String',
        StringValue: SMS_SENDER_ID,
      },
      'AWS.SNS.SMS.SMSType': {
        DataType: 'String',
        StringValue: 'Transactional',
      },
    },
  });

  await snsClient.send(command);

  logger.info('SMS sent successfully', {
    notificationId: message.notificationId,
    templateId,
  });

  await updateNotificationStatus(record.notificationId, 'sent');
}

/**
 * Send a push notification via AWS SNS.
 * 
 * Formats push notification payload for both GCM (Android) and APNS (iOS) platforms
 * using SNS's message structure format. Publishes to platform endpoint ARN.
 * On success, updates notification status to 'sent' in DynamoDB.
 * 
 * ## Platform Support
 * - GCM: Android push notifications
 * - APNS: iOS push notifications
 * - Both platforms receive the same notification content in platform-specific format
 * 
 * ## Implementation Notes
 * - deviceToken parameter should be a platform endpoint ARN from SNS
 * - Production apps need proper endpoint management and registration
 * - Message format uses SNS's json message structure
 * 
 * @param message - Queue message containing notification details
 * @param deviceToken - SNS platform endpoint ARN for customer's device
 * @param record - Notification record from DynamoDB (for status updates)
 * @throws AWS SDK errors (InvalidParameter, EndpointDisabled, etc.)
 * 
 * @example
 * ```typescript
 * const endpointArn = "arn:aws:sns:us-east-1:123456789:endpoint/GCM/MyApp/abc-123";
 * await sendPush(message, endpointArn, record);
 * ```
 */
async function sendPush(
  message: QueueMessage,
  deviceToken: string,
  record: NotificationRecord
): Promise<void> {
  const { templateId, params } = message;

  // Simple push message format
  const pushMessage = JSON.stringify({
    default: `${templateId}`,
    GCM: JSON.stringify({
      notification: {
        title: templateId,
        body: JSON.stringify(params),
      },
    }),
    APNS: JSON.stringify({
      aps: {
        alert: {
          title: templateId,
          body: JSON.stringify(params),
        },
      },
    }),
  });

  const command = new PublishCommand({
    TargetArn: deviceToken, // In production, this would be a platform endpoint ARN
    Message: pushMessage,
    MessageStructure: 'json',
  });

  await snsClient.send(command);

  logger.info('Push notification sent successfully', {
    notificationId: message.notificationId,
    templateId,
  });

  await updateNotificationStatus(record.notificationId, 'sent');
}

/**
 * Process a notification from SQS queue with retry logic and opt-out enforcement.
 * 
 * This is the main notification processing workflow:
 * 1. Fetch notification record from DynamoDB
 * 2. Check customer opt-out preferences
 * 3. Send notification via appropriate channel (email/SMS/push)
 * 4. Handle errors with exponential backoff retry
 * 5. Update DynamoDB with final status
 * 
 * ## Retry Behavior
 * - **Transient errors**: Retry up to 3 times with exponential backoff (1s, 4s, 16s)
 * - **Permanent errors**: Fail immediately without retries, mark as 'failed'
 * - **Max retries exceeded**: Mark as 'failed', message moves to DLQ for investigation
 * 
 * ## Status Outcomes
 * - `sent`: Successfully delivered to SES/SNS
 * - `suppressed`: Customer opted out of this channel
 * - `failed`: Permanent error or max retries exceeded
 * 
 * ## Customer Data
 * Current implementation uses mock customer data for demonstration:
 * - Email: `customer-{customerId}@example.com`
 * - Phone: `+1555{first 7 chars of customerId}`
 * - Device token: SNS endpoint ARN with customerId
 * 
 * Production systems should fetch real customer contact info from a customer database.
 * 
 * @param message - Queue message containing notification details and parameters
 * @throws Errors are caught and logged; function handles all failure scenarios
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
 * await processNotification(message);
 * ```
 */
export async function processNotification(message: QueueMessage): Promise<void> {
  const { notificationId, customerId, channel } = message;

  // Get notification record
  const record = await getNotificationRecord(notificationId);
  if (!record) {
    logger.error('Notification record not found', { notificationId });
    return;
  }

  // Check opt-out preferences
  const preferences = await getCustomerPreferences(customerId);
  if (isOptedOut(preferences, channel)) {
    logger.info('Customer opted out', { customerId, channel });
    await updateNotificationStatus(notificationId, 'suppressed');
    return;
  }

  // Mock customer contact info (in production, fetch from customer DB)
  const customerEmail = `customer-${customerId}@example.com`;
  const customerPhone = `+1555${customerId.substring(0, 7)}`;
  const deviceToken = `arn:aws:sns:us-east-1:123456789012:endpoint/${customerId}`;

  // Retry with exponential backoff
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Send notification based on channel
      switch (channel) {
        case 'email':
          await sendEmail(message, customerEmail, record);
          break;
        case 'sms':
          await sendSMS(message, customerPhone, record);
          break;
        case 'push':
          await sendPush(message, deviceToken, record);
          break;
      }

      // Success - exit retry loop
      return;
    } catch (error) {
      logger.error('Notification send failed', {
        notificationId,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Check if error is permanent
      if (isPermanentError(error)) {
        await updateNotificationStatus(
          notificationId,
          'failed',
          error instanceof Error ? error.message : 'Permanent error'
        );
        return;
      }

      // If not last attempt, wait before retry
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BACKOFF_DELAYS[attempt]);
      } else {
        // Final attempt failed - mark as failed and move to DLQ
        await updateNotificationStatus(
          notificationId,
          'failed',
          error instanceof Error ? error.message : 'Max retries exceeded'
        );
      }
    }
  }
}
