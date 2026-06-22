# Customization Patterns Guide

**How to adapt Kiro toolkit artifacts for your specific environment**

This guide provides customization patterns for common organizational scenarios. Whether you're running a monorepo, deploying to multiple clouds, or working in an enterprise with strict governance requirements, you'll find the specific customization guidance you need here.

Each pattern includes:
- **When to use it** — Indicators that this pattern fits your situation
- **Configuration changes** — Specific YAML/file modifications required
- **Validation commands** — How to verify your customization works
- **Common pitfalls** — What to watch out for

> **Quick Reference:** Jump to the pattern that matches your environment:
> - [Monorepo vs Multi-Repo](#monorepo-vs-multi-repo-patterns)
> - [AWS vs Multi-Cloud](#aws-vs-multi-cloud-patterns)
> - [Startup vs Enterprise](#startup-vs-enterprise-patterns)
> - [CI/CD Integration](#cicd-integration-patterns)
> - [Multi-Region Deployment](#multi-region-deployment-patterns)
> - [Team Structure](#team-structure-patterns)

---

## Table of Contents

- [Monorepo vs Multi-Repo Patterns](#monorepo-vs-multi-repo-patterns)
- [AWS vs Multi-Cloud Patterns](#aws-vs-multi-cloud-patterns)
- [Startup vs Enterprise Patterns](#startup-vs-enterprise-patterns)
- [CI/CD Integration Patterns](#cicd-integration-patterns)
- [Multi-Region Deployment Patterns](#multi-region-deployment-patterns)
- [Team Structure Patterns](#team-structure-patterns)
- [Validation Command Reference](#validation-command-reference)

---

## Monorepo vs Multi-Repo Patterns

### Pattern 1: Monorepo with Multiple Services

**When to use:**
- You have multiple services in a single git repository
- Services share common libraries or infrastructure code
- You want centralized governance (golden specs, common hooks)

**Indicators:**
```
your-monorepo/
├── services/
│   ├── payment-processor/
│   ├── notification-service/
│   └── rate-limiter/
├── libs/
│   └── shared/
└── .kiro/
    └── hooks/
```


**Hook customization:**

```yaml
# .kiro/hooks/test-on-save.yaml (monorepo)
name: test-on-save-monorepo
on:
  file_save:
    paths:
      - "services/*/src/**/*.ts"      # All TypeScript in any service
      - "libs/shared/**/*.ts"         # Shared libraries
run:
  command: |
    # Determine which service/lib was modified
    CHANGED_DIR=$(dirname "$KIRO_CHANGED_FILE" | cut -d/ -f1-2)
    
    # Run tests for that specific service/lib
    if [[ "$CHANGED_DIR" == services/* ]]; then
      SERVICE=$(echo "$CHANGED_DIR" | cut -d/ -f2)
      cd "services/$SERVICE" && npm test
    elif [[ "$CHANGED_DIR" == libs/* ]]; then
      cd "$CHANGED_DIR" && npm test
    fi
on_failure: warn
```

**Spec organization:**

```yaml
# .kiro/config.yaml (monorepo)
spec_paths:
  services: "services/*/spec.md"         # Each service has its own spec
  golden: "specs/golden/*.spec.md"       # Shared golden specs
  infrastructure: "infra/spec.md"        # Shared infrastructure spec
```


**Validation commands:**

```bash
# Verify hook triggers for each service
echo "// test" >> services/payment-processor/src/index.ts
# Expected: Tests run for payment-processor only

echo "// test" >> services/notification-service/src/index.ts
# Expected: Tests run for notification-service only

# Verify spec detection
kiro list-specs
# Expected: Shows all service specs + golden specs

# Verify golden spec enforcement
kiro validate services/payment-processor/spec.md
# Expected: Checks against specs/golden/*.spec.md
```

**Common pitfalls:**

❌ **Too broad file patterns** → Tests run for all services on every file save  
✅ **Service-specific patterns** → Only affected service tests run

❌ **Shared golden specs duplicated per service** → Version drift  
✅ **Single golden spec source** → Services reference, don't duplicate

---

### Pattern 2: Multi-Repo with Service-per-Repository

**When to use:**
- Each service is in its own git repository
- Services have independent release cycles
- Teams have autonomy over their service implementations

**Indicators:**
```
payment-processor/          (repo 1)
├── src/
├── spec.md
└── .kiro/
    └── hooks/

notification-service/       (repo 2)
├── src/
├── spec.md
└── .kiro/
    └── hooks/
```

**Hook customization:**

```yaml
# .kiro/hooks/test-on-save.yaml (multi-repo, simpler)
name: test-on-save
on:
  file_save:
    paths:
      - "src/**/*.ts"
run:
  command: npm test
on_failure: warn
```

**Golden spec distribution:**

Multi-repo environments need a strategy for distributing golden specs:

**Option A: Git submodule**
```bash
# In each service repo
git submodule add https://github.com/your-org/golden-specs.git specs/golden
git submodule update --init --recursive
```

**Option B: Package manager**
```bash
# Publish golden specs as npm package
npm install @your-org/golden-specs

# Reference in validation hook
kiro validate spec.md --golden node_modules/@your-org/golden-specs/
```

**Option C: Shared S3 bucket (AWS-specific)**
```yaml
# .kiro/hooks/sync-golden-specs.yaml
name: sync-golden-specs
on:
  manual_trigger:
run:
  command: |
    aws s3 sync s3://your-org-golden-specs/ specs/golden/
```

**Validation commands:**

```bash
# Verify hook is service-specific
echo "// test" >> src/index.ts
# Expected: Tests run only for this service

# Verify golden specs are accessible
ls specs/golden/
# Expected: Shows auth-pattern.spec.md, logging-standard.spec.md, etc.

# Verify golden spec validation works
kiro validate spec.md
# Expected: Checks against golden specs
```

**Common pitfalls:**

❌ **Golden specs drift across repos** → Inconsistent standards  
✅ **Automated sync mechanism** → Consistent standards

❌ **Hooks duplicated with variations** → Maintenance burden  
✅ **Shared hook templates** → Copy from central source

---

## AWS vs Multi-Cloud Patterns

### Pattern 3: AWS-Only Deployment

**When to use:**
- All infrastructure is on AWS
- You use AWS-native services (CDK, CloudFormation, Bedrock)
- You want to leverage AWS-specific integrations (CloudWatch, X-Ray)

**Hook customization:**

```yaml
# .kiro/hooks/deploy-to-staging.yaml (AWS-only)
name: deploy-to-staging
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
    4. Verify deployment health via CloudWatch
  approval: pr_review
```

**Steering rule customization:**

```yaml
# .kiro/steering/region-config.yaml (AWS-only)
name: aws-data-residency
bedrock_config:
  allowed_regions:
    - us-east-1
    - us-west-2
  guardrails:
    pii_filter: enabled
    content_filter: enabled
```

**MCP integrations:**

```yaml
# .kiro/mcp/cloudwatch.yaml (AWS-only)
name: cloudwatch-integration
connections:
  logs:
    log_groups:
      - /aws/lambda/payment-processor
      - /aws/lambda/notification-service
  metrics:
    namespaces:
      - AWS/Lambda
      - AWS/DynamoDB
```

**Validation commands:**

```bash
# Verify CDK is installed
cdk --version

# Verify AWS credentials
aws sts get-caller-identity

# Test deployment (dry-run)
cd infra && cdk diff
# Expected: Shows pending infrastructure changes

# Verify CloudWatch access
aws logs describe-log-groups --query 'logGroups[*].logGroupName'
# Expected: Lists configured log groups

# Verify Bedrock access in allowed regions
aws bedrock list-foundation-models --region us-east-1
# Expected: Returns available models
```

**Common pitfalls:**

❌ **Hard-coded region in hooks** → Fails when deploying to different regions  
✅ **Region from environment/config** → Flexible deployment

❌ **CloudWatch integration without IAM permissions** → Silent failures  
✅ **Verify IAM policies before enabling MCP** → Clear error messages

---

### Pattern 4: Multi-Cloud (AWS + GCP + Azure)

**When to use:**
- Services deployed across multiple cloud providers
- Regulatory requirements mandate multi-cloud (data residency, redundancy)
- You want to avoid vendor lock-in

**Hook customization:**

```yaml
# .kiro/hooks/deploy-multi-cloud.yaml
name: deploy-multi-cloud
on:
  spec_change:
    status: approved
run:
  agent: sonnet
  task: |
    Deploy to multiple cloud providers based on spec configuration.
    
    Check spec for `deployment.clouds` field:
    - aws: Deploy using CDK
    - gcp: Deploy using Terraform (GCP provider)
    - azure: Deploy using Terraform (Azure provider)
    
    Generate cloud-agnostic configuration, then translate to provider-specific IaC.
  approval: pr_review
```

**Spec template customization:**

```markdown
# spec.md (multi-cloud)
## Deployment Configuration

**Clouds:**
- AWS (us-east-1, us-west-2)
- GCP (us-central1)
- Azure (eastus)

**Requirements:**
- Use cloud-agnostic abstractions where possible
- Store state in Terraform Cloud
- Validate cross-cloud networking (VPN, peering)
```

**Steering rule customization:**

```yaml
# .kiro/steering/multi-cloud-config.yaml
name: multi-cloud-data-residency
cloud_providers:
  aws:
    allowed_regions:
      - us-east-1
      - us-west-2
    model_provider: bedrock
  
  gcp:
    allowed_regions:
      - us-central1
    model_provider: vertex-ai
  
  azure:
    allowed_regions:
      - eastus
    model_provider: azure-openai

# Route to appropriate model based on data residency
data_classification:
  highly_sensitive:
    prefer: aws  # Use AWS Bedrock for highest sensitivity
  sensitive:
    prefer: gcp  # Use GCP Vertex AI
  internal:
    prefer: azure  # Use Azure OpenAI
```

**Validation commands:**

```bash
# Verify credentials for each cloud
aws sts get-caller-identity
gcloud auth list
az account show

# Test infrastructure generation for each cloud
terraform plan -target=module.aws
terraform plan -target=module.gcp
terraform plan -target=module.azure

# Verify cross-cloud networking
ping <aws-service-ip>
ping <gcp-service-ip>
ping <azure-service-ip>
```

**Common pitfalls:**

❌ **Cloud-specific code in application logic** → Hard to port  
✅ **Cloud-agnostic interfaces** → Easy migration

❌ **Different IaC tools per cloud** → Maintenance overhead  
✅ **Terraform for all clouds** → Consistent workflow

❌ **No cost visibility across clouds** → Budget overruns  
✅ **Centralized cost tracking** → Budget control

---

## Startup vs Enterprise Patterns

### Pattern 5: Startup (Move Fast, Iterate)

**When to use:**
- Small team (2-10 engineers)
- Rapid iteration, frequent deployments
- Limited compliance requirements
- Pragmatic over perfect

**Hook configuration strategy:**

```yaml
# .kiro/config.yaml (startup)
hooks:
  # Focus on high-value, low-overhead hooks
  enabled:
    - scan-secrets              # Critical security
    - test-on-save              # Fast feedback
    - update-docs               # Reduce doc drift
  
  # Skip heavyweight processes
  disabled:
    - require-approvals         # Too much process
    - deployment-window         # Not needed yet
    - validate-against-golden   # Golden specs not defined yet
```

**Lightweight spec template:**

```markdown
# spec.md (startup - minimal)
## Intent
What this service does and why.

## API
- POST /api/resource
- GET /api/resource/:id

## Constraints
- Use PostgreSQL
- Deploy to Heroku
- < 200ms p95 latency

## Tests
- ✓ Create resource returns 201
- ✓ Get resource returns correct data
- ✗ Invalid input returns 400
```

**Validation commands:**

```bash
# Verify only essential hooks are active
kiro list-hooks
# Expected: scan-secrets, test-on-save, update-docs

# Verify fast feedback loop
time npm test
# Expected: < 10 seconds

# Verify deployment is simple
git push heroku main
# Expected: Deploys automatically
```

**Common pitfalls:**

❌ **Skip security entirely** → Secrets leak, incidents  
✅ **Minimal security basics** → Secret scanning, IAM basics

❌ **No specs at all** → Knowledge loss, rework  
✅ **Lightweight specs** → Capture intent and constraints

---

### Pattern 6: Enterprise (Governance, Compliance, Scale)

**When to use:**
- Large organization (50+ engineers, multiple teams)
- Strict compliance requirements (SOX, PCI DSS, HIPAA)
- Formal change management processes
- Long-term maintainability over speed

**Hook configuration strategy:**

```yaml
# .kiro/config.yaml (enterprise)
hooks:
  # Comprehensive governance
  enabled:
    - scan-secrets
    - scan-secrets-regex          # Defense in depth
    - validate-iam
    - pre-send-scan
    - test-on-save
    - validate-spec-constraints
    - require-approvals           # Change authorization
    - deployment-window           # Regulatory compliance
    - validate-against-golden     # Standards enforcement
    - post-incident-learning      # Knowledge capture
  
  # Approval workflows
  approvals:
    required_for:
      - spec_change
      - deployment
      - infrastructure_change
    minimum_reviewers: 2
    require_security_review: true
    require_compliance_review: true
```

**Golden spec enforcement:**

```yaml
# specs/golden/auth-pattern.spec.md (enterprise)
---
golden: true
applies_to: ["services/*/spec.md"]
enforcement: required
---

# Authentication Pattern (Golden Spec)

All services MUST implement authentication using the following pattern:

## Requirements
1. Use OAuth 2.0 with organization SSO provider
2. JWT tokens must expire within 1 hour
3. Refresh tokens must expire within 24 hours
4. All API endpoints except /health must require authentication
5. Log all authentication failures to centralized SIEM

## Validation
- ✓ OAuth configuration present in spec
- ✓ Token expiry matches policy
- ✓ Authenticated endpoints documented
- ✓ SIEM integration configured
```

**Comprehensive spec template:**

```markdown
# spec.md (enterprise - comprehensive)
## Intent
What this service does and why it exists.

## Architecture
- System diagram (mermaid or link to draw.io)
- Dependencies (upstream/downstream services)
- Data flow

## API
- Endpoint specifications (OpenAPI/Swagger)
- Authentication requirements
- Rate limiting policies

## Data
- Data classification (public, internal, confidential, restricted)
- Data retention policy
- Encryption requirements (at-rest, in-transit)
- PII handling procedures

## Security
- Authentication method (OAuth 2.0)
- Authorization model (RBAC/ABAC)
- Security controls (WAF, DDoS protection)
- Vulnerability scanning requirements

## Compliance
- Applicable regulations (SOX, PCI DSS, HIPAA, GDPR)
- Audit logging requirements
- Change control procedures
- Disaster recovery plan

## Operational Requirements
- SLO targets (availability, latency, error rate)
- Monitoring and alerting
- On-call rotation
- Incident response procedures

## Deployment
- Deployment strategy (blue-green, canary, rolling)
- Deployment windows (maintenance windows)
- Rollback procedures
- Infrastructure as code (Terraform/CDK)

## Tests
- Unit test coverage requirements (>80%)
- Integration test scenarios
- Load test targets
- Security test results (SAST, DAST)

## Change History
- [2024-01-15] Initial spec - @engineer1
- [2024-02-01] Added PCI DSS requirements - @securityteam
```

**Validation commands:**

```bash
# Verify all required hooks are active
kiro list-hooks | grep -E '(scan-secrets|validate-iam|require-approvals|validate-against-golden)'
# Expected: All critical hooks listed

# Verify golden spec enforcement
kiro validate services/payment-processor/spec.md
# Expected: Checks against specs/golden/*.spec.md, returns violations

# Verify approval workflow
git commit -m "Change IAM policy"
git push origin feature-branch
# Expected: PR created, requires 2 approvals + security review

# Test deployment window enforcement
kiro deploy production
# Expected: Blocked if outside maintenance window (e.g., Friday night)

# Verify audit logging
kiro audit-log --service payment-processor --days 30
# Expected: Shows all spec changes, deployments, approval decisions
```

**Common pitfalls:**

❌ **Too many gates** → Nothing gets deployed  
✅ **Risk-based gating** → High-risk changes require more approvals

❌ **Golden specs never updated** → Stale standards  
✅ **Quarterly golden spec review** → Living standards

❌ **Compliance as checkbox** → Audit failures  
✅ **Automated compliance validation** → Continuous compliance

---

## CI/CD Integration Patterns

### Pattern 7: GitHub Actions Integration

**When to use:**
- Repository hosted on GitHub
- Want to leverage GitHub's native CI/CD
- Need tight integration with pull requests

**Hook configuration:**

```yaml
# .github/workflows/kiro-validation.yml
name: Kiro Spec Validation
on:
  pull_request:
    paths:
      - '**/spec.md'
      - '.kiro/**'

jobs:
  validate-spec:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Kiro
        run: |
          npm install -g @kiro/cli
          kiro init
      
      - name: Validate spec against golden specs
        run: kiro validate spec.md
      
      - name: Run property-based tests
        run: kiro test --pbt
      
      - name: Comment results on PR
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: 'Kiro validation passed ✅'
            })
```

**Validation commands:**

```bash
# Test workflow locally with act
act pull_request -e .github/workflows/test-event.json

# Verify workflow triggers on spec changes
git add spec.md
git commit -m "Update spec"
git push origin feature-branch
# Expected: GitHub Actions runs Kiro validation
```

---

### Pattern 8: GitLab CI Integration

**When to use:**
- Repository hosted on GitLab
- Want to use GitLab's native CI/CD
- Need merge request validation

**Hook configuration:**

```yaml
# .gitlab-ci.yml
stages:
  - validate
  - test
  - deploy

kiro-validation:
  stage: validate
  image: node:18
  script:
    - npm install -g @kiro/cli
    - kiro init
    - kiro validate spec.md
  only:
    changes:
      - spec.md
      - .kiro/**

kiro-pbt:
  stage: test
  image: node:18
  script:
    - npm install -g @kiro/cli
    - kiro test --pbt
  only:
    changes:
      - spec.md
      - src/**
```

**Validation commands:**

```bash
# Test pipeline locally with gitlab-runner
gitlab-runner exec docker kiro-validation

# Verify pipeline triggers
git add spec.md
git commit -m "Update spec"
git push origin feature-branch
# Expected: GitLab CI runs Kiro validation
```

---

## Multi-Region Deployment Patterns

### Pattern 9: Active-Active Multi-Region

**When to use:**
- Need low latency globally
- Require high availability (> 99.99%)
- Can handle eventual consistency

**Hook configuration:**

```yaml
# .kiro/hooks/deploy-multi-region.yaml
name: deploy-multi-region
on:
  spec_change:
    status: approved
run:
  agent: sonnet
  task: |
    Deploy to multiple regions simultaneously.
    
    Regions (from spec):
    - Primary: us-east-1
    - Secondary: eu-west-1
    - Tertiary: ap-southeast-1
    
    Steps:
    1. Deploy to primary region
    2. Verify health checks pass
    3. Deploy to secondary and tertiary in parallel
    4. Configure global load balancer
    5. Verify cross-region replication
  approval: pr_review
```

**Spec template:**

```markdown
# spec.md (multi-region)
## Deployment

**Strategy:** Active-Active Multi-Region

**Regions:**
- us-east-1 (primary)
- eu-west-1 (secondary)
- ap-southeast-1 (tertiary)

**Data Replication:**
- DynamoDB Global Tables
- S3 Cross-Region Replication
- < 1 second replication lag

**Traffic Routing:**
- Route 53 latency-based routing
- Automatic failover on health check failure
```

**Validation commands:**

```bash
# Verify deployment in all regions
aws cloudformation describe-stacks --region us-east-1 --stack-name my-service
aws cloudformation describe-stacks --region eu-west-1 --stack-name my-service
aws cloudformation describe-stacks --region ap-southeast-1 --stack-name my-service

# Verify cross-region replication
aws dynamodb describe-global-table --global-table-name my-table

# Test failover
curl -H "Host: api.example.com" \
  https://us-east-1.example.com/health  # Should succeed
  
curl -H "Host: api.example.com" \
  https://eu-west-1.example.com/health  # Should succeed
```

---

## Team Structure Patterns

### Pattern 10: Platform Team + Product Teams

**When to use:**
- 20+ engineers across multiple product teams
- Need centralized platform/infrastructure
- Product teams own their services

**Hook organization:**

```
.kiro/
├── hooks/
│   ├── platform/               # Maintained by platform team
│   │   ├── scan-secrets.yaml
│   │   ├── validate-iam.yaml
│   │   └── require-approvals.yaml
│   └── product/                # Maintained by product teams
│       ├── test-on-save.yaml
│       └── deploy-to-staging.yaml
├── specs/
│   ├── golden/                 # Platform team golden specs
│   │   ├── auth-pattern.spec.md
│   │   ├── logging-standard.spec.md
│   │   └── data-retention.spec.md
│   └── services/               # Product team specs
│       ├── payment/spec.md
│       └── notifications/spec.md
└── config.yaml
```

**Configuration:**

```yaml
# .kiro/config.yaml (platform + product teams)
hooks:
  # Platform team controls these
  platform:
    - scan-secrets
    - validate-iam
    - require-approvals
    - validate-against-golden
  
  # Product teams control these
  product:
    - test-on-save
    - deploy-to-staging
    - update-docs

# Platform hooks cannot be disabled by product teams
hook_overrides:
  allow_disable:
    - test-on-save
    - deploy-to-staging
  prevent_disable:
    - scan-secrets
    - validate-iam
    - require-approvals
```

**Validation commands:**

```bash
# Platform team verifies golden specs
kiro validate-golden specs/golden/*.spec.md
# Expected: Ensures golden specs follow standards

# Product team validates their service
cd services/payment
kiro validate spec.md
# Expected: Checks against golden specs

# Verify hook permissions
kiro disable scan-secrets
# Expected: Error - platform hook cannot be disabled

kiro disable test-on-save
# Expected: Success - product hook can be disabled
```

---

## Validation Command Reference

This section provides a comprehensive list of validation commands for all patterns.

### Hook Validation

```bash
# List all active hooks
kiro list-hooks

# Verify a specific hook is registered
kiro list-hooks | grep scan-secrets

# Test a hook without triggering it
kiro test-hook scan-secrets --dry-run

# Manually trigger a hook
kiro trigger scan-secrets
```

### Spec Validation

```bash
# Validate current spec
kiro validate spec.md

# Validate against golden specs
kiro validate spec.md --golden specs/golden/

# Validate all specs in monorepo
kiro validate services/*/spec.md

# Check spec format only (no golden spec check)
kiro validate spec.md --format-only
```

### Deployment Validation

```bash
# Preview deployment changes
cdk diff                    # AWS CDK
terraform plan              # Terraform

# Verify deployment window
kiro deploy production --check-window

# Validate cross-region deployment
kiro validate-multi-region us-east-1,eu-west-1,ap-southeast-1
```

### Security Validation

```bash
# Scan for secrets
kiro scan-secrets

# Validate IAM policies
kiro validate-iam

# Check for PII in spec
kiro scan-pii spec.md

# Run security audit
kiro security-audit
```

### Testing Validation

```bash
# Run property-based tests
kiro test --pbt

# Run tests with coverage
kiro test --coverage

# Verify test coverage meets threshold
kiro test --coverage --threshold 80
```

### Multi-Cloud Validation

```bash
# Verify credentials for all clouds
kiro validate-credentials --clouds aws,gcp,azure

# Test infrastructure for specific cloud
terraform plan -target=module.aws
terraform plan -target=module.gcp
terraform plan -target=module.azure
```

---

## Summary

This guide provided customization patterns for common scenarios:

1. **Monorepo vs Multi-Repo** — Hook scoping, spec organization, golden spec distribution
2. **AWS vs Multi-Cloud** — Cloud-specific integrations, steering rules, data residency
3. **Startup vs Enterprise** — Pragmatic vs comprehensive governance, spec templates
4. **CI/CD Integration** — GitHub Actions, GitLab CI workflows
5. **Multi-Region Deployment** — Active-active strategies, replication validation
6. **Team Structure** — Platform team + product team hook organization

**Key principles:**
- Start with your specific environment constraints
- Use validation commands to verify each customization
- Avoid common pitfalls by learning from each pattern
- Iterate based on team feedback and organizational needs

For more details on specific Kiro toolkit features, see:
- [README.md](../README.md) — Overview and getting started
- [QUICKSTART.md](./QUICKSTART.md) — Step-by-step guide
- [Spec Format Reference](../specs/format.md) — Spec syntax details
