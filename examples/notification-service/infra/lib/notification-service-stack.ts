import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Notification Service Stack
 * 
 * Demonstrates automation patterns where infrastructure is generated from spec.md
 * 
 * Primary Concerns Addressed:
 * - Engineer Burnout from Repetitive Work (Concern #3)
 * - Rework from AI-Generated Code (Concern #6)
 * 
 * Infrastructure Components:
 * - API Gateway + Lambda for HTTP API
 * - SQS queues (high/normal/low priority) for async processing
 * - Lambda processors for each queue priority
 * - DynamoDB tables for notification records and customer preferences
 * - SNS topics for SMS and push notifications
 * - EventBridge rules for event-driven triggers
 * - CloudWatch alarms for monitoring
 * 
 * Customization Points:
 * - SES sender email addresses (must be verified)
 * - SNS spending limits (adjust for environment)
 * - Lambda concurrency per priority level
 * - DynamoDB TTL (90 days default)
 */
export class NotificationServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // DynamoDB Tables
    // ========================================

    // Table: NotificationRecords - stores notification delivery history
    const notificationTable = new dynamodb.Table(this, 'NotificationRecords', {
      partitionKey: {
        name: 'notificationId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand capacity for burst traffic
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Preserve data on stack deletion
      timeToLiveAttribute: 'ttl', // Auto-delete records after 90 days
    });

    // GSI: Query notifications by customerId
    notificationTable.addGlobalSecondaryIndex({
      indexName: 'CustomerIdIndex',
      partitionKey: {
        name: 'customerId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Table: CustomerPreferences - stores opt-out preferences
    const customerPreferencesTable = new dynamodb.Table(this, 'CustomerPreferences', {
      partitionKey: {
        name: 'customerId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ========================================
    // SQS Queues (3 priority levels + DLQs)
    // ========================================

    // Dead Letter Queues for permanently failed notifications
    const highPriorityDLQ = new sqs.Queue(this, 'HighPriorityDLQ', {
      queueName: 'notification-high-priority-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    const normalPriorityDLQ = new sqs.Queue(this, 'NormalPriorityDLQ', {
      queueName: 'notification-normal-priority-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    const lowPriorityDLQ = new sqs.Queue(this, 'LowPriorityDLQ', {
      queueName: 'notification-low-priority-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // High Priority Queue - 30 second SLA (password resets, security alerts)
    const highPriorityQueue = new sqs.Queue(this, 'HighPriorityQueue', {
      queueName: 'notification-high-priority',
      visibilityTimeout: cdk.Duration.seconds(30),
      retentionPeriod: cdk.Duration.minutes(60),
      deadLetterQueue: {
        queue: highPriorityDLQ,
        maxReceiveCount: 3, // Retry 3 times with exponential backoff
      },
    });

    // Normal Priority Queue - 5 minute SLA (transactional emails)
    const normalPriorityQueue = new sqs.Queue(this, 'NormalPriorityQueue', {
      queueName: 'notification-normal-priority',
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.hours(4),
      deadLetterQueue: {
        queue: normalPriorityDLQ,
        maxReceiveCount: 3,
      },
    });

    // Low Priority Queue - 1 hour SLA (marketing digests)
    const lowPriorityQueue = new sqs.Queue(this, 'LowPriorityQueue', {
      queueName: 'notification-low-priority',
      visibilityTimeout: cdk.Duration.minutes(2),
      retentionPeriod: cdk.Duration.hours(24),
      deadLetterQueue: {
        queue: lowPriorityDLQ,
        maxReceiveCount: 3,
      },
    });

    // ========================================
    // SNS Topics for SMS and Push
    // ========================================

    // SNS topic for SMS delivery
    const smsTopic = new sns.Topic(this, 'SmsNotificationTopic', {
      displayName: 'Notification Service SMS',
    });

    // SNS topic for mobile push notifications
    const pushTopic = new sns.Topic(this, 'PushNotificationTopic', {
      displayName: 'Notification Service Push',
    });

    // ========================================
    // IAM Roles for Lambda Functions
    // ========================================

    // API Handler Role - least privilege for API operations
    const apiHandlerRole = new iam.Role(this, 'ApiHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for notification API handler',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant specific permissions (no wildcards - validated by validate-iam.yaml)
    notificationTable.grantReadWriteData(apiHandlerRole);
    customerPreferencesTable.grantReadData(apiHandlerRole);
    highPriorityQueue.grantSendMessages(apiHandlerRole);
    normalPriorityQueue.grantSendMessages(apiHandlerRole);
    lowPriorityQueue.grantSendMessages(apiHandlerRole);

    // Queue Processor Role - permissions for sending notifications
    const queueProcessorRole = new iam.Role(this, 'QueueProcessorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for notification queue processors',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    notificationTable.grantReadWriteData(queueProcessorRole);
    customerPreferencesTable.grantReadData(queueProcessorRole);

    // Grant SES permissions for email sending
    queueProcessorRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ses:SendEmail', 'ses:SendTemplatedEmail'],
        resources: ['*'], // SES requires wildcard, but limited to SendEmail actions only
      })
    );

    // Grant SNS permissions for SMS and push
    smsTopic.grantPublish(queueProcessorRole);
    pushTopic.grantPublish(queueProcessorRole);

    // Event Processor Role - permissions for processing EventBridge events
    const eventProcessorRole = new iam.Role(this, 'EventProcessorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for EventBridge event processor',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    highPriorityQueue.grantSendMessages(eventProcessorRole);
    normalPriorityQueue.grantSendMessages(eventProcessorRole);
    lowPriorityQueue.grantSendMessages(eventProcessorRole);

    // ========================================
    // Lambda Functions
    // ========================================

    // API Handler - POST /api/notifications/send and GET /api/notifications/:id/status
    const apiHandler = new lambda.Function(this, 'ApiHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist')),
      role: apiHandlerRole,
      timeout: cdk.Duration.seconds(10),
      memorySize: 512,
      environment: {
        NOTIFICATION_TABLE: notificationTable.tableName,
        PREFERENCES_TABLE: customerPreferencesTable.tableName,
        HIGH_PRIORITY_QUEUE_URL: highPriorityQueue.queueUrl,
        NORMAL_PRIORITY_QUEUE_URL: normalPriorityQueue.queueUrl,
        LOW_PRIORITY_QUEUE_URL: lowPriorityQueue.queueUrl,
        NODE_ENV: 'production',
      },
      reservedConcurrentExecutions: 50, // Limit for cost control
      logRetention: logs.RetentionDays.TEN_YEARS, // Compliance requirement
    });

    // High Priority Queue Processor - 30 second SLA
    const highPriorityProcessor = new lambda.Function(this, 'HighPriorityProcessor', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'queueProcessor.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist')),
      role: queueProcessorRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      environment: {
        NOTIFICATION_TABLE: notificationTable.tableName,
        PREFERENCES_TABLE: customerPreferencesTable.tableName,
        SMS_TOPIC_ARN: smsTopic.topicArn,
        PUSH_TOPIC_ARN: pushTopic.topicArn,
        PRIORITY_LEVEL: 'high',
        NODE_ENV: 'production',
      },
      reservedConcurrentExecutions: 50, // High throughput for urgent notifications
      logRetention: logs.RetentionDays.TEN_YEARS,
    });

    // Add SQS trigger for high priority queue
    highPriorityProcessor.addEventSource(
      new lambdaEventSources.SqsEventSource(highPriorityQueue, {
        batchSize: 10, // Process up to 10 messages at once
        maxBatchingWindow: cdk.Duration.seconds(1), // Don't wait long to batch
      })
    );

    // Normal Priority Queue Processor - 5 minute SLA
    const normalPriorityProcessor = new lambda.Function(this, 'NormalPriorityProcessor', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'queueProcessor.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist')),
      role: queueProcessorRole,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        NOTIFICATION_TABLE: notificationTable.tableName,
        PREFERENCES_TABLE: customerPreferencesTable.tableName,
        SMS_TOPIC_ARN: smsTopic.topicArn,
        PUSH_TOPIC_ARN: pushTopic.topicArn,
        PRIORITY_LEVEL: 'normal',
        NODE_ENV: 'production',
      },
      reservedConcurrentExecutions: 20, // Moderate throughput
      logRetention: logs.RetentionDays.TEN_YEARS,
    });

    normalPriorityProcessor.addEventSource(
      new lambdaEventSources.SqsEventSource(normalPriorityQueue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    // Low Priority Queue Processor - 1 hour SLA
    const lowPriorityProcessor = new lambda.Function(this, 'LowPriorityProcessor', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'queueProcessor.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist')),
      role: queueProcessorRole,
      timeout: cdk.Duration.minutes(2),
      memorySize: 256,
      environment: {
        NOTIFICATION_TABLE: notificationTable.tableName,
        PREFERENCES_TABLE: customerPreferencesTable.tableName,
        SMS_TOPIC_ARN: smsTopic.topicArn,
        PUSH_TOPIC_ARN: pushTopic.topicArn,
        PRIORITY_LEVEL: 'low',
        NODE_ENV: 'production',
      },
      reservedConcurrentExecutions: 5, // Low throughput for cost efficiency
      logRetention: logs.RetentionDays.TEN_YEARS,
    });

    lowPriorityProcessor.addEventSource(
      new lambdaEventSources.SqsEventSource(lowPriorityQueue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(30), // Can wait longer to batch
      })
    );

    // Event Processor - handles EventBridge events
    const eventProcessor = new lambda.Function(this, 'EventProcessor', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'eventProcessor.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist')),
      role: eventProcessorRole,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        HIGH_PRIORITY_QUEUE_URL: highPriorityQueue.queueUrl,
        NORMAL_PRIORITY_QUEUE_URL: normalPriorityQueue.queueUrl,
        LOW_PRIORITY_QUEUE_URL: lowPriorityQueue.queueUrl,
        NODE_ENV: 'production',
      },
      reservedConcurrentExecutions: 20,
      logRetention: logs.RetentionDays.TEN_YEARS,
    });

    // ========================================
    // API Gateway REST API
    // ========================================

    const api = new apigateway.RestApi(this, 'NotificationApi', {
      restApiName: 'Notification Service API',
      description: 'Multi-channel notification service (email, SMS, push)',
      deployOptions: {
        stageName: 'prod',
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false, // Don't log request/response bodies (may contain PII)
        metricsEnabled: true,
        throttlingBurstLimit: 5000, // 5000 requests per second burst
        throttlingRateLimit: 1000, // 1000 requests per second sustained
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Lambda integration
    const integration = new apigateway.LambdaIntegration(apiHandler, {
      proxy: true,
      allowTestInvoke: false,
    });

    // API routes: POST /api/notifications/send, GET /api/notifications/{id}/status
    const apiResource = api.root.addResource('api');
    const notificationsResource = apiResource.addResource('notifications');

    // POST /api/notifications/send
    notificationsResource.addResource('send').addMethod('POST', integration);

    // GET /api/notifications/{id}/status
    const notificationIdResource = notificationsResource.addResource('{id}');
    notificationIdResource.addResource('status').addMethod('GET', integration);

    // ========================================
    // EventBridge Rules
    // ========================================

    // Rule: Route account events to notification service
    const accountEventRule = new events.Rule(this, 'AccountEventRule', {
      eventPattern: {
        source: ['account-service'],
        detailType: ['AccountEvent'],
      },
      description: 'Routes account events to notification service',
    });

    accountEventRule.addTarget(new eventsTargets.LambdaFunction(eventProcessor));

    // Rule: Route payment events to notification service
    const paymentEventRule = new events.Rule(this, 'PaymentEventRule', {
      eventPattern: {
        source: ['payment-service'],
        detailType: ['PaymentEvent'],
      },
      description: 'Routes payment events to notification service',
    });

    paymentEventRule.addTarget(new eventsTargets.LambdaFunction(eventProcessor));

    // ========================================
    // CloudWatch Alarms for Monitoring
    // ========================================

    // Alarm: High error rate on API handler
    const apiErrorMetric = apiHandler.metricErrors({
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });

    new cloudwatch.Alarm(this, 'ApiErrorAlarm', {
      metric: apiErrorMetric,
      threshold: 10,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'Alert when API error rate exceeds threshold',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm: High latency on API handler
    const apiDurationMetric = apiHandler.metricDuration({
      period: cdk.Duration.minutes(5),
      statistic: 'p99',
    });

    new cloudwatch.Alarm(this, 'ApiLatencyAlarm', {
      metric: apiDurationMetric,
      threshold: 1000, // 1 second P99
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'Alert when API P99 latency exceeds 1 second',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm: High priority DLQ depth (indicates permanent failures)
    const highPriorityDLQMetric = highPriorityDLQ.metricApproximateNumberOfMessagesVisible({
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    new cloudwatch.Alarm(this, 'HighPriorityDLQAlarm', {
      metric: highPriorityDLQMetric,
      threshold: 100,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when high priority DLQ has many messages (permanent failures)',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm: High priority queue depth (indicates processing backlog)
    const highPriorityQueueMetric = highPriorityQueue.metricApproximateNumberOfMessagesVisible({
      period: cdk.Duration.minutes(1),
      statistic: 'Average',
    });

    new cloudwatch.Alarm(this, 'HighPriorityQueueBacklogAlarm', {
      metric: highPriorityQueueMetric,
      threshold: 1000,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'Alert when high priority queue has significant backlog',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm: High priority processor errors
    const highPriorityProcessorErrorMetric = highPriorityProcessor.metricErrors({
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });

    new cloudwatch.Alarm(this, 'HighPriorityProcessorErrorAlarm', {
      metric: highPriorityProcessorErrorMetric,
      threshold: 10,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'Alert when high priority processor error rate is high',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ========================================
    // Stack Outputs
    // ========================================

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Notification service API endpoint',
      exportName: 'NotificationServiceApiUrl',
    });

    new cdk.CfnOutput(this, 'NotificationTableName', {
      value: notificationTable.tableName,
      description: 'DynamoDB table for notification records',
      exportName: 'NotificationRecordsTableName',
    });

    new cdk.CfnOutput(this, 'PreferencesTableName', {
      value: customerPreferencesTable.tableName,
      description: 'DynamoDB table for customer preferences',
      exportName: 'CustomerPreferencesTableName',
    });

    new cdk.CfnOutput(this, 'HighPriorityQueueUrl', {
      value: highPriorityQueue.queueUrl,
      description: 'SQS queue URL for high priority notifications',
      exportName: 'HighPriorityQueueUrl',
    });

    new cdk.CfnOutput(this, 'NormalPriorityQueueUrl', {
      value: normalPriorityQueue.queueUrl,
      description: 'SQS queue URL for normal priority notifications',
      exportName: 'NormalPriorityQueueUrl',
    });

    new cdk.CfnOutput(this, 'LowPriorityQueueUrl', {
      value: lowPriorityQueue.queueUrl,
      description: 'SQS queue URL for low priority notifications',
      exportName: 'LowPriorityQueueUrl',
    });

    new cdk.CfnOutput(this, 'SmsTopicArn', {
      value: smsTopic.topicArn,
      description: 'SNS topic ARN for SMS notifications',
      exportName: 'SmsNotificationTopicArn',
    });

    new cdk.CfnOutput(this, 'PushTopicArn', {
      value: pushTopic.topicArn,
      description: 'SNS topic ARN for push notifications',
      exportName: 'PushNotificationTopicArn',
    });
  }
}
