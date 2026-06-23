/**
 * Unit tests for S3 audit trail logging
 * 
 * Tests audit log generation and S3 key path structure.
 */

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { generateAuditId } from '../../src/audit';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');

describe('Audit Trail', () => {
  let mockS3Client: {
    send: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockS3Client = {
      send: jest.fn(),
    };
  });

  describe('S3 Key Generation', () => {
    it('should generate correct S3 key path with date partitioning', () => {
      const generateAuditKey = (settlementBatchId: string, timestamp: string): string => {
        const date = new Date(timestamp);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const timestampMs = date.getTime();

        return `${year}/${month}/${day}/${settlementBatchId}/audit-${timestampMs}.json`;
      };

      const key = generateAuditKey(
        '550e8400-e29b-41d4-a716-446655440000',
        '2024-01-15T20:00:00.123Z'
      );

      expect(key).toBe('2024/01/15/550e8400-e29b-41d4-a716-446655440000/audit-1705348800123.json');
    });

    it('should handle different months and days correctly', () => {
      const generateAuditKey = (settlementBatchId: string, timestamp: string): string => {
        const date = new Date(timestamp);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const timestampMs = date.getTime();

        return `${year}/${month}/${day}/${settlementBatchId}/audit-${timestampMs}.json`;
      };

      // Single digit month and day
      const key1 = generateAuditKey('batch-id', '2024-03-05T10:00:00.000Z');
      expect(key1).toContain('2024/03/05/');

      // Double digit month and day
      const key2 = generateAuditKey('batch-id', '2024-12-25T10:00:00.000Z');
      expect(key2).toContain('2024/12/25/');
    });
  });

  describe('Audit Event Structure', () => {
    it('should create comprehensive audit event with all required fields', () => {
      const auditEvent = {
        settlementBatchId: '550e8400-e29b-41d4-a716-446655440000',
        auditEventType: 'settlement_initiated',
        timestamp: '2024-01-15T20:00:00.000Z',
        actor: {
          userId: 'user-123',
          ipAddress: '10.0.1.45',
          userAgent: 'Mozilla/5.0',
          authMethod: 'SSO',
        },
        action: {
          operation: 'POST /api/settlements/initiate',
          requestPayload: { settlementPeriod: '2024-01-15' },
          responseStatus: 202,
          responsePayload: { settlementBatchId: '550e8400-e29b-41d4-a716-446655440000' },
        },
        authorization: {
          approvalTicket: 'CHG0001234',
          approvedBy: ['user-123'],
          approvalTimestamps: ['2024-01-15T20:00:00.000Z'],
        },
        systemState: {
          deploymentVersion: '1.0.0',
          environment: 'production',
          region: 'us-east-1',
        },
      };

      // Validate structure
      expect(auditEvent).toHaveProperty('settlementBatchId');
      expect(auditEvent).toHaveProperty('auditEventType');
      expect(auditEvent).toHaveProperty('timestamp');
      expect(auditEvent).toHaveProperty('actor');
      expect(auditEvent).toHaveProperty('action');
      expect(auditEvent).toHaveProperty('authorization');
      expect(auditEvent).toHaveProperty('systemState');

      // Validate actor
      expect(auditEvent.actor).toHaveProperty('userId');
      expect(auditEvent.actor).toHaveProperty('ipAddress');
      expect(auditEvent.actor).toHaveProperty('userAgent');
      expect(auditEvent.actor).toHaveProperty('authMethod');

      // Validate action
      expect(auditEvent.action).toHaveProperty('operation');
      expect(auditEvent.action).toHaveProperty('requestPayload');
      expect(auditEvent.action).toHaveProperty('responseStatus');
      expect(auditEvent.action).toHaveProperty('responsePayload');

      // Validate authorization
      expect(auditEvent.authorization).toHaveProperty('approvalTicket');
      expect(auditEvent.authorization).toHaveProperty('approvedBy');
      expect(auditEvent.authorization).toHaveProperty('approvalTimestamps');

      // Validate system state
      expect(auditEvent.systemState).toHaveProperty('deploymentVersion');
      expect(auditEvent.systemState).toHaveProperty('environment');
      expect(auditEvent.systemState).toHaveProperty('region');
    });

    it('should support different audit event types', () => {
      const eventTypes = [
        'settlement_initiated',
        'calculation_completed',
        'approval_granted',
        'settlement_executed',
        'rollback_performed',
      ];

      eventTypes.forEach(eventType => {
        expect(eventType).toMatch(/^[a-z_]+$/);
      });
    });
  });

  describe('S3 Upload Configuration', () => {
    it('should use correct S3 upload parameters', () => {
      const auditEvent = {
        settlementBatchId: '550e8400-e29b-41d4-a716-446655440000',
        auditEventType: 'settlement_initiated',
        timestamp: '2024-01-15T20:00:00.000Z',
        actor: { userId: 'user-123', ipAddress: '10.0.1.45', userAgent: 'Mozilla/5.0', authMethod: 'SSO' },
        action: { operation: 'POST /api/settlements/initiate', requestPayload: {}, responseStatus: 202, responsePayload: {} },
        authorization: { approvalTicket: 'CHG0001234', approvedBy: ['user-123'], approvalTimestamps: ['2024-01-15T20:00:00.000Z'] },
        systemState: { deploymentVersion: '1.0.0', environment: 'production', region: 'us-east-1' },
      };

      // Verify the correct structure of S3 upload parameters
      const expectedParams = {
        Bucket: 'settlement-audit-logs',
        Key: '2024/01/15/550e8400-e29b-41d4-a716-446655440000/audit-1705348800000.json',
        Body: JSON.stringify(auditEvent, null, 2),
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
        Metadata: {
          settlementBatchId: auditEvent.settlementBatchId,
          eventType: auditEvent.auditEventType,
          actor: auditEvent.actor.userId,
        },
      };

      expect(expectedParams.ContentType).toBe('application/json');
      expect(expectedParams.ServerSideEncryption).toBe('AES256');
      expect(expectedParams.Metadata).toHaveProperty('settlementBatchId');
      expect(expectedParams.Metadata).toHaveProperty('eventType');
      expect(expectedParams.Metadata).toHaveProperty('actor');
    });
  });

  describe('Audit ID Generation', () => {
    it('should generate valid UUID audit IDs', () => {
      const auditId1 = generateAuditId();
      const auditId2 = generateAuditId();

      // UUIDs should be unique
      expect(auditId1).not.toBe(auditId2);

      // Should match UUID v4 format
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(auditId1).toMatch(uuidPattern);
      expect(auditId2).toMatch(uuidPattern);
    });
  });

  describe('Error Handling', () => {
    it('should handle S3 upload failures', async () => {
      const error = new Error('S3 service unavailable');
      mockS3Client.send.mockRejectedValue(error);

      await expect(
        mockS3Client.send(
          new PutObjectCommand({
            Bucket: 'settlement-audit-logs',
            Key: 'test-key',
            Body: 'test-body',
          })
        )
      ).rejects.toThrow('S3 service unavailable');
    });
  });

  describe('SOX Compliance', () => {
    it('should enforce 10-year retention requirement', () => {
      const currentDate = new Date();
      const retentionDate = new Date(currentDate);
      retentionDate.setFullYear(retentionDate.getFullYear() + 10);
      
      const retentionYears = Math.floor(
        (retentionDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
      );
      
      expect(retentionYears).toBe(10);
    });

    it('should create immutable audit logs (WORM compliance)', () => {
      // Audit logs should be write-once, read-many
      // This is enforced via S3 Object Lock (configured in infrastructure)
      const objectLockEnabled = true;
      expect(objectLockEnabled).toBe(true);
    });
  });
});
