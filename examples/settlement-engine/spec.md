# Settlement Engine Service Specification

> **Example Project**: Demonstrates regulatory compliance, deployment windows, change authorization, and audit trail requirements for financial services
> 
> **Primary Concerns Addressed**: 
> - FSI Regulatory Complexity (Concern #9)
> - Security & Compliance (Concern #1)
> - Knowledge Loss (Concern #10)
> 
> **Toolkit Artifacts Demonstrated**:
> - `toolkit/hooks/deployment/deployment-window.json` - Time-based deployment restrictions
> - `toolkit/hooks/deployment/require-approvals.json` - Change authorization validation
> - `toolkit/hooks/security/validate-iam.json` - IAM policy validation
> - `toolkit/steering/security-rules.md` - Security constraints for all AI-generated code
> - `toolkit/specs/golden/logging-standard.spec.md` - Audit trail logging

---

## Intent

A financial settlement processing engine that reconciles and settles payment transactions between counterparties while maintaining strict regulatory compliance with OCC/FDIC/Federal Reserve/SEC requirements, enforcing deployment windows outside market hours, and generating comprehensive audit trails for SOX Section 404 compliance.

**Why it exists**: Demonstrates how Kiro's regulatory compliance tooling enables financial services teams to deploy with confidence while satisfying change advisory board (CAB) requirements, time-based deployment restrictions, and audit trail mandates without manual coordination overhead.

---

## Contracts

### API Endpoints

#### POST /api/settlements/initiate
Initiate a settlement batch for a specified settlement period.

**Request**:
```typescript
{
  "settlementPeriod": string,       // ISO date (e.g., "2024-01-15")
  "cutoffTime": string,             // ISO 8601 timestamp (e.g., "2024-01-15T17:00:00Z")
  "counterparties": string[],       // Array of counterparty IDs
  "settlementType": "net" | "gross", // Net vs gross settlement
  "currency": string,               // ISO currency code (e.g., "USD")
  "initiatedBy": string,            // User ID of authorized initiator
  "approvalTicket": string          // CAB approval ticket reference (e.g., "CHG0001234")
}
```

**Response (Success - 202 Accepted)**:
```typescript
{
  "settlementBatchId": string,      // UUID for this settlement batch
  "status": "pending" | "processing" | "calculated",
  "settlementPeriod": string,
  "totalTransactions": number,
  "estimatedCompletionTime": string, // ISO 8601 timestamp
  "auditTrailId": string,           // Reference to audit log entry
  "createdAt": string               // ISO 8601 timestamp
}
```

**Response (Error - 400 Bad Request)**:
```typescript
{
  "error": {
    "code": string,                 // Error code (e.g., "invalid_settlement_window", "missing_approval")
    "message": string,              // User-friendly error message
    "details": {
      "field": string,              // Field that caused the error
      "constraint": string          // Constraint that was violated
    }
  }
}
```

#### GET /api/settlements/:settlementBatchId
Retrieve settlement batch details and current status.

**Response (Success - 200 OK)**:
```typescript
{
  "settlementBatchId": string,
  "status": "pending" | "processing" | "calculated" | "approved" | "settled" | "failed" | "rolled_back",
  "settlementPeriod": string,
  "counterparties": Array<{
    "counterpartyId": string,
    "netPosition": number,          // Positive = owed to them, negative = they owe
    "currency": string,
    "transactionCount": number,
    "calculatedAt": string
  }>,
  "totals": {
    "debitTotal": number,
    "creditTotal": number,
    "netTotal": number,
    "transactionCount": number
  },
  "timeline": Array<{
    "status": string,
    "timestamp": string,
    "performedBy": string,
    "approvalReference": string     // CAB ticket or emergency override reference
  }>,
  "auditTrail": string,             // S3 location of detailed audit log
  "createdAt": string,
  "updatedAt": string
}
```

#### POST /api/settlements/:settlementBatchId/approve
Approve a calculated settlement batch for execution.

**Request**:
```typescript
{
  "approvedBy": string,             // User ID of authorized approver
  "approvalTicket": string,         // CAB approval ticket reference
  "comments": string,               // Optional approval comments
  "scheduledExecutionTime": string  // ISO 8601 timestamp (must be in allowed window)
}
```

**Response (Success - 200 OK)**:
```typescript
{
  "settlementBatchId": string,
  "status": "approved",
  "scheduledExecutionTime": string,
  "approvalAuditId": string,
  "approvedAt": string
}
```

#### POST /api/settlements/:settlementBatchId/execute
Execute an approved settlement batch (moves funds).

**Request**:
```typescript
{
  "executedBy": string,             // User ID of authorized executor
  "executionTicket": string,        // Execution authorization reference
  "force": boolean                  // Emergency override flag (requires additional approval)
}
```

**Response (Success - 200 OK)**:
```typescript
{
  "settlementBatchId": string,
  "status": "settled",
  "executionResults": Array<{
    "counterpartyId": string,
    "success": boolean,
    "transactionId": string,        // External payment rail transaction ID
    "error": string                 // Present only if success = false
  }>,
  "executedAt": string,
  "auditTrailId": string
}
```

#### POST /api/settlements/:settlementBatchId/rollback
Rollback a settled batch (emergency use only).

**Request**:
```typescript
{
  "rolledBackBy": string,           // User ID of authorized person
  "rollbackTicket": string,         // Emergency approval ticket
  "reason": string,                 // Mandatory rollback justification
  "reversalMethod": "same_day_ach" | "wire" | "manual"
}
```

**Response (Success - 200 OK)**:
```typescript
{
  "settlementBatchId": string,
  "status": "rolled_back",
  "reversalBatchId": string,        // New batch ID for reversal transactions
  "rolledBackAt": string,
  "auditTrailId": string
}
```

### Step Functions Workflow

**State Machine**: `SettlementWorkflow`

```
START
  ↓
[Calculate Net Positions]
  ↓
[Persist Results to DynamoDB]
  ↓
[Generate Audit Log]
  ↓
[Wait for Approval] ← Human approval step
  ↓
[Validate Execution Window] ← Check if current time in allowed window
  ↓
[Execute Payments] ← Fan-out to counterparties
  ↓
[Record Settlement] ← Update DynamoDB with execution results
  ↓
[Generate Compliance Report]
  ↓
END
```

### DynamoDB Schema

**Table**: `SettlementBatches`

```typescript
{
  "settlementBatchId": string,      // Partition key (UUID)
  "settlementPeriod": string,       // Sort key (ISO date, allows querying by period)
  "status": string,                 // Workflow status
  "settlementType": string,
  "currency": string,
  "counterparties": Array<object>,
  "totals": object,
  "timeline": Array<object>,        // All state transitions with timestamps and actors
  "approvals": Array<{
    "approvedBy": string,
    "approvalTicket": string,
    "approvedAt": string,
    "ipAddress": string             // For audit trail
  }>,
  "auditTrailS3Key": string,        // S3 location of detailed audit log
  "createdAt": string,
  "updatedAt": string,
  "ttl": number                     // Auto-delete after 10 years (SOX + 3 years)
}
```


**Table**: `TransactionLedger`

```typescript
{
  "transactionId": string,          // Partition key (UUID)
  "settlementBatchId": string,      // GSI partition key (allows querying all txns in batch)
  "transactionDate": string,        // ISO date
  "counterpartyFrom": string,
  "counterpartyTo": string,
  "amount": number,
  "currency": string,
  "status": "pending" | "settled" | "reversed",
  "settlementDate": string,         // When it was settled
  "auditTrailS3Key": string,
  "createdAt": string,
  "ttl": number                     // 10-year retention
}
```

### S3 Audit Trail Schema

**Bucket**: `settlement-audit-logs`

**Key Pattern**: `{year}/{month}/{day}/{settlementBatchId}/audit-{timestamp}.json`

```json
{
  "settlementBatchId": "uuid-here",
  "auditEventType": "settlement_initiated" | "calculation_completed" | "approval_granted" | "settlement_executed" | "rollback_performed",
  "timestamp": "2024-01-15T14:32:45.123Z",
  "actor": {
    "userId": "user123",
    "ipAddress": "10.0.1.45",
    "userAgent": "Mozilla/5.0...",
    "authMethod": "SSO"
  },
  "action": {
    "operation": "POST /api/settlements/initiate",
    "requestPayload": { /* sanitized request */ },
    "responseStatus": 202,
    "responsePayload": { /* sanitized response */ }
  },
  "authorization": {
    "approvalTicket": "CHG0001234",
    "approvedBy": ["user456", "user789"],
    "approvalTimestamps": ["2024-01-15T13:00:00Z", "2024-01-15T13:15:00Z"]
  },
  "systemState": {
    "deploymentVersion": "v1.2.3",
    "environment": "production",
    "region": "us-east-1"
  }
}
```

---

## Constraints

### Regulatory Constraints

#### 1. Deployment Window Enforcement
**Requirement**: No deployments to production during market hours (9:30 AM - 4:00 PM ET, Monday-Friday) or 24 hours before Federal Reserve settlement deadlines.

**Validation**: 
- ✓ Automated by `deployment-window.json` hook before deployment
- ✓ Hook checks current time against allowed windows
- ✓ Deployments outside window are queued for next allowed time
- ✓ Emergency override requires VP+ approval + documented justification

**Allowed Deployment Windows**:
- **Weekdays**: 6:00 PM ET - 8:00 AM ET
- **Weekends**: All day Saturday and Sunday
- **Blackout periods**: None during month-end close (last business day of month)

**Implementation**:
```typescript
// deployment-window.json validates this before deployment
const isAllowedWindow = () => {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  const isNighttime = hour < 8 || hour >= 18;
  const isMonthEnd = isLastBusinessDay(now);
  
  return (isWeekend || isNighttime) && !isMonthEnd;
};

// ✗ WRONG: Deploy at 2:00 PM ET on Wednesday (blocked by deployment-window.json)
// Deployment queued for 6:00 PM ET same day
```

#### 2. Change Authorization Requirements
**Requirement**: All production changes require CAB (Change Advisory Board) approval ticket before deployment.

**Validation**: 
- ✓ Automated by `require-approvals.json` hook
- ✓ Spec changes checked for approval metadata in commit message or PR description
- ✓ Deployment blocked if approval ticket missing or invalid
- ✓ Approval ticket format: `CHG` followed by 7 digits (e.g., `CHG0001234`)

**Implementation**:
```typescript
// require-approvals.json checks commit message for approval ticket
// Example commit message that passes validation:
// "feat: Add settlement batch rollback API [CHG0001234]"

// ✗ WRONG: No approval ticket (blocked by require-approvals.json)
// "feat: Add settlement batch rollback API"

// ✓ CORRECT: Approval ticket present
// "feat: Add settlement batch rollback API [CHG0001234]"
```

#### 3. Audit Trail Completeness
**Requirement**: Every settlement action (initiate, approve, execute, rollback) must generate an immutable audit log entry stored in S3 with 10-year retention.

**Validation**: 
- ✓ Unit tests verify audit log creation for each API operation
- ✓ Integration tests verify S3 write success
- ✓ Audit logs include: timestamp, actor identity, IP address, action, request/response payloads (sanitized), authorization reference

**Implementation**:
```typescript
// ✓ CORRECT: Audit log before and after critical operations
async function executeSettlement(batchId: string, executedBy: string) {
  await auditLog.record({
    eventType: 'settlement_execution_initiated',
    batchId,
    actor: { userId: executedBy, ipAddress: req.ip },
    timestamp: new Date().toISOString()
  });
  
  const result = await performSettlement(batchId);
  
  await auditLog.record({
    eventType: 'settlement_execution_completed',
    batchId,
    result,
    timestamp: new Date().toISOString()
  });
  
  return result;
}

// ✗ WRONG: No audit log (caught by unit tests)
// async function executeSettlement(batchId: string) {
//   return await performSettlement(batchId);
// }
```


#### 4. SOX Section 404 Compliance
**Requirement**: Internal controls over financial reporting must be documented and tested. Settlement system must demonstrate:
- Segregation of duties (initiator ≠ approver ≠ executor)
- Audit trail traceability (every action traceable to authorized person)
- Change management controls (no unauthorized production changes)

**Validation**: 
- ✓ API enforces role-based access control (RBAC) - different IAM roles for initiate/approve/execute
- ✓ Audit logs include actor identity for all operations
- ✓ deployment-window.yaml + require-approvals.yaml enforce change management

**Implementation**:
```typescript
// ✓ CORRECT: Segregation of duties enforced by IAM policies
const initiatorRole = new Role(this, 'SettlementInitiator', {
  assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
  managedPolicies: [
    new ManagedPolicy(this, 'InitiatorPolicy', {
      statements: [
        new PolicyStatement({
          actions: ['dynamodb:PutItem'],
          resources: [settlementTable.tableArn],
          conditions: {
            'ForAllValues:StringEquals': {
              'dynamodb:LeadingKeys': ['pending']  // Can only create pending settlements
            }
          }
        })
      ]
    })
  ]
});

const approverRole = new Role(this, 'SettlementApprover', {
  // Different role - cannot initiate, can only approve
  actions: ['dynamodb:UpdateItem'],  // Can update to 'approved' status
  conditions: { 'ForAllValues:StringEquals': { 'dynamodb:LeadingKeys': ['pending', 'approved'] } }
});

// ✗ WRONG: Single role can both initiate and approve (SOX violation)
// const adminRole = new Role(this, 'SettlementAdmin', {
//   actions: ['dynamodb:*'],
//   resources: ['*']
// });
```

#### 5. Data Residency and Sovereignty
**Requirement**: All settlement data must remain in `us-east-1` (FDIC-approved region). No data replication to non-US regions.

**Validation**: 
- ✓ Enforced by `region-config.yaml` steering rule
- ✓ DynamoDB table created only in us-east-1
- ✓ S3 bucket configured with us-east-1 constraint
- ✓ No cross-region replication enabled

**Implementation**:
```yaml
# toolkit/steering/region-config.yaml
bedrock_config:
  allowed_regions:
    - us-east-1  # Only FDIC-approved region for financial data

# CDK infrastructure
const settlementTable = new Table(this, 'SettlementBatches', {
  tableName: 'SettlementBatches',
  partitionKey: { name: 'settlementBatchId', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  pointInTimeRecovery: true,  // Required for disaster recovery
  // No replicationRegions - us-east-1 only
});

// ✗ WRONG: Cross-region replication (violates data residency)
// replicationRegions: ['eu-west-1']
```

### Performance Constraints

#### 6. Settlement Calculation Performance
- **P50**: < 5 seconds for batch calculation (up to 10,000 transactions)
- **P99**: < 30 seconds for batch calculation
- **Throughput**: 100 settlement batches per hour sustained

**Validation**: 
- ✓ Load testing with 10,000-transaction batches
- ✓ CloudWatch metrics for calculation duration


#### 7. Audit Log Write Performance
- **Latency**: Audit log write must not block settlement processing (async writes)
- **Durability**: Audit logs must be written to S3 with 99.999999999% durability
- **Retention**: 10-year retention enforced by S3 lifecycle policy

**Validation**: 
- ✓ Audit logs written asynchronously via SQS + Lambda
- ✓ Settlement API returns success before audit log write completes
- ✓ DLQ configured for failed audit log writes (manual investigation required)

### Security Constraints

#### 8. IAM Least Privilege
**Requirement**: No wildcard IAM permissions. All service-to-service calls use specific resource ARNs.

**Validation**: 
- ✓ Automated by `validate-iam.json` hook
- ✓ CDK synthesis fails if wildcard detected

**Implementation**:
```typescript
// ✓ CORRECT: Specific resource ARNs
calculationLambda.addToPolicy(new PolicyStatement({
  actions: ['dynamodb:Query', 'dynamodb:GetItem'],
  resources: [
    settlementTable.tableArn,
    `${settlementTable.tableArn}/index/by-period`
  ]
}));

// ✗ WRONG: Wildcard (blocked by validate-iam.json)
// calculationLambda.addToPolicy(new PolicyStatement({
//   actions: ['dynamodb:*'],
//   resources: ['*']
// }));
```

#### 9. Encryption at Rest and in Transit
**Requirement**: All data encrypted at rest (DynamoDB, S3) and in transit (TLS 1.2+).

**Validation**: 
- ✓ DynamoDB table configured with AWS-managed encryption
- ✓ S3 bucket configured with AES-256 encryption
- ✓ API Gateway enforces TLS 1.2 minimum

#### 10. Multi-Factor Authentication (MFA) for Emergency Overrides
**Requirement**: Emergency deployment outside allowed window requires MFA-authenticated approval.

**Validation**: 
- ✓ deployment-window.json checks for MFA session tag in emergency override requests
- ✓ IAM policy requires MFA for emergency override role assumption

### Integration Constraints

#### 11. Payment Rail Integration
**Requirement**: Settlement execution integrates with ACH/Fedwire payment rails. Must support idempotency (retry-safe).

**Validation**: 
- ✓ Integration tests with payment rail sandbox
- ✓ Idempotency keys based on settlementBatchId + counterpartyId

#### 12. Reconciliation System Integration
**Requirement**: Settlement results pushed to reconciliation system via EventBridge.

**Validation**: 
- ✓ EventBridge event published on settlement completion
- ✓ Event schema versioned and validated

---

## Design Decisions (and why)

### 1. Step Functions vs Lambda Orchestration
**Decision**: Use AWS Step Functions for settlement workflow orchestration instead of Lambda-based state management.

**Rationale**:
- **Audit Trail Built-in**: Step Functions execution history provides automatic audit trail of all state transitions
- **Human Approval Steps**: Native support for callback tasks (wait for CAB approval)
- **Retry Logic**: Built-in exponential backoff for transient failures
- **Visibility**: CloudWatch integration shows workflow progress in real-time
- **Compliance**: Execution history retained for 90 days (extends to S3 for long-term retention)


**Trade-offs**:
- Step Functions costs ($25 per million transitions) vs Lambda orchestration ($0.20 per million invocations)
- Less flexible than code-based orchestration
- **Decision**: Compliance and audit requirements justify cost premium

### 2. DynamoDB vs Relational Database for Settlement Records
**Decision**: Use DynamoDB for settlement records instead of RDS/Aurora.

**Rationale**:
- **Built-in TTL**: Native support for 10-year auto-deletion (SOX retention requirement)
- **Point-in-Time Recovery**: Continuous backups for disaster recovery (FDIC requirement)
- **Single-Digit Millisecond Latency**: Consistent performance for settlement queries
- **No Schema Migrations**: Settlement schema changes don't require downtime
- **On-Demand Capacity**: Auto-scales during month-end settlement spikes

**Trade-offs**:
- No ACID transactions across multiple settlement batches
- Limited query flexibility (need to plan access patterns: by settlementBatchId, by settlementPeriod)
- **Decision**: Access patterns are predictable, single-batch atomicity sufficient

### 3. Asynchronous Audit Logging vs Synchronous
**Decision**: Write audit logs asynchronously (SQS + Lambda) instead of blocking API response on S3 write.

**Rationale**:
- **Performance**: API response time not impacted by S3 latency (P99 remains <100ms)
- **Availability**: Settlement processing continues even if audit log write temporarily fails
- **Durability**: SQS DLQ ensures no audit logs are lost (manual investigation for DLQ items)
- **Scalability**: Audit log writes fan out independently of settlement API throughput

**Trade-offs**:
- Eventual consistency (audit log appears in S3 within 5 seconds, not instantly)
- Additional complexity (SQS + Lambda + DLQ monitoring)
- **Decision**: Performance and availability benefits outweigh complexity for financial systems

### 4. Deployment Window Enforcement at Hook Level vs Runtime
**Decision**: Enforce deployment windows at Kiro hook level (pre-deployment) instead of runtime checks in code.

**Rationale**:
- **Shift-Left Security**: Catch invalid deployments before infrastructure changes applied
- **Developer Experience**: Immediate feedback ("Deployment queued for 6:00 PM") vs failed deployment
- **Audit Trail**: Hook execution logged, shows who attempted deployment and when
- **Zero Deployment Downtime**: No need to deploy code to change deployment windows (update hook config only)

**Hook Format (v2 JSON)**:
```json
{
  "version": "v1",
  "hooks": [{
    "name": "deployment-window-validation",
    "trigger": "PreToolUse",
    "matcher": "execute_bash",
    "action": {
      "type": "command",
      "command": "HOUR=$(date +%H); DAY=$(date +%u); if [ $DAY -ge 1 ] && [ $DAY -le 5 ] && [ $HOUR -ge 9 ] && [ $HOUR -lt 16 ]; then echo '⚠️ Deployment blocked: Market hours (9:30 AM - 4:00 PM ET). Queued for 6:00 PM ET.'; exit 2; fi"
    }
  }]
}
```

**Trade-offs**:
- Requires Kiro adoption (cannot enforce via code alone)
- Developers must understand hook behavior
- **Decision**: Regulatory compliance mandate justifies tooling requirement

### 5. Segregation of Duties via IAM Roles vs Application Logic
**Decision**: Enforce segregation of duties using IAM roles instead of application-level RBAC.

**Rationale**:
- **Immutable Audit Trail**: IAM CloudTrail logs show who assumed which role (cannot be tampered with)
- **AWS-Native Compliance**: Satisfies AWS Well-Architected Framework security pillar
- **Zero Trust**: No application code can bypass IAM policies
- **MFA Integration**: IAM supports MFA requirement for emergency overrides

**Trade-offs**:
- More IAM roles to manage (3 roles: initiator, approver, executor vs 1 application admin role)
- Steeper learning curve for ops team
- **Decision**: SOX Section 404 requirement for immutable segregation of duties justifies complexity


### 6. S3 for Audit Logs vs CloudWatch Logs
**Decision**: Store detailed audit trails in S3 instead of relying solely on CloudWatch Logs.

**Rationale**:
- **Cost**: S3 storage ($0.023/GB/month) vs CloudWatch Logs ($0.50/GB/month) - 95% cost savings
- **Retention**: S3 supports 10-year lifecycle policies natively (CloudWatch Logs max retention is 10 years but more expensive)
- **Immutability**: S3 Object Lock provides WORM (Write Once Read Many) compliance for audit logs
- **Query Performance**: Athena for ad-hoc queries on S3 audit logs (vs CloudWatch Insights)

**Trade-offs**:
- Real-time log streaming less convenient (CloudWatch Logs Insights immediate, Athena requires Glue crawler)
- Additional infrastructure (S3 bucket, lifecycle policies, Glue catalog)
- **Decision**: Long-term cost and immutability requirements favor S3

### 7. Net Settlement vs Gross Settlement Default
**Decision**: Support both net and gross settlement, but default to net settlement for operational efficiency.

**Rationale**:
- **Net Settlement Efficiency**: Reduces payment volume by 70-90% (10 transactions between 2 parties → 1 net payment)
- **ACH Fee Savings**: Fewer payment rail transactions = lower fees
- **Reconciliation Simplicity**: Single net payment per counterparty per period easier to reconcile

**Trade-offs**:
- Net settlement introduces credit risk (one party defaults before net payment settles)
- Gross settlement provides immediate finality per transaction
- **Decision**: Credit risk mitigation (counterparty limits, collateral requirements) managed outside settlement engine

---

## Test Expectations

### Positive Cases (✓ must pass)

1. **✓ Settlement Batch Initiation**
   - Given: Valid settlement period, counterparties, CAB approval ticket
   - When: POST /api/settlements/initiate
   - Then: Returns 202 with settlementBatchId, batch status = "pending", audit log created in S3

2. **✓ Net Position Calculation**
   - Given: Settlement batch with 100 transactions between 5 counterparties
   - When: Step Functions executes calculation task
   - Then: Net positions calculated correctly, totals.netTotal = 0 (debits = credits), batch status = "calculated"

3. **✓ Settlement Approval**
   - Given: Calculated settlement batch, authorized approver, valid CAB ticket
   - When: POST /api/settlements/:id/approve
   - Then: Returns 200, batch status = "approved", approval recorded in audit log

4. **✓ Settlement Execution in Allowed Window**
   - Given: Approved settlement batch, current time = 7:00 PM ET (allowed window)
   - When: POST /api/settlements/:id/execute
   - Then: Returns 200, payments sent to payment rail, batch status = "settled", audit log updated

5. **✓ Idempotent Execution**
   - Given: Already-settled batch
   - When: POST /api/settlements/:id/execute (2nd request)
   - Then: Returns 200 with same execution results, no duplicate payments sent

6. **✓ Deployment Window Validation Hook**
   - Given: Attempted deployment at 2:00 PM ET on Wednesday (market hours)
   - When: deployment-window.json hook executes
   - Then: Deployment blocked, message: "Deployment queued for 6:00 PM ET (next allowed window)"

7. **✓ Approval Ticket Validation Hook**
   - Given: Commit message with valid CAB ticket format: "[CHG0001234]"
   - When: require-approvals.json hook executes
   - Then: Validation passes, deployment proceeds


### Negative Cases (✗ must be rejected)

1. **✗ Settlement Without CAB Approval**
   - Given: Settlement initiation request without approvalTicket field
   - When: POST /api/settlements/initiate
   - Then: Returns 400 with error `{ "code": "missing_approval", "message": "CAB approval ticket required" }`

2. **✗ Execution During Market Hours**
   - Given: Approved settlement batch, current time = 2:00 PM ET (market hours)
   - When: POST /api/settlements/:id/execute
   - Then: Returns 400 with error `{ "code": "invalid_execution_window", "message": "Settlement execution not allowed during market hours (9:30 AM - 4:00 PM ET)" }`

3. **✗ Deployment Without Approval Ticket**
   - Given: Commit message without CAB ticket: "feat: Add new API endpoint"
   - When: require-approvals.json hook executes
   - Then: Deployment blocked, error: "CAB approval ticket required. Format: [CHG1234567]"

4. **✗ Deployment During Market Hours**
   - Given: Attempted deployment at 10:00 AM ET on Tuesday
   - When: deployment-window.json hook executes
   - Then: Deployment blocked, error: "Deployments not allowed during market hours. Next window: 6:00 PM ET"

5. **✗ Unapproved Settlement Execution**
   - Given: Settlement batch in "calculated" status (not yet approved)
   - When: POST /api/settlements/:id/execute
   - Then: Returns 400 with error `{ "code": "approval_required", "message": "Settlement batch must be approved before execution" }`

6. **✗ Unauthorized Approver**
   - Given: Settlement approval request by user without "approver" IAM role
   - When: POST /api/settlements/:id/approve
   - Then: Returns 403 with error `{ "code": "unauthorized", "message": "User lacks settlement approval permissions" }`

7. **✗ Same User Initiate and Approve (SOX Violation)**
   - Given: Settlement initiated by user123
   - When: POST /api/settlements/:id/approve by user123
   - Then: Returns 403 with error `{ "code": "segregation_of_duties_violation", "message": "Approver must be different from initiator" }`

8. **✗ Invalid CAB Ticket Format**
   - Given: Commit message with malformed ticket: "[CHG123]" (too short)
   - When: require-approvals.json hook executes
   - Then: Deployment blocked, error: "Invalid CAB ticket format. Expected: CHG followed by 7 digits"

### Edge Cases (must be handled)

1. **⚠ Payment Rail Partial Failure**
   - Given: Settlement execution to 5 counterparties, 1 payment fails (network timeout)
   - When: Step Functions executes payment task
   - Then: Successful payments marked "settled", failed payment marked "pending_retry", retry scheduled for 15 minutes

2. **⚠ Month-End Settlement Spike**
   - Given: 500 settlement batches submitted on last business day of month
   - When: DynamoDB throughput demand exceeds baseline
   - Then: On-demand capacity auto-scales, all batches processed without throttling, latency P99 < 30s

3. **⚠ Audit Log Write Failure**
   - Given: S3 bucket temporarily unavailable (AWS service event)
   - When: Audit log Lambda attempts to write to S3
   - Then: Message sent to DLQ, CloudWatch alarm triggered, settlement processing continues, ops team investigates DLQ

4. **⚠ Emergency Rollback During Market Hours**
   - Given: Settled batch discovered to have calculation error during market hours (11:00 AM ET)
   - When: Emergency rollback requested with VP approval
   - Then: deployment-window.json allows override with MFA + VP approval, rollback executes, all counterparties notified

5. **⚠ Concurrent Approval Attempts**
   - Given: Two approvers attempt to approve same settlement batch simultaneously
   - When: Both POST /api/settlements/:id/approve
   - Then: DynamoDB conditional write ensures only one approval succeeds, second request returns 409 Conflict

---

## Rollback Plan

### Trigger Conditions
Rollback if any of the following occur within 2 hours of deployment:

1. **Settlement failure rate > 1%** (monitored via CloudWatch metric `SettlementFailureRate`)
2. **Audit log write failure rate > 5%** (monitored via SQS DLQ depth)
3. **Step Functions execution failure rate > 2%** (monitored via CloudWatch metric `WorkflowExecutionErrors`)
4. **IAM policy misconfiguration** (unauthorized access detected in CloudTrail logs)
5. **Data residency violation** (DynamoDB or S3 access from non-us-east-1 region)

### Rollback Procedure

#### Phase 1: Immediate Actions (0-5 minutes)

1. **Freeze New Settlements**:
   ```bash
   # Update Lambda environment variable to reject new settlement initiations
   aws lambda update-function-configuration \
     --function-name settlement-initiate \
     --environment Variables="{ACCEPT_NEW_SETTLEMENTS=false}"
   ```
   
2. **Revert Lambda Functions**:
   ```bash
   # Revert all Lambda functions to previous version
   for func in settlement-initiate settlement-calculate settlement-approve settlement-execute; do
     aws lambda update-alias \
       --function-name $func \
       --name production \
       --function-version $(aws lambda list-versions-by-function \
         --function-name $func \
         --query 'Versions[-2].Version' --output text)
   done
   ```

3. **Revert Step Functions State Machine**:
   ```bash
   # Update state machine definition to previous version
   aws stepfunctions update-state-machine \
     --state-machine-arn arn:aws:states:us-east-1:123456789012:stateMachine:SettlementWorkflow \
     --definition file://previous-workflow-definition.json
   ```

#### Phase 2: Database Rollback (5-15 minutes)

**DynamoDB Schema Changes** (only if schema changed in deployment):
1. If additive schema changes (new fields): No rollback required (backward compatible)
2. If breaking schema changes (removed fields, changed types):
   ```bash
   # Restore table from point-in-time backup
   aws dynamodb restore-table-to-point-in-time \
     --source-table-name SettlementBatches \
     --target-table-name SettlementBatches-restored \
     --restore-date-time $(date -u -d '2 hours ago' '+%Y-%m-%dT%H:%M:%SZ')
   ```
   
3. Update application to point to restored table (via environment variable)

#### Phase 3: In-Flight Settlement Handling (15-30 minutes)

1. **Identify In-Flight Settlements**:
   ```bash
   # Query settlements in non-terminal states
   aws dynamodb query \
     --table-name SettlementBatches \
     --index-name status-index \
     --key-condition-expression "status IN (:pending, :processing, :calculated, :approved)"
   ```

2. **Manual Intervention**:
   - Settlements in "pending" or "calculated" status: Cancel (mark as "rolled_back")
   - Settlements in "processing" or "approved" status: Allow to complete on old version
   - Settlements in "settled" status: No action (already completed)

3. **Notify Stakeholders**:
   ```bash
   # Send SNS notification to operations team
   aws sns publish \
     --topic-arn arn:aws:sns:us-east-1:123456789012:settlement-ops \
     --subject "Settlement Engine Rollback - Manual Review Required" \
     --message "Rollback completed. ${IN_FLIGHT_COUNT} settlements require manual review."
   ```

#### Phase 4: Verification (30-45 minutes)

1. **Smoke Tests**:
   ```bash
   # Run settlement smoke test suite against rolled-back version
   npm run test:smoke:production
   ```
   Expected results:
   - ✓ Settlement initiation succeeds (returns 202)
   - ✓ Net position calculation accurate (totals balance)
   - ✓ Approval flow functional
   - ✓ Audit logs written to S3

2. **Metrics Verification**:
   - Settlement failure rate < 0.5%
   - Step Functions execution success rate > 98%
   - Audit log write success rate > 99%
   - P99 latency < 30 seconds

3. **Audit Trail Verification**:
   ```bash
   # Verify rollback recorded in audit log
   aws s3 ls s3://settlement-audit-logs/$(date +%Y/%m/%d)/ | grep rollback
   ```

#### Phase 5: Re-enable New Settlements (45-60 minutes)

1. **Gradual Traffic Increase**:
   ```bash
   # Re-enable new settlements with rate limiting
   aws lambda update-function-configuration \
     --function-name settlement-initiate \
     --environment Variables="{ACCEPT_NEW_SETTLEMENTS=true,RATE_LIMIT_PER_MINUTE=10}"
   ```

2. **Monitor for 30 Minutes**:
   - Watch CloudWatch metrics for anomalies
   - Check audit log write success rate
   - Verify no IAM access errors in CloudTrail

3. **Remove Rate Limit**:
   ```bash
   # Restore normal throughput
   aws lambda update-function-configuration \
     --function-name settlement-initiate \
     --environment Variables="{ACCEPT_NEW_SETTLEMENTS=true,RATE_LIMIT_PER_MINUTE=100}"
   ```

#### Phase 6: Postmortem (within 24 hours)

1. **Root Cause Analysis**:
   - Review CloudWatch logs for error patterns
   - Examine audit trail for unexpected state transitions
   - Check Step Functions execution history for failure points

2. **Update Spec**:
   - Document root cause in "Lessons Learned" section
   - Add new constraint or test case to prevent recurrence
   - Update rollback plan if gaps identified

3. **Compliance Reporting**:
   - Generate SOX compliance report showing rollback was authorized and audited
   - File with compliance team within 48 hours

### Time Target
**Complete rollback within 1 hour** of decision to rollback (Phases 1-5).

### Rollback Testing
- **Frequency**: Quarterly rollback drill during allowed deployment window (Saturday morning)
- **Scope**: Full rollback including in-flight settlement handling
- **Success Criteria**: Complete within 1-hour target, all smoke tests pass, zero data loss

### Emergency Rollback Outside Deployment Window
If rollback required during market hours (e.g., critical security vulnerability):

1. **VP+ Approval Required**: deployment-window.yaml emergency override
2. **MFA Authentication**: Approver must use MFA to assume emergency role
3. **Notification**: Compliance team, CTO, and CISO notified immediately
4. **Expedited Postmortem**: Root cause analysis due within 4 hours (vs standard 24 hours)

---


## Regulatory Hooks Integration

This example demonstrates how Kiro's hook system enforces FSI regulatory requirements automatically, reducing manual oversight and compliance burden.

### Deployment Window Hook

**Hook**: `toolkit/hooks/deployment/deployment-window.yaml`

**Purpose**: Enforces market hours and month-end deployment blackouts without manual scheduling.

**Configuration**:
```yaml
name: deployment-window-fsi
trigger: pre-deployment
enabled: true

config:
  timezone: "America/New_York"
  
  allowed_windows:
    - days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
      start_time: "18:00"  # 6:00 PM ET
      end_time: "08:00"    # 8:00 AM ET (next day)
    
    - days: ["Saturday", "Sunday"]
      start_time: "00:00"
      end_time: "23:59"
  
  blackout_rules:
    - type: "month_end"
      description: "No deployments during month-end close"
      days_before_month_end: 1
      days_after_month_end: 0
  
  emergency_override:
    required_approval_level: "VP"
    mfa_required: true
    notification_channels:
      - "#compliance-alerts"
      - "compliance-team@company.com"


**Integration Points**:
- **Pre-Deployment**: Hook checks current time against allowed windows before applying CDK changes
- **Deployment Queue**: If outside window, deployment queued for next allowed time (developer notified)
- **Emergency Override**: VP approval + MFA required for market hours deployment
- **Audit Trail**: All deployment attempts logged with timestamps, user identity, and approval status

**Example Output**:
```
❌ Deployment blocked: Outside allowed window
Current time: 2024-01-15 14:30:00 ET (Monday)
Reason: Market hours (9:30 AM - 4:00 PM ET)
Next allowed window: 2024-01-15 18:00:00 ET (Today at 6:00 PM)

Options:
  1. Queue deployment for 6:00 PM ET (recommended)
  2. Request emergency override (requires VP approval + MFA)
```

### Change Authorization Hook

**Hook**: `toolkit/hooks/deployment/require-approvals.yaml`

**Purpose**: Validates CAB approval ticket presence before deployment.

**Configuration**:
```yaml
name: require-cab-approval
trigger: pre-deployment
enabled: true

config:
  approval_sources:
    - type: "commit_message"
      pattern: '\[CHG\d{7}\]'
      description: "CAB ticket in commit message"
    
    - type: "pull_request"
      pattern: 'CHG-\d{7}'
      description: "CAB ticket in PR description"
  
  validation:
    ticket_format: "CHG followed by 7 digits"
    api_validation: true  # Optional: Verify ticket exists in CAB system
    api_endpoint: "https://cab.company.com/api/tickets"

  
  exemptions:
    - environment: "dev"
      reason: "Development environment does not require CAB approval"
    - environment: "test"
      reason: "Test environment does not require CAB approval"

**Integration Points**:
- **Git Commit Hook**: Checks commit message for approval ticket before push
- **CI/CD Pipeline**: Validates approval ticket before deployment stage
- **Deployment Blocker**: Prevents deployment if ticket missing or invalid
- **Audit Trail**: Approval ticket linked to deployment in CloudTrail logs

**Example Output**:
```
✅ CAB approval validated
Ticket: CHG0001234
Status: Approved
Approved by: John Doe, Jane Smith
Approved at: 2024-01-15 13:00:00 ET
Deployment window: 2024-01-15 18:00 - 2024-01-16 08:00 ET
```

### IAM Policy Validation Hook

**Hook**: `toolkit/hooks/security/validate-iam.yaml`

**Purpose**: Prevents wildcard IAM permissions and enforces least privilege.

**Configuration**:
```yaml
name: validate-iam-least-privilege
trigger: pre-deployment
enabled: true

config:
  rules:
    - name: "no-wildcard-actions"
      description: "No wildcard (*) in IAM actions"
      severity: "error"
      check: "actions_not_wildcard"
    
    - name: "no-wildcard-resources"
      description: "No wildcard (*) in IAM resources"
      severity: "error"
      check: "resources_not_wildcard"
      exemptions:
        - action: "sts:AssumeRole"  # AssumeRole requires * resource
    
    - name: "specific-resource-arns"
      description: "IAM policies must use specific resource ARNs"
      severity: "warning"
      check: "resources_have_account_id"


**Integration Points**:
- **CDK Synthesis**: Hook runs during `cdk synth` before deployment
- **CloudFormation Template Inspection**: Scans generated IAM policies
- **Deployment Blocker**: Fails synthesis if wildcard permissions detected
- **Developer Feedback**: Shows specific policy violations with remediation guidance

**Example Output**:
```
❌ IAM policy validation failed

Policy: SettlementCalculationLambdaPolicy
Violation: Wildcard resource detected
Resource: arn:aws:dynamodb:*:*:table/*
Recommendation: Use specific table ARN: arn:aws:dynamodb:us-east-1:123456789:table/SettlementBatches

Fix:
  calculationLambda.addToPolicy(new PolicyStatement({
    actions: ['dynamodb:Query'],
-   resources: ['arn:aws:dynamodb:*:*:table/*']
+   resources: [settlementTable.tableArn]
  }));
```

### Regional Data Residency Hook

**Hook**: `toolkit/steering/region-config.yaml`

**Purpose**: Enforces data residency requirements (us-east-1 only for financial data).

**Configuration**:
```yaml
name: enforce-data-residency
enabled: true

config:
  allowed_regions:
    - us-east-1  # Only FDIC-approved region
  
  resource_types:
    - "AWS::DynamoDB::Table"
    - "AWS::S3::Bucket"
    - "AWS::Lambda::Function"
    - "AWS::StepFunctions::StateMachine"
  
  violations:
    cross_region_replication: "error"
    global_tables: "error"
    lambda_in_disallowed_region: "error"


**Integration Points**:
- **CDK Synthesis**: Hook validates all resources created in us-east-1
- **Cross-Region Detection**: Flags any cross-region replication configurations
- **Deployment Blocker**: Prevents deployment if resources in non-approved regions
- **Compliance Report**: Generates region compliance report for auditors

**Example Output**:
```
✅ Data residency validation passed

Resources checked:
  - SettlementBatches DynamoDB table: us-east-1 ✓
  - TransactionLedger DynamoDB table: us-east-1 ✓
  - settlement-audit-logs S3 bucket: us-east-1 ✓
  - All Lambda functions: us-east-1 ✓

Cross-region checks:
  - No DynamoDB global tables ✓
  - No S3 cross-region replication ✓
  - No Lambda functions in other regions ✓
```

---

## Lessons Learned

### Regulatory Constraints Shape Architecture

**Lesson**: Compliance requirements dictated technical decisions more than performance or cost considerations.

**Examples**:
1. **Deployment Window Enforcement**: Business requirement (no market hours deployments) became infrastructure constraint enforced by hooks, not just policy
2. **Segregation of Duties**: SOX Section 404 requirement drove IAM role design (3 roles: initiator/approver/executor) instead of simpler single admin role
3. **Audit Trail Completeness**: 10-year retention requirement influenced data store choice (S3 with Object Lock) over cheaper alternatives
4. **Data Residency**: FDIC approval limited to us-east-1, ruling out multi-region disaster recovery strategies

**Takeaway**: For FSI projects, start with regulatory requirements and work backwards to technical design. Compliance is non-negotiable; performance and cost optimize within those boundaries.

### Hooks Shift Compliance Left

**Lesson**: Enforcing compliance at development/deployment time (hooks) is more effective than runtime checks or manual reviews.

**Benefits**:
- **Immediate Feedback**: Developer knows deployment blocked instantly, not after failed deployment
- **Shift-Left**: Catch violations before infrastructure changes applied (no rollback needed)
- **Audit Trail**: Hook execution logged automatically, showing who attempted what and when
- **Zero Trust**: No application code can bypass hook enforcement

**Challenges**:
- **Developer Onboarding**: Developers must learn hook system in addition to AWS/CDK
- **Hook Maintenance**: Updating deployment windows or approval rules requires hook config changes
- **Emergency Override Process**: Must design escape hatch (VP approval + MFA) for true emergencies

**Takeaway**: Invest in hook tooling early for compliance-heavy projects. Manual review processes don't scale and create audit risk.


### Asynchronous Audit Logging is Essential

**Lesson**: Audit log writes must not block settlement processing, but durability cannot be compromised.

**Implementation**:
- **SQS + Lambda Pattern**: Settlement API publishes audit events to SQS, Lambda writes to S3 asynchronously
- **Dead Letter Queue (DLQ)**: Failed audit writes go to DLQ for manual investigation (alarm triggers)
- **Eventual Consistency**: Audit logs appear in S3 within 5 seconds (acceptable for compliance, not real-time investigations)

**Trade-offs**:
- **Complexity**: Additional infrastructure (SQS, Lambda, DLQ, CloudWatch alarms)
- **Monitoring**: Must monitor DLQ depth and audit log write latency
- **Investigation**: Real-time log queries slightly delayed (use CloudWatch for immediate needs, S3 for long-term audit)

**Takeaway**: Performance and availability requirements in financial systems justify async audit logging complexity. Synchronous S3 writes would add 50-100ms to every API call and introduce S3 dependency.

### Step Functions for Compliance, Not Just Orchestration

**Lesson**: Step Functions execution history provides built-in audit trail and state machine visibility, reducing custom logging code.

**Benefits**:
- **Execution History**: Every state transition logged automatically (who, what, when)
- **Visual Debugging**: State machine diagram shows workflow progress in real-time
- **Retry Logic**: Built-in exponential backoff for transient failures (payment rail timeouts)
- **Human Approval**: Native callback tasks for CAB approval steps

**Trade-offs**:
- **Cost**: $25 per million state transitions (vs $0.20 per million Lambda invocations for custom orchestration)
- **Execution History Retention**: Only 90 days (must export to S3 for 10-year compliance retention)
- **Debugging**: Step Functions errors less transparent than custom Lambda logs

**Takeaway**: For regulated workflows with human approval steps and audit requirements, Step Functions cost premium is justified by compliance benefits and reduced custom code.

### Data Residency is a Hard Constraint

**Lesson**: FDIC/OCC approval for financial data storage is limited to specific AWS regions. Multi-region DR strategies require regulator approval.

**Implications**:
- **us-east-1 Only**: All settlement data (DynamoDB, S3, Lambda) in single region
- **No Cross-Region Replication**: Cannot use DynamoDB global tables or S3 CRR without regulatory approval
- **Disaster Recovery**: Must use point-in-time recovery (PITR) and S3 versioning within us-east-1 instead of multi-region failover
- **Latency**: Global users experience higher latency (no regional endpoints)

**Takeaway**: Confirm data residency requirements with compliance team before architectural decisions. Multi-region architectures may be technically superior but regulatorily infeasible.

### Emergency Override is Critical (But Rare)

**Lesson**: Deployment window enforcement must have an emergency escape hatch for critical security vulnerabilities.

**Design**:
- **VP+ Approval Required**: deployment-window.yaml checks for emergency override flag + VP approval
- **MFA Enforced**: Approver must use MFA to assume emergency role (IAM policy condition)
- **Notification**: Compliance team, CTO, and CISO notified immediately via PagerDuty + email
- **Expedited Postmortem**: Root cause analysis due within 4 hours (vs standard 24 hours)

**Usage**:
- **Frequency**: Designed for 1-2 uses per year (critical zero-day vulnerability, major production incident)
- **Justification**: Every emergency override requires documented justification + postmortem + CAB retroactive approval

**Takeaway**: Design emergency processes assuming they'll never be used, but ensure they work when needed. Test quarterly with drills.


---

## Quick Start: Using This Example

### Prerequisites

1. **AWS Account**: Account in `us-east-1` region with FDIC approval for financial data storage
2. **Kiro Installation**: Kiro CLI installed with hook system enabled
3. **CAB Approval Process**: Access to Change Advisory Board ticketing system
4. **IAM Roles**: Three separate IAM roles configured:
   - `SettlementInitiator` - Can create settlement batches
   - `SettlementApprover` - Can approve settlement batches
   - `SettlementExecutor` - Can execute settlement batches
5. **Payment Rail Access**: Credentials for ACH/Fedwire payment rail sandbox
6. **Compliance Team Contact**: Email/Slack channel for emergency override notifications

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/kiro-cloudeng-devops.git
   cd examples/settlement-engine
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure hooks**:
   ```bash
   # Copy hook configuration to Kiro workspace
   cp -r ../../toolkit/hooks ~/.kiro/hooks/
   cp -r ../../toolkit/steering ~/.kiro/steering/
   
   # Verify hook configuration
   kiro hooks list
   # Should show: deployment-window, require-approvals, validate-iam
   ```

4. **Configure environment**:
   ```bash
   # Copy example environment file
   cp .env.example .env
   
   # Edit .env with your configuration
   vi .env
   ```

   Required environment variables:
   ```bash
   AWS_ACCOUNT_ID=123456789
   AWS_REGION=us-east-1
   PAYMENT_RAIL_ENDPOINT=https://sandbox.paymentrail.com
   PAYMENT_RAIL_API_KEY=your-sandbox-api-key
   AUDIT_LOG_BUCKET=settlement-audit-logs-${AWS_ACCOUNT_ID}
   CAB_API_ENDPOINT=https://cab.company.com/api
   ```

### Running Locally

1. **Deploy infrastructure (development)**:
   ```bash
   # Development environment does not require CAB approval (hook exemption)
   npm run deploy:dev
   ```

2. **Run local API server**:
   ```bash
   npm run start:local
   # API available at http://localhost:3000
   ```

3. **Test settlement flow**:
   ```bash
   # Initiate settlement batch
   curl -X POST http://localhost:3000/api/settlements/initiate \
     -H "Content-Type: application/json" \
     -d '{
       "settlementPeriod": "2024-01-15",
       "cutoffTime": "2024-01-15T17:00:00Z",
       "counterparties": ["CP001", "CP002"],
       "settlementType": "net",
       "currency": "USD",
       "initiatedBy": "user123",
       "approvalTicket": "CHG0001234"
     }'
   
   # Returns: { "settlementBatchId": "uuid-here", "status": "pending" }
   ```

4. **Monitor workflow**:
   ```bash
   # Watch Step Functions execution
   aws stepfunctions list-executions \
     --state-machine-arn arn:aws:states:us-east-1:123456789:stateMachine:SettlementWorkflow
   ```


### Deploying to Production

1. **Create CAB approval ticket**:
   ```bash
   # Create ticket in your CAB system
   # Example ticket: CHG0001234
   # Subject: Deploy Settlement Engine v1.0.0
   # Justification: New feature for automated settlement processing
   # Risk Assessment: Low (new feature, not replacing existing system)
   # Rollback Plan: See spec.md Rollback Plan section
   ```

2. **Commit with approval ticket**:
   ```bash
   git add .
   git commit -m "feat: Deploy settlement engine [CHG0001234]"
   # require-approvals.yaml hook validates ticket format
   ```

3. **Deploy during allowed window**:
   ```bash
   # Attempt deployment (will be queued if outside window)
   npm run deploy:prod
   
   # Example output if outside window:
   # ❌ Deployment blocked: Outside allowed window
   # Current time: 2024-01-15 14:30:00 ET (Monday)
   # Next allowed window: 2024-01-15 18:00:00 ET (Today at 6:00 PM)
   # Deployment queued for 6:00 PM ET
   ```

4. **Verify deployment**:
   ```bash
   # Run smoke tests
   npm run test:smoke:prod
   
   # Check CloudWatch metrics
   aws cloudwatch get-metric-statistics \
     --namespace SettlementEngine \
     --metric-name SettlementFailureRate \
     --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
     --period 300 \
     --statistics Average
   ```

### Validation

Run the test suite to verify the implementation meets all acceptance criteria:

```bash
# Unit tests
npm test

# Integration tests (requires AWS credentials)
npm run test:integration

# Property-based tests
npm run test:property

# Load tests (10,000 transactions per batch)
npm run test:load

# Hook validation tests
npm run test:hooks
```

**Expected Output**:
```
✅ All 47 tests passed
  ✓ Settlement batch initiation
  ✓ Net position calculation
  ✓ Settlement approval
  ✓ Settlement execution in allowed window
  ✓ Deployment window hook validation
  ✓ CAB approval hook validation
  ✓ IAM policy validation
  ✓ Data residency enforcement
```

### Emergency Rollback

If you need to roll back the deployment:

```bash
# Phase 1: Freeze new settlements
aws lambda update-function-configuration \
  --function-name settlement-initiate \
  --environment Variables="{ACCEPT_NEW_SETTLEMENTS=false}"

# Phase 2: Revert Lambda functions
npm run rollback:lambdas

# Phase 3: Revert Step Functions
npm run rollback:stepfunctions

# Phase 4: Monitor in-flight settlements
npm run monitor:inflight

# Full rollback script (runs all phases)
npm run rollback:full
```


---

## Reference Documentation

### Related Toolkit Artifacts

1. **`toolkit/hooks/deployment/deployment-window.yaml`**
   - Enforces time-based deployment restrictions
   - Configurable allowed windows (weekdays 6 PM - 8 AM ET, weekends all day)
   - Month-end blackout period support
   - Emergency override with VP approval + MFA
   - Usage: Automatically runs on `kiro deploy` or `cdk deploy`

2. **`toolkit/hooks/deployment/require-approvals.yaml`**
   - Validates CAB approval ticket presence
   - Supports commit message and PR description patterns
   - Optional API validation (verify ticket exists in CAB system)
   - Environment-specific exemptions (dev/test environments)
   - Usage: Runs on git commit and pre-deployment

3. **`toolkit/hooks/security/validate-iam.yaml`**
   - Prevents wildcard IAM permissions
   - Enforces least privilege access
   - Scans CloudFormation templates for violations
   - Provides remediation guidance
   - Usage: Runs during CDK synthesis

4. **`toolkit/steering/region-config.yaml`**
   - Enforces data residency requirements
   - Validates resources created in approved regions only
   - Detects cross-region replication configurations
   - Generates compliance reports
   - Usage: Runs during CDK synthesis

5. **`toolkit/specs/golden/logging-standard.spec.md`**
   - Audit trail logging standard
   - S3 bucket configuration (Object Lock, lifecycle policies)
   - Log schema requirements (timestamp, actor, action, authorization)
   - Retention requirements (10 years for financial data)
   - Usage: Reference for implementing audit logging

### FSI Compliance References

1. **SOX Section 404 - Internal Controls**
   - Requirements: Segregation of duties, audit trail traceability, change management controls
   - Implementation: IAM role-based access, CloudTrail logging, CAB approval process
   - Resources: https://www.sec.gov/rules/final/33-8238.htm

2. **FDIC Guidance on Cloud Computing**
   - Requirements: Data residency, encryption at rest/in transit, disaster recovery
   - Implementation: us-east-1 only, AWS KMS encryption, DynamoDB PITR
   - Resources: https://www.fdic.gov/regulations/laws/rules/5000-4900.html

3. **Federal Reserve Payment System Risk Policy**
   - Requirements: Settlement finality, idempotency, payment rail integration
   - Implementation: Step Functions workflow, idempotency keys, ACH/Fedwire integration
   - Resources: https://www.federalreserve.gov/paymentsystems/psr_about.htm

4. **OCC Bulletin 2013-29 - Third-Party Relationships**
   - Requirements: Risk management for cloud service providers, audit rights
   - Implementation: AWS Artifact compliance reports, regular AWS audits
   - Resources: https://www.occ.gov/news-issuances/bulletins/2013/bulletin-2013-29.html

### AWS Service Documentation

1. **AWS Step Functions** - Workflow orchestration
   - Developer Guide: https://docs.aws.amazon.com/step-functions/
   - Best Practices: https://docs.aws.amazon.com/step-functions/latest/dg/sfn-best-practices.html
   - Compliance: https://aws.amazon.com/step-functions/compliance/

2. **Amazon DynamoDB** - NoSQL database for settlement records
   - Developer Guide: https://docs.aws.amazon.com/dynamodb/
   - Point-in-Time Recovery: https://docs.aws.amazon.com/dynamodb/latest/developerguide/PointInTimeRecovery.html
   - TTL: https://docs.aws.amazon.com/dynamodb/latest/developerguide/TTL.html

3. **Amazon S3** - Audit log storage
   - Developer Guide: https://docs.aws.amazon.com/s3/
   - Object Lock: https://docs.aws.amazon.com/s3/latest/userguide/object-lock.html
   - Lifecycle Policies: https://docs.aws.amazon.com/s3/latest/userguide/object-lifecycle-mgmt.html

4. **AWS IAM** - Access control and segregation of duties
   - Developer Guide: https://docs.aws.amazon.com/iam/
   - Best Practices: https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
   - MFA: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html

### Internal Resources

1. **Kiro Documentation**
   - Hook System: `docs/hooks-system.md`
   - Steering Rules: `docs/steering-rules.md`
   - Spec-Driven Development: `docs/spec-driven-development.md`

2. **Example Projects**
   - `examples/payment-processor/` - PCI DSS compliance example
   - `examples/healthcare-api/` - HIPAA compliance example
   - `examples/multi-tenant-saas/` - Tenant isolation example

3. **Team Contacts**
   - Compliance Team: #compliance-alerts (Slack)
   - Security Team: security@company.com
   - CAB Board: cab@company.com
   - On-Call: PagerDuty "Settlement Engine Team"

---

**End of Specification**

*This specification demonstrates how Kiro's regulatory compliance tooling enables financial services teams to deploy complex settlement systems while satisfying FSI regulatory requirements, deployment window restrictions, and audit trail mandates.*
