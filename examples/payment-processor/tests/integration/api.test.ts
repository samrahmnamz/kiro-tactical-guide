/**
 * Integration tests for Payment API
 * Tests the full request/response cycle
 * **Validates: Requirements 3.4 (payment processor tests)**
 */

// Mock AWS services BEFORE importing app
const mockSecretsSend = jest.fn();
const mockKmsSend = jest.fn();
const mockDynamoSend = jest.fn();
const mockStripeChargesCreate = jest.fn();

// Create a proper mock Stripe module
const mockStripe = {
  charges: {
    create: mockStripeChargesCreate,
  },
};

// Create MockStripeError that will work with instanceof checks
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
  
  // Attach errors namespace
  MockStripeConstructor.errors = {
    StripeError: MockStripeError,
  };
  
  return MockStripeConstructor;
});

import request from 'supertest';
import app from '../../src/index';
import Stripe from 'stripe';

describe('Payment API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock for Secrets Manager
    mockSecretsSend.mockResolvedValue({
      SecretString: 'sk_test_mock_key_12345',
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('POST /api/payments', () => {
    it('should return validation error for missing fields', async () => {
      const response = await request(app)
        .post('/api/payments')
        .send({
          amount: 1999,
          currency: 'usd',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('validation_error');
    });

    it('should return validation error for missing metadata', async () => {
      const response = await request(app)
        .post('/api/payments')
        .send({
          stripeToken: 'tok_visa',
          amount: 1999,
          currency: 'usd',
          orderId: 'order_123',
          metadata: {
            customerEmail: 'test@example.com',
            // Missing orderDescription
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('validation_error');
    });

    it('should process successful payment end-to-end', async () => {
      // Mock Stripe charge
      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_integration_123',
        status: 'succeeded',
        payment_method_details: {
          card: {
            last4: '4242',
          },
        },
        receipt_url: 'https://stripe.com/receipt/integration',
      });

      // Mock KMS encryption
      mockKmsSend.mockResolvedValueOnce({
        CiphertextBlob: Buffer.from('encrypted_4242'),
      });
      mockKmsSend.mockResolvedValueOnce({
        CiphertextBlob: Buffer.from('encrypted_email'),
      });

      // Mock DynamoDB put
      mockDynamoSend.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/api/payments')
        .send({
          stripeToken: 'tok_visa',
          amount: 2500,
          currency: 'usd',
          orderId: 'order_integration_123',
          metadata: {
            customerEmail: 'integration@example.com',
            orderDescription: 'Integration test order',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        paymentId: expect.any(String),
        stripeChargeId: 'ch_integration_123',
        status: 'succeeded',
        amount: 2500,
        currency: 'usd',
        receiptUrl: 'https://stripe.com/receipt/integration',
        createdAt: expect.any(String),
      });

      // Verify Stripe was called correctly
      expect(mockStripeChargesCreate).toHaveBeenCalledWith(
        {
          amount: 2500,
          currency: 'usd',
          source: 'tok_visa',
          description: 'Integration test order',
          metadata: {
            orderId: 'order_integration_123',
            customerEmail: 'integration@example.com',
          },
        },
        {
          idempotencyKey: 'order_integration_123',
        }
      );
    });

    it('should handle card declined errors', async () => {
      const stripeError = new (Stripe.errors.StripeError as any)();
      stripeError.message = 'Your card was declined';
      stripeError.type = 'StripeCardError';
      stripeError.code = 'card_declined';

      mockStripeChargesCreate.mockRejectedValueOnce(stripeError);

      const response = await request(app)
        .post('/api/payments')
        .send({
          stripeToken: 'tok_chargeDeclined',
          amount: 1999,
          currency: 'usd',
          orderId: 'order_declined',
          metadata: {
            customerEmail: 'test@example.com',
            orderDescription: 'Test order',
          },
        });

      expect(response.status).toBe(402);
      expect(response.body.error).toMatchObject({
        code: 'card_declined',
        message: expect.stringContaining('declined'),
      });
    });

    it('should handle insufficient funds errors', async () => {
      const stripeError = new (Stripe.errors.StripeError as any)();
      stripeError.message = 'Insufficient funds';
      stripeError.type = 'StripeCardError';
      stripeError.code = 'insufficient_funds';

      mockStripeChargesCreate.mockRejectedValueOnce(stripeError);

      const response = await request(app)
        .post('/api/payments')
        .send({
          stripeToken: 'tok_insufficientFunds',
          amount: 999999,
          currency: 'usd',
          orderId: 'order_insufficient',
          metadata: {
            customerEmail: 'test@example.com',
            orderDescription: 'Test order',
          },
        });

      expect(response.status).toBe(402);
      expect(response.body.error.code).toBe('card_declined');
    });

    it('should handle zero amount validation', async () => {
      const response = await request(app)
        .post('/api/payments')
        .send({
          stripeToken: 'tok_visa',
          amount: 0,
          currency: 'usd',
          orderId: 'order_zero',
          metadata: {
            customerEmail: 'test@example.com',
            orderDescription: 'Test order',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('validation_error');
    });

    it('should handle negative amount validation', async () => {
      const response = await request(app)
        .post('/api/payments')
        .send({
          stripeToken: 'tok_visa',
          amount: -100,
          currency: 'usd',
          orderId: 'order_negative',
          metadata: {
            customerEmail: 'test@example.com',
            orderDescription: 'Test order',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('validation_error');
      expect(response.body.error.message).toContain('greater than zero');
    });
  });

  describe('GET /api/payments/:paymentId', () => {
    it('should return validation error for missing payment ID', async () => {
      const response = await request(app).get('/api/payments/');

      expect(response.status).toBe(404);
    });

    it('should retrieve payment by ID successfully', async () => {
      const mockPaymentRecord = {
        paymentId: 'pay_retrieve_123',
        orderId: 'order_123',
        stripeChargeId: 'ch_stripe_123',
        amount: 1999,
        currency: 'usd',
        status: 'succeeded',
        cardLastFour: 'encrypted_4242',
        customerEmail: 'encrypted_email',
        metadata: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        ttl: 123456789,
      };

      // Mock DynamoDB get
      mockDynamoSend.mockResolvedValueOnce({
        Item: mockPaymentRecord,
      });

      // Mock KMS decryption
      mockKmsSend.mockResolvedValueOnce({
        Plaintext: Buffer.from('4242'),
      });
      mockKmsSend.mockResolvedValueOnce({
        Plaintext: Buffer.from('test@example.com'),
      });

      const response = await request(app).get('/api/payments/pay_retrieve_123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        paymentId: 'pay_retrieve_123',
        orderId: 'order_123',
        status: 'succeeded',
        amount: 1999,
        currency: 'usd',
        lastFourDigits: '4242',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should return 404 for non-existent payment', async () => {
      // Mock DynamoDB get returning no item
      mockDynamoSend.mockResolvedValueOnce({
        Item: undefined,
      });

      const response = await request(app).get('/api/payments/pay_nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app).get('/api/unknown');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    });
  });
});
