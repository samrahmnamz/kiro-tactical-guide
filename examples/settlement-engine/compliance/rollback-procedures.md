# Settlement Rollback Procedures

## Overview

This document provides operational procedures for rolling back settlements and deployments in emergency scenarios. Rollback procedures are critical compliance controls under SOX Section 404 and Federal Reserve payment system risk management policies.

**Authority Required**: VP+ approval for market hours rollbacks

**Notification Required**: Compliance team, CAB board, counterparties, Federal Reserve (for rollbacks > $10M)

---

## Emergency Rollback Decision Tree

```
Rollback Required?
├─ Settlement Calculation Error
│  ├─ Pre-Execution: Cancel settlement batch (no counterparty impact)
│  └─ Post-Execution: Initiate emergency rollback → Procedure A
├─ Deployment Causes Service Degradation
│  ├─ During Allowed Window: Standard rollback → Procedure B
│  └─ During Market Hours: Emergency rollback (MFA + VP) → Procedure C
├─ Data Residency Violation Detected
│  └─ Immediate rollback + data deletion → Procedure D
└─ Payment Rail Failure
   └─ Retry logic exhausted → Manual investigation → Procedure E
```

---

## Procedure A: Settlement Batch Rollback (Post-Execution)

### When to Use
- Settlement executed with incorrect calculations
- Counterparty dispute
- Regulatory compliance violation detected

### Prerequisites
- Settlement batch in "settled" status
- VP+ approval obtained
- MFA authentication completed
- Rollback ticket created (format: EMRG-XXXXXXX)

### Steps


#### Step 1: Initiate Emergency Rollback

```bash
# Authenticate with MFA
aws sts get-session-token --serial-number arn:aws:iam::123456789012:mfa/vp-finance --token-code 123456

# Call rollback API
curl -X POST https://api.settlement-engine.company.com/api/settlements/batch-abc123/rollback \
  -H "Authorization: Bearer $MFA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rolledBackBy": "vp-finance@company.com",
    "rollbackTicket": "EMRG-001234",
    "reason": "Calculation error - counterparty CP001 net position incorrect by $10,000",
    "reversalMethod": "same_day_ach"
  }'
```

**Expected Response**:
```json
{
  "settlementBatchId": "batch-abc123",
  "status": "rolled_back",
  "reversalBatchId": "batch-reversal-789",
  "rolledBackAt": "2024-01-16T11:30:00Z",
  "auditTrailId": "audit-rollback-456"
}
```

#### Step 2: Verify Reversal Transactions

```bash
# Check reversal batch status
curl https://api.settlement-engine.company.com/api/settlements/batch-reversal-789

# Expected: All reversal transactions submitted to payment rail
```

#### Step 3: Notify Stakeholders

**Required Notifications**:
- ✓ Compliance team (compliance@company.com)
- ✓ CAB board (cab@company.com)
- ✓ All affected counterparties (via email + phone)
- ✓ Federal Reserve (if rollback > $10M)
- ✓ Payment rail operators (Fedwire/ACH)

**Notification Template**:
```
Subject: URGENT - Settlement Batch Rollback Notification [EMRG-001234]

Settlement Batch: batch-abc123
Settlement Period: 2024-01-15
Rollback Time: 2024-01-16 11:30:00 UTC
Reason: Calculation error detected - counterparty net position incorrect

Reversal Batch: batch-reversal-789
Expected Reversal Completion: 2024-01-16 EOD

Impacted Counterparties:
- CP001: Reversal of +$125,000 payment
- CP002: Reversal of -$75,000 payment
- CP003: Reversal of -$50,000 payment

Contact: vp-finance@company.com for questions
```

#### Step 4: Post-Mortem Analysis

**Required Within 24 Hours**:
1. Root cause analysis (why did calculation error occur?)
2. Control effectiveness assessment (which control failed?)
3. Remediation plan (how to prevent recurrence?)
4. SOX 404 control testing update

**Post-Mortem Document Location**: `s3://compliance-reports/post-mortems/EMRG-001234.md`

---

## Procedure B: Standard Deployment Rollback

### When to Use
- Deployment causes service degradation during allowed window
- No emergency override required (deployment outside market hours)

### Steps

#### Step 1: Freeze New Settlements

```bash
# Update Lambda environment variable to reject new settlements
aws lambda update-function-configuration \
  --function-name settlement-initiate \
  --environment Variables="{ACCEPT_NEW_SETTLEMENTS=false}"
```

#### Step 2: Revert Lambda Functions

```bash
# Revert all Lambda functions to previous version
for func in settlement-initiate settlement-calculate settlement-approve settlement-execute; do
  PREVIOUS_VERSION=$(aws lambda list-versions-by-function --function-name $func \
    --query 'Versions[-2].Version' --output text)
  
  aws lambda update-alias \
    --function-name $func \
    --name prod \
    --function-version $PREVIOUS_VERSION
done
```

#### Step 3: Revert DynamoDB Schema (if changed)

```bash
# Backup current table
aws dynamodb create-backup \
  --table-name SettlementBatches \
  --backup-name pre-rollback-$(date +%Y%m%d-%H%M%S)

# Restore from previous backup if schema changed
aws dynamodb restore-table-from-backup \
  --target-table-name SettlementBatches \
  --backup-arn arn:aws:dynamodb:us-east-1:123456789012:table/SettlementBatches/backup/01234567890123-abcdefgh
```

#### Step 4: Verify Rollback Success

```bash
# Test settlement initiation API
curl -X POST https://api.settlement-engine.company.com/api/settlements/initiate \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "settlementPeriod": "2024-01-15", ... }'

# Expected: 503 Service Unavailable (settlements frozen)
```

#### Step 5: Resume Normal Operations

```bash
# Re-enable settlement acceptance
aws lambda update-function-configuration \
  --function-name settlement-initiate \
  --environment Variables="{ACCEPT_NEW_SETTLEMENTS=true}"
```

---

## Procedure C: Emergency Deployment Rollback (Market Hours)

### When to Use
- Critical production issue during market hours (9:30 AM - 4:00 PM ET)
- Requires emergency override of deployment window

### Prerequisites
- VP+ approval with MFA
- Emergency change ticket (EMRG-XXXXXXX)
- #incident-response Slack channel active

### Steps

#### Step 1: Request Emergency Override

```bash
# Assume emergency override role (requires MFA)
aws sts assume-role \
  --role-arn arn:aws:iam::123456789012:role/EmergencyOverrideRole \
  --role-session-name emergency-rollback \
  --serial-number arn:aws:iam::123456789012:mfa/vp-finance \
  --token-code 123456
```

#### Step 2: Execute Rollback (Same as Procedure B)

Follow Procedure B steps 1-5 with emergency override credentials.

#### Step 3: Document Justification

**Required Documentation**:
```
Emergency Override Justification - EMRG-001234

Incident: Settlement execution failing with 50% error rate
Impact: $5M in pending settlements blocked, counterparty SLA breach
Business Justification: Market close in 2 hours, settlements must complete today
Alternative Considered: Wait until 6 PM deployment window (REJECTED - SLA breach)
Approval: VP Finance (Jane Smith) - MFA verified at 2024-01-16 14:30:00 UTC
Rollback Completed: 2024-01-16 14:45:00 UTC
```

---

## Procedure D: Data Residency Violation Rollback

### When to Use
- Data detected in non-us-east-1 region
- Cross-region replication accidentally enabled

### Steps

#### Step 1: Immediate Data Deletion

```bash
# List all objects in non-compliant region
aws s3 ls s3://settlement-audit-logs --region eu-west-1

# Delete all data in non-compliant region
aws s3 rm s3://settlement-audit-logs --region eu-west-1 --recursive

# Verify deletion
aws s3 ls s3://settlement-audit-logs --region eu-west-1
# Expected: Empty
```

#### Step 2: Disable Cross-Region Replication

```bash
# Remove replication configuration
aws s3api delete-bucket-replication --bucket settlement-audit-logs --region us-east-1
```

#### Step 3: Notify Regulators

**Required Notifications** (within 24 hours):
- FDIC Compliance Office
- Federal Reserve Bank
- Internal Compliance Team

---

## Procedure E: Payment Rail Failure Recovery

### When to Use
- Payment rail (Fedwire/ACH) temporarily unavailable
- Retry logic exhausted (3 attempts over 30 minutes)

### Steps

#### Step 1: Mark Settlement as "pending_retry"

```bash
# Update settlement status
aws dynamodb update-item \
  --table-name SettlementBatches \
  --key '{"settlementBatchId": {"S": "batch-abc123"}}' \
  --update-expression "SET #status = :status" \
  --expression-attribute-names '{"#status": "status"}' \
  --expression-attribute-values '{":status": {"S": "pending_retry"}}'
```

#### Step 2: Manual Investigation

1. Check payment rail status page
2. Contact payment rail support
3. Verify network connectivity
4. Review CloudWatch logs for error patterns

#### Step 3: Manual Retry (if appropriate)

```bash
# Trigger Step Functions execution manually
aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:us-east-1:123456789012:stateMachine:SettlementWorkflow \
  --name manual-retry-batch-abc123 \
  --input '{"settlementBatchId": "batch-abc123", "manualRetry": true}'
```

---

## Rollback Verification Checklist

After any rollback procedure, verify:

- [ ] All Lambda functions reverted to previous version
- [ ] DynamoDB tables restored (if schema changed)
- [ ] S3 audit logs intact (no data loss)
- [ ] CloudTrail shows all rollback actions with actor identity
- [ ] Stakeholders notified (compliance, CAB, counterparties)
- [ ] Post-mortem scheduled within 24 hours
- [ ] SOX 404 control testing updated
- [ ] Incident ticket closed with root cause

---

## Rollback Testing Schedule

**Quarterly Rollback Drills**:
- Q1: Deployment rollback drill (non-prod environment)
- Q2: Settlement batch rollback drill (sandbox environment)
- Q3: Emergency override drill (MFA + VP approval workflow)
- Q4: Data residency violation drill (test data deletion)

**Last Drill Date**: 2024-01-10 (Q1 2024)

**Next Drill Date**: 2024-04-10 (Q2 2024)

---

## Contact Information

**Emergency Contacts**:
- **On-Call Engineer**: #oncall-settlement-engine (PagerDuty)
- **VP Finance**: vp-finance@company.com, +1-555-0100
- **Compliance Team**: compliance@company.com, +1-555-0200
- **CAB Board**: cab@company.com
- **Federal Reserve**: +1-800-FED-WIRE (settlements > $10M)

---

## Related Documentation

- [SOX 404 Compliance Mapping](./sox-404-compliance.md)
- [Audit Log Examples](./audit-log-examples.md)
- [Deployment Controls](./deployment-controls.md)
- [Service Specification](../spec.md)

---

*This document satisfies SOX Section 404 requirements for documented rollback procedures and Federal Reserve payment system risk management policies.*
