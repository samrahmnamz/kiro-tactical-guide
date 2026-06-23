/**
 * Type Definitions for Settlement Engine Service
 * 
 * TypeScript type definitions derived from API contracts in spec.md.
 * These types ensure type safety across the settlement engine service.
 * 
 * ## Type Categories
 * - **Settlement Types**: Batch processing and lifecycle states
 * - **API Types**: Request/response schemas for REST endpoints
 * - **Database Types**: DynamoDB table schemas for batches and transactions
 * - **Audit Types**: S3 audit trail event schemas
 * - **Workflow Types**: Step Functions state machine data
 * 
 * @module types
 */

/**
 * Settlement batch lifecycle status values.
 * 
 * - `pending`: Batch created, awaiting calculation
 * - `processing`: Calculation in progress
 * - `calculated`: Net positions calculated, awaiting approval
 * - `approved`: Approved for execution, awaiting execution window
 * - `settled`: Successfully executed and funds moved
 * - `failed`: Execution failed
 * - `rolled_back`: Emergency rollback completed
 */
export type SettlementStatus =
  | 'pending'
  | 'processing'
  | 'calculated'
  | 'approved'
  | 'settled'
  | 'failed'
  | 'rolled_back';

/**
 * Settlement type determines how transactions are aggregated.
 * 
 * - `net`: Aggregate all transactions between counterparties (reduces payment volume by 70-90%)
 * - `gross`: Settle each transaction individually (provides immediate finality per transaction)
 */
export type SettlementType = 'net' | 'gross';

/**
 * Audit event types for comprehensive tracking.
 * 
 * All critical operations generate audit log entries in S3 for SOX Section 404 compliance.
 */
export type AuditEventType =
  | 'settlement_initiated'
  | 'calculation_completed'
  | 'approval_granted'
  | 'settlement_executed'
  | 'rollback_performed';

/**
 * Rollback methods for reversing settled batches.
 */
export type ReversalMethod = 'same_day_ach' | 'wire' | 'manual';

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request body for POST /api/settlements/initiate endpoint.
 * 
 * Initiates a settlement batch for a specified settlement period with CAB approval.
 * 
 * @example
 * ```json
 * {
 *   "settlementPeriod": "2024-01-15",
 *   "cutoffTime": "2024-01-15T17:00:00Z",
 *   "counterparties": ["BANK001", "BANK002", "BANK003"],
 *   "settlementType": "net",
 *   "currency": "USD",
 *   "initiatedBy": "user-123",
 *   "approvalTicket": "CHG0001234"
 * }
 * ```
 */
export interface InitiateSettlementRequest {
  /** ISO date for settlement period (e.g., "2024-01-15") */
  settlementPeriod: string;

  /** ISO 8601 timestamp for transaction cutoff */
  cutoffTime: string;

  /** Array of counterparty IDs participating in settlement */
  counterparties: string[];

  /** Net vs gross settlement */
  settlementType: SettlementType;

  /** ISO currency code (e.g., "USD") */
  currency: string;

  /** User ID of authorized initiator */
  initiatedBy: string;

  /** CAB approval ticket reference (e.g., "CHG0001234") */
  approvalTicket: string;
}

/**
 * Response body for POST /api/settlements/initiate endpoint.
 * 
 * Returns 202 Accepted with settlement batch details.
 * 
 * @example
 * ```json
 * {
 *   "settlementBatchId": "550e8400-e29b-41d4-a716-446655440000",
 *   "status": "pending",
 *   "settlementPeriod": "2024-01-15",
 *   "totalTransactions": 1250,
 *   "estimatedCompletionTime": "2024-01-15T18:00:00Z",
 *   "auditTrailId": "audit-uuid",
 *   "createdAt": "2024-01-15T16:00:00Z"
 * }
 * ```
 */
export interface InitiateSettlementResponse {
  /** UUID for this settlement batch */
  settlementBatchId: string;

  /** Current status */
  status: SettlementStatus;

  /** Settlement period */
  settlementPeriod: string;

  /** Number of transactions to settle */
  totalTransactions: number;

  /** ISO 8601 timestamp for estimated completion */
  estimatedCompletionTime: string;

  /** Reference to audit log entry in S3 */
  auditTrailId: string;

  /** ISO 8601 timestamp when batch was created */
  createdAt: string;
}

/**
 * Counterparty net position in a settlement batch.
 */
export interface CounterpartyPosition {
  /** Counterparty identifier */
  counterpartyId: string;

  /** Net position: positive = owed to them, negative = they owe */
  netPosition: number;

  /** Currency code */
  currency: string;

  /** Number of transactions aggregated */
  transactionCount: number;

  /** ISO 8601 timestamp when position was calculated */
  calculatedAt: string;
}

/**
 * Settlement batch totals for validation.
 */
export interface SettlementTotals {
  /** Sum of all debit transactions */
  debitTotal: number;

  /** Sum of all credit transactions */
  creditTotal: number;

  /** Net total (should be zero for net settlement) */
  netTotal: number;

  /** Total number of transactions */
  transactionCount: number;
}

/**
 * Timeline entry for status transitions.
 */
export interface TimelineEntry {
  /** Status achieved */
  status: string;

  /** ISO 8601 timestamp */
  timestamp: string;

  /** User who performed the action */
  performedBy: string;

  /** CAB ticket or emergency override reference */
  approvalReference?: string;
}

/**
 * Response body for GET /api/settlements/:settlementBatchId endpoint.
 * 
 * Returns comprehensive settlement batch details including counterparty positions and timeline.
 * 
 * @example
 * ```json
 * {
 *   "settlementBatchId": "550e8400-e29b-41d4-a716-446655440000",
 *   "status": "settled",
 *   "settlementPeriod": "2024-01-15",
 *   "counterparties": [...],
 *   "totals": {...},
 *   "timeline": [...],
 *   "auditTrail": "s3://bucket/2024/01/15/batch-id/audit-123.json",
 *   "createdAt": "2024-01-15T16:00:00Z",
 *   "updatedAt": "2024-01-15T18:30:00Z"
 * }
 * ```
 */
export interface SettlementBatchResponse {
  /** UUID of settlement batch */
  settlementBatchId: string;

  /** Current status */
  status: SettlementStatus;

  /** Settlement period */
  settlementPeriod: string;

  /** Counterparty net positions */
  counterparties: CounterpartyPosition[];

  /** Settlement totals */
  totals: SettlementTotals;

  /** Status transition timeline */
  timeline: TimelineEntry[];

  /** S3 location of detailed audit log */
  auditTrail: string;

  /** ISO 8601 timestamp when created */
  createdAt: string;

  /** ISO 8601 timestamp when last updated */
  updatedAt: string;
}

/**
 * Request body for POST /api/settlements/:settlementBatchId/approve endpoint.
 * 
 * Approves a calculated settlement batch for execution.
 * 
 * @example
 * ```json
 * {
 *   "approvedBy": "user-456",
 *   "approvalTicket": "CHG0001234",
 *   "comments": "Reviewed and approved for settlement",
 *   "scheduledExecutionTime": "2024-01-15T20:00:00Z"
 * }
 * ```
 */
export interface ApproveSettlementRequest {
  /** User ID of authorized approver (must be different from initiator) */
  approvedBy: string;

  /** CAB approval ticket reference */
  approvalTicket: string;

  /** Optional approval comments */
  comments?: string;

  /** ISO 8601 timestamp for scheduled execution (must be in allowed window) */
  scheduledExecutionTime: string;
}

/**
 * Response body for POST /api/settlements/:settlementBatchId/approve endpoint.
 * 
 * @example
 * ```json
 * {
 *   "settlementBatchId": "550e8400-e29b-41d4-a716-446655440000",
 *   "status": "approved",
 *   "scheduledExecutionTime": "2024-01-15T20:00:00Z",
 *   "approvalAuditId": "audit-uuid",
 *   "approvedAt": "2024-01-15T18:00:00Z"
 * }
 * ```
 */
export interface ApproveSettlementResponse {
  /** UUID of settlement batch */
  settlementBatchId: string;

  /** New status (approved) */
  status: SettlementStatus;

  /** Scheduled execution time */
  scheduledExecutionTime: string;

  /** Audit trail ID for approval action */
  approvalAuditId: string;

  /** ISO 8601 timestamp when approved */
  approvedAt: string;
}

/**
 * Request body for POST /api/settlements/:settlementBatchId/execute endpoint.
 * 
 * Executes an approved settlement batch (moves funds).
 * 
 * @example
 * ```json
 * {
 *   "executedBy": "user-789",
 *   "executionTicket": "CHG0001234",
 *   "force": false
 * }
 * ```
 */
export interface ExecuteSettlementRequest {
  /** User ID of authorized executor (must be different from initiator and approver) */
  executedBy: string;

  /** Execution authorization reference */
  executionTicket: string;

  /** Optional execution time for testing (defaults to current time) */
  executionTime?: string;

  /** Emergency override flag (requires additional approval) */
  force?: boolean;
}

/**
 * Execution result for a single counterparty.
 */
export interface ExecutionResult {
  /** Counterparty ID */
  counterpartyId: string;

  /** Whether payment succeeded */
  success: boolean;

  /** External payment rail transaction ID */
  transactionId?: string;

  /** Error message if success = false */
  error?: string;
}

/**
 * Response body for POST /api/settlements/:settlementBatchId/execute endpoint.
 * 
 * @example
 * ```json
 * {
 *   "settlementBatchId": "550e8400-e29b-41d4-a716-446655440000",
 *   "status": "settled",
 *   "executionResults": [
 *     { "counterpartyId": "BANK001", "success": true, "transactionId": "TXN-123" },
 *     { "counterpartyId": "BANK002", "success": true, "transactionId": "TXN-124" }
 *   ],
 *   "executedAt": "2024-01-15T20:00:00Z",
 *   "auditTrailId": "audit-uuid"
 * }
 * ```
 */
export interface ExecuteSettlementResponse {
  /** UUID of settlement batch */
  settlementBatchId: string;

  /** New status (settled or failed) */
  status: SettlementStatus;

  /** Execution results per counterparty */
  executionResults: ExecutionResult[];

  /** ISO 8601 timestamp when executed */
  executedAt: string;

  /** Audit trail ID for execution action */
  auditTrailId: string;
}

/**
 * Request body for POST /api/settlements/:settlementBatchId/rollback endpoint.
 * 
 * Rollback a settled batch (emergency use only).
 * 
 * @example
 * ```json
 * {
 *   "rolledBackBy": "user-999",
 *   "rollbackTicket": "CHG0009999",
 *   "reason": "Calculation error discovered in net positions",
 *   "reversalMethod": "same_day_ach"
 * }
 * ```
 */
export interface RollbackSettlementRequest {
  /** User ID of authorized person */
  rolledBackBy: string;

  /** Emergency approval ticket */
  rollbackTicket: string;

  /** Mandatory rollback justification */
  reason: string;

  /** Method for reversing payments */
  reversalMethod: ReversalMethod;
}

/**
 * Response body for POST /api/settlements/:settlementBatchId/rollback endpoint.
 * 
 * @example
 * ```json
 * {
 *   "settlementBatchId": "550e8400-e29b-41d4-a716-446655440000",
 *   "status": "rolled_back",
 *   "reversalBatchId": "660e8400-e29b-41d4-a716-446655440001",
 *   "rolledBackAt": "2024-01-15T21:00:00Z",
 *   "auditTrailId": "audit-uuid"
 * }
 * ```
 */
export interface RollbackSettlementResponse {
  /** UUID of original settlement batch */
  settlementBatchId: string;

  /** New status (rolled_back) */
  status: SettlementStatus;

  /** New batch ID for reversal transactions */
  reversalBatchId: string;

  /** ISO 8601 timestamp when rolled back */
  rolledBackAt: string;

  /** Audit trail ID for rollback action */
  auditTrailId: string;
}

/**
 * Standard error response format.
 * 
 * Used for all error responses (4xx and 5xx status codes).
 * 
 * @example
 * ```json
 * {
 *   "error": {
 *     "code": "invalid_settlement_window",
 *     "message": "Settlement execution not allowed during market hours (9:30 AM - 4:00 PM ET)",
 *     "details": {
 *       "field": "scheduledExecutionTime",
 *       "constraint": "must be outside market hours"
 *     }
 *   }
 * }
 * ```
 */
export interface ErrorResponse {
  error: {
    /** Machine-readable error code (snake_case) */
    code: string;

    /** Human-readable error message */
    message: string;

    /** Optional additional error details */
    details?: {
      /** Field that caused the error */
      field?: string;

      /** Constraint that was violated */
      constraint?: string;
    };
  };
}

// ============================================================================
// DynamoDB Table Schemas
// ============================================================================

/**
 * Approval record for audit trail.
 */
export interface ApprovalRecord {
  /** User who approved */
  approvedBy: string;

  /** CAB ticket reference */
  approvalTicket: string;

  /** ISO 8601 timestamp */
  approvedAt: string;

  /** IP address of approver (for audit) */
  ipAddress: string;
}

/**
 * SettlementBatches table schema.
 * 
 * Stores complete lifecycle of each settlement batch including positions, approvals, and timeline.
 * 
 * ## Table Configuration
 * - Primary key: `settlementBatchId` (UUID)
 * - Sort key: `settlementPeriod` (ISO date, allows querying by period)
 * - TTL: Enabled on `ttl` attribute (10-year retention for SOX + 3 years)
 * 
 * @example
 * ```typescript
 * const batch: SettlementBatch = {
 *   settlementBatchId: "550e8400-e29b-41d4-a716-446655440000",
 *   settlementPeriod: "2024-01-15",
 *   status: "settled",
 *   settlementType: "net",
 *   currency: "USD",
 *   counterparties: [...],
 *   totals: {...},
 *   timeline: [...],
 *   approvals: [...],
 *   auditTrailS3Key: "2024/01/15/batch-id/audit-123.json",
 *   createdAt: "2024-01-15T16:00:00Z",
 *   updatedAt: "2024-01-15T20:00:00Z",
 *   ttl: 1831766400
 * };
 * ```
 */
export interface SettlementBatch {
  /** UUID primary key */
  settlementBatchId: string;

  /** ISO date sort key (allows querying by period) */
  settlementPeriod: string;

  /** Current workflow status */
  status: SettlementStatus;

  /** Net vs gross settlement */
  settlementType: SettlementType;

  /** ISO currency code */
  currency: string;

  /** Counterparty net positions */
  counterparties: CounterpartyPosition[];

  /** Settlement totals */
  totals: SettlementTotals;

  /** All state transitions with timestamps and actors */
  timeline: TimelineEntry[];

  /** All approvals with tickets and IP addresses */
  approvals: ApprovalRecord[];

  /** S3 location of detailed audit log */
  auditTrailS3Key: string;

  /** ISO timestamp when created */
  createdAt: string;

  /** ISO timestamp when last updated */
  updatedAt: string;

  /** Unix epoch seconds for TTL (10-year retention) */
  ttl: number;
}

/**
 * Transaction ledger entry status.
 */
export type TransactionStatus = 'pending' | 'settled' | 'reversed';

/**
 * TransactionLedger table schema.
 * 
 * Stores individual transaction records for audit and reconciliation.
 * 
 * ## Table Configuration
 * - Primary key: `transactionId` (UUID)
 * - GSI: `BySettlementBatch` on `settlementBatchId` (allows querying all transactions in batch)
 * - TTL: Enabled on `ttl` attribute (10-year retention)
 * 
 * @example
 * ```typescript
 * const transaction: TransactionLedger = {
 *   transactionId: "660e8400-e29b-41d4-a716-446655440001",
 *   settlementBatchId: "550e8400-e29b-41d4-a716-446655440000",
 *   transactionDate: "2024-01-15",
 *   counterpartyFrom: "BANK001",
 *   counterpartyTo: "BANK002",
 *   amount: 50000.00,
 *   currency: "USD",
 *   status: "settled",
 *   settlementDate: "2024-01-15",
 *   auditTrailS3Key: "2024/01/15/transaction-id/audit-456.json",
 *   createdAt: "2024-01-15T16:00:00Z",
 *   ttl: 1831766400
 * };
 * ```
 */
export interface TransactionLedger {
  /** UUID primary key */
  transactionId: string;

  /** GSI partition key (links to settlement batch) */
  settlementBatchId: string;

  /** ISO date */
  transactionDate: string;

  /** Counterparty sending funds */
  counterpartyFrom: string;

  /** Counterparty receiving funds */
  counterpartyTo: string;

  /** Transaction amount */
  amount: number;

  /** ISO currency code */
  currency: string;

  /** Transaction status */
  status: TransactionStatus;

  /** ISO date when settled */
  settlementDate?: string;

  /** S3 location of audit log */
  auditTrailS3Key: string;

  /** ISO timestamp when created */
  createdAt: string;

  /** Unix epoch seconds for TTL (10-year retention) */
  ttl: number;
}

// ============================================================================
// S3 Audit Trail Types
// ============================================================================

/**
 * Actor information for audit trail.
 */
export interface AuditActor {
  /** User ID of person performing action */
  userId: string;

  /** IP address */
  ipAddress: string;

  /** User agent string */
  userAgent: string;

  /** Authentication method (e.g., "SSO") */
  authMethod: string;
}

/**
 * Action details for audit trail.
 */
export interface AuditAction {
  /** API operation performed */
  operation: string;

  /** Sanitized request payload */
  requestPayload: Record<string, unknown>;

  /** HTTP response status code */
  responseStatus: number;

  /** Sanitized response payload */
  responsePayload: Record<string, unknown>;
}

/**
 * Authorization details for audit trail.
 */
export interface AuditAuthorization {
  /** CAB approval ticket */
  approvalTicket: string;

  /** User IDs of approvers */
  approvedBy: string[];

  /** ISO timestamps of approvals */
  approvalTimestamps: string[];
}

/**
 * System state for audit trail.
 */
export interface AuditSystemState {
  /** Deployment version */
  deploymentVersion: string;

  /** Environment (production, staging, etc.) */
  environment: string;

  /** AWS region */
  region: string;
}

/**
 * S3 audit trail event schema.
 * 
 * Comprehensive audit log for all critical settlement operations.
 * Stored in S3 with 10-year retention for SOX Section 404 compliance.
 * 
 * @example
 * ```json
 * {
 *   "settlementBatchId": "550e8400-e29b-41d4-a716-446655440000",
 *   "auditEventType": "settlement_executed",
 *   "timestamp": "2024-01-15T20:00:00.123Z",
 *   "actor": {...},
 *   "action": {...},
 *   "authorization": {...},
 *   "systemState": {...}
 * }
 * ```
 */
export interface AuditTrailEvent {
  /** Settlement batch ID */
  settlementBatchId: string;

  /** Type of audit event */
  auditEventType: AuditEventType;

  /** ISO 8601 timestamp with milliseconds */
  timestamp: string;

  /** Actor who performed the action */
  actor: AuditActor;

  /** Action details */
  action: AuditAction;

  /** Authorization information */
  authorization: AuditAuthorization;

  /** System state at time of action */
  systemState: AuditSystemState;
}

// ============================================================================
// Step Functions Workflow Types
// ============================================================================

/**
 * Step Functions workflow input for settlement calculation.
 */
export interface CalculateSettlementInput {
  /** Settlement batch ID */
  settlementBatchId: string;

  /** Settlement period */
  settlementPeriod: string;

  /** Counterparties to calculate */
  counterparties: string[];

  /** Settlement type */
  settlementType: SettlementType;

  /** Currency */
  currency: string;
}

/**
 * Step Functions workflow output from settlement calculation.
 */
export interface CalculateSettlementOutput {
  /** Settlement batch ID */
  settlementBatchId: string;

  /** Calculated counterparty positions */
  counterparties: CounterpartyPosition[];

  /** Settlement totals */
  totals: SettlementTotals;

  /** Calculation timestamp */
  calculatedAt: string;
}
