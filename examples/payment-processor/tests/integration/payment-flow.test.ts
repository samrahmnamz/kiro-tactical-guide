/**
 * Integration tests for Payment Processing Flow
 * Tests happy path scenarios with Stripe and AWS service integration
 * **Validates: Requirements 3.4, 28.1 (payment-processor integration tests)**
 */

// Mock AWS services BEFORE importing modules
const mockSecretsSend = jest.fn();
const mockKmsSend = jest.fn();
const mockDynamoSend = jest.fn();
const mockStripeChargesCreate = jest.fn();

// Create Stripe mock
const mockStripe = {
  charges: {
    create: mockStripeChargesCreate,
  },
};

class MockStripeError extends Error {
  constructor(message: string, public type: string, public code: string) {
    super(message);
    this.name = 'StripeError';
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
  ConditionalCheckFailedException: class ConditionalCheckFailedException extends Error {
    constructor() {
      super('Conditional check failed');
      this.name = 'ConditionalCheckFailedException';
    }
  },
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

import { processPayment, retrievePayment } from '../../src/payment-service';
import { PaymentRequest } from '../../src/types';

describe('Payment Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default Secrets Manager mock
    mockSecretsSend.mockResolvedValue({
      SecretString: 'sk_test_mock_key_12345',
    });
  });

  describe('Happy Path - Successful Payment Processing', () => {
    it('should process a complete payment successfully from request to storage', async () => {
      // Arrange
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 2500,
        currency: 'usd',
        orderId: 'order_happy_path_001',
        metadata: {
          customerEmail: 'customer@example.com',
          orderDescription: 'Happy path test order',
        },
      };

      // Mock Stripe charge creation
      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_happy_path_123',
        status: 'succeeded',
        payment_method_details: {
          card: {
            last4: '4242',
          },
        },
        receipt_url: 'https://stripe.com/receipts/payment_happy_path',
      });

      // Mock KMS encryption for sensitive fields
      mockKmsSend
        .mockResolvedValueOnce({
          CiphertextBlob: Buffer.from('encrypted_4242'),
        })
        .mockResolvedValueOnce({
          CiphertextBlob: Buffer.from('encrypted_customer@example.com'),
        });

      // Mock DynamoDB put
      mockDynamoSend.mockResolvedValueOnce({});

      // Act
      const result = await processPayment(request);

      // Assert
      expect(result).toMatchObject({
        paymentId: expect.any(String),
        stripeChargeId: 'ch_happy_path_123',
        status: 'succeeded',
        amount: 2500,
        currency: 'usd',
        receiptUrl: 'https://stripe.com/receipts/payment_happy_path',
        createdAt: expect.any(String),
      });

      // Verify Stripe was called with idempotency key
      expect(mockStripeChargesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2500,
          currency: 'usd',
          source: 'tok_visa',
          description: 'Happy path test order',
        }),
        expect.objectContaining({
          idempotencyKey: 'order_happy_path_001',
        })
      );

      // Verify encryption was called for sensitive fields
      expect(mockKmsSend).toHaveBeenCalledTimes(2);
    });

    it('should handle multi-currency payment (EUR)', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 5000,
        currency: 'eur',
        orderId: 'order_eur_001',
        metadata: {
          customerEmail: 'eu.customer@example.com',
          orderDescription: 'EUR payment test',
        },
      };

      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_eur_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '5555' },
        },
        receipt_url: 'https://stripe.com/receipt/eur',
      });

      mockKmsSend
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_5555') })
        .mockResolvedValueOnce({
          CiphertextBlob: Buffer.from('enc_eu.customer@example.com'),
        });

      mockDynamoSend.mockResolvedValueOnce({});

      const result = await processPayment(request);

      expect(result.currency).toBe('eur');
      expect(result.amount).toBe(5000);
      expect(mockStripeChargesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'eur',
        }),
        expect.any(Object)
      );
    });

    it('should handle large payment amounts correctly', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 999999, // $9,999.99
        currency: 'usd',
        orderId: 'order_large_001',
        metadata: {
          customerEmail: 'whale@example.com',
          orderDescription: 'Large payment test',
        },
      };

      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_large_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/large',
      });

      mockKmsSend
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_4242') })
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_whale') });

      mockDynamoSend.mockResolvedValueOnce({});

      const result = await processPayment(request);

      expect(result.amount).toBe(999999);
      expect(result.status).toBe('succeeded');
    });
  });

  describe('Payment Retrieval', () => {
    it('should retrieve and decrypt payment details correctly', async () => {
      const paymentId = 'pay_retrieve_001';

      // Mock DynamoDB retrieval
      mockDynamoSend.mockResolvedValueOnce({
        Item: {
          paymentId,
          orderId: 'order_123',
          stripeChargeId: 'ch_123',
          amount: 2500,
          currency: 'usd',
          status: 'succeeded',
          cardLastFour: 'encrypted_4242',
          customerEmail: 'encrypted_email',
          metadata: {},
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
          ttl: 1234567890,
        },
      });

      // Mock KMS decryption
      mockKmsSend
        .mockResolvedValueOnce({
          Plaintext: Buffer.from('4242'),
        })
        .mockResolvedValueOnce({
          Plaintext: Buffer.from('customer@example.com'),
        });

      const result = await retrievePayment(paymentId);

      expect(result).toEqual({
        paymentId,
        orderId: 'order_123',
        status: 'succeeded',
        amount: 2500,
        currency: 'usd',
        lastFourDigits: '4242',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      });

      // Verify decryption was called
      expect(mockKmsSend).toHaveBeenCalledTimes(2);
    });

    it('should throw error when payment not found', async () => {
      mockDynamoSend.mockResolvedValueOnce({
        Item: undefined,
      });

      await expect(retrievePayment('pay_nonexistent')).rejects.toThrow(
        'Payment not found'
      );
    });
  });

  describe('Pending Payment Status', () => {
    it('should handle pending payment status from Stripe', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_pending',
        amount: 1500,
        currency: 'usd',
        orderId: 'order_pending_001',
        metadata: {
          customerEmail: 'pending@example.com',
          orderDescription: 'Pending payment test',
        },
      };

      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_pending_001',
        status: 'pending',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: null,
      });

      mockKmsSend
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_4242') })
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_pending') });

      mockDynamoSend.mockResolvedValueOnce({});

      const result = await processPayment(request);

      expect(result.status).toBe('pending');
      expect(result.receiptUrl).toBe('');
    });
  });
});
