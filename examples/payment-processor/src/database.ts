/**
 * DynamoDB operations for payment records
 * Includes encryption for sensitive fields
 */

import {
  DynamoDBClient,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { PaymentRecord } from './types';
import { encrypt, decrypt } from './encryption';
import { logger } from './logger';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'PaymentRecords';
const KMS_KEY_ID = process.env.KMS_KEY_ID || 'alias/payment-processor-encryption';

// 7 years in seconds (PCI DSS requirement)
const SEVEN_YEARS_SECONDS = 7 * 365 * 24 * 60 * 60;

/**
 * Create a payment record in DynamoDB
 * Encrypts sensitive fields before storage
 */
export async function createPaymentRecord(
  orderId: string,
  stripeChargeId: string,
  amount: number,
  currency: string,
  status: string,
  cardLastFour: string,
  customerEmail: string,
  metadata: Record<string, string>
): Promise<PaymentRecord> {
  const paymentId = uuidv4();
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + SEVEN_YEARS_SECONDS;

  // Encrypt sensitive fields
  const encryptedCardLastFour = await encrypt(cardLastFour, KMS_KEY_ID);
  const encryptedEmail = await encrypt(customerEmail, KMS_KEY_ID);

  const record: PaymentRecord = {
    paymentId,
    orderId,
    stripeChargeId,
    amount,
    currency,
    status,
    cardLastFour: encryptedCardLastFour,
    customerEmail: encryptedEmail,
    metadata,
    createdAt: now,
    updatedAt: now,
    ttl,
  };

  try {
    // Use conditional write to ensure orderId uniqueness (idempotency)
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: record,
        ConditionExpression: 'attribute_not_exists(orderId)',
      })
    );

    logger.info('Payment record created', {
      paymentId,
      orderId,
      amount,
      currency,
      status,
    });

    return record;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      // Idempotency: orderId already exists, retrieve existing record
      logger.info('Payment record already exists for orderId', { orderId });
      const existing = await getPaymentByOrderId(orderId);
      if (!existing) {
        throw new Error('Idempotency check failed but record not found');
      }
      return existing;
    }

    logger.error('Failed to create payment record', {
      error: error instanceof Error ? error.message : 'Unknown error',
      orderId,
    });

    throw error;
  }
}

/**
 * Get payment record by paymentId
 */
export async function getPaymentRecord(
  paymentId: string
): Promise<PaymentRecord | null> {
  try {
    const response = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { paymentId },
      })
    );

    if (!response.Item) {
      return null;
    }

    return response.Item as PaymentRecord;
  } catch (error) {
    logger.error('Failed to get payment record', {
      error: error instanceof Error ? error.message : 'Unknown error',
      paymentId,
    });

    throw error;
  }
}

/**
 * Get payment record by orderId (using GSI)
 */
export async function getPaymentByOrderId(
  orderId: string
): Promise<PaymentRecord | null> {
  try {
    const response = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'OrderIdIndex',
        KeyConditionExpression: 'orderId = :orderId',
        ExpressionAttributeValues: {
          ':orderId': orderId,
        },
        Limit: 1,
      })
    );

    if (!response.Items || response.Items.length === 0) {
      return null;
    }

    return response.Items[0] as PaymentRecord;
  } catch (error) {
    logger.error('Failed to get payment by orderId', {
      error: error instanceof Error ? error.message : 'Unknown error',
      orderId,
    });

    throw error;
  }
}

/**
 * Decrypt sensitive fields in a payment record
 */
export async function decryptPaymentRecord(
  record: PaymentRecord
): Promise<PaymentRecord> {
  return {
    ...record,
    cardLastFour: await decrypt(record.cardLastFour),
    customerEmail: await decrypt(record.customerEmail),
  };
}
