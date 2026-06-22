/**
 * Step Functions Workflow Integration
 * 
 * Manages settlement calculation workflow orchestration via AWS Step Functions.
 * The workflow handles:
 * - Net position calculation
 * - Calculation result persistence
 * - Audit log generation
 * - Human approval wait states
 * 
 * ## Workflow Overview
 * ```
 * START
 *   ↓
 * [Calculate Net Positions] ← Fan-out across counterparties
 *   ↓
 * [Aggregate Results]
 *   ↓
 * [Persist to DynamoDB]
 *   ↓
 * [Generate Audit Log]
 *   ↓
 * [Wait for Approval] ← Human approval step
 *   ↓
 * [Validate Execution Window]
 *   ↓
 * [Execute Payments]
 *   ↓
 * END
 * ```
 * 
 * ## Configuration
 * Environment variables:
 * - `AWS_REGION`: AWS region for Step Functions (default: us-east-1)
 * - `STEP_FUNCTIONS_STATE_MACHINE_ARN`: Settlement workflow state machine ARN
 * 
 * @module workflow
 */

import {
  SFNClient,
  StartExecutionCommand,
  DescribeExecutionCommand,
} from '@aws-sdk/client-sfn';
import { v4 as uuidv4 } from 'uuid';
import { CalculateSettlementInput, CalculateSettlementOutput } from './types';
import logger from './logger';

const sfnClient = new SFNClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const STATE_MACHINE_ARN =
  process.env.STEP_FUNCTIONS_STATE_MACHINE_ARN || '';

/**
 * Workflow execution status from Step Functions.
 * 
 * Maps to Step Functions execution status values:
 * - RUNNING: Workflow is in progress
 * - SUCCEEDED: Workflow completed successfully
 * - FAILED: Workflow failed with an error
 * - TIMED_OUT: Workflow exceeded maximum execution time
 * - ABORTED: Workflow was manually stopped
 */
export type WorkflowStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';

/**
 * Workflow execution details.
 */
export interface WorkflowExecution {
  /** Step Functions execution ARN */
  executionArn: string;

  /** Current status */
  status: WorkflowStatus;

  /** Workflow input (settlement parameters) */
  input: CalculateSettlementInput;

  /** Workflow output (calculation results, only present if SUCCEEDED) */
  output?: CalculateSettlementOutput;

  /** ISO 8601 timestamp when execution started */
  startDate: string;

  /** ISO 8601 timestamp when execution stopped (if completed) */
  stopDate?: string;
}

/**
 * Start a settlement calculation workflow in Step Functions.
 * 
 * Initiates an asynchronous workflow that:
 * 1. Queries TransactionLedger table for transactions in the settlement period
 * 2. Calculates net positions for each counterparty
 * 3. Validates that debits = credits (double-entry accounting)
 * 4. Persists calculated positions to SettlementBatches table
 * 5. Generates calculation audit log in S3
 * 
 * The workflow executes asynchronously. Use `getWorkflowExecutionStatus` to poll
 * for completion and retrieve calculation results.
 * 
 * ## Input Validation
 * - settlementBatchId must be a valid UUID
 * - settlementPeriod must be ISO date format (YYYY-MM-DD)
 * - counterparties array must not be empty
 * - settlementType must be 'net' or 'gross'
 * - currency must be valid ISO currency code (e.g., 'USD')
 * 
 * ## Execution Naming
 * Execution name format: `settlement-{settlementBatchId}-{random-suffix}`
 * This ensures uniqueness while allowing correlation with batch ID.
 * 
 * @param input - Settlement calculation parameters
 * @returns Execution ARN for polling workflow status
 * @throws Step Functions client errors
 * 
 * @example
 * ```typescript
 * const executionArn = await startSettlementWorkflow({
 *   settlementBatchId: "550e8400-e29b-41d4-a716-446655440000",
 *   settlementPeriod: "2024-01-15",
 *   counterparties: ["BANK001", "BANK002", "BANK003"],
 *   settlementType: "net",
 *   currency: "USD"
 * });
 * 
 * console.log(`Workflow started: ${executionArn}`);
 * // Poll for results:
 * const execution = await getWorkflowExecutionStatus(executionArn);
 * ```
 */
export async function startSettlementWorkflow(
  input: CalculateSettlementInput
): Promise<string> {
  const executionName = `settlement-${input.settlementBatchId}-${uuidv4().substring(0, 8)}`;

  const command = new StartExecutionCommand({
    stateMachineArn: STATE_MACHINE_ARN,
    name: executionName,
    input: JSON.stringify(input),
  });

  const response = await sfnClient.send(command);

  logger.info('Settlement workflow started', {
    executionArn: response.executionArn,
    settlementBatchId: input.settlementBatchId,
    settlementPeriod: input.settlementPeriod,
    counterpartyCount: input.counterparties.length,
  });

  return response.executionArn!;
}

/**
 * Get the current status and results of a workflow execution.
 * 
 * Queries Step Functions to retrieve execution details including:
 * - Current status (RUNNING, SUCCEEDED, FAILED, etc.)
 * - Start and stop timestamps
 * - Input parameters
 * - Output results (if execution succeeded)
 * 
 * ## Polling Strategy
 * For long-running calculations, poll this endpoint with exponential backoff:
 * - Initial poll: 5 seconds after starting workflow
 * - Subsequent polls: 10 seconds, 20 seconds, 40 seconds
 * - Max polling duration: 5 minutes (workflow should complete within 30 seconds P99)
 * 
 * ## Status Handling
 * - RUNNING: Continue polling
 * - SUCCEEDED: Parse output and update settlement batch
 * - FAILED: Log error and mark batch as failed
 * - TIMED_OUT: Retry workflow or escalate to ops
 * - ABORTED: Manual intervention required
 * 
 * @param executionArn - Step Functions execution ARN from startSettlementWorkflow
 * @returns Workflow execution details
 * @throws Step Functions client errors
 * 
 * @example
 * ```typescript
 * const execution = await getWorkflowExecutionStatus(executionArn);
 * 
 * if (execution.status === 'SUCCEEDED') {
 *   console.log('Calculation complete:', execution.output);
 *   // Update batch with calculated positions
 * } else if (execution.status === 'RUNNING') {
 *   console.log('Calculation in progress...');
 *   // Poll again in 10 seconds
 * } else {
 *   console.error('Workflow failed:', execution.status);
 *   // Mark batch as failed
 * }
 * ```
 */
export async function getWorkflowExecutionStatus(
  executionArn: string
): Promise<WorkflowExecution> {
  const command = new DescribeExecutionCommand({
    executionArn,
  });

  const response = await sfnClient.send(command);

  const execution: WorkflowExecution = {
    executionArn: response.executionArn!,
    status: response.status as WorkflowStatus,
    input: JSON.parse(response.input!) as CalculateSettlementInput,
    startDate: response.startDate!.toISOString(),
  };

  // Add output if execution succeeded
  if (response.status === 'SUCCEEDED' && response.output) {
    execution.output = JSON.parse(response.output) as CalculateSettlementOutput;
  }

  // Add stop date if execution completed
  if (response.stopDate) {
    execution.stopDate = response.stopDate.toISOString();
  }

  logger.info('Workflow execution status retrieved', {
    executionArn,
    status: execution.status,
    settlementBatchId: execution.input.settlementBatchId,
  });

  return execution;
}
