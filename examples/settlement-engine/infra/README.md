# Settlement Engine Infrastructure

AWS CDK infrastructure for the Settlement Engine - a financial settlement processing service with comprehensive regulatory compliance.

## Overview

This infrastructure demonstrates how to build production-grade financial services infrastructure that satisfies:
- **SOX Section 404**: Segregation of duties, audit trails, internal controls
- **FDIC**: Data residency requirements (us-east-1 only)
- **OCC/Federal Reserve**: 10-year audit retention with WORM compliance
- **SEC**: Change authorization and deployment window restrictions

## Architecture

### Core Components

#### DynamoDB Tables
- **SettlementBatches**: Stores settlement batch records with 10-year TTL
  - Partition key: `settlementBatchId` (UUID)
  - Sort key: `settlementPeriod` (ISO date)
  - GSI: Query by settlement period
  - Point-in-time recovery enabled
  
- **TransactionLedger**: Stores individual transaction records
  - Partition key: `transactionId` (UUID)
  - GSI: Query by settlement batch ID
  - 10-year retention with automatic deletion

#### S3 Audit Logs
- **Bucket**: `settlement-audit-logs-{account-id}`
- **WORM Compliance**: Object Lock enabled for immutable audit trails
- **Lifecycle**: 
  - Move to Glacier after 90 days
  - Delete after 10 years (3,650 days)
- **Encryption**: AES-256 server-side encryption

#### Lambda Functions
Five segregated functions implementing separation of duties:

1. **InitiateSettlement**: Creates new settlement batches (initiator role)
2. **CalculateNetPositions**: Calculates net positions (calculation role)
3. **ApproveSettlement**: Approves calculated settlements (approver role)
4. **ExecuteSettlement**: Executes approved settlements (executor role)
5. **RollbackSettlement**: Emergency rollback (rollback role)
6. **AuditLogWriter**: Async writes to S3 (audit role)

#### Step Functions Workflow
**SettlementWorkflow** orchestrates the settlement process:
```
START
  ↓
Calculate Net Positions
  ↓
Wait for Approval ← Human approval step
  ↓
Execute Payments ← Fan-out to counterparties
  ↓
END
```

#### IAM Roles (Segregation of Duties)
- **Initiator Role**: Can create pending settlements only
- **Approver Role**: Can approve calculated settlements only
- **Executor Role**: Can execute approved settlements only
- **Rollback Role**: Emergency use only
- **Audit Writer Role**: Writes audit logs to S3

Each role has **least privilege permissions** with specific resource ARNs (no wildcards).

#### API Gateway
REST API with endpoints:
- `POST /api/settlements/initiate` - Create settlement batch
- `GET /api/settlements/{id}` - Get settlement status
- `POST /api/settlements/{id}/approve` - Approve settlement
- `POST /api/settlements/{id}/execute` - Execute settlement
- `POST /api/settlements/{id}/rollback` - Rollback settlement

#### CloudWatch Alarms
Monitoring for:
- Settlement failure rate > 1%
- Audit log write failures (DLQ depth)
- Step Functions execution errors
- API Gateway 5xx errors

## Regulatory Compliance

### SOX Section 404
**Requirement**: Internal controls over financial reporting

**Implementation**:
- Segregation of duties enforced via IAM roles
- Audit trail for all state transitions
- No single role can initiate, approve, and execute

**Validation**: IAM policies validated by `validate-iam.yaml` hook

### FDIC Data Residency
**Requirement**: All financial data must remain in us-east-1

**Implementation**:
- Stack enforces us-east-1 deployment region
- No cross-region replication configured
- DynamoDB and S3 created in us-east-1 only

**Validation**: Stack throws error if deployed to other regions

### OCC/Fed 10-Year Retention
**Requirement**: Audit logs retained for 10 years

**Implementation**:
- DynamoDB TTL set to 10 years (3,650 days)
- S3 lifecycle policy deletes after 10 years
- CloudWatch logs retained for 10 years

**Validation**: Lifecycle policies reviewed in compliance audits

### SEC Change Authorization
**Requirement**: All production changes require CAB approval

**Implementation**:
- `require-approvals.yaml` hook validates approval tickets
- Commit messages must include: `[CHG1234567]`
- Deployment blocked without valid ticket

**Validation**: Pre-deployment hook checks commit messages

### Federal Reserve Deployment Windows
**Requirement**: No deployments during market hours (9:30 AM - 4:00 PM ET)

**Implementation**:
- `deployment-window.yaml` hook enforces time restrictions
- Deployments queued for next allowed window
- Emergency override requires VP approval + MFA

**Validation**: Pre-deployment hook checks current time

## Prerequisites

- **Node.js**: 18.x or later
- **AWS CDK**: 2.147.0 or later
- **AWS CLI**: Configured with credentials
- **AWS Account**: With us-east-1 enabled
- **IAM Permissions**: Administrator access (for first deployment)

## Installation

1. Install dependencies:
```bash
cd examples/settlement-engine/infra
npm install
```

2. Bootstrap CDK (first time only):
```bash
npx cdk bootstrap aws://{account-id}/us-east-1
```

3. Build TypeScript:
```bash
npm run build
```

## Deployment

### Step 1: Synthesize CloudFormation
```bash
npm run synth
```

This generates CloudFormation templates in `cdk.out/`.

**IMPORTANT**: Review the synthesized template for:
- No wildcard IAM permissions (`Resource: "*"`)
- All resources in us-east-1
- S3 Object Lock enabled

### Step 2: Deploy to AWS
```bash
npm run deploy
```

**Deployment Windows**: This deployment will be **blocked** during market hours (9:30 AM - 4:00 PM ET, Monday-Friday) by the `deployment-window.yaml` hook.

**Allowed Windows**:
- Weekdays: 6:00 PM ET - 8:00 AM ET
- Weekends: All day Saturday and Sunday
- Blackout: Last business day of month (month-end close)

### Step 3: Verify Deployment
```bash
# Check DynamoDB tables
aws dynamodb list-tables --region us-east-1 | grep Settlement

# Check S3 bucket
aws s3 ls | grep settlement-audit-logs

# Check Step Functions
aws stepfunctions list-state-machines --region us-east-1 | grep SettlementWorkflow

# Check API Gateway
aws apigateway get-rest-apis --region us-east-1 | grep Settlement
```

## Configuration

### Customization Points

#### 1. DynamoDB Capacity
Default: On-demand (auto-scaling)

For predictable workloads, change to provisioned:
```typescript
billingMode: dynamodb.BillingMode.PROVISIONED,
readCapacity: 100,
writeCapacity: 50,
```

#### 2. Lambda Concurrency
Default:
- Initiate: 20
- Calculate: 10
- Approve: 10
- Execute: 5
- Rollback: 2

Adjust based on throughput requirements:
```typescript
reservedConcurrentExecutions: 50, // Increase for higher throughput
```

#### 3. Audit Log Retention
Default: Move to Glacier after 90 days, delete after 10 years

Adjust lifecycle rules:
```typescript
transitions: [
  {
    storageClass: s3.StorageClass.GLACIER,
    transitionAfter: cdk.Duration.days(180), // Change to 180 days
  },
],
```

#### 4. API Rate Limits
Default:
- Burst: 1,000 requests/second
- Sustained: 500 requests/second

Adjust throttling:
```typescript
throttlingBurstLimit: 5000,
throttlingRateLimit: 2000,
```

## Testing

### Validate IAM Policies
```bash
# Run validate-iam.yaml hook
cd ../../../
npm run validate-iam
```

This checks for:
- Wildcard actions (`Action: "*"`)
- Wildcard resources (`Resource: "*"`)
- Overly permissive policies

### Test Deployment Window
```bash
# Attempt deployment during market hours (should be blocked)
npm run deploy
# Expected: "Deployment queued for 6:00 PM ET (next allowed window)"
```

### Test Approval Requirement
```bash
# Create commit without approval ticket
git commit -m "feat: Add new API endpoint"
git push
# Expected: "CAB approval ticket required. Format: [CHG1234567]"

# Create commit with approval ticket
git commit -m "feat: Add new API endpoint [CHG0001234]"
git push
# Expected: Deployment proceeds
```

## Monitoring

### CloudWatch Dashboard
Create a dashboard to monitor key metrics:
```bash
aws cloudwatch put-dashboard --region us-east-1 \
  --dashboard-name SettlementEngine \
  --dashboard-body file://dashboard.json
```

### Key Metrics
- `SettlementFailureRate`: Percentage of failed settlements
- `AuditLogDLQDepth`: Number of failed audit log writes
- `WorkflowExecutionErrors`: Step Functions execution failures
- `ApiServerErrors`: API Gateway 5xx error count

### Alarms
All alarms send notifications to SNS topics. Configure SNS subscriptions:
```bash
# Subscribe to settlement failure alarms
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:{account}:settlement-alarms \
  --protocol email \
  --notification-endpoint ops-team@example.com
```

## Disaster Recovery

### Backup Strategy
- **DynamoDB**: Point-in-time recovery enabled (35-day retention)
- **S3**: Versioning enabled with Object Lock
- **Lambda**: Code stored in S3 by CDK

### Recovery Procedure

#### Scenario 1: DynamoDB Table Corruption
```bash
# Restore to specific timestamp
aws dynamodb restore-table-to-point-in-time \
  --source-table-name SettlementBatches \
  --target-table-name SettlementBatches-Restored \
  --restore-date-time 2024-01-15T10:00:00Z \
  --region us-east-1
```

#### Scenario 2: S3 Audit Log Deletion
Object Lock (WORM) prevents deletion. Recovery not needed.

#### Scenario 3: Lambda Function Issue
```bash
# Revert to previous version
aws lambda update-alias \
  --function-name InitiateSettlement \
  --name PROD \
  --function-version 42 \
  --region us-east-1
```

## Rollback Plan

If deployment causes issues, rollback using:

### Phase 1: Immediate Actions (0-5 minutes)
1. Freeze new settlements:
```bash
aws lambda update-function-configuration \
  --function-name InitiateSettlement \
  --environment Variables="{ACCEPT_NEW_SETTLEMENTS=false}" \
  --region us-east-1
```

2. Revert Lambda functions to previous version (see Disaster Recovery)

### Phase 2: Stack Rollback (5-15 minutes)
```bash
# Rollback entire stack
aws cloudformation rollback-stack \
  --stack-name SettlementEngineStack \
  --region us-east-1
```

### Phase 3: Validation (15-30 minutes)
1. Verify DynamoDB tables restored
2. Check S3 audit logs intact
3. Test API endpoints
4. Monitor CloudWatch metrics

## Security Considerations

### IAM Best Practices
- ✅ No wildcard permissions (`*`)
- ✅ Specific resource ARNs only
- ✅ Least privilege principle
- ✅ Segregation of duties enforced

### Encryption
- ✅ DynamoDB: AWS-managed encryption
- ✅ S3: AES-256 server-side encryption
- ✅ API Gateway: TLS 1.2+ enforced
- ✅ Lambda environment variables: Encrypted

### Network Security
- ✅ API Gateway: CORS configured
- ✅ S3: Block all public access
- ✅ DynamoDB: VPC endpoints (optional)

## Cost Estimation

Monthly costs for moderate usage (1,000 settlements/day):

| Service | Usage | Cost |
|---------|-------|------|
| DynamoDB (on-demand) | 30M read units, 10M write units | ~$37.50 |
| S3 (audit logs) | 10 GB stored, 1M PUT requests | ~$0.33 |
| Lambda | 100M invocations, 512MB, 1s avg | ~$20.84 |
| API Gateway | 100M requests | ~$350 |
| Step Functions | 30K transitions | ~$0.75 |
| CloudWatch Logs | 50 GB ingested | ~$25 |
| **Total** | | **~$434/month** |

**Cost Optimization Tips**:
1. Switch DynamoDB to provisioned capacity for predictable workloads
2. Reduce CloudWatch log retention for non-compliance logs
3. Use S3 Intelligent-Tiering for audit logs

## Compliance Checklist

Before production deployment:

- [ ] IAM policies reviewed (no wildcards)
- [ ] Deployment region is us-east-1
- [ ] Object Lock enabled on S3 bucket
- [ ] 10-year retention configured
- [ ] CloudWatch alarms configured
- [ ] SNS notifications subscribed
- [ ] Disaster recovery tested
- [ ] Rollback procedure documented
- [ ] CAB approval obtained
- [ ] Deployment window verified
- [ ] Security scan passed
- [ ] Penetration testing completed

## Troubleshooting

### Issue: Deployment blocked during market hours
**Symptom**: `deployment-window.yaml` hook blocks deployment

**Solution**: Wait for next allowed window (6:00 PM ET weekdays) or obtain VP approval for emergency override

### Issue: IAM policy validation fails
**Symptom**: `validate-iam.yaml` hook reports wildcard permissions

**Solution**: Replace wildcards with specific resource ARNs:
```typescript
// ✗ WRONG
resources: ['*']

// ✓ CORRECT
resources: [settlementTable.tableArn]
```

### Issue: Audit log writes failing
**Symptom**: `AuditLogDLQAlarm` triggered

**Solution**:
1. Check DLQ messages:
```bash
aws sqs receive-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/{account}/settlement-audit-log-dlq \
  --region us-east-1
```

2. Investigate error messages
3. Fix Lambda function or S3 permissions
4. Redrive messages from DLQ

### Issue: Step Functions execution timeout
**Symptom**: Workflow execution exceeds timeout

**Solution**: Increase Lambda function timeout:
```typescript
timeout: cdk.Duration.minutes(10), // Increase from 5 to 10 minutes
```

## Support

For questions or issues:
- Email: cloud-eng-devops@example.com
- Slack: #settlement-engine-support
- Docs: https://wiki.example.com/settlement-engine

## License

Internal use only. All rights reserved.
