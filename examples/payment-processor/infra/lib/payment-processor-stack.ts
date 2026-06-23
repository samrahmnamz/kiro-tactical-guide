import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

export class PaymentProcessorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // KMS key for encryption at rest
    const encryptionKey = new kms.Key(this, 'EncryptionKey', {
      description: 'KMS key for encrypting sensitive payment data',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // DynamoDB table for payment records
    const paymentTable = new dynamodb.Table(this, 'PaymentRecords', {
      partitionKey: {
        name: 'paymentId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl',
    });

    // Global secondary index for querying by orderId
    paymentTable.addGlobalSecondaryIndex({
      indexName: 'OrderIdIndex',
      partitionKey: {
        name: 'orderId',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Secrets Manager secret for Stripe API key
    const stripeSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'StripeApiKey',
      'payment-processor/stripe-api-key'
    );

    // Lambda execution role with least-privilege permissions
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for payment processor Lambda',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant specific permissions (no wildcards - validated by validate-iam.yaml)
    paymentTable.grantReadWriteData(lambdaRole);
    encryptionKey.grantEncryptDecrypt(lambdaRole);
    stripeSecret.grantRead(lambdaRole);

    // Lambda function
    const paymentFunction = new lambda.Function(this, 'PaymentProcessor', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist')),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(10),
      memorySize: 512,
      environment: {
        TABLE_NAME: paymentTable.tableName,
        KMS_KEY_ID: encryptionKey.keyId,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
        NODE_ENV: 'production',
      },
      reservedConcurrentExecutions: 50,
      logRetention: logs.RetentionDays.TEN_YEARS,
    });

    // Provisioned concurrency for reduced cold starts
    const version = paymentFunction.currentVersion;
    const alias = new lambda.Alias(this, 'PaymentProcessorAlias', {
      aliasName: 'prod',
      version,
      provisionedConcurrentExecutions: 5,
    });

    // API Gateway REST API
    const api = new apigateway.RestApi(this, 'PaymentApi', {
      restApiName: 'Payment Processor API',
      description: 'API for processing payments with Stripe',
      deployOptions: {
        stageName: 'prod',
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false, // Don't log request/response bodies (may contain PII)
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Lambda integration
    const integration = new apigateway.LambdaIntegration(alias, {
      proxy: true,
      allowTestInvoke: false,
    });

    // API Gateway resources and methods
    api.root.addProxy({
      defaultIntegration: integration,
      anyMethod: true,
    });

    // CloudWatch alarms for monitoring
    const errorMetric = paymentFunction.metricErrors({
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });

    new cdk.aws_cloudwatch.Alarm(this, 'PaymentErrorAlarm', {
      metric: errorMetric,
      threshold: 10,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'Alert when payment processing error rate is high',
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const durationMetric = paymentFunction.metricDuration({
      period: cdk.Duration.minutes(5),
      statistic: 'p99',
    });

    new cdk.aws_cloudwatch.Alarm(this, 'PaymentLatencyAlarm', {
      metric: durationMetric,
      threshold: 3000, // 3 seconds
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'Alert when payment processing P99 latency exceeds 3 seconds',
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Stack outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Payment processor API endpoint',
      exportName: 'PaymentProcessorApiUrl',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: paymentTable.tableName,
      description: 'DynamoDB table name for payment records',
      exportName: 'PaymentRecordsTableName',
    });

    new cdk.CfnOutput(this, 'KmsKeyId', {
      value: encryptionKey.keyId,
      description: 'KMS key ID for encryption',
      exportName: 'PaymentEncryptionKeyId',
    });
  }
}
