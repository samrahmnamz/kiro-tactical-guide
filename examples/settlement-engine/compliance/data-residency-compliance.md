# Data Residency Compliance

## Overview

This document demonstrates how the Settlement Engine satisfies FDIC data residency requirements for financial services organizations. All settlement data must remain within FDIC-approved regions (us-east-1 only for this implementation).

**Regulatory Reference**: [FDIC FIL-44-2021 - Cloud Computing](https://www.fdic.gov/regulations/laws/rules/5000-4900.html)

---

## FDIC Data Residency Requirements

### Requirement 1: Data Location Constraints

**FDIC Mandate**: Financial institution data must be stored in regions where FDIC can exercise audit and examination authority.

**Settlement Engine Implementation**: All data confined to `us-east-1` (US East - N. Virginia)

**Approved Regions** (FDIC):
- ✓ us-east-1 (N. Virginia)
- ✓ us-east-2 (Ohio)
- ✓ us-west-1 (N. California)
- ✓ us-west-2 (Oregon)

**Settlement Engine Choice**: us-east-1 only (single-region deployment for simplicity)

---

## Regional Resource Deployment

### DynamoDB Tables

**Table**: `SettlementBatches`

```typescript
const settlementTable = new Table(this, 'SettlementBatches', {
  tableName: 'SettlementBatches',
  partitionKey: { name: 'settlementBatchId', type: AttributeType.STRING },
  sortKey: { name: 'settlementPeriod', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  pointInTimeRecovery: true,
  // ✓ CRITICAL: No replication regions specified
  // Data remains in us-east-1 only
});
```

**Validation**:
```bash
# Verify table only exists in us-east-1
aws dynamodb describe-table --table-name SettlementBatches --region us-east-1
# Expected: Table details

aws dynamodb describe-table --table-name SettlementBatches --region eu-west-1
# Expected: ResourceNotFoundException
```

### S3 Buckets

**Bucket**: `settlement-audit-logs`

```typescript
const auditLogBucket = new Bucket(this, 'AuditLogs', {
  bucketName: 'settlement-audit-logs',
  encryption: BucketEncryption.S3_MANAGED,
  versioned: true,
  lifecycleRules: [
    {
      id: '10-year-retention',
      expiration: Duration.days(3650) // 10 years
    }
  ],
  // ✓ CRITICAL: No cross-region replication
  // Data remains in us-east-1 only
});

// Block public access (FDIC requirement)
auditLogBucket.blockPublicAccess = BlockPublicAccess.BLOCK_ALL;
```

**Validation**:
```bash
# Verify bucket location
aws s3api get-bucket-location --bucket settlement-audit-logs
# Expected: { "LocationConstraint": "us-east-1" }

# Verify no replication configuration
aws s3api get-bucket-replication --bucket settlement-audit-logs
# Expected: ReplicationConfigurationNotFoundError
```

### Lambda Functions

**Function**: `settlement-initiate`

```typescript
const settlementInitiateLambda = new Function(this, 'SettlementInitiate', {
  functionName: 'settlement-initiate',
  runtime: Runtime.NODEJS_18_X,
  code: Code.fromAsset('lambda/settlement-initiate'),
  handler: 'index.handler',
  // ✓ Lambda function deployed to us-east-1
  environment: {
    REGION: 'us-east-1',
    ALLOWED_REGIONS: 'us-east-1' // Enforced at runtime
  }
});
```

**Runtime Validation**:
```typescript
// Lambda code validates region before data access
export const handler = async (event: any) => {
  const currentRegion = process.env.AWS_REGION;
  
  if (currentRegion !== 'us-east-1') {
    throw new Error(`Data residency violation: Lambda running in ${currentRegion}, expected us-east-1`);
  }
  
  // Proceed with settlement logic
};
```

---

## Automated Region Enforcement

### Kiro Hook: `region-config.yaml`

**Location**: `toolkit/steering/region-config.yaml`

```yaml
name: region-config
description: Enforce data residency constraints for FDIC compliance
event: preToolUse
toolTypes:
  - ".*cdk.*"
  - ".*terraform.*"
condition: |
  const template = parseCDKTemplate(context.files);
  const resources = extractResources(template);
  
  for (const resource of resources) {
    // Check DynamoDB tables
    if (resource.Type === 'AWS::DynamoDB::Table') {
      if (resource.Properties.ReplicationRegions) {
        return {
          approved: false,
          message: `Data residency violation: DynamoDB table ${resource.LogicalId} has cross-region replication. FDIC requires data remain in us-east-1.`
        };
      }
    }
    
    // Check S3 buckets
    if (resource.Type === 'AWS::S3::Bucket') {
      if (resource.Properties.ReplicationConfiguration) {
        return {
          approved: false,
          message: `Data residency violation: S3 bucket ${resource.LogicalId} has cross-region replication. FDIC requires data remain in us-east-1.`
        };
      }
    }
    
    // Check Lambda functions
    if (resource.Type === 'AWS::Lambda::Function') {
      const region = resource.Properties.Environment?.Variables?.AWS_REGION;
      if (region && region !== 'us-east-1') {
        return {
          approved: false,
          message: `Data residency violation: Lambda function ${resource.LogicalId} configured for ${region}, expected us-east-1.`
        };
      }
    }
  }
  
  return { approved: true, message: "Data residency constraints satisfied" };
```

**Validation Example**:

```bash
# Attempt deployment with cross-region replication
# CDK template includes:
# replicationRegions: ['eu-west-1']

# Run CDK deploy
cdk deploy

# Expected output:
# ❌ Hook validation failed: region-config
# Data residency violation: DynamoDB table SettlementBatches has cross-region replication.
# FDIC requires data remain in us-east-1.
```

---

## Data Sovereignty Validation

### CloudTrail Monitoring

**Alert**: Data access from non-us-east-1 region

```json
{
  "source": "aws.cloudtrail",
  "detail-type": "AWS API Call via CloudTrail",
  "detail": {
    "eventName": ["GetItem", "Query", "Scan", "PutItem"],
    "eventSource": "dynamodb.amazonaws.com",
    "awsRegion": { "anything-but": "us-east-1" },
    "requestParameters": {
      "tableName": ["SettlementBatches", "TransactionLedger"]
    }
  }
}
```

**Action**: Trigger CloudWatch alarm → PagerDuty → Immediate investigation

**Last Incident**: None (never triggered)

### Quarterly Data Residency Audit

**Audit Procedure**:
1. List all DynamoDB tables in all regions
2. List all S3 buckets in all regions
3. Verify settlement data only exists in us-east-1
4. Review CloudTrail logs for any non-us-east-1 data access

**Last Audit Date**: 2024-01-15

**Audit Result**: ✓ Pass - All settlement data confined to us-east-1

---

## Disaster Recovery and Data Residency

### Challenge
FDIC requires business continuity planning, but data must remain in us-east-1.

### Solution
**Multi-AZ Deployment within us-east-1**:

```typescript
const settlementTable = new Table(this, 'SettlementBatches', {
  // Single region (us-east-1) but multi-AZ within region
  pointInTimeRecovery: true, // Continuous backups
  // AWS automatically replicates across us-east-1a, us-east-1b, us-east-1c
});

const auditLogBucket = new Bucket(this, 'AuditLogs', {
  // S3 automatically replicates across AZs in us-east-1
  versioned: true // Protects against accidental deletion
});
```

**Trade-off**: Regional disaster (entire us-east-1 unavailable) would cause service outage, but FDIC data residency mandate prevents cross-region failover.

**Mitigation**: 
- FDIC allows temporary service degradation over data sovereignty violation
- RTO (Recovery Time Objective): 4 hours to restore from backups in us-east-1
- RPO (Recovery Point Objective): 1 hour (DynamoDB PITR granularity)

---

## Cross-Border Data Transfer Restrictions

### FDIC Guidance
Financial data must not leave US borders without explicit FDIC approval.

### Settlement Engine Enforcement

**API Gateway Regional Endpoint**:
```typescript
const api = new RestApi(this, 'SettlementAPI', {
  restApiName: 'settlement-engine-api',
  endpointConfiguration: {
    types: [EndpointType.REGIONAL] // Not EDGE (CloudFront would cache globally)
  },
  deployOptions: {
    stageName: 'prod',
    tracingEnabled: true
  }
});
```

**Why REGIONAL over EDGE**:
- EDGE uses CloudFront (global CDN) → data cached at edge locations worldwide
- REGIONAL keeps all data within us-east-1 → FDIC compliant

**Trade-off**: Higher latency for international users, but FDIC compliance mandate takes precedence

---

## Compliance Verification Procedures

### Monthly Verification

**Checklist**:
- [ ] DynamoDB tables exist only in us-east-1
- [ ] S3 buckets have no cross-region replication
- [ ] Lambda functions deployed to us-east-1 only
- [ ] No CloudTrail events showing data access from non-us-east-1
- [ ] API Gateway using REGIONAL endpoint (not EDGE)

**Last Verification**: 2024-01-15

**Result**: ✓ Pass - All controls effective

---

## Related Documentation

- [SOX 404 Compliance Mapping](./sox-404-compliance.md)
- [Deployment Controls](./deployment-controls.md)
- [Service Specification](../spec.md)

---

*This document demonstrates FDIC data residency compliance for financial services cloud deployments.*
