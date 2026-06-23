# Notification Service Example

> **Demonstrates**: Automation Patterns - Spec-Driven Development, Infrastructure Generation, Client SDK Generation, Documentation Automation

This example shows how a single `spec.md` file can drive automatic generation of implementation scaffolding, tests, infrastructure as code, API documentation, and typed client libraries, reducing weeks of manual work to hours.

## What This Example Demonstrates

### Automation Patterns
- **Spec as Source of Truth**: All artifacts generated from `spec.md` contracts
- **Service Scaffolding**: TypeScript interfaces, API routes, and DynamoDB schemas auto-generated
- **Infrastructure from Spec**: CDK code generated from contract definitions
- **Client SDK Generation**: Typed TypeScript clients auto-updated when contracts change
- **Documentation Sync**: API docs stay in sync with implementation automatically

### Async Processing and Queue Integration Patterns
- **Priority-Based Queue Routing**: Notifications routed to appropriate SQS queues based on urgency (high/normal/low)
- **Decoupled Processing**: API accepts requests and queues them immediately (202 Accepted), processing happens asynchronously
- **Graceful Degradation**: Service continues accepting requests even if downstream channels (SES/SNS) are unavailable
- **Backpressure Handling**: Queue-based architecture naturally handles traffic spikes without overwhelming downstream systems
- **Retry with Exponential Backoff**: Failed notifications automatically retry with increasing delays before moving to DLQ
- **Dead Letter Queue Pattern**: Permanently failed notifications isolated for investigation without blocking healthy traffic

### Kiro Automation Toolkit Integration
- `scaffold-service.yaml`: Generate service boilerplate from spec
- `update-docs.yaml`: Auto-update API documentation when contracts change
- `regen-clients.yaml`: Regenerate client stubs on spec changes
- `test-on-save.yaml`: Immediate test execution for fast feedback
- `validate-spec-constraints.yaml`: Verify code satisfies spec constraints

### Multi-Channel Notification Capabilities
- **Email**: Via Amazon SES with template support
- **SMS**: Via Amazon SNS with opt-out keyword handling
- **Push**: Via SNS mobile push endpoints (iOS, Android)
- **Priority Queues**: High (30s SLA), Normal (5min SLA), Low (1hr SLA)
- **Retry Logic**: Exponential backoff with DLQ for permanent failures
- **Opt-out Enforcement**: Customer preference checking before send

## Architecture

```
┌─────────────────┐
│   Upstream      │
│   Services      │
│  (Account,      │
│   Payment)      │
└────────┬────────┘
         │
         │ EventBridge
         │ events
         ▼
┌────────────────────────────────────────────┐
│        Notification Service                │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │         API Gateway + Lambda          │ │
│  │  POST /api/notifications/send         │ │
│  │  GET /api/notifications/:id/status    │ │
│  └──────────────┬───────────────────────┘ │
│                 │                          │
│                 ▼                          │
│  ┌──────────────────────────────────────┐ │
│  │        DynamoDB Tables               │ │
│  │  - NotificationRecords (with TTL)    │ │
│  │  - CustomerPreferences (opt-outs)    │ │
│  └──────────────────────────────────────┘ │
│                 │                          │
│                 ▼                          │
│  ┌──────────────────────────────────────┐ │
│  │         SQS Queues (3 priority)      │ │
│  │  - High Priority    (30s SLA)        │ │
│  │  - Normal Priority  (5min SLA)       │ │
│  │  - Low Priority     (1hr SLA)        │ │
│  └─────┬────────┬────────┬──────────────┘ │
│        │        │        │                 │
│        ▼        ▼        ▼                 │
│  ┌──────────────────────────────────────┐ │
│  │    Lambda Processors (per priority)  │ │
│  │  - Check opt-out preferences         │ │
│  │  - Retry with exponential backoff    │ │
│  │  - Send via SES/SNS                  │ │
│  └─────┬────────────────────┬───────────┘ │
│        │                    │              │
│        ▼                    ▼              │
│  ┌──────────┐         ┌──────────┐        │
│  │ Amazon   │         │ Amazon   │        │
│  │ SES      │         │ SNS      │        │
│  │ (Email)  │         │ (SMS +   │        │
│  │          │         │  Push)   │        │
│  └──────────┘         └──────────┘        │
└────────────────────────────────────────────┘
```

## Prerequisites

1. **Node.js**: >= 18.0.0
2. **AWS Account**: With permissions for DynamoDB, SQS, Lambda, SES, SNS, EventBridge
3. **Amazon SES**: Verified sender email addresses
4. **Amazon SNS**: SMS spending limits configured
5. **AWS CDK CLI** (for infrastructure deployment):
   ```bash
   npm install -g aws-cdk
   ```

## Quick Start

### 1. Install Dependencies

```bash
cd examples/notification-service
npm install
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your values
# For development, use LocalStack or AWS test environment
```

Example `.env`:
```bash
# AWS Configuration
AWS_REGION=us-east-1

# DynamoDB Tables
NOTIFICATION_TABLE=NotificationRecords
PREFERENCES_TABLE=CustomerPreferences

# SQS Queue URLs
HIGH_PRIORITY_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/.../notification-high-priority
NORMAL_PRIORITY_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/.../notification-normal-priority
LOW_PRIORITY_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/.../notification-low-priority

# SES Configuration
SES_FROM_EMAIL=notifications@example.com
SES_REGION=us-east-1

# SNS Configuration
SNS_SMS_SENDER_ID=MyService

# Server Configuration
PORT=3000
NODE_ENV=development
```

### 3. Set Up AWS Resources (Development)

#### Option A: Deploy with CDK (Recommended)

```bash
cd infra
npm install
npm run cdk deploy
```

This creates all necessary infrastructure. See `infra/README.md` for details.

#### Option B: Manual Setup (for learning)

```bash
# Create DynamoDB tables
aws dynamodb create-table \
  --table-name NotificationRecords \
  --attribute-definitions \
    AttributeName=notificationId,AttributeType=S \
    AttributeName=customerId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema \
    AttributeName=notificationId,KeyType=HASH \
  --global-secondary-indexes \
    '[{
      "IndexName": "CustomerIdIndex",
      "KeySchema": [
        {"AttributeName": "customerId", "KeyType": "HASH"},
        {"AttributeName": "createdAt", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"},
      "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

aws dynamodb create-table \
  --table-name CustomerPreferences \
  --attribute-definitions \
    AttributeName=customerId,AttributeType=S \
  --key-schema \
    AttributeName=customerId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Create SQS queues
aws sqs create-queue --queue-name notification-high-priority
aws sqs create-queue --queue-name notification-normal-priority
aws sqs create-queue --queue-name notification-low-priority

# Verify SES sender email
aws ses verify-email-identity --email-address notifications@example.com
```

### 4. Run Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run with coverage
npm run test:coverage
```

### 5. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`.

## API Usage Examples

### Send an Email Notification

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "customer-123",
    "channel": "email",
    "templateId": "welcome-email",
    "params": {
      "customerName": "John Doe",
      "activationLink": "https://example.com/activate/abc123"
    },
    "priority": "normal"
  }'
```

**Success Response (202 Accepted)**:
```json
{
  "notificationId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "estimatedDelivery": "2024-01-15T10:35:00Z",
  "channel": "email"
}
```

### Send an SMS Notification (High Priority)

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "customer-456",
    "channel": "sms",
    "templateId": "password-reset-code",
    "params": {
      "code": "123456",
      "expiresIn": "10 minutes"
    },
    "priority": "high"
  }'
```

**Success Response (202 Accepted)**:
```json
{
  "notificationId": "660f9511-f3ac-52e5-b827-557766551111",
  "status": "queued",
  "estimatedDelivery": "2024-01-15T10:30:30Z",
  "channel": "sms"
}
```

### Send a Push Notification (Low Priority)

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "customer-789",
    "channel": "push",
    "templateId": "promotional-offer",
    "params": {
      "offerTitle": "20% Off Winter Sale",
      "expiresAt": "2024-02-01"
    },
    "priority": "low"
  }'
```

**Success Response (202 Accepted)**:
```json
{
  "notificationId": "770g0622-g4bd-63f6-c938-668877662222",
  "status": "queued",
  "estimatedDelivery": "2024-01-15T11:30:00Z",
  "channel": "push"
}
```

### Check Notification Status

```bash
curl http://localhost:3000/api/notifications/550e8400-e29b-41d4-a716-446655440000/status
```

**Success Response (200 OK)**:
```json
{
  "notificationId": "550e8400-e29b-41d4-a716-446655440000",
  "customerId": "customer-123",
  "channel": "email",
  "templateId": "welcome-email",
  "status": "sent",
  "timestamps": {
    "queued": "2024-01-15T10:30:00Z",
    "sent": "2024-01-15T10:30:05Z",
    "delivered": null,
    "failed": null
  },
  "attempts": 1,
  "errorMessage": null
}
```

## Testing Priority Queues

Priority determines SLA and estimated delivery time:

| Priority | SLA       | Use Cases                                      |
|----------|-----------|------------------------------------------------|
| `high`   | 30 seconds| Password resets, security alerts, OTP codes   |
| `normal` | 5 minutes | Order confirmations, account updates          |
| `low`    | 1 hour    | Marketing emails, promotional offers          |

## Idempotency

Duplicate requests with same `customerId` + `templateId` within 1 hour return the same `notificationId`:

```bash
# First request
curl -X POST http://localhost:3000/api/notifications/send \
  -d '{"customerId":"customer-123","channel":"email","templateId":"welcome-email"}'
# Returns: {"notificationId": "550e8400..."}

# Second request (within 1 hour)
curl -X POST http://localhost:3000/api/notifications/send \
  -d '{"customerId":"customer-123","channel":"email","templateId":"welcome-email"}'
# Returns: {"notificationId": "550e8400..."} (same ID, no duplicate sent)
```

## Opt-Out Management

Customers can opt out of specific channels. The service checks preferences before sending:

```bash
# Simulate opt-out by creating a preference record
aws dynamodb put-item \
  --table-name CustomerPreferences \
  --item '{
    "customerId": {"S": "customer-123"},
    "emailOptOut": {"BOOL": true},
    "smsOptOut": {"BOOL": false},
    "pushOptOut": {"BOOL": false},
    "updatedAt": {"S": "2024-01-15T10:00:00Z"}
  }'

# Attempt to send email to opted-out customer
curl -X POST http://localhost:3000/api/notifications/send \
  -d '{"customerId":"customer-123","channel":"email","templateId":"promo"}'

# Response indicates suppression
# {"notificationId": "...", "status": "suppressed", ...}
```

## Automation Hook Validation

### Test Spec-Driven Generation

1. **Modify a contract in `spec.md`**:
   ```typescript
   // Add a new field to SendNotificationRequest
   {
     "customerId": string,
     "channel": "email" | "sms" | "push",
     "templateId": string,
     "params": object,
     "priority": "high" | "normal" | "low",
     "scheduledAt": string  // NEW: ISO 8601 timestamp
   }
   ```

2. Save the spec file

3. The `scaffold-service.yaml` hook should:
   - Update `src/types.ts` with new `scheduledAt` field
   - Update API handler validation
   - Update client SDK types

### Test Documentation Auto-Update

1. **Change an endpoint response** in `spec.md`

2. Save the file

3. The `update-docs.yaml` hook should:
   - Regenerate `docs/api/notification.md`
   - Update OpenAPI spec in `docs/openapi/notification.yaml`

### Test Constraint Validation

1. **Add code that violates a spec constraint**:
   ```typescript
   // This violates "No PII in Logs" constraint
   logger.info('Sending notification', {
     customerEmail: 'john@example.com'  // ✗ PII exposed
   });
   ```

2. Run tests: `npm test`

3. The `validate-spec-constraints.yaml` hook should:
   - Detect PII in log statement
   - Fail the validation
   - Suggest using `maskEmail()` from logger

## Project Structure

```
notification-service/
├── src/
│   ├── index.ts              # Express API server
│   ├── types.ts              # TypeScript interfaces (auto-generated)
│   ├── notification-service.ts  # Business logic (retry, opt-out)
│   ├── database.ts           # DynamoDB operations
│   ├── queue.ts              # SQS operations
│   ├── logger.ts             # PII-scrubbing logger
├── tests/
│   ├── unit/                 # Unit tests
│   │   ├── logger.test.ts
│   │   └── notification-service.test.ts
│   └── integration/          # Integration tests
│       └── api.test.ts       # End-to-end API tests
├── infra/                    # CDK infrastructure code
│   ├── lib/
│   │   └── notification-service-stack.ts
│   ├── bin/
│   │   └── app.ts
│   ├── package.json
│   └── README.md
├── docs/                     # Auto-generated documentation
├── spec.md                   # Single source of truth
├── package.json
├── tsconfig.json
├── jest.config.js
├── .env.example
└── README.md
```

## What's Demonstrated

### ✓ Automation Benefits

1. **Time Savings**: Spec → working service in hours, not weeks
   - Manual approach: 2-3 weeks (boilerplate, docs, clients, infra)
   - Automated approach: 3-5 days (focus on business logic only)
   - **70-80% time reduction**

2. **Consistency**: All artifacts follow org-wide standards
   - Type definitions match exactly across service, client, and docs
   - Infrastructure follows naming conventions and tagging standards
   - Error handling patterns consistent across all endpoints

3. **Reduced Drift**: Docs and code stay in sync automatically
   - No more "docs say one thing, code does another"
   - Client SDKs update automatically when contracts change
   - Infrastructure reflects current service requirements

4. **Faster Iterations**: Change spec → regenerate everything
   - Add new endpoint: update spec → boilerplate generated
   - Change response format: update spec → types + docs + clients updated
   - Add infrastructure: update spec → CDK code generated

### ✗ Manual Work Eliminated

1. **Boilerplate Coding**: No more hand-writing TypeScript interfaces
2. **Documentation**: No more manually updating API docs
3. **Client SDKs**: No more hand-rolling HTTP clients
4. **Infrastructure**: No more manually writing CDK constructs
5. **Test Scaffolding**: No more copy-pasting test templates

## Key Files for Learning

1. **spec.md**: Shows how to write automation-friendly specs
2. **src/types.ts**: Auto-generated TypeScript interfaces
3. **infra/lib/notification-service-stack.ts**: Infrastructure generated from spec
4. **src/notification-service.ts**: Manual business logic (retry, opt-out)
5. **tests/integration/api.test.ts**: Generated test scaffolding + manual assertions

## Deployment to AWS (Production)

```bash
cd infra
npm install

# Synthesize CloudFormation template (preview changes)
npm run cdk synth

# Deploy infrastructure
npm run cdk deploy

# Note the API URL from outputs
# Outputs:
# NotificationServiceStack.ApiUrl = https://abc123.execute-api.us-east-1.amazonaws.com/prod/
```

See `infra/README.md` for detailed deployment instructions.

## Monitoring

### CloudWatch Metrics

- **API Latency**: P50, P99, P999
- **Error Rates**: 4xx, 5xx
- **Queue Depth**: Messages waiting per priority
- **DLQ Depth**: Permanently failed notifications
- **Lambda Invocations**: Per priority processor

### CloudWatch Alarms

Pre-configured alarms trigger on:
- High error rate (>10 errors in 5 minutes)
- High latency (P99 >1 second)
- DLQ accumulation (>100 messages)
- Queue backlog (>1000 messages in high priority)

### Logs

View Lambda logs (PII-scrubbed):
```bash
aws logs tail /aws/lambda/NotificationServiceStack-ApiHandler-* --follow
aws logs tail /aws/lambda/NotificationServiceStack-HighPriorityProcessor-* --follow
```

## Troubleshooting

### "SES Email Not Sending"

1. **Check SES verification**:
   ```bash
   aws ses list-verified-email-addresses
   ```

2. **Check SES sandbox mode**:
   - In sandbox, you can only send to verified addresses
   - Request production access: https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html

3. **Check CloudWatch logs** for SES errors

### "SNS SMS Not Sending"

1. **Check SNS spending limit**:
   ```bash
   aws sns get-sms-attributes
   ```

2. **Increase spending limit** if needed:
   ```bash
   aws sns set-sms-attributes --attributes MonthlySpendLimit=100
   ```

3. **Verify phone number format**: Must be E.164 (+1234567890)

### "High DLQ Depth"

Messages in DLQ indicate permanent failures:

1. **Inspect DLQ messages**:
   ```bash
   aws sqs receive-message --queue-url <DLQ_URL> --max-number-of-messages 10
   ```

2. **Common causes**:
   - Invalid email/phone number (permanent)
   - Customer opted out (expected behavior)
   - Template not found

3. **Fix underlying issue**, then replay or purge DLQ

### "Tests Failing"

Ensure mocks are properly configured:
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Run tests with verbose output
npm test -- --verbose
```

## Cost Estimation

**Monthly cost** (1 million notifications/month):

- **API Gateway**: ~$3.50 (1M requests)
- **Lambda**: ~$10 (compute time)
- **SQS**: ~$0.40 (1M requests)
- **DynamoDB**: ~$1 (on-demand, 1M writes + 500K reads)
- **SNS Mobile Push**: ~$0.50 (1M push)
- **SNS SMS**: ~$75 (100K SMS @ $0.00075/SMS)
- **SES Email**: Free tier covers 62K emails, then $0.10 per 1K

**Total**: ~$90-100/month (mostly SMS costs)

**Cost optimization**:
- Prefer email over SMS (100x cheaper)
- Batch low-priority notifications
- Use DynamoDB reserved capacity for predictable workloads

## Related Documentation

- [Notification Service Spec](./spec.md) - Source of truth for all generation
- [Infrastructure README](./infra/README.md) - CDK deployment guide
- [AWS SES Documentation](https://docs.aws.amazon.com/ses/)
- [AWS SNS Documentation](https://docs.aws.amazon.com/sns/)
- [AWS SQS Documentation](https://docs.aws.amazon.com/sqs/)
- [Kiro Automation Toolkit](../../toolkit/hooks/automation/)

## Support

- **Questions**: #kiro-toolbox Slack channel
- **Automation Issues**: #kiro-automation Slack channel
- **Service Issues**: #notifications-team Slack channel

