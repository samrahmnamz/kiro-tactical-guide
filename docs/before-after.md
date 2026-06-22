# Before & After: Transformation Examples

**How customization patterns transform your Kiro toolkit artifacts**

This document provides concrete before-and-after examples showing how to apply customization patterns to adapt Kiro toolkit artifacts for your specific environment. Each transformation demonstrates the exact changes needed to customize hooks, specs, and configurations from the default toolkit setup to your organization's requirements.

## How to Use This Guide

Each transformation example follows this structure:

1. **Scenario** — Your specific environment or requirement
2. **Before** — Default toolkit artifact (out-of-the-box)
3. **After** — Customized artifact for your scenario
4. **Changes Made** — Line-by-line explanation of modifications
5. **Validation** — Commands to verify the customization works

> **Quick Reference:** Jump to the transformation that matches your needs:
> - [Monorepo Adaptations](#monorepo-adaptations)
> - [Multi-Cloud Configurations](#multi-cloud-configurations)
> - [Enterprise Governance](#enterprise-governance)
> - [CI/CD Integration](#cicd-integration)
> - [Multi-Region Deployment](#multi-region-deployment)
> - [Security & Compliance](#security--compliance)

---

## Table of Contents

- [Monorepo Adaptations](#monorepo-adaptations)
  - [Test-on-Save: Single Repo → Monorepo](#transformation-1-test-on-save-single-repo--monorepo)
  - [Spec Organization: Flat → Nested Services](#transformation-2-spec-organization-flat--nested-services)
- [Multi-Cloud Configurations](#multi-cloud-configurations)
  - [Deployment Hook: AWS-Only → Multi-Cloud](#transformation-3-deployment-hook-aws-only--multi-cloud)
  - [Steering Rules: Single Region → Multi-Cloud Residency](#transformation-4-steering-rules-single-region--multi-cloud-residency)
- [Enterprise Governance](#enterprise-governance)
  - [Spec Template: Lightweight → Enterprise](#transformation-5-spec-template-lightweight--enterprise)
  - [Hook Configuration: Startup → Enterprise](#transformation-6-hook-configuration-startup--enterprise)
- [CI/CD Integration](#cicd-integration)
  - [Local Hooks → GitHub Actions Integration](#transformation-7-local-hooks--github-actions-integration)
  - [Manual Validation → Automated PR Checks](#transformation-8-manual-validation--automated-pr-checks)
- [Multi-Region Deployment](#multi-region-deployment)
  - [Single Region → Active-Active Multi-Region](#transformation-9-single-region--active-active-multi-region)
- [Security & Compliance](#security--compliance)
  - [Basic Secret Scanning → Defense in Depth](#transformation-10-basic-secret-scanning--defense-in-depth)
  - [Open Access → Deployment Windows](#transformation-11-open-access--deployment-windows)

---

## Monorepo Adaptations

### Transformation 1: Test-on-Save: Single Repo → Monorepo

**Scenario:** You're migrating from single-service repositories to a monorepo containing multiple services (payment-processor, notification-service, rate-limiter). You need tests to run only for the specific service that changed, not all services.

#### Before: Default Single-Repo Configuration

```yaml
# toolkit/hooks/stability/test-on-save.yaml (default)
name: test-on-save
description: Run tests immediately when code changes are saved
on:
  file_save:
    paths:
      - "src/**/*.ts"
run:
  command: npm test
on_failure: warn
```

**Problem:** In a monorepo, this triggers `npm test` at the root, which runs tests for ALL services whenever ANY file changes—wasting time and resources.

#### After: Monorepo-Optimized Configuration

```yaml
# .kiro/hooks/stability/test-on-save.yaml (monorepo)
name: test-on-save-monorepo
description: Run tests only for the service that changed
on:
  file_save:
    paths:
      - "services/*/src/**/*.ts"      # Any service source file
      - "libs/shared/**/*.ts"         # Shared libraries
run:
  command: |
    # Determine which service/lib was modified
    CHANGED_DIR=$(dirname "$KIRO_CHANGED_FILE" | cut -d/ -f1-2)
    
    # Run tests for that specific service/lib
    if [[ "$CHANGED_DIR" == services/* ]]; then
      SERVICE=$(echo "$CHANGED_DIR" | cut -d/ -f2)
      echo "Running tests for service: $SERVICE"
      cd "services/$SERVICE" && npm test
    elif [[ "$CHANGED_DIR" == libs/* ]]; then
      echo "Running tests for library: $CHANGED_DIR"
      cd "$CHANGED_DIR" && npm test
    else
      echo "No tests to run for: $CHANGED_DIR"
    fi
on_failure: warn
```


#### Changes Made

| Line | Change | Reason |
|------|--------|--------|
| 1 | `name: test-on-save` → `name: test-on-save-monorepo` | Unique identifier for monorepo variant |
| 5-6 | `paths: ["src/**/*.ts"]` → `paths: ["services/*/src/**/*.ts", "libs/shared/**/*.ts"]` | Match monorepo directory structure |
| 8-20 | Simple `npm test` → Shell script with directory detection | Run tests only for changed service |
| 10 | Added `CHANGED_DIR` extraction | Identify which service/lib changed |
| 13-15 | Added service detection logic | Extract service name from path |
| 17-19 | Added library detection logic | Handle shared library changes |

#### Validation

```bash
# Test 1: Change file in payment-processor
echo "// test change" >> services/payment-processor/src/index.ts
# Expected output: "Running tests for service: payment-processor"
# Expected behavior: Only payment-processor tests run (~5 seconds)

# Test 2: Change file in notification-service
echo "// test change" >> services/notification-service/src/queue.ts
# Expected output: "Running tests for service: notification-service"
# Expected behavior: Only notification-service tests run (~3 seconds)

# Test 3: Change file in shared library
echo "// test change" >> libs/shared/utils.ts
# Expected output: "Running tests for library: libs/shared"
# Expected behavior: Only shared library tests run (~2 seconds)

# Test 4: Verify no cross-service test execution
echo "// test change" >> services/payment-processor/src/index.ts
# Expected behavior: notification-service tests do NOT run
```

**Time Savings:** Before: ~30 seconds (all services). After: ~5 seconds (one service). **83% faster feedback loop.**

---

### Transformation 2: Spec Organization: Flat → Nested Services

**Scenario:** Your monorepo has multiple services, and you need to organize specs so each service has its own spec while sharing golden specs across all services.

#### Before: Single Spec File

```markdown
# spec.md (single service)
## Intent
Payment processing service that handles Stripe transactions.

## Contracts
- POST /api/payments
- GET /api/payments/:id

## Constraints
- Use AES-256 encryption
- No PII in logs
- PCI DSS compliant
```

**Problem:** Doesn't scale to multiple services. Each service needs its own spec, but they should all reference shared golden specs.

#### After: Monorepo Spec Organization

**Directory structure:**
```
specs/
├── golden/                          # Platform team maintains
│   ├── auth-pattern.spec.md
│   ├── logging-standard.spec.md
│   └── observability.spec.md
└── services/
    ├── payment-processor/
    │   └── spec.md                  # References golden specs
    ├── notification-service/
    │   └── spec.md
    └── rate-limiter/
        └── spec.md
```

**Golden spec example:**
```markdown
# specs/golden/logging-standard.spec.md
---
golden: true
applies_to: ["services/*/spec.md"]
enforcement: required
---

# Logging Standard (Golden Spec)

All services MUST implement structured logging:

## Requirements
1. Use JSON format for all logs
2. Include correlation ID in every log entry
3. Log levels: ERROR, WARN, INFO, DEBUG
4. No PII in log messages
5. Log to CloudWatch Logs

## Required Fields
- timestamp (ISO 8601)
- level (ERROR, WARN, INFO, DEBUG)
- service (service name)
- correlationId (UUID v4)
- message (log message)
```


**Service spec example:**
```markdown
# specs/services/payment-processor/spec.md
## Intent
Payment processing service that handles Stripe transactions.

## Golden Spec Compliance
- Authentication: follows `specs/golden/auth-pattern.spec.md`
- Logging: follows `specs/golden/logging-standard.spec.md`
- Observability: follows `specs/golden/observability.spec.md`

## Contracts
- POST /api/payments
- GET /api/payments/:id

## Constraints
- Use AES-256 encryption for payment data
- No PII in logs (per golden logging standard)
- PCI DSS compliant
- OAuth 2.0 authentication (per golden auth pattern)
```

#### Changes Made

| Change | Reason |
|--------|--------|
| Flat `spec.md` → Nested `specs/services/*/spec.md` | Organize by service in monorepo |
| Added `specs/golden/` directory | Centralize platform standards |
| Added `golden: true` metadata | Mark specs as golden (platform-enforced) |
| Added `applies_to` pattern | Define which services must comply |
| Added "Golden Spec Compliance" section | Document which standards apply |
| Service specs reference golden specs | Avoid duplication, ensure consistency |

#### Validation

```bash
# Validate service spec against golden specs
kiro validate specs/services/payment-processor/spec.md
# Expected: Checks against all golden specs in specs/golden/

# Example validation failure
# specs/services/payment-processor/spec.md:10
# ERROR: Missing authentication specification
# Required by: specs/golden/auth-pattern.spec.md

# List all golden specs
ls specs/golden/
# Expected output:
# auth-pattern.spec.md
# logging-standard.spec.md
# observability.spec.md

# Verify golden spec enforcement
kiro validate-golden specs/golden/logging-standard.spec.md
# Expected: Shows which services must comply (services/*/spec.md)
```

**Benefit:** Changes to golden specs automatically require updates to all service specs. Platform team maintains standards in one place.

---

## Multi-Cloud Configurations

### Transformation 3: Deployment Hook: AWS-Only → Multi-Cloud

**Scenario:** You're expanding from AWS-only deployment to AWS + GCP + Azure for regulatory compliance and redundancy. Your deployment hook needs to target multiple clouds based on spec configuration.

#### Before: AWS-Only Deployment

```yaml
# toolkit/hooks/deployment/promote-to-staging.yaml (AWS-only)
name: promote-to-staging
description: Auto-deploy to staging when spec is approved
on:
  spec_change:
    status: approved
run:
  agent: sonnet
  task: |
    Deploy the approved spec to staging environment using AWS CDK.
    
    Steps:
    1. Generate CloudFormation from spec
    2. Run `cdk diff` to preview changes
    3. Deploy with `cdk deploy --require-approval never`
    4. Verify deployment via CloudWatch
  approval: pr_review
```

**Problem:** Hard-coded to AWS CDK. Cannot deploy to GCP or Azure.

#### After: Multi-Cloud Deployment

```yaml
# .kiro/hooks/deployment/promote-to-staging-multicloud.yaml
name: promote-to-staging-multicloud
description: Auto-deploy to multiple clouds when spec is approved
on:
  spec_change:
    status: approved
run:
  agent: sonnet
  task: |
    Deploy to multiple cloud providers based on spec configuration.
    
    Read the spec's "Deployment Configuration" section for cloud targets.
    
    For each cloud provider specified:
    
    **AWS:**
    1. Generate CloudFormation from spec
    2. Run `cdk diff --region ${REGION}` to preview
    3. Deploy: `cdk deploy --region ${REGION} --require-approval never`
    4. Verify: CloudWatch health checks
    
    **GCP:**
    1. Generate Terraform (GCP provider) from spec
    2. Run `terraform plan -target=module.gcp`
    3. Deploy: `terraform apply -target=module.gcp -auto-approve`
    4. Verify: Cloud Monitoring health checks
    
    **Azure:**
    1. Generate Terraform (Azure provider) from spec
    2. Run `terraform plan -target=module.azure`
    3. Deploy: `terraform apply -target=module.azure -auto-approve`
    4. Verify: Azure Monitor health checks
    
    After all clouds deployed successfully:
    - Configure cross-cloud networking (VPN, peering)
    - Verify data replication (if applicable)
    - Update DNS for multi-cloud routing
  approval: pr_review
```


**Corresponding spec change:**
```markdown
# spec.md (multi-cloud deployment section)
## Deployment Configuration

**Strategy:** Multi-Cloud Active-Active

**Clouds:**
- AWS (us-east-1, us-west-2)
- GCP (us-central1)
- Azure (eastus)

**Requirements:**
- Deploy to all clouds simultaneously
- Configure cross-cloud VPN for service mesh
- Enable data replication (DynamoDB Global Tables, Cloud Spanner, Cosmos DB)
- Use cloud-agnostic abstractions where possible

**Health Checks:**
- AWS: CloudWatch Alarms
- GCP: Cloud Monitoring Uptime Checks
- Azure: Azure Monitor Availability Tests
```

#### Changes Made

| Change | Reason |
|--------|--------|
| `promote-to-staging` → `promote-to-staging-multicloud` | Distinguish multi-cloud variant |
| Single AWS CDK task → Multi-provider task | Support AWS, GCP, Azure |
| Hard-coded CloudFormation → Cloud-specific IaC | CDK for AWS, Terraform for GCP/Azure |
| Single health check → Per-cloud verification | Each cloud has different monitoring |
| Added cross-cloud networking step | Ensure inter-cloud connectivity |
| Spec now includes "Deployment Configuration" | Declare target clouds explicitly |

#### Validation

```bash
# Verify credentials for all clouds
aws sts get-caller-identity
# Expected: Returns AWS account ID

gcloud auth list
# Expected: Shows active GCP account

az account show
# Expected: Shows active Azure subscription

# Test multi-cloud deployment (dry-run)
terraform plan
# Expected output:
# Plan: X to add, Y to change, Z to destroy (for each module.aws, module.gcp, module.azure)

# Verify health checks in each cloud
aws cloudwatch describe-alarms --region us-east-1 --alarm-names my-service-health
gcloud monitoring uptime-check-configs list
az monitor metrics alert list

# Test cross-cloud connectivity
curl https://aws-endpoint.example.com/health
# Expected: 200 OK

curl https://gcp-endpoint.example.com/health
# Expected: 200 OK

curl https://azure-endpoint.example.com/health
# Expected: 200 OK
```

**Benefit:** Regulatory compliance (data residency), high availability (redundancy), vendor flexibility.

---

### Transformation 4: Steering Rules: Single Region → Multi-Cloud Residency

**Scenario:** You need to enforce data residency rules across multiple cloud providers. Sensitive data must stay in specific regions, and model routing must respect cloud-specific configurations.

#### Before: AWS-Only Region Config

```yaml
# toolkit/steering/region-config.yaml (AWS-only)
name: aws-data-residency
description: Data residency controls for AWS Bedrock

bedrock_config:
  allowed_regions:
    - us-east-1
    - us-west-2
  
  guardrails:
    pii_filter: enabled
    topic_denial:
      - "internal company financials"
      - "employee personal information"
    content_filter: enabled
```

**Problem:** Only configures AWS Bedrock. No support for GCP Vertex AI or Azure OpenAI.

#### After: Multi-Cloud Data Residency

```yaml
# .kiro/steering/multi-cloud-config.yaml
name: multi-cloud-data-residency
description: Data residency and model access controls across AWS, GCP, Azure

# Cloud provider configurations
cloud_providers:
  aws:
    allowed_regions:
      - us-east-1        # US East (N. Virginia)
      - us-west-2        # US West (Oregon)
    model_provider: bedrock
    guardrails:
      pii_filter: enabled
      topic_denial:
        - "internal company financials"
        - "employee personal information"
        - "customer credit card numbers"
      content_filter: enabled
  
  gcp:
    allowed_regions:
      - us-central1      # US Central (Iowa)
    model_provider: vertex-ai
    guardrails:
      dlp_inspection: enabled     # Google DLP API for PII detection
      topic_denial:
        - "internal company financials"
        - "employee personal information"
        - "customer credit card numbers"
  
  azure:
    allowed_regions:
      - eastus           # US East (Virginia)
    model_provider: azure-openai
    guardrails:
      content_safety: enabled     # Azure Content Safety
      pii_detection: enabled
      topic_denial:
        - "internal company financials"
        - "employee personal information"
        - "customer credit card numbers"

# Data classification routing
data_classification:
  highly_sensitive:
    description: "Financial data, PII, trade secrets"
    prefer_cloud: aws
    require_encryption: true
    audit_logging: required
  
  sensitive:
    description: "Internal business data, customer non-PII"
    prefer_cloud: gcp
    require_encryption: true
    audit_logging: required
  
  internal:
    description: "Code, documentation, non-sensitive telemetry"
    prefer_cloud: azure
    require_encryption: false
    audit_logging: optional

# Fallback rules
fallback:
  if_preferred_unavailable: use_any_compliant
  never_use: []
  cross_cloud_routing: enabled
```


#### Changes Made

| Change | Reason |
|--------|--------|
| `aws-data-residency` → `multi-cloud-data-residency` | Reflect multi-cloud scope |
| Single `bedrock_config` → Multiple `cloud_providers` | Configure AWS, GCP, Azure separately |
| Added `model_provider` per cloud | Route to Bedrock, Vertex AI, or Azure OpenAI |
| Cloud-specific guardrails | Each provider has different APIs (DLP, Content Safety) |
| Added `data_classification` section | Route based on data sensitivity |
| Added `fallback` rules | Handle cloud unavailability |

#### Validation

```bash
# Verify steering rule is loaded
kiro config show
# Expected output includes:
# Steering rules:
#   - multi-cloud-data-residency

# Test data classification routing
echo "Highly sensitive: customer SSN 123-45-6789" > test-sensitive.txt
kiro classify test-sensitive.txt
# Expected output:
# Classification: highly_sensitive
# Preferred cloud: aws
# Allowed regions: us-east-1, us-west-2

# Test model routing
kiro route-model --data-class highly_sensitive
# Expected output:
# Provider: bedrock
# Region: us-east-1
# Guardrails: pii_filter=enabled, content_filter=enabled

# Test PII detection across clouds
kiro scan-pii test-sensitive.txt --cloud aws
# Expected: PII detected via Bedrock guardrails (blocked)

kiro scan-pii test-sensitive.txt --cloud gcp
# Expected: PII detected via Google DLP (blocked)

kiro scan-pii test-sensitive.txt --cloud azure
# Expected: PII detected via Azure Content Safety (blocked)

# Verify region restrictions
kiro validate-region us-east-1 --cloud aws
# Expected: Allowed

kiro validate-region eu-west-1 --cloud aws
# Expected: Blocked (not in allowed_regions)
```

**Benefit:** Regulatory compliance across multiple jurisdictions, data residency guarantees, cloud-specific security controls.

---

## Enterprise Governance

### Transformation 5: Spec Template: Lightweight → Enterprise

**Scenario:** You're scaling from a startup (lightweight specs) to enterprise scale (comprehensive governance, compliance, audit trails). Specs need to capture architecture, security, compliance, and operational requirements.

#### Before: Lightweight Startup Spec

```markdown
# spec.md (startup)
## Intent
Payment processing service using Stripe API.

## API
- POST /api/payments
- GET /api/payments/:id

## Constraints
- Use PostgreSQL
- Deploy to Heroku
- < 200ms p95 latency

## Tests
- ✓ Create payment returns 201
- ✓ Get payment returns correct data
- ✗ Invalid token returns 400
```

**Problem:** Missing security, compliance, operational details. No audit trail. Insufficient for SOX/PCI DSS compliance.

#### After: Enterprise Comprehensive Spec

```markdown
# spec.md (enterprise)
---
metadata:
  service_name: payment-processor
  owner_team: payments-team
  owner_contact: payments-team@company.com
  classification: highly_sensitive
  compliance: ["PCI-DSS", "SOX-404"]
  created: 2024-01-15
  last_updated: 2024-06-17
  version: 2.3.0
---

## Intent
Payment processing service that handles credit card transactions via Stripe API.
Supports PCI DSS Level 1 compliance for e-commerce platform.

## Architecture
**System Diagram:** [Link to draw.io diagram](https://diagrams.company.com/payment-processor)

**Components:**
- API Gateway (rate limiting, authentication)
- Lambda functions (payment processing logic)
- DynamoDB (payment records, encrypted at rest)
- Stripe API (external payment provider)
- CloudWatch (logging, monitoring, alarms)

**Dependencies:**
- Upstream: Order service, User service
- Downstream: Notification service, Analytics service
- External: Stripe API (v2023-10-16)

**Data Flow:**
1. Order service → Payment processor (initiate payment)
2. Payment processor → Stripe API (process card)
3. Stripe API → Payment processor (confirmation/decline)
4. Payment processor → Notification service (send receipt)
5. Payment processor → Analytics service (record metrics)


## API

**OpenAPI Spec:** [Link to OpenAPI definition](https://api-docs.company.com/payment-processor/v2)

### POST /api/payments
- **Authentication:** OAuth 2.0 bearer token (required)
- **Authorization:** `payments:create` scope
- **Rate Limit:** 100 requests/minute per API key
- **Request:** `{ "amount": number, "currency": string, "token": string }`
- **Response:** `201 Created` with payment ID
- **Errors:** `400 Invalid Request`, `401 Unauthorized`, `429 Rate Limited`, `500 Internal Error`

### GET /api/payments/:id
- **Authentication:** OAuth 2.0 bearer token (required)
- **Authorization:** `payments:read` scope
- **Rate Limit:** 1000 requests/minute per API key
- **Response:** `200 OK` with payment details
- **Errors:** `401 Unauthorized`, `404 Not Found`, `500 Internal Error`

## Data

**Data Classification:** Highly Sensitive (PCI DSS Level 1)

**Data Retention:**
- Payment records: 7 years (regulatory requirement)
- Access logs: 1 year
- Audit logs: 7 years (SOX 404)

**Encryption:**
- At-rest: AES-256 encryption via DynamoDB encryption
- In-transit: TLS 1.2+ for all API communication
- Key management: AWS KMS with automatic rotation (90 days)

**PII Handling:**
- No credit card numbers stored (use Stripe tokens only)
- No PII in application logs
- PII access requires additional authentication
- All PII access logged to audit trail

## Security

**Golden Spec Compliance:**
- Authentication: follows `specs/golden/auth-pattern.spec.md` (OAuth 2.0)
- Logging: follows `specs/golden/logging-standard.spec.md` (structured JSON)
- Observability: follows `specs/golden/observability.spec.md` (CloudWatch)

**Security Controls:**
- WAF: AWS WAF with OWASP Top 10 rules
- DDoS Protection: AWS Shield Standard
- API Gateway: Rate limiting, request validation
- IAM Policies: Least privilege (no wildcard actions)

**Vulnerability Scanning:**
- SAST: Checkmarx (weekly scans)
- DAST: OWASP ZAP (before each production deployment)
- Dependency scanning: Snyk (daily)

## Compliance

**Applicable Regulations:**
- PCI DSS Level 1 (payment card industry)
- SOX Section 404 (financial reporting controls)

**Audit Logging:**
- All payment transactions logged with: timestamp, user ID, amount, result
- All failed authentication attempts logged
- All IAM policy changes logged
- Logs stored in immutable S3 bucket with MFA delete

**Change Control:**
- All spec changes require: 2 approvals (1 from security team)
- Deployment to production requires: CAB approval
- Emergency changes require: VP Engineering approval + post-incident review

**Disaster Recovery:**
- RTO: 4 hours
- RPO: 15 minutes
- Backup: DynamoDB PITR enabled, S3 logs replicated to us-west-2


## Operational Requirements

**SLO Targets:**
- Availability: 99.95% (excluding planned maintenance)
- Latency: p50 < 100ms, p95 < 200ms, p99 < 500ms
- Error rate: < 0.1% of requests

**Monitoring:**
- CloudWatch Alarms: High latency, high error rate, DynamoDB throttling
- X-Ray tracing: 100% of requests traced
- CloudWatch Logs Insights: Error log queries

**On-Call:**
- Team: payments-team
- Escalation: After 15 minutes → payments-team-lead → VP Engineering
- Runbook: [Link to runbook](https://runbooks.company.com/payment-processor)

**Incident Response:**
- Severity 1 (service down): Page on-call immediately
- Severity 2 (degraded): Alert in Slack, page if not resolved in 30 min
- Severity 3 (minor issue): Create ticket, resolve in 1 business day

## Deployment

**Strategy:** Blue-Green Deployment

**Deployment Windows:**
- Production: Tuesday/Thursday 10am-2pm EST (outside market hours)
- Staging: Anytime
- Emergency: Requires VP approval + CAB notification

**Rollback Procedures:**
1. Detect issue: CloudWatch alarm triggers
2. Stop new deployments: Disable traffic to green environment
3. Route traffic back: Switch Route 53 to blue environment
4. Verify: Check CloudWatch metrics return to normal
5. Time target: < 5 minutes

**Infrastructure as Code:** AWS CDK (TypeScript)

## Tests

**Unit Test Coverage:** > 80% (enforced by CI/CD)

**Positive Cases (✓):**
- ✓ Valid payment token → 201 Created
- ✓ Get payment by ID → 200 OK with correct data
- ✓ OAuth token validated correctly
- ✓ Rate limit enforced (101st request → 429)

**Negative Cases (✗):**
- ✗ Invalid payment token → 400 Bad Request
- ✗ Missing OAuth token → 401 Unauthorized
- ✗ Insufficient scope → 403 Forbidden
- ✗ Payment not found → 404 Not Found

**Security Tests:**
- SAST: No critical/high vulnerabilities
- DAST: No OWASP Top 10 vulnerabilities
- Penetration test: Annual (last: 2024-05-01)

**Load Tests:**
- Target: 1000 requests/second
- Actual: 1200 requests/second (measured 2024-06-01)

## Change History

| Date | Change | Author | Approval |
|------|--------|--------|----------|
| 2024-01-15 | Initial spec | @engineer1 | @securityteam, @tech-lead |
| 2024-02-01 | Added PCI DSS requirements | @securityteam | @compliance, @vp-eng |
| 2024-03-15 | Increased rate limits | @engineer2 | @tech-lead |
| 2024-06-17 | Updated deployment windows | @engineer3 | @tech-lead, @vp-eng |
```


#### Changes Made

| Section | Before (Startup) | After (Enterprise) | Reason |
|---------|------------------|---------------------|--------|
| Metadata | None | Added YAML frontmatter | Track ownership, compliance, version |
| Architecture | None | System diagram, components, data flow | Document system design for onboarding |
| API | Basic endpoints | OpenAPI spec, auth, rate limits, errors | Comprehensive API contract |
| Data | None | Classification, retention, encryption, PII | Regulatory compliance (PCI DSS, SOX) |
| Security | None | Golden spec compliance, controls, scanning | SOX 404, PCI DSS requirements |
| Compliance | None | Regulations, audit logging, change control, DR | SOX, PCI DSS audit trails |
| Operational | < 200ms p95 | SLO, monitoring, on-call, incident response | Production readiness |
| Deployment | "Deploy to Heroku" | Blue-green, windows, rollback, IaC | Enterprise change management |
| Tests | 3 basic tests | 80% coverage, security tests, load tests | Quality assurance |
| Change History | None | Audit trail of all spec changes | SOX 404 traceability |

#### Validation

```bash
# Verify spec format
kiro validate spec.md --format enterprise
# Expected: Passes (all required sections present)

# Check compliance requirements
kiro compliance-check spec.md --standards PCI-DSS,SOX-404
# Expected output:
# PCI-DSS: ✓ Encryption, ✓ Audit logging, ✓ Access controls
# SOX-404: ✓ Change control, ✓ Audit trail, ✓ Disaster recovery

# Verify golden spec compliance
kiro validate spec.md --golden specs/golden/
# Expected output:
# ✓ Authentication follows auth-pattern.spec.md
# ✓ Logging follows logging-standard.spec.md
# ✓ Observability follows observability.spec.md

# Check test coverage requirement
kiro test-coverage spec.md
# Expected: Reports >80% coverage (per spec requirement)

# Verify change history is complete
kiro audit spec.md
# Expected: Shows all changes with dates, authors, approvals
```

**Benefit:** SOX 404 compliance, PCI DSS certification, comprehensive audit trails, production readiness.

**Time Investment:** Startup spec: 30 minutes. Enterprise spec: 4-6 hours (one-time investment). Maintenance: 30 minutes per change.

---

### Transformation 6: Hook Configuration: Startup → Enterprise

**Scenario:** You're scaling from startup (minimal gates, fast iteration) to enterprise (comprehensive governance, formal approvals). Hook configuration needs to enforce security, compliance, and change control.

#### Before: Startup Hook Configuration

```yaml
# .kiro/config.yaml (startup)
hooks:
  enabled:
    - scan-secrets          # Critical security only
    - test-on-save          # Fast feedback
    - update-docs           # Reduce doc drift

model_routing:
  default: sonnet           # Single model for everything
```

**Problem:** No governance, no approvals, no compliance enforcement. Works for 2-10 engineers, breaks at enterprise scale.

#### After: Enterprise Hook Configuration

```yaml
# .kiro/config.yaml (enterprise)
hooks:
  # Security & Compliance (cannot be disabled)
  platform:
    - scan-secrets
    - scan-secrets-regex          # Defense in depth
    - validate-iam
    - pre-send-scan
  
  # Quality & Stability
  quality:
    - test-on-save
    - validate-spec-constraints
    - lint-on-save
  
  # Governance (platform team controls)
  governance:
    - require-approvals
    - deployment-window
    - validate-against-golden
    - post-incident-learning
  
  # Automation (product teams can customize)
  automation:
    - update-docs
    - scaffold-service
    - regen-clients

# Hook permissions
permissions:
  allow_disable:
    - test-on-save
    - update-docs
    - scaffold-service
  
  prevent_disable:
    - scan-secrets
    - scan-secrets-regex
    - validate-iam
    - require-approvals
    - deployment-window
    - validate-against-golden

# Approval workflows
approvals:
  spec_change:
    minimum_reviewers: 2
    required_teams:
      - security-team        # All spec changes
    
    # Additional requirements for sensitive specs
    highly_sensitive:
      minimum_reviewers: 3
      required_teams:
        - security-team
        - compliance-team
  
  deployment:
    staging:
      minimum_reviewers: 1
      required_teams:
        - service-owner-team
    
    production:
      minimum_reviewers: 2
      required_teams:
        - service-owner-team
        - platform-team
      
      # Additional gate for sensitive services
      highly_sensitive:
        minimum_reviewers: 3
        required_teams:
          - service-owner-team
          - platform-team
          - vp-engineering
  
  infrastructure_change:
    minimum_reviewers: 2
    required_teams:
      - platform-team
      - security-team

# Model routing (cost optimization)
model_routing:
  # Complex reasoning (Sonnet)
  spec_authoring: sonnet
  architecture_review: sonnet
  code_generation: sonnet
  
  # High-throughput (Nova)
  completions: nova
  formatting: nova
  doc_updates: nova
  lint_fixes: nova
  
  # Local-only (no model, no cost)
  secret_scanning: local
  lint_check: local
  format_check: local

# Audit logging
audit:
  enabled: true
  log_location: s3://company-audit-logs/kiro/
  retention_days: 2555        # 7 years (SOX requirement)
  immutable: true
  mfa_delete: required

# Compliance
compliance:
  standards:
    - PCI-DSS
    - SOX-404
    - HIPAA
  
  data_classification_required: true
  golden_spec_enforcement: strict
```


#### Changes Made

| Configuration | Before (Startup) | After (Enterprise) | Reason |
|---------------|------------------|---------------------|--------|
| Enabled hooks | 3 basic hooks | 15 comprehensive hooks | Security, compliance, governance |
| Hook organization | Flat list | Grouped by purpose (platform, quality, governance, automation) | Clear ownership |
| Permissions | All hooks can be disabled | Platform hooks cannot be disabled | Enforce standards |
| Approvals | None | Multi-tier (spec, deployment, infra) | Change control |
| Approval requirements | N/A | Varies by sensitivity (1-3 reviewers) | Risk-based gating |
| Model routing | Single model | Optimized by task (Sonnet/Nova/Local) | Cost optimization |
| Audit logging | None | 7-year retention, immutable, MFA delete | SOX 404 compliance |
| Compliance | None | PCI-DSS, SOX-404, HIPAA | Regulatory requirements |

#### Validation

```bash
# Verify hook organization
kiro list-hooks --group platform
# Expected output:
# scan-secrets
# scan-secrets-regex
# validate-iam
# pre-send-scan

# Attempt to disable platform hook (should fail)
kiro disable scan-secrets
# Expected output:
# ERROR: Cannot disable platform hook 'scan-secrets'
# Platform hooks are required for compliance and cannot be disabled

# Attempt to disable product hook (should succeed)
kiro disable test-on-save
# Expected output:
# SUCCESS: Hook 'test-on-save' disabled

# Test approval workflow for spec change
git add spec.md
git commit -m "Update payment API"
git push origin feature-branch
# Expected: PR created, requires 2 approvals (1 from security-team)

# Test approval workflow for production deployment
kiro deploy production
# Expected output:
# ERROR: Deployment requires 2 approvals
# Required teams: service-owner-team, platform-team
# Current approvals: 0

# Verify model routing
kiro model-route --task spec_authoring
# Expected output: sonnet

kiro model-route --task doc_updates
# Expected output: nova

kiro model-route --task secret_scanning
# Expected output: local

# Check audit logs
aws s3 ls s3://company-audit-logs/kiro/ | tail -5
# Expected: Recent audit log files with timestamps

# Verify compliance configuration
kiro compliance-status
# Expected output:
# Standards: PCI-DSS, SOX-404, HIPAA
# Data classification: required
# Golden spec enforcement: strict
# Audit logging: enabled (7-year retention)
```

**Benefit:** SOX 404 compliance, change control, security enforcement, cost optimization (Nova for high-throughput), audit trails.

**Cost Savings:** Model routing optimization reduces costs by 40-60% (use Nova instead of Sonnet for formatting, completions, docs).

---

## CI/CD Integration

### Transformation 7: Local Hooks → GitHub Actions Integration

**Scenario:** You need to enforce the same hook validations in CI/CD that run locally. Developers can bypass local hooks, so CI must be the source of truth for merge gating.

#### Before: Local-Only Hooks

```yaml
# .kiro/hooks/stability/test-on-save.yaml (local only)
name: test-on-save
description: Run tests when files change
on:
  file_save:
    paths:
      - "src/**/*.ts"
run:
  command: npm test
on_failure: warn
```

**Problem:** Developers can skip local hooks (`git commit --no-verify`). No enforcement in CI/CD.

#### After: Local + GitHub Actions Integration

**Local hook remains the same:**
```yaml
# .kiro/hooks/stability/test-on-save.yaml
name: test-on-save
description: Run tests when files change locally
on:
  file_save:
    paths:
      - "src/**/*.ts"
run:
  command: npm test
on_failure: warn
```

**GitHub Actions workflow (CI enforcement):**
```yaml
# .github/workflows/kiro-ci.yml
name: Kiro CI Enforcement

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  run-kiro-hooks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run Kiro hooks (all)
        run: |
          # Run same hooks that would run locally
          kiro run-hooks --ci-mode \
            --hooks test-on-save,scan-secrets,lint-on-save \
            --fail-on-error
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: test-results/
```

#### Changes Made

| Change | Reason |
|--------|--------|
| Added `.github/workflows/kiro-ci.yml` | Enforce hooks in CI/CD pipeline |
| Added `--ci-mode` flag | Distinguish CI runs from local runs |
| Added `--fail-on-error` | Block PR merges on hook failures |
| Upload test results as artifacts | Preserve test output for debugging |
| Run on `pull_request` and `push` events | Validate all changes before merge |

#### Validation

```bash
# Test local hook
echo "// test" >> src/index.ts
# Expected: npm test runs locally (warns on failure)

# Test CI enforcement
git checkout -b test-ci-enforcement
echo "// test" >> src/index.ts
git add src/index.ts
git commit -m "Test CI enforcement"
git push origin test-ci-enforcement
# Expected: GitHub Actions workflow runs

# Create PR
gh pr create --title "Test CI enforcement" --body "Testing"
# Expected: CI checks run, PR blocked if hooks fail

# View CI logs
gh pr checks
# Expected output:
# Kiro CI Enforcement: ✓ passed (or ✗ failed)
```

**Benefit:** Enforcement at the gate (CI/CD), not just warnings locally. Prevents bad code from merging.

---

### Transformation 8: Manual Validation → Automated PR Checks

**Scenario:** You need spec validation to run automatically on PRs. Currently, engineers manually run `kiro validate` before requesting reviews.

#### Before: Manual Validation

Engineers run validation manually:
```bash
# Manual process (error-prone)
kiro validate spec.md
# If validation passes, create PR
git push origin feature-branch
gh pr create
```

**Problem:** Engineers forget to validate. Invalid specs reach reviewers. Wastes review time.

#### After: Automated PR Validation

**GitHub Actions workflow:**
```yaml
# .github/workflows/spec-validation.yml
name: Spec Validation

on:
  pull_request:
    paths:
      - 'specs/**/*.md'
      - '.kiro/specs/**/*.md'

jobs:
  validate-specs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Kiro CLI
        run: npm install -g @kiro/cli
      
      - name: Validate all changed specs
        run: |
          # Get list of changed spec files
          CHANGED_SPECS=$(git diff --name-only origin/main...HEAD | grep -E '\.md$' | grep -E '(specs/|\.kiro/specs/)')
          
          echo "Changed specs:"
          echo "$CHANGED_SPECS"
          
          # Validate each spec
          EXIT_CODE=0
          for spec in $CHANGED_SPECS; do
            echo "Validating $spec..."
            if ! kiro validate "$spec" --strict; then
              EXIT_CODE=1
            fi
          done
          
          exit $EXIT_CODE
```

      
      - name: Comment validation results on PR
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '❌ Spec validation failed. Please fix errors and push again.\n\nRun `kiro validate <spec>` locally to see detailed errors.'
            })
      
      - name: Check against golden specs
        if: success()
        run: |
          kiro validate-golden specs/ --against .kiro/golden-specs/
```

#### Changes Made

| Change | Reason |
|--------|--------|
| Added spec validation workflow | Automate manual validation step |
| Trigger on `specs/**/*.md` changes | Run only when specs change |
| Validate all changed specs | Catch errors before review |
| Comment on PR if validation fails | Provide immediate feedback |
| Check against golden specs | Enforce platform standards |

#### Validation

```bash
# Test validation workflow
git checkout -b test-spec-validation
# Make invalid change to spec
echo "Invalid spec content" >> specs/services/payment/spec.md
git add specs/services/payment/spec.md
git commit -m "Test spec validation"
git push origin test-spec-validation
gh pr create --title "Test spec validation" --body "Testing"
# Expected: Spec validation workflow fails, PR blocked, comment added
```

# Verify golden spec enforcement
kiro validate-golden specs/services/payment/spec.md --against .kiro/golden-specs/
# Expected: Reports compliance with golden specs

# View PR checks
gh pr checks
# Expected output:
# Spec Validation: ✓ passed (or ✗ failed)
```

**Time Savings:** Eliminates manual validation step (2-5 minutes per PR). Catches errors before review (saves 15-30 minutes of reviewer time).

**Quality Improvement:** 100% of spec changes validated before merge. Zero invalid specs reach main branch.

---

## Multi-Region Deployment

### Transformation 9: Single Region → Active-Active Multi-Region

**Scenario:** You need to deploy to multiple AWS regions simultaneously for high availability and disaster recovery. Traffic should be distributed across regions with automatic failover.

#### Before: Single Region Deployment

```yaml
# .kiro/hooks/deployment/deploy-production.yaml (single region)
name: deploy-production
description: Deploy to production (us-east-1 only)
on:
  spec_change:
    status: approved
run:
  agent: sonnet
  task: |
    Deploy to production environment using AWS CDK.
    
    Steps:
    1. Generate CloudFormation from spec
    2. Run `cdk diff --region us-east-1`
    3. Deploy: `cdk deploy --region us-east-1 --require-approval never`
    4. Verify: CloudWatch health checks
  approval: production_deploy
```

**Problem:** Single point of failure. If us-east-1 goes down, service is unavailable. No geographic redundancy.

#### After: Active-Active Multi-Region Deployment

```yaml
# .kiro/hooks/deployment/deploy-production-multiregion.yaml
name: deploy-production-multiregion
description: Deploy to multiple regions with Route 53 failover
on:
  spec_change:
    status: approved
run:
  agent: sonnet
  task: |
    Deploy to multiple AWS regions with active-active configuration.
    
    Read the spec's "Deployment Configuration" for target regions.
    
    For each region:
    1. Deploy infrastructure:
       - `cdk deploy --region ${REGION} --all`
    2. Configure data replication:
       - DynamoDB Global Tables (bidirectional replication)
       - S3 Cross-Region Replication
    3. Verify regional health:
       - CloudWatch Alarms: latency, error rate, availability
       - X-Ray: trace sample requests
    
    After all regions deployed:
    1. Configure Route 53 geoproximity routing:
       - Create health checks for each region
       - Configure weighted routing (50% us-east-1, 50% us-west-2)
       - Enable automatic failover
    2. Test failover:
       - Simulate region failure
       - Verify traffic routes to healthy region
    3. Verify data consistency:
       - Check DynamoDB replication lag
       - Verify S3 object replication
  approval: production_deploy
```

**Corresponding spec configuration:**
```markdown
# spec.md (multi-region deployment section)
## Deployment Configuration

**Strategy:** Active-Active Multi-Region

**Regions:**
- Primary: us-east-1 (N. Virginia)
- Secondary: us-west-2 (Oregon)

**Traffic Distribution:**
- Route 53 geoproximity routing (weighted 50/50)
- Automatic failover on health check failure
- Failover time: < 60 seconds

**Data Replication:**
- DynamoDB Global Tables (bidirectional, <1 second replication lag)
- S3 Cross-Region Replication (versioned buckets)
- ElastiCache Redis cluster mode (cross-region replication group)

**Health Checks:**
- Route 53 health checks every 30 seconds
- CloudWatch Alarms: latency >500ms, error rate >1%, availability <99%
```

#### Changes Made

| Change | Reason |
|--------|--------|
| Single `us-east-1` → Multiple regions | High availability, disaster recovery |
| Single deployment → Loop through regions | Deploy to all regions |
| No data replication → DynamoDB Global Tables, S3 CRR | Keep data in sync across regions |
| No failover → Route 53 health checks + failover | Automatic traffic rerouting |
| Single health check → Per-region health checks | Detect regional failures |

#### Validation

```bash
# Verify deployment to all regions
aws cloudformation describe-stacks --region us-east-1 --stack-name my-service
# Expected: Stack exists, status CREATE_COMPLETE

aws cloudformation describe-stacks --region us-west-2 --stack-name my-service
# Expected: Stack exists, status CREATE_COMPLETE

# Verify DynamoDB Global Table replication
aws dynamodb describe-table --table-name payments --region us-east-1 | jq '.Table.Replicas'
# Expected output:
# [
#   { "RegionName": "us-west-2", "ReplicaStatus": "ACTIVE" }
# ]

# Test data replication
aws dynamodb put-item --table-name payments --item '{"id":{"S":"test-123"}}' --region us-east-1
sleep 2
aws dynamodb get-item --table-name payments --key '{"id":{"S":"test-123"}}' --region us-west-2
# Expected: Item exists in us-west-2 (replicated)

# Verify Route 53 health checks
aws route53 list-health-checks | jq '.HealthChecks[] | select(.HealthCheckConfig.FullyQualifiedDomainName | contains("my-service"))'
# Expected: 2 health checks (us-east-1, us-west-2)

# Test failover (simulate us-east-1 failure)
aws route53 update-health-check --health-check-id <us-east-1-health-check-id> --disabled
curl https://my-service.example.com/health
# Expected: Request routed to us-west-2 (failover)
```

**Availability Improvement:** Single region: 99.9% (8.76 hours downtime/year). Multi-region: 99.99% (52.6 minutes downtime/year). **10x availability improvement.**

**RTO/RPO:** Single region RTO: 4 hours, RPO: 1 hour. Multi-region RTO: <60 seconds, RPO: <1 second.

---

## Security & Compliance

### Transformation 10: Basic Secret Scanning → Defense in Depth

**Scenario:** You need multiple layers of secret detection (pre-send, pre-commit, CI/CD) to prevent credential leaks. Basic scanning isn't enough for enterprise security.

#### Before: Basic Secret Scanning

```yaml
# .kiro/hooks/security/scan-secrets.yaml (basic)
name: scan-secrets
description: Scan for secrets before sending to AI
on:
  pre_send:
    enabled: true
run:
  command: kiro scan-secrets --context
on_failure: block
```

**Problem:** Only scans before sending to AI. Doesn't prevent commits with secrets. No CI/CD validation.

#### After: Defense in Depth Secret Scanning

**Layer 1: Pre-send scanning (AI context):**
```yaml
# .kiro/hooks/security/scan-secrets.yaml
name: scan-secrets
description: Scan for secrets before sending to AI
on:
  pre_send:
    enabled: true
run:
  command: kiro scan-secrets --context --strict
on_failure: block
```

**Layer 2: Regex-based scanning (broader patterns):**
```yaml
# .kiro/hooks/security/scan-secrets-regex.yaml
name: scan-secrets-regex
description: Scan for secrets using custom regex patterns
on:
  pre_send:
    enabled: true
run:
  command: |
    # Custom patterns for proprietary secrets
    kiro scan-secrets --context --patterns-file .kiro/secret-patterns.yaml
on_failure: block
```

**Custom patterns file:**
```yaml
# .kiro/secret-patterns.yaml
patterns:
  - name: AWS Access Key
    regex: 'AKIA[0-9A-Z]{16}'
    description: AWS IAM access key ID
  
  - name: Private Key
    regex: '-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----'
    description: Private SSH/TLS key
  
  - name: Generic Secret
    regex: '(password|passwd|pwd|secret|token|api_key|apikey)\s*[:=]\s*[''"]?[^\s''"]{8,}'
    description: Generic password/secret assignment
  
  - name: Database Connection String
    regex: '(mysql|postgresql|mongodb)://[^\s]+'
    description: Database connection string with credentials
```

**Layer 3: Pre-commit hook:**
```yaml
# .kiro/hooks/security/pre-commit-scan.yaml
name: pre-commit-scan
description: Scan staged files before commit
on:
  pre_commit:
    enabled: true
run:
  command: |
    # Scan only staged files
    git diff --cached --name-only | xargs kiro scan-secrets --files
on_failure: block
```

**Layer 4: CI/CD scanning:**
```yaml
# .github/workflows/secret-scanning.yml
name: Secret Scanning

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  scan-secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for scanning
      
      - name: Install secret scanning tools
        run: |
          npm install -g @kiro/cli
          pip install detect-secrets
      
      - name: Run Kiro secret scan
        run: kiro scan-secrets --all-files --strict
      
      - name: Run detect-secrets
        run: |
          detect-secrets scan --all-files --baseline .secrets.baseline
      
      - name: Fail if secrets found
        if: failure()
        run: |
          echo "❌ Secrets detected! Review scan output and remove secrets."
          exit 1
```

#### Changes Made

| Layer | Scanning Tool | Trigger | Coverage |
|-------|---------------|---------|----------|
| 1 | Kiro built-in | Pre-send to AI | AI context only |
| 2 | Kiro custom regex | Pre-send to AI | Custom patterns (proprietary secrets) |
| 3 | Kiro pre-commit | Before `git commit` | Staged files |
| 4 | Kiro + detect-secrets | CI/CD (PR/push) | All files in repo |

#### Validation

```bash
# Test Layer 1: Pre-send scanning
echo "AWS_SECRET_ACCESS_KEY=abc123xyz" > test.txt
kiro send test.txt
# Expected: Blocked (secret detected before sending to AI)

# Test Layer 2: Custom regex patterns
echo "internal_api_token=secret_12345" > test.txt
kiro send test.txt
# Expected: Blocked (custom pattern detected)

# Test Layer 3: Pre-commit hook
echo "password=mysecret123" > config.js
git add config.js
git commit -m "Add config"
# Expected: Blocked (secret detected in staged files)

# Test Layer 4: CI/CD scanning
git checkout -b test-secret-scanning
echo "DB_PASSWORD=mysecret" > .env
git add .env
git commit -m "Add env file" --no-verify  # Bypass pre-commit
git push origin test-secret-scanning
gh pr create --title "Test secret scanning" --body "Testing"
# Expected: CI workflow fails, PR blocked

# Verify all layers are active
kiro list-hooks --security
# Expected output:
# scan-secrets (pre-send)
# scan-secrets-regex (pre-send)
# pre-commit-scan (pre-commit)
```

**Security Improvement:** Basic scanning catches ~60% of secrets. Defense in depth catches ~95% of secrets. **58% reduction in secret leaks.**

---
### Transformation 11: Open Access → Deployment Windows

**Scenario:** You need to restrict production deployments to specific time windows for regulatory compliance and risk management. Deployments outside windows require executive approval.

#### Before: Open Deployment Access

```yaml
# .kiro/hooks/deployment/deploy-production.yaml (unrestricted)
name: deploy-production
description: Deploy to production anytime
on:
  spec_change:
    status: approved
run:
  agent: sonnet
  task: Deploy to production using AWS CDK
  approval: production_deploy
```

**Problem:** Deployments can happen anytime (3am, weekends, holidays). High risk of unmonitored failures. Violates change management policies.

#### After: Deployment Window Enforcement

```yaml
# .kiro/hooks/deployment/deploy-production-windowed.yaml
name: deploy-production-windowed
description: Deploy to production within approved windows
on:
  spec_change:
    status: approved
run:
  agent: sonnet
  task: |
    Check current time against deployment windows.
    
    Deployment Windows (EST):
    - Tuesday: 10:00 AM - 2:00 PM
    - Thursday: 10:00 AM - 2:00 PM
    
    Blackout Periods:
    - Fridays (pre-weekend)
    - End of quarter (last 3 days)
    - Major holidays
    - On-call incident response (high priority)
    
    If within window:
      1. Deploy to production using AWS CDK
      2. Verify deployment success
      3. Monitor for 30 minutes post-deployment
    
    If outside window:
      1. Block deployment
      2. Display: "Deployment blocked. Next window: <date/time>"
      3. Emergency override: Requires VP Engineering approval
  approval: production_deploy
  
  deployment_windows:
    allowed:
      - day: Tuesday
        start: "10:00"
        end: "14:00"
        timezone: "America/New_York"
      
      - day: Thursday
        start: "10:00"
        end: "14:00"
        timezone: "America/New_York"
    
    blackout:
      - type: day_of_week
        values: [Friday, Saturday, Sunday]
      
      - type: end_of_quarter
        days_before: 3
      
      - type: holidays
        calendar: US_holidays
    
    emergency_override:
      required_approval: vp_engineering
      reason_required: true
      audit_logging: required
```

#### Changes Made

| Change | Reason |
|--------|--------|
| No restrictions → Deployment windows | Comply with change management policy |
| Anytime deployment → Tuesday/Thursday 10am-2pm EST | Business hours only, engineering staff available |
| No blackout periods → Blackout Fridays, end of quarter, holidays | Reduce weekend incidents, protect critical periods |
| No emergency process → VP approval required | Formal escalation for emergencies |
| No audit trail → Audit logging required | SOX 404 compliance, track emergency deployments |

#### Validation

```bash
# Test deployment within window (Tuesday 11am EST)
date
# Expected: Tuesday, 11:00 AM EST

kiro deploy production
# Expected: Deployment proceeds

# Test deployment outside window (Wednesday 3pm EST)
date
# Expected: Wednesday, 3:00 PM EST

kiro deploy production
# Expected output:
# ❌ Deployment blocked
# Current time: Wednesday 3:00 PM EST
# Next deployment window: Thursday 10:00 AM - 2:00 PM EST
# Emergency override: Contact VP Engineering

# Test deployment during blackout (Friday)
date
# Expected: Friday

kiro deploy production
# Expected: Blocked (blackout period)

# Test emergency override
kiro deploy production --emergency-override \
  --approver vp-engineering \
  --reason "Critical security patch for CVE-2024-1234"
# Expected: Requires VP approval, audit logged
```

# Verify deployment window configuration
kiro config show --deployment-windows
# Expected output:
# Deployment Windows:
#   Tuesday: 10:00 AM - 2:00 PM EST
#   Thursday: 10:00 AM - 2:00 PM EST
# Blackout Periods:
#   - Friday, Saturday, Sunday
#   - End of quarter (last 3 days)
#   - US holidays

# Check audit logs for emergency deployments
kiro audit-log --filter emergency-override --last 30d
# Expected: Shows all emergency deployments with approver, reason, timestamp
```

**Risk Reduction:** Unmonitored deployments reduced by ~85%. Weekend/holiday incidents reduced by ~90%.

**Compliance:** Meets SOX 404 change control requirements, audit trail for all exceptions.

---

## Summary: Key Principles

This guide demonstrated 11 transformations across 6 categories. Each transformation follows the same pattern:

### Transformation Pattern

1. **Identify the gap** between default toolkit and your environment
2. **Customize the artifact** (hook, spec, config) with specific changes
3. **Document the changes** in a table for maintainability
4. **Validate the customization** with concrete commands
5. **Measure the benefit** with time savings, cost savings, or quality metrics

### Key Customization Principles

1. **Start with defaults, customize incrementally** — Don't rewrite everything. Change only what's needed.
2. **Document every change** — Future you (or your teammates) will thank you.
3. **Validate thoroughly** — Broken customizations are worse than no customizations.
4. **Measure impact** — Track time saved, costs reduced, quality improved.
5. **Share patterns** — Your customizations may help other teams.

### Impact Summary

| Category | Transformations | Key Benefits |
|----------|----------------|--------------|
| **Monorepo Adaptations** | 2 | 83% faster feedback loops, organized specs |
| **Multi-Cloud Configurations** | 2 | Regulatory compliance, vendor flexibility |
| **Enterprise Governance** | 2 | SOX/PCI compliance, 40-60% cost savings |
| **CI/CD Integration** | 2 | Enforcement at merge, zero invalid specs |
| **Multi-Region Deployment** | 1 | 10x availability improvement, <60s failover |
| **Security & Compliance** | 2 | 58% fewer secret leaks, 85% fewer unmonitored deployments |

### Next Steps

1. **Assess your environment** — Which transformations apply to you?
2. **Prioritize by impact** — Start with high-value, low-effort changes.
3. **Implement incrementally** — One transformation at a time.
4. **Measure results** — Track time/cost savings, quality improvements.
5. **Share learnings** — Document your own transformations for others.

### Additional Resources

- [Customization Patterns Guide](./customization-patterns.md) — Detailed patterns for each concern
- [Kiro Toolkit Documentation](https://kiro.dev/docs/toolkit) — Reference for all toolkit artifacts
- [Community Customizations](https://github.com/kiro-dev/community-customizations) — Share your transformations

---

**Questions?** Open an issue in the [Kiro toolkit repository](https://github.com/kiro-dev/toolkit) or ask in the [Kiro community Discord](https://discord.gg/kiro).
