# Notification Service Infrastructure

This directory contains AWS CDK infrastructure code for the Notification Service, demonstrating **automation patterns** where infrastructure is generated from the `spec.md` file.

## Architecture Overview

The notification service infrastructure includes:

- **API Gateway + Lambda**: HTTP API for sending notifications and checking status
- **SQS Queues**: Three priority levels (high, normal, low) with dedicated DLQs
- **Lambda Processors**: Separate processors for each priority level with tailored concurrency
- **DynamoDB Tables**: 
  - `NotificationRecords`: Delivery history with TTL (90 days)
  - `CustomerPreferences`: Opt-out preferences
- **SNS Topics**: SMS and mobile push notification delivery
- **EventBridge Rules**: Event-driven triggers from upstream services
- **CloudWatch Alarms**: Monitoring for errors, latency, and queue depth

## Prerequisites

1. **AWS CLI** configured with credentials
2. **Node.js 18+** and npm installed
3. **AWS CDK CLI** installed globally:
   ```bash
   npm install -g aws-cdk
   ```

4. **SES Configuration** (for email notifications):
   - Verify sender email addresses in AWS SES
   - If in SES sandbox, also verify recipient emails for testing
   - See: https://docs.aws.amazon.com/ses/latest/dg/verify-email-addresses.html

5. **SNS Spending Limits** (for SMS notifications):
   - Configure SMS spending limit in AWS SNS console
   - Recommended: $10/month for dev, $1000/month for production
   - See: https://docs.aws.amazon.com/sns/latest/dg/sms_preferences.html

## Installation

```bash
cd examples/notification-service/infra
npm install
```

## Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

Or watch for changes:

```bash
npm run watch
```

## Deployment

### 1. Synthesize CloudFormation Template

Preview the CloudFormation template that will be generated:

```bash
npm run cdk synth
```

This outputs the template to `cdk.out/NotificationServiceStack.template.json`.

### 2. Bootstrap CDK (First Time Only)

If this is your first CDK deployment in this AWS account/region:

```bash
npx cdk bootstrap
```

### 3. Deploy Stack

Deploy the infrastructure to AWS:

```bash
npm run cdk deploy
```

This will:
- Create DynamoDB tables
- Create SQS queues and DLQs
- Create Lambda functions
- Create API Gateway
- Create SNS topics
- Configure IAM roles and policies
- Set up CloudWatch alarms

**Deployment time**: ~5-10 minutes

### 4. Note Stack Outputs

After deployment, CDK will output important values:

```
Outputs:
NotificationServiceStack.ApiUrl = https://abc123.execute-api.us-east-1.amazonaws.com/prod/
NotificationServiceStack.NotificationTableName = NotificationRecordsTable
NotificationServiceStack.HighPriorityQueueUrl = https://sqs.us-east-1.amazonaws.com/.../notification-high-priority
...
```

Save these values for application configuration.

## Testing the Deployment

### Smoke Test: Send a Test Notification

```bash
# Replace with your API URL from stack outputs
API_URL="https://abc123.execute-api.us-east-1.amazonaws.com/prod"

# Send test notification (email)
curl -X POST "${API_URL}/api/notifications/send" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test-customer-123",
    "channel": "email",
    "templateId": "welcome-email",
    "params": {
      "customerName": "Test User"
    },
    "priority": "normal"
  }'

# Expected response (202 Accepted):
# {
#   "notificationId": "uuid-here",
#   "status": "queued",
#   "estimatedDelivery": "2024-01-01T12:00:00Z",
#   "channel": "email"
# }
```

### Check Notification Status

```bash
# Replace with notificationId from previous response
NOTIFICATION_ID="uuid-from-previous-response"

curl "${API_URL}/api/notifications/${NOTIFICATION_ID}/status"

# Expected response (200 OK):
# {
#   "notificationId": "uuid",
#   "customerId": "test-customer-123",
#   "channel": "email",
#   "status": "sent",
#   "timestamps": { ... },
#   "attempts": 1
# }
```

## Monitoring

### CloudWatch Dashboards

View metrics in AWS CloudWatch console:
- Lambda invocations, errors, duration
- SQS queue depth and message age
- DynamoDB read/write capacity
- API Gateway requests and latency

### CloudWatch Alarms

The following alarms are automatically configured:

1. **ApiErrorAlarm**: Triggers when API error rate exceeds 10 errors in 5 minutes
2. **ApiLatencyAlarm**: Triggers when P99 latency exceeds 1 second
3. **HighPriorityDLQAlarm**: Triggers when high priority DLQ has >100 messages
4. **HighPriorityQueueBacklogAlarm**: Triggers when queue depth exceeds 1000
5. **HighPriorityProcessorErrorAlarm**: Triggers when processor error rate is high

### Logs

View Lambda logs in CloudWatch Logs:
- `/aws/lambda/NotificationServiceStack-ApiHandler-*`
- `/aws/lambda/NotificationServiceStack-HighPriorityProcessor-*`
- `/aws/lambda/NotificationServiceStack-NormalPriorityProcessor-*`
- `/aws/lambda/NotificationServiceStack-LowPriorityProcessor-*`
- `/aws/lambda/NotificationServiceStack-EventProcessor-*`

**Important**: Logs do NOT contain PII (email addresses, phone numbers) per spec constraint.

## Customization Points

### 1. Lambda Concurrency

Adjust reserved concurrent executions per priority level:

```typescript
// In notification-service-stack.ts
reservedConcurrentExecutions: 50,  // High priority (default)
reservedConcurrentExecutions: 20,  // Normal priority (default)
reservedConcurrentExecutions: 5,   // Low priority (default)
```

### 2. SQS Queue Configuration

Adjust visibility timeout and retention:

```typescript
// High priority queue
visibilityTimeout: cdk.Duration.seconds(30),  // How long message is invisible after processing
retentionPeriod: cdk.Duration.minutes(60),    // How long message stays in queue
```

### 3. DynamoDB TTL

Change auto-deletion period for notification records:

```typescript
timeToLiveAttribute: 'ttl',  // 90 days default (set in application code)
```

### 4. API Gateway Throttling

Adjust rate limits:

```typescript
throttlingBurstLimit: 5000,  // Burst capacity
throttlingRateLimit: 1000,   // Sustained rate per second
```

### 5. CloudWatch Alarms

Adjust alarm thresholds:

```typescript
threshold: 10,           // Number of errors
evaluationPeriods: 2,    // How many periods to evaluate
datapointsToAlarm: 2,    // How many datapoints must breach
```

## Cost Estimation

**Monthly cost breakdown** (assuming 1 million notifications/month):

- **API Gateway**: ~$3.50 (1M requests)
- **Lambda**: ~$10 (compute time)
- **SQS**: ~$0.40 (1M requests)
- **DynamoDB**: ~$1 (on-demand, assuming 1M writes + 500K reads)
- **SNS**: ~$0.50 (1M mobile push) + $75 (100K SMS, assuming $0.00075/SMS)
- **SES**: Free tier covers first 62,000 emails, then $0.10 per 1,000

**Total**: ~$90-100/month for 1 million notifications (mostly SMS costs)

**Cost optimization**:
- Use email instead of SMS where possible (100x cheaper)
- Implement batching for low-priority notifications
- Adjust Lambda memory size based on profiling
- Use DynamoDB reserved capacity for predictable workloads

## Cleanup

To delete all resources:

```bash
npm run cdk destroy
```

**Warning**: This will delete:
- Lambda functions
- API Gateway
- SQS queues (and any messages in them)
- SNS topics

**Retained resources** (manual cleanup required):
- DynamoDB tables (RemovalPolicy: RETAIN)
- CloudWatch logs (LogRetention: TEN_YEARS)

To fully clean up:
1. Run `cdk destroy`
2. Manually delete DynamoDB tables from AWS console
3. Manually delete CloudWatch log groups

## Automation Hooks Integration

This infrastructure demonstrates the following automation patterns:

### 1. Generated from Spec (`scaffold-service.yaml`)

The CDK code structure was generated from `spec.md` contracts:
- DynamoDB schemas → `dynamodb.Table` constructs
- API contracts → API Gateway routes
- Integration points → EventBridge rules, SNS topics

**Time saved**: ~4-6 hours of manual CDK coding

### 2. Auto-Updated Documentation (`update-docs.yaml`)

When this infrastructure changes, hooks automatically update:
- `docs/architecture.md` - Architecture diagrams
- `docs/api.md` - API documentation
- `docs/deployment.md` - Deployment guide

**Time saved**: ~2-3 hours of manual doc updates per change

### 3. Validated Against Spec (`validate-spec-constraints.yaml`)

Before deployment, hooks verify:
- ✓ All spec constraints are satisfied (IAM policies, TTL, retry logic)
- ✓ No wildcard IAM actions (except SES which requires it)
- ✓ All alarm thresholds match spec requirements

**Value**: Prevents drift between spec and implementation

## Troubleshooting

### Deployment Fails: "Stack already exists"

If a previous deployment failed:

```bash
# Delete the stack manually
aws cloudformation delete-stack --stack-name NotificationServiceStack

# Wait for deletion to complete
aws cloudformation wait stack-delete-complete --stack-name NotificationServiceStack

# Retry deployment
npm run cdk deploy
```

### SES Emails Not Sending

1. **Check SES verification status**:
   ```bash
   aws ses list-verified-email-addresses
   ```

2. **Check SES sandbox mode**:
   - In sandbox, you can only send to verified addresses
   - Request production access: https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html

3. **Check CloudWatch logs** for SES errors:
   ```bash
   aws logs tail /aws/lambda/NotificationServiceStack-HighPriorityProcessor-* --follow
   ```

### SNS SMS Not Sending

1. **Check SNS spending limit**:
   ```bash
   aws sns get-sms-attributes
   ```

2. **Increase spending limit** if needed:
   ```bash
   aws sns set-sms-attributes --attributes MonthlySpendLimit=100
   ```

3. **Check phone number format**: Must be E.164 format (+1234567890)

### High DLQ Depth

If messages are accumulating in DLQ:

1. **Check DLQ messages** for error patterns:
   ```bash
   aws sqs receive-message --queue-url <DLQ_URL> --max-number-of-messages 10
   ```

2. **Common causes**:
   - Invalid email address (permanent failure)
   - Invalid phone number (permanent failure)
   - Template not found
   - Customer opted out

3. **Fix underlying issue**, then replay messages:
   ```bash
   # Move messages from DLQ back to main queue
   aws sqs purge-queue --queue-url <DLQ_URL>
   ```

## References

- [Notification Service Spec](../spec.md)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS SES Documentation](https://docs.aws.amazon.com/ses/)
- [AWS SNS Documentation](https://docs.aws.amazon.com/sns/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [AWS SQS Documentation](https://docs.aws.amazon.com/sqs/)
