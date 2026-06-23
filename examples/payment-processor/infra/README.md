# Payment Processor Infrastructure

AWS CDK infrastructure for the payment processor service, demonstrating security best practices for PCI DSS compliance, encryption, and least privilege IAM policies.

## Architecture

This infrastructure creates:

- **Lambda Function**: Serverless payment processing with Stripe integration
- **DynamoDB Table**: Payment records storage with 7-year TTL (PCI requirement)
- **KMS Key**: Customer-managed key for encrypting sensitive data (cardLastFour, customerEmail)
- **Secrets Manager**: Secure storage for Stripe API key
- **API Gateway**: REST API endpoint with throttling and CORS
- **IAM Roles**: Least privilege policies (no wildcards, specific ARNs only)
- **CloudWatch Alarms**: Monitoring for failure rate, errors, and latency

## Security Features

### 1. Encryption at Rest
- **Application-layer encryption** using AWS KMS for sensitive fields
- **DynamoDB managed encryption** for table-level protection
- **Automatic key rotation** enabled on KMS key

### 2. Secrets Management
- Stripe API key stored in AWS Secrets Manager (not environment variables)
- IAM policy grants Lambda access to specific secret ARN only
- Secret versioning enabled for rotation support

### 3. IAM Least Privilege
All IAM policies follow the principle of least privilege:

```typescript
// ✓ CORRECT: Specific resource ARNs (passes validate-iam.yaml hook)
lambdaRole.addToPolicy(new iam.PolicyStatement({
  actions: ['secretsmanager:GetSecretValue'],
  resources: ['arn:aws:secretsmanager:us-east-1:123456789012:secret:payment-processor/*']
}));

// ✗ WRONG: Wildcard permissions (blocked by validate-iam.yaml hook)
// lambdaRole.addToPolicy(new iam.PolicyStatement({
//   actions: ['secretsmanager:*'],
//   resources: ['*']
// }));
```

### 4. Audit Logging
- CloudWatch Logs retention: **10 years** (PCI DSS requirement)
- API Gateway access logging enabled
- DynamoDB point-in-time recovery enabled for disaster recovery

### 5. Data Retention
- DynamoDB TTL configured to auto-delete records after **7 years** (PCI requirement)
- Removal policies set to `RETAIN` to prevent accidental deletion

## Prerequisites

1. **AWS Account**: With permissions to create Lambda, DynamoDB, KMS, Secrets Manager, API Gateway, IAM resources
2. **AWS CLI**: Configured with credentials (`aws configure`)
3. **Node.js**: Version 18+ (`node --version`)
4. **AWS CDK**: Installed globally (`npm install -g aws-cdk`)
5. **Stripe Account**: For payment processing (test mode sufficient)

## Installation

```bash
cd infra
npm install
```

## Configuration

### 1. Bootstrap CDK (First-time setup)
If you haven't used CDK in your AWS account before:

```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
```

### 2. Set Environment Variables (Optional)
```bash
export CDK_DEFAULT_ACCOUNT=123456789012
export CDK_DEFAULT_REGION=us-east-1
```

Or uncomment and modify the `env` section in `bin/payment-processor.ts`.

### 3. Create Stripe API Key Secret
**IMPORTANT**: The CDK creates a placeholder secret. You must populate it with your actual Stripe API key:

```bash
# For test environment (Stripe test mode)
aws secretsmanager update-secret \
  --secret-id payment-processor/stripe-api-key \
  --secret-string "sk_test_YOUR_STRIPE_TEST_KEY" \
  --region us-east-1

# For production (Stripe live mode)
aws secretsmanager update-secret \
  --secret-id payment-processor/stripe-api-key \
  --secret-string "sk_live_YOUR_STRIPE_LIVE_KEY" \
  --region us-east-1
```

**Security Note**: Never commit Stripe API keys to source control. The `scan-secrets.yaml` hook will block any file containing `sk_live_` or `sk_test_` patterns.

## Deployment

### 1. Synthesize CloudFormation Template (Dry Run)
Preview the CloudFormation template without deploying:

```bash
npm run cdk:synth
```

This runs the `validate-iam.yaml` hook, which checks for:
- Wildcard IAM actions (`Action: "*"`)
- Wildcard IAM resources (`Resource: "*"`)
- Missing IAM condition blocks

### 2. Show Changes (Before Deployment)
See what changes will be made to your AWS account:

```bash
npm run cdk:diff
```

### 3. Deploy to AWS
Deploy the stack:

```bash
npm run cdk:deploy
```

**Expected output**:
```
✅  PaymentProcessorStack

Outputs:
PaymentProcessorStack.ApiEndpoint = https://abcdef1234.execute-api.us-east-1.amazonaws.com/prod/
PaymentProcessorStack.PaymentTableName = PaymentRecords
PaymentProcessorStack.EncryptionKeyId = 12345678-1234-1234-1234-123456789012
PaymentProcessorStack.StripeApiKeySecretArn = arn:aws:secretsmanager:us-east-1:123456789012:secret:payment-processor/stripe-api-key-AbCdEf
PaymentProcessorStack.LambdaFunctionArn = arn:aws:lambda:us-east-1:123456789012:function:payment-processor
```

### 4. Verify Deployment
Test the API endpoint:

```bash
API_URL=$(aws cloudformation describe-stacks \
  --stack-name PaymentProcessorStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

echo "API Endpoint: $API_URL"
```

## Testing

### 1. Test Secret Access
Verify Lambda can retrieve Stripe API key:

```bash
aws lambda invoke \
  --function-name payment-processor \
  --payload '{"test": "secret-access"}' \
  /tmp/response.json

cat /tmp/response.json
```

### 2. Test Payment Processing (Stripe Test Mode)
Use Stripe test card `4242 4242 4242 4242`:

```bash
curl -X POST https://YOUR-API-ENDPOINT/api/payments \
  -H "Content-Type: application/json" \
  -d '{
    "stripeToken": "tok_visa",
    "amount": 1999,
    "currency": "usd",
    "orderId": "order-test-001",
    "metadata": {
      "customerEmail": "test@example.com",
      "orderDescription": "Test payment"
    }
  }'
```

**Expected response (200 OK)**:
```json
{
  "paymentId": "pay-12345678-1234-1234-1234-123456789012",
  "stripeChargeId": "ch_1234567890abcdef",
  "status": "succeeded",
  "amount": 1999,
  "currency": "usd",
  "receiptUrl": "https://pay.stripe.com/receipts/...",
  "createdAt": "2024-01-15T12:00:00.000Z"
}
```

### 3. Test IAM Validation Hook
Try deploying with a wildcard IAM policy to verify the hook blocks it:

```typescript
// Add this to lib/payment-processor-stack.ts (temporarily):
lambdaRole.addToPolicy(new iam.PolicyStatement({
  actions: ['*'],  // This should be flagged
  resources: ['*']
}));
```

Run synthesis:
```bash
npm run cdk:synth
```

**Expected output**: `validate-iam.yaml` hook should flag the wildcard policy violation.

## Monitoring

### CloudWatch Alarms

The stack creates three alarms:

1. **Payment Failure Rate > 5%** (`payment-processor-failure-rate`)
   - Triggers if payment failures exceed 5% within 15 minutes
   - Evaluation: 3 periods of 5 minutes each

2. **Lambda Invocation Errors > 2%** (`payment-processor-lambda-errors`)
   - Triggers if Lambda errors exceed 2% within 15 minutes
   - Evaluation: 3 periods of 5 minutes each

3. **P99 Latency > 3 seconds** (`payment-processor-latency-p99`)
   - Triggers if 99th percentile latency exceeds 3 seconds
   - Evaluation: 2 periods of 5 minutes each

### View Alarms
```bash
aws cloudwatch describe-alarms \
  --alarm-names payment-processor-failure-rate \
               payment-processor-lambda-errors \
               payment-processor-latency-p99
```

### View Logs
```bash
aws logs tail /aws/lambda/payment-processor --follow
```

## Cost Estimation

**Monthly cost for 10,000 payments/month** (approximate):

| Service | Usage | Cost |
|---------|-------|------|
| Lambda | 10,000 invocations @ 512MB, 500ms avg | $0.20 |
| DynamoDB | 10,000 writes, 5,000 reads (on-demand) | $1.50 |
| KMS | 15,000 requests (encrypt/decrypt) | $0.45 |
| Secrets Manager | 1 secret, 15,000 retrievals | $0.40 |
| API Gateway | 10,000 requests | $0.04 |
| CloudWatch Logs | 1GB ingestion, 10-year retention | $0.50 |
| **Total** | | **~$3.09/month** |

**Scaling**: At 100,000 payments/month, cost increases to ~$25/month (excluding Stripe fees).

**Stripe Fees**: 2.9% + $0.30 per transaction (e.g., $19.99 payment = $0.88 Stripe fee).

## Rollback

### Automatic Rollback (CloudFormation)
If deployment fails, CloudFormation automatically rolls back to the previous version.

### Manual Rollback
If you need to revert to a previous version after successful deployment:

1. **Lambda**: Update to previous version
```bash
aws lambda update-function-configuration \
  --function-name payment-processor \
  --environment Variables="{LAMBDA_VERSION=previous}"
```

2. **DynamoDB**: Restore from point-in-time recovery (if needed)
```bash
aws dynamodb restore-table-to-point-in-time \
  --source-table-name PaymentRecords \
  --target-table-name PaymentRecords-restored \
  --restore-date-time 2024-01-15T12:00:00Z
```

## Cleanup

**WARNING**: This will delete all resources, including payment records. Ensure you have backups before proceeding.

```bash
npm run cdk:destroy
```

**Manual cleanup** (if CDK destroy fails):
1. Delete CloudFormation stack: `aws cloudformation delete-stack --stack-name PaymentProcessorStack`
2. Delete retained resources manually (KMS keys, DynamoDB table, Secrets Manager secret)

## Customization Guide

### Change AWS Region
Modify `bin/payment-processor.ts`:
```typescript
env: {
  region: 'eu-west-1', // Change to your region
}
```

### Increase Lambda Memory
Modify `lib/payment-processor-stack.ts`:
```typescript
memorySize: 1024, // MB (was 512)
```

### Change DynamoDB Billing Mode
For predictable traffic, switch to provisioned capacity:
```typescript
billingMode: dynamodb.BillingMode.PROVISIONED,
readCapacity: 5,
writeCapacity: 5,
```

### Add CORS Origins Restriction
Modify `lib/payment-processor-stack.ts`:
```typescript
defaultCorsPreflightOptions: {
  allowOrigins: ['https://yourdomain.com'], // Restrict to your domain
  allowMethods: ['POST', 'GET'],
  allowHeaders: ['Content-Type', 'Authorization'],
}
```

### Enable API Key Authentication
Modify `lib/payment-processor-stack.ts`:
```typescript
const apiKey = api.addApiKey('PaymentApiKey');
const usagePlan = api.addUsagePlan('PaymentUsagePlan', {
  apiStages: [{ stage: api.deploymentStage }],
  throttle: { rateLimit: 100, burstLimit: 500 },
});
usagePlan.addApiKey(apiKey);

// Then in method definition:
paymentsResource.addMethod('POST', lambdaIntegration, {
  apiKeyRequired: true, // Enable API key requirement
  // ...
});
```

## Security Checklist

Before deploying to production:

- [ ] Replace Stripe test key with live key in Secrets Manager
- [ ] Restrict CORS origins to your domain (not `Cors.ALL_ORIGINS`)
- [ ] Enable API key authentication or add AWS WAF rules
- [ ] Configure CloudWatch alarm notifications (SNS topics)
- [ ] Review IAM policies for least privilege (run `cdk synth` to validate)
- [ ] Enable CloudTrail for API call auditing
- [ ] Configure VPC endpoints for Lambda (if private VPC required)
- [ ] Set up AWS Backup for DynamoDB table
- [ ] Document incident response procedures (rollback, postmortem)
- [ ] Test rollback procedure in staging environment

## Troubleshooting

### Issue: `cdk synth` fails with "Resource not found"`
**Solution**: Ensure you're in the `infra/` directory and `npm install` completed successfully.

### Issue: Lambda returns 500 error
**Solution**: Check CloudWatch Logs for the Lambda function:
```bash
aws logs tail /aws/lambda/payment-processor --follow
```

### Issue: Stripe API key not found
**Solution**: Verify the secret was populated:
```bash
aws secretsmanager get-secret-value \
  --secret-id payment-processor/stripe-api-key \
  --query SecretString \
  --output text
```

### Issue: DynamoDB throttling (ProvisionedThroughputExceededException)
**Solution**: On-demand mode should auto-scale. If using provisioned mode, increase read/write capacity.

### Issue: KMS throttling (ThrottlingException)
**Solution**: Enable data key caching in Lambda code to reduce KMS API calls by 90%.

## Related Documentation

- [Parent README](../README.md) - Example overview and usage
- [Specification](../spec.md) - Detailed requirements and design decisions
- [Security Hooks](../../../toolkit/hooks/security/) - Secret scanning and IAM validation
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Stripe API Documentation](https://stripe.com/docs/api)

## Support

- Questions: #kiro-toolbox Slack channel
- Security issues: security@example.com
- AWS billing questions: billing@example.com
