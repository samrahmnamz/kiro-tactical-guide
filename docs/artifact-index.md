# Artifact Index

**Complete catalog of Kiro Cloud Engineering/DevOps Toolbox artifacts**

This index lists every hook, spec, steering rule, example, and MCP integration in this repository with metadata to help you quickly find what you need.

---

## How to Use This Index

1. **Browse by concern** — Find artifacts addressing your specific problem
2. **Check customization complexity** — Understand time investment required
3. **Identify Quick Wins** — Start with high-impact, low-effort artifacts (⭐)
4. **Review dependencies** — Ensure you have prerequisites before deploying

**Legend:**
- ⭐ = **Quick Win** (high impact, low effort, <10 min to deploy)
- **Complexity**: Easy (5-10 min) | Medium (10-20 min) | Hard (20-30 min)
- **Concerns**: Numbered 1-10 matching the 10 Primary Concerns in the Tactical Guide

---

## Table of Contents

- [Security Hooks](#security-hooks)
- [Stability Hooks](#stability-hooks)
- [Automation Hooks](#automation-hooks)
- [Deployment Hooks](#deployment-hooks)
- [Regulatory Hooks](#regulatory-hooks)
- [Quality Hooks](#quality-hooks)
- [Post-Incident Learning](#post-incident-learning)
- [Golden Specs](#golden-specs)
- [Spec Templates](#spec-templates)
- [Steering Rules](#steering-rules)
- [MCP Integrations](#mcp-integrations)
- [Working Examples](#working-examples)

---

## Security Hooks

### scan-secrets.yaml ⭐

**Path:** `hooks/security/scan-secrets.yaml` or `toolkit/hooks/security/scan-secrets.yaml`

**Purpose:** Local-first secret detection using gitleaks before any file reaches the model. Blocks context with detected secrets to prevent data leakage.

**Concerns Addressed:** 
- #1: Security & Compliance (62% rank as #1 challenge)
- #7: AI tools leaking sensitive data (68% experienced leakage)

**Dependencies:**
- gitleaks installed (`brew install gitleaks` on macOS)
- Optional: `.gitleaks.toml` for custom rules

**Customization Complexity:** Easy (5 min)


**Key Features:**
- Detects AWS keys, GitHub tokens, private keys, database credentials
- 100+ built-in secret patterns via gitleaks
- Runs entirely locally - no network calls
- Whitelist support with inline comments (`# gitleaks:allow`)
- Blocks file from model context if secrets detected

---

### scan-secrets-regex.yaml ⭐

**Path:** `hooks/security/scan-secrets-regex.yaml`

**Purpose:** Zero-dependency regex-based secret scanning alternative. Pure bash implementation for environments where gitleaks cannot be installed.

**Concerns Addressed:**
- #1: Security & Compliance
- #7: AI tools leaking sensitive data

**Dependencies:** None (pure bash + common Unix utilities)

**Customization Complexity:** Easy (5 min)

**Key Features:**
- No external tools required - works everywhere
- Regex patterns for: AWS keys (AKIA*), GitHub tokens (ghp_*), private keys, connection strings
- Fully customizable patterns
- Inline whitelist support
- Blocks file from model context if secrets detected

---

### validate-iam.yaml

**Path:** `hooks/security/validate-iam.yaml` or `toolkit/hooks/security/validate-iam.yaml`

**Purpose:** Validates AWS IAM policies for security best practices. Detects wildcard actions/resources, missing conditions, overly permissive policies.


**Concerns Addressed:**
- #1: Security & Compliance (prevents privilege escalation)

**Dependencies:**
- Model access (uses Sonnet for policy analysis)
- jq installed (usually pre-installed on Unix systems)

**Customization Complexity:** Medium (10 min)

**Key Features:**
- Flags `Action: "*"` and `Resource: "*"` wildcards
- Identifies missing MFA conditions on privilege escalation
- Distinguishes severity: Critical (block) vs High (warn) vs Low (safe read-only)
- Allows safe read-only wildcards (s3:Get*, ec2:Describe*)
- Works with CloudFormation, Terraform, CDK, raw JSON policies

---

### pre-send-scan.yaml ⭐

**Path:** `hooks/security/pre-send-scan.yaml` or `toolkit/hooks/security/pre-send-scan.yaml`

**Purpose:** Scans context buffer locally before transmission to model. Final security layer to prevent sensitive data from leaving the developer's machine.

**Concerns Addressed:**
- #1: Security & Compliance
- #7: AI tools leaking sensitive data

**Dependencies:** None (pure bash)

**Customization Complexity:** Easy (5 min)

**Key Features:**
- Runs before every context transmission
- Regex patterns for secrets and sensitive data
- Blocks transmission if secrets detected (`on_failure: block_send`)
- Fully local - no network calls
- Customizable patterns for org-specific sensitive data

---

## Stability Hooks

### test-on-save.yaml ⭐

**Path:** `hooks/stability/test-on-save.yaml`

**Purpose:** Instant test execution on file save. Provides immediate feedback on AI-generated code changes without waiting for CI/CD.


**Concerns Addressed:**
- #2: AI destabilizing delivery (25% ↑ AI adoption = 7.2% ↓ delivery stability)

**Dependencies:**
- Test framework installed (Jest, pytest, go test, etc.)
- Tests already exist in your project

**Customization Complexity:** Easy (5 min)

**Key Features:**
- Triggers on file save for source code
- Runs relevant tests immediately (not full suite)
- Local execution - zero network latency
- Prevents untested code from progressing
- Reduces change failure rate toward DORA elite (<5%)

---

### validate-spec-constraints.yaml

**Path:** `hooks/stability/validate-spec-constraints.yaml` or `toolkit/hooks/stability/validate-spec-constraints.yaml`

**Purpose:** Verifies generated code satisfies spec requirements. Ensures AI-generated code adheres to defined constraints before committing.

**Concerns Addressed:**
- #2: AI destabilizing delivery
- #6: AI-generated code causing rework (48% cite as bottleneck)

**Dependencies:**
- Model access (uses agent to check constraints)
- Service spec exists in project

**Customization Complexity:** Medium (10 min)

**Key Features:**
- Checks code against spec constraints (security, performance, compliance)
- Validates test expectations (✓ positive, ✗ negative cases)
- Provides detailed feedback on violations
- Prevents spec drift
- Reduces rework by catching issues early

---

## Automation Hooks

### update-docs.yaml

**Path:** `hooks/automation/update-docs.yaml` or `toolkit/hooks/automation/update-docs.yaml`

**Purpose:** Automatically update API documentation when route handlers or API contracts change. Eliminates manual doc updates.

**Concerns Addressed:**
- #3: Silos & divergent implementations (68% struggle with tribal knowledge)
- #6: AI-generated code causing rework

**Dependencies:**
- Model access (uses agent for documentation updates)
- Existing API documentation file

**Customization Complexity:** Medium (10 min)

**Key Features:**
- Detects API changes (new routes, parameter changes, status codes)
- Updates OpenAPI/Swagger specs or markdown docs automatically
- Reduces documentation lag to zero
- Prevents API documentation drift
- Saves engineering time on manual doc updates

---

### scaffold-service.yaml

**Path:** `hooks/automation/scaffold-service.yaml` or `toolkit/hooks/automation/scaffold-service.yaml`

**Purpose:** Generates fully-structured service boilerplate from golden patterns. Creates new services that are compliant from day zero.

**Concerns Addressed:**
- #3: Silos & divergent implementations
- #10: Time to first production deployment (avg 48 days)

**Dependencies:**
- Model access (uses agent for code generation)
- Golden spec templates in `.kiro/specs/`

**Customization Complexity:** Medium (15 min)

**Key Features:**
- Creates service skeleton: handlers, tests, CI/CD, deployment configs
- Follows golden patterns (auth, logging, observability)
- Includes IaC templates (CloudFormation, Terraform, CDK)
- Reduces time-to-production from 48 days to <1 week
- Ensures compliance from the start

---

### regen-clients.yaml

**Path:** `hooks/automation/regen-clients.yaml` or `toolkit/hooks/automation/regen-clients.yaml`

**Purpose:** Regenerates API clients when OpenAPI specs change. Keeps client libraries in sync with server implementations automatically.

**Concerns Addressed:**
- #3: Silos & divergent implementations
- #6: AI-generated code causing rework

**Dependencies:**
- OpenAPI Generator installed (`npm install @openapitools/openapi-generator-cli`)
- OpenAPI spec file exists

**Customization Complexity:** Medium (10 min)

**Key Features:**
- Detects OpenAPI spec changes
- Regenerates client SDKs (TypeScript, Python, Java, etc.)
- Commits generated clients to version control
- Prevents client/server drift
- Reduces integration bugs

---

## Deployment Hooks

### cascade-api-change.yaml

**Path:** `hooks/deployment/cascade-api-change.yaml` or `toolkit/hooks/deployment/cascade-api-change.yaml`

**Purpose:** Propagates API contract changes across dependent services. Updates downstream consumers automatically when APIs evolve.

**Concerns Addressed:**
- #3: Silos & divergent implementations
- #5: Cross-team dependency coordination (42% cite as bottleneck)

**Dependencies:**
- Model access (uses agent to update consumers)
- Service dependency graph or explicit consumer list

**Customization Complexity:** Hard (20 min)

**Key Features:**
- Detects breaking API changes
- Identifies dependent services via imports or config
- Updates consumer code to match new contract
- Creates PRs/tickets for dependent teams
- Prevents breaking changes from causing outages

---

### promote-to-staging.yaml

**Path:** `hooks/deployment/promote-to-staging.yaml` or `toolkit/hooks/deployment/promote-to-staging.yaml`

**Purpose:** Automatically promotes changes to staging environment after passing local tests. Accelerates feedback loop from local dev to staging.

**Concerns Addressed:**
- #2: AI destabilizing delivery
- #10: Time to first production deployment

**Dependencies:**
- CI/CD system (GitHub Actions, Jenkins, GitLab CI, etc.)
- Staging environment configured
- Deployment scripts or IaC

**Customization Complexity:** Medium (15 min)

**Key Features:**
- Triggers on successful local test completion
- Creates deployment PR or triggers CI/CD pipeline
- Enforces test coverage thresholds before promotion
- Logs deployment metadata
- Reduces manual deployment steps

---

## Regulatory Hooks

### deployment-window.yaml

**Path:** `hooks/regulatory/deployment-window.yaml` or `toolkit/hooks/regulatory/deployment-window.yaml`

**Purpose:** Enforces production deployment time windows. Prevents deployments during blackout periods (weekends, holidays, high-traffic events).

**Concerns Addressed:**
- #1: Security & Compliance (regulatory requirements)
- #8: AI suggesting non-compliant solutions (34% experienced compliance issues)

**Dependencies:** None (pure bash + date utilities)

**Customization Complexity:** Easy (5 min)

**Key Features:**
- Configurable allowed deployment windows (e.g., Mon-Thu 10am-4pm)
- Blocks deployments outside approved windows
- Supports holiday blackout lists
- Logs blocked deployment attempts
- Ensures compliance with change management policies

---

### require-approvals.yaml

**Path:** `hooks/regulatory/require-approvals.yaml` or `toolkit/hooks/regulatory/require-approvals.yaml`

**Purpose:** Enforces approval requirements for production changes. Implements separation of duties and compliance policies.

**Concerns Addressed:**
- #1: Security & Compliance (SOX, PCI-DSS, SOC2)
- #8: AI suggesting non-compliant solutions

**Dependencies:**
- Version control system with PR/MR approval API (GitHub, GitLab, Bitbucket)
- Approval policy configuration

**Customization Complexity:** Medium (10 min)

**Key Features:**
- Requires N approvals before production deployment
- Enforces different approvers (no self-approval)
- Supports role-based approval (security team for IAM changes)
- Blocks deployment if approval count insufficient
- Audit trail for compliance reporting

---

## Quality Hooks

### lint-on-save.yaml ⭐

**Path:** `hooks/quality/lint-on-save.yaml` or `toolkit/hooks/quality/lint-on-save.yaml`

**Purpose:** Runs linters instantly on file save. Catches code quality issues immediately in AI-generated code.

**Concerns Addressed:**
- #4: Inconsistent AI code style (74% struggle with code quality)
- #6: AI-generated code causing rework

**Dependencies:**
- Linter installed (eslint, pylint, golangci-lint, etc.)
- Linter config exists (.eslintrc, .pylintrc, etc.)

**Customization Complexity:** Easy (5 min)

**Key Features:**
- Instant feedback on code quality violations
- Enforces consistent style across AI-generated code
- Auto-fix support for simple violations
- Prevents style drift
- Reduces code review time

---

### require-spec-coverage.yaml

**Path:** `hooks/quality/require-spec-coverage.yaml` or `toolkit/hooks/quality/require-spec-coverage.yaml`

**Purpose:** Enforces that every feature has a corresponding spec. Prevents unspecified work from progressing.

**Concerns Addressed:**
- #3: Silos & divergent implementations
- #6: AI-generated code causing rework (48% cite as bottleneck)

**Dependencies:**
- Model access (uses agent to check spec existence)
- Spec directory structure (`.kiro/specs/`)

**Customization Complexity:** Medium (10 min)

**Key Features:**
- Blocks feature branches without corresponding spec
- Validates spec completeness (requirements, design, tasks)
- Links code changes to spec sections
- Prevents spec-less development
- Ensures documentation exists before implementation

---

### validate-against-golden.yaml

**Path:** `hooks/quality/validate-against-golden.yaml` or `toolkit/hooks/quality/validate-against-golden.yaml`

**Purpose:** Validates generated code against golden patterns. Ensures consistency with organizational standards.

**Concerns Addressed:**
- #3: Silos & divergent implementations
- #4: Inconsistent AI code style

**Dependencies:**
- Model access (uses agent for pattern validation)
- Golden spec patterns in `.kiro/specs/`

**Customization Complexity:** Hard (20 min)

**Key Features:**
- Checks code against golden patterns (auth, logging, error handling)
- Identifies deviations from standards
- Provides detailed feedback on violations
- Links to relevant golden spec sections
- Prevents pattern drift across teams

---

## Post-Incident Learning

### post-incident-learning.yaml

**Path:** `hooks/post-incident/post-incident-learning.yaml` or `toolkit/hooks/post-incident/post-incident-learning.yaml`

**Purpose:** Converts incident postmortems into actionable Kiro hooks. Prevents the same incident class from recurring.

**Concerns Addressed:**
- #2: AI destabilizing delivery
- #9: Reactive problem-solving (avg 37% time on incidents)

**Dependencies:**
- Model access (uses agent for hook generation)
- Incident postmortem document

**Customization Complexity:** Hard (20 min)

**Key Features:**
- Analyzes postmortem root causes
- Generates preventive hooks automatically
- Creates tests to validate fix
- Updates golden patterns if needed
- Converts reactive incidents into proactive safeguards

---

## Golden Specs

### auth-pattern.spec.md

**Path:** `golden-specs/auth-pattern.spec.md` or `.kiro/specs/auth-pattern.spec.md`

**Purpose:** Reference implementation for authentication and authorization patterns. Defines how services should handle auth consistently.

**Concerns Addressed:**
- #1: Security & Compliance
- #3: Silos & divergent implementations

**Dependencies:** None (reference document)

**Customization Complexity:** N/A (read-only reference)

**Key Features:**
- JWT validation patterns
- OAuth 2.0 / OIDC flows
- API key management
- Role-based access control (RBAC)
- Security best practices (token rotation, secure storage)

---

### logging-standard.spec.md

**Path:** `golden-specs/logging-standard.spec.md` or `.kiro/specs/logging-standard.spec.md`

**Purpose:** Standardized logging format and practices. Ensures consistent log structure across all services for easy aggregation and analysis.

**Concerns Addressed:**
- #3: Silos & divergent implementations
- #9: Reactive problem-solving (logs enable faster debugging)

**Dependencies:** None (reference document)

**Customization Complexity:** N/A (read-only reference)

**Key Features:**
- Structured logging format (JSON)
- Required fields (timestamp, level, service, trace_id)
- Log level guidelines (DEBUG, INFO, WARN, ERROR)
- PII redaction patterns
- Integration with log aggregation systems

---

### observability.spec.md

**Path:** `golden-specs/observability.spec.md` or `.kiro/specs/observability.spec.md`

**Purpose:** Comprehensive observability standards for metrics, traces, and dashboards. Defines what every service should instrument.

**Concerns Addressed:**
- #2: AI destabilizing delivery (observability enables fast detection)
- #9: Reactive problem-solving

**Dependencies:** None (reference document)

**Customization Complexity:** N/A (read-only reference)

**Key Features:**
- Required metrics (latency, error rate, saturation)
- Distributed tracing standards (OpenTelemetry)
- Dashboard templates
- Alert thresholds and SLOs
- Integration with monitoring systems (CloudWatch, Datadog, etc.)

---

### tracing-standard.spec.md

**Path:** `golden-specs/tracing-standard.spec.md` or `.kiro/specs/tracing-standard.spec.md`

**Purpose:** Distributed tracing implementation guide. Ensures request flows are traceable across service boundaries.

**Concerns Addressed:**
- #9: Reactive problem-solving (tracing reduces MTTR)

**Dependencies:** None (reference document)

**Customization Complexity:** N/A (read-only reference)

**Key Features:**
- OpenTelemetry instrumentation patterns
- Span naming conventions
- Context propagation (trace_id, span_id)
- Trace sampling strategies
- Integration with tracing backends (X-Ray, Jaeger, Zipkin)

---

## Spec Templates

### service.spec.md

**Path:** `spec-templates/service.spec.md` or `.kiro/specs/service.spec.md`

**Purpose:** Template for new service specifications. Provides structure for defining requirements, design, and tasks for services.

**Concerns Addressed:**
- #3: Silos & divergent implementations
- #10: Time to first production deployment

**Dependencies:** None (template document)

**Customization Complexity:** N/A (copy and customize)

**Key Features:**
- Pre-structured sections (requirements, architecture, API design, deployment)
- Checklists for completeness
- Integration points (auth, logging, observability)
- Non-functional requirements (performance, security, compliance)

---

### feature.spec.md

**Path:** `spec-templates/feature.spec.md` or `.kiro/specs/feature.spec.md`

**Purpose:** Template for feature specifications. Guides feature planning with requirements, acceptance criteria, and implementation tasks.

**Concerns Addressed:**
- #6: AI-generated code causing rework (clear specs reduce rework)

**Dependencies:** None (template document)

**Customization Complexity:** N/A (copy and customize)

**Key Features:**
- User story format
- Acceptance criteria structure
- Edge case considerations
- Testing requirements
- Rollout and rollback plans

---

### infrastructure.spec.md

**Path:** `spec-templates/infrastructure.spec.md` or `.kiro/specs/infrastructure.spec.md`

**Purpose:** Template for infrastructure specifications. Defines IaC requirements, security, and compliance for infrastructure changes.

**Concerns Addressed:**
- #1: Security & Compliance
- #8: AI suggesting non-compliant solutions

**Dependencies:** None (template document)

**Customization Complexity:** N/A (copy and customize)

**Key Features:**
- Resource definitions (VPCs, subnets, security groups)
- IAM policy specifications
- Compliance requirements (encryption, backups, audit logging)
- Cost estimates
- Disaster recovery plans

---

## Steering Rules

### excluded-paths.yaml

**Path:** `steering-rules/excluded-paths.yaml` or `.kiro/steering/excluded-paths.yaml`

**Purpose:** Defines file patterns that should never be sent to the model. Protects sensitive files from accidental exposure.

**Concerns Addressed:**
- #1: Security & Compliance
- #7: AI tools leaking sensitive data

**Dependencies:** None (Kiro framework configuration)

**Customization Complexity:** Easy (5 min)

**Key Features:**
- Pattern-based exclusions (e.g., `*.pem`, `.env*`, `secrets/`)
- Prevents secrets files from reaching model
- Reduces token usage by excluding irrelevant files
- Customizable per project

---

### region-config.yaml

**Path:** `steering-rules/region-config.yaml` or `.kiro/steering/region-config.yaml`

**Purpose:** Configuration for region-specific constraints and compliance requirements. Ensures generated code respects data residency and regulatory boundaries.

**Concerns Addressed:**
- #1: Security & Compliance (GDPR, data residency)
- #8: AI suggesting non-compliant solutions

**Dependencies:** None (Kiro framework configuration)

**Customization Complexity:** Medium (10 min)

**Key Features:**
- Region-specific allowed services
- Data residency rules
- Compliance framework mappings (GDPR, HIPAA, PCI-DSS)
- Cross-region replication policies

---

## MCP Integrations

### cloudwatch.yaml

**Path:** `mcp-integrations/cloudwatch.yaml` or `.kiro/mcp/cloudwatch.yaml`

**Purpose:** Integration with AWS CloudWatch for querying logs and metrics from within Kiro. Enables AI-assisted debugging with real production data.

**Concerns Addressed:**
- #9: Reactive problem-solving (faster incident response)

**Dependencies:**
- AWS credentials configured
- MCP server for CloudWatch installed

**Customization Complexity:** Medium (15 min)

**Key Features:**
- Query CloudWatch logs from Kiro chat
- Retrieve metrics and create ad-hoc dashboards
- Time-series data analysis
- Alert history retrieval
- Reduces context-switching during incidents

---

### pagerduty.yaml

**Path:** `mcp-integrations/pagerduty.yaml` or `.kiro/mcp/pagerduty.yaml`

**Purpose:** Integration with PagerDuty for incident management. Allows Kiro to retrieve incident context and suggest fixes.

**Concerns Addressed:**
- #9: Reactive problem-solving (avg 37% time on incidents)

**Dependencies:**
- PagerDuty API key
- MCP server for PagerDuty installed

**Customization Complexity:** Medium (10 min)

**Key Features:**
- Retrieve active incidents and history
- Link incidents to code changes
- Suggest fixes based on similar past incidents
- Update incident status from Kiro
- Reduces mean time to resolution (MTTR)

---

## Working Examples

### payment-processor

**Path:** `examples/payment-processor/` or `working-examples/payment-processor/`

**Purpose:** Production-ready payment processing service example. Demonstrates PCI-DSS compliance, idempotency, and error handling patterns.

**Concerns Addressed:**
- #1: Security & Compliance (PCI-DSS)
- #3: Silos & divergent implementations

**Dependencies:** None (example code)

**Customization Complexity:** Medium (adapt to your payment provider)

**Key Features:**
- Idempotent payment processing
- PCI-DSS compliant (no card data storage)
- Integration with Stripe/PayPal
- Retry logic with exponential backoff
- Comprehensive tests and spec

---

### rate-limiter

**Path:** `examples/rate-limiter/` or `working-examples/rate-limiter/`

**Purpose:** Distributed rate limiting service example. Shows sliding window implementation and Redis-based coordination.

**Concerns Addressed:**
- #1: Security & Compliance (DoS prevention)

**Dependencies:** Redis (or compatible key-value store)

**Customization Complexity:** Medium (adapt to your infrastructure)

**Key Features:**
- Sliding window rate limiting algorithm
- Distributed coordination via Redis
- Per-user and per-IP limits
- Graceful degradation when Redis unavailable
- Full test coverage

---

### notification-service

**Path:** `examples/notification-service/` or `working-examples/notification-service/`

**Purpose:** Multi-channel notification service example. Handles email, SMS, push notifications with retry logic and delivery tracking.

**Concerns Addressed:**
- #3: Silos & divergent implementations

**Dependencies:** Email provider (SendGrid, SES), SMS provider (Twilio), push provider (FCM)

**Customization Complexity:** Hard (integrate with your providers)

**Key Features:**
- Multi-channel delivery (email, SMS, push)
- Retry logic with exponential backoff
- Delivery tracking and metrics
- Template management
- Dead letter queue for failed notifications

---

### settlement-engine

**Path:** `examples/settlement-engine/` or `working-examples/settlement-engine/`

**Purpose:** Financial settlement processing example. Demonstrates double-entry accounting, reconciliation, and audit trails.

**Concerns Addressed:**
- #1: Security & Compliance (financial accuracy)
- #3: Silos & divergent implementations

**Dependencies:** PostgreSQL (or compatible ACID database)

**Customization Complexity:** Hard (requires financial domain knowledge)

**Key Features:**
- Double-entry accounting
- Transaction reconciliation
- Audit trail for all financial operations
- Idempotency guarantees
- Comprehensive financial tests

---

## Summary

This repository contains **40+ artifacts** across 12 categories:

- **16 Hooks**: Security (4), Stability (2), Automation (3), Deployment (2), Regulatory (2), Quality (3), Post-Incident (1)
- **4 Golden Specs**: auth-pattern, logging-standard, observability, tracing-standard
- **3 Spec Templates**: service, feature, infrastructure
- **2 Steering Rules**: excluded-paths, region-config
- **2 MCP Integrations**: cloudwatch, pagerduty
- **4 Working Examples**: payment-processor, rate-limiter, notification-service, settlement-engine

### Quick Win Artifacts (⭐)

Deploy these first for immediate impact with minimal effort:

1. **scan-secrets.yaml** (5 min) — Prevent credential leaks
2. **scan-secrets-regex.yaml** (5 min) — Zero-dependency secret scanning
3. **pre-send-scan.yaml** (5 min) — Final security layer before transmission
4. **test-on-save.yaml** (5 min) — Instant test feedback
5. **lint-on-save.yaml** (5 min) — Enforce code quality immediately

---

**Validation Requirements:** Requirements 1.5, 14.4, 14.5

**Last Updated:** 2025-06-17
