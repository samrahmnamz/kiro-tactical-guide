/**
 * DynamoDB Operations for Settlement Batches and Transaction Ledger
 * 
 * Manages two DynamoDB tables:
 * 
 * ## SettlementBatches Table
 * - Primary key: `settlementBatchId` (UUID)
 * - Sort key: `settlementPeriod` (ISO date)
 * - TTL: Records expire after 10 years (SOX Section 404 + 3 years retention)
 * - Stores settlement lifecycle: pending → processing → calculated → approved → settled
 * 
 * ## TransactionLedger Table
 * - Primary key: `transactionId` (UUID)
 * - GSI: `BySettlementBatch` on `settlementBatchId`
 * - TTL: 10-year retention
 * - Stores individual transaction records for audit and reconciliation
 * 
 * ## Configuration
 * Environment variables:
 * - `AWS_REGION`: AWS region for DynamoDB (default: us-east-1)
 * - `DYNAMODB_SETTLEMENT_BATCHES_TABLE`: Table name (default: SettlementBatches)
 * - `DYNAMODB_TRANSACTION_LEDGER_TABLE`: Table name (default: TransactionLedger)
 * 
 * @module database
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  SettlementBatch,
  TransactionLedger,
  SettlementStatus,
  CounterpartyPosition,
  TimelineEntry,
  ApprovalRecord,
} from './types';
import logger from './logger';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const SETTLEMENT_BATCHES_TABLE =
  process.env.DYNAMODB_SETTLEMENT_BATCHES_TABLE || 'SettlementBatches';
const TRANSACTION_LEDGER_TABLE =
  process.env.DYNAMODB_TRANSACTION_LEDGER_TABLE || 'TransactionLedger';

/**
 * Time-to-live for settlement records: 10 years (SOX Section 404 compliance + 3 years).
 * 
 * After 10 years, DynamoDB automatically deletes the record.
 * The TTL attribute must be in Unix epoch seconds (not milliseconds).
 */
const TTL_SECONDS = 10 * 365 * 24 * 60 * 60; // 10 years

/**
 * Create a settlement batch record in DynamoDB.
 * 
 * Initializes a new settlement batch with pending status and sets up the TTL
 * for automatic cleanup after 10 years.
 * 
 * ## TTL Configuration
 * Automatically sets TTL to 10 years from creation for SOX compliance retention.
 * 
 * @param batch - Settlement batch to create (without TTL, which is added automatically)
 * @returns Created settlement batch record
 * @throws DynamoDB errors
 * 
 * @example
 * ```typescript
 * const batch: SettlementBatch = {
 *   settlementBatchId: uuidv4(),
 *   settlementPeriod: "2024-01-15",
 *   status: "pending",
 *   settlementType: "net",
 *   currency: "USD",
 *   counterparties: [],
 *   totals: { debitTotal: 0, creditTotal: 0, netTotal: 0, transactionCount: 0 },
 *   timeline: [],
 *   approvals: [],
 *   auditTrailS3Key: "",
 *   createdAt: new Date().toISOString(),
 *   updatedAt: new Date().toISOString(),
 *   ttl: 0  // Will be set automatically
 * };
 * const created = await createSettlementBatch(batch);
 * ```
 */
export async function createSettlementBatch(
  batch: SettlementBatch
): Promise<SettlementBatch> {
  const item: SettlementBatch = {
    ...batch,
    ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };

  await docClient.send(
    new PutCommand({
      TableName: SETTLEMENT_BATCHES_TABLE,
      Item: item,
      ConditionExpression: 'attribute_not_exists(settlementBatchId)',
    })
  );

  logger.info('Settlement batch created', {
    settlementBatchId: item.settlementBatchId,
    settlementPeriod: item.settlementPeriod,
    status: item.status,
    settlementType: item.settlementType,
  });

  return item;
}

/**
 * Get a settlement batch by its unique ID.
 * 
 * Performs a single-item read from DynamoDB using the primary key.
 * 
 * @param settlementBatchId - UUID of the settlement batch
 * @returns Settlement batch if found, null otherwise
 * @throws DynamoDB client errors
 * 
 * @example
 * ```typescript
 * const batch = await getSettlementBatch("550e8400-e29b-41d4-a716-446655440000");
 * if (batch) {
 *   console.log(`Status: ${batch.status}`);
 * }
 * ```
 */
export async function getSettlementBatch(
  settlementBatchId: string
): Promise<SettlementBatch | null> {
  const response = await docClient.send(
    new GetCommand({
      TableName: SETTLEMENT_BATCHES_TABLE,
      Key: { settlementBatchId },
    })
  );

  return (response.Item as SettlementBatch) || null;
}

/**
 * Query settlement batches by settlement period.
 * 
 * Uses the sort key to find all batches for a specific settlement period.
 * Useful for month-end reports and reconciliation.
 * 
 * @param settlementPeriod - ISO date (e.g., "2024-01-15")
 * @returns Array of settlement batches for the period
 * @throws DynamoDB query errors
 * 
 * @example
 * ```typescript
 * const batches = await getSettlementBatchesByPeriod("2024-01-15");
 * console.log(`Found ${batches.length} batches for period`);
 * ```
 */
export async function getSettlementBatchesByPeriod(
  settlementPeriod: string
): Promise<SettlementBatch[]> {
  const response = await docClient.send(
    new QueryCommand({
      TableName: SETTLEMENT_BATCHES_TABLE,
      IndexName: 'ByPeriod',
      KeyConditionExpression: 'settlementPeriod = :period',
      ExpressionAttributeValues: {
        ':period': settlementPeriod,
      },
    })
  );

  return (response.Items as SettlementBatch[]) || [];
}

/**
 * Update settlement batch status and timeline.
 * 
 * Updates the status field and adds a timeline entry with the actor and timestamp.
 * Timeline provides complete audit trail of all status transitions.
 * 
 * ## Timeline Entry
 * Each status change creates a timeline entry with:
 * - Status achieved
 * - Timestamp (ISO 8601)
 * - Actor who performed the action
 * - Optional approval reference (CAB ticket)
 * 
 * @param settlementBatchId - UUID of the settlement batch to update
 * @param status - New status
 * @param performedBy - User ID of person performing the action
 * @param approvalReference - Optional CAB ticket or approval reference
 * @throws DynamoDB update errors
 * 
 * @example
 * ```typescript
 * await updateSettlementBatchStatus(
 *   "550e8400-e29b-41d4-a716-446655440000",
 *   "approved",
 *   "user-456",
 *   "CHG0001234"
 * );
 * ```
 */
export async function updateSettlementBatchStatus(
  settlementBatchId: string,
  status: SettlementStatus,
  performedBy: string,
  approvalReference?: string
): Promise<void> {
  const now = new Date().toISOString();
  const timelineEntry: TimelineEntry = {
    status,
    timestamp: now,
    performedBy,
    approvalReference,
  };

  await docClient.send(
    new UpdateCommand({
      TableName: SETTLEMENT_BATCHES_TABLE,
      Key: { settlementBatchId },
      UpdateExpression:
        'SET #status = :status, #updatedAt = :updatedAt, #timeline = list_append(if_not_exists(#timeline, :emptyList), :timelineEntry)',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#timeline': 'timeline',
      },
      ExpressionAttributeValues: {
        ':status': status,
        ':updatedAt': now,
        ':timelineEntry': [timelineEntry],
        ':emptyList': [],
      },
    })
  );

  logger.info('Settlement batch status updated', {
    settlementBatchId,
    status,
    performedBy,
    approvalReference,
  });
}

/**
 * Update settlement batch with calculated counterparty positions.
 * 
 * Stores the net positions calculated by the Step Functions workflow.
 * Also updates status to 'calculated' and sets the totals.
 * 
 * @param settlementBatchId - UUID of the settlement batch
 * @param counterparties - Calculated counterparty positions
 * @param totals - Settlement totals (for validation)
 * @throws DynamoDB update errors
 * 
 * @example
 * ```typescript
 * await updateSettlementBatchCounterparties(
 *   "550e8400-e29b-41d4-a716-446655440000",
 *   [{ counterpartyId: "BANK001", netPosition: 50000, ... }],
 *   { debitTotal: 100000, creditTotal: 100000, netTotal: 0, transactionCount: 100 }
 * );
 * ```
 */
export async function updateSettlementBatchCounterparties(
  settlementBatchId: string,
  counterparties: CounterpartyPosition[],
  totals: { debitTotal: number; creditTotal: number; netTotal: number; transactionCount: number }
): Promise<void> {
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: SETTLEMENT_BATCHES_TABLE,
      Key: { settlementBatchId },
      UpdateExpression:
        'SET #counterparties = :counterparties, #totals = :totals, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#counterparties': 'counterparties',
        '#totals': 'totals',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':counterparties': counterparties,
        ':totals': totals,
        ':updatedAt': now,
      },
    })
  );

  logger.info('Settlement batch counterparties updated', {
    settlementBatchId,
    counterpartyCount: counterparties.length,
    netTotal: totals.netTotal,
  });
}

/**
 * Add an approval record to a settlement batch.
 * 
 * Appends an approval record to the approvals array for audit trail.
 * Used when a settlement batch is approved by an authorized user.
 * 
 * ## Segregation of Duties
 * The approval record includes the approver's user ID and IP address.
 * Application logic must enforce that approver ≠ initiator (SOX requirement).
 * 
 * @param settlementBatchId - UUID of the settlement batch
 * @param approval - Approval record with user, ticket, timestamp, and IP
 * @throws DynamoDB update errors
 * 
 * @example
 * ```typescript
 * await addApprovalRecord(
 *   "550e8400-e29b-41d4-a716-446655440000",
 *   {
 *     approvedBy: "user-456",
 *     approvalTicket: "CHG0001234",
 *     approvedAt: new Date().toISOString(),
 *     ipAddress: "10.0.1.45"
 *   }
 * );
 * ```
 */
export async function addApprovalRecord(
  settlementBatchId: string,
  approval: ApprovalRecord
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: SETTLEMENT_BATCHES_TABLE,
      Key: { settlementBatchId },
      UpdateExpression:
        'SET #approvals = list_append(if_not_exists(#approvals, :emptyList), :approval)',
      ExpressionAttributeNames: {
        '#approvals': 'approvals',
      },
      ExpressionAttributeValues: {
        ':approval': [approval],
        ':emptyList': [],
      },
    })
  );

  logger.info('Approval record added', {
    settlementBatchId,
    approvedBy: approval.approvedBy,
    approvalTicket: approval.approvalTicket,
  });
}

/**
 * Update settlement batch with audit trail S3 key.
 * 
 * Stores the S3 location of the detailed audit log for this batch.
 * Audit logs are stored with 10-year retention for compliance.
 * 
 * @param settlementBatchId - UUID of the settlement batch
 * @param auditTrailS3Key - S3 key path to audit log
 * @throws DynamoDB update errors
 * 
 * @example
 * ```typescript
 * await updateAuditTrailS3Key(
 *   "550e8400-e29b-41d4-a716-446655440000",
 *   "2024/01/15/batch-id/audit-123.json"
 * );
 * ```
 */
export async function updateAuditTrailS3Key(
  settlementBatchId: string,
  auditTrailS3Key: string
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: SETTLEMENT_BATCHES_TABLE,
      Key: { settlementBatchId },
      UpdateExpression: 'SET #auditTrailS3Key = :key',
      ExpressionAttributeNames: {
        '#auditTrailS3Key': 'auditTrailS3Key',
      },
      ExpressionAttributeValues: {
        ':key': auditTrailS3Key,
      },
    })
  );

  logger.info('Audit trail S3 key updated', {
    settlementBatchId,
    auditTrailS3Key,
  });
}

/**
 * Create a transaction ledger entry.
 * 
 * Stores individual transaction records for audit and reconciliation.
 * Each transaction is linked to a settlement batch via GSI.
 * 
 * @param transaction - Transaction ledger entry (without TTL)
 * @returns Created transaction record
 * @throws DynamoDB errors
 * 
 * @example
 * ```typescript
 * const transaction: TransactionLedger = {
 *   transactionId: uuidv4(),
 *   settlementBatchId: "550e8400-e29b-41d4-a716-446655440000",
 *   transactionDate: "2024-01-15",
 *   counterpartyFrom: "BANK001",
 *   counterpartyTo: "BANK002",
 *   amount: 50000.00,
 *   currency: "USD",
 *   status: "pending",
 *   auditTrailS3Key: "2024/01/15/txn-id/audit.json",
 *   createdAt: new Date().toISOString(),
 *   ttl: 0  // Will be set automatically
 * };
 * const created = await createTransactionLedgerEntry(transaction);
 * ```
 */
export async function createTransactionLedgerEntry(
  transaction: TransactionLedger
): Promise<TransactionLedger> {
  const item: TransactionLedger = {
    ...transaction,
    ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };

  await docClient.send(
    new PutCommand({
      TableName: TRANSACTION_LEDGER_TABLE,
      Item: item,
      ConditionExpression: 'attribute_not_exists(transactionId)',
    })
  );

  logger.info('Transaction ledger entry created', {
    transactionId: item.transactionId,
    settlementBatchId: item.settlementBatchId,
    amount: item.amount,
    currency: item.currency,
  });

  return item;
}

/**
 * Get all transactions for a settlement batch.
 * 
 * Queries the BySettlementBatch GSI to retrieve all transactions linked to a batch.
 * Useful for reconciliation and detailed audit reports.
 * 
 * @param settlementBatchId - UUID of the settlement batch
 * @returns Array of transaction ledger entries
 * @throws DynamoDB query errors
 * 
 * @example
 * ```typescript
 * const transactions = await getTransactionsByBatch("550e8400-e29b-41d4-a716-446655440000");
 * console.log(`Found ${transactions.length} transactions in batch`);
 * ```
 */
export async function getTransactionsByBatch(
  settlementBatchId: string
): Promise<TransactionLedger[]> {
  const response = await docClient.send(
    new QueryCommand({
      TableName: TRANSACTION_LEDGER_TABLE,
      IndexName: 'BySettlementBatch',
      KeyConditionExpression: 'settlementBatchId = :batchId',
      ExpressionAttributeValues: {
        ':batchId': settlementBatchId,
      },
    })
  );

  return (response.Items as TransactionLedger[]) || [];
}

/**
 * Update transaction status.
 * 
 * Updates the status of a transaction (pending → settled → reversed).
 * Optionally records the settlement date when status changes to 'settled'.
 * 
 * @param transactionId - UUID of the transaction
 * @param status - New status ('pending', 'settled', or 'reversed')
 * @param settlementDate - Optional settlement date (ISO format)
 * @throws DynamoDB update errors
 * 
 * @example
 * ```typescript
 * await updateTransactionStatus(
 *   "660e8400-e29b-41d4-a716-446655440001",
 *   "settled",
 *   "2024-01-15"
 * );
 * ```
 */
export async function updateTransactionStatus(
  transactionId: string,
  status: 'pending' | 'settled' | 'reversed',
  settlementDate?: string
): Promise<void> {
  const updateExpression = settlementDate
    ? 'SET #status = :status, #settlementDate = :date'
    : 'SET #status = :status';

  const expressionAttributeNames: Record<string, string> = {
    '#status': 'status',
  };

  const expressionAttributeValues: Record<string, unknown> = {
    ':status': status,
  };

  if (settlementDate) {
    expressionAttributeNames['#settlementDate'] = 'settlementDate';
    expressionAttributeValues[':date'] = settlementDate;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TRANSACTION_LEDGER_TABLE,
      Key: { transactionId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );

  logger.info('Transaction status updated', {
    transactionId,
    status,
    settlementDate,
  });
}
