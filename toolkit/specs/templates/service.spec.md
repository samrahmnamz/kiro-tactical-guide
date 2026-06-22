# [YOUR_SERVICE_NAME] Service Specification

<!-- 
CUSTOMIZATION GUIDE:
This template provides the standard structure for service specifications in the Kiro toolbox.
Replace all [PLACEHOLDER] values with your service-specific details.

Required customizations:
1. [YOUR_SERVICE_NAME] - Replace with your service name (e.g., "Payment Processor", "User Authentication")
2. [YOUR_CONCERN] - Replace with the primary concern this service addresses (e.g., "Security & Compliance")
3. [HOOK_ARTIFACT_1/2/3] - Replace with specific hooks your service uses (e.g., "scan-secrets.yaml")
4. Fill in all contract sections with your actual API endpoints, events, and schemas
5. Define your specific constraints (security, performance, compliance)
6. Document your design decisions with rationale
7. Write comprehensive test expectations

Optional customizations:
- Add additional API endpoints as needed
- Include additional integration points
- Add service-specific constraints
- Expand test cases for your specific requirements

How to use this template:
1. Copy this file to your service directory as spec.md
2. Replace all [PLACEHOLDER] values
3. Fill in sections with your service details
4. Delete this customization guide section
5. Save the file to trigger automation hooks (scaffold-service.yaml, update-docs.yaml)
-->

> **Service Specification**: Production service specification template
> 
> **Primary Concerns Addressed**: 
> - [YOUR_CONCERN] (Concern #X)
> 
> **Toolkit Artifacts Used**:
> - `toolkit/hooks/[HOOK_ARTIFACT_1]` - [Brief description of what this hook does]
> - `toolkit/hooks/[HOOK_ARTIFACT_2]` - [Brief description of what this hook does]
> - `toolkit/hooks/[HOOK_ARTIFACT_3]` - [Brief description of what this hook does]

---

## Intent

[One sentence describing what this service does]

**Why it exists**: [One sentence explaining the business value and problem this service solves]

---

## Contracts

### API Endpoints

#### [HTTP_METHOD] [ENDPOINT_PATH]
[Brief description of what this endpoint does]

**Request**:
```typescript
{
  // Define your request schema
  // Use descriptive field names with inline comments
  // Include data types and constraints
}
```

**Response (Success - [STATUS_CODE])**:
```typescript
{
  // Define your success response schema
  // Include all fields returned
  // Document data types and formats (ISO 8601 for timestamps, etc.)
}
```

**Response (Error - [ERROR_STATUS_CODE])**:
```typescript
{
  "error": {
    "code": string,             // Error code (e.g., "invalid_input")
    "message": string           // User-friendly error message
  }
}
```

<!-- Add more API endpoints as needed -->

### Event Processing (if applicable)

#### Input Event
```typescript
{
  // Define event schema if service consumes events from EventBridge, SQS, etc.
}
```

#### Output Event (if applicable)
```typescript
{
  // Define event schema if service publishes events
}
```

### Data Models

**Table/Collection**: `[TABLE_NAME]`

```typescript
{
  // Define your database schema
  // Specify partition keys, sort keys, indexes
  // Include data types and constraints
  // Document TTL if applicable
}
```

<!-- Add more tables/collections as needed -->

### Integration Points

- **[SERVICE_NAME]**: [Description of integration]
- **[AWS_SERVICE]**: [Description of how this AWS service is used]
- **[THIRD_PARTY_SERVICE]**: [Description of integration]

---

## Constraints

### Security Constraints

#### 1. [SECURITY_CONSTRAINT_NAME]
**Requirement**: [Describe the security requirement]

**Validation**: 
- ✓ [How this is validated - tests, hooks, manual review]
- ✓ [Additional validation method]

**Implementation**:
```typescript
// ✓ CORRECT: [Show correct implementation pattern]
[code example]

// ✗ WRONG: [Show incorrect pattern that would be caught]
// [commented code example]
```

<!-- Add more security constraints as needed -->

### Performance Constraints

#### 1. Latency Requirements
- **P50**: < [XXX]ms for [operation]
- **P99**: < [XXX]ms for [operation]
- **Timeout**: [Specify timeout values]

**Validation**: 
- ✓ [How latency is measured and validated]

#### 2. Throughput Requirements
- **Target**: [X] requests/operations per second sustained
- **Peak**: [Y] requests/operations per second for [duration]

**Validation**: 
- ✓ [How throughput is measured and validated]

### Data Privacy Constraints

#### 1. No PII in Logs
**Requirement**: [List sensitive data types] must not appear in CloudWatch logs.

**Validation**: 
- ✓ Log scrubbing utility redacts sensitive patterns
- ✓ Unit tests verify scrubbing function correctness
- ✓ Follows golden spec `toolkit/specs/golden/logging-standard.spec.md`

**Implementation**:
```typescript
// ✓ CORRECT: Log scrubbed data
logger.info('[operation]', {
  id,
  [field]: mask[Field]([sensitiveValue])  // Redacted format
});

// ✗ WRONG: Log sensitive data
// logger.info('[operation]', { [sensitiveField]: fullValue });
```

### Compliance Constraints (if applicable)

#### 1. [COMPLIANCE_REQUIREMENT_NAME]
**Requirement**: [Describe compliance requirement - PCI DSS, HIPAA, SOX, etc.]

**Validation**: 
- ✓ [How compliance is validated]

### Integration Constraints

#### 1. [EXTERNAL_SERVICE_INTEGRATION]
**Requirements**:
- [List integration requirements - API versions, rate limits, retry logic, etc.]

**Validation**: 
- ✓ [How integration correctness is validated]

---

## Design Decisions (and why)

### 1. [DECISION_TOPIC]
**Decision**: [State the decision made]

**Rationale**:
- [Reason 1 for this decision]
- [Reason 2 for this decision]
- [Any relevant data or metrics supporting this decision]

**Trade-offs**:
- [Benefit] vs [Cost/Limitation]
- **Decision**: [Justification for why benefits outweigh costs]

<!-- Add more design decisions as needed -->

### Why This Technology Choice

**Decision**: Use [TECHNOLOGY_X] instead of [ALTERNATIVE_Y]

**Rationale**:
- **[Factor 1]**: [Explanation]
- **[Factor 2]**: [Explanation]
- **[Factor 3]**: [Explanation]

**Trade-offs**:
- [Advantage] but [Limitation]
- **Decision**: [Final justification]

### Historical Context (if applicable)

**Background**: [Any organizational constraints, vendor relationships, or historical decisions that influenced this design]

---

## Test Expectations

### Positive Cases (✓ must pass)

1. **✓ [TEST_CASE_NAME]**
   - Given: [Preconditions and input data]
   - When: [Action taken]
   - Then: [Expected outcome]

<!-- Add more positive test cases - aim for comprehensive coverage of happy paths -->

### Negative Cases (✗ must be rejected)

1. **✗ [ERROR_CASE_NAME]**
   - Given: [Invalid input or error condition]
   - When: [Action taken]
   - Then: Returns [ERROR_CODE] with error `{ "code": "[ERROR_CODE]", "message": "[ERROR_MESSAGE]" }`

<!-- Add more negative test cases - cover all error conditions -->

### Edge Cases (must be handled)

1. **⚠ [EDGE_CASE_NAME]**
   - Given: [Edge condition - timeouts, race conditions, boundary values]
   - When: [Action taken]
   - Then: [Expected handling behavior]

<!-- Add more edge cases - boundary conditions, race conditions, timeouts, etc. -->

---

## Rollback Plan

### Trigger Conditions
Rollback if any of the following occur within [MONITORING_WINDOW] minutes of deployment:

1. **[METRIC_1] > [THRESHOLD]%** (monitored via CloudWatch metric `[METRIC_NAME]`)
2. **[METRIC_2] > [THRESHOLD]** (monitored via CloudWatch metric `[METRIC_NAME]`)
3. **[METRIC_3] > [THRESHOLD]** (monitored via CloudWatch metric `[METRIC_NAME]`)

### Rollback Procedure

1. **Immediate Actions (0-[X] minutes)**:
   ```bash
   # Commands to revert to previous version
   # Include AWS CLI commands or scripts
   ```

2. **Database Rollback ([X]-[Y] minutes)** (if applicable):
   - [Describe database rollback strategy]
   - [Commands or procedures for data rollback]

3. **Verification ([Y]-[Z] minutes)**:
   - [Tests to run to verify rollback success]
   - [Metrics to check to confirm stability]

4. **Communication ([Z]+ minutes)**:
   - [Notification procedures]
   - [Status page updates if customer-facing]
   - [Postmortem ticket creation]

### Time Target
**Complete rollback within [XX] minutes** of decision to rollback (including verification).

### Rollback Testing
- **Frequency**: [How often rollback is tested - quarterly, monthly]
- **Validation**: [What is validated during rollback drills]

---

## Automation Hooks Integration

### Hooks Used by This Service

#### 1. [HOOK_NAME]
**Purpose**: [What this hook does for this service]

**Triggers**: [When this hook runs]

**What it validates/generates**:
- [Action 1]
- [Action 2]

**Example**:
```[language]
// Show example of what the hook catches or generates
```

<!-- Document all hooks used by this service -->

---

## Lessons Learned

### From Production Incidents (if applicable)

1. **[YYYY-MM] Incident: [INCIDENT_NAME]**
   - **What happened**: [Brief description]
   - **Impact**: [Duration, scope, customer impact]
   - **Prevention**: [How this spec addresses the root cause]
   - **Hook added**: [Any new hooks or validations added as a result]

### Design Constraints from Business Requirements

1. **[BUSINESS_REQUIREMENT]**
   - **Business requirement**: [What the business needs]
   - **Technical decision**: [How it's implemented]
   - **Rationale**: [Why this approach]

---

## Quick Start: Using This Service

### Prerequisites
1. [Prerequisite 1]
2. [Prerequisite 2]
3. [AWS account with permissions to create [RESOURCES]]

### Local Development

1. **Clone and install**:
   ```bash
   cd [SERVICE_DIRECTORY]
   npm install
   ```

2. **Configure environment**:
   ```bash
   # Environment setup commands
   ```

3. **Run locally**:
   ```bash
   npm run dev
   ```

4. **Run tests**:
   ```bash
   npm test              # Unit tests
   npm run test:integration  # Integration tests
   ```

### Deployment

1. **Deploy infrastructure**:
   ```bash
   cd infra
   npm install
   npm run cdk deploy
   ```

2. **Verify deployment**:
   ```bash
   # Commands to verify service is running
   ```

### Validation Steps

1. **[VALIDATION_NAME]**:
   - [Steps to validate service works correctly]

---

## Reference Documentation

### Related Toolkit Artifacts
- `toolkit/hooks/[HOOK_NAME]` - [Link to hook documentation]
- `toolkit/specs/golden/[GOLDEN_SPEC_NAME]` - [Link to golden spec]

### Related Services
- [SERVICE_NAME] - [Relationship to this service]

### External References
- [Link to external documentation]
- [Link to third-party API docs]

### Support
- Questions: [Slack channel or contact]
- Issues: [Issue tracker or email]
