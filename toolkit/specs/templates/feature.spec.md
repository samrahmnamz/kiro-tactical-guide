# [YOUR_FEATURE_NAME] Feature Specification

<!-- 
CUSTOMIZATION GUIDE:
1. Replace [YOUR_FEATURE_NAME] with the feature name (e.g., "User Authentication", "Shopping Cart", "Real-time Notifications")
2. Replace [YOUR_SERVICE_NAME] with the parent service name if this feature belongs to a larger service
3. Replace [YOUR_REGION] with your AWS region (e.g., us-east-1, eu-west-1)
4. Replace all [PLACEHOLDER] sections with your specific details
5. Delete sections that don't apply to your feature (e.g., if no database changes, remove schema section)
6. Keep all security and compliance sections - customize with your requirements

This template is optimized for:
- New feature additions to existing services
- Feature flags and A/B testing
- Incremental functionality rollouts
- Standalone features that may span multiple services

For full service specifications, use service.spec.md template instead.
-->

> **Feature Type**: [New Feature | Enhancement | Bug Fix | Refactor]
> 
> **Parent Service**: [YOUR_SERVICE_NAME] (or "Standalone" if not part of a service)
> 
> **Primary Concerns Addressed**: 
> - [List relevant concerns from the 10 primary concerns, e.g., "Security & Compliance", "Deployment Velocity", "Engineer Burnout"]
> 
> **Toolkit Artifacts Used**:
> - [List Kiro hooks, specs, or steering rules this feature leverages]
> - Example: `toolkit/hooks/stability/test-on-save.yaml`
> - Example: `toolkit/specs/golden/auth-pattern.spec.md`

---

## Intent

[ONE SENTENCE: What this feature does and why it exists]

**Why it exists**: [1-2 sentences explaining the business value, user need, or technical requirement this feature addresses]

**Scope**: [What's included and explicitly what's NOT included in this feature]

---

## Contracts

### API Changes

#### [HTTP Method] [Endpoint Path]
[Brief description of the endpoint or API change]

**Request**:
```typescript
{
  // Request schema
  "fieldName": type,        // Description
  // Add all fields with types and inline comments
}
```

**Response (Success - [HTTP Status Code])**:
```typescript
{
  // Response schema
  "fieldName": type,        // Description
}
```

**Response (Error - [HTTP Status Code])**:
```typescript
{
  "error": {
    "code": string,         // Error code (e.g., "invalid_input")
    "message": string       // User-friendly error message
  }
}
```

<!-- If this feature doesn't add/modify APIs, delete the API Changes section -->

### Data Schema Changes

<!-- If this feature adds or modifies database schemas, document them here -->

**Table/Collection**: `[TableName]`

```typescript
{
  // Schema definition
  "fieldName": type,        // Description, constraints
  // Add indexes, partition keys, sort keys as comments
}
```

**Migration Strategy**: [How to handle existing data - backfill, lazy migration, etc.]

<!-- If no schema changes, delete this section -->

### Event Schema

<!-- If this feature publishes or consumes events, document them here -->

**Event**: `[EventName]`

```typescript
{
  "eventType": string,
  "payload": {
    // Event payload schema
  },
  "metadata": {
    "timestamp": string,    // ISO 8601
    "source": string,
    "correlationId": string
  }
}
```

<!-- If no events, delete this section -->

---

## Constraints

### Functional Constraints

#### 1. [Constraint Name]
**Requirement**: [What must be true about this feature's behavior]

**Validation**: 
- ✓ [How to verify this constraint is satisfied]
- ✓ [Test or hook that validates this]

**Implementation**:
```[language]
// ✓ CORRECT: [Brief description]
// [Code example showing correct implementation]

// ✗ WRONG: [Brief description]
// [Code example showing what NOT to do]
```

<!-- Add more functional constraints as numbered items -->

### Security Constraints

#### [N]. No Secrets in Code
**Requirement**: API keys, credentials, and secrets must never be hardcoded or committed to source control.

**Validation**: 
- ✓ Automated by `toolkit/hooks/security/scan-secrets.yaml`
- ✓ Secrets stored in AWS Secrets Manager or environment variables
- ✓ `.env` files excluded via `toolkit/steering/excluded-paths.yaml`

#### [N]. No PII in Logs
**Requirement**: Personally identifiable information must not appear in CloudWatch logs or application logs.

**Validation**: 
- ✓ Log scrubbing utility redacts sensitive patterns
- ✓ Unit tests verify scrubbing function
- ✓ Follows `toolkit/specs/golden/logging-standard.spec.md`

**Implementation**:
```typescript
// ✓ CORRECT: Log scrubbed data
logger.info('Feature action', {
  userId: maskUserId(userId),     // u***1234
  email: maskEmail(email)          // m***@example.com
});

// ✗ WRONG: Log full PII
// logger.info('Feature action', { userId, email });
```

#### [N]. Least Privilege IAM
**Requirement**: IAM policies must grant minimum permissions necessary, no wildcard actions or resources.

**Validation**: 
- ✓ Automated by `toolkit/hooks/security/validate-iam.yaml`
- ✓ Specific resource ARNs for all permissions

**Implementation**:
```typescript
// ✓ CORRECT: Specific permissions
role.addToPolicy(new PolicyStatement({
  actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
  resources: ['arn:aws:dynamodb:[YOUR_REGION]:*:table/[YOUR_TABLE_NAME]']
}));

// ✗ WRONG: Wildcard permissions
// role.addToPolicy(new PolicyStatement({
//   actions: ['dynamodb:*'],
//   resources: ['*']
// }));
```

<!-- Add more security constraints as needed -->

### Performance Constraints

#### [N]. Latency Requirements
- **P50**: < [X]ms
- **P99**: < [X]ms
- **Timeout**: [X] seconds

**Validation**: 
- ✓ Load testing with [N] concurrent requests
- ✓ CloudWatch metrics for latency tracking

#### [N]. Throughput Requirements
- **Sustained**: [N] requests per second
- **Peak**: [N] requests per second for [duration]

**Validation**: 
- ✓ [How scaling is configured - e.g., DynamoDB on-demand, Lambda concurrency]

<!-- Add more performance constraints as needed -->

### Compliance Constraints

#### [N]. [Compliance Framework Name]
**Requirement**: [Specific compliance requirement for this feature]

**Validation**: 
- ✓ [How compliance is verified]
- ✓ [Audit trail, logging, or documentation requirements]

<!-- Delete if no compliance requirements -->

### Integration Constraints

#### [N]. [External System Name] Integration
**Requirement**: [How this feature integrates with external systems]

**Error Handling**:
- **Transient failures**: [Retry strategy]
- **Permanent failures**: [Fallback behavior]

**Validation**: 
- ✓ Integration tests with [test environment/mock]

<!-- Add integration constraints for each external dependency -->

---

## Design Decisions (and why)

### 1. [Decision Title]
**Decision**: [What was decided]

**Rationale**:
- [Reason 1: Why this approach vs alternatives]
- [Reason 2: Constraints that drove the decision]
- [Reason 3: Business or technical requirements]

**Trade-offs**:
- [Pro 1]
- [Con 1]
- **Decision**: [Why the pros outweigh the cons]

**Alternatives Considered**:
- **Option A**: [Brief description] - Rejected because [reason]
- **Option B**: [Brief description] - Rejected because [reason]

<!-- Add more design decisions as numbered items -->

### 2. Feature Flag Strategy
**Decision**: [How feature flags are used for rollout - if applicable]

**Rationale**:
- [Gradual rollout strategy]
- [A/B testing requirements]
- [Rollback capability]

**Implementation**:
```typescript
// Example feature flag usage
if (featureFlags.isEnabled('[FEATURE_FLAG_NAME]', userId)) {
  // New feature code
} else {
  // Existing behavior
}
```

<!-- Delete if no feature flags -->

---

## Test Expectations

### Positive Cases (✓ must pass)

1. **✓ [Test Case Name]**
   - Given: [Initial state or preconditions]
   - When: [Action or trigger]
   - Then: [Expected outcome]

2. **✓ [Test Case Name]**
   - Given: [Preconditions]
   - When: [Action]
   - Then: [Expected outcome]

<!-- Add at least 5-10 positive test cases covering happy paths and important scenarios -->

### Negative Cases (✗ must be rejected)

1. **✗ [Test Case Name]**
   - Given: [Invalid input or state]
   - When: [Action]
   - Then: [Expected error or rejection - include error code]

2. **✗ [Test Case Name]**
   - Given: [Invalid conditions]
   - When: [Action]
   - Then: [Expected error message and HTTP status code]

<!-- Add at least 3-5 negative test cases covering validation, authorization, and error conditions -->

### Edge Cases (must be handled)

1. **⚠ [Edge Case Name]**
   - Given: [Unusual but valid conditions]
   - When: [Action]
   - Then: [Expected handling behavior]

2. **⚠ [Edge Case Name]**
   - Given: [Boundary condition]
   - When: [Action]
   - Then: [Graceful degradation or fallback]

<!-- Add 3-5 edge cases covering boundary values, race conditions, and unusual states -->

---

## Rollback Plan

### Pre-Deployment Checklist
- [ ] All tests passing (unit, integration, end-to-end)
- [ ] Feature flag configured in all environments
- [ ] CloudWatch alarms configured and tested
- [ ] Rollback procedure documented and reviewed
- [ ] On-call team notified of deployment window
- [ ] Monitoring dashboard created for feature metrics

### Deployment Strategy

**Option A: Feature Flag Rollout** (Recommended for user-facing features)
1. Deploy code with feature flag OFF (0% traffic)
2. Enable for internal users only (1% traffic)
3. Gradual rollout: 5% → 25% → 50% → 100% over [timeframe]
4. Monitor metrics at each stage before proceeding

**Option B: Blue-Green Deployment** (For infrastructure changes)
1. Deploy new version to staging environment
2. Run smoke tests
3. Switch traffic to new version
4. Monitor for [duration], rollback if issues detected

### Rollback Triggers

Rollback immediately if any of the following occur within [time window] of deployment:

1. **Error rate > [X]%** (monitored via CloudWatch metric `[MetricName]`)
2. **Latency P99 > [X]ms** (monitored via CloudWatch metric `[MetricName]`)
3. **[Custom metric] > [threshold]** (feature-specific KPI)
4. **Customer complaints > [N]** (manual trigger)

### Rollback Procedure

1. **Immediate Actions (0-2 minutes)**:
   - **Feature Flag**: Disable flag in production (instant rollback)
   - **Code Rollback**: Revert to previous Lambda version or container tag
     ```bash
     aws lambda update-function-configuration \
       --function-name [YOUR_FUNCTION_NAME] \
       --environment Variables="{VERSION=previous}"
     ```

2. **Database Rollback (2-5 minutes)** - if schema changes:
   - [Describe backward compatibility or migration rollback]
   - [Point-in-time recovery procedure if needed]

3. **Verification (5-10 minutes)**:
   - Run smoke tests against rolled-back version
   - Verify metrics return to baseline
   - Check customer-facing functionality

4. **Communication (10-15 minutes)**:
   - Post incident notification to [Slack channel / PagerDuty]
   - Update status page if customer-facing
   - Create postmortem ticket

### Time Target
**Complete rollback within [X] minutes** of decision to rollback.

---

## Integration with Toolkit

This feature leverages the following Kiro toolkit artifacts:

### Hooks Used

1. **`toolkit/hooks/security/scan-secrets.yaml`**
   - Runs on every file save
   - Blocks files containing secrets from reaching model context
   - [Any custom configuration for this feature]

2. **`toolkit/hooks/stability/test-on-save.yaml`**
   - Runs tests immediately when code changes
   - Configured to run: [specific test suites]

3. **`[OTHER_HOOK_NAME]`**
   - [Brief description of how it's used]

### Golden Specs Referenced

1. **`toolkit/specs/golden/[SPEC_NAME].spec.md`**
   - [How this feature aligns with organizational standard]

### Steering Rules Applied

1. **`toolkit/steering/excluded-paths.yaml`**
   - Ensures [sensitive files] never reach model context

2. **`toolkit/steering/region-config.yaml`**
   - Enforces [data residency requirements]

---

## Metrics and Observability

### Key Metrics to Monitor

| Metric Name | Description | Alarm Threshold | Dashboard |
|-------------|-------------|----------------|-----------|
| `[MetricName]` | [What it measures] | > [value] | [Link/Name] |
| `[MetricName]` | [What it measures] | > [value] | [Link/Name] |

### CloudWatch Alarms

1. **[Alarm Name]**: Triggers when [condition] for [duration]
   - **Action**: [SNS topic / PagerDuty / Slack notification]

2. **[Alarm Name]**: Triggers when [condition]
   - **Action**: [Auto-scaling / Notification]

### Logging

**Log Level**: [INFO | DEBUG | WARN | ERROR]

**Sample Log Entry**:
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "INFO",
  "message": "[Feature action description]",
  "context": {
    "featureName": "[YOUR_FEATURE_NAME]",
    "userId": "[masked]",
    "correlationId": "[uuid]"
  }
}
```

**Important**: Follow `toolkit/specs/golden/logging-standard.spec.md` - no PII in logs.

---

## Feature Flag Configuration

<!-- If using feature flags, document configuration here. Delete if not applicable. -->

**Flag Name**: `[FEATURE_FLAG_NAME]`

**Flag Type**: [Boolean | Percentage | User Segment]

**Configuration**:
```yaml
# Example feature flag config (adjust for your system)
[FEATURE_FLAG_NAME]:
  enabled: false              # Default: OFF
  environments:
    dev: true
    staging: true
    production: false         # Enable via gradual rollout
  rollout:
    percentage: 0             # Start at 0%, increase gradually
    userSegments:
      - internal-users        # Enable for internal testing first
```

---

## Dependencies

### Upstream Dependencies
- **[Service/System Name]**: [What this feature depends on]
  - **SLA**: [Expected availability/latency]
  - **Failure Mode**: [How this feature behaves if upstream fails]

### Downstream Consumers
- **[Service/System Name]**: [What depends on this feature]
  - **Contract**: [API/event contract that must remain stable]
  - **Breaking Change Impact**: [Assessment of downstream impact]

### External Services
- **[AWS Service Name]**: [How it's used]
  - **Quotas**: [Relevant service quotas]
  - **Cost**: [Estimated cost impact]

---

## Success Criteria

### Launch Criteria (Must achieve before GA)
- [ ] All test expectations passing (✓ positive, ✗ negative, ⚠ edge cases)
- [ ] Performance meets SLA ([P50/P99 latency], [throughput])
- [ ] Security review completed (no open high/critical findings)
- [ ] Monitoring and alarms operational
- [ ] Rollback procedure tested in staging
- [ ] Documentation complete (API docs, runbooks)

### Success Metrics (Post-Launch)
- **Week 1**: [Metric target] (e.g., error rate < 0.1%, latency P99 < 500ms)
- **Month 1**: [Business metric] (e.g., 80% of users adopt new feature)
- **Quarter 1**: [Impact metric] (e.g., 20% reduction in support tickets)

---

## Open Questions and Risks

### Open Questions
1. **[Question]**: [Description of what's unclear or needs decision]
   - **Owner**: [Who is responsible for answering]
   - **Target Date**: [When decision is needed]

### Risks
1. **[Risk Description]**: [What could go wrong]
   - **Probability**: [Low | Medium | High]
   - **Impact**: [Low | Medium | High]
   - **Mitigation**: [How to reduce risk]

---

## References

### Related Specs
- [Link to related feature or service spec]
- [Link to golden spec]

### External Documentation
- [Link to AWS service documentation]
- [Link to third-party API docs]
- [Link to compliance framework documentation]

### Design Documents
- [Link to RFC or design doc]
- [Link to architecture decision record (ADR)]

### Related Tickets
- [Link to Jira/GitHub issue]
- [Link to incident report that motivated this feature]

---

## Lessons Learned (Update Post-Launch)

<!-- Fill this section after the feature is in production -->

### What Went Well
1. [Something that worked better than expected]
2. [Process or tool that was helpful]

### What Could Be Improved
1. [Something that was harder than expected]
2. [Process gap or tool limitation]

### Recommendations for Similar Features
1. [Advice for teams building similar features]
2. [Pattern or anti-pattern to remember]

---

## Quick Start (For Developers)

### Prerequisites
- [Tool/library version requirement]
- [Access/permission requirement]
- [Environment setup requirement]

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   # or other package manager
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

3. **Run tests**:
   ```bash
   npm test                  # Unit tests
   npm run test:integration  # Integration tests
   ```

4. **Run locally**:
   ```bash
   npm run dev
   # Feature available at http://localhost:[PORT]/[ENDPOINT]
   ```

### Testing This Feature

1. **Positive case**:
   ```bash
   curl -X POST http://localhost:[PORT]/[ENDPOINT] \
     -H "Content-Type: application/json" \
     -d '{ [sample request] }'
   ```

2. **Negative case**:
   ```bash
   curl -X POST http://localhost:[PORT]/[ENDPOINT] \
     -H "Content-Type: application/json" \
     -d '{ [invalid request] }'
   # Should return 400 with error code
   ```

---

## Approval

- **Author**: [Name] - [Date]
- **Reviewers**: 
  - [Name] - [Role] - [Date]
  - [Name] - [Role] - [Date]
- **Approved By**: [Name] - [Date]
- **Status**: [Draft | In Review | Approved | Implemented | Deprecated]

