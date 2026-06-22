/**
 * Unit tests for database operations
 * **Validates: Requirements 3.4 (payment processor tests)**
 */

// Mock AWS services BEFORE imports
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => {
  class MockConditionalCheckFailedException extends Error {
    constructor(opts: any) {
      super(opts?.message || 'Conditional check failed');
      this.name = 'ConditionalCheckFailedException';
      this.$metadata = opts?.$metadata || {};
    }
    $metadata: any;
  }
  
  return {
    DynamoDBClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    ConditionalCheckFailedException: MockConditionalCheckFailedException,
  };
});

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockReturnValue({
      send: mockSend,
    }),
  },
  PutCommand: jest.fn(),
  GetCommand: jest.fn(),
  QueryCommand: jest.fn(),
}));

jest.mock('../../src/encryption', () => ({
  encrypt: jest.fn(),
  decrypt: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import {
  createPaymentRecord,
  getPaymentRecord,
  getPaymentByOrderId,
  decryptPaymentRecord,
} from '../../src/database';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { encrypt, decrypt } from '../../src/encryption';
import { PaymentRecord } from '../../src/types';

const mockEncrypt = encrypt as jest.MockedFunction<typeof encrypt>;
const mockDecrypt = decrypt as jest.MockedFunction<typeof decrypt>;

describe('Database Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPaymentRecord', () => {
    it('should create a payment record with encrypted fields', async () => {
      mockEncrypt.mockResolvedValueOnce('encrypted_4242');
      mockEncrypt.mockResolvedValueOnce('encrypted_email@example.com');
      mockSend.mockResolvedValueOnce({});

      const result = await createPaymentRecord(
        'order_123',
        'ch_stripe_123',
        1999,
        'usd',
        'succeeded',
        '4242',
        'test@example.com',
        { orderDescription: 'Test order' }
      );

      expect(result).toMatchObject({
        orderId: 'order_123',
        stripeChargeId: 'ch_stripe_123',
        amount: 1999,
        currency: 'usd',
        status: 'succeeded',
        cardLastFour: 'encrypted_4242',
        customerEmail: 'encrypted_email@example.com',
        metadata: { orderDescription: 'Test order' },
      });

      expect(result.paymentId).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(result.ttl).toBeDefined();

      // Verify encryption was called
      expect(mockEncrypt).toHaveBeenCalledWith('4242', expect.any(String));
      expect(mockEncrypt).toHaveBeenCalledWith('test@example.com', expect.any(String));

      // Verify DynamoDB put with conditional expression
      expect(PutCommand).toHaveBeenCalledWith({
        TableName: expect.any(String),
        Item: expect.objectContaining({
          orderId: 'order_123',
          cardLastFour: 'encrypted_4242',
          customerEmail: 'encrypted_email@example.com',
        }),
        ConditionExpression: 'attribute_not_exists(orderId)',
      });
    });

    it('should set TTL to 7 years (PCI DSS requirement)', async () => {
      mockEncrypt.mockResolvedValue('encrypted_value');
      mockSend.mockResolvedValueOnce({});

      const beforeTime = Math.floor(Date.now() / 1000);
      const result = await createPaymentRecord(
        'order_123',
        'ch_stripe_123',
        1999,
        'usd',
        'succeeded',
        '4242',
        'test@example.com',
        {}
      );
      const afterTime = Math.floor(Date.now() / 1000);

      // 7 years in seconds
      const sevenYears = 7 * 365 * 24 * 60 * 60;
      expect(result.ttl).toBeGreaterThanOrEqual(beforeTime + sevenYears);
      expect(result.ttl).toBeLessThanOrEqual(afterTime + sevenYears);
    });

    it('should handle idempotent requests (duplicate orderId)', async () => {
      const existingRecord: PaymentRecord = {
        paymentId: 'existing_pay_123',
        orderId: 'order_123',
        stripeChargeId: 'ch_existing',
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

      mockEncrypt.mockResolvedValue('encrypted_value');
      
      // First call: ConditionalCheckFailedException
      mockSend.mockRejectedValueOnce(
        new ConditionalCheckFailedException({ 
          message: 'Conditional check failed',
          $metadata: {}
        } as any)
      );
      
      // Second call: QueryCommand returns existing record
      mockSend.mockResolvedValueOnce({
        Items: [existingRecord],
      });

      const result = await createPaymentRecord(
        'order_123',
        'ch_new_attempt',
        1999,
        'usd',
        'succeeded',
        '4242',
        'test@example.com',
        {}
      );

      expect(result).toEqual(existingRecord);
      expect(QueryCommand).toHaveBeenCalledWith({
        TableName: expect.any(String),
        IndexName: 'OrderIdIndex',
        KeyConditionExpression: 'orderId = :orderId',
        ExpressionAttributeValues: {
          ':orderId': 'order_123',
        },
        Limit: 1,
      });
    });

    it('should throw error if idempotency check fails but record not found', async () => {
      mockEncrypt.mockResolvedValue('encrypted_value');
      
      // ConditionalCheckFailedException
      mockSend.mockRejectedValueOnce(
        new ConditionalCheckFailedException({ 
          message: 'Conditional check failed',
          $metadata: {}
        } as any)
      );
      
      // QueryCommand returns no records
      mockSend.mockResolvedValueOnce({
        Items: [],
      });

      await expect(
        createPaymentRecord(
          'order_123',
          'ch_stripe_123',
          1999,
          'usd',
          'succeeded',
          '4242',
          'test@example.com',
          {}
        )
      ).rejects.toThrow('Idempotency check failed but record not found');
    });

    it('should propagate non-idempotency errors', async () => {
      mockEncrypt.mockResolvedValue('encrypted_value');
      mockSend.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        createPaymentRecord(
          'order_123',
          'ch_stripe_123',
          1999,
          'usd',
          'succeeded',
          '4242',
          'test@example.com',
          {}
        )
      ).rejects.toThrow('Network error');
    });
  });

  describe('getPaymentRecord', () => {
    it('should retrieve a payment record by paymentId', async () => {
      const mockRecord: PaymentRecord = {
        paymentId: 'pay_123',
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

      mockSend.mockResolvedValueOnce({
        Item: mockRecord,
      });

      const result = await getPaymentRecord('pay_123');

      expect(result).toEqual(mockRecord);
      expect(GetCommand).toHaveBeenCalledWith({
        TableName: expect.any(String),
        Key: { paymentId: 'pay_123' },
      });
    });

    it('should return null for non-existent payment', async () => {
      mockSend.mockResolvedValueOnce({
        Item: undefined,
      });

      const result = await getPaymentRecord('pay_nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error on DynamoDB failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(getPaymentRecord('pay_123')).rejects.toThrow('DynamoDB error');
    });
  });

  describe('getPaymentByOrderId', () => {
    it('should retrieve payment by orderId using GSI', async () => {
      const mockRecord: PaymentRecord = {
        paymentId: 'pay_123',
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

      mockSend.mockResolvedValueOnce({
        Items: [mockRecord],
      });

      const result = await getPaymentByOrderId('order_123');

      expect(result).toEqual(mockRecord);
      expect(QueryCommand).toHaveBeenCalledWith({
        TableName: expect.any(String),
        IndexName: 'OrderIdIndex',
        KeyConditionExpression: 'orderId = :orderId',
        ExpressionAttributeValues: {
          ':orderId': 'order_123',
        },
        Limit: 1,
      });
    });

    it('should return null for non-existent orderId', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [],
      });

      const result = await getPaymentByOrderId('order_nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when Items is undefined', async () => {
      mockSend.mockResolvedValueOnce({
        Items: undefined,
      });

      const result = await getPaymentByOrderId('order_123');

      expect(result).toBeNull();
    });

    it('should throw error on query failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('Query failed'));

      await expect(getPaymentByOrderId('order_123')).rejects.toThrow('Query failed');
    });
  });

  describe('decryptPaymentRecord', () => {
    it('should decrypt sensitive fields', async () => {
      const encryptedRecord: PaymentRecord = {
        paymentId: 'pay_123',
        orderId: 'order_123',
        stripeChargeId: 'ch_stripe_123',
        amount: 1999,
        currency: 'usd',
        status: 'succeeded',
        cardLastFour: 'encrypted_4242',
        customerEmail: 'encrypted_email@example.com',
        metadata: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        ttl: 123456789,
      };

      mockDecrypt.mockResolvedValueOnce('4242');
      mockDecrypt.mockResolvedValueOnce('test@example.com');

      const result = await decryptPaymentRecord(encryptedRecord);

      expect(result).toEqual({
        ...encryptedRecord,
        cardLastFour: '4242',
        customerEmail: 'test@example.com',
      });

      expect(mockDecrypt).toHaveBeenCalledWith('encrypted_4242');
      expect(mockDecrypt).toHaveBeenCalledWith('encrypted_email@example.com');
    });

    it('should preserve all other fields during decryption', async () => {
      const encryptedRecord: PaymentRecord = {
        paymentId: 'pay_123',
        orderId: 'order_123',
        stripeChargeId: 'ch_stripe_123',
        amount: 1999,
        currency: 'usd',
        status: 'succeeded',
        cardLastFour: 'encrypted_4242',
        customerEmail: 'encrypted_email',
        metadata: { orderDescription: 'Test' },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        ttl: 123456789,
      };

      mockDecrypt.mockResolvedValue('decrypted_value');

      const result = await decryptPaymentRecord(encryptedRecord);

      expect(result.paymentId).toBe('pay_123');
      expect(result.amount).toBe(1999);
      expect(result.metadata).toEqual({ orderDescription: 'Test' });
    });

    it('should propagate decryption errors', async () => {
      const encryptedRecord: PaymentRecord = {
        paymentId: 'pay_123',
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

      mockDecrypt.mockRejectedValueOnce(new Error('KMS unavailable'));

      await expect(decryptPaymentRecord(encryptedRecord)).rejects.toThrow('KMS unavailable');
    });
  });
});
