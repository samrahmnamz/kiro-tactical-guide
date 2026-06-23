/**
 * Integration tests for Payment Error Handling
 * Tests card declined, invalid tokens, and error mapping scenarios
 * **Validates: Requirements 3.4, 28.1 (payment-processor integration tests - error handling)**
 */

// Mock AWS services BEFORE importing modules
const mockSecretsSend = jest.fn();
const mockKmsSend = jest.fn();
const mockDynamoSend = jest.fn();
const mockStripeChargesCreate = jest.fn();

// Create Stripe mock with error classes
class MockStripeError extends Error {
  constructor(
    message: string,
    public type: string,
    public code?: string,
    public decline_code?: string
  ) {
    super(message);
    this.name = 'StripeCardError';
  }
}

const mockStripe = {
  charges: {
    create: mockStripeChargesCreate,
  },
};

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
    StripeCardError: MockStripeError,
  };
  return MockStripeConstructor;
});

import { processPayment, PaymentError } from '../../src/payment-service';
import { PaymentRequest } from '../../src/types';

describe('Payment Error Handling Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default Secrets Manager mock
    mockSecretsSend.mockResolvedValue({
      SecretString: 'sk_test_mock_key_12345',
    });
  });

  describe('Card Declined Scenarios', () => {
    it('should handle card declined error with user-friendly message', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_chargeDeclined',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_declined_001',
        metadata: {
          customerEmail: 'declined@example.com',
          orderDescription: 'Card declined test',
        },
      };

      // Mock Stripe card declined error
      const stripeError = new MockStripeError(
        'Your card was declined',
        'card_error',
        'card_declined',
        'generic_decline'
      );

      mockStripeChargesCreate.mockRejectedValueOnce(stripeError);

      // Act & Assert
      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'card_declined',
        message: 'Payment method declined. Please use a different card.',
      });

      expect(mockStripeChargesCreate).toHaveBeenCalledTimes(1);
      // Should not reach DynamoDB since payment failed
      expect(mockDynamoSend).not.toHaveBeenCalled();
    });

    it('should handle insufficient funds error', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_insufficientFunds',
        amount: 5000,
        currency: 'usd',
        orderId: 'order_insufficient_001',
        metadata: {
          customerEmail: 'insufficient@example.com',
          orderDescription: 'Insufficient funds test',
        },
      };

      const stripeError = new MockStripeError(
        'Your card has insufficient funds',
        'card_error',
        'insufficient_funds'
      );

      mockStripeChargesCreate.mockRejectedValueOnce(stripeError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'card_declined',
        message: 'Insufficient funds. Please use a different card.',
      });
    });

    it('should handle expired card error', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_expiredCard',
        amount: 2000,
        currency: 'usd',
        orderId: 'order_expired_001',
        metadata: {
          customerEmail: 'expired@example.com',
          orderDescription: 'Expired card test',
        },
      };

      const stripeError = new MockStripeError(
        'Your card has expired',
        'card_error',
        'expired_card'
      );

      mockStripeChargesCreate.mockRejectedValueOnce(stripeError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'card_declined',
        message: 'Card has expired. Please use a different card.',
      });
    });

    it('should handle incorrect CVC error', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_incorrectCvc',
        amount: 1500,
        currency: 'usd',
        orderId: 'order_cvc_001',
        metadata: {
          customerEmail: 'cvc@example.com',
          orderDescription: 'Incorrect CVC test',
        },
      };

      const stripeError = new MockStripeError(
        "Your card's security code is incorrect",
        'card_error',
        'incorrect_cvc'
      );

      mockStripeChargesCreate.mockRejectedValueOnce(stripeError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'card_declined',
      });
    });
  });

  describe('Invalid Token Scenarios', () => {
    it('should handle invalid card number error', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_invalidNumber',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_invalid_number_001',
        metadata: {
          customerEmail: 'invalid@example.com',
          orderDescription: 'Invalid number test',
        },
      };

      const stripeError = new MockStripeError(
        'Your card number is incorrect',
        'card_error',
        'incorrect_number'
      );

      mockStripeChargesCreate.mockRejectedValueOnce(stripeError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'invalid_token',
      });
    });

    it('should handle invalid expiry date error', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_invalidExpiry',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_invalid_expiry_001',
        metadata: {
          customerEmail: 'invalid@example.com',
          orderDescription: 'Invalid expiry test',
        },
      };

      const stripeError = new MockStripeError(
        "Your card's expiration year is invalid",
        'card_error',
        'invalid_expiry_year'
      );

      mockStripeChargesCreate.mockRejectedValueOnce(stripeError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'invalid_token',
        message: 'Invalid payment token. Please try again.',
      });
    });
  });

  describe('Stripe API Error Mapping', () => {
    it('should handle rate limit errors', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_rate_limit_001',
        metadata: {
          customerEmail: 'ratelimit@example.com',
          orderDescription: 'Rate limit test',
        },
      };

      const stripeError = new MockStripeError(
        'Too many requests',
        'rate_limit_error',
        'rate_limit'
      );

      mockStripeChargesCreate.mockRejectedValueOnce(stripeError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'rate_limit',
      });
    });

    it('should handle generic processing errors with safe message', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_processing_error_001',
        metadata: {
          customerEmail: 'processing@example.com',
          orderDescription: 'Processing error test',
        },
      };

      const stripeError = new MockStripeError(
        'An internal processing error occurred',
        'processing_error',
        'processing_error'
      );

      mockStripeChargesCreate.mockRejectedValueOnce(stripeError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
        message: 'Payment processing failed. Please try again.',
      });
    });

    it('should not expose internal error details to users', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_internal_001',
        metadata: {
          customerEmail: 'internal@example.com',
          orderDescription: 'Internal error test',
        },
      };

      // Simulate internal error with sensitive details
      const stripeError = new MockStripeError(
        'Internal database connection failed on host db-prod-01.stripe.com',
        'api_error'
      );

      mockStripeChargesCreate.mockRejectedValueOnce(stripeError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
        message: 'Payment processing failed. Please try again.',
      });

      // Verify error message does not contain sensitive details
      try {
        await processPayment(request);
      } catch (error) {
        if (error instanceof PaymentError) {
          expect(error.message).not.toContain('db-prod-01');
          expect(error.message).not.toContain('stripe.com');
          expect(error.message).not.toContain('database');
        }
      }
    });
  });

  describe('Input Validation Errors', () => {
    it('should reject missing required fields', async () => {
      const request = {
        amount: 1000,
        currency: 'usd',
        orderId: 'order_missing_token',
        metadata: {
          customerEmail: 'test@example.com',
          orderDescription: 'Test',
        },
      } as PaymentRequest;

      await expect(processPayment(request)).rejects.toThrow(
        'Missing required fields'
      );

      expect(mockStripeChargesCreate).not.toHaveBeenCalled();
    });

    it('should reject zero amounts', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 0,
        currency: 'usd',
        orderId: 'order_zero_amount',
        metadata: {
          customerEmail: 'test@example.com',
          orderDescription: 'Zero amount test',
        },
      };

      // Amount: 0 is falsy, so it triggers missing required fields check
      await expect(processPayment(request)).rejects.toThrow(
        'Missing required fields'
      );

      expect(mockStripeChargesCreate).not.toHaveBeenCalled();
    });

    it('should reject negative amounts', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: -1000,
        currency: 'usd',
        orderId: 'order_negative_amount',
        metadata: {
          customerEmail: 'test@example.com',
          orderDescription: 'Negative amount test',
        },
      };

      await expect(processPayment(request)).rejects.toThrow(
        'Amount must be greater than zero'
      );
    });
  });

  describe('Non-Stripe Error Handling', () => {
    it('should handle unexpected non-Stripe errors gracefully', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_unexpected_001',
        metadata: {
          customerEmail: 'unexpected@example.com',
          orderDescription: 'Unexpected error test',
        },
      };

      // Simulate non-Stripe error (e.g., network error)
      mockStripeChargesCreate.mockRejectedValueOnce(
        new Error('Network connection timeout')
      );

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
        message: 'Payment processing failed. Please try again.',
      });
    });
  });
});
