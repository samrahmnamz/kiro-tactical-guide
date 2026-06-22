import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Settlement Engine Stack
 * 
 * Financial settlement processing engine with regulatory compliance.
 * Demonstrates FSI deployment windows, approval requirements, and audit trails.
 * 
 * Primary Concerns Addressed:
 * - FSI Regulatory Complexity (Concern #9)
 * - Security & Compliance (Concern #1)
 * - Knowledge Loss (Concern #10)
 * 
 * Toolkit Artifacts Demonstrated:
 * - deployment-window.yaml - Time-based deployment restrictions
 * - require-approvals.yaml - Change authorization validation
 * - validate-iam.yaml - IAM policy validation (no wildcards)
 * - region-config.yaml - Data residency controls (us-east-1 only)
 * - logging-standard.spec.md - Audit trail logging
 * 
 * Regulatory Requirements:
 * - SOX Section 404: Segregation of duties (initiator ≠ approver ≠ executor)
 * - FDIC: Data residency in us-east-1 only
 * - OCC: 10-year audit trail retention with WORM compliance
 * - Federal Reserve: No deployments during market hours (9:30 AM - 4:00 PM ET)
 * - SEC: Change authorization for all production changes
 * 
 * Infrastructure Components:
 * - DynamoDB tables: SettlementBatches, TransactionLedger
 * - S3 bucket: Audit logs with Object Lock (WORM)
 * - Step Functions: SettlementWorkflow state machine
 * - Lambda functions: Initiate, Calculate, Approve, Execute, Rollback
 * - IAM roles: Segregated initiator, approver, executor roles
 * - API Gateway: REST API for settlement operations
 * - CloudWatch alarms: Monitoring for failures and audit issues
 * - SQS queue: Async audit log writes
 */
export class SettlementEngineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Verify deployment region for data residency compliance
    if (this.region !== 'us-east-1') {
      throw new Error('Settlement Engine must be deployed in us-east-1 for FDIC data residency compliance');
    }

    // ========================================
    // DynamoDB Tables
    // ========================================

    // Table: SettlementBatches - stores settlement batch records
    const settlementTable = new dynamodb.Table(this, 'SettlementBatches', {
      tableName: 'SettlementBatches',
      partitionKey: {
        name: 'settlementBatchId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'settlementPeriod',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand for month-end spikes
      encryption: dynamodb.TableEncryption.AWS_MANAGED, // Encryption at rest
      pointInTimeRecovery: true, // Disaster recovery requirement
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Preserve data on stack deletion
      timeToLiveAttribute: 'ttl', // Auto-delete after 10 years (SOX + 3 years)
    });

    // GSI: Query settlements by period
    settlementTable.addGlobalSecondaryIndex({
      indexName: 'by-period',
      partitionKey: {
        name: 'settlementPeriod',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Table: TransactionLedger - stores individual transactions
    const transactionTable = new dynamodb.Table(this, 'TransactionLedger', {
      tableName: 'TransactionLedger',
      partitionKey: {
        name: 'transactionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl', // 10-year retention
    });

    // GSI: Query transactions by settlement batch
    transactionTable.addGlobalSecondaryIndex({
      indexName: 'by-settlement-batch',
      partitionKey: {
        name: 'settlementBatchId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'transactionDate',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========================================
    // S3 Audit Logs Bucket with WORM Compliance
    // ========================================

    // S3 bucket for audit logs with Object Lock (WORM)
    const auditLogsBucket = new s3.Bucket(this, 'AuditLogsBucket', {
      bucketName: `settlement-audit-logs-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED, // AES-256 encryption
      objectLockEnabled: true, // WORM compliance
      versioned: true, // Required for Object Lock
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'TransitionToGlacier',
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90), // Move to Glacier after 90 days
            },
          ],
          enabled: true,
        },
        {
          id: 'DeleteAfter10Years',
          expiration: cdk.Duration.days(3650), // 10-year retention (SOX requirement)
          enabled: true,
        },
      ],
    });

    // ========================================
    // SQS Queue for Async Audit Log Writes
    // ========================================

    // Dead Letter Queue for failed audit log writes
    const auditLogDLQ = new sqs.Queue(this, 'AuditLogDLQ', {
      queueName: 'settlement-audit-log-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // SQS queue for async audit log writes
    const auditLogQueue = new sqs.Queue(this, 'AuditLogQueue', {
      queueName: 'settlement-audit-log-queue',
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.hours(4),
      deadLetterQueue: {
        queue: auditLogDLQ,
        maxReceiveCount: 3,
      },
    });

    // ========================================
    // IAM Roles with Segregation of Duties
    // ========================================

    // Initiator Role - Can create settlement batches
    const initiatorRole = new iam.Role(this, 'SettlementInitiatorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Settlement initiator role - can create settlement batches',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant specific permissions (no wildcards)
    settlementTable.grantWriteData(initiatorRole);
    transactionTable.grantReadData(initiatorRole);
    auditLogQueue.grantSendMessages(initiatorRole);

    // Calculation Role - Can read and calculate net positions
    const calculationRole = new iam.Role(this, 'SettlementCalculationRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Settlement calculation role - can read transactions and calculate net positions',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    settlementTable.grantReadWriteData(calculationRole);
    transactionTable.grantReadData(calculationRole);
    auditLogQueue.grantSendMessages(calculationRole);

    // Approver Role - Can approve calculated settlements
    const approverRole = new iam.Role(this, 'SettlementApproverRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Settlement approver role - can approve calculated settlements',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    settlementTable.grantReadWriteData(approverRole);
    auditLogQueue.grantSendMessages(approverRole);

    // Executor Role - Can execute approved settlements
    const executorRole = new iam.Role(this, 'SettlementExecutorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Settlement executor role - can execute approved settlements',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    settlementTable.grantReadWriteData(executorRole);
    transactionTable.grantReadWriteData(executorRole);
    auditLogQueue.grantSendMessages(executorRole);

    // Rollback Role - Can rollback settled batches
    const rollbackRole = new iam.Role(this, 'SettlementRollbackRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Settlement rollback role - emergency use only',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    settlementTable.grantReadWriteData(rollbackRole);
    transactionTable.grantReadWriteData(rollbackRole);
    auditLogQueue.grantSendMessages(rollbackRole);

    // Audit Log Writer Role - Writes audit logs to S3
    const auditLogWriterRole = new iam.Role(this, 'AuditLogWriterRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Audit log writer role - writes audit logs to S3',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    auditLogsBucket.grantWrite(auditLogWriterRole);
    auditLogQueue.grantConsumeMessages(auditLogWriterRole);

    // Step Functions Execution Role
    const stepFunctionsRole = new iam.Role(this, 'SettlementWorkflowRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      description: 'Settlement workflow execution role',
    });

    // ========================================
    // Lambda Functions
    // ========================================

    // Common Lambda environment variables
    const commonEnv = {
      SETTLEMENT_TABLE: settlementTable.tableName,
      TRANSACTION_TABLE: transactionTable.tableName,
      AUDIT_QUEUE_URL: auditLogQueue.queueUrl,
      NODE_ENV: 'production',
    };

    // Lambda: Initiate Settlement Batch
    const initiateFunction = new lambda.Function(this, 'InitiateSettlement', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'initiate.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist')),
      role: initiatorRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      reservedConcurrentExecutions: 20,
      logRetention: logs.RetentionDays.TEN_YEARS, // 10-year retention
    });

    // Lambda: Calculate Net Positions
    const calculateFunction = new lambda.Function(this, 'CalculateNetPositions', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'calculate.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist')),
      role: calculationRole,
      timeout: cdk.Duration.seconds(60), // More time for complex calculations
      memorySize: 1024,
      environment: commonEnv,
      reservedConcurrentExecutions: 10,
      logRetention: logs.RetentionDays.TEN_YEARS,
    });

    // Lambda: Approve Settlement
    const approveFunction = new lambda.Function(this, 'ApproveSettlement', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'approve.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist')),
      role: approverRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      reservedConcurrentExecutions: 10,
      logRetention: logs.RetentionDays.TEN_YEARS,
    });

    // Lambda: Execute Settlement (move funds)
    const executeFunction = new lambda.Function(this, 'ExecuteSettlement', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'execute.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist')),
      role: executorRole,
      timeout: cdk.Duration.minutes(5), // More time for payment rail integration
      memorySize: 1024,
      environment: commonEnv,
      reservedConcurrentExecutions: 5,
      logRetention: logs.RetentionDays.TEN_YEARS,
    });

    // Lambda: Rollback Settlement (emergency use)
    const rollbackFunction = new lambda.Function(this, 'RollbackSettlement', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'rollback.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist')),
      role: rollbackRole,
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: commonEnv,
      reservedConcurrentExecutions: 2, // Emergency use only
      logRetention: logs.RetentionDays.TEN_YEARS,
    });

    // Lambda: Write Audit Logs to S3
    const auditLogWriter = new lambda.Function(this, 'AuditLogWriter', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'auditLogWriter.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist')),
      role: auditLogWriterRole,
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        AUDIT_BUCKET: auditLogsBucket.bucketName,
        NODE_ENV: 'production',
      },
      reservedConcurrentExecutions: 10,
      logRetention: logs.RetentionDays.TEN_YEARS,
    });

    // Add SQS trigger for audit log writer
    auditLogWriter.addEventSource(
      new lambdaEventSources.SqsEventSource(auditLogQueue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    // Grant Lambda invocation permissions to Step Functions
    initiateFunction.grantInvoke(stepFunctionsRole);
    calculateFunction.grantInvoke(stepFunctionsRole);
    approveFunction.grantInvoke(stepFunctionsRole);
    executeFunction.grantInvoke(stepFunctionsRole);

    // ========================================
    // Step Functions Workflow
    // ========================================

    // Define workflow tasks
    const calculateTask = new tasks.LambdaInvoke(this, 'CalculateNetPositions', {
      lambdaFunction: calculateFunction,
      outputPath: '$.Payload',
    });

    const approvalTask = new tasks.LambdaInvoke(this, 'WaitForApproval', {
      lambdaFunction: approveFunction,
      outputPath: '$.Payload',
    });

    const executeTask = new tasks.LambdaInvoke(this, 'ExecutePayments', {
      lambdaFunction: executeFunction,
      outputPath: '$.Payload',
    });

    const successState = new sfn.Succeed(this, 'SettlementComplete');
    const failureState = new sfn.Fail(this, 'SettlementFailed', {
      cause: 'Settlement workflow failed',
      error: 'WorkflowExecutionError',
    });

    // Define workflow
    const definition = calculateTask
      .next(approvalTask)
      .next(
        new sfn.Choice(this, 'ApprovalCheck')
          .when(sfn.Condition.stringEquals('$.status', 'approved'), executeTask)
          .otherwise(failureState)
      );

    executeTask.next(successState);

    // Create state machine
    const settlementWorkflow = new sfn.StateMachine(this, 'SettlementWorkflow', {
      stateMachineName: 'SettlementWorkflow',
      definition,
      role: stepFunctionsRole,
      logs: {
        destination: new logs.LogGroup(this, 'SettlementWorkflowLogs', {
          logGroupName: '/aws/vendedlogs/states/settlement-workflow',
          retention: logs.RetentionDays.TEN_YEARS,
        }),
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: true,
    });

    // ========================================
    // API Gateway REST API
    // ========================================

    const api = new apigateway.RestApi(this, 'SettlementApi', {
      restApiName: 'Settlement Engine API',
      description: 'Financial settlement processing with regulatory compliance',
      deployOptions: {
        stageName: 'prod',
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false, // Don't log request/response bodies (PII)
        metricsEnabled: true,
        throttlingBurstLimit: 1000,
        throttlingRateLimit: 500,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Lambda integrations
    const initiateIntegration = new apigateway.LambdaIntegration(initiateFunction);
    const approveIntegration = new apigateway.LambdaIntegration(approveFunction);
    const executeIntegration = new apigateway.LambdaIntegration(executeFunction);
    const rollbackIntegration = new apigateway.LambdaIntegration(rollbackFunction);

    // API routes
    const apiResource = api.root.addResource('api');
    const settlementsResource = apiResource.addResource('settlements');

    // POST /api/settlements/initiate
    settlementsResource.addResource('initiate').addMethod('POST', initiateIntegration);

    // GET /api/settlements/{id}
    const settlementIdResource = settlementsResource.addResource('{id}');
    settlementIdResource.addMethod('GET', new apigateway.LambdaIntegration(initiateFunction));

    // POST /api/settlements/{id}/approve
    settlementIdResource.addResource('approve').addMethod('POST', approveIntegration);

    // POST /api/settlements/{id}/execute
    settlementIdResource.addResource('execute').addMethod('POST', executeIntegration);

    // POST /api/settlements/{id}/rollback
    settlementIdResource.addResource('rollback').addMethod('POST', rollbackIntegration);

    // ========================================
    // CloudWatch Alarms
    // ========================================

    // Alarm: High settlement failure rate
    const settlementFailureMetric = new cloudwatch.Metric({
      namespace: 'SettlementEngine',
      metricName: 'SettlementFailureRate',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    new cloudwatch.Alarm(this, 'SettlementFailureAlarm', {
      metric: settlementFailureMetric,
      threshold: 0.01, // 1% failure rate
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'Alert when settlement failure rate exceeds 1%',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm: Audit log write failures
    const auditLogDLQMetric = auditLogDLQ.metricApproximateNumberOfMessagesVisible({
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    new cloudwatch.Alarm(this, 'AuditLogFailureAlarm', {
      metric: auditLogDLQMetric,
      threshold: 10,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when audit log writes fail (DLQ has messages)',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm: Step Functions execution errors
    const workflowErrorMetric = settlementWorkflow.metricFailed({
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });

    new cloudwatch.Alarm(this, 'WorkflowExecutionErrorAlarm', {
      metric: workflowErrorMetric,
      threshold: 5,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'Alert when Step Functions workflow execution errors are high',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm: API Gateway 5xx errors
    const apiErrorMetric = api.metricServerError({
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });

    new cloudwatch.Alarm(this, 'ApiServerErrorAlarm', {
      metric: apiErrorMetric,
      threshold: 10,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'Alert when API Gateway 5xx error rate is high',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ========================================
    // Stack Outputs
    // ========================================

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Settlement Engine API endpoint',
      exportName: 'SettlementEngineApiUrl',
    });

    new cdk.CfnOutput(this, 'SettlementTableName', {
      value: settlementTable.tableName,
      description: 'DynamoDB table for settlement batches',
      exportName: 'SettlementBatchesTableName',
    });

    new cdk.CfnOutput(this, 'TransactionTableName', {
      value: transactionTable.tableName,
      description: 'DynamoDB table for transaction ledger',
      exportName: 'TransactionLedgerTableName',
    });

    new cdk.CfnOutput(this, 'AuditLogsBucketName', {
      value: auditLogsBucket.bucketName,
      description: 'S3 bucket for audit logs (WORM compliance)',
      exportName: 'SettlementAuditLogsBucketName',
    });

    new cdk.CfnOutput(this, 'WorkflowArn', {
      value: settlementWorkflow.stateMachineArn,
      description: 'Step Functions state machine ARN',
      exportName: 'SettlementWorkflowArn',
    });

    new cdk.CfnOutput(this, 'InitiatorRoleArn', {
      value: initiatorRole.roleArn,
      description: 'IAM role for settlement initiators',
      exportName: 'SettlementInitiatorRoleArn',
    });

    new cdk.CfnOutput(this, 'ApproverRoleArn', {
      value: approverRole.roleArn,
      description: 'IAM role for settlement approvers',
      exportName: 'SettlementApproverRoleArn',
    });

    new cdk.CfnOutput(this, 'ExecutorRoleArn', {
      value: executorRole.roleArn,
      description: 'IAM role for settlement executors',
      exportName: 'SettlementExecutorRoleArn',
    });
  }
}
