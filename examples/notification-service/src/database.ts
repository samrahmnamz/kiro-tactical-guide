/**
 * DynamoDB Operations for Notification Records and Customer Preferences
 * 
 * Manages two DynamoDB tables:
 * 
 * ## NotificationRecords Table
 * - Primary key: `notificationId` (UUID)
 * - GSI: `IdempotencyKeyIndex` on `idempotencyKey` for duplicate detection
 * - TTL: Records expire after 90 days (automatic cleanup)
 * - Stores notification lifecycle: queued → sent → delivered/failed
 * 
 * ## CustomerPreferences Table
 * - Primary key: `customerId`
 * - Stores opt-out preferences per channel (email, SMS, push)
 * - Tracks preferred notification channels
 * 
 * ## Configuration
 * Environment variables:
 * - `AWS_REGION`: AWS region for DynamoDB (default: us-east-1)
 * - `DYNAMODB_NOTIFICATION_RECORDS_TABLE`: Table name (default: NotificationRecords)
 * - `DYNAMODB_CUSTOMER_PREFERENCES_TABLE`: Table name (default: CustomerPreferences)
 * 
 * @module database
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { NotificationRecord, CustomerPreferences, NotificationStatus } from './types';
import logger from './logger';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const NOTIFICATION_RECORDS_TABLE =
  process.env.DYNAMODB_NOTIFICATION_RECORDS_TABLE || 'NotificationRecords';
const CUSTOMER_PREFERENCES_TABLE =
  process.env.DYNAMODB_CUSTOMER_PREFERENCES_TABLE || 'CustomerPreferences';

/**
 * Time-to-live for notification records: 90 days from creation.
 * 
 * After 90 days, DynamoDB automatically deletes the record to manage storage costs.
 * The TTL attribute must be in Unix epoch seconds (not milliseconds).
 */
const TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * Create a notification record in DynamoDB with idempotency protection.
 * 
 * Uses conditional write to prevent duplicate notifications. If an idempotency key
 * is provided and already exists, returns the existing record instead of creating
 * a new one.
 * 
 * ## Idempotency Handling
 * - If `idempotencyKey` is set: Uses conditional expression to check key doesn't exist
 * - If duplicate detected: Fetches and returns existing record
 * - If no `idempotencyKey`: Uses `notificationId` uniqueness check
 * 
 * ## TTL Configuration
 * Automatically sets TTL to 90 days from creation for automatic record cleanup.
 * 
 * @param record - Notification record to create (without TTL, which is added automatically)
 * @returns Created or existing notification record (if duplicate)
 * @throws DynamoDB errors except ConditionalCheckFailedException (handled for idempotency)
 * 
 * @example
 * ```typescript
 * const record: NotificationRecord = {
 *   notificationId: uuidv4(),
 *   customerId: "user-123",
 *   channel: "email",
 *   templateId: "order-confirmation",
 *   params: { orderId: "ABC123" },
 *   status: "queued",
 *   attempts: 0,
 *   timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
 *   errorMessage: null,
 *   createdAt: new Date().toISOString(),
 *   updatedAt: new Date().toISOString(),
 *   ttl: 0, // Will be set automatically
 *   idempotencyKey: "user-123:order-confirmation:123456",
 *   priority: "normal"
 * };
 * const created = await createNotificationRecord(record);
 * ```
 */
export async function createNotificationRecord(
  record: NotificationRecord
): Promise<NotificationRecord> {
  const item: NotificationRecord = {
    ...record,
    ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };

  try {
    // Idempotency check using conditional write
    await docClient.send(
      new PutCommand({
        TableName: NOTIFICATION_RECORDS_TABLE,
        Item: item,
        ConditionExpression: item.idempotencyKey
          ? 'attribute_not_exists(idempotencyKey)'
          : 'attribute_not_exists(notificationId)',
      })
    );

    logger.info('Notification record created', {
      notificationId: item.notificationId,
      customerId: item.customerId,
      channel: item.channel,
      status: item.status,
    });

    return item;
  } catch (error: unknown) {
    // Check for ConditionalCheckFailedException (duplicate)
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      // Duplicate detected - fetch and return existing record
      if (item.idempotencyKey) {
        const existing = await getNotificationByIdempotencyKey(item.idempotencyKey);
        if (existing) {
          logger.info('Duplicate notification detected', {
            idempotencyKey: item.idempotencyKey,
            existingNotificationId: existing.notificationId,
          });
          return existing;
        }
      }
    }
    throw error;
  }
}

/**
 * Get a notification record by its unique ID.
 * 
 * Performs a single-item read from DynamoDB using the primary key.
 * 
 * @param notificationId - UUID of the notification
 * @returns Notification record if found, null otherwise
 * @throws DynamoDB client errors
 * 
 * @example
 * ```typescript
 * const record = await getNotificationRecord("550e8400-e29b-41d4-a716-446655440000");
 * if (record) {
 *   console.log(`Status: ${record.status}`);
 * }
 * ```
 */
export async function getNotificationRecord(
  notificationId: string
): Promise<NotificationRecord | null> {
  const response = await docClient.send(
    new GetCommand({
      TableName: NOTIFICATION_RECORDS_TABLE,
      Key: { notificationId },
    })
  );

  return (response.Item as NotificationRecord) || null;
}

/**
 * Get a notification record by its idempotency key.
 * 
 * Queries the IdempotencyKeyIndex GSI to find records with a matching key.
 * Used internally by createNotificationRecord to detect and return duplicates.
 * 
 * ## GSI Configuration
 * - Index name: `IdempotencyKeyIndex`
 * - Partition key: `idempotencyKey`
 * - Limit: 1 (we only need the first match)
 * 
 * @param idempotencyKey - Idempotency key (format: "customerId:templateId:hourBucket")
 * @returns First matching notification record, or null if not found
 * @throws DynamoDB query errors
 * 
 * @example
 * ```typescript
 * const existing = await getNotificationByIdempotencyKey("user-123:welcome:498765");
 * if (existing) {
 *   console.log(`Duplicate detected: ${existing.notificationId}`);
 * }
 * ```
 */
export async function getNotificationByIdempotencyKey(
  idempotencyKey: string
): Promise<NotificationRecord | null> {
  const response = await docClient.send(
    new QueryCommand({
      TableName: NOTIFICATION_RECORDS_TABLE,
      IndexName: 'IdempotencyKeyIndex',
      KeyConditionExpression: 'idempotencyKey = :key',
      ExpressionAttributeValues: {
        ':key': idempotencyKey,
      },
      Limit: 1,
    })
  );

  return response.Items && response.Items.length > 0
    ? (response.Items[0] as NotificationRecord)
    : null;
}

/**
 * Update notification status and related fields in DynamoDB.
 * 
 * Updates the status field and corresponding timestamp, increments the attempts
 * counter, and optionally stores an error message. Uses atomic increment to
 * safely track retry attempts across concurrent processors.
 * 
 * ## Status Timestamps
 * - `sent`: Timestamp when successfully sent to SES/SNS
 * - `delivered`: Timestamp when delivery confirmed (future webhook integration)
 * - `failed`: Timestamp when permanently failed
 * 
 * ## Attempts Counter
 * Increments atomically using `if_not_exists(#attempts, :zero) + :one` expression.
 * This safely initializes to 1 on first update and increments thereafter.
 * 
 * @param notificationId - UUID of the notification to update
 * @param status - New status ('sent', 'delivered', 'failed', or 'suppressed')
 * @param errorMessage - Optional error message (for failed status)
 * @throws DynamoDB update errors
 * 
 * @example
 * ```typescript
 * // Success case
 * await updateNotificationStatus("abc-123", "sent");
 * 
 * // Failure case
 * await updateNotificationStatus("abc-123", "failed", "InvalidEmail: Email address is malformed");
 * ```
 */
export async function updateNotificationStatus(
  notificationId: string,
  status: NotificationStatus,
  errorMessage?: string
): Promise<void> {
  const now = new Date().toISOString();
  const timestampField =
    status === 'sent' ? 'sent' : status === 'delivered' ? 'delivered' : 'failed';

  const updateExpression = errorMessage
    ? 'SET #status = :status, #updatedAt = :updatedAt, #timestamps.#tsField = :timestamp, #errorMessage = :error, #attempts = if_not_exists(#attempts, :zero) + :one'
    : 'SET #status = :status, #updatedAt = :updatedAt, #timestamps.#tsField = :timestamp, #attempts = if_not_exists(#attempts, :zero) + :one';

  const expressionAttributeNames: Record<string, string> = {
    '#status': 'status',
    '#updatedAt': 'updatedAt',
    '#timestamps': 'timestamps',
    '#tsField': timestampField,
    '#attempts': 'attempts',
  };

  const expressionAttributeValues: Record<string, unknown> = {
    ':status': status,
    ':updatedAt': now,
    ':timestamp': now,
    ':zero': 0,
    ':one': 1,
  };

  if (errorMessage) {
    expressionAttributeNames['#errorMessage'] = 'errorMessage';
    expressionAttributeValues[':error'] = errorMessage;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: NOTIFICATION_RECORDS_TABLE,
      Key: { notificationId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );

  logger.info('Notification status updated', {
    notificationId,
    status,
    errorMessage,
  });
}

/**
 * Get customer notification preferences, creating defaults if none exist.
 * 
 * Returns opt-out preferences for all channels and preferred channel list.
 * If no preferences record exists for the customer, creates a default record
 * with all channels enabled (no opt-outs).
 * 
 * ## Default Preferences
 * New customers start with:
 * - All channels enabled (emailOptOut, smsOptOut, pushOptOut = false)
 * - Empty preferred channels list (all channels equally weighted)
 * - Current timestamp
 * 
 * @param customerId - Unique customer identifier
 * @returns Customer preferences (existing or newly created defaults)
 * @throws DynamoDB client errors
 * 
 * @example
 * ```typescript
 * const prefs = await getCustomerPreferences("user-123");
 * console.log(`Email opt-out: ${prefs.emailOptOut}`);
 * console.log(`Preferred channels: ${prefs.preferredChannels.join(", ")}`);
 * ```
 */
export async function getCustomerPreferences(
  customerId: string
): Promise<CustomerPreferences> {
  const response = await docClient.send(
    new GetCommand({
      TableName: CUSTOMER_PREFERENCES_TABLE,
      Key: { customerId },
    })
  );

  // Return defaults if no preferences exist
  if (!response.Item) {
    const defaults: CustomerPreferences = {
      customerId,
      emailOptOut: false,
      smsOptOut: false,
      pushOptOut: false,
      preferredChannels: [],
      updatedAt: new Date().toISOString(),
    };

    // Create default preferences record
    await docClient.send(
      new PutCommand({
        TableName: CUSTOMER_PREFERENCES_TABLE,
        Item: defaults,
      })
    );

    return defaults;
  }

  return response.Item as CustomerPreferences;
}

/**
 * Update a customer's opt-out preference for a specific channel.
 * 
 * Allows customers to opt out (or back in) for email, SMS, or push notifications.
 * When a customer is opted out of a channel, notifications sent to that channel
 * will be suppressed automatically by the notification processor.
 * 
 * ## Use Cases
 * - Customer clicks "unsubscribe" in email → set emailOptOut = true
 * - Customer replies "STOP" to SMS → set smsOptOut = true
 * - Customer disables push in app settings → set pushOptOut = true
 * - Customer re-enables channel → set optOut = false
 * 
 * @param customerId - Unique customer identifier
 * @param channel - Channel to update ('email', 'sms', or 'push')
 * @param optOut - True to opt out (suppress notifications), false to opt in
 * @throws DynamoDB update errors
 * 
 * @example
 * ```typescript
 * // Customer unsubscribes from email
 * await updateOptOutPreference("user-123", "email", true);
 * 
 * // Customer re-enables SMS
 * await updateOptOutPreference("user-123", "sms", false);
 * ```
 */
export async function updateOptOutPreference(
  customerId: string,
  channel: 'email' | 'sms' | 'push',
  optOut: boolean
): Promise<void> {
  const fieldName = `${channel}OptOut`;
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: CUSTOMER_PREFERENCES_TABLE,
      Key: { customerId },
      UpdateExpression: 'SET #field = :optOut, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#field': fieldName,
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':optOut': optOut,
        ':updatedAt': now,
      },
    })
  );

  logger.info('Customer opt-out preference updated', {
    customerId,
    channel,
    optOut,
  });
}
