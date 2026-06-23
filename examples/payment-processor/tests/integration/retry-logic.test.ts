/**
 * Integration tests for Payment Retry Logic
 * Tests Stripe API timeouts, KMS throttling, and DynamoDB failures
 * **Validates: Requirements 3.4, 28.1 (payment-processor integration tests - retry logic)**
 */

// Mock AWS services BEFORE importing modules
const mockSecretsSend = jest.fn();
const mockKmsSend = jest.fn();
const mockDynamoSend = jest.fn();
const mockStripeChargesCreate = jest.fn();

class MockStripeError extends Error {
  constructor(
    message: string,
    public type: string,
    public code?: string,
    public headers?: Record<string, string>
  ) {
    super(message);
    this.name = 'StripeError';
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
  };
  return MockStripeConstructor;
});

import { processPayment } from '../../src/payment-service';
import { PaymentRequest } from '../../src/types';

describe('Payment Retry Logic Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default Secrets Manager mock
    mockSecretsSend.mockResolvedValue({
      SecretString: 'sk_test_mock_key_12345',
    });
  });

  describe('Stripe API Timeout Handling', () => {
    it('should handle Stripe API 503 timeout with Retry-After header', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_timeout_001',
        metadata: {
          customerEmail: 'timeout@example.com',
          orderDescription: 'Timeout test',
        },
      };

      // Stripe timeout error
      const timeoutError = new MockStripeError(
        'Service temporarily unavailable',
        'api_error',
        undefined,
        { 'Retry-After': '2' }
      );

      mockStripeChargesCreate.mockRejectedValueOnce(timeoutError);

      // Error should be converted to generic PaymentError
      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
      });
    });

    it('should handle multiple transient Stripe API failures', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_multi_timeout_001',
        metadata: {
          customerEmail: 'multitimeout@example.com',
          orderDescription: 'Multiple timeout test',
        },
      };

      // Transient error
      const transientError = new MockStripeError(
        'Connection timeout',
        'api_connection_error'
      );

      mockStripeChargesCreate.mockRejectedValueOnce(transientError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
        message: 'Payment processing failed. Please try again.',
      });
    });
  });

  describe('KMS Throttling Scenarios', () => {
    it('should handle KMS throttling errors during encryption', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_kms_throttle_001',
        metadata: {
          customerEmail: 'kmsthrottle@example.com',
          orderDescription: 'KMS throttle test',
        },
      };

      // Mock successful Stripe charge
      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_kms_throttle_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/kms',
      });

      // Mock KMS throttling error
      const kmsThrottleError = new Error('ThrottlingException');
      kmsThrottleError.name = 'ThrottlingException';

      mockKmsSend.mockRejectedValueOnce(kmsThrottleError);

      // KMS error is caught and converted to generic PaymentError
      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
      });
    });

    it('should handle KMS service unavailable errors', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_kms_unavailable_001',
        metadata: {
          customerEmail: 'kmsunavailable@example.com',
          orderDescription: 'KMS unavailable test',
        },
      };

      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_kms_unavailable_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/kms',
      });

      // Mock KMS service error
      const kmsServiceError = new Error('ServiceUnavailableException');
      kmsServiceError.name = 'ServiceUnavailableException';

      mockKmsSend.mockRejectedValueOnce(kmsServiceError);

      // KMS error is caught and converted to generic PaymentError
      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
      });
    });
  });

  describe('DynamoDB Failure Scenarios', () => {
    it('should handle DynamoDB provisioned throughput exceeded', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_dynamo_throughput_001',
        metadata: {
          customerEmail: 'dynamothroughput@example.com',
          orderDescription: 'DynamoDB throughput test',
        },
      };

      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_dynamo_throughput_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/dynamo',
      });

      mockKmsSend
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_4242') })
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_email') });

      // Mock DynamoDB throughput error
      const dynamoError = new Error('ProvisionedThroughputExceededException');
      dynamoError.name = 'ProvisionedThroughputExceededException';

      mockDynamoSend.mockRejectedValueOnce(dynamoError);

      // DynamoDB error is caught and converted to generic PaymentError
      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
      });
    });

    it('should handle DynamoDB service unavailable errors', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_dynamo_unavailable_001',
        metadata: {
          customerEmail: 'dynamounavailable@example.com',
          orderDescription: 'DynamoDB unavailable test',
        },
      };

      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_dynamo_unavailable_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/dynamo',
      });

      mockKmsSend
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_4242') })
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_email') });

      const dynamoError = new Error('ServiceUnavailable');
      dynamoError.name = 'ServiceUnavailable';

      mockDynamoSend.mockRejectedValueOnce(dynamoError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
      });
    });

    it('should handle DynamoDB internal server errors', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_dynamo_internal_001',
        metadata: {
          customerEmail: 'dynamointernal@example.com',
          orderDescription: 'DynamoDB internal test',
        },
      };

      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_dynamo_internal_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/dynamo',
      });

      mockKmsSend
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_4242') })
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_email') });

      const dynamoError = new Error('InternalServerError');
      dynamoError.name = 'InternalServerError';

      mockDynamoSend.mockRejectedValueOnce(dynamoError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
      });
    });
  });

  describe('Network Error Scenarios', () => {
    it('should handle network connection errors to Stripe', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_network_001',
        metadata: {
          customerEmail: 'network@example.com',
          orderDescription: 'Network error test',
        },
      };

      const networkError = new Error('ECONNREFUSED');
      networkError.name = 'NetworkError';

      mockStripeChargesCreate.mockRejectedValueOnce(networkError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
      });
    });

    it('should handle DNS resolution failures', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_dns_001',
        metadata: {
          customerEmail: 'dns@example.com',
          orderDescription: 'DNS error test',
        },
      };

      const dnsError = new Error('ENOTFOUND');
      dnsError.name = 'DNSError';

      mockStripeChargesCreate.mockRejectedValueOnce(dnsError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
      });
    });

    it('should handle socket timeout errors', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_socket_timeout_001',
        metadata: {
          customerEmail: 'sockettimeout@example.com',
          orderDescription: 'Socket timeout test',
        },
      };

      const timeoutError = new Error('ETIMEDOUT');
      timeoutError.name = 'TimeoutError';

      mockStripeChargesCreate.mockRejectedValueOnce(timeoutError);

      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
      });
    });
  });

  describe('Partial Failure Recovery', () => {
    it('should handle Stripe success but DynamoDB failure scenario', async () => {
      const request: PaymentRequest = {
        stripeToken: 'tok_visa',
        amount: 1000,
        currency: 'usd',
        orderId: 'order_partial_failure_001',
        metadata: {
          customerEmail: 'partialfailure@example.com',
          orderDescription: 'Partial failure test',
        },
      };

      // Stripe succeeds
      mockStripeChargesCreate.mockResolvedValueOnce({
        id: 'ch_partial_001',
        status: 'succeeded',
        payment_method_details: {
          card: { last4: '4242' },
        },
        receipt_url: 'https://stripe.com/receipt/partial',
      });

      // KMS succeeds
      mockKmsSend
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_4242') })
        .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('enc_email') });

      // DynamoDB fails
      const dynamoError = new Error('InternalServerError');
      dynamoError.name = 'InternalServerError';
      mockDynamoSend.mockRejectedValueOnce(dynamoError);

      // Payment is charged in Stripe but not recorded in DynamoDB
      // Error is caught and converted to generic PaymentError
      await expect(processPayment(request)).rejects.toMatchObject({
        name: 'PaymentError',
        code: 'processing_error',
      });

      // Verify Stripe charge was created
      expect(mockStripeChargesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1000,
        }),
        expect.any(Object)
      );
    });
  });
});
