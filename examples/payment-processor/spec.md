# Payment Processor Service Specification

> **Example Project**: Demonstrates security constraints, PCI DSS compliance, and secret scanning patterns
> 
> **Primary Concerns Addressed**: 
> - Security & Compliance (Concern #1)
> - Data Leakage Prevention (Concern #7)
> 
> **Toolkit Artifacts Demonstrated**:
> - `toolkit/hooks/security/scan-secrets.json` - Local secret scanning
> - `toolkit/hooks/security/validate-iam.json` - IAM policy validation
> - `toolkit/steering/security-rules.md` - Security constraints for all AI-generated code
> - `toolkit/steering/code-standards.md` - Coding patterns including error handling
> - `toolkit/steering/excluded-paths.yaml` - Sensitive file exclusions (config only)

---

## Intent

A secure payment processing service that integrates with Stripe to handle credit card transactions while maintaining PCI DSS compliance, encrypting sensitive data at rest, and preventing credential exposure through automated secret scanning and IAM validation.

**Why it exists**: Demonstrates how Kiro's security tooling prevents common vulnerabilities in payment systems—secret leakage, overly permissive IAM policies, and PII in logs—before code reaches production.

---

## Contracts

### API Endpoints

#### POST /api/payments
Process a payment using a Stripe token.

**Request**:
```typescript
{
  "stripeToken": string,        // Stripe token from frontend (tok_*)
  "amount": number,             // Amount in cents (e.g., 1999 for $19.99)
  "currency": string,           // ISO currency code (e.g., "usd")
  "orderId": string,            // Unique order identifier
  "metadata": {
    "customerEmail": string,    // For receipt delivery
    "orderDescription": string
  }
}
```

**Response (Success - 200)**:
```typescript
{
  "paymentId": string,          // DynamoDB record ID
  "stripeChargeId": string,     // Stripe charge ID (ch_*)
  "status": "succeeded" | "pending" | "failed",
  "amount": number,
  "currency": string,
  "receiptUrl": string,         // Stripe receipt URL
  "createdAt": string           // ISO 8601 timestamp
}
```

**Response (Error - 400/500)**:
```typescript
{
  "error": {
    "code": string,             // Error code (e.g., "card_declined")
    "message": string           // User-friendly error message
  }
}
```

#### GET /api/payments/:paymentId
Retrieve payment details.

**Response (Success - 200)**:
```typescript
{
  "paymentId": string,
  "orderId": string,
  "status": string,
  "amount": number,
  "currency": string,
  "lastFourDigits": string,     // Encrypted in DB, decrypted for response
  "createdAt": string,
  "updatedAt": string
}
```

### DynamoDB Schema

**Table**: `PaymentRecords`

```typescript
{
  "paymentId": string,          // Partition key (UUID)
  "orderId": string,            // Global secondary index
  "stripeChargeId": string,
  "amount": number,
  "currency": string,
  "status": string,
  "cardLastFour": string,       // Encrypted with AES-256
  "customerEmail": string,      // Encrypted with AES-256
  "metadata": object,
  "createdAt": string,
  "updatedAt": string,
  "ttl": number                 // Auto-delete after 7 years (PCI requirement)
}
```

---

## Constraints

### Security Constraints

#### 1. Secret Management
**Requirement**: Stripe API keys must never be committed to source control or logged.

**Validation**: 
- ✓ Automated by `scan-secrets.json` hook on file save
- ✓ Keys stored in AWS Secrets Manager, retrieved at runtime
- ✓ Environment files (`.env`, `.env.local`) excluded from model context via `excluded-paths.yaml`

**Implementation**:
```typescript
// ✓ CORRECT: Load from Secrets Manager
const stripeKey = await getSecret('payment-processor/stripe-api-key');
const stripe = new Stripe(stripeKey);

// ✗ WRONG: Hardcoded key (blocked by scan-secrets.json)
// const stripe = new Stripe('sk_live_51H...'); // This would be caught
```

#### 2. Encryption at Rest
**Requirement**: All sensitive data (card last four digits, customer email) must be encrypted using AES-256 before storing in DynamoDB.

**Validation**: 
- ✓ Unit tests verify encryption before DB write
- ✓ Code review checklist includes encryption verification

**Implementation**:
```typescript
// ✓ CORRECT: Encrypt before storage
const encryptedEmail = await encrypt(customerEmail, kmsKeyId);
const encryptedCardLastFour = await encrypt(cardLastFour, kmsKeyId);

await dynamodb.putItem({
  paymentId,
  customerEmail: encryptedEmail,
  cardLastFour: encryptedCardLastFour,
  // ...
});

// ✗ WRONG: Plaintext storage (caught by unit tests)
// await dynamodb.putItem({ customerEmail, cardLastFour, ... });
```

#### 3. No PII in Logs
**Requirement**: Credit card numbers, CVVs, full customer names, and other PII must never appear in CloudWatch logs.

**Validation**: 
- ✓ Log scrubbing utility redacts sensitive patterns
- ✓ Unit tests verify scrubbing function correctness
- ✓ Regular expression scanner flags log statements with PII patterns

**Implementation**:
```typescript
// ✓ CORRECT: Log scrubbed data
logger.info('Payment processed', {
  paymentId,
  orderId,
  amount,
  cardLastFour: '****' + cardLastFour.slice(-4),  // Only last 4 digits
  customerEmail: maskEmail(email)                  // m***@example.com
});

// ✗ WRONG: Log full card number (caught by regex scanner)
// logger.info('Payment processed', { cardNumber: fullCardNumber });
```

#### 4. IAM Least Privilege
**Requirement**: Lambda execution role must not use wildcard permissions (`*`). Specific resource ARNs required for all AWS service access.

**Validation**: 
- ✓ Automated by `validate-iam.json` hook
- ✓ CDK synthesis includes IAM policy review step

**Implementation**:
```typescript
// ✓ CORRECT: Specific resource ARNs
lambdaRole.addToPolicy(new PolicyStatement({
  actions: ['secretsmanager:GetSecretValue'],
  resources: ['arn:aws:secretsmanager:us-east-1:123456789012:secret:payment-processor/*']
}));

lambdaRole.addToPolicy(new PolicyStatement({
  actions: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:Query'],
  resources: [
    paymentTable.tableArn,
    `${paymentTable.tableArn}/index/*`  // For GSI access
  ]
}));

// ✗ WRONG: Wildcard permissions (blocked by validate-iam.json)
// lambdaRole.addToPolicy(new PolicyStatement({
//   actions: ['*'],
//   resources: ['*']
// }));
```

### Performance Constraints

#### 5. Latency Requirements
- **P50**: < 200ms for payment processing
- **P99**: < 1000ms for payment processing
- **Timeout**: Lambda timeout set to 10 seconds (API Gateway timeout is 29s)

**Validation**: 
- ✓ Load testing with 100 concurrent requests
- ✓ CloudWatch metrics for latency tracking

#### 6. Throughput Requirements
- **Target**: 100 payments per second sustained
- **Burst**: 500 payments per second for 60 seconds

**Validation**: 
- ✓ DynamoDB configured with on-demand capacity
- ✓ Lambda reserved concurrency: 50

### Compliance Constraints

#### 7. PCI DSS Requirements
- **SAQ-A Compliance**: Service must qualify for Self-Assessment Questionnaire A (merchant never sees full card data)
- **Data Retention**: Payment records auto-deleted after 7 years via DynamoDB TTL
- **Audit Logging**: All payment processing events logged to CloudWatch with retention policy

**Validation**: 
- ✓ Stripe.js used for client-side tokenization (service never receives raw card data)
- ✓ DynamoDB TTL configured on all records
- ✓ CloudWatch log retention set to 10 years

#### 8. Data Residency
- **Requirement**: Bedrock model calls (if used for fraud detection or support) must use `us-east-1` only
- **Validation**: Enforced by `toolkit/steering/region-config.yaml`

### Integration Constraints

#### 9. Stripe API Integration
- **API Version**: `2023-10-16` (pinned to prevent breaking changes)
- **Retry Logic**: Exponential backoff for transient failures (network errors, rate limits)
- **Idempotency**: All Stripe API calls include idempotency key based on `orderId`

**Validation**: 
- ✓ Integration tests with Stripe test mode
- ✓ Unit tests verify retry logic

#### 10. Error Handling
- **User-facing errors**: Never expose internal details (e.g., "Payment failed" not "Stripe API key invalid")
- **Internal errors**: Logged with full context for debugging
- **Retryable errors**: Client receives 503 with `Retry-After` header

---

## Design Decisions (and why)

### 1. Stripe vs Direct Card Processing
**Decision**: Use Stripe for payment processing instead of direct card processor integration.

**Rationale**:
- **PCI Compliance Simplification**: Stripe handles tokenization (SAQ-A vs SAQ-D reduces compliance burden by ~90%)
- **Fraud Detection**: Stripe Radar provides ML-based fraud prevention out of the box
- **Multi-currency Support**: Built-in currency conversion and localization
- **Developer Experience**: Well-documented API, extensive client libraries, active community support

**Trade-offs**:
- Stripe fees (2.9% + $0.30 per transaction) vs potentially lower rates with direct processor
- Vendor lock-in to Stripe's API surface
- **Decision**: Compliance and velocity benefits outweigh cost for initial launch

### 2. DynamoDB vs Relational Database
**Decision**: Use DynamoDB for payment record storage instead of RDS/Aurora.

**Rationale**:
- **Scale Without Ops**: On-demand capacity auto-scales to traffic spikes (Black Friday, flash sales)
- **TTL Built-in**: Native support for auto-deletion after 7 years (PCI requirement)
- **Single-digit Millisecond Latency**: Consistent performance at scale
- **Cost**: Pay-per-request pricing aligns with traffic patterns (no idle database cost)

**Trade-offs**:
- Limited query flexibility (need to plan access patterns upfront)
- No ACID transactions across multiple items
- **Decision**: Access patterns are simple (point lookups, orderId index), and single-item consistency sufficient for payment records

### 3. Encryption at Application Layer vs Database Layer
**Decision**: Encrypt sensitive fields at application layer using AWS KMS, not DynamoDB encryption at rest.

**Rationale**:
- **Fine-grained Control**: Encrypt only sensitive fields (cardLastFour, customerEmail), not entire record
- **Search/Index Support**: Encrypted fields excluded from secondary indexes, unencrypted fields (paymentId, orderId, status) remain queryable
- **Key Rotation**: Application-layer encryption allows field-level key rotation without full table rewrite
- **Access Control**: KMS key policy enforces who can decrypt (separate from DynamoDB table permissions)

**Trade-offs**:
- Application complexity (must handle encryption/decryption in code)
- Latency overhead (~10ms per KMS call, mitigated by data key caching)
- **Decision**: Security and compliance benefits justify complexity

### 4. Local Secret Scanning vs CI/CD Only
**Decision**: Run secret scanning locally (on file save) in addition to CI/CD pipeline checks.

**Rationale**:
- **Instant Feedback**: Developer sees "secret detected" message within 1 second of saving file, not 3-5 minutes later on CI/CD
- **Prevention vs Detection**: Blocks file from reaching model context, prevents AI-assisted coding from propagating secret further
- **Offline Support**: Works without network connection (important for air-gapped or VPN-constrained environments)

**Trade-offs**:
- Requires gitleaks installation on developer machines
- Potential false positives (mitigated by inline `# gitleaks:allow` comments)
- **Decision**: Instant feedback loop dramatically reduces secret leakage incidents (internal data: 89% reduction)

### 5. Lambda vs ECS/Fargate
**Decision**: Use AWS Lambda for payment processing API instead of container-based compute.

**Rationale**:
- **Cost**: Pay-per-invoke (100 payments = $0.02) vs always-running containers ($50+/month minimum)
- **Scaling**: Auto-scales to thousands of concurrent requests without configuration
- **Cold Start Mitigation**: Provisioned concurrency (5 warm instances) keeps P99 latency < 1s
- **Operational Overhead**: No patching, no Kubernetes, no container registry management

**Trade-offs**:
- 10-second timeout limit (sufficient for payment processing but not for batch jobs)
- Cold start latency (200-500ms for first request, mitigated by provisioned concurrency)
- **Decision**: Traffic pattern (burst-oriented) and operational simplicity favor Lambda

---

## Test Expectations

### Positive Cases (✓ must pass)

1. **✓ Valid Payment Processing**
   - Given: Valid Stripe token, amount, currency, orderId
   - When: POST /api/payments
   - Then: Returns 200, payment record created in DynamoDB, Stripe charge successful

2. **✓ Idempotency**
   - Given: Same orderId submitted twice with identical payload
   - When: POST /api/payments (2nd request)
   - Then: Returns 200 with same paymentId, no duplicate charge in Stripe

3. **✓ Payment Retrieval**
   - Given: Valid paymentId from previous successful payment
   - When: GET /api/payments/:paymentId
   - Then: Returns 200 with decrypted payment details (cardLastFour visible)

4. **✓ Encryption Roundtrip**
   - Given: Customer email and card last four digits
   - When: Encrypt → Store in DynamoDB → Retrieve → Decrypt
   - Then: Decrypted values match original plaintext

5. **✓ Secret Scanning Detection**
   - Given: Code containing `sk_live_51H...` pattern
   - When: File save triggers scan-secrets.yaml hook
   - Then: Hook exits with error, file blocked from model context

6. **✓ IAM Validation Detection**
   - Given: CDK code with wildcard IAM action (`"Action": "*"`)
   - When: Synthesize CDK stack
   - Then: validate-iam.yaml hook flags violation, suggests least-privilege policy

### Negative Cases (✗ must be rejected)

1. **✗ Invalid Stripe Token**
   - Given: Malformed Stripe token (`tok_invalid`)
   - When: POST /api/payments
   - Then: Returns 400 with error `{ "code": "invalid_token", "message": "Invalid payment token" }`

2. **✗ Card Declined**
   - Given: Stripe test token for declined card (`tok_chargeDeclined`)
   - When: POST /api/payments
   - Then: Returns 400 with error `{ "code": "card_declined", "message": "Payment method declined" }`

3. **✗ Insufficient Funds**
   - Given: Stripe test token for insufficient funds (`tok_chargeDeclinedInsufficientFunds`)
   - When: POST /api/payments
   - Then: Returns 400 with error `{ "code": "insufficient_funds", "message": "Insufficient funds" }`

4. **✗ Missing Required Fields**
   - Given: Request missing `amount` field
   - When: POST /api/payments
   - Then: Returns 400 with error `{ "code": "validation_error", "message": "Missing required field: amount" }`

5. **✗ PII in Logs**
   - Given: Log statement containing full credit card number pattern (`4242 4242 4242 4242`)
   - When: Unit test suite runs
   - Then: Test fails with message "PII detected in logs"

6. **✗ Plaintext Storage**
   - Given: DynamoDB put operation with unencrypted `customerEmail`
   - When: Unit test for payment record creation
   - Then: Test fails with message "Sensitive field not encrypted"

7. **✗ Payment Not Found**
   - Given: Invalid paymentId (`pay_nonexistent`)
   - When: GET /api/payments/:paymentId
   - Then: Returns 404 with error `{ "code": "not_found", "message": "Payment not found" }`

### Edge Cases (must be handled)

1. **⚠ Stripe API Timeout**
   - Given: Stripe API takes > 5 seconds to respond
   - When: POST /api/payments
   - Then: Returns 503 with `Retry-After: 30` header, payment marked as "pending" in DynamoDB

2. **⚠ KMS Throttling**
   - Given: Burst traffic (500 payments/sec) exceeds KMS rate limit
   - When: Decrypt operations for cardLastFour retrieval
   - Then: Use data key caching to reduce KMS calls by 90%, retry throttled requests with exponential backoff

3. **⚠ DynamoDB Conditional Write Failure**
   - Given: Concurrent requests with same orderId
   - When: Both requests attempt to create payment record simultaneously
   - Then: One succeeds, other receives ConditionalCheckFailedException, returns existing paymentId (idempotency preserved)

---

## Rollback Plan

### Trigger Conditions
Rollback if any of the following occur within 15 minutes of deployment:

1. **Payment failure rate > 5%** (monitored via CloudWatch metric `PaymentFailureRate`)
2. **Lambda error rate > 2%** (monitored via CloudWatch metric `LambdaErrors`)
3. **P99 latency > 3 seconds** (monitored via CloudWatch metric `PaymentLatency`)
4. **Secret leakage detected** (manual review if scan-secrets.yaml bypassed)

### Rollback Procedure

1. **Immediate Actions (0-2 minutes)**:
   - Revert Lambda function to previous version via AWS Console or CLI:
     ```bash
     aws lambda update-function-configuration \
       --function-name payment-processor \
       --environment Variables="{LAMBDA_VERSION=previous}"
     ```
   - Update API Gateway stage to point to previous Lambda alias

2. **Database Rollback (2-5 minutes)**:
   - DynamoDB schema changes are backward-compatible (additive only, no destructive changes)
   - If schema regression required: restore from point-in-time recovery (PITR)
     ```bash
     aws dynamodb restore-table-to-point-in-time \
       --source-table-name PaymentRecords \
       --target-table-name PaymentRecords-restored \
       --restore-date-time 2024-01-15T12:00:00Z
     ```

3. **Verification (5-10 minutes)**:
   - Run smoke tests against rolled-back version (process test payment in Stripe test mode)
   - Verify CloudWatch metrics return to baseline (failure rate < 1%, latency P99 < 1s)

4. **Communication (10-15 minutes)**:
   - Post incident notification to #payments-team Slack channel
   - Update status page if customer-facing impact
   - Create postmortem ticket for root cause analysis

### Time Target
**Complete rollback within 10 minutes** of decision to rollback (including verification).

### Rollback Testing
- **Frequency**: Quarterly rollback drill
- **Validation**: Ensure rollback procedure completes within time target
- **Documentation**: Update rollback plan based on drill findings

---

## Security Hooks Integration

This spec demonstrates integration with the Kiro security toolkit using v2 hook format:

### 1. scan-secrets.json
**Triggers**: PostFileSave for files in `src/`, `lib/`, `config/`, `scripts/`

**v2 Hook Format**:
```json
{
  "version": "v1",
  "hooks": [{
    "name": "scan-secrets",
    "trigger": "PostFileSave",
    "matcher": "(src|lib|config|scripts)/.*",
    "action": {
      "type": "command",
      "command": "gitleaks detect --source=\"${KIRO_FILE_PATH}\" --no-git --report-format=json --report-path=/tmp/gitleaks-report.json && echo '✅ No secrets detected' || (echo '⚠️ Secrets detected in ${KIRO_FILE_PATH}:' && cat /tmp/gitleaks-report.json | jq '.[] | .Description + \" at line \" + (.StartLine|tostring)' && exit 1)"
    }
  }]
}
```

**What it catches**:
- Stripe API keys (`sk_live_*`, `sk_test_*`)
- AWS access keys (`AKIA*`)
- Private keys (`-----BEGIN PRIVATE KEY-----`)
- Database connection strings

**Why command action**: Runs LOCALLY on developer's machine. File content never leaves the machine. If secrets detected, blocks file from being included in model context.

**Example**:
```typescript
// ✗ This would be caught on file save:
// const stripe = new Stripe('sk_live_51H...');

// ✓ This is safe (loaded from Secrets Manager):
const stripeKey = await getSecret('stripe-api-key');
```

### 2. validate-iam.json
**Triggers**: PreToolUse before executing bash, file writes, or string replacements on infrastructure files

**v2 Hook Format**:
```json
{
  "version": "v1",
  "hooks": [{
    "name": "validate-iam-policies",
    "trigger": "PreToolUse",
    "matcher": "execute_bash|str_replace|fs_write",
    "action": {
      "type": "agent",
      "prompt": "Check any IAM policy statements in the code being modified: 1. Flag any \"Action\": \"*\" or \"Resource\": \"*\", 2. Flag any policy without a Condition block for sensitive operations, 3. Suggest least-privilege alternatives based on the service's spec integration points, 4. Verify encryption requirements match spec constraints. If violations found, explain the security risk and provide corrected policy."
    }
  }]
}
```

**What it catches**:
- Wildcard IAM actions (`"Action": "*"`)
- Wildcard IAM resources (`"Resource": "*"`)
- Missing IAM condition blocks for sensitive operations

**Example**:
```typescript
// ✗ This would be flagged by validate-iam.json:
// lambdaRole.addToPolicy(new PolicyStatement({
//   actions: ['secretsmanager:*'],
//   resources: ['*']
// }));

// ✓ This passes validation:
lambdaRole.addToPolicy(new PolicyStatement({
  actions: ['secretsmanager:GetSecretValue'],
  resources: ['arn:aws:secretsmanager:us-east-1:123456789012:secret:payment-processor/*']
}));
```

### 3. Alternative: Regex-based Secret Scanning (No Dependencies)

For environments where gitleaks cannot be installed:

**v2 Hook Format**:
```json
{
  "version": "v1",
  "hooks": [{
    "name": "scan-secrets-regex",
    "trigger": "PostFileSave",
    "matcher": "(src|lib|config|scripts)/.*",
    "action": {
      "type": "command",
      "command": "PATTERNS=('AKIA[0-9A-Z]{16}' '-----BEGIN (RSA |EC |)PRIVATE KEY-----' 'ghp_[a-zA-Z0-9]{36}' 'sk-[a-zA-Z0-9]{32,}' 'mongodb\\+srv://[^[:space:]]+' 'postgres://[^[:space:]]+'); for pattern in \"${PATTERNS[@]}\"; do if grep -nE \"$pattern\" \"${KIRO_FILE_PATH}\"; then echo \"⚠️ Potential secret found matching: $pattern\"; exit 1; fi; done; echo '✅ No secrets detected'"
    }
  }]
}
```

**Trade-offs**:
- ✓ No external dependencies (pure bash + grep)
- ✓ Works in air-gapped environments
- ✗ More false positives than gitleaks
- ✗ Less comprehensive pattern matching

---

## Steering Files Integration

This service leverages Kiro steering files to prevent security issues before code is generated.

### 1. Security Rules (`toolkit/steering/security-rules.md`)

**Always included** - Prevents security violations during code generation:

**Key rules enforced**:
- **IAM Policies**: NEVER use wildcard actions or resources, ALWAYS use least-privilege
  ```json
  // ✓ AI generates this (from steering file guidance):
  {
    "Effect": "Allow",
    "Action": ["dynamodb:GetItem", "dynamodb:PutItem"],
    "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/PaymentTable"
  }
  ```

- **Data Encryption**: ALWAYS encrypt data at rest (AES-256), ALWAYS use TLS 1.2+ for data in transit
  ```typescript
  // ✓ AI generates this (from steering file guidance):
  const encrypted = encrypt(sensitiveData, KMS_KEY_ID);
  await dynamodb.putItem({ encryptedData: encrypted, keyId: KMS_KEY_ID });
  ```

- **Secrets Management**: NEVER hardcode secrets, ALWAYS use AWS Secrets Manager or Parameter Store
  ```typescript
  // ✓ AI generates this (from steering file guidance):
  const secret = await secretsManager.getSecretValue({ 
    SecretId: 'prod/payment-api-key' 
  });
  const apiKey = JSON.parse(secret.SecretString).apiKey;
  ```

### 2. Code Standards (`toolkit/steering/code-standards.md`)

**Always included** - Ensures consistent error handling and logging:

**Key patterns enforced**:
- **Error Handling**: ALWAYS handle external service failures gracefully (fail-open with logging)
  ```typescript
  try {
    const charge = await stripe.charges.create(params);
    return { status: 'succeeded', chargeId: charge.id };
  } catch (error) {
    logger.error('Stripe charge failed', { error, orderId });
    if (error.type === 'StripeCardError') {
      return { status: 'failed', reason: 'card_declined' };
    }
    throw new RetryableError('Transient Stripe failure');
  }
  ```

- **Logging**: NEVER log PII, ALWAYS mask sensitive data
  ```typescript
  logger.info('Payment processed', {
    paymentId,
    orderId,
    amount,
    cardLastFour: '****' + cardLastFour.slice(-4),
    customerEmail: maskEmail(email)
  });
  ```

### 3. Excluded Paths Configuration

**Purpose**: Prevents sensitive files from being sent as model context (config file, not a steering file):

**Configuration** (`.kiro/steering/excluded-paths.yaml`):
```yaml
excluded_patterns:
  - "**/.env*"
  - "**/.aws/credentials"
  - "**/secrets/**"
  - "**/vault/**"
  - "**/*.pem"
  - "**/*.key"
```

**Benefit**: Even if a developer accidentally creates a `.env` file with Stripe keys, it will never reach the model.

### Impact: Steering Files + Hooks = Defense in Depth

| Layer | Mechanism | When | Example |
|-------|-----------|------|---------|
| **Prevention** | Steering file | During code generation | AI sees "never hardcode secrets" → generates Secrets Manager call |
| **Detection** | Hook (command) | After file save | `scan-secrets.json` scans file → flags hardcoded key if steering failed |
| **Enforcement** | Hook (agent) | Before code change | `validate-iam.json` blocks commit if IAM policy has wildcards |

**Measurable outcomes**:
- **Before steering files**: Hooks catch violations 40% of the time → manual fixes required
- **After steering files**: Hooks catch violations <8% of the time (only novel edge cases)
- **Secret leakage incidents**: 89% reduction (internal data from tactical guide)
- **IAM policy violations**: 95% reduction (wildcards almost never generated)

---

## Lessons Learned

### From Production Incidents

1. **2023-11 Incident: Hardcoded API Key in Logs**
   - **What happened**: Engineer added debug logging with full Stripe request object, accidentally logging API key
   - **Impact**: Security team revoked key, 45 minutes of payment downtime
   - **Prevention**: This spec now requires log scrubbing utility, enforced by unit tests
   - **Hook added**: scan-secrets-regex.yaml pattern for `sk_live_` in log statements

2. **2024-03 Incident: DynamoDB Hot Partition**
   - **What happened**: All payment records used same partition key, throttling at 1000 WCU
   - **Impact**: P99 latency spiked to 8 seconds during flash sale
   - **Prevention**: Changed to UUID-based partition key (random distribution)
   - **Trade-off**: Lose ability to query "all payments" without secondary index

### Design Constraints from Business Requirements

1. **Multi-currency Support**
   - **Business requirement**: Launch in EU required EUR, GBP support
   - **Technical decision**: Use Stripe's currency conversion (3.5% fee) vs building FX system
   - **Rationale**: Time to market (2 weeks vs 6 months) and regulatory complexity (PSD2 compliance)

2. **7-Year Data Retention**
   - **Business requirement**: SOX compliance requires 7-year audit trail
   - **Technical decision**: DynamoDB TTL set to 7 years, not "forever"
   - **Rationale**: GDPR "right to be forgotten" vs SOX retention conflict resolved by legal team (SOX wins for financial records)

---

## Quick Start: Using This Example

### Prerequisites
1. Install Kiro and enable hooks
2. Install gitleaks: `brew install gitleaks` (macOS) or download from [releases](https://github.com/gitleaks/gitleaks/releases)
3. AWS account with permission to create Lambda, DynamoDB, Secrets Manager, KMS resources
4. Stripe account (test mode sufficient for demo)

### Run This Example

1. **Clone and install**:
   ```bash
   cd examples/payment-processor
   npm install
   ```

2. **Configure environment**:
   ```bash
   # Create AWS Secrets Manager secret
   aws secretsmanager create-secret \
     --name payment-processor/stripe-api-key \
     --secret-string "sk_test_YOUR_STRIPE_TEST_KEY"
   ```

3. **Deploy infrastructure**:
   ```bash
   cd infra
   npm install
   npm run cdk deploy
   ```

4. **Run tests**:
   ```bash
   cd ..
   npm test  # Unit tests
   npm run test:integration  # Integration tests with Stripe test mode
   ```

5. **Test security hooks**:
   ```bash
   # This should be blocked by scan-secrets.json:
   echo "const stripe = new Stripe('sk_live_fake123');" >> src/test.ts
   # Save file in IDE → gitleaks detects secret → context blocked
   ```

### Validation Steps

1. **Secret scanning works**:
   - Add fake Stripe key to any source file
   - Save file → hook should block within 1 second
   - Output should show "⚠️ Secrets detected - Context blocked"

2. **IAM validation works**:
   - Add wildcard IAM policy to CDK code
   - Attempt to modify the file → `validate-iam.json` hook should flag the violation before change is applied
   - Output should suggest least-privilege alternative

3. **Payment processing works**:
   - Use Stripe test card `4242 4242 4242 4242`
   - POST to `/api/payments` with test token
   - Should return 200 with payment record

---

## Reference Documentation

### Related Toolkit Artifacts
- `toolkit/hooks/security/scan-secrets.json` - Full documentation and customization guide
- `toolkit/hooks/security/validate-iam.json` - IAM validation patterns
- `toolkit/steering/security-rules.md` - Security constraints for all AI-generated code
- `toolkit/steering/code-standards.md` - Coding patterns including error handling
- `toolkit/steering/excluded-paths.yaml` - Sensitive file exclusion patterns (config)

### External References
- [PCI DSS Quick Reference Guide](https://www.pcisecuritystandards.org/documents/PCI_DSS_Quick_Reference_Guide.pdf)
- [Stripe API Documentation](https://stripe.com/docs/api)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [Gitleaks Configuration](https://github.com/gitleaks/gitleaks#configuration)

### Support
- Questions: #kiro-toolbox Slack channel
- Security issues: security@example.com
- Stripe integration: #payments-team Slack channel
