# Payment Processor Example

> **Demonstrates**: Security & Compliance (PCI DSS), Secret Scanning, IAM Validation, Data Encryption

This example shows how to build a secure payment processing service that integrates with Stripe while maintaining PCI DSS compliance, encrypting sensitive data at rest, and preventing credential exposure through automated security scanning.

## What This Example Demonstrates

### Security Patterns
- **Secret Management**: Stripe API keys loaded from AWS Secrets Manager (never hardcoded)
- **Encryption at Rest**: AES-256 encryption for sensitive fields (card last four, customer email) using AWS KMS
- **PII Scrubbing**: Automatic redaction of credit card numbers, CVVs, and API keys from logs
- **IAM Least Privilege**: Specific resource ARNs (no wildcards) for all AWS service access

### Kiro Security Toolkit Integration
- `scan-secrets.yaml`: Blocks commits containing API keys (gitleaks)
- `scan-secrets-regex.yaml`: Zero-dependency regex-based scanning
- `validate-iam.yaml`: Flags wildcard IAM permissions
- `excluded-paths.yaml`: Prevents `.env` files from model context
- `region-config.yaml`: Enforces data residency controls

### PCI DSS Compliance
- **SAQ-A Compliance**: Service never sees full card data (Stripe tokenization)
- **Data Retention**: 7-year auto-deletion via DynamoDB TTL
- **Audit Logging**: All payment events logged to CloudWatch

## Architecture

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │ 1. Stripe.js tokenizes card
       │    (client-side, secure)
       ▼
┌─────────────────────────────────────┐
│     Payment Processor Service       │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Express API                 │  │
│  │  - POST /api/payments        │  │
│  │  - GET /api/payments/:id     │  │
│  └────────┬─────────────────────┘  │
│           │                         │
│           ▼                         │
│  ┌──────────────────────────────┐  │
│  │  Payment Service             │  │
│  │  - Stripe integration        │  │
│  │  - Idempotency handling      │  │
│  │  - Error mapping             │  │
│  └────┬──────────────────┬──────┘  │
│       │                  │          │
│       ▼                  ▼          │
│  ┌─────────┐      ┌──────────────┐ │
│  │ Logger  │      │  Encryption  │ │
│  │ (PII    │      │  (KMS)       │ │
│  │ scrub)  │      └──────────────┘ │
│  └─────────┘                        │
└──────┬─────────────────┬────────────┘
       │                 │
       ▼                 ▼
┌─────────────┐   ┌─────────────┐
│   Stripe    │   │  DynamoDB   │
│   API       │   │  (encrypted │
│             │   │   records)  │
└─────────────┘   └─────────────┘
```

## Prerequisites

1. **Node.js**: >= 18.0.0
2. **AWS Account**: With permissions for DynamoDB, KMS, Secrets Manager, Lambda
3. **Stripe Account**: Test mode keys for development
4. **Gitleaks** (optional): For local secret scanning
   ```bash
   # macOS
   brew install gitleaks
   
   # Linux
   wget https://github.com/gitleaks/gitleaks/releases/download/v8.18.0/gitleaks_8.18.0_linux_x64.tar.gz
   tar -xzf gitleaks_8.18.0_linux_x64.tar.gz
   sudo mv gitleaks /usr/local/bin/
   ```

## Quick Start

### 1. Install Dependencies

```bash
cd examples/payment-processor
npm install
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your values
# For development, you can use Stripe test keys directly
# For production, use AWS Secrets Manager
```

### 3. Set Up AWS Resources (Development)

```bash
# Create Secrets Manager secret for Stripe API key
aws secretsmanager create-secret \
  --name payment-processor/stripe-api-key \
  --secret-string "sk_test_YOUR_STRIPE_TEST_KEY" \
  --region us-east-1

# Create DynamoDB table
aws dynamodb create-table \
  --table-name PaymentRecords \
  --attribute-definitions \
    AttributeName=paymentId,AttributeType=S \
    AttributeName=orderId,AttributeType=S \
  --key-schema \
    AttributeName=paymentId,KeyType=HASH \
  --global-secondary-indexes \
    '[{
      "IndexName": "OrderIdIndex",
      "KeySchema": [{"AttributeName": "orderId", "KeyType": "HASH"}],
      "Projection": {"ProjectionType": "ALL"},
      "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Create KMS key for encryption
aws kms create-key \
  --description "Payment processor encryption key" \
  --region us-east-1

# Create alias for the key (replace KEY_ID with output from above)
aws kms create-alias \
  --alias-name alias/payment-processor-encryption \
  --target-key-id KEY_ID \
  --region us-east-1
```

### 4. Run Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run with coverage
npm run test:coverage
```

### 5. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`.

## API Usage Examples

### Process a Payment

```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -d '{
    "stripeToken": "tok_visa",
    "amount": 1999,
    "currency": "usd",
    "orderId": "order_123",
    "metadata": {
      "customerEmail": "customer@example.com",
      "orderDescription": "Test order"
    }
  }'
```

**Success Response (200)**:
```json
{
  "paymentId": "550e8400-e29b-41d4-a716-446655440000",
  "stripeChargeId": "ch_1234567890",
  "status": "succeeded",
  "amount": 1999,
  "currency": "usd",
  "receiptUrl": "https://pay.stripe.com/receipts/...",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Retrieve Payment Details

```bash
curl http://localhost:3000/api/payments/550e8400-e29b-41d4-a716-446655440000
```

**Success Response (200)**:
```json
{
  "paymentId": "550e8400-e29b-41d4-a716-446655440000",
  "orderId": "order_123",
  "status": "succeeded",
  "amount": 1999,
  "currency": "usd",
  "lastFourDigits": "4242",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

## Testing Stripe Integration

Use Stripe's test card numbers:

| Card Number         | Scenario                    |
|---------------------|----------------------------|
| 4242424242424242    | Successful payment         |
| 4000000000000002    | Card declined              |
| 4000000000009995    | Insufficient funds         |
| 4000000000000069    | Expired card               |

Generate test tokens:
```bash
# Using Stripe CLI
stripe tokens create --card-number=4242424242424242 --card-exp-month=12 --card-exp-year=2025 --card-cvc=123
```

## Security Hook Validation

### Test Secret Scanning

1. Try adding a fake Stripe key to any source file:
   ```typescript
   // This should be blocked by scan-secrets.yaml
   const stripe = new Stripe('sk_live_fake123456789');
   ```

2. Save the file in your IDE
3. The `scan-secrets.yaml` hook should detect it and block the context

### Test IAM Validation

1. In CDK code, try using wildcard permissions:
   ```typescript
   // This should be flagged by validate-iam.yaml
   lambdaRole.addToPolicy(new PolicyStatement({
     actions: ['*'],
     resources: ['*']
   }));
   ```

2. Run `npm run cdk synth`
3. The `validate-iam.yaml` hook should flag the violation

## Deployment to AWS (Production)

For production deployment with CDK:

```bash
cd infra
npm install
npm run cdk deploy
```

This creates:
- Lambda function with payment processor
- DynamoDB table with GSI for orderId lookups
- KMS key for encryption
- API Gateway endpoint
- IAM roles with least-privilege permissions

## Project Structure

```
payment-processor/
├── src/
│   ├── index.ts              # Express API server
│   ├── types.ts              # TypeScript interfaces
│   ├── payment-service.ts    # Payment processing logic
│   ├── database.ts           # DynamoDB operations
│   ├── encryption.ts         # KMS encryption utilities
│   ├── logger.ts             # PII-scrubbing logger
│   └── secrets.ts            # Secrets Manager integration
├── tests/
│   ├── unit/                 # Unit tests
│   │   ├── logger.test.ts
│   │   └── encryption.test.ts
│   └── integration/          # Integration tests
├── infra/                    # CDK infrastructure code
├── package.json
├── tsconfig.json
├── jest.config.js
├── .env.example
├── .gitignore
└── README.md
```

## What's Demonstrated

### ✓ Correct Patterns

1. **Secret Loading**: API keys loaded from Secrets Manager at runtime
2. **Encryption**: Sensitive fields encrypted before DynamoDB storage
3. **Log Scrubbing**: PII automatically redacted from all logs
4. **Idempotency**: Same orderId = same payment (no duplicates)
5. **Error Mapping**: Internal errors mapped to user-friendly messages

### ✗ Anti-Patterns (Caught by Hooks)

1. **Hardcoded Secrets**: Blocked by `scan-secrets.yaml`
2. **Wildcard IAM**: Flagged by `validate-iam.yaml`
3. **PII in Logs**: Caught by unit tests
4. **Plaintext Storage**: Caught by unit tests

## Key Files for Learning

1. **src/secrets.ts**: Shows proper Secrets Manager integration
2. **src/encryption.ts**: Application-layer encryption with KMS
3. **src/logger.ts**: PII scrubbing implementation
4. **src/payment-service.ts**: Stripe integration with error handling
5. **tests/unit/logger.test.ts**: How to test log scrubbing

## Troubleshooting

### "Secret not found" error
Ensure you've created the secret in Secrets Manager in the correct region.

### "KMS key not found" error
Create the KMS key and alias as shown in the Quick Start section.

### "Table not found" error
Create the DynamoDB table or update `DYNAMODB_TABLE_NAME` in your `.env`.

### Tests failing with KMS errors
Tests use mocked AWS SDK clients. Ensure you have the latest dependencies installed.

## Related Documentation

- [Stripe API Documentation](https://stripe.com/docs/api)
- [PCI DSS Quick Reference](https://www.pcisecuritystandards.org/documents/PCI_DSS_Quick_Reference_Guide.pdf)
- [AWS KMS Best Practices](https://docs.aws.amazon.com/kms/latest/developerguide/best-practices.html)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)

## Support

- **Questions**: #kiro-toolbox Slack channel
- **Security Issues**: security@example.com
- **Stripe Integration**: #payments-team Slack channel
