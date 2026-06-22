/**
 * Integration tests for Payment Idempotency
 * Tests duplicate orderId submissions and concurrent requests
 * **Validates: Requirements 3.4, 28.1 (payment-processor integration tests - idempotency)**
 */

// Mock AWS services BEFORE importing modules
const mockSecretsSend = jest.fn();
const mockKmsSend = jest.fn();
const mockDynamoSend = jest.fn();
const mockStripeChargesCreate = jest.fn();

class MockStripeError extends Error {
  constructor(message: string, public type: string, public code?: string) {
    super(message);
    this.name = 'StripeError';
  }
}

const mockStripe = {
  charges: {
    create: mockStripeChargesCreate,
  },
};

// Mock ConditionalCheckFailedException
class MockConditionalCheckFailedException extends Error {
  constructor() {
    super('The conditional request failed');
    this.name = 'ConditionalCheckFailedException';
  }
}

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: mockSecretsSend,
  })),
  GetSecretValueCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-kms', () => ({
  KMSClient: jest.fn().mockImplementation(() => ({
    send: mockKmsSend,
  })),
  EncryptCommand: jest.fn(),
  DecryptCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: mockDynamoSend,
  })),
  ConditionalCheckFailedException: MockConditionalCheckFailedException,
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockReturnValue({
      send: mockDynamoSend,
    }),
  },
  PutCommand: jest.fn(),
  GetCommand: jest.fn(),
  QueryCommand: jest.fn(),
}));

jest.mock('stripe', () => {
  const MockStripeConstructor = jest.fn().mockImplementation(() => mockStripe) as any;
  MockStripeConstructor.errors = {
    StripeError: MockStripeError,
  };
  return MockStripeConstructor;
});

import { processPayment } from '../../src/payment-service';
import { PaymentRequest } from '../../src/types';

describe('Payment Idempotency Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default Secrets Manager mock
    mockSecretsSend.mockResolvedValue({
      SecretString: 'sk_test_mock_key_12345',
    });
  });

  describe('Duplicate orderId Submissions', () => {
    it('should return same paymentId for duplicate orderId submissions', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 2500,
        currency: 'usd',
        orderId: 'order_idempotency_001',
        metadata: {
          customerEmail: 'idempotent@example.com',
          orderDescription: 'Idempotency test',
        },
      };

      // First request - successful payment
      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_idempotent_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/idempotent',
      });

      mockKmsSend
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_4242') })
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_email') });

      // First DynamoDB put succeeds
      mockDynamoSend.mockResolvedValueOnce({});

      const result1 = await processPayment(request);

      // Second request with same orderId - DynamoDB conditional check fails
      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_idempotent_001', // Stripe returns same charge due to idempotency key
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/idempotent',
      });

      mockKmsSend
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_4242') })
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_email') });

      // Second DynamoDB put fails with ConditionalCheckFailedException
      mockDynamoSend
        .mockRejectedValueOnce(new MockConditionalCheckFailedException())
        // Then QueryCommand to get existing record
        .mockResolvedValueOnce({
          Items: [
            {
              paymentId: result1.paymentId,
              orderId: 'order_idempotency_001',
              stripeChargeId: 'ch_idempotent_001',
              amount: 2500,
              currency: 'usd',
              status: 'succeeded',
              cardLastFour: 'encrypted_4242',
              customerEmail: 'encrypted_email',
              metadata: {},
              createdAt: result1.createdAt,
              updatedAt: result1.createdAt,
              ttl: 1234567890,
            },
          ],
        });

      const result2 = await processPayment(request);

      // Both requests should return the same paymentId
      expect(result2.paymentId).toBe(result1.paymentId);
      expect(result2.stripeChargeId).toBe(result1.stripeChargeId);
      expect(result2.amount).toBe(result1.amount);
      expect(result2.currency).toBe(result1.currency);
      expect(result2.status).toBe(result1.status);

      // Verify Stripe was called twice with same idempotency key
      expect(mockStripeChargesCreate).toHaveBeenCalledTimes(2);
      expect(mockStripeChargesCreate).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        expect.objectContaining({
          idempotencyKey: 'order_idempotency_001',
        })
      );
      expect(mockStripeChargesCreate).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        expect.objectContaining({
          idempotencyKey: 'order_idempotency_001',
        })
      );
    });

    it('should handle rapid duplicate submissions without data corruption', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 5000,
        currency: 'usd',
        orderId: 'order_rapid_001',
        metadata: {
          customerEmail: 'rapid@example.com',
          orderDescription: 'Rapid submission test',
        },
      };

      // Mock Stripe to return same charge for idempotency
      mockStripeChargesCreate.mockResolvedValue({
        id: 'ch_rapid_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '5555' },
        },
        receipt_url: 'https://stripe.com/receipt/rapid',
      });

      mockKmsSend.mockResolvedValue({
        CiphertextBlob: Buffer.from('encrypted_data'),
      });

      // First request succeeds, subsequent ones get conditional check failure
      let callCount = 0;
      mockDynamoSend.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First put succeeds
          return Promise.resolve({});
        } else if (callCount % 2 === 0) {
          // Even calls: conditional check fails
          return Promise.reject(new MockConditionalCheckFailedException());
        } else {
          // Odd calls: query returns first payment
          return Promise.resolve({
            Items: [
              {
                paymentId: 'pay_rapid_first',
                orderId: 'order_rapid_001',
                stripeChargeId: 'ch_rapid_001',
                amount: 5000,
                currency: 'usd',
                status: 'succeeded',
                cardLastFour: 'encrypted_5555',
                customerEmail: 'encrypted_rapid',
                metadata: {},
                createdAt: '2024-01-15T10:00:00.000Z',
                updatedAt: '2024-01-15T10:00:00.000Z',
                ttl: 1234567890,
              },
            ],
          });
        }
      });

      const result1 = await processPayment(request);
      const result2 = await processPayment(request);
      const result3 = await processPayment(request);

      // First result creates a new payment
      expect(result1.paymentId).toBeTruthy();
      expect(result1.stripeChargeId).toBe('ch_rapid_001');

      // Subsequent results return existing payment
      expect(result2.paymentId).toBe('pay_rapid_first');
      expect(result2.stripeChargeId).toBe('ch_rapid_001');

      expect(result3.paymentId).toBe('pay_rapid_first');
      expect(result3.stripeChargeId).toBe('ch_rapid_001');
    });
  });

  describe('Stripe Idempotency Key Usage', () => {
    it('should use orderId as Stripe idempotency key', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_stripe_idem_001',
        metadata: {
          customerEmail: 'stripeidem@example.com',
          orderDescription: 'Stripe idempotency test',
        },
      };

      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_stripe_idem_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/stripe_idem',
      });

      mockKmsSend
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_4242') })
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_email') });

      mockDynamoSend.mockResolvedValueOnce({});

      await processPayment(request);

      // Verify idempotency key matches orderId
      expect(mockStripeChargesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1000,
          currency: 'usd',
          source: 'tok_visa',
        }),
        expect.objectContaining({
          idempotencyKey: 'order_stripe_idem_001',
        })
      );
    });

    it('should ensure different orderIds use different Stripe idempotency keys', async () => {
      const request1: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_unique_001',
        metadata: {
          customerEmail: 'unique1@example.com',
          orderDescription: 'Unique order 1',
        },
      };

      const request2: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_unique_002',
        metadata: {
          customerEmail: 'unique2@example.com',
          orderDescription: 'Unique order 2',
        },
      };

      mockStripeChargesCreate
        .mockResolvedValueOnce({
          id: 'ch_unique_001',
          status: 'succeeded',
          payment_method_details: { card: { last4: '4242' } },
          receipt_url: 'https://stripe.com/receipt/1',
        })
        .mockResolvedValueOnce({
          id: 'ch_unique_002',
          status: 'succeeded',
          payment_method_details: { card: { last4: '4242' } },
          receipt_url: 'https://stripe.com/receipt/2',
        });

      mockKmsSend.mockResolvedValue({
        CiphertextBlob: Buffer.from('encrypted'),
      });

      mockDynamoSend.mockResolvedValue({});

      await processPayment(request1);
      await processPayment(request2);

      // Verify different idempotency keys
      expect(mockStripeChargesCreate).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        expect.objectContaining({
          idempotencyKey: 'order_unique_001',
        })
      );

      expect(mockStripeChargesCreate).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        expect.objectContaining({
          idempotencyKey: 'order_unique_002',
        })
      );
    });
  });

  describe('DynamoDB Conditional Write for orderId Uniqueness', () => {
    it('should use conditional write to prevent duplicate orderId entries', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 3000,
        currency: 'usd',
        orderId: 'order_conditional_001',
        metadata: {
          customerEmail: 'conditional@example.com',
          orderDescription: 'Conditional write test',
        },
      };

      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_conditional_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/conditional',
      });

      mockKmsSend
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_4242') })
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_email') });

      mockDynamoSend.mockResolvedValueOnce({});

      await processPayment(request);

      // Verify PutCommand was called (mocked via mockDynamoSend)
      expect(mockDynamoSend).toHaveBeenCalled();
    });

    it('should retrieve existing payment when conditional write fails', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 2000,
        currency: 'usd',
        orderId: 'order_retrieve_existing_001',
        metadata: {
          customerEmail: 'existing@example.com',
          orderDescription: 'Retrieve existing test',
        },
      };

      const existingPaymentId = 'pay_existing_001';
      const existingChargeId = 'ch_existing_001';
      const existingCreatedAt = '2024-01-15T09:00:00.000Z';

      mockStripeChargesCreate.mockResolvedValueOnce({
        id: existingChargeId,
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/existing',
      });

      mockKmsSend
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_4242') })
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_email') });

      // DynamoDB put fails, then query returns existing record
      mockDynamoSend
        .mockRejectedValueOnce(new MockConditionalCheckFailedException())
        .mockResolvedValueOnce({
          Items: [
            {
              paymentId: existingPaymentId,
              orderId: 'order_retrieve_existing_001',
              stripeChargeId: existingChargeId,
              amount: 2000,
              currency: 'usd',
              status: 'succeeded',
              cardLastFour: 'encrypted_4242',
              customerEmail: 'encrypted_existing',
              metadata: {},
              createdAt: existingCreatedAt,
              updatedAt: existingCreatedAt,
              ttl: 1234567890,
            },
          ],
        });

      const result = await processPayment(request);

      expect(result.paymentId).toBe(existingPaymentId);
      expect(result.stripeChargeId).toBe(existingChargeId);
      expect(result.createdAt).toBe(existingCreatedAt);

      // Verify query was called to retrieve existing payment
      expect(mockDynamoSend).toHaveBeenCalledTimes(2); // Put + Query
    });
  });

  describe('Concurrent Request Scenarios', () => {
    it('should handle concurrent payments with same orderId gracefully', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 4000,
        currency: 'usd',
        orderId: 'order_concurrent_001',
        metadata: {
          customerEmail: 'concurrent@example.com',
          orderDescription: 'Concurrent test',
        },
      };

      const firstPaymentId = 'pay_concurrent_first';

      // Both requests get same Stripe charge (idempotency key)
      mockStripeChargesCreate.mockResolvedValue({
        id: 'ch_concurrent_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/concurrent',
      });

      mockKmsSend.mockResolvedValue({
        CiphertextBlob: Buffer.from('encrypted'),
      });

      // First request succeeds, second fails conditional check
      mockDynamoSend
        .mockResolvedValueOnce({}) // First put succeeds
        .mockRejectedValueOnce(new MockConditionalCheckFailedException()) // Second put fails
        .mockResolvedValueOnce({
          // Query for existing
          Items: [
            {
              paymentId: firstPaymentId,
              orderId: 'order_concurrent_001',
              stripeChargeId: 'ch_concurrent_001',
              amount: 4000,
              currency: 'usd',
              status: 'succeeded',
              cardLastFour: 'encrypted_4242',
              customerEmail: 'encrypted_concurrent',
              metadata: {},
              createdAt: '2024-01-15T10:00:00.000Z',
              updatedAt: '2024-01-15T10:00:00.000Z',
              ttl: 1234567890,
            },
          ],
        });

      // Simulate concurrent requests
      const [result1, result2] = await Promise.all([
        processPayment(request),
        processPayment(request),
      ]);

      // Both should return valid payment IDs
      expect(result1.paymentId).toBeTruthy();
      expect(result2.paymentId).toBeTruthy();

      // At least one should be the first payment ID
      const paymentIds = [result1.paymentId, result2.paymentId];
      expect(paymentIds).toContain(firstPaymentId);

      // Both should have same charge ID
      expect(result1.stripeChargeId).toBe('ch_concurrent_001');
      expect(result2.stripeChargeId).toBe('ch_concurrent_001');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing record after ConditionalCheckFailedException', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1500,
        currency: 'usd',
        orderId: 'order_missing_record_001',
        metadata: {
          customerEmail: 'missing@example.com',
          orderDescription: 'Missing record test',
        },
      };

      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_missing_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/missing',
      });

      mockKmsSend
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_4242') })
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_email') });

      // Conditional check fails but query returns no items (edge case)
      mockDynamoSend
        .mockRejectedValueOnce(new MockConditionalCheckFailedException())
        .mockResolvedValueOnce({
          Items: [], // No record found
        });

      // The error is wrapped in PaymentError with generic message
      await expect(processPayment(request)).rejects.toThrow(
        'Payment processing failed. Please try again.'
      );
    });
  });
});
