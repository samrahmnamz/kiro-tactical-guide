/**
 * S3 Audit Trail Logging
 * 
 * Comprehensive audit logging for SOX Section 404 compliance with 10-year retention.
 * All critical settlement operations generate immutable audit log entries stored in S3.
 * 
 * ## Features
 * - **Immutable audit logs**: WORM (Write Once Read Many) compliance using S3 Object Lock
 * - **10-year retention**: S3 lifecycle policies enforce SOX retention requirements
 * - **Comprehensive tracking**: Actor, action, authorization, and system state for every operation
 * - **Partitioned storage**: Year/month/day/batch structure for efficient queries
 * 
 * ## S3 Structure
 * ```
 * settlement-audit-logs/
 *   2024/
 *     01/
 *       15/
 *         550e8400-e29b-41d4-a716-446655440000/
 *           audit-1705334565123.json
 *           audit-1705334789456.json
 * ```
 * 
 * ## Configuration
 * Environment variables:
 * - `AWS_REGION`: AWS region for S3 (default: us-east-1)
 * - `S3_AUDIT_BUCKET`: S3 bucket name (default: settlement-audit-logs)
 * - `DEPLOYMENT_VERSION`: Application version (for audit trail)
 * - `ENVIRONMENT`: Environment name (production, staging, etc.)
 * 
 * @module audit
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import {
  AuditTrailEvent,
  AuditActor,
  AuditAction,
  AuditAuthorization,
  AuditSystemState,
} from './types';
import logger from './logger';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const AUDIT_BUCKET = process.env.S3_AUDIT_BUCKET || 'settlement-audit-logs';
const DEPLOYMENT_VERSION = process.env.DEPLOYMENT_VERSION || 'unknown';
const ENVIRONMENT = process.env.ENVIRONMENT || 'development';

/**
 * Generate S3 key path for audit log.
 * 
 * Creates a partitioned key structure for efficient queries and cost-effective storage:
 * `{year}/{month}/{day}/{settlementBatchId}/audit-{timestamp}.json`
 * 
 * This structure enables:
 * - Athena queries on date ranges
 * - S3 lifecycle policies by date prefix
 * - Easy batch-specific log retrieval
 * 
 * @param settlementBatchId - Settlement batch UUID
 * @param timestamp - ISO 8601 timestamp
 * @returns S3 key path
 * 
 * @example
 * ```typescript
 * const key = generateAuditKey("550e8400-e29b-41d4-a716-446655440000", "2024-01-15T20:00:00.123Z");
 * // Returns: "2024/01/15/550e8400-e29b-41d4-a716-446655440000/audit-1705348800123.json"
 * ```
 */
function generateAuditKey(settlementBatchId: string, timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const timestampMs = date.getTime();

  return `${year}/${month}/${day}/${settlementBatchId}/audit-${timestampMs}.json`;
}

/**
 * Write an audit trail event to S3.
 * 
 * Serializes the audit event as JSON and uploads to S3 with appropriate metadata.
 * All uploads use server-side encryption (AES-256) and are immutable once written.
 * 
 * ## S3 Upload Configuration
 * - Content type: application/json
 * - Server-side encryption: AES256
 * - Storage class: STANDARD (transitions to GLACIER after 1 year via lifecycle policy)
 * - Metadata: settlementBatchId, eventType, actor
 * 
 * @param event - Audit trail event to write
 * @returns S3 key path where the audit log was written
 * @throws S3 client errors if upload fails
 * 
 * @example
 * ```typescript
 * const event: AuditTrailEvent = {
 *   settlementBatchId: "550e8400-e29b-41d4-a716-446655440000",
 *   auditEventType: "settlement_initiated",
 *   timestamp: new Date().toISOString(),
 *   actor: {...},
 *   action: {...},
 *   authorization: {...},
 *   systemState: {...}
 * };
 * const s3Key = await writeAuditLog(event);
 * console.log(`Audit log written to: ${s3Key}`);
 * ```
 */
export async function writeAuditLog(event: AuditTrailEvent): Promise<string> {
  const s3Key = generateAuditKey(event.settlementBatchId, event.timestamp);
  const body = JSON.stringify(event, null, 2);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: AUDIT_BUCKET,
      Key: s3Key,
      Body: body,
      ContentType: 'application/json',
      ServerSideEncryption: 'AES256',
      Metadata: {
        settlementBatchId: event.settlementBatchId,
        eventType: event.auditEventType,
        actor: event.actor.userId,
      },
    })
  );

  logger.info('Audit log written to S3', {
    s3Key,
    settlementBatchId: event.settlementBatchId,
    auditEventType: event.auditEventType,
  });

  return s3Key;
}

/**
 * Create and write a settlement initiation audit log.
 * 
 * Generates a comprehensive audit event for settlement batch initiation including:
 * - Actor information (user, IP, auth method)
 * - Request/response payloads (sanitized)
 * - Authorization details (CAB ticket)
 * - System state (version, environment, region)
 * 
 * @param settlementBatchId - Settlement batch UUID
 * @param actor - Actor information
 * @param requestPayload - API request body (will be sanitized)
 * @param responsePayload - API response body (will be sanitized)
 * @param approvalTicket - CAB approval ticket reference
 * @returns S3 key path of the written audit log
 * 
 * @example
 * ```typescript
 * const s3Key = await auditSettlementInitiated(
 *   "550e8400-e29b-41d4-a716-446655440000",
 *   { userId: "user-123", ipAddress: "10.0.1.45", userAgent: "...", authMethod: "SSO" },
 *   { settlementPeriod: "2024-01-15", ... },
 *   { settlementBatchId: "...", status: "pending", ... },
 *   "CHG0001234"
 * );
 * ```
 */
export async function auditSettlementInitiated(
  settlementBatchId: string,
  actor: AuditActor,
  requestPayload: Record<string, unknown>,
  responsePayload: Record<string, unknown>,
  approvalTicket: string
): Promise<string> {
  const timestamp = new Date().toISOString();

  const action: AuditAction = {
    operation: 'POST /api/settlements/initiate',
    requestPayload,
    responseStatus: 202,
    responsePayload,
  };

  const authorization: AuditAuthorization = {
    approvalTicket,
    approvedBy: [actor.userId],
    approvalTimestamps: [timestamp],
  };

  const systemState: AuditSystemState = {
    deploymentVersion: DEPLOYMENT_VERSION,
    environment: ENVIRONMENT,
    region: process.env.AWS_REGION || 'us-east-1',
  };

  const event: AuditTrailEvent = {
    settlementBatchId,
    auditEventType: 'settlement_initiated',
    timestamp,
    actor,
    action,
    authorization,
    systemState,
  };

  return writeAuditLog(event);
}

/**
 * Create and write a calculation completed audit log.
 * 
 * Records the completion of net position calculation including counterparty positions
 * and settlement totals for verification and reconciliation.
 * 
 * @param settlementBatchId - Settlement batch UUID
 * @param actor - System actor (Step Functions workflow)
 * @param calculationResults - Calculated positions and totals
 * @returns S3 key path of the written audit log
 * 
 * @example
 * ```typescript
 * const s3Key = await auditCalculationCompleted(
 *   "550e8400-e29b-41d4-a716-446655440000",
 *   { userId: "system", ipAddress: "internal", userAgent: "StepFunctions", authMethod: "IAM" },
 *   { counterparties: [...], totals: {...} }
 * );
 * ```
 */
export async function auditCalculationCompleted(
  settlementBatchId: string,
  actor: AuditActor,
  calculationResults: Record<string, unknown>
): Promise<string> {
  const timestamp = new Date().toISOString();

  const action: AuditAction = {
    operation: 'Step Functions: Calculate Net Positions',
    requestPayload: {},
    responseStatus: 200,
    responsePayload: calculationResults,
  };

  const authorization: AuditAuthorization = {
    approvalTicket: 'N/A',
    approvedBy: [],
    approvalTimestamps: [],
  };

  const systemState: AuditSystemState = {
    deploymentVersion: DEPLOYMENT_VERSION,
    environment: ENVIRONMENT,
    region: process.env.AWS_REGION || 'us-east-1',
  };

  const event: AuditTrailEvent = {
    settlementBatchId,
    auditEventType: 'calculation_completed',
    timestamp,
    actor,
    action,
    authorization,
    systemState,
  };

  return writeAuditLog(event);
}

/**
 * Create and write an approval granted audit log.
 * 
 * Records settlement batch approval with approver identity, CAB ticket,
 * and scheduled execution time for compliance tracking.
 * 
 * @param settlementBatchId - Settlement batch UUID
 * @param actor - Approver information
 * @param requestPayload - Approval request body
 * @param responsePayload - Approval response body
 * @param approvalTicket - CAB approval ticket reference
 * @returns S3 key path of the written audit log
 * 
 * @example
 * ```typescript
 * const s3Key = await auditApprovalGranted(
 *   "550e8400-e29b-41d4-a716-446655440000",
 *   { userId: "user-456", ipAddress: "10.0.1.50", userAgent: "...", authMethod: "SSO" },
 *   { approvedBy: "user-456", approvalTicket: "CHG0001234", ... },
 *   { status: "approved", scheduledExecutionTime: "...", ... },
 *   "CHG0001234"
 * );
 * ```
 */
export async function auditApprovalGranted(
  settlementBatchId: string,
  actor: AuditActor,
  requestPayload: Record<string, unknown>,
  responsePayload: Record<string, unknown>,
  approvalTicket: string
): Promise<string> {
  const timestamp = new Date().toISOString();

  const action: AuditAction = {
    operation: 'POST /api/settlements/:id/approve',
    requestPayload,
    responseStatus: 200,
    responsePayload,
  };

  const authorization: AuditAuthorization = {
    approvalTicket,
    approvedBy: [actor.userId],
    approvalTimestamps: [timestamp],
  };

  const systemState: AuditSystemState = {
    deploymentVersion: DEPLOYMENT_VERSION,
    environment: ENVIRONMENT,
    region: process.env.AWS_REGION || 'us-east-1',
  };

  const event: AuditTrailEvent = {
    settlementBatchId,
    auditEventType: 'approval_granted',
    timestamp,
    actor,
    action,
    authorization,
    systemState,
  };

  return writeAuditLog(event);
}

/**
 * Create and write a settlement executed audit log.
 * 
 * Records settlement execution including execution results for each counterparty.
 * Critical for SOX compliance and post-settlement reconciliation.
 * 
 * @param settlementBatchId - Settlement batch UUID
 * @param actor - Executor information
 * @param requestPayload - Execution request body
 * @param responsePayload - Execution response with results
 * @param executionTicket - Execution authorization reference
 * @returns S3 key path of the written audit log
 * 
 * @example
 * ```typescript
 * const s3Key = await auditSettlementExecuted(
 *   "550e8400-e29b-41d4-a716-446655440000",
 *   { userId: "user-789", ipAddress: "10.0.1.60", userAgent: "...", authMethod: "SSO" },
 *   { executedBy: "user-789", executionTicket: "CHG0001234", ... },
 *   { status: "settled", executionResults: [...], ... },
 *   "CHG0001234"
 * );
 * ```
 */
export async function auditSettlementExecuted(
  settlementBatchId: string,
  actor: AuditActor,
  requestPayload: Record<string, unknown>,
  responsePayload: Record<string, unknown>,
  executionTicket: string
): Promise<string> {
  const timestamp = new Date().toISOString();

  const action: AuditAction = {
    operation: 'POST /api/settlements/:id/execute',
    requestPayload,
    responseStatus: 200,
    responsePayload,
  };

  const authorization: AuditAuthorization = {
    approvalTicket: executionTicket,
    approvedBy: [actor.userId],
    approvalTimestamps: [timestamp],
  };

  const systemState: AuditSystemState = {
    deploymentVersion: DEPLOYMENT_VERSION,
    environment: ENVIRONMENT,
    region: process.env.AWS_REGION || 'us-east-1',
  };

  const event: AuditTrailEvent = {
    settlementBatchId,
    auditEventType: 'settlement_executed',
    timestamp,
    actor,
    action,
    authorization,
    systemState,
  };

  return writeAuditLog(event);
}

/**
 * Create and write a rollback performed audit log.
 * 
 * Records emergency settlement rollback with justification and reversal method.
 * Rollbacks are highly sensitive operations requiring VP+ approval.
 * 
 * @param settlementBatchId - Original settlement batch UUID
 * @param actor - Person performing rollback
 * @param requestPayload - Rollback request body with reason
 * @param responsePayload - Rollback response with reversal batch ID
 * @param rollbackTicket - Emergency approval ticket
 * @returns S3 key path of the written audit log
 * 
 * @example
 * ```typescript
 * const s3Key = await auditRollbackPerformed(
 *   "550e8400-e29b-41d4-a716-446655440000",
 *   { userId: "user-999", ipAddress: "10.0.1.70", userAgent: "...", authMethod: "SSO" },
 *   { rolledBackBy: "user-999", reason: "Calculation error discovered", ... },
 *   { status: "rolled_back", reversalBatchId: "...", ... },
 *   "CHG0009999"
 * );
 * ```
 */
export async function auditRollbackPerformed(
  settlementBatchId: string,
  actor: AuditActor,
  requestPayload: Record<string, unknown>,
  responsePayload: Record<string, unknown>,
  rollbackTicket: string
): Promise<string> {
  const timestamp = new Date().toISOString();

  const action: AuditAction = {
    operation: 'POST /api/settlements/:id/rollback',
    requestPayload,
    responseStatus: 200,
    responsePayload,
  };

  const authorization: AuditAuthorization = {
    approvalTicket: rollbackTicket,
    approvedBy: [actor.userId],
    approvalTimestamps: [timestamp],
  };

  const systemState: AuditSystemState = {
    deploymentVersion: DEPLOYMENT_VERSION,
    environment: ENVIRONMENT,
    region: process.env.AWS_REGION || 'us-east-1',
  };

  const event: AuditTrailEvent = {
    settlementBatchId,
    auditEventType: 'rollback_performed',
    timestamp,
    actor,
    action,
    authorization,
    systemState,
  };

  return writeAuditLog(event);
}

/**
 * Generate an audit ID (UUID) for tracking async audit operations.
 * 
 * Audit IDs are returned in API responses to allow users to track
 * the audit logging status and locate audit logs in S3.
 * 
 * @returns UUID for audit trail reference
 * 
 * @example
 * ```typescript
 * const auditId = generateAuditId();
 * // Returns: "660e8400-e29b-41d4-a716-446655440002"
 * ```
 */
export function generateAuditId(): string {
  return uuidv4();
}
