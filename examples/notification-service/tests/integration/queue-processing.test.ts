/**
 * Integration Tests: Queue Processing
 * 
 * Tests SQS queue operations including:
 * - Priority queue routing (high, normal, low)
 * - Queue message enqueue and dequeue workflow
 * - Message visibility timeout behavior
 * - Estimated delivery time calculations
 */

// Set environment variables BEFORE imports to avoid initialization errors
process.env.SQS_HIGH_PRIORITY_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/high-priority-queue';
process.env.SQS_NORMAL_PRIORITY_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/normal-priority-queue';
process.env.SQS_LOW_PRIORITY_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/low-priority-queue';

// Create a shared mock function that we'll control from tests
const mockSend = jest.fn();

// Mock AWS SDK SQS client BEFORE any imports that use it
jest.mock('@aws-sdk/client-sqs', () => {
  return {
    SQSClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    SendMessageCommand: jest.fn().mockImplementation((input) => ({ input })),
    ReceiveMessageCommand: jest.fn().mockImplementation((input) => ({ input })),
    DeleteMessageCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});

// NOW import the modules that depend on the mocks
import {
  enqueueNotification,
  receiveMessages,
  getEstimatedDeliveryTime,
} from '../../src/queue';
import { QueueMessage, NotificationPriority } from '../../src/types';
import { v4 as uuidv4 } from 'uuid';
import { SendMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';

describe('Queue Processing Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Priority queue routing', () => {
    test('should route high-priority notification to high-priority queue', async () => {
      const notificationId = uuidv4();
      const message: QueueMessage = {
        notificationId,
        customerId: 'customer-123',
        channel: 'email',
        templateId: 'urgent-alert',
        params: { severity: 'critical' },
        priority: 'high',
      };

      mockSend.mockResolvedValueOnce({ MessageId: 'msg-high-123' });

      // Execute
      const messageId = await enqueueNotification(message, 'high');

      // Verify: Message sent to high-priority queue
      expect(mockSend).toHaveBeenCalledTimes(1);
      const sendCommand = mockSend.mock.calls[0][0];
      expect(sendCommand.input).toBeDefined();
      expect(sendCommand.input.QueueUrl).toBe(process.env.SQS_HIGH_PRIORITY_QUEUE_URL);
      expect(sendCommand.input.MessageBody).toContain(notificationId);
      
      // Verify: Message attributes set correctly
      expect(sendCommand.input.MessageAttributes.priority.StringValue).toBe('high');
      expect(sendCommand.input.MessageAttributes.channel.StringValue).toBe('email');
      
      // Verify: Returns message ID
      expect(messageId).toBe('msg-high-123');
    });

    test('should route normal-priority notification to normal-priority queue', async () => {
      const notificationId = uuidv4();
      const message: QueueMessage = {
        notificationId,
        customerId: 'customer-456',
        channel: 'sms',
        templateId: 'order-confirmation',
        params: { orderId: 'ORDER-789' },
        priority: 'normal',
      };

      mockSend.mockResolvedValueOnce({ MessageId: 'msg-normal-456' });

      // Execute (default priority is 'normal')
      const messageId = await enqueueNotification(message);

      // Verify: Message sent to normal-priority queue
      expect(mockSend).toHaveBeenCalledTimes(1);
      const sendCommand = mockSend.mock.calls[0][0];
      expect(sendCommand.input.QueueUrl).toBe(process.env.SQS_NORMAL_PRIORITY_QUEUE_URL);
      expect(sendCommand.input.MessageAttributes.priority.StringValue).toBe('normal');
      expect(messageId).toBe('msg-normal-456');
    });

    test('should route low-priority notification to low-priority queue', async () => {
      const notificationId = uuidv4();
      const message: QueueMessage = {
        notificationId,
        customerId: 'customer-789',
        channel: 'push',
        templateId: 'newsletter',
        params: { edition: 'weekly' },
        priority: 'low',
      };

      mockSend.mockResolvedValueOnce({ MessageId: 'msg-low-789' });

      // Execute
      const messageId = await enqueueNotification(message, 'low');

      // Verify: Message sent to low-priority queue
      expect(mockSend).toHaveBeenCalledTimes(1);
      const sendCommand = mockSend.mock.calls[0][0];
      expect(sendCommand.input.QueueUrl).toBe(process.env.SQS_LOW_PRIORITY_QUEUE_URL);
      expect(sendCommand.input.MessageAttributes.priority.StringValue).toBe('low');
      expect(messageId).toBe('msg-low-789');
    });

    test('should throw error if queue URL not configured', async () => {
      // Temporarily remove queue URL
      const originalUrl = process.env.SQS_HIGH_PRIORITY_QUEUE_URL;
      delete process.env.SQS_HIGH_PRIORITY_QUEUE_URL;

      const message: QueueMessage = {
        notificationId: uuidv4(),
        customerId: 'customer-123',
        channel: 'email',
        templateId: 'test',
        params: {},
        priority: 'high',
      };

      // Execute and verify error
      await expect(enqueueNotification(message, 'high')).rejects.toThrow(
        /Queue URL not configured for priority: high/
      );
      
      // Restore the environment variable
      process.env.SQS_HIGH_PRIORITY_QUEUE_URL = originalUrl;
    });
  });

  describe('Queue message processing workflow', () => {
    test('should receive messages from queue with correct parameters', async () => {
      const messages = [
        {
          MessageId: 'msg-1',
          ReceiptHandle: 'receipt-1',
          Body: JSON.stringify({
            notificationId: 'notif-1',
            customerId: 'customer-1',
            channel: 'email',
            templateId: 'welcome',
            params: {},
            priority: 'normal',
          }),
          MessageAttributes: {
            priority: { DataType: 'String', StringValue: 'normal' },
            channel: { DataType: 'String', StringValue: 'email' },
          },
        },
        {
          MessageId: 'msg-2',
          ReceiptHandle: 'receipt-2',
          Body: JSON.stringify({
            notificationId: 'notif-2',
            customerId: 'customer-2',
            channel: 'sms',
            templateId: 'alert',
            params: {},
            priority: 'normal',
          }),
          MessageAttributes: {
            priority: { DataType: 'String', StringValue: 'normal' },
            channel: { DataType: 'String', StringValue: 'sms' },
          },
        },
      ];

      mockSend.mockResolvedValueOnce({ Messages: messages });

      // Execute
      const receivedMessages = await receiveMessages('normal', 10);

      // Verify: Receive command sent with correct parameters
      expect(mockSend).toHaveBeenCalledTimes(1);
      const receiveCommand = mockSend.mock.calls[0][0];
      expect(receiveCommand.input).toBeDefined();
      expect(receiveCommand.input.QueueUrl).toBe(process.env.SQS_NORMAL_PRIORITY_QUEUE_URL);
      expect(receiveCommand.input.MaxNumberOfMessages).toBe(10);
      expect(receiveCommand.input.WaitTimeSeconds).toBe(20); // Long polling
      expect(receiveCommand.input.VisibilityTimeout).toBe(30);
      expect(receiveCommand.input.MessageAttributeNames).toEqual(['All']);

      // Verify: Messages parsed correctly
      expect(receivedMessages).toHaveLength(2);
      expect(receivedMessages[0].notificationId).toBe('notif-1');
      expect(receivedMessages[0].channel).toBe('email');
      expect(receivedMessages[1].notificationId).toBe('notif-2');
      expect(receivedMessages[1].channel).toBe('sms');
    });

    test('should return empty array when no messages available', async () => {
      mockSend.mockResolvedValueOnce({ Messages: [] });

      // Execute
      const receivedMessages = await receiveMessages('normal');

      // Verify: Empty array returned
      expect(receivedMessages).toEqual([]);
    });

    test('should handle queue with no messages gracefully', async () => {
      mockSend.mockResolvedValueOnce({});

      // Execute
      const receivedMessages = await receiveMessages('high');

      // Verify: Empty array returned when Messages is undefined
      expect(receivedMessages).toEqual([]);
    });

    test('should receive from different priority queues independently', async () => {
      // Mock responses for different queues
      const highPriorityMessage = {
        MessageId: 'msg-high',
        ReceiptHandle: 'receipt-high',
        Body: JSON.stringify({
          notificationId: 'notif-high',
          customerId: 'customer-high',
          channel: 'email',
          templateId: 'urgent',
          params: {},
          priority: 'high',
        }),
      };

      const lowPriorityMessage = {
        MessageId: 'msg-low',
        ReceiptHandle: 'receipt-low',
        Body: JSON.stringify({
          notificationId: 'notif-low',
          customerId: 'customer-low',
          channel: 'sms',
          templateId: 'marketing',
          params: {},
          priority: 'low',
        }),
      };

      mockSend
        .mockResolvedValueOnce({ Messages: [highPriorityMessage] })
        .mockResolvedValueOnce({ Messages: [lowPriorityMessage] });

      // Execute: Receive from high and low priority queues
      const highMessages = await receiveMessages('high', 5);
      const lowMessages = await receiveMessages('low', 5);

      // Verify: Different queues accessed
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend.mock.calls[0][0].input.QueueUrl).toBe(process.env.SQS_HIGH_PRIORITY_QUEUE_URL);
      expect(mockSend.mock.calls[1][0].input.QueueUrl).toBe(process.env.SQS_LOW_PRIORITY_QUEUE_URL);

      // Verify: Messages from correct queues
      expect(highMessages[0].notificationId).toBe('notif-high');
      expect(lowMessages[0].notificationId).toBe('notif-low');
    });
  });

  describe('Visibility timeout and message retry', () => {
    test('should configure visibility timeout for message processing', async () => {
      mockSend.mockResolvedValueOnce({ Messages: [] });

      // Execute
      await receiveMessages('normal');

      // Verify: Visibility timeout set to 30 seconds
      const receiveCommand = mockSend.mock.calls[0][0];
      expect(receiveCommand.input.VisibilityTimeout).toBe(30);
    });

    test('should use long polling to reduce empty responses', async () => {
      mockSend.mockResolvedValueOnce({ Messages: [] });

      // Execute
      await receiveMessages('high', 10);

      // Verify: Long polling configured (20 seconds)
      const receiveCommand = mockSend.mock.calls[0][0];
      expect(receiveCommand.input.WaitTimeSeconds).toBe(20);
    });

    test('should configure max messages per receive call', async () => {
      mockSend.mockResolvedValueOnce({ Messages: [] });

      // Execute with custom max messages
      await receiveMessages('normal', 5);

      // Verify: MaxNumberOfMessages set correctly
      const receiveCommand = mockSend.mock.calls[0][0];
      expect(receiveCommand.input.MaxNumberOfMessages).toBe(5);
    });

    test('should default to 10 messages if not specified', async () => {
      mockSend.mockResolvedValueOnce({ Messages: [] });

      // Execute without specifying max messages
      await receiveMessages('low');

      // Verify: Default to 10 messages
      const receiveCommand = mockSend.mock.calls[0][0];
      expect(receiveCommand.input.MaxNumberOfMessages).toBe(10);
    });
  });

  describe('Estimated delivery time calculations', () => {
    test('should calculate high-priority delivery estimate (~30 seconds)', () => {
      const beforeEstimate = new Date();
      const estimate = getEstimatedDeliveryTime('high');
      const afterEstimate = new Date();

      const estimateDate = new Date(estimate);
      const expectedMin = new Date(beforeEstimate.getTime() + 30 * 1000);
      const expectedMax = new Date(afterEstimate.getTime() + 30 * 1000);

      // Verify: Estimate is approximately 30 seconds from now
      expect(estimateDate.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime() - 1000);
      expect(estimateDate.getTime()).toBeLessThanOrEqual(expectedMax.getTime() + 1000);
    });

    test('should calculate normal-priority delivery estimate (~5 minutes)', () => {
      const beforeEstimate = new Date();
      const estimate = getEstimatedDeliveryTime('normal');
      const afterEstimate = new Date();

      const estimateDate = new Date(estimate);
      const expectedMin = new Date(beforeEstimate.getTime() + 5 * 60 * 1000);
      const expectedMax = new Date(afterEstimate.getTime() + 5 * 60 * 1000);

      // Verify: Estimate is approximately 5 minutes from now
      expect(estimateDate.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime() - 1000);
      expect(estimateDate.getTime()).toBeLessThanOrEqual(expectedMax.getTime() + 1000);
    });

    test('should calculate low-priority delivery estimate (~1 hour)', () => {
      const beforeEstimate = new Date();
      const estimate = getEstimatedDeliveryTime('low');
      const afterEstimate = new Date();

      const estimateDate = new Date(estimate);
      const expectedMin = new Date(beforeEstimate.getTime() + 60 * 60 * 1000);
      const expectedMax = new Date(afterEstimate.getTime() + 60 * 60 * 1000);

      // Verify: Estimate is approximately 1 hour from now
      expect(estimateDate.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime() - 1000);
      expect(estimateDate.getTime()).toBeLessThanOrEqual(expectedMax.getTime() + 1000);
    });

    test('should return ISO 8601 formatted timestamps', () => {
      const priorities: NotificationPriority[] = ['high', 'normal', 'low'];

      priorities.forEach((priority) => {
        const estimate = getEstimatedDeliveryTime(priority);

        // Verify: Valid ISO 8601 format
        expect(estimate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

        // Verify: Can be parsed as a valid date
        const date = new Date(estimate);
        expect(date.toString()).not.toBe('Invalid Date');
      });
    });

    test('should provide distinct estimates for different priorities', () => {
      const highEstimate = getEstimatedDeliveryTime('high');
      const normalEstimate = getEstimatedDeliveryTime('normal');
      const lowEstimate = getEstimatedDeliveryTime('low');

      const highTime = new Date(highEstimate).getTime();
      const normalTime = new Date(normalEstimate).getTime();
      const lowTime = new Date(lowEstimate).getTime();

      // Verify: High < Normal < Low delivery times
      expect(highTime).toBeLessThan(normalTime);
      expect(normalTime).toBeLessThan(lowTime);

      // Verify: Approximate time differences
      expect(normalTime - highTime).toBeGreaterThan(4 * 60 * 1000); // ~4+ minutes difference
      expect(lowTime - normalTime).toBeGreaterThan(50 * 60 * 1000); // ~50+ minutes difference
    });
  });

  describe('End-to-end queue workflow', () => {
    test('should enqueue and receive notification successfully', async () => {
      const notificationId = uuidv4();
      const message: QueueMessage = {
        notificationId,
        customerId: 'customer-e2e',
        channel: 'email',
        templateId: 'e2e-test',
        params: { testData: 'value' },
        priority: 'normal',
      };

      // Mock enqueue
      mockSend.mockResolvedValueOnce({ MessageId: 'msg-e2e-123' });

      // Enqueue notification
      const messageId = await enqueueNotification(message, 'normal');
      expect(messageId).toBe('msg-e2e-123');

      // Mock receive with the enqueued message
      const sqsMessage = {
        MessageId: 'msg-e2e-123',
        ReceiptHandle: 'receipt-e2e-123',
        Body: JSON.stringify(message),
        MessageAttributes: {
          priority: { DataType: 'String', StringValue: 'normal' },
          channel: { DataType: 'String', StringValue: 'email' },
        },
      };
      mockSend.mockResolvedValueOnce({ Messages: [sqsMessage] });

      // Receive notification
      const receivedMessages = await receiveMessages('normal');

      // Verify: Message received matches enqueued message
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].notificationId).toBe(notificationId);
      expect(receivedMessages[0].customerId).toBe('customer-e2e');
      expect(receivedMessages[0].channel).toBe('email');
      expect(receivedMessages[0].templateId).toBe('e2e-test');
      expect(receivedMessages[0].params).toEqual({ testData: 'value' });
    });

    test('should handle multiple messages in queue batch', async () => {
      const messages: QueueMessage[] = [
        {
          notificationId: uuidv4(),
          customerId: 'customer-1',
          channel: 'email',
          templateId: 'template-1',
          params: {},
          priority: 'high',
        },
        {
          notificationId: uuidv4(),
          customerId: 'customer-2',
          channel: 'sms',
          templateId: 'template-2',
          params: {},
          priority: 'high',
        },
        {
          notificationId: uuidv4(),
          customerId: 'customer-3',
          channel: 'push',
          templateId: 'template-3',
          params: {},
          priority: 'high',
        },
      ];

      // Mock enqueue for all messages
      for (let i = 0; i < messages.length; i++) {
        mockSend.mockResolvedValueOnce({ MessageId: `msg-batch-${i}` });
      }

      // Enqueue all messages
      const messageIds = await Promise.all(
        messages.map((msg) => enqueueNotification(msg, 'high'))
      );

      expect(messageIds).toHaveLength(3);

      // Mock receive with all messages
      const sqsMessages = messages.map((msg, i) => ({
        MessageId: `msg-batch-${i}`,
        ReceiptHandle: `receipt-batch-${i}`,
        Body: JSON.stringify(msg),
        MessageAttributes: {
          priority: { DataType: 'String', StringValue: 'high' },
          channel: { DataType: 'String', StringValue: msg.channel },
        },
      }));

      mockSend.mockResolvedValueOnce({ Messages: sqsMessages });

      // Receive messages
      const receivedMessages = await receiveMessages('high', 10);

      // Verify: All messages received
      expect(receivedMessages).toHaveLength(3);
      expect(receivedMessages.map((m) => m.channel)).toEqual(['email', 'sms', 'push']);
    });
  });
});
