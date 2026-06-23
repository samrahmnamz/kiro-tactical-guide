# Steering Rules

This directory contains steering rules that control data flow and model behavior.

## Purpose

Steering rules provide local-first security and data residency controls:
- Define files and patterns that must never be sent to models
- Configure allowed Bedrock regions for data residency compliance
- Set up PII filters and content guardrails
- Control topic denial lists for sensitive subjects

## Primary Concerns Addressed

**Primary Concern #7: AI Tools Leaking Sensitive Data**
- 68% of organizations have experienced data leakage from AI tools
- Solution: Local pre-send scanning and context filtering

**Primary Concern #1: Security & Compliance**
- Data residency requirements (GDPR, FSI regulations)
- Solution: Region-based model access controls and guardrails

## Steering Rules

### Security & Compliance

#### excluded-paths.yaml
Defines files and patterns that must never be sent as model context:
- Environment files (`.env`, `.env.*`)
- Secrets directories (`secrets/`, `vault/`)
- Private keys and credentials
- Production configuration files
- Regex patterns for API keys, connection strings, tokens

#### region-config.yaml
Defines data residency and model access controls:
- Allowed Bedrock regions
- PII filtering configuration
- Topic denial lists
- Content filtering settings

### Development Standards (Always Included)

These steering files are automatically included in all Kiro sessions to enforce organizational standards:

#### code-standards.md
Coding standards and best practices:
- Error handling patterns (try-catch, error types, logging)
- Redis usage patterns (connection pooling, error handling, key naming)
- Logging standards (structured logging, PII exclusion, log levels)
- Performance patterns (caching, pagination, lazy loading)

**Inclusion:** `always` - Applied to all sessions

#### security-rules.md
Security requirements and patterns:
- IAM policy standards (least privilege, explicit deny, no wildcards)
- Encryption requirements (at-rest, in-transit, key management)
- Authentication patterns (OAuth2, JWT validation, session management)
- Secrets management (AWS Secrets Manager, no hardcoded credentials)

**Inclusion:** `always` - Applied to all sessions

#### test-requirements.md
Testing standards and expectations:
- Code coverage targets (>80% line coverage, >70% branch coverage)
- Test organization (unit, integration, contract, E2E)
- Negative test cases (error conditions, edge cases, boundary values)
- Performance testing (load tests, stress tests, latency requirements)

**Inclusion:** `always` - Applied to all sessions

### Domain-Specific Standards (Conditionally Included)

These steering files are automatically included when working with relevant file types:

#### aws-patterns.md
AWS service usage patterns and best practices:
- DynamoDB patterns (partition key design, GSI usage, capacity planning)
- Lambda patterns (cold start optimization, memory tuning, error handling)
- SQS patterns (queue types, dead letter queues, visibility timeout)
- S3 patterns (lifecycle policies, versioning, encryption)
- API Gateway patterns (throttling, caching, CORS)
- CloudWatch patterns (metrics, alarms, log insights)
- IAM patterns (roles, policies, resource-based policies)
- VPC patterns (subnets, security groups, NAT gateways)

**Inclusion:** `fileMatch` with pattern `**/infra/**` - Applied when working with infrastructure code

#### api-standards.md
API design and implementation standards:
- REST conventions (resource naming, HTTP methods, status codes)
- Request/response formats (JSON schemas, pagination, filtering)
- Error handling (error codes, error messages, validation errors)
- Versioning strategy (URL versioning, header versioning, deprecation)
- Rate limiting (strategies, headers, error responses)
- CORS configuration (allowed origins, credentials, preflight)
- Authentication (Bearer tokens, API keys, OAuth flows)
- Health checks (readiness, liveness, dependency checks)

**Inclusion:** `fileMatch` with pattern `**/routes/**` - Applied when working with API route handlers

## How Steering Rules Work

Steering rules are enforced **locally on the developer's machine** before any network transmission:

1. **Excluded Paths**: Files matching patterns are blocked from model context
2. **Pre-Send Scanning**: Context buffer is scanned for secrets before transmission
3. **Region Controls**: Model API calls are restricted to allowed regions
4. **Guardrails**: PII filters and topic denials are enforced on responses

All enforcement is local-only—no sensitive data reaches the network.

## Benefits of Steering Files

**Consistency Across Teams**
- All developers follow the same standards automatically
- No need to remember or look up standards during development
- Standards are enforced in real-time as code is written

**Knowledge Preservation**
- Organizational best practices are codified and versioned
- New team members learn standards through AI guidance
- Standards evolve with the team and are always up-to-date

**Reduced Review Cycles**
- Code follows standards from first draft
- Fewer review comments about style and patterns
- Reviews focus on logic and design, not formatting

**AI Quality Improvement**
- AI receives organizational context with every request
- Generates code that matches team conventions
- Suggests patterns that align with your infrastructure

## Usage

### Basic Setup

1. Copy steering rules to your project's `.kiro/steering/` directory
2. Customize patterns, regions, and filters according to inline guides
3. Test with `pre-send-scan.json` hook to verify enforcement
4. Add organization-specific patterns as needed

### Creating Custom Steering Files

Create new `.md` files in `.kiro/steering/` with front-matter:

```markdown
---
inclusion: always
---

# Custom Standards

Your organization-specific standards here...
```

**Inclusion options:**
- `always` - Included in all sessions
- `fileMatch` - Included when working with specific file patterns
  - Add `fileMatchPattern: "**/*.py"` to match Python files
  - Add `fileMatchPattern: "**/tests/**"` to match test files
- `manual` - Included only when explicitly referenced (e.g., `#CustomStandards`)

### Updating Existing Steering Files

1. Edit the steering file in `toolkit/steering/`
2. Changes are automatically picked up in new Kiro sessions
3. Communicate updates to team via PR review
4. Consider versioning major standard changes

## Customization Examples

**Add custom secret patterns**:
```yaml
exclude_patterns:
  - "mycompany-api-key-[0-9a-f]{32}"  # Company-specific API key format
  - "internal-token:[a-zA-Z0-9]+"     # Internal token format
```

**Restrict to single region (GDPR)**:
```yaml
bedrock_config:
  allowed_regions:
    - eu-west-1  # Frankfurt only for GDPR compliance
```

**Add topic denials**:
```yaml
guardrails:
  topic_denial:
    - "customer financial data"
    - "employee salary information"
    - "unreleased product roadmap"
```

## Validation

### Testing Security Steering Rules

Use `pre-send-scan.json` hook to test steering rules:
- Create test files with known secret patterns
- Verify they are blocked from model context
- Check audit logs for blocked transmissions

### Testing Development Standards

Create test scenarios to verify standards are applied:

1. **Code Standards**: Write code that violates error handling patterns
   - AI should suggest proper try-catch blocks
   - AI should recommend structured logging

2. **Security Rules**: Attempt to hardcode a credential
   - AI should recommend AWS Secrets Manager
   - AI should flag the security issue

3. **Test Requirements**: Create a function without tests
   - `require-spec-coverage.json` hook should flag missing tests
   - AI should suggest test cases based on requirements

4. **AWS Patterns**: Write Lambda code with performance issues
   - AI should suggest cold start optimizations
   - AI should recommend proper memory configuration

5. **API Standards**: Create an endpoint with non-standard error codes
   - AI should suggest proper REST status codes
   - AI should recommend standard error response format

### Monitoring Effectiveness

Track the impact of steering files:
- Reduced PR review cycles (fewer style/pattern comments)
- Improved code consistency (automated checks pass more often)
- Faster onboarding (new developers learn standards through AI)
- Better compliance (security and performance standards enforced)
