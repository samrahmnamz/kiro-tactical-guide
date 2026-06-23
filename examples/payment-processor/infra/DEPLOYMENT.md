# Quick Deployment Guide

Step-by-step guide to deploy the payment processor infrastructure to AWS.

## Prerequisites Check

Run these commands to verify you have the required tools:

```bash
# Node.js version (requires 18+)
node --version

# AWS CLI configured
aws sts get-caller-identity

# AWS CDK installed
cdk --version
```

## Step 1: Install Dependencies

```bash
cd examples/payment-processor/infra
npm install
```

**Expected output**: Dependencies installed without errors.

## Step 2: Bootstrap CDK (First-time only)

If you've never used CDK in this AWS account/region:

```bash
cdk bootstrap
```

**Expected output**: 
```
✅  Environment aws://123456789012/us-east-1 bootstrapped.
```

## Step 3: Preview Infrastructure

See what will be created:

```bash
npm run cdk:synth
```

**Expected output**: CloudFormation template displayed (should pass validate-iam.yaml hook).

## Step 4: Deploy Infrastructure

```bash
npm run cdk:deploy
```

**Expected output**:
```
✅  PaymentProcessorStack

Outputs:
PaymentProcessorStack.ApiEndpoint = https://abc123.execute-api.us-east-1.amazonaws.com/prod/
PaymentProcessorStack.PaymentTableName = PaymentRecords
...
```

**Duration**: ~3-5 minutes

## Step 5: Configure Stripe API Key

The stack creates a placeholder secret. You must populate it:

```bash
# For test/development
aws secretsmanager update-secret \
  --secret-id payment-processor/stripe-api-key \
  --secret-string "sk_test_YOUR_STRIPE_TEST_KEY"
```

**Important**: Get your Stripe test key from https://dashboard.stripe.com/test/apikeys

## Step 6: Verify Deployment

Test the API endpoint:

```bash
# Get the API URL from CloudFormation output
API_URL=$(aws cloudformation describe-stacks \
  --stack-name PaymentProcessorStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

echo "Your API is live at: $API_URL"
```

## Step 7: Test Payment Processing

Use Stripe's test card to verify everything works:

```bash
curl -X POST ${API_URL}api/payments \
  -H "Content-Type: application/json" \
  -d '{
    "stripeToken": "tok_visa",
    "amount": 1999,
    "currency": "usd",
    "orderId": "test-001",
    "metadata": {
      "customerEmail": "test@example.com",
      "orderDescription": "Test payment"
    }
  }'
```

**Expected**: 200 response with payment details.

## Cleanup (Optional)

To remove all resources:

```bash
npm run cdk:destroy
```

**Warning**: This deletes all payment records. Ensure you have backups.

## Troubleshooting

### Issue: "Unable to resolve AWS account"
**Fix**: Run `aws configure` and set your credentials.

### Issue: "Stack already exists"
**Fix**: Either delete the existing stack or choose a different stack name.

### Issue: Lambda returns 500 error
**Fix**: Check CloudWatch Logs:
```bash
aws logs tail /aws/lambda/payment-processor --follow
```

## Next Steps

1. Review the [full README](README.md) for detailed documentation
2. Explore the [spec](../spec.md) for requirements and design decisions
3. Check out the [security hooks](../../../toolkit/hooks/security/) used in this example
4. Implement the Lambda function code in `../src/` (see spec for requirements)

## Cost Warning

This deployment creates billable AWS resources:
- Lambda function (pay-per-invoke)
- DynamoDB table (on-demand capacity)
- KMS key (~$1/month)
- Secrets Manager secret (~$0.40/month)
- API Gateway (pay-per-request)
- CloudWatch Logs (10-year retention)

**Estimated cost**: ~$3-5/month with minimal usage. Always monitor costs via AWS Cost Explorer.
