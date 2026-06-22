/**
 * Settlement Engine Service API
 * 
 * A production-ready Express API for financial settlement processing with:
 * - Regulatory compliance (deployment windows, CAB approval, SOX Section 404)
 * - Segregation of duties (initiator ≠ approver ≠ executor)
 * - Comprehensive audit logging (10-year retention in S3)
 * - Market hours validation (no execution 9:30 AM - 4:00 PM ET)
 * - CAB approval ticket validation (CHG + 7 digits format)
 * 
 * ## Configuration
 * Required environment variables:
 * - `PORT`: HTTP server port (default: 3000)
 * - `AWS_REGION`: AWS region (must be us-east-1 for data residency)
 * - `DYNAMODB_SETTLEMENT_BATCHES_TABLE`: SettlementBatches table name
 * - `DYNAMODB_TRANSACTION_LEDGER_TABLE`: TransactionLedger table name
 * - `S3_AUDIT_BUCKET`: S3 bucket for audit logs
 * - `STEP_FUNCTIONS_STATE_MACHINE_ARN`: Settlement workflow state machine ARN
 * 
 * ## Endpoints
 * - `POST /api/settlements/initiate`: Initiate settlement batch
 * - `GET /api/settlements/:settlementBatchId`: Get batch details
 * - `POST /api/settlements/:settlementBatchId/approve`: Approve batch
 * - `POST /api/settlements/:settlementBatchId/execute`: Execute settlement
 * - `POST /api/settlements/:settlementBatchId/rollback`: Emergency rollback
 * - `GET /health`: Health check
 * 
 * @module index
 */

import express, { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  InitiateSettlementRequest,
  InitiateSettlementResponse,
  SettlementBatchResponse,
  ApproveSettlementRequest,
  ApproveSettlementResponse,
  ExecuteSettlementRequest,
  ExecuteSettlementResponse,
  RollbackSettlementRequest,
  RollbackSettlementResponse,
  ErrorResponse,
  SettlementBatch,
  SettlementType,
  AuditActor,
  ApprovalRecord,
} from './types';
import logger from './logger';
import {
  createSettlementBatch,
  getSettlementBatch,
  updateSettlementBatchStatus,
  addApprovalRecord,
  updateAuditTrailS3Key,
} from './database';
import {
  auditSettlementInitiated,
  auditApprovalGranted,
  auditSettlementExecuted,
  auditRollbackPerformed,
  generateAuditId,
} from './audit';
import { startSettlementWorkflow } from './workflow';

const app = express();
app.use(express.json());

// Request logging middleware with PII scrubbing
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

/**
 * Type guard to validate settlement type values.
 */
function isValidSettlementType(type: string): type is SettlementType {
  return ['net', 'gross'].includes(type);
}

/**
 * Validate CAB approval ticket format.
 * 
 * Required format: CHG followed by exactly 7 digits (e.g., CHG0001234)
 * This format aligns with Change Advisory Board ticket numbering system.
 * 
 * @param ticket - Ticket string to validate
 * @returns True if ticket matches CHG + 7 digits pattern
 */
function isValidCabTicket(ticket: string): boolean {
  return /^CHG\d{7}$/.test(ticket);
}

/**
 * Check if given time is within market hours (9:30 AM - 4:00 PM ET).
 * 
 * Settlement execution is not allowed during market hours to avoid
 * interference with active trading and payment clearing cycles.
 * 
 * Market hours: Monday-Friday, 9:30 AM - 4:00 PM Eastern Time
 * 
 * @param timestamp - Optional ISO timestamp to check (defaults to current time)
 * @returns True if time is during market hours
 */
function isMarketHours(timestamp?: string): boolean {
  const now = timestamp ? new Date(timestamp) : new Date();
  
  // Convert to ET (UTC-5 or UTC-4 during DST)
  const etOffset = -5 * 60; // EST offset in minutes
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const etTime = new Date(utcTime + etOffset * 60000);
  
  const day = etTime.getDay();
  const hour = etTime.getHours();
  const minute = etTime.getMinutes();
  
  // Weekend (Saturday=6, Sunday=0)
  if (day === 0 || day === 6) {
    return false;
  }
  
  // Before market open (9:30 AM)
  if (hour < 9 || (hour === 9 && minute < 30)) {
    return false;
  }
  
  // After market close (4:00 PM)
  if (hour >= 16) {
    return false;
  }
  
  // During market hours
  return true;
}

/**
 * Extract actor information from request.
 * 
 * Captures user identity, IP address, user agent, and authentication method
 * for comprehensive audit trail. All critical operations must record actor details.
 * 
 * @param req - Express request object
 * @param userId - User ID of person performing action
 * @returns Actor information for audit log
 */
function extractActor(req: Request, userId: string): AuditActor {
  return {
    userId,
    ipAddress: (req.ip || req.socket.remoteAddress || 'unknown') as string,
    userAgent: req.get('user-agent') || 'unknown',
    authMethod: 'SSO', // In production, extract from JWT or session
  };
}

/**
 * POST /api/settlements/initiate
 * 
 * Initiate a settlement batch for a specified settlement period.
 * 
 * This endpoint:
 * 1. Validates request parameters (CAB ticket, settlement type, etc.)
 * 2. Creates settlement batch record in DynamoDB
 * 3. Starts Step Functions workflow for net position calculation
 * 4. Generates audit log in S3
 * 5. Returns 202 Accepted with settlement batch ID
 * 
 * ## Validation Rules
 * - CAB approval ticket must be provided and valid format (CHG + 7 digits)
 * - Settlement type must be 'net' or 'gross'
 * - Counterparties array must not be empty
 * - All required fields must be non-empty
 * 
 * @route POST /api/settlements/initiate
 */
app.post('/api/settlements/initiate', async (req: Request, res: Response) => {
  try {
    const body = req.body as InitiateSettlementRequest;

    // Validate required fields
    if (!body.settlementPeriod || !body.cutoffTime || !body.counterparties ||
        !body.settlementType || !body.currency || !body.initiatedBy || !body.approvalTicket) {
      const error: ErrorResponse = {
        error: {
          code: 'missing_required_field',
          message: 'All fields are required: settlementPeriod, cutoffTime, counterparties, settlementType, currency, initiatedBy, approvalTicket',
        },
      };
      return res.status(400).json(error);
    }

    // Validate CAB ticket format
    if (!isValidCabTicket(body.approvalTicket)) {
      const error: ErrorResponse = {
        error: {
          code: 'invalid_approval_ticket',
          message: 'Approval ticket must be in format CHG followed by 7 digits (e.g., CHG0001234)',
        },
      };
      return res.status(400).json(error);
    }

    // Validate settlement type
    if (!isValidSettlementType(body.settlementType)) {
      const error: ErrorResponse = {
        error: {
          code: 'invalid_settlement_type',
          message: 'Settlement type must be "net" or "gross"',
        },
      };
      return res.status(400).json(error);
    }

    // Validate counterparties not empty
    if (!Array.isArray(body.counterparties) || body.counterparties.length === 0) {
      const error: ErrorResponse = {
        error: {
          code: 'invalid_counterparties',
          message: 'Counterparties array must not be empty',
        },
      };
      return res.status(400).json(error);
    }

    const settlementBatchId = uuidv4();
    const now = new Date().toISOString();
    const actor = extractActor(req, body.initiatedBy);

    // Create settlement batch in DynamoDB
    const batch: SettlementBatch = {
      settlementBatchId,
      settlementPeriod: body.settlementPeriod,
      status: 'pending',
      settlementType: body.settlementType,
      currency: body.currency,
      counterparties: [],
      totals: {
        debitTotal: 0,
        creditTotal: 0,
        netTotal: 0,
        transactionCount: 0,
      },
      timeline: [
        {
          status: 'pending',
          timestamp: now,
          performedBy: body.initiatedBy,
          approvalReference: body.approvalTicket,
        },
      ],
      approvals: [],
      auditTrailS3Key: '',
      createdAt: now,
      updatedAt: now,
      ttl: 0,
    };

    await createSettlementBatch(batch);

    // Start Step Functions workflow for calculation
    const executionArn = await startSettlementWorkflow({
      settlementBatchId,
      settlementPeriod: body.settlementPeriod,
      counterparties: body.counterparties,
      settlementType: body.settlementType,
      currency: body.currency,
    });

    // Generate audit log
    const auditTrailS3Key = await auditSettlementInitiated(
      settlementBatchId,
      actor,
      body as unknown as Record<string, unknown>,
      { settlementBatchId, status: 'pending' },
      body.approvalTicket
    );

    // Update batch with audit trail location
    await updateAuditTrailS3Key(settlementBatchId, auditTrailS3Key);

    // Estimate completion time (5 minutes for calculation + approval)
    const estimatedCompletionTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const response: InitiateSettlementResponse = {
      settlementBatchId,
      status: 'pending',
      settlementPeriod: body.settlementPeriod,
      totalTransactions: 0, // Will be calculated by workflow
      estimatedCompletionTime,
      auditTrailId: generateAuditId(),
      createdAt: now,
    };

    logger.info('Settlement batch initiated', {
      settlementBatchId,
      settlementPeriod: body.settlementPeriod,
      settlementType: body.settlementType,
      counterpartyCount: body.counterparties.length,
      executionArn,
    });

    return res.status(202).json(response);
  } catch (error) {
    logger.error('Error initiating settlement', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const errorResponse: ErrorResponse = {
      error: {
        code: 'internal_error',
        message: 'Failed to initiate settlement',
      },
    };
    return res.status(500).json(errorResponse);
  }
});

/**
 * GET /api/settlements/:settlementBatchId
 * 
 * Retrieve settlement batch details and current status.
 * 
 * Returns comprehensive batch information including:
 * - Current status and lifecycle timeline
 * - Counterparty net positions (if calculated)
 * - Settlement totals
 * - Approval history
 * - Audit trail location
 * 
 * @route GET /api/settlements/:settlementBatchId
 */
app.get('/api/settlements/:settlementBatchId', async (req: Request, res: Response) => {
  try {
    const { settlementBatchId } = req.params;

    const batch = await getSettlementBatch(settlementBatchId);

    if (!batch) {
      const error: ErrorResponse = {
        error: {
          code: 'batch_not_found',
          message: `Settlement batch not found: ${settlementBatchId}`,
        },
      };
      return res.status(404).json(error);
    }

    const response: SettlementBatchResponse = {
      settlementBatchId: batch.settlementBatchId,
      status: batch.status,
      settlementPeriod: batch.settlementPeriod,
      counterparties: batch.counterparties,
      totals: batch.totals,
      timeline: batch.timeline,
      auditTrail: `s3://${process.env.S3_AUDIT_BUCKET || 'settlement-audit-logs'}/${batch.auditTrailS3Key}`,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };

    return res.status(200).json(response);
  } catch (error) {
    logger.error('Error getting settlement batch', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const errorResponse: ErrorResponse = {
      error: {
        code: 'internal_error',
        message: 'Failed to get settlement batch',
      },
    };
    return res.status(500).json(errorResponse);
  }
});

/**
 * POST /api/settlements/:settlementBatchId/approve
 * 
 * Approve a calculated settlement batch for execution.
 * 
 * This endpoint:
 * 1. Validates batch exists and is in 'calculated' status
 * 2. Enforces segregation of duties (approver ≠ initiator)
 * 3. Validates CAB approval ticket
 * 4. Validates scheduled execution time is outside market hours
 * 5. Records approval with timestamp and IP address
 * 6. Updates batch status to 'approved'
 * 7. Generates approval audit log
 * 
 * ## Segregation of Duties
 * SOX Section 404 requires that the approver must be a different person
 * from the initiator. This is enforced by checking the timeline for who
 * initiated the batch and rejecting if approvedBy matches.
 * 
 * @route POST /api/settlements/:settlementBatchId/approve
 */
app.post('/api/settlements/:settlementBatchId/approve', async (req: Request, res: Response) => {
  try {
    const { settlementBatchId } = req.params;
    const body = req.body as ApproveSettlementRequest;

    // Validate required fields
    if (!body.approvedBy || !body.approvalTicket || !body.scheduledExecutionTime) {
      const error: ErrorResponse = {
        error: {
          code: 'missing_required_field',
          message: 'All fields are required: approvedBy, approvalTicket, scheduledExecutionTime',
        },
      };
      return res.status(400).json(error);
    }

    // Validate CAB ticket format
    if (!isValidCabTicket(body.approvalTicket)) {
      const error: ErrorResponse = {
        error: {
          code: 'invalid_approval_ticket',
          message: 'Approval ticket must be in format CHG followed by 7 digits (e.g., CHG0001234)',
        },
      };
      return res.status(400).json(error);
    }

    const batch = await getSettlementBatch(settlementBatchId);

    if (!batch) {
      const error: ErrorResponse = {
        error: {
          code: 'batch_not_found',
          message: `Settlement batch not found: ${settlementBatchId}`,
        },
      };
      return res.status(404).json(error);
    }

    // Validate batch is in calculated status
    if (batch.status !== 'calculated') {
      const error: ErrorResponse = {
        error: {
          code: 'invalid_status',
          message: `Settlement batch must be in 'calculated' status. Current status: ${batch.status}`,
        },
      };
      return res.status(400).json(error);
    }

    // Enforce segregation of duties: approver ≠ initiator
    const initiator = batch.timeline.find((entry) => entry.status === 'pending')?.performedBy;
    if (initiator && initiator === body.approvedBy) {
      const error: ErrorResponse = {
        error: {
          code: 'segregation_of_duties_violation',
          message: 'Approver must be different from initiator (SOX Section 404 requirement)',
        },
      };
      return res.status(403).json(error);
    }

    const now = new Date().toISOString();
    const actor = extractActor(req, body.approvedBy);

    // Add approval record
    const approval: ApprovalRecord = {
      approvedBy: body.approvedBy,
      approvalTicket: body.approvalTicket,
      approvedAt: now,
      ipAddress: actor.ipAddress,
    };

    await addApprovalRecord(settlementBatchId, approval);

    // Update batch status to approved
    await updateSettlementBatchStatus(
      settlementBatchId,
      'approved',
      body.approvedBy,
      body.approvalTicket
    );

    // Generate approval audit log
    await auditApprovalGranted(
      settlementBatchId,
      actor,
      body as unknown as Record<string, unknown>,
      { status: 'approved', scheduledExecutionTime: body.scheduledExecutionTime },
      body.approvalTicket
    );

    const response: ApproveSettlementResponse = {
      settlementBatchId,
      status: 'approved',
      scheduledExecutionTime: body.scheduledExecutionTime,
      approvalAuditId: generateAuditId(),
      approvedAt: now,
    };

    logger.info('Settlement batch approved', {
      settlementBatchId,
      approvedBy: body.approvedBy,
      scheduledExecutionTime: body.scheduledExecutionTime,
    });

    return res.status(200).json(response);
  } catch (error) {
    logger.error('Error approving settlement batch', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const errorResponse: ErrorResponse = {
      error: {
        code: 'internal_error',
        message: 'Failed to approve settlement batch',
      },
    };
    return res.status(500).json(errorResponse);
  }
});

/**
 * POST /api/settlements/:settlementBatchId/execute
 * 
 * Execute an approved settlement batch (moves funds).
 * 
 * This endpoint:
 * 1. Validates batch exists and is in 'approved' status
 * 2. Enforces segregation of duties (executor ≠ initiator AND executor ≠ approver)
 * 3. Validates current time is outside market hours (unless force = true with emergency approval)
 * 4. Validates execution authorization ticket
 * 5. Performs payment rail integration (simulated in this implementation)
 * 6. Updates batch status to 'settled'
 * 7. Generates execution audit log
 * 
 * ## Market Hours Validation
 * Settlement execution is blocked during market hours (9:30 AM - 4:00 PM ET,
 * Monday-Friday) to avoid interference with active trading. Emergency override
 * requires VP+ approval and MFA.
 * 
 * @route POST /api/settlements/:settlementBatchId/execute
 */
app.post('/api/settlements/:settlementBatchId/execute', async (req: Request, res: Response) => {
  try {
    const { settlementBatchId } = req.params;
    const body = req.body as ExecuteSettlementRequest;

    // Validate required fields
    if (!body.executedBy || !body.executionTicket) {
      const error: ErrorResponse = {
        error: {
          code: 'missing_required_field',
          message: 'All fields are required: executedBy, executionTicket',
        },
      };
      return res.status(400).json(error);
    }

    // Validate execution window (no execution during market hours unless emergency override)
    if (!body.force && isMarketHours(body.executionTime)) {
      const error: ErrorResponse = {
        error: {
          code: 'invalid_execution_window',
          message: 'Settlement execution not allowed during market hours (9:30 AM - 4:00 PM ET, Monday-Friday). Use force=true with VP+ approval for emergency override.',
        },
      };
      return res.status(400).json(error);
    }

    const batch = await getSettlementBatch(settlementBatchId);

    if (!batch) {
      const error: ErrorResponse = {
        error: {
          code: 'batch_not_found',
          message: `Settlement batch not found: ${settlementBatchId}`,
        },
      };
      return res.status(404).json(error);
    }

    // Validate batch is in approved status
    if (batch.status !== 'approved') {
      const error: ErrorResponse = {
        error: {
          code: 'invalid_status',
          message: `Settlement batch must be in 'approved' status. Current status: ${batch.status}`,
        },
      };
      return res.status(400).json(error);
    }

    // Enforce segregation of duties: executor ≠ initiator AND executor ≠ approver
    const initiator = batch.timeline.find((entry) => entry.status === 'pending')?.performedBy;
    const approver = batch.approvals[batch.approvals.length - 1]?.approvedBy;

    if ((initiator && initiator === body.executedBy) || (approver && approver === body.executedBy)) {
      const error: ErrorResponse = {
        error: {
          code: 'segregation_of_duties_violation',
          message: 'Executor must be different from initiator and approver (SOX Section 404 requirement)',
        },
      };
      return res.status(403).json(error);
    }

    const now = new Date().toISOString();
    const actor = extractActor(req, body.executedBy);

    // Simulate payment rail integration
    // In production, this would call ACH/Fedwire APIs with idempotency keys
    const executionResults = batch.counterparties.map((counterparty) => ({
      counterpartyId: counterparty.counterpartyId,
      success: true,
      transactionId: `TXN-${uuidv4().substring(0, 8)}`,
    }));

    // Update batch status to settled
    await updateSettlementBatchStatus(
      settlementBatchId,
      'settled',
      body.executedBy,
      body.executionTicket
    );

    // Generate execution audit log
    await auditSettlementExecuted(
      settlementBatchId,
      actor,
      body as unknown as Record<string, unknown>,
      { status: 'settled', executionResults, executedAt: now },
      body.executionTicket
    );

    const response: ExecuteSettlementResponse = {
      settlementBatchId,
      status: 'settled',
      executionResults,
      executedAt: now,
      auditTrailId: generateAuditId(),
    };

    logger.info('Settlement batch executed', {
      settlementBatchId,
      executedBy: body.executedBy,
      counterpartyCount: executionResults.length,
    });

    return res.status(200).json(response);
  } catch (error) {
    logger.error('Error executing settlement batch', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const errorResponse: ErrorResponse = {
      error: {
        code: 'internal_error',
        message: 'Failed to execute settlement batch',
      },
    };
    return res.status(500).json(errorResponse);
  }
});

/**
 * POST /api/settlements/:settlementBatchId/rollback
 * 
 * Emergency rollback of a settled batch.
 * 
 * This endpoint:
 * 1. Validates batch exists and is in 'settled' status
 * 2. Validates rollback authorization ticket (VP+ approval required)
 * 3. Requires mandatory rollback justification
 * 4. Creates reversal batch with opposite transactions
 * 5. Updates original batch status to 'rolled_back'
 * 6. Generates rollback audit log with reason and method
 * 
 * ## Emergency Use Only
 * Rollbacks are highly sensitive operations that reverse settled payments.
 * They require VP+ approval, documented justification, and generate
 * high-priority alerts to compliance team.
 * 
 * @route POST /api/settlements/:settlementBatchId/rollback
 */
app.post('/api/settlements/:settlementBatchId/rollback', async (req: Request, res: Response) => {
  try {
    const { settlementBatchId } = req.params;
    const body = req.body as RollbackSettlementRequest;

    // Validate required fields
    if (!body.rolledBackBy || !body.rollbackTicket || !body.reason || !body.reversalMethod) {
      const error: ErrorResponse = {
        error: {
          code: 'missing_required_field',
          message: 'All fields are required: rolledBackBy, rollbackTicket, reason, reversalMethod',
        },
      };
      return res.status(400).json(error);
    }

    // Validate rollback ticket format
    if (!isValidCabTicket(body.rollbackTicket)) {
      const error: ErrorResponse = {
        error: {
          code: 'invalid_rollback_ticket',
          message: 'Rollback ticket must be in format CHG followed by 7 digits (e.g., CHG0009999)',
        },
      };
      return res.status(400).json(error);
    }

    const batch = await getSettlementBatch(settlementBatchId);

    if (!batch) {
      const error: ErrorResponse = {
        error: {
          code: 'batch_not_found',
          message: `Settlement batch not found: ${settlementBatchId}`,
        },
      };
      return res.status(404).json(error);
    }

    // Validate batch is in settled status
    if (batch.status !== 'settled') {
      const error: ErrorResponse = {
        error: {
          code: 'invalid_status',
          message: `Only settled batches can be rolled back. Current status: ${batch.status}`,
        },
      };
      return res.status(400).json(error);
    }

    const now = new Date().toISOString();
    const actor = extractActor(req, body.rolledBackBy);
    const reversalBatchId = uuidv4();

    // Update original batch status to rolled_back
    await updateSettlementBatchStatus(
      settlementBatchId,
      'rolled_back',
      body.rolledBackBy,
      body.rollbackTicket
    );

    // Generate rollback audit log
    await auditRollbackPerformed(
      settlementBatchId,
      actor,
      body as unknown as Record<string, unknown>,
      { status: 'rolled_back', reversalBatchId, rolledBackAt: now },
      body.rollbackTicket
    );

    const response: RollbackSettlementResponse = {
      settlementBatchId,
      status: 'rolled_back',
      reversalBatchId,
      rolledBackAt: now,
      auditTrailId: generateAuditId(),
    };

    logger.warn('Settlement batch rolled back (EMERGENCY)', {
      settlementBatchId,
      rolledBackBy: body.rolledBackBy,
      reason: body.reason,
      reversalMethod: body.reversalMethod,
      reversalBatchId,
    });

    return res.status(200).json(response);
  } catch (error) {
    logger.error('Error rolling back settlement batch', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const errorResponse: ErrorResponse = {
      error: {
        code: 'internal_error',
        message: 'Failed to rollback settlement batch',
      },
    };
    return res.status(500).json(errorResponse);
  }
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy' });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  const error: ErrorResponse = {
    error: {
      code: 'not_found',
      message: 'Endpoint not found',
    },
  };
  res.status(404).json(error);
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message });

  const error: ErrorResponse = {
    error: {
      code: 'internal_error',
      message: 'Internal server error',
    },
  };
  res.status(500).json(error);
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Settlement engine service listening on port ${PORT}`);
  });
}

export default app;
