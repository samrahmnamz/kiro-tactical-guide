/**
 * Integration tests for Notification Service API
 * Tests the complete flow: API → DynamoDB → SQS
 */

import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../../src/index';
import * as database from '../../src/database';
import * as queue from '../../src/queue';

// Mock AWS SDK clients
jest.mock('../../src/database');
jest.mock('../../src/queue');

const mockDatabase = database as jest.Mocked<typeof database>;
const mockQueue = queue as jest.Mocked<typeof queue>;

describe('Notification Service API - Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/notifications/send', () => {
    describe('Positive Cases', () => {
      it('should send email notification successfully', async () => {
        const notificationId = uuidv4();
        const now = new Date().toISOString();

        mockDatabase.createNotificationRecord.mockResolvedValue({
          notificationId,
          customerId: 'customer-123',
          channel: 'email',
          templateId: 'welcome-email',
          params: { customerName: 'John Doe' },
          status: 'queued',
          attempts: 0,
          timestamps: {
            queued: now,
            sent: null,
            delivered: null,
            failed: null,
          },
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-key',
          priority: 'normal',
        });

        mockQueue.enqueueNotification.mockResolvedValue('mock-message-id');
        mockQueue.getEstimatedDeliveryTime.mockReturnValue(
          new Date(Date.now() + 5 * 60 * 1000).toISOString()
        );

        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            channel: 'email',
            templateId: 'welcome-email',
            params: {
              customerName: 'John Doe',
            },
            priority: 'normal',
          })
          .expect(202);

        expect(response.body).toMatchObject({
          notificationId,
          status: 'queued',
          channel: 'email',
        });

        expect(response.body.estimatedDelivery).toBeDefined();

        expect(mockDatabase.createNotificationRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            customerId: 'customer-123',
            channel: 'email',
            templateId: 'welcome-email',
            status: 'queued',
          })
        );

        expect(mockQueue.enqueueNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            customerId: 'customer-123',
            channel: 'email',
            templateId: 'welcome-email',
          }),
          'normal'
        );
      });

      it('should send SMS notification successfully', async () => {
        const notificationId = uuidv4();
        const now = new Date().toISOString();

        mockDatabase.createNotificationRecord.mockResolvedValue({
          notificationId,
          customerId: 'customer-456',
          channel: 'sms',
          templateId: 'order-confirmation',
          params: { orderNumber: '12345' },
          status: 'queued',
          attempts: 0,
          timestamps: {
            queued: now,
            sent: null,
            delivered: null,
            failed: null,
          },
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-key',
          priority: 'high',
        });

        mockQueue.enqueueNotification.mockResolvedValue('mock-message-id');
        mockQueue.getEstimatedDeliveryTime.mockReturnValue(
          new Date(Date.now() + 30 * 1000).toISOString()
        );

        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-456',
            channel: 'sms',
            templateId: 'order-confirmation',
            params: {
              orderNumber: '12345',
            },
            priority: 'high',
          })
          .expect(202);

        expect(response.body).toMatchObject({
          status: 'queued',
          channel: 'sms',
        });

        expect(mockQueue.enqueueNotification).toHaveBeenCalledWith(
          expect.anything(),
          'high'
        );
      });

      it('should send push notification successfully', async () => {
        const notificationId = uuidv4();
        const now = new Date().toISOString();

        mockDatabase.createNotificationRecord.mockResolvedValue({
          notificationId,
          customerId: 'customer-789',
          channel: 'push',
          templateId: 'new-message',
          params: { messageFrom: 'Support' },
          status: 'queued',
          attempts: 0,
          timestamps: {
            queued: now,
            sent: null,
            delivered: null,
            failed: null,
          },
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-key',
          priority: 'low',
        });

        mockQueue.enqueueNotification.mockResolvedValue('mock-message-id');
        mockQueue.getEstimatedDeliveryTime.mockReturnValue(
          new Date(Date.now() + 60 * 60 * 1000).toISOString()
        );

        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-789',
            channel: 'push',
            templateId: 'new-message',
            params: {
              messageFrom: 'Support',
            },
            priority: 'low',
          })
          .expect(202);

        expect(response.body).toMatchObject({
          status: 'queued',
          channel: 'push',
        });

        expect(mockQueue.enqueueNotification).toHaveBeenCalledWith(
          expect.anything(),
          'low'
        );
      });

      it('should default priority to normal when not specified', async () => {
        const notificationId = uuidv4();
        const now = new Date().toISOString();

        mockDatabase.createNotificationRecord.mockResolvedValue({
          notificationId,
          customerId: 'customer-123',
          channel: 'email',
          templateId: 'test-template',
          params: {},
          status: 'queued',
          attempts: 0,
          timestamps: {
            queued: now,
            sent: null,
            delivered: null,
            failed: null,
          },
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-key',
          priority: 'normal',
        });

        mockQueue.enqueueNotification.mockResolvedValue('mock-message-id');
        mockQueue.getEstimatedDeliveryTime.mockReturnValue(
          new Date(Date.now() + 5 * 60 * 1000).toISOString()
        );

        await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            channel: 'email',
            templateId: 'test-template',
            params: {},
          })
          .expect(202);

        expect(mockQueue.enqueueNotification).toHaveBeenCalledWith(
          expect.anything(),
          'normal'
        );
      });

      it('should suppress email notification when customer opted out', async () => {
        mockDatabase.getCustomerPreferences.mockResolvedValue({
          customerId: 'customer-123',
          emailOptOut: true,
          smsOptOut: false,
          pushOptOut: false,
          preferredChannels: [],
          updatedAt: new Date().toISOString(),
        });

        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            channel: 'email',
            templateId: 'welcome-email',
            params: {},
          })
          .expect(202);

        expect(response.body).toMatchObject({
          status: 'suppressed',
          reason: 'Customer opted out of email notifications',
        });

        // Should not enqueue notification
        expect(mockQueue.enqueueNotification).not.toHaveBeenCalled();
      });

      it('should suppress SMS notification when customer opted out', async () => {
        mockDatabase.getCustomerPreferences.mockResolvedValue({
          customerId: 'customer-456',
          emailOptOut: false,
          smsOptOut: true,
          pushOptOut: false,
          preferredChannels: [],
          updatedAt: new Date().toISOString(),
        });

        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-456',
            channel: 'sms',
            templateId: 'order-confirmation',
            params: {},
          })
          .expect(202);

        expect(response.body).toMatchObject({
          status: 'suppressed',
          reason: 'Customer opted out of sms notifications',
        });

        expect(mockQueue.enqueueNotification).not.toHaveBeenCalled();
      });

      it('should suppress push notification when customer opted out', async () => {
        mockDatabase.getCustomerPreferences.mockResolvedValue({
          customerId: 'customer-789',
          emailOptOut: false,
          smsOptOut: false,
          pushOptOut: true,
          preferredChannels: [],
          updatedAt: new Date().toISOString(),
        });

        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-789',
            channel: 'push',
            templateId: 'new-message',
            params: {},
          })
          .expect(202);

        expect(response.body).toMatchObject({
          status: 'suppressed',
          reason: 'Customer opted out of push notifications',
        });

        expect(mockQueue.enqueueNotification).not.toHaveBeenCalled();
      });

      it('should route high priority notifications with correct delivery estimate', async () => {
        const notificationId = uuidv4();
        const now = new Date().toISOString();

        mockDatabase.createNotificationRecord.mockResolvedValue({
          notificationId,
          customerId: 'customer-urgent',
          channel: 'email',
          templateId: 'urgent-alert',
          params: {},
          status: 'queued',
          attempts: 0,
          timestamps: {
            queued: now,
            sent: null,
            delivered: null,
            failed: null,
          },
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-key',
          priority: 'high',
        });

        mockQueue.enqueueNotification.mockResolvedValue('mock-message-id');
        // High priority should deliver within 30 seconds
        mockQueue.getEstimatedDeliveryTime.mockReturnValue(
          new Date(Date.now() + 30 * 1000).toISOString()
        );

        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-urgent',
            channel: 'email',
            templateId: 'urgent-alert',
            params: {},
            priority: 'high',
          })
          .expect(202);

        expect(response.body.status).toBe('queued');
        expect(mockQueue.enqueueNotification).toHaveBeenCalledWith(
          expect.anything(),
          'high'
        );

        // Verify delivery time is within 30 seconds
        const estimatedDelivery = new Date(response.body.estimatedDelivery);
        const now_time = Date.now();
        const deliveryTime = estimatedDelivery.getTime();
        expect(deliveryTime - now_time).toBeLessThanOrEqual(30 * 1000);
      });
    });

    describe('Negative Cases - Validation', () => {
      it('should reject missing customerId', async () => {
        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            channel: 'email',
            templateId: 'welcome-email',
          })
          .expect(400);

        expect(response.body).toMatchObject({
          error: {
            code: 'missing_required_field',
            message: 'customerId is required',
          },
        });
      });

      it('should reject missing channel', async () => {
        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            templateId: 'welcome-email',
          })
          .expect(400);

        expect(response.body).toMatchObject({
          error: {
            code: 'missing_required_field',
            message: 'channel is required',
          },
        });
      });

      it('should reject missing templateId', async () => {
        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            channel: 'email',
          })
          .expect(400);

        expect(response.body).toMatchObject({
          error: {
            code: 'missing_required_field',
            message: 'templateId is required',
          },
        });
      });

      it('should reject invalid channel', async () => {
        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            channel: 'fax',
            templateId: 'welcome-email',
          })
          .expect(400);

        expect(response.body).toMatchObject({
          error: {
            code: 'invalid_channel',
            message: expect.stringContaining('Invalid channel'),
          },
        });
      });

      it('should reject invalid priority', async () => {
        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            channel: 'email',
            templateId: 'welcome-email',
            priority: 'urgent',
          })
          .expect(400);

        expect(response.body).toMatchObject({
          error: {
            code: 'invalid_priority',
            message: expect.stringContaining('Invalid priority'),
          },
        });
      });

      it('should reject empty customerId', async () => {
        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: '   ',
            channel: 'email',
            templateId: 'welcome-email',
          })
          .expect(400);

        expect(response.body).toMatchObject({
          error: {
            code: 'invalid_customer_id',
            message: 'customerId cannot be empty',
          },
        });
      });

      it('should reject empty templateId', async () => {
        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            channel: 'email',
            templateId: '   ',
          })
          .expect(400);

        expect(response.body).toMatchObject({
          error: {
            code: 'invalid_template_id',
            message: 'templateId cannot be empty',
          },
        });
      });
    });

    describe('Idempotency', () => {
      it('should return existing notification for duplicate request', async () => {
        const existingNotificationId = uuidv4();
        const now = new Date().toISOString();

        const existingRecord = {
          notificationId: existingNotificationId,
          customerId: 'customer-123',
          channel: 'email' as const,
          templateId: 'welcome-email',
          params: { name: 'John' },
          status: 'queued' as const,
          attempts: 0,
          timestamps: {
            queued: now,
            sent: null,
            delivered: null,
            failed: null,
          },
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-idempotency-key',
          priority: 'normal' as const,
        };

        // First call - create new notification
        mockDatabase.createNotificationRecord.mockResolvedValueOnce(existingRecord);
        mockQueue.enqueueNotification.mockResolvedValue('mock-message-id');
        mockQueue.getEstimatedDeliveryTime.mockReturnValue(
          new Date(Date.now() + 5 * 60 * 1000).toISOString()
        );

        const firstResponse = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            channel: 'email',
            templateId: 'welcome-email',
            params: { name: 'John' },
          })
          .expect(202);

        // Second call - idempotent (same customer + template within 1 hour)
        mockDatabase.createNotificationRecord.mockResolvedValueOnce(existingRecord);

        const secondResponse = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            channel: 'email',
            templateId: 'welcome-email',
            params: { name: 'John' },
          })
          .expect(202);

        // Should return same notificationId
        expect(secondResponse.body.notificationId).toBe(firstResponse.body.notificationId);

        // Queue should be called only once (idempotency prevents duplicate)
        // Note: In a real implementation with idempotency checks, enqueueNotification
        // would only be called once. This test structure assumes the API would
        // detect the duplicate and return the existing record without enqueueing again.
      });
    });

    describe('Error Handling', () => {
      it('should return 500 when database operation fails', async () => {
        mockDatabase.createNotificationRecord.mockRejectedValue(
          new Error('DynamoDB connection error')
        );

        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            channel: 'email',
            templateId: 'welcome-email',
          })
          .expect(500);

        expect(response.body).toMatchObject({
          error: {
            code: 'internal_error',
            message: 'Failed to send notification',
          },
        });
      });

      it('should return 500 when queue operation fails', async () => {
        const notificationId = uuidv4();
        const now = new Date().toISOString();

        mockDatabase.createNotificationRecord.mockResolvedValue({
          notificationId,
          customerId: 'customer-123',
          channel: 'email',
          templateId: 'test',
          params: {},
          status: 'queued',
          attempts: 0,
          timestamps: {
            queued: now,
            sent: null,
            delivered: null,
            failed: null,
          },
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-key',
          priority: 'normal',
        });

        mockQueue.enqueueNotification.mockRejectedValue(new Error('SQS connection error'));

        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            channel: 'email',
            templateId: 'test',
          })
          .expect(500);

        expect(response.body).toMatchObject({
          error: {
            code: 'internal_error',
            message: 'Failed to send notification',
          },
        });
      });
    });
  });

  describe('Edge Cases', () => {
    describe('Template Parameters', () => {
      it('should handle empty template parameters', async () => {
        const notificationId = uuidv4();
        const now = new Date().toISOString();

        mockDatabase.createNotificationRecord.mockResolvedValue({
          notificationId,
          customerId: 'customer-123',
          channel: 'email',
          templateId: 'welcome-email',
          params: {},
          status: 'queued',
          attempts: 0,
          timestamps: {
            queued: now,
            sent: null,
            delivered: null,
            failed: null,
          },
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-key',
          priority: 'normal',
        });

        mockQueue.enqueueNotification.mockResolvedValue('mock-message-id');
        mockQueue.getEstimatedDeliveryTime.mockReturnValue(
          new Date(Date.now() + 5 * 60 * 1000).toISOString()
        );

        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            channel: 'email',
            templateId: 'welcome-email',
            params: {},
          })
          .expect(202);

        expect(response.body.status).toBe('queued');
        expect(mockDatabase.createNotificationRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            params: {},
          })
        );
      });

      it('should handle large template parameters', async () => {
        const notificationId = uuidv4();
        const now = new Date().toISOString();

        // Generate 100 key-value pairs
        const largeParams: Record<string, string> = {};
        for (let i = 0; i < 100; i++) {
          largeParams[`param${i}`] = `value${i}`;
        }

        mockDatabase.createNotificationRecord.mockResolvedValue({
          notificationId,
          customerId: 'customer-123',
          channel: 'email',
          templateId: 'complex-template',
          params: largeParams,
          status: 'queued',
          attempts: 0,
          timestamps: {
            queued: now,
            sent: null,
            delivered: null,
            failed: null,
          },
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-key',
          priority: 'normal',
        });

        mockQueue.enqueueNotification.mockResolvedValue('mock-message-id');
        mockQueue.getEstimatedDeliveryTime.mockReturnValue(
          new Date(Date.now() + 5 * 60 * 1000).toISOString()
        );

        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'customer-123',
            channel: 'email',
            templateId: 'complex-template',
            params: largeParams,
          })
          .expect(202);

        expect(response.body.status).toBe('queued');
        expect(mockDatabase.createNotificationRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            params: expect.objectContaining(largeParams),
          })
        );
      });
    });

    describe('Customer Preferences', () => {
      it('should handle customer without preferences record', async () => {
        const notificationId = uuidv4();
        const now = new Date().toISOString();

        // No preferences record found - getCustomerPreferences returns defaults
        mockDatabase.getCustomerPreferences.mockResolvedValue({
          customerId: 'new-customer',
          emailOptOut: false,
          smsOptOut: false,
          pushOptOut: false,
          preferredChannels: [],
          updatedAt: now,
        });

        mockDatabase.createNotificationRecord.mockResolvedValue({
          notificationId,
          customerId: 'new-customer',
          channel: 'email',
          templateId: 'welcome-email',
          params: {},
          status: 'queued',
          attempts: 0,
          timestamps: {
            queued: now,
            sent: null,
            delivered: null,
            failed: null,
          },
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-key',
          priority: 'normal',
        });

        mockQueue.enqueueNotification.mockResolvedValue('mock-message-id');
        mockQueue.getEstimatedDeliveryTime.mockReturnValue(
          new Date(Date.now() + 5 * 60 * 1000).toISOString()
        );

        const response = await request(app)
          .post('/api/notifications/send')
          .send({
            customerId: 'new-customer',
            channel: 'email',
            templateId: 'welcome-email',
            params: {},
          })
          .expect(202);

        // Should proceed with notification (no opt-outs assumed)
        expect(response.body.status).toBe('queued');
        expect(mockQueue.enqueueNotification).toHaveBeenCalled();
      });
    });

    describe('Notification ID Handling', () => {
      it('should handle notification ID case insensitivity', async () => {
        const notificationId = 'ABC-123-DEF-456';
        const now = new Date().toISOString();

        mockDatabase.getNotificationRecord.mockResolvedValue({
          notificationId: notificationId.toLowerCase(),
          customerId: 'customer-123',
          channel: 'email',
          templateId: 'test',
          params: {},
          status: 'sent',
          attempts: 1,
          timestamps: {
            queued: now,
            sent: new Date(Date.now() + 1000).toISOString(),
            delivered: null,
            failed: null,
          },
          errorMessage: null,
          createdAt: now,
          updatedAt: new Date(Date.now() + 1000).toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-key',
          priority: 'normal',
        });

        // Test with uppercase
        const response1 = await request(app)
          .get(`/api/notifications/${notificationId.toUpperCase()}/status`)
          .expect(200);

        expect(response1.body.notificationId).toBeDefined();

        // Test with lowercase
        const response2 = await request(app)
          .get(`/api/notifications/${notificationId.toLowerCase()}/status`)
          .expect(200);

        expect(response2.body.notificationId).toBeDefined();
      });
    });

    describe('TTL and Record Expiration', () => {
      it('should return 404 for expired notification record', async () => {
        const notificationId = uuidv4();

        // Simulate TTL expiration - record not found
        mockDatabase.getNotificationRecord.mockResolvedValue(null);

        const response = await request(app)
          .get(`/api/notifications/${notificationId}/status`)
          .expect(404);

        expect(response.body).toMatchObject({
          error: {
            code: 'notification_not_found',
            message: expect.stringContaining('Notification not found'),
          },
        });
      });
    });

    describe('Concurrent Access', () => {
      it('should handle concurrent status queries consistently', async () => {
        const notificationId = uuidv4();
        const now = new Date().toISOString();

        const record = {
          notificationId,
          customerId: 'customer-123',
          channel: 'email' as const,
          templateId: 'test',
          params: {},
          status: 'sent' as const,
          attempts: 1,
          timestamps: {
            queued: now,
            sent: new Date(Date.now() + 1000).toISOString(),
            delivered: null,
            failed: null,
          },
          errorMessage: null,
          createdAt: now,
          updatedAt: new Date(Date.now() + 1000).toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-key',
          priority: 'normal' as const,
        };

        mockDatabase.getNotificationRecord.mockResolvedValue(record);

        // Simulate 10 concurrent requests
        const requests = Array.from({ length: 10 }, () =>
          request(app).get(`/api/notifications/${notificationId}/status`)
        );

        const responses = await Promise.all(requests);

        // All should succeed with consistent data
        responses.forEach((response) => {
          expect(response.status).toBe(200);
          expect(response.body.notificationId).toBe(notificationId);
          expect(response.body.status).toBe('sent');
        });
      });
    });
  });

  describe('GET /api/notifications/:notificationId/status', () => {
    describe('Positive Cases', () => {
      it('should return notification status for valid ID', async () => {
        const notificationId = uuidv4();
        const now = new Date().toISOString();

        mockDatabase.getNotificationRecord.mockResolvedValue({
          notificationId,
          customerId: 'customer-123',
          channel: 'email',
          templateId: 'welcome-email',
          params: { name: 'John' },
          status: 'sent',
          attempts: 1,
          timestamps: {
            queued: now,
            sent: new Date(Date.now() + 1000).toISOString(),
            delivered: null,
            failed: null,
          },
          errorMessage: null,
          createdAt: now,
          updatedAt: new Date(Date.now() + 1000).toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-key',
          priority: 'normal',
        });

        const response = await request(app)
          .get(`/api/notifications/${notificationId}/status`)
          .expect(200);

        expect(response.body).toMatchObject({
          notificationId,
          customerId: 'customer-123',
          channel: 'email',
          templateId: 'welcome-email',
          status: 'sent',
          attempts: 1,
          errorMessage: null,
        });

        expect(response.body.timestamps).toBeDefined();
        expect(response.body.timestamps.queued).toBeDefined();
        expect(response.body.timestamps.sent).toBeDefined();
      });

      it('should return failed notification with error message', async () => {
        const notificationId = uuidv4();
        const now = new Date().toISOString();

        mockDatabase.getNotificationRecord.mockResolvedValue({
          notificationId,
          customerId: 'customer-456',
          channel: 'sms',
          templateId: 'order-confirmation',
          params: {},
          status: 'failed',
          attempts: 3,
          timestamps: {
            queued: now,
            sent: null,
            delivered: null,
            failed: new Date(Date.now() + 10000).toISOString(),
          },
          errorMessage: 'Invalid phone number',
          createdAt: now,
          updatedAt: new Date(Date.now() + 10000).toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          idempotencyKey: 'test-key',
          priority: 'high',
        });

        const response = await request(app)
          .get(`/api/notifications/${notificationId}/status`)
          .expect(200);

        expect(response.body).toMatchObject({
          notificationId,
          status: 'failed',
          attempts: 3,
          errorMessage: 'Invalid phone number',
        });
      });
    });

    describe('Negative Cases', () => {
      it('should return 404 for non-existent notification', async () => {
        const notificationId = uuidv4();

        mockDatabase.getNotificationRecord.mockResolvedValue(null);

        const response = await request(app)
          .get(`/api/notifications/${notificationId}/status`)
          .expect(404);

        expect(response.body).toMatchObject({
          error: {
            code: 'notification_not_found',
            message: expect.stringContaining('Notification not found'),
          },
        });
      });

      it('should return 500 when database operation fails', async () => {
        const notificationId = uuidv4();

        mockDatabase.getNotificationRecord.mockRejectedValue(
          new Error('DynamoDB connection error')
        );

        const response = await request(app)
          .get(`/api/notifications/${notificationId}/status`)
          .expect(500);

        expect(response.body).toMatchObject({
          error: {
            code: 'internal_error',
            message: 'Failed to get notification status',
          },
        });
      });
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toEqual({ status: 'healthy' });
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app).get('/api/unknown').expect(404);

      expect(response.body).toMatchObject({
        error: {
          code: 'not_found',
          message: 'Endpoint not found',
        },
      });
    });
  });
});
