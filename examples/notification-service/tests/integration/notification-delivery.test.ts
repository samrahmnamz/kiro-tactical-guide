/**
 * Integration Tests: Notification Delivery
 * 
 * Tests direct notification processing including:
 * - Multi-channel delivery (email, SMS, push)
 * - Retry mechanism with exponential backoff timing
 * - Transient vs permanent error classification
 * - Dead letter queue handling
 * - Template rendering for all channels
 * - Opt-out enforcement
 */

// Set environment variables BEFORE any imports
process.env.DYNAMODB_TABLE_NOTIFICATIONS = 'test-notifications-table';
process.env.DYNAMODB_TABLE_PREFERENCES = 'test-preferences-table';

// Create a shared mock function that we'll control from tests
const mockSend = jest.fn();

// Mock AWS SDK modules BEFORE any imports that use them
jest.mock('@aws-sdk/client-ses', () => {
  return {
    SESClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    SendEmailCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});

jest.mock('@aws-sdk/client-sns', () => {
  return {
    SNSClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PublishCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});

jest.mock('@aws-sdk/lib-dynamodb', () => {
  return {
    DynamoDBDocumentClient: {
      from: jest.fn(() => ({
        send: mockSend,
      })),
    },
    PutCommand: jest.fn().mockImplementation((input) => ({ input, constructor: { name: 'PutCommand' } })),
    GetCommand: jest.fn().mockImplementation((input) => ({ input, constructor: { name: 'GetCommand' } })),
    UpdateCommand: jest.fn().mockImplementation((input) => ({ input, constructor: { name: 'UpdateCommand' } })),
    QueryCommand: jest.fn().mockImplementation((input) => ({ input, constructor: { name: 'QueryCommand' } })),
  };
});

// NOW import the modules that depend on the mocks
import { processNotification, isOptedOut } from '../../src/notification-service';
import {
  createNotificationRecord,
  getNotificationRecord,
  getCustomerPreferences,
  updateOptOutPreference,
} from '../../src/database';
import { QueueMessage, NotificationRecord, CustomerPreferences } from '../../src/types';
import { v4 as uuidv4 } from 'uuid';
import { SendEmailCommand } from '@aws-sdk/client-ses';
import { PublishCommand } from '@aws-sdk/client-sns';

// Helper to filter mock calls by type
const getEmailCalls = () => mockSend.mock.calls.filter(call => call[0].input?.Destination !== undefined);
const getSmsCalls = () => mockSend.mock.calls.filter(call => call[0].input?.PhoneNumber !== undefined);
const getPushCalls = () => mockSend.mock.calls.filter(call => call[0].input?.TargetArn !== undefined && call[0].input?.MessageStructure === 'json');

describe('Notification Delivery Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses for AWS SDK calls
    mockSend.mockImplementation((command: any) => {
      // Check command type by constructor name since instanceof won't work with our mocks
      const commandName = command.constructor?.name || '';
      
      // DynamoDB PutCommand - creating records
      if (commandName === 'PutCommand') {
        return Promise.resolve({});
      }
      
      // DynamoDB UpdateCommand - updating records
      if (commandName === 'UpdateCommand') {
        return Promise.resolve({});
      }
      
      // DynamoDB GetCommand - retrieving records
      if (commandName === 'GetCommand') {
        const key = command.input.Key;
        
        // If looking up a notification record
        if (key?.notificationId) {
          return Promise.resolve({
            Item: {
              notificationId: key.notificationId,
              status: 'sent',
              attempts: 1,
              timestamps: {
                queued: new Date().toISOString(),
                sent: new Date().toISOString(),
                delivered: null,
                failed: null,
              },
            },
          });
        }
        
        // If looking up customer preferences
        if (key?.customerId) {
          return Promise.resolve({
            Item: {
              customerId: key.customerId,
              emailOptOut: false,
              smsOptOut: false,
              pushOptOut: false,
              preferredChannels: [],
              updatedAt: new Date().toISOString(),
            },
          });
        }
        
        // Default empty response
        return Promise.resolve({});
      }
      
      // SES SendEmailCommand or SNS PublishCommand - sending notifications
      if (command.input?.Destination || command.input?.PhoneNumber || command.input?.TargetArn || command.input?.Message) {
        return Promise.resolve({ MessageId: 'mock-message-id' });
      }
      
      // Default success response
      return Promise.resolve({});
    });
  });

  describe('Multi-channel delivery', () => {
    test('should send email notification successfully', async () => {
      const notificationId = uuidv4();
      const customerId = 'test-customer-email';
      
      // Setup: Create notification record
      const record: NotificationRecord = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'order-confirmation',
        params: { orderId: 'ORDER-123', amount: 99.99 },
        status: 'queued',
        attempts: 0,
        timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 7776000,
        idempotencyKey: undefined,
        priority: 'normal',
      };

      await createNotificationRecord(record);

      const message: QueueMessage = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'order-confirmation',
        params: { orderId: 'ORDER-123', amount: 99.99 },
        priority: 'normal',
      };

      // Execute
      await processNotification(message);

      // Verify: SES was called (filter out DynamoDB calls)
      const sesCalls = mockSend.mock.calls.filter(call => {
        const cmd = call[0];
        return cmd.input?.Destination !== undefined; // SendEmailCommand has Destination
      });
      expect(sesCalls.length).toBeGreaterThan(0);
      
      const sendCommand = sesCalls[0][0];
      expect(sendCommand.input.Destination.ToAddresses[0]).toBe(`customer-${customerId}@example.com`);
      expect(sendCommand.input.Message.Subject.Data).toContain('order-confirmation');

      // Verify: Status updated to 'sent'
      const updatedRecord = await getNotificationRecord(notificationId);
      expect(updatedRecord?.status).toBe('sent');
      expect(updatedRecord?.timestamps.sent).not.toBeNull();
    });

    test('should send SMS notification successfully', async () => {
      const notificationId = uuidv4();
      const customerId = 'test-customer-sms';
      
      const record: NotificationRecord = {
        notificationId,
        customerId,
        channel: 'sms',
        templateId: 'delivery-update',
        params: { trackingNumber: 'TRACK-456' },
        status: 'queued',
        attempts: 0,
        timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 7776000,
        idempotencyKey: undefined,
        priority: 'high',
      };

      await createNotificationRecord(record);

      const message: QueueMessage = {
        notificationId,
        customerId,
        channel: 'sms',
        templateId: 'delivery-update',
        params: { trackingNumber: 'TRACK-456' },
        priority: 'high',
      };

      // Mock successful SNS send
      mockSend.mockResolvedValueOnce({});

      // Execute
      await processNotification(message);

      // Verify: SNS was called with correct parameters (filter out DynamoDB calls)
      const snsCalls = mockSend.mock.calls.filter(call => {
        const cmd = call[0];
        return cmd.input?.PhoneNumber !== undefined; // SNS SMS has PhoneNumber
      });
      expect(snsCalls.length).toBe(1);
      
      const publishCommand = snsCalls[0][0];
      expect(publishCommand.input.PhoneNumber).toBe(`+1555${customerId.substring(0, 7)}`);
      expect(publishCommand.input.Message).toContain('delivery-update');
      expect(publishCommand.input.MessageAttributes['AWS.SNS.SMS.SMSType'].StringValue).toBe('Transactional');

      // Verify: Status updated to 'sent'
      const updatedRecord = await getNotificationRecord(notificationId);
      expect(updatedRecord?.status).toBe('sent');
    });

    test('should send push notification successfully', async () => {
      const notificationId = uuidv4();
      const customerId = 'test-customer-push';
      
      const record: NotificationRecord = {
        notificationId,
        customerId,
        channel: 'push',
        templateId: 'new-message',
        params: { sender: 'John Doe', preview: 'Hey there!' },
        status: 'queued',
        attempts: 0,
        timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 7776000,
        idempotencyKey: undefined,
        priority: 'high',
      };

      await createNotificationRecord(record);

      const message: QueueMessage = {
        notificationId,
        customerId,
        channel: 'push',
        templateId: 'new-message',
        params: { sender: 'John Doe', preview: 'Hey there!' },
        priority: 'high',
      };

      // Mock successful SNS send
      mockSend.mockResolvedValueOnce({});

      // Execute
      await processNotification(message);

      // Verify: SNS was called with correct push payload (filter out DynamoDB calls)
      const snsCalls = mockSend.mock.calls.filter(call => {
        const cmd = call[0];
        return cmd.input?.TargetArn !== undefined; // SNS push has TargetArn
      });
      expect(snsCalls.length).toBe(1);
      
      const publishCommand = snsCalls[0][0];
      expect(publishCommand.input.MessageStructure).toBe('json');
      expect(publishCommand.input.TargetArn).toContain(customerId);

      // Parse and verify message structure
      const pushPayload = JSON.parse(publishCommand.input.Message);
      expect(pushPayload.default).toContain('new-message');
      expect(pushPayload.GCM).toBeDefined();
      expect(pushPayload.APNS).toBeDefined();

      // Verify: Status updated to 'sent'
      const updatedRecord = await getNotificationRecord(notificationId);
      expect(updatedRecord?.status).toBe('sent');
    });
  });

  describe('Retry mechanism with exponential backoff', () => {
    test('should retry with exponential backoff timing (1s, 4s, 16s)', async () => {
      const notificationId = uuidv4();
      const customerId = 'test-retry-timing';
      
      const record: NotificationRecord = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'test-template',
        params: {},
        status: 'queued',
        attempts: 0,
        timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 7776000,
        idempotencyKey: undefined,
        priority: 'normal',
      };

      await createNotificationRecord(record);

      const message: QueueMessage = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'test-template',
        params: {},
        priority: 'normal',
      };

      // Mock transient errors (rate limit) with timing tracking
      const timestamps: number[] = [];
      const startTime = Date.now();
      const transientError = new Error('Throttling: Rate exceeded');
      
      mockSend.mockImplementation((command: any) => {
        const commandName = command.constructor?.name || '';
        
        // Handle DynamoDB operations normally
        if (commandName === 'PutCommand' || commandName === 'UpdateCommand') {
          return Promise.resolve({});
        }
        if (commandName === 'GetCommand') {
          const key = command.input.Key;
          if (key?.notificationId) {
            return Promise.resolve({
              Item: {
                notificationId: key.notificationId,
                status: timestamps.length >= 3 ? 'sent' : 'queued',
                attempts: timestamps.length,
                timestamps: {
                  queued: new Date().toISOString(),
                  sent: timestamps.length >= 3 ? new Date().toISOString() : null,
                  delivered: null,
                  failed: null,
                },
              },
            });
          }
          if (key?.customerId) {
            return Promise.resolve({
              Item: {
                customerId: key.customerId,
                emailOptOut: false,
                smsOptOut: false,
                pushOptOut: false,
              },
            });
          }
        }
        
        // For email sending (SES), apply retry logic
        if (command.input?.Destination) {
          timestamps.push(Date.now() - startTime);
          if (timestamps.length <= 2) {
            return Promise.reject(transientError);
          }
          return Promise.resolve({ MessageId: 'mock-message-id' });
        }
        
        return Promise.resolve({});
      });

      // Execute
      await processNotification(message);

      // Verify: 3 attempts were made (filter email send calls only)
      const emailCalls = mockSend.mock.calls.filter(call => call[0].input?.Destination !== undefined);
      expect(emailCalls.length).toBe(3);

      // Verify: Exponential backoff timing (with tolerance for execution time)
      expect(timestamps[0]).toBeLessThan(500); // First attempt immediate
      expect(timestamps[1]).toBeGreaterThanOrEqual(1000); // ~1s delay
      expect(timestamps[1]).toBeLessThan(1500);
      expect(timestamps[2]).toBeGreaterThanOrEqual(5000); // ~4s additional delay (1s + 4s)
      expect(timestamps[2]).toBeLessThan(6000);

      // Verify: Status updated to 'sent' after retry
      const updatedRecord = await getNotificationRecord(notificationId);
      expect(updatedRecord?.status).toBe('sent');
      expect(updatedRecord?.attempts).toBeGreaterThan(0);
    });

    test('should fail after max retries on transient errors', async () => {
      const notificationId = uuidv4();
      const customerId = 'test-max-retries';
      
      const record: NotificationRecord = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'test-template',
        params: {},
        status: 'queued',
        attempts: 0,
        timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 7776000,
        idempotencyKey: undefined,
        priority: 'normal',
      };

      await createNotificationRecord(record);

      const message: QueueMessage = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'test-template',
        params: {},
        priority: 'normal',
      };

      // Mock persistent transient error
      const transientError = new Error('ServiceUnavailable: Temporary service issue');
      mockSend.mockRejectedValue(transientError);

      // Execute
      await processNotification(message);

      // Verify: Max 3 attempts were made
      expect(mockSend).toHaveBeenCalledTimes(3);

      // Verify: Status marked as 'failed' with error message
      const updatedRecord = await getNotificationRecord(notificationId);
      expect(updatedRecord?.status).toBe('failed');
      expect(updatedRecord?.errorMessage).toContain('Max retries exceeded');
      expect(updatedRecord?.timestamps.failed).not.toBeNull();
    });
  });

  describe('Error classification: Permanent vs Transient', () => {
    test('should fail immediately on permanent error without retries', async () => {
      const notificationId = uuidv4();
      const customerId = 'test-permanent-error';
      
      const record: NotificationRecord = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'test-template',
        params: {},
        status: 'queued',
        attempts: 0,
        timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 7776000,
        idempotencyKey: undefined,
        priority: 'normal',
      };

      await createNotificationRecord(record);

      const message: QueueMessage = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'test-template',
        params: {},
        priority: 'normal',
      };

      // Mock permanent error
      const permanentError = new Error('InvalidEmail: Email address is malformed');
      mockSend.mockRejectedValue(permanentError);

      // Execute
      await processNotification(message);

      // Verify: Only 1 attempt (no retries)
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Verify: Status marked as 'failed' immediately
      const updatedRecord = await getNotificationRecord(notificationId);
      expect(updatedRecord?.status).toBe('failed');
      expect(updatedRecord?.errorMessage).toContain('InvalidEmail');
      expect(updatedRecord?.timestamps.failed).not.toBeNull();
    });

    test('should classify various permanent errors correctly', async () => {
      const permanentErrors = [
        'InvalidParameterValue: Parameter X is invalid',
        'InvalidEmail: Email format is wrong',
        'InvalidPhoneNumber: Phone number format is invalid',
        'MessageRejected: Content contains spam',
        'MailFromDomainNotVerifiedException: Domain not verified in SES',
      ];

      for (const errorMessage of permanentErrors) {
        const notificationId = uuidv4();
        const customerId = `test-permanent-${permanentErrors.indexOf(errorMessage)}`;
        
        const record: NotificationRecord = {
          notificationId,
          customerId,
          channel: 'email',
          templateId: 'test-template',
          params: {},
          status: 'queued',
          attempts: 0,
          timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
          errorMessage: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 7776000,
          idempotencyKey: undefined,
          priority: 'normal',
        };

        await createNotificationRecord(record);

        const message: QueueMessage = {
          notificationId,
          customerId,
          channel: 'email',
          templateId: 'test-template',
          params: {},
          priority: 'normal',
        };

        mockSend.mockRejectedValueOnce(new Error(errorMessage));

        // Execute
        await processNotification(message);

        // Verify: Only 1 attempt for permanent error
        expect(mockSend).toHaveBeenCalledTimes(1);

        // Verify: Failed immediately
        const updatedRecord = await getNotificationRecord(notificationId);
        expect(updatedRecord?.status).toBe('failed');
        expect(updatedRecord?.errorMessage).toContain(errorMessage.split(':')[0]);

        mockSend.mockClear();
      }
    });
  });

  describe('Template rendering', () => {
    test('should render email template with parameters', async () => {
      const notificationId = uuidv4();
      const customerId = 'test-email-template';
      const templateParams = {
        userName: 'Alice',
        orderId: 'ORDER-789',
        amount: 149.99,
      };
      
      const record: NotificationRecord = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'order-confirmation',
        params: templateParams as any,
        status: 'queued',
        attempts: 0,
        timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 7776000,
        idempotencyKey: undefined,
        priority: 'normal',
      };

      await createNotificationRecord(record);

      const message: QueueMessage = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'order-confirmation',
        params: templateParams as any,
        priority: 'normal',
      };

      mockSend.mockResolvedValueOnce({});

      // Execute
      await processNotification(message);

      // Verify: Email contains template data
      const sendCommand = mockSend.mock.calls[0][0];
      expect(sendCommand.input.Message.Subject.Data).toContain('order-confirmation');
      expect(sendCommand.input.Message.Body.Text.Data).toContain('Alice');
      expect(sendCommand.input.Message.Body.Text.Data).toContain('ORDER-789');
      expect(sendCommand.input.Message.Body.Text.Data).toContain('149.99');
    });

    test('should render SMS template with parameters', async () => {
      const notificationId = uuidv4();
      const customerId = 'test-sms-template';
      const templateParams = {
        trackingNumber: 'TRACK-999',
        estimatedDelivery: '2024-01-20',
      };
      
      const record: NotificationRecord = {
        notificationId,
        customerId,
        channel: 'sms',
        templateId: 'shipping-update',
        params: templateParams,
        status: 'queued',
        attempts: 0,
        timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 7776000,
        idempotencyKey: undefined,
        priority: 'normal',
      };

      await createNotificationRecord(record);

      const message: QueueMessage = {
        notificationId,
        customerId,
        channel: 'sms',
        templateId: 'shipping-update',
        params: templateParams,
        priority: 'normal',
      };

      mockSend.mockResolvedValueOnce({});

      // Execute
      await processNotification(message);

      // Verify: SMS contains template data
      const publishCommand = mockSend.mock.calls[0][0];
      expect(publishCommand.input.Message).toContain('shipping-update');
      expect(publishCommand.input.Message).toContain('TRACK-999');
      expect(publishCommand.input.Message).toContain('2024-01-20');
    });

    test('should render push notification template with parameters', async () => {
      const notificationId = uuidv4();
      const customerId = 'test-push-template';
      const templateParams = {
        sender: 'Bob Smith',
        messagePreview: 'Hello! How are you?',
        chatId: 'chat-123',
      };
      
      const record: NotificationRecord = {
        notificationId,
        customerId,
        channel: 'push',
        templateId: 'new-chat-message',
        params: templateParams,
        status: 'queued',
        attempts: 0,
        timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 7776000,
        idempotencyKey: undefined,
        priority: 'normal',
      };

      await createNotificationRecord(record);

      const message: QueueMessage = {
        notificationId,
        customerId,
        channel: 'push',
        templateId: 'new-chat-message',
        params: templateParams,
        priority: 'normal',
      };

      mockSend.mockResolvedValueOnce({});

      // Execute
      await processNotification(message);

      // Verify: Push notification contains template data
      const publishCommand = mockSend.mock.calls[0][0];
      const pushMessage = JSON.parse(publishCommand.input.Message);
      
      expect(pushMessage.default).toContain('new-chat-message');
      
      // Verify GCM payload
      const gcmPayload = JSON.parse(pushMessage.GCM);
      expect(gcmPayload.notification.title).toBe('new-chat-message');
      expect(gcmPayload.notification.body).toContain('Bob Smith');
      
      // Verify APNS payload
      const apnsPayload = JSON.parse(pushMessage.APNS);
      expect(apnsPayload.aps.alert.title).toBe('new-chat-message');
      expect(apnsPayload.aps.alert.body).toContain('messagePreview');
    });
  });

  describe('Opt-out enforcement', () => {
    test('should suppress notification when customer opted out of email', async () => {
      const customerId = 'test-opt-out-email';
      
      // Set email opt-out preference
      await updateOptOutPreference(customerId, 'email', true);

      const notificationId = uuidv4();
      const record: NotificationRecord = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'promotional',
        params: {},
        status: 'queued',
        attempts: 0,
        timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 7776000,
        idempotencyKey: undefined,
        priority: 'normal',
      };

      await createNotificationRecord(record);

      const message: QueueMessage = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'promotional',
        params: {},
        priority: 'normal',
      };

      // Execute
      await processNotification(message);

      // Verify: No email sent
      expect(mockSend).not.toHaveBeenCalled();

      // Verify: Status marked as 'suppressed'
      const updatedRecord = await getNotificationRecord(notificationId);
      expect(updatedRecord?.status).toBe('suppressed');
    });

    test('should check opt-out preferences correctly with isOptedOut function', () => {
      const preferences: CustomerPreferences = {
        customerId: 'test-customer',
        emailOptOut: true,
        smsOptOut: false,
        pushOptOut: true,
        preferredChannels: [],
        updatedAt: new Date().toISOString(),
      };

      expect(isOptedOut(preferences, 'email')).toBe(true);
      expect(isOptedOut(preferences, 'sms')).toBe(false);
      expect(isOptedOut(preferences, 'push')).toBe(true);
    });

    test('should allow notification when customer has not opted out', async () => {
      const customerId = 'test-no-opt-out';
      
      // Ensure customer has not opted out (defaults to false)
      await updateOptOutPreference(customerId, 'sms', false);

      const notificationId = uuidv4();
      const record: NotificationRecord = {
        notificationId,
        customerId,
        channel: 'sms',
        templateId: 'account-alert',
        params: {},
        status: 'queued',
        attempts: 0,
        timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 7776000,
        idempotencyKey: undefined,
        priority: 'high',
      };

      await createNotificationRecord(record);

      const message: QueueMessage = {
        notificationId,
        customerId,
        channel: 'sms',
        templateId: 'account-alert',
        params: {},
        priority: 'high',
      };

      mockSend.mockResolvedValueOnce({});

      // Execute
      await processNotification(message);

      // Verify: SMS sent
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Verify: Status updated to 'sent'
      const updatedRecord = await getNotificationRecord(notificationId);
      expect(updatedRecord?.status).toBe('sent');
    });
  });

  describe('Dead Letter Queue scenarios', () => {
    test('should mark notification as failed for DLQ after exhausting retries', async () => {
      const notificationId = uuidv4();
      const customerId = 'test-dlq-scenario';
      
      const record: NotificationRecord = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'test-template',
        params: {},
        status: 'queued',
        attempts: 0,
        timestamps: { queued: new Date().toISOString(), sent: null, delivered: null, failed: null },
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 7776000,
        idempotencyKey: undefined,
        priority: 'normal',
      };

      await createNotificationRecord(record);

      const message: QueueMessage = {
        notificationId,
        customerId,
        channel: 'email',
        templateId: 'test-template',
        params: {},
        priority: 'normal',
      };

      // Mock persistent transient error (simulates DLQ scenario)
      mockSend.mockRejectedValue(new Error('ConnectionTimeout: Unable to connect'));

      // Execute
      await processNotification(message);

      // Verify: All 3 attempts exhausted
      expect(mockSend).toHaveBeenCalledTimes(3);

      // Verify: Status marked as 'failed' for DLQ processing
      const updatedRecord = await getNotificationRecord(notificationId);
      expect(updatedRecord?.status).toBe('failed');
      expect(updatedRecord?.errorMessage).toContain('Max retries exceeded');
      expect(updatedRecord?.attempts).toBeGreaterThan(0);
      
      // This record would now be moved to DLQ by SQS for manual investigation
    });

    test('should handle missing notification record gracefully', async () => {
      const message: QueueMessage = {
        notificationId: 'non-existent-notification',
        customerId: 'test-customer',
        channel: 'email',
        templateId: 'test-template',
        params: {},
        priority: 'normal',
      };

      // Execute - should not throw
      await processNotification(message);

      // Verify: No AWS SDK calls made
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
