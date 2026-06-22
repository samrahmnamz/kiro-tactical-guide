/**
 * Unit tests for payment service
 * **Validates: Requirements 3.4 (payment processor tests)**
 */

// Mock all AWS services and Stripe BEFORE imports
const mockSend = jest.fn();
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

// Mock the Stripe module
jest.mock('stripe', () => {
  const MockStripeConstructor = jest.fn().mockImplementation(() => mockStripe) as any;
  
  // Attach errors namespace
  MockStripeConstructor.errors = {
    StripeError: MockStripeError,
  };
  
  return MockStripeConstructor;
});

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  GetSecretValueCommand: jest.fn(),
}));

jest.mock('../../src/database', () => ({
  createPaymentRecord: jest.fn(),
  getPaymentRecord: jest.fn(),
  decryptPaymentRecord: jest.fn(),
}));

jest.mock('../../src/secrets', () => ({
  getSecret: jest.fn(),
}));

import { processPayment, retrievePayment, PaymentError } from '../../src/payment-service';
import { PaymentRequest } from '../../src/types';
import { createPaymentRecord, getPaymentRecord, decryptPaymentRecord } from '../../src/database';
import { getSecret } from '../../src/secrets';
import Stripe from 'stripe';

const mockCreatePaymentRecord = createPaymentRecord as jest.MockedFunction<typeof createPaymentRecord>;
const mockGetPaymentRecord = getPaymentRecord as jest.MockedFunction<typeof getPaymentRecord>;
const mockDecryptPaymentRecord = decryptPaymentRecord as jest.MockedFunction<typeof decryptPaymentRecord>;
const mockGetSecret = getSecret as jest.MockedFunction<typeof getSecret>;

describe('Payment Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set production mode to force Secrets Manager usage
    process.env.NODE_ENV = 'test';
    // Mock Secrets Manager response
    mockGetSecret.mockResolvedValue('sk_test_mock_key_12345');
  });

  describe('processPayment', () => {
    const validRequest: PaymentRequest = {
      stripeToken: 'tok_visa',
      amount: 1999,
      currency: 'usd',
      orderId: 'order_123',
      metadata: {
        customerEmail: 'test@example.com',
        orderDescription: 'Test order',
      },
    };

    it('should process a valid payment successfully', async () => {
      const mockCharge = {
        id: 'ch_mock_12345',
        status: 'succeeded',
        payment_method_details: {
          card: {
            last4: '4242',
          },
        },
        receipt_url: 'https://stripe.com/receipt/mock',
      };

      const mockPaymentRecord = {
        paymentId: 'pay_mock_123',
        orderId: 'order_123',
        stripeChargeId: 'ch_mock_12345',
        amount: 1999,
        currency: 'usd',
        status: 'succeeded',
        cardLastFour: 'encrypted_4242',
        customerEmail: 'encrypted_email',
        metadata: validRequest.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 220752000,
      };

      mockStripeChargesCreate.mockResolvedValueOnce(mockCharge);
      mockCreatePaymentRecord.mockResolvedValueOnce(mockPaymentRecord);

      const result = await processPayment(validRequest);

      expect(result).toEqual({
        paymentId: 'pay_mock_123',
        stripeChargeId: 'ch_mock_12345',
        status: 'succeeded',
        amount: 1999,
        currency: 'usd',
        receiptUrl: 'https://stripe.com/receipt/mock',
        createdAt: mockPaymentRecord.createdAt,
      });

      expect(mockStripeChargesCreate).toHaveBeenCalledWith(
        {
          amount: 1999,
          currency: 'usd',
          source: 'tok_visa',
          description: 'Test order',
          metadata: {
            orderId: 'order_123',
            customerEmail: 'test@example.com',
          },
        },
        {
          idempotencyKey: 'order_123',
        }
      );

      expect(mockCreatePaymentRecord).toHaveBeenCalledWith(
        'order_123',
        'ch_mock_12345',
        1999,
        'usd',
        'succeeded',
        '4242',
        'test@example.com',
        validRequest.metadata
      );
    });

    it('should throw error for missing required fields', async () => {
      const invalidRequest = {
        stripeToken: 'tok_visa',
        amount: 1999,
        // Missing currency and orderId
      } as PaymentRequest;

      await expect(processPayment(invalidRequest)).rejects.toThrow(
        'Missing required fields'
      );
    });

    it('should throw error for zero amount', async () => {
      const invalidRequest = {
        ...validRequest,
        amount: 0,
      };

      // Zero is falsy, so it will fail the "!amount" check
      await expect(processPayment(invalidRequest)).rejects.toThrow(
        'Missing required fields'
      );
    });

    it('should throw error for negative amount', async () => {
      const invalidRequest = {
        ...validRequest,
        amount: -100,
      };

      await expect(processPayment(invalidRequest)).rejects.toThrow(
        'Amount must be greater than zero'
      );
    });

    it('should handle card declined error', async () => {
      // Create error that will pass instanceof Stripe.errors.StripeError check
      const StripeErrorClass = Stripe.errors.StripeError;
      const stripeError = Object.create(StripeErrorClass.prototype);
      stripeError.message = 'Your card was declined';
      stripeError.type = 'StripeCardError';
      stripeError.code = 'card_declined';
      stripeError.name = 'StripeError';

      mockStripeChargesCreate.mockRejectedValue(stripeError);

      await expect(processPayment(validRequest)).rejects.toThrow(PaymentError);
      await expect(processPayment(validRequest)).rejects.toMatchObject({
        code: 'card_declined',
        message: 'Payment method declined. Please use a different card.',
      });
    });

    it('should handle expired card error', async () => {
      const StripeErrorClass = Stripe.errors.StripeError;
      const stripeError = Object.create(StripeErrorClass.prototype);
      stripeError.message = 'Your card has expired';
      stripeError.type = 'StripeCardError';
      stripeError.code = 'expired_card';
      stripeError.name = 'StripeError';

      mockStripeChargesCreate.mockRejectedValue(stripeError);

      await expect(processPayment(validRequest)).rejects.toMatchObject({
        code: 'card_declined',
        message: expect.stringContaining('expired'),
      });
    });

    it('should handle invalid token error', async () => {
      const StripeErrorClass = Stripe.errors.StripeError;
      const stripeError = Object.create(StripeErrorClass.prototype);
      stripeError.message = 'Invalid token';
      stripeError.type = 'StripeCardError';
      stripeError.code = 'incorrect_number';
      stripeError.name = 'StripeError';

      mockStripeChargesCreate.mockRejectedValue(stripeError);

      await expect(processPayment(validRequest)).rejects.toMatchObject({
        code: 'invalid_token',
        message: expect.stringContaining('Invalid payment token'),
      });
    });

    it('should use idempotency key based on orderId', async () => {
      const mockCharge = {
        id: 'ch_mock_12345',
        status: 'succeeded',
        payment_method_details: { card: { last4: '4242' } },
        receipt_url: 'https://stripe.com/receipt/mock',
      };

      mockStripeChargesCreate.mockResolvedValueOnce(mockCharge);
      mockCreatePaymentRecord.mockResolvedValueOnce({
        paymentId: 'pay_mock_123',
        orderId: 'order_123',
        stripeChargeId: 'ch_mock_12345',
        amount: 1999,
        currency: 'usd',
        status: 'succeeded',
        cardLastFour: 'encrypted_4242',
        customerEmail: 'encrypted_email',
        metadata: validRequest.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 220752000,
      });

      await processPayment(validRequest);

      expect(mockStripeChargesCreate).toHaveBeenCalledWith(
        expect.anything(),
        { idempotencyKey: 'order_123' }
      );
    });

    it('should handle missing card details gracefully', async () => {
      const mockCharge = {
        id: 'ch_mock_12345',
        status: 'succeeded',
        payment_method_details: {}, // No card details
        receipt_url: 'https://stripe.com/receipt/mock',
      };

      mockStripeChargesCreate.mockResolvedValueOnce(mockCharge);
      mockCreatePaymentRecord.mockResolvedValueOnce({
        paymentId: 'pay_mock_123',
        orderId: 'order_123',
        stripeChargeId: 'ch_mock_12345',
        amount: 1999,
        currency: 'usd',
        status: 'succeeded',
        cardLastFour: 'encrypted_0000',
        customerEmail: 'encrypted_email',
        metadata: validRequest.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 220752000,
      });

      const result = await processPayment(validRequest);

      expect(result).toBeDefined();
      expect(mockCreatePaymentRecord).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        '0000', // Default value
        expect.anything(),
        expect.anything()
      );
    });

    it('should map pending status correctly', async () => {
      const mockCharge = {
        id: 'ch_mock_12345',
        status: 'pending',
        payment_method_details: { card: { last4: '4242' } },
        receipt_url: '',
      };

      mockStripeChargesCreate.mockResolvedValueOnce(mockCharge);
      mockCreatePaymentRecord.mockResolvedValueOnce({
        paymentId: 'pay_mock_123',
        orderId: 'order_123',
        stripeChargeId: 'ch_mock_12345',
        amount: 1999,
        currency: 'usd',
        status: 'pending',
        cardLastFour: 'encrypted_4242',
        customerEmail: 'encrypted_email',
        metadata: validRequest.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 220752000,
      });

      const result = await processPayment(validRequest);

      expect(result.status).toBe('pending');
    });

    it('should handle generic Stripe errors', async () => {
      const genericError = new Error('Network error');

      mockStripeChargesCreate.mockRejectedValue(genericError);

      await expect(processPayment(validRequest)).rejects.toThrow(PaymentError);
      await expect(processPayment(validRequest)).rejects.toMatchObject({
        code: 'processing_error',
        message: 'Payment processing failed. Please try again.',
      });
    });
  });

  describe('retrievePayment', () => {
    it('should retrieve and decrypt payment details', async () => {
      const mockEncryptedRecord = {
        paymentId: 'pay_mock_123',
        orderId: 'order_123',
        stripeChargeId: 'ch_mock_12345',
        amount: 1999,
        currency: 'usd',
        status: 'succeeded',
        cardLastFour: 'encrypted_4242',
        customerEmail: 'encrypted_email',
        metadata: { customerEmail: 'test@example.com', orderDescription: 'Test' },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        ttl: Math.floor(Date.now() / 1000) + 220752000,
      };

      const mockDecryptedRecord = {
        ...mockEncryptedRecord,
        cardLastFour: '4242',
        customerEmail: 'test@example.com',
      };

      mockGetPaymentRecord.mockResolvedValueOnce(mockEncryptedRecord);
      mockDecryptPaymentRecord.mockResolvedValueOnce(mockDecryptedRecord);

      const result = await retrievePayment('pay_mock_123');

      expect(result).toEqual({
        paymentId: 'pay_mock_123',
        orderId: 'order_123',
        status: 'succeeded',
        amount: 1999,
        currency: 'usd',
        lastFourDigits: '4242',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      expect(mockGetPaymentRecord).toHaveBeenCalledWith('pay_mock_123');
      expect(mockDecryptPaymentRecord).toHaveBeenCalledWith(mockEncryptedRecord);
    });

    it('should throw error for non-existent payment', async () => {
      mockGetPaymentRecord.mockResolvedValueOnce(null);

      await expect(retrievePayment('pay_nonexistent')).rejects.toThrow(PaymentError);
      await expect(retrievePayment('pay_nonexistent')).rejects.toMatchObject({
        code: 'not_found',
        message: 'Payment not found',
      });
    });

    it('should handle decryption errors gracefully', async () => {
      const mockEncryptedRecord = {
        paymentId: 'pay_mock_123',
        orderId: 'order_123',
        stripeChargeId: 'ch_mock_12345',
        amount: 1999,
        currency: 'usd',
        status: 'succeeded',
        cardLastFour: 'encrypted_4242',
        customerEmail: 'encrypted_email',
        metadata: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        ttl: Math.floor(Date.now() / 1000) + 220752000,
      };

      mockGetPaymentRecord.mockResolvedValueOnce(mockEncryptedRecord);
      mockDecryptPaymentRecord.mockRejectedValueOnce(new Error('KMS unavailable'));

      await expect(retrievePayment('pay_mock_123')).rejects.toThrow('KMS unavailable');
    });
  });
});
