/**
 * Payment processing service with Stripe integration
 * Implements PCI DSS compliant payment processing
 */

import Stripe from 'stripe';
import { PaymentRequest, PaymentResponse, PaymentRetrievalResponse } from './types';
import {
  createPaymentRecord,
  getPaymentRecord,
  decryptPaymentRecord,
} from './database';
import { getSecret } from './secrets';
import { logger, maskEmail } from './logger';

let stripeClient: Stripe | null = null;

/**
 * Initialize Stripe client with API key from Secrets Manager
 */
async function getStripeClient(): Promise<Stripe> {
  if (stripeClient) {
    return stripeClient;
  }

  // Load Stripe API key from Secrets Manager (never hardcoded)
  const secretName =
    process.env.SECRETS_MANAGER_SECRET_NAME || 'payment-processor/stripe-api-key';

  let apiKey: string;

  // In development, allow loading from environment variable
  // In production, always use Secrets Manager
  if (process.env.NODE_ENV === 'development' && process.env.STRIPE_API_KEY) {
    apiKey = process.env.STRIPE_API_KEY;
    logger.warn('Using Stripe API key from environment variable (dev only)');
  } else {
    apiKey = await getSecret(secretName);
  }

  stripeClient = new Stripe(apiKey, {
    apiVersion: '2023-08-16', // Pin API version (latest supported by stripe v13.0.0)
    typescript: true,
  });

  return stripeClient;
}

/**
 * Process a payment using Stripe
 * 
 * Implements:
 * - Idempotency (same orderId = same payment)
 * - Encryption of sensitive data before DynamoDB storage
 * - PII scrubbing in logs
 * - Error handling with user-friendly messages
 */
export async function processPayment(
  request: PaymentRequest
): Promise<PaymentResponse> {
  const { stripeToken, amount, currency, orderId, metadata } = request;

  // Validate input
  if (!stripeToken || !amount || !currency || !orderId) {
    throw new Error('Missing required fields');
  }

  if (amount <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  logger.info('Processing payment', {
    orderId,
    amount,
    currency,
    customerEmail: maskEmail(metadata.customerEmail),
  });

  try {
    const stripe = await getStripeClient();

    // Create charge with idempotency key based on orderId
    const charge = await stripe.charges.create(
      {
        amount,
        currency,
        source: stripeToken,
        description: metadata.orderDescription,
        metadata: {
          orderId,
          customerEmail: metadata.customerEmail,
        },
      },
      {
        idempotencyKey: orderId, // Ensure idempotency
      }
    );

    logger.info('Stripe charge created', {
      chargeId: charge.id,
      orderId,
      status: charge.status,
    });

    // Extract card last four digits from charge
    const cardLastFour = charge.payment_method_details?.card?.last4 || '0000';

    // Store payment record in DynamoDB (with encryption)
    const paymentRecord = await createPaymentRecord(
      orderId,
      charge.id,
      amount,
      currency,
      charge.status,
      cardLastFour,
      metadata.customerEmail,
      metadata as Record<string, string>
    );

    const response: PaymentResponse = {
      paymentId: paymentRecord.paymentId,
      stripeChargeId: charge.id,
      status: mapStripeStatus(charge.status),
      amount,
      currency,
      receiptUrl: charge.receipt_url || '',
      createdAt: paymentRecord.createdAt,
    };

    logger.info('Payment processed successfully', {
      paymentId: response.paymentId,
      orderId,
      status: response.status,
    });

    return response;
  } catch (error) {
    logger.error('Payment processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      orderId,
    });

    // Map Stripe errors to user-friendly messages
    if (error instanceof Stripe.errors.StripeError) {
      throw new PaymentError(
        mapStripeErrorCode(error.code),
        mapStripeErrorMessage(error.message)
      );
    }

    throw new PaymentError(
      'processing_error',
      'Payment processing failed. Please try again.'
    );
  }
}

/**
 * Retrieve payment details by paymentId
 * Decrypts sensitive fields for response
 */
export async function retrievePayment(
  paymentId: string
): Promise<PaymentRetrievalResponse> {
  logger.info('Retrieving payment', { paymentId });

  const record = await getPaymentRecord(paymentId);

  if (!record) {
    throw new PaymentError('not_found', 'Payment not found');
  }

  // Decrypt sensitive fields
  const decrypted = await decryptPaymentRecord(record);

  return {
    paymentId: decrypted.paymentId,
    orderId: decrypted.orderId,
    status: decrypted.status,
    amount: decrypted.amount,
    currency: decrypted.currency,
    lastFourDigits: decrypted.cardLastFour,
    createdAt: decrypted.createdAt,
    updatedAt: decrypted.updatedAt,
  };
}

/**
 * Map Stripe charge status to our status enum
 */
function mapStripeStatus(
  stripeStatus: string
): 'succeeded' | 'pending' | 'failed' {
  switch (stripeStatus) {
    case 'succeeded':
      return 'succeeded';
    case 'pending':
      return 'pending';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

/**
 * Map Stripe error codes to user-friendly codes
 */
function mapStripeErrorCode(code: string | undefined): string {
  const errorCodeMap: Record<string, string> = {
    card_declined: 'card_declined',
    expired_card: 'card_declined',
    insufficient_funds: 'card_declined',
    incorrect_cvc: 'card_declined',
    processing_error: 'processing_error',
    incorrect_number: 'invalid_token',
    invalid_expiry_month: 'invalid_token',
    invalid_expiry_year: 'invalid_token',
    rate_limit: 'rate_limit',
  };

  return errorCodeMap[code || ''] || 'processing_error';
}

/**
 * Map Stripe error messages to user-friendly messages
 * Never expose internal details to users
 */
function mapStripeErrorMessage(message: string): string {
  if (message.toLowerCase().includes('declined')) {
    return 'Payment method declined. Please use a different card.';
  }

  if (message.toLowerCase().includes('insufficient')) {
    return 'Insufficient funds. Please use a different card.';
  }

  if (message.toLowerCase().includes('expired')) {
    return 'Card has expired. Please use a different card.';
  }

  if (message.toLowerCase().includes('invalid')) {
    return 'Invalid payment token. Please try again.';
  }

  // Generic message for any other errors (don't expose internals)
  return 'Payment processing failed. Please try again.';
}

/**
 * Custom error class for payment errors
 */
export class PaymentError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}
