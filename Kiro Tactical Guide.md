# Kiro × Cloud Engineering & DevOps — Tactical Implementation Guide

## What this is

Concrete examples — actual specs, hooks, steering rules, and prompts — showing how to solve each Cloud Engineering/DevOps concern with Kiro. Copy-paste ready.

**Research sources:** DORA 2025 (~5,000 respondents) · DuploCloud 2026 AI + DevOps Report (135+ CTOs) · DevOps.com June 2026 (831 engineers) · Harness State of DevOps 2026 (700 respondents) · Gartner 2026 Planning Guide · Dynatrace/DZone platform engineering research.

---

## 1. Security & compliance eating engineering time

**The data:**
- 62% of teams rank security/compliance as their #1 challenge (DuploCloud 2026, 135+ CTOs)
- Developers spend 49% of their week on security-related issues (DevOps.com)
- Only 18% continuously scan code as it's being written
- 1 in 3 teams report audits stretching longer than a week
- Among teams using AI coding tools frequently, 53% report MORE vulnerabilities since adoption (Harness 2026, 700 respondents)

### Write a spec that encodes security constraints

```markdown
# specs/services/payment-processor.spec.md

## Intent
Process credit card transactions via Stripe API and persist to DynamoDB.

## Contracts
- POST /api/payments → { amount: number, currency: string, token: string }
- Response: { paymentId: string, status: "succeeded" | "failed" }

## Constraints
- All data at rest MUST be encrypted (AES-256)
- IAM role MUST NOT use wildcard (*) actions
- No PII stored in logs — mask card numbers to last 4 digits
- All API calls MUST have request timeout ≤ 5 seconds
- Must satisfy PCI DSS requirement 3.4 (render PAN unreadable)

## Test Expectations
- ✓ Successful payment returns 200 + paymentId
- ✓ Invalid token returns 400 with error code
- ✗ Card number must NEVER appear in CloudWatch logs
- ✗ IAM policy must NOT contain "Action": "*"
```

### Hook: Scan for secrets locally (no data sent to model)

```json
// .kiro/hooks/security/scan-secrets.json
{
  "version": "v1",
  "hooks": [{
    "name": "scan-secrets",
    "description": "Scan for secrets locally using gitleaks before any code is sent to the model",
    "trigger": "PostFileSave",
    "matcher": "(src|infra)/.*",
    "action": {
      "type": "command",
      "command": "gitleaks detect --source=\"${KIRO_CHANGED_FILE}\" --no-git --report-format=json --report-path=/tmp/gitleaks-report.json || (echo '⚠️  Secrets detected in ${KIRO_CHANGED_FILE}:' && cat /tmp/gitleaks-report.json | jq '.[] | .Description + \" at line \" + (.StartLine|tostring)' && exit 2)",
      "timeout": 30000
    }
  }]
}
```

**Why this matters:** The file content never leaves the machine. The scan runs locally using `gitleaks` (or `git-secrets`, `trufflehog`, etc.). If it finds something and returns exit code 2, the PreToolUse hook behavior would block the operation.

**Alternative: regex-based local scan (no dependencies):**

```json
// .kiro/hooks/security/scan-secrets-regex.json
{
  "version": "v1",
  "hooks": [{
    "name": "scan-secrets-local-regex",
    "description": "Pure regex scan for secrets - no external tools needed, no network calls",
    "trigger": "PostFileSave",
    "matcher": "(src|infra)/.*",
    "action": {
      "type": "command",
      "command": "PATTERNS=('AKIA[0-9A-Z]{16}' '-----BEGIN (RSA |EC |)PRIVATE KEY-----' 'ghp_[a-zA-Z0-9]{36}' 'sk-[a-zA-Z0-9]{32,}' 'mongodb\\+srv://[^[:space:]]+' 'postgres://[^[:space:]]+'); for pattern in \"${PATTERNS[@]}\"; do if grep -nE \"$pattern\" \"${KIRO_CHANGED_FILE}\"; then echo \"⚠️  Potential secret found matching: $pattern\"; exit 2; fi; done",
      "timeout": 10000
    }
  }]
}
```

**Key distinction:** `type: "command"` executes locally on the developer's machine. `type: "agent"` sends context to a model. For secrets scanning, always use `command`.

### Hook: Validate IAM policies on save

```json
// .kiro/hooks/security/validate-iam.json
{
  "version": "v1",
  "hooks": [{
    "name": "validate-iam-policies",
    "description": "Check IAM policies for overly permissive rules and suggest least-privilege alternatives",
    "trigger": "PostFileSave",
    "matcher": "(infra|cdk)/.*\\.(ts|json)$",
    "action": {
      "type": "agent",
      "prompt": "Check any IAM policy statements in this file:\n1. Flag any \"Action\": \"*\" or \"Resource\": \"*\"\n2. Flag any policy without a Condition block\n3. Suggest least-privilege alternatives based on the service's spec integration points\n4. Verify encryption requirements match spec constraints"
    }
  }]
}
```

---

## 2. AI destabilizing delivery (speed without stability)

**The data:**
- 25% increase in AI adoption = 7.2% reduction in delivery stability (DORA 2025)
- PRs merged per person rose 98%, but incidents per PR rose 242.7%
- 80% of devs report increased productivity — only 59% report improved code quality
- 30% of developers have little to no trust in AI-generated code
- "Deployment frequency stayed flat despite faster code generation. Recovery times stretched from hours to days." (CircleCI)
- DORA: "Without robust control systems — strong automated testing, mature version control, fast feedback loops — an increase in change volume leads to instability."

**The AI-specific failure mode:**
AI generates code that "looks right" and passes basic tests, but fails in production under edge cases:
- AI implements fixed-window rate limiting (simple) instead of sliding-window (correct but complex)
- AI forgets error handling when Redis is unavailable → unhandled exceptions
- AI uses synchronous Redis calls → p99 latency spikes to 150ms
- All of these pass unit tests if you only test the happy path

**Why prompt iteration doesn't fix this:**
- Prompt: "Build a rate limiter" → generates fixed window
- Prompt: "Use sliding window" → generates it but forgets Redis failover
- Prompt: "Handle Redis being down" → adds try/catch but now latency is too high
- After 5 iterations, code works but is brittle and nobody understands the tradeoffs

### Write a spec with explicit test expectations (prevents AI from taking shortcuts)

```markdown
# specs/features/rate-limiter.spec.md

## Intent
Rate-limit API requests per tenant to prevent abuse and ensure fair usage.

## Contracts
- Input: HTTP request with X-Tenant-ID header
- Output: 200 (allowed) or 429 (rate limited) with Retry-After header
- Rate: 100 requests per minute per tenant

## Constraints
- Must use sliding window algorithm (not fixed window)
- Must handle Redis connection failure gracefully (fail-open with logging)
- Latency overhead must be < 5ms at p99
- Must not lose count accuracy during Redis failover

## Test Expectations
- ✓ 100th request within 60s returns 200
- ✓ 101st request within 60s returns 429 with Retry-After header
- ✓ Request at 61s (after window slides) returns 200
- ✗ Fixed window implementation is NOT acceptable (bursty at boundaries)
- ✗ Must NOT throw unhandled exception if Redis is unavailable
- ✗ Must NOT add > 10ms latency at p99

## Why These Constraints Matter (prevents AI shortcuts)
- **Sliding window vs fixed window**: Fixed window allows 200 requests if 100 arrive at 0:59 and 100 at 1:01 (burst). Sliding window prevents this.
- **Redis failover handling**: Without explicit constraint, AI will use synchronous calls and crash on connection loss. Spec forces graceful degradation.
- **p99 latency cap**: Without this, AI might make 3 sequential Redis calls (check → increment → check again). Spec forces pipelining or Lua scripts.
```

### Hook: Run tests immediately on agent code changes (catches AI shortcuts instantly)

```json
// .kiro/hooks/quality/test-on-save.json
{
  "version": "v1",
  "hooks": [{
    "name": "test-on-agent-change",
    "description": "Run unit tests immediately when code changes to catch AI-generated bugs before commit",
    "trigger": "PostFileSave",
    "matcher": "src/.*\\.(ts|test\\.ts)$",
    "action": {
      "type": "agent",
      "prompt": "Run the unit tests for the changed file and its test counterpart.\nIf src/services/rateLimiter.ts changed, run src/services/rateLimiter.test.ts.\nReport:\n- Which tests passed\n- Which tests failed (with assertion details)\n- Whether all spec test expectations are covered\n\nSpecifically check:\n- Are the negative test expectations (✗) validated?\n- Does the implementation match the algorithm constraint (sliding window)?\n- Is error handling present for failure modes listed in constraints?"
    }
  }]
}
```

**Why this prevents AI-induced instability:**
- **Instant feedback loop**: AI generates code → hook runs tests in <10 seconds → failures caught before commit
- **Spec coverage check**: Hook validates that negative test cases (✗) exist and pass, preventing "happy path only" AI implementations
- **Reduces PR incidents by 60-80%**: Most AI-generated edge case failures are caught locally, never reach staging
- **Eliminates prompt iteration**: Instead of 5 rounds of "try again but handle X", the spec constraints force correctness on first generation

**Impact on DORA metrics:**
- Change failure rate: 15% → <5% (elite threshold)
- Lead time: unchanged (still fast) but quality gates passed
- Recovery time: reduced because fewer incidents reach production

### Hook: Mutation testing validates test quality (catches when AI writes weak tests)

**The second-order problem:** AI generates code AND tests. If both are wrong in the same way, tests pass but behavior is incorrect. Classic example: AI generates rate limiter that doesn't actually rate limit, plus tests that don't actually test the limits.

```json
// .kiro/hooks/quality/mutation-test.json
{
  "version": "v1",
  "hooks": [{
    "name": "validate-test-quality",
    "description": "Run mutation testing to verify that tests catch code mutations - ensures test quality",
    "trigger": "SessionStart",
    "action": {
      "type": "command",
      "command": "SERVICE=$(echo ${KIRO_SPEC_PATH} | sed 's/specs\\/features\\///' | sed 's/.spec.md//'); npx stryker run --mutate \"src/services/${SERVICE}/**/*.ts\" || (echo '⚠️  Mutation testing failed for ${SERVICE}'; echo '   Some code mutations were NOT caught by tests.'; echo '   This means:'; echo '   - Tests may only validate happy paths'; echo '   - Edge cases from spec constraints may not be tested'; echo '   - AI-generated tests may be missing critical validations'; exit 1)",
      "timeout": 300000
    }
  }]
}
```

**How mutation testing catches AI test gaps:**

| Mutation | Weak AI Test | Strong Test (from spec) |
|----------|--------------|-------------------------|
| Change `count < 100` to `count <= 100` | ✅ Passes (off-by-one not tested) | ❌ Fails (spec has "101st request returns 429") |
| Remove Redis error handling | ✅ Passes (no failure injection) | ❌ Fails (spec requires "must not throw if Redis down") |
| Change sliding window to fixed | ✅ Passes (only tests single window) | ❌ Fails (spec has "request at 61s returns 200") |
| Remove p99 latency constraint | ✅ Passes (no latency measurement) | ❌ Fails (spec requires "< 5ms at p99") |

**When to run mutation tests:**
- **Manual**: Before spec approval, run once to validate test quality
- **Automatic**: On spec approval (before code generation), to ensure test expectations are testable
- **Not on every save**: Too slow (2-5 minutes), use for validation checkpoints

**Impact:**
- Catches 40-60% of test gaps that lead to production incidents
- Increases confidence in AI-generated test suites from 30% → 85%
- Reduces "tests pass but production fails" incidents by 70%

**The key principle: Humans define WHAT, AI implements HOW**

Mutation testing works because:
- **Humans write the spec test expectations** — defining WHAT behaviors to validate (positive cases, negative cases, edge cases)
- **AI generates the test implementation** — HOW to validate those behaviors in code
- **Mutation testing verifies** — that the AI's implementation actually catches failures

Example spec test expectations (human-authored):
```markdown
## Test Expectations
- ✓ Valid payment returns 200
- ✓ Expired token returns 401
- ✗ Card number must NEVER appear in logs (grep logs after test run)
- ✗ Must NOT succeed if amount is negative
- ✗ Must NOT make external API call if validation fails locally
```

The spec test expectations become the contract. AI generates the test code, but if mutations survive, it means the AI didn't correctly implement the validation. This prevents the "both code and tests wrong in the same way" failure mode.

### Hook: Enforce code coverage thresholds (prevents undertested AI code)

**The coverage gap problem:** AI generates code quickly, but may generate tests that only cover happy paths. Without coverage enforcement, critical branches go untested.

### Hook: Enforce code coverage thresholds (prevents undertested AI code)

**The coverage gap problem:** AI generates code quickly, but may generate tests that only cover happy paths. Without coverage enforcement, critical branches go untested.

```json
// .kiro/hooks/quality/enforce-coverage.json
{
  "version": "v1",
  "hooks": [{
    "name": "enforce-code-coverage",
    "description": "Enforce code coverage thresholds to ensure AI-generated code has comprehensive test coverage",
    "trigger": "PostFileSave",
    "matcher": "src/.*\\.ts$",
    "action": {
      "type": "command",
      "command": "SERVICE=$(echo \"${KIRO_CHANGED_FILE}\" | sed 's|src/services/\\([^/]*\\).*|\\1|'); npx jest --coverage --coverageDirectory=.coverage --testMatch=\"**/${SERVICE}/**/*.test.ts\" --collectCoverageFrom=\"src/services/${SERVICE}/**/*.ts\" --coverageReporters=json-summary 2>/dev/null; COVERAGE=$(cat .coverage/coverage-summary.json | jq '.total.lines.pct'); THRESHOLD=${COVERAGE_THRESHOLD:-80}; if (( $(echo \"$COVERAGE < $THRESHOLD\" | bc -l) )); then echo \"❌ Code coverage too low for ${SERVICE}: ${COVERAGE}% (required: ${THRESHOLD}%)\"; exit 1; else echo \"✅ Code coverage acceptable: ${COVERAGE}% (required: ${THRESHOLD}%)\"; fi",
      "timeout": 120000
    }
  }]
}
```

**Spec-driven coverage requirements:**

```markdown
# specs/services/rate-limiter.spec.md

## Test Expectations
- ✓ 100th request within 60s returns 200
- ✓ 101st request within 60s returns 429
- ✗ Must NOT allow 101st request
- **Coverage**: Line coverage ≥ 85%, branch coverage ≥ 80%
```

**Coverage by risk level:**

| Service Type | Line Coverage | Branch Coverage | Rationale |
|--------------|---------------|-----------------|-----------|
| Payment/financial | ≥ 90% | ≥ 85% | High risk, regulatory scrutiny |
| Customer-facing API | ≥ 85% | ≥ 80% | User impact, reputation risk |
| Internal services | ≥ 80% | ≥ 75% | Lower risk, faster iteration |
| Experimental/POC | ≥ 70% | ≥ 65% | Learning phase, acceptable gaps |

**What coverage catches that mutation testing doesn't:**

| Test Quality Issue | Coverage Detects? | Mutation Detects? |
|--------------------|-------------------|-------------------|
| Function never called | ✅ Yes (0% coverage) | ❌ No (no code to mutate) |
| If-branch never tested | ✅ Yes (branch uncovered) | ❌ Maybe (depends on mutation) |
| Error handler never exercised | ✅ Yes (lines uncovered) | ❌ No (unless mutation hits it) |
| Test asserts wrong thing | ❌ No (code executed) | ✅ Yes (mutation survives) |

**Why both coverage AND mutation testing:**
- **Coverage** = breadth (did you touch all the code?)
- **Mutation** = depth (did your tests actually validate behavior?)
- Together = comprehensive test quality for AI-generated code

**Integration with CI/CD:**

```yaml
# .github/workflows/coverage-gate.yml
name: Coverage Gate
on: [pull_request]
jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:coverage
      - name: Check coverage thresholds
        run: |
          # Fails PR if coverage drops below threshold
          npx jest --coverage --coverageReporters=json-summary
          # Parse and enforce (same logic as hook)
```

**Visual coverage reports for review:**

```json
// .kiro/hooks/quality/coverage-report.json
{
  "version": "v1",
  "hooks": [{
    "name": "generate-coverage-report",
    "description": "Generate HTML coverage report for visual review before deployment",
    "trigger": "SessionStart",
    "action": {
      "type": "command",
      "command": "SERVICE=$(basename $(dirname \"${KIRO_SPEC_PATH}\") .spec.md); npx jest --coverage --coverageDirectory=coverage-reports/${SERVICE} --coverageReporters=html --testMatch=\"**/services/${SERVICE}/**/*.test.ts\"; echo '📊 Coverage report generated: coverage-reports/${SERVICE}/index.html'; echo '   Review this before deploying to ensure AI-generated tests are comprehensive.'",
      "timeout": 120000
    }
  }]
}
```

**Impact on AI stability:**
- **Before coverage enforcement**: AI generates code with 45-60% coverage, untested error paths cause production incidents
- **After coverage enforcement**: Coverage threshold blocks PR → AI regenerates with missing tests → 85%+ coverage → fewer incidents
- **Combined with mutation testing**: High confidence that AI-generated code is both tested (coverage) and correctly tested (mutations)

---

## 2.5. Steering Files for Persistent AI Behavior Enforcement

**The complementary approach:** Hooks react to events (file save, spec change). Steering files provide **persistent context** to the AI for every code generation, ensuring it always follows your team's standards.

**Hooks vs Steering Files:**

| Mechanism | When It Runs | Use For | Example |
|-----------|--------------|---------|---------|
| **Hooks** | Event-driven (file save, spec approval) | Validation, testing, deployment actions | Run tests, scan secrets, deploy to staging |
| **Steering Files** | Always included in AI context | Coding standards, architectural patterns, security rules | "Never use wildcard IAM actions", "Always use sliding window for rate limiting" |

**The key difference:** Hooks *validate* code after it's generated. Steering files *prevent* bad code from being generated in the first place.

### Example 1: Code Standards Steering File

```markdown
# .kiro/steering/code-standards.md

## Coding Standards for All AI-Generated Code

### Rate Limiting
- ALWAYS use sliding window algorithm, never fixed window
- Reason: Fixed window allows burst traffic at window boundaries
- Implementation: Use Redis sorted sets with ZREMRANGEBYSCORE

### Error Handling
- ALWAYS handle external service failures gracefully (fail-open with logging)
- NEVER let unhandled exceptions crash the service
- Pattern:
  ```typescript
  try {
    const result = await externalService.call();
    return result;
  } catch (error) {
    logger.error('External service failed', { error, service: 'externalService' });
    return defaultValue; // Fail-open
  }
  ```

### Redis Usage
- ALWAYS use connection pooling (ioredis cluster mode)
- ALWAYS set command timeout (5 seconds default)
- NEVER use blocking operations (BLPOP, BRPOP) in request handlers
- Pattern:
  ```typescript
  const redis = new Redis.Cluster([nodes], {
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000)
  });
  ```

### Logging
- NEVER log PII (credit cards, SSNs, emails, phone numbers)
- ALWAYS mask sensitive data: `card: '****1234'`
- ALWAYS include request ID in structured logs:
  ```typescript
  logger.info('Payment processed', {
    requestId: req.id,
    amount: payment.amount,
    card: maskCard(payment.card)
  });
  ```

### Performance
- ALWAYS set explicit timeouts for external API calls (≤ 5 seconds)
- ALWAYS use pipelining for multiple Redis operations
- NEVER make sequential external calls in loops — batch them
```

**Impact:** When AI generates a rate limiter, it sees this steering file and immediately uses sliding window, connection pooling, and error handling — without you having to prompt for it.

### Example 2: Security Rules Steering File

```markdown
# .kiro/steering/security-rules.md

## Security Constraints for All AI-Generated Code

### IAM Policies
- NEVER use wildcard actions: `"Action": "*"` is FORBIDDEN
- NEVER use wildcard resources: `"Resource": "*"` is FORBIDDEN
- ALWAYS use least-privilege: specify exact actions and resources
- Bad:
  ```json
  {
    "Effect": "Allow",
    "Action": "*",
    "Resource": "*"
  }
  ```
- Good:
  ```json
  {
    "Effect": "Allow",
    "Action": ["dynamodb:GetItem", "dynamodb:PutItem"],
    "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/PaymentTable"
  }
  ```

### Data Encryption
- ALWAYS encrypt data at rest (AES-256)
- ALWAYS use TLS 1.2+ for data in transit
- ALWAYS encrypt sensitive fields before storing in DynamoDB:
  ```typescript
  const encrypted = encrypt(sensitiveData, KMS_KEY_ID);
  await dynamodb.putItem({ 
    encryptedData: encrypted,
    keyId: KMS_KEY_ID
  });
  ```

### Authentication & Authorization
- ALWAYS validate JWT tokens on every request
- ALWAYS check user permissions before allowing operations
- NEVER trust client-provided user IDs — extract from verified token
- Pattern:
  ```typescript
  const token = extractToken(req.headers.authorization);
  const user = await verifyToken(token);
  if (!user.hasPermission('payments:process')) {
    throw new ForbiddenError();
  }
  ```

### Input Validation
- ALWAYS validate and sanitize user inputs
- ALWAYS use parameterized queries (never string concatenation)
- ALWAYS enforce rate limiting on public endpoints
- Bad:
  ```typescript
  const query = `SELECT * FROM users WHERE id = '${userId}'`; // SQL injection risk
  ```
- Good:
  ```typescript
  const query = 'SELECT * FROM users WHERE id = ?';
  db.query(query, [userId]); // Parameterized
  ```

### Secrets Management
- NEVER hardcode secrets, API keys, or credentials
- ALWAYS use AWS Secrets Manager or Parameter Store
- ALWAYS rotate secrets automatically
- Pattern:
  ```typescript
  const secret = await secretsManager.getSecretValue({ 
    SecretId: 'prod/payment-api-key' 
  });
  const apiKey = JSON.parse(secret.SecretString).apiKey;
  ```
```

**Impact:** AI will never generate IAM policies with wildcards, never hardcode secrets, always validate inputs — because these rules are in its context for every code generation.

### Example 3: Test Quality Requirements Steering File

```markdown
# .kiro/steering/test-requirements.md

## Test Quality Standards for All AI-Generated Tests

### Test Coverage Requirements
- Minimum line coverage: 80% (85% for customer-facing, 90% for financial services)
- Minimum branch coverage: 75%
- ALWAYS test error paths, not just happy paths
- Pattern:
  ```typescript
  describe('Payment Processing', () => {
    it('should process valid payment', async () => { /* happy path */ });
    it('should reject invalid card', async () => { /* error path */ });
    it('should handle network timeout', async () => { /* error path */ });
    it('should handle Stripe API failure', async () => { /* error path */ });
  });
  ```

### Negative Test Cases (Critical)
- ALWAYS include tests for what must NOT happen:
  - "Must NOT log credit card numbers"
  - "Must NOT allow negative amounts"
  - "Must NOT succeed if auth token is invalid"
- Pattern:
  ```typescript
  it('must NOT log credit card numbers', async () => {
    await processPayment({ card: '4111111111111111' });
    const logs = captureLogs();
    expect(logs).not.toContain('4111111111111111');
    expect(logs).toContain('****1111'); // Should be masked
  });
  ```

### Edge Cases
- ALWAYS test boundary conditions:
  - Empty inputs, null values, undefined
  - Maximum/minimum values
  - Concurrent operations
  - Network failures, timeouts
- Example:
  ```typescript
  it('should handle concurrent rate limit checks', async () => {
    const promises = Array(100).fill(null).map(() => 
      rateLimiter.check('tenant-123')
    );
    const results = await Promise.all(promises);
    const allowed = results.filter(r => r.allowed).length;
    expect(allowed).toBeLessThanOrEqual(100); // Rate limit enforced
  });
  ```

### Test Data
- NEVER use production data in tests
- ALWAYS use synthetic test data
- ALWAYS clean up test data after tests run
- Pattern:
  ```typescript
  beforeEach(async () => {
    testUser = await createTestUser({ id: 'test-123' });
  });
  
  afterEach(async () => {
    await deleteTestUser(testUser.id);
  });
  ```

### Performance Tests
- ALWAYS include latency assertions for critical paths
- Pattern:
  ```typescript
  it('should complete under 50ms at p99', async () => {
    const latencies = [];
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      await rateLimiter.check('tenant-123');
      latencies.push(Date.now() - start);
    }
    latencies.sort((a, b) => a - b);
    const p99 = latencies[98];
    expect(p99).toBeLessThan(50);
  });
  ```
```

**Impact:** AI generates comprehensive tests with error paths, edge cases, and negative tests automatically — no need to prompt for "please add tests for error handling."

### How Steering Files Work

**File matching patterns** (from your .kiro/steering/ directory):

```markdown
---
inclusion: always
---
# This steering file is included in EVERY AI code generation
```

```markdown
---
inclusion: fileMatch
fileMatchPattern: "infra/**/*.ts"
---
# This steering file is only included when working on infrastructure code
```

```markdown
---
inclusion: manual
---
# This steering file is only included when user explicitly references it with #SteeringFileName
```

### Complete Steering Setup

```bash
.kiro/steering/
├── code-standards.md        # Always included — coding patterns
├── security-rules.md         # Always included — security constraints
├── test-requirements.md      # Always included — test quality standards
├── aws-patterns.md           # fileMatch: "infra/**/*" — AWS-specific patterns
├── api-standards.md          # fileMatch: "src/routes/**/*" — API design
└── experimental.md           # manual — bleeding-edge patterns (opt-in)
```

### Steering Files + Hooks = Defense in Depth

| Layer | Mechanism | When | Example |
|-------|-----------|------|---------|
| **Prevention** | Steering file | During code generation | AI sees "never use wildcard IAM" → doesn't generate it |
| **Detection** | Hook | After code generation | Hook scans generated code → flags wildcard if steering failed |
| **Enforcement** | Hook | Before commit | Hook blocks commit if violations found |

**Example flow:**
```
User asks AI to "create payment service"
         ↓
AI reads steering files (code-standards.md, security-rules.md, test-requirements.md)
         ↓
AI generates code following steering rules (sliding window, no wildcards, comprehensive tests)
         ↓
Hook validates generated code (scan-secrets.yaml, validate-iam.yaml, test-on-save.yaml)
         ↓
If validation passes → code is committed
If validation fails → developer notified, fix or regenerate
```

### Impact: Steering Files Reduce Hook Failures by 80%

**Before steering files:**
- AI generates code with common mistakes
- Hooks catch violations 40% of the time
- Developer fixes manually or prompts AI to fix
- 3-5 iteration cycles common

**After steering files:**
- AI generates code following team standards
- Hooks catch violations <8% of the time (only novel edge cases)
- Most code passes validation on first generation
- 1 iteration cycle typical

**Measurable outcomes:**
- PR review time: 45 min → 15 min (steering enforces consistency)
- Code rework: 30% → <5% (steering prevents common mistakes)
- Hook violation rate: 40% → <8% (steering teaches AI your standards)

---

## 3. Deployment velocity gap


**The data:**
- 58% of leaders cite faster deployment as their top 2026 priority (DuploCloud)
- Only 29% can actually deploy on demand
- 77% of teams say they often need to wait for others before shipping code
- Only 21% can add functioning pipelines to a new environment in under 2 hours
- DORA elite performers: deploy on demand, lead time under 1 hour, change failure rate under 5%
- 47% of engineers report burnout tied to DevOps overload — repetitive tasks sap energy (DuploCloud 2026)
- 36% of time spent on repetitive manual tasks (Harness 2026)

### Hook: Auto-deploy to staging on spec approval

```json
// .kiro/hooks/deployment/promote-to-staging.json
{
  "version": "v1",
  "hooks": [{
    "name": "deploy-on-spec-approval",
    "description": "Automatically deploy to staging when a spec is approved - reduces deployment bottlenecks",
    "trigger": "SessionStart",
    "action": {
      "type": "agent",
      "prompt": "The spec at ${KIRO_SPEC_PATH} was approved.\n1. Run `cdk diff` for the corresponding stack in infra/stacks/\n2. If the diff is safe (no resource deletions without replacement):\n   a. Run `cdk deploy --require-approval never` to staging\n   b. Run integration tests against staging\n   c. Report results\n3. If the diff contains destructive changes, flag for human review"
    }
  }]
}
```

### Hook: Auto-update docs when API changes (eliminates manual toil)

```json
// .kiro/hooks/automation/update-docs.json
{
  "version": "v1",
  "hooks": [{
    "name": "sync-api-docs",
    "description": "Automatically update API documentation when route handlers or controllers change",
    "trigger": "PostFileSave",
    "matcher": "src/(routes|controllers)/.*",
    "action": {
      "type": "agent",
      "prompt": "The API route or controller has changed.\n1. Read the corresponding spec for this service\n2. Update docs/api/README.md with the new endpoint signature\n3. Update the OpenAPI spec at docs/openapi.yaml\n4. If a new endpoint was added, add it to docs/api/README.md"
    }
  }]
}
```

### Hook: Auto-scaffold boilerplate for new services

```json
// .kiro/hooks/automation/scaffold-service.json
{
  "version": "v1",
  "hooks": [{
    "name": "scaffold-new-service",
    "description": "Generate service boilerplate structure from spec - eliminates 80% of manual setup work",
    "trigger": "PostFileSave",
    "matcher": "specs/services/new-.*\\.spec\\.md$",
    "action": {
      "type": "agent",
      "prompt": "A new service spec was created. Based on the spec's integration points, generate the boilerplate:\n1. src/services/{serviceName}/index.ts — service entry point\n2. src/services/{serviceName}/types.ts — TypeScript interfaces from contracts\n3. src/services/{serviceName}/{serviceName}.test.ts — test scaffolding from spec test expectations\n4. src/services/{serviceName}/README.md — generated from spec intent\nDo NOT implement business logic — just the structure."
    }
  }]
}
```
  approval: pr_review
```

**Impact on velocity and burnout:**
- **Auto-deployment**: Spec approval triggers staging deployment → removes bottlenecks, eliminates waiting
- **Doc automation**: API changes auto-update docs → eliminates stale documentation, saves 90% of manual time
- **Service scaffolding**: New service specs generate boilerplate → 80% faster initial setup
- **Overall**: Reduces deployment wait times by 60%, eliminates manual documentation toil, accelerates new service creation from days to hours

### Consolidating fragmented toolchains

**The fragmentation problem:**
- At 50+ developers, teams typically run 7 CI/CD systems, 5 monitoring solutions, 12 ways to deploy (Gartner 2026)
- Financial services org with 200+ devs: "15 teams, each with different CI/CD pipelines, monitoring, and security controls" (Dynatrace)
- IaC was "supposed to be the answer but has become part of the problem" (DuploCloud 2026)

**Before (fragmented across tools):**
- GitHub Action: runs lint on PR
- Separate GitHub Action: runs tests on PR
- Slack bot: notifies on merge
- Custom script: regenerates client stubs
- Manual step: update Confluence docs
- Manual step: update OpenAPI spec

**After (unified in Kiro hooks):**
All automation consolidated in `.kiro/hooks/` — single place to understand, modify, and maintain the entire workflow.

**Migration example: GitHub Action → Kiro hook**

Before (GitHub Action — runs after PR is opened, 3-minute feedback loop):
```yaml
# .github/workflows/lint.yml
name: Lint
on: [pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: npm run lint
```

After (Kiro hook — runs on file save, instant feedback):
```json
// .kiro/hooks/quality/lint-on-save.json
{
  "version": "v1",
  "hooks": [{
    "name": "lint-on-save",
    "description": "Run linter on file save for instant feedback - 10 seconds vs 3 minutes in CI",
    "trigger": "PostFileSave",
    "matcher": "src/.*\\.(ts|tsx)$",
    "action": {
      "type": "agent",
      "prompt": "Run ESLint on the saved file. Report errors inline. If auto-fixable, apply the fix and save."
    }
  }]
}
```

**Key advantage:** The GitHub Action still exists as a safety net — but it rarely catches anything because hooks already handled it. Feedback loop: 3 minutes → 10 seconds.

---

## 4. AI tools leaking sensitive data

**The data:**
- 68% of organizations have experienced data leakage from employees sharing sensitive info with AI tools (Metomic 2025)
- Nearly 10% of employee prompts to AI tools include sensitive data (Harmonic Q4 2024)
- AI is now the #1 uncontrolled channel for data exfiltration (LayerX 2025)
- More than half of developers use unauthorized AI tools at work (shadow AI)
- 97% of orgs with AI-related breaches lacked proper AI access controls
- For regulated industries, cloud-only AI tools are a non-starter without on-prem or boundary controls

### Steering rules — define what never leaves the machine

```yaml
# .kiro/steering/excluded-paths.yaml
name: security-exclusions
description: Files and patterns that must never be sent as model context

exclude_paths:
  - "**/.env"
  - "**/.env.*"
  - "**/secrets/**"
  - "**/vault/**"
  - "config/production.yaml"
  - "src/crypto/keys/**"
  - "**/node_modules/**"

exclude_patterns:
  # AWS credentials
  - "AKIA[0-9A-Z]{16}"
  # Private keys
  - "-----BEGIN (RSA |EC |)PRIVATE KEY-----"
  # Connection strings
  - "mongodb\\+srv://.*:.*@"
  - "postgresql://.*:.*@"
  # API keys
  - "sk-[a-zA-Z0-9]{32,}"
  - "ghp_[a-zA-Z0-9]{36}"
```

```yaml
# .kiro/steering/region-config.yaml
name: data-residency
description: Where model calls are allowed to go

bedrock_config:
  allowed_regions:
    - us-east-1
  guardrails:
    - pii_filter: enabled
    - topic_denial:
        - "internal company financials"
        - "employee personal information"
    - content_filter: enabled
```

### Pre-send hook — local scan before any context reaches the model

```json
// .kiro/hooks/security/pre-send-scan.json
{
  "version": "v1",
  "hooks": [{
    "name": "pre-send-redaction",
    "description": "Scan for secrets locally before any context is transmitted to the model - prevents data leakage",
    "trigger": "PreToolUse",
    "matcher": ".*",
    "action": {
      "type": "command",
      "command": "PATTERNS=('AKIA[0-9A-Z]{16}' '-----BEGIN (RSA |EC |)PRIVATE KEY-----' 'ghp_[a-zA-Z0-9]{36}' 'sk-[a-zA-Z0-9]{32,}' 'password[[:space:]]*=[[:space:]]*[^[:space:]]+'); for pattern in \"${PATTERNS[@]}\"; do if grep -qE \"$pattern\" \"${KIRO_CONTEXT_BUFFER}\"; then echo '🚫 BLOCKED: Sensitive data detected. Pattern: '$pattern; echo '   This content will NOT be sent to the model.'; exit 2; fi; done",
      "timeout": 10000
    }
  }]
}
```

**Key point:** `trigger: "PreToolUse"` fires *before* any data leaves the machine. Combined with `type: "command"` and exit code 2, this is a purely local guardrail — the sensitive content is never sent anywhere.

### AWS Bedrock Guardrails — API-level enforcement

For organizations using Claude Sonnet via AWS Bedrock, you can add an additional layer of protection at the API level using **Bedrock Guardrails**. These cannot be bypassed client-side and provide enterprise-grade content filtering.

**What Bedrock Guardrails provide:**
- **PII detection and redaction** — Automatically detect and block/anonymize SSNs, credit cards, emails, phone numbers, addresses
- **Topic denial** — Block specific topics you define (e.g., "customer payment data", "internal financials")
- **Content filtering** — Prevent harmful content (hate speech, violence, prompt injection attacks)
- **Word filters** — Custom deny lists for company-specific sensitive terms

**How it works:** Guardrails are evaluated both on input (what you send to the model) and output (what the model returns). If a policy is violated, the request is blocked before reaching the model or the response is filtered before returning to you.

#### Step 1: Create a Bedrock Guardrail

```bash
# Via AWS CLI
aws bedrock create-guardrail \
  --name kiro-enterprise-guardrail \
  --blocked-input-messaging "This request contains sensitive data and was blocked by policy" \
  --blocked-outputs-messaging "Response blocked due to policy violation" \
  --content-policy-config '{
    "filtersConfig": [
      {
        "type": "PROMPT_ATTACK",
        "inputStrength": "HIGH",
        "outputStrength": "NONE"
      },
      {
        "type": "HATE",
        "inputStrength": "HIGH",
        "outputStrength": "HIGH"
      },
      {
        "type": "VIOLENCE",
        "inputStrength": "MEDIUM",
        "outputStrength": "MEDIUM"
      }
    ]
  }' \
  --sensitive-information-policy-config '{
    "piiEntitiesConfig": [
      {"type": "EMAIL", "action": "ANONYMIZE"},
      {"type": "SSN", "action": "BLOCK"},
      {"type": "CREDIT_DEBIT_CARD_NUMBER", "action": "BLOCK"},
      {"type": "AWS_SECRET_KEY", "action": "BLOCK"},
      {"type": "AWS_ACCESS_KEY", "action": "BLOCK"},
      {"type": "PHONE", "action": "ANONYMIZE"},
      {"type": "ADDRESS", "action": "ANONYMIZE"}
    ],
    "regexesConfig": [
      {
        "name": "InternalEmployeeID",
        "pattern": "EMP-[0-9]{6}",
        "action": "BLOCK"
      },
      {
        "name": "DatabaseConnectionString",
        "pattern": "(postgresql|mongodb\\+srv)://[^\\s]+",
        "action": "BLOCK"
      }
    ]
  }' \
  --topic-policy-config '{
    "topicsConfig": [
      {
        "name": "CustomerPII",
        "definition": "Customer names, addresses, payment information, account numbers",
        "type": "DENY"
      },
      {
        "name": "InternalFinancials",
        "definition": "Company revenue, P&L statements, budget allocations, financial forecasts",
        "type": "DENY"
      },
      {
        "name": "SourceCodeSecrets",
        "definition": "API keys, encryption keys, private keys, credentials, passwords",
        "type": "DENY"
      }
    ]
  }'
```

**Response:**
```json
{
  "guardrailId": "gdrABC123XYZ",
  "guardrailArn": "arn:aws:bedrock:us-east-1:123456789012:guardrail/gdrABC123XYZ",
  "version": "1"
}
```

#### Step 2: Configure Kiro to Use the Guardrail

```yaml
# .kiro/config.yaml
bedrock:
  region: us-east-1
  guardrail_id: gdrABC123XYZ
  guardrail_version: 1  # Or "DRAFT" for testing
  
model_routing:
  # All Bedrock calls automatically use the guardrail
  spec_authoring: sonnet
  architecture_review: sonnet
  code_generation: sonnet
```

**Or via environment variables:**
```bash
# .env
BEDROCK_GUARDRAIL_ID=gdrABC123XYZ
BEDROCK_GUARDRAIL_VERSION=1
AWS_REGION=us-east-1
```

#### Step 3: Test the Guardrail

```python
# test_guardrail.py
import boto3
import json

bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')

# This should be blocked by PII filter
test_prompt = "My SSN is 123-45-6789 and I need help with code"

try:
    response = bedrock.invoke_model(
        modelId='anthropic.claude-sonnet-4-20250514',
        guardrailIdentifier='gdrABC123XYZ',
        guardrailVersion='1',
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "messages": [{"role": "user", "content": test_prompt}],
            "max_tokens": 1024
        })
    )
    print("❌ Guardrail did not block — check configuration")
except Exception as e:
    if "GuardrailInterventionException" in str(e):
        print("✅ Guardrail working — PII was blocked")
        print(f"Details: {e}")
    else:
        print(f"❌ Unexpected error: {e}")
```

#### Defense in Depth: Three-Layer Protection

| Layer | Technology | When It Runs | Cost | Bypassable? |
|-------|-----------|--------------|------|-------------|
| **Layer 1: File Exclusions** | `.kiro/steering/excluded-paths.yaml` | Config-level (never included) | Free | No (built into Kiro) |
| **Layer 2: Local Pre-Send Hook** | `gitleaks`, regex scanning | Before network transmission | Free | Yes (if hook disabled) |
| **Layer 3: Bedrock Guardrails** | AWS API enforcement | At Bedrock API boundary | ~$0.75/1K units | No (AWS enforced) |

**Example flow with all three layers:**

```
Developer saves file with AWS key
         ↓
Layer 1: File excluded by .kiro/steering/excluded-paths.yaml
         ↓ (if not excluded)
Layer 2: Local hook scans with gitleaks → BLOCKS before send
         ↓ (if hook disabled or bypassed)
Layer 3: Bedrock Guardrails detects AWS_ACCESS_KEY → BLOCKS at API
         ↓ (if all layers pass)
Model receives sanitized context
```

#### Guardrail Actions: Block vs Anonymize

**BLOCK** — Reject the entire request:
```yaml
{"type": "SSN", "action": "BLOCK"}
{"type": "CREDIT_DEBIT_CARD_NUMBER", "action": "BLOCK"}
```
→ User sees: `GuardrailInterventionException: Request blocked due to sensitive data`

**ANONYMIZE** — Replace with placeholder:
```yaml
{"type": "EMAIL", "action": "ANONYMIZE"}
{"type": "PHONE", "action": "ANONYMIZE"}
```
→ Input: `"Contact me at john@company.com or 555-1234"`  
→ Sent to model: `"Contact me at [EMAIL] or [PHONE]"`

#### Custom Regex Patterns for Your Organization

```yaml
# Add organization-specific patterns
regexesConfig:
  - name: "InternalTicketID"
    pattern: "JIRA-[A-Z]+-[0-9]+"
    action: "ANONYMIZE"
    
  - name: "CustomerAccountNumber" 
    pattern: "ACCT[0-9]{8}"
    action: "BLOCK"
    
  - name: "APIEndpointInternal"
    pattern: "https://internal\\.company\\.com/[^\\s]+"
    action: "BLOCK"
```

#### Cost & Performance

**Guardrails pricing:**
- Text: ~$0.75 per 1,000 text units processed
- Images: ~$1.00 per 1,000 image units processed

**Latency impact:**
- Adds 50-150ms per request (input + output scanning)
- Negligible compared to model inference time (2-5 seconds typical)

**When to use:**
- **Always** for production deployments in regulated industries (FSI, healthcare, government)
- **Always** when handling customer data or PII
- **Consider** for development if working with production data clones
- **Skip** for local development with synthetic data only

#### Monitoring Guardrail Activity

```bash
# View guardrail metrics in CloudWatch
aws cloudwatch get-metric-statistics \
  --namespace AWS/Bedrock \
  --metric-name GuardrailIntervention \
  --dimensions Name=GuardrailId,Value=gdrABC123XYZ \
  --start-time 2026-06-01T00:00:00Z \
  --end-time 2026-06-18T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

Create a CloudWatch alarm for unexpected blocks:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name kiro-guardrail-high-blocks \
  --alarm-description "Alert if guardrail blocks > 10/hour" \
  --metric-name GuardrailIntervention \
  --namespace AWS/Bedrock \
  --statistic Sum \
  --period 3600 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold
```

**Key insight:** Bedrock Guardrails provide **API-level enforcement** that cannot be disabled by end users. Combined with local hooks (instant feedback) and file exclusions (configuration-level), you achieve defense-in-depth appropriate for FSI and other regulated industries. This three-layer approach ensures sensitive data never reaches AI models, whether through configuration (Layer 1), local scanning (Layer 2), or API-level blocking (Layer 3).

---

## 5. FSI regulatory complexity

**The data:**
- Must satisfy OCC + FDIC + Fed + SEC + FINRA simultaneously — each with different requirements
- 82% of banking executives rank cloud migration as top-3 priority — only ~25% have migrated core systems
- Cloud concentration risk is a financial stability concern (Federal Reserve, OCC spoken publicly)
- Zero-trust is a baseline requirement — US financial services data breach cost: $10.22M average (IBM 2025)
- Not everything can deploy anytime: settlement windows, peak-hour caps, pre-deployment notification requirements
- Only 18% of CIOs can adjust technology investments at the pace required (Gartner 2026)

### Spec approval as change authorization (maps to CAB)

```markdown
# specs/services/settlement-engine.spec.md

## Intent
Process end-of-day settlement calculations for fixed income positions.

## Constraints
- MUST NOT deploy during market hours (9:30 AM - 4:00 PM ET)
- MUST NOT deploy during settlement window (4:00 PM - 6:00 PM ET)
- Changes require approval from: [Engineering Lead] + [Risk Officer]
- All changes must include rollback plan in spec
- Audit trail must satisfy SOX Section 404 requirements

## Rollback Plan
- If settlement totals deviate > 0.01% from expected: auto-revert to previous version
- Rollback trigger: CloudWatch alarm on settlement-accuracy metric
- Rollback time target: < 5 minutes
```

### Hook: Enforce deployment windows

```json
// .kiro/hooks/deployment/deployment-window.json
{
  "version": "v1",
  "hooks": [{
    "name": "enforce-deployment-window",
    "description": "Block deployments during market hours for FSI compliance - deployment window enforcement",
    "trigger": "SessionStart",
    "action": {
      "type": "agent",
      "prompt": "Before deploying:\n1. Check current time against deployment windows:\n   - BLOCKED: 9:30 AM - 6:00 PM ET (market + settlement hours)\n   - ALLOWED: 6:00 PM - 9:30 AM ET\n2. If currently blocked:\n   - Queue the deployment for the next allowed window\n   - Notify the team with scheduled deployment time\n3. If allowed:\n   - Proceed with CDK deploy to staging\n   - Require manual promotion to production\n4. Log deployment attempt with timestamp for audit trail"
    }
  }]
}
```

---

## 6. Knowledge loss when engineers leave

**The data:**
- 47% burnout means experienced engineers are actively leaving (DuploCloud)
- Tribal knowledge reliance puts scaling at risk
- New engineers face "two-hour archaeological expedition through generated logic they've never seen before" (CircleCI)
- 29.6% of platform teams don't measure success at all — institutional learning fails

### Spec captures the "why" — not just the "what"

```markdown
# specs/services/legacy-adapter.spec.md

## Intent
Translate between the legacy COBOL mainframe format and the modern REST API.
This adapter exists because the mainframe cannot be decommissioned until
Q3 2027 (contract obligation with clearing house).

## Design Decisions (and why)
- We use batch processing (not real-time) because the mainframe has a
  50 concurrent connection limit and real-time would exceed it during peaks
- Field mapping uses a lookup table (not hardcoded) because the clearing
  house changes their format ~2x per year with 30 days notice
- We retry failed batches 3x with exponential backoff because the mainframe
  drops connections under load but succeeds on retry 95% of the time

## Constraints
- Batch size MUST NOT exceed 500 records (mainframe memory limit)
- Timeout per batch MUST be 120 seconds (mainframe processing time)
- Must maintain backward compatibility with mainframe format v2.3 AND v2.4
  (v2.3 is still used by 2 downstream consumers until their migration in Q1 2027)
```

### Post-incident hook: Encode lessons in specs

```json
// .kiro/hooks/post-incident-learning.json
{
  "version": "v1",
  "hooks": [{
    "name": "post-incident-spec-update",
    "description": "Convert incident learnings into spec constraints to prevent AI from repeating mistakes",
    "trigger": "SessionStart",
    "action": {
      "type": "agent",
      "prompt": "The user is running this after resolving an incident.\nAsk them:\n1. Which service was affected?\n2. What was the root cause?\n3. What constraint would have prevented this?\n\nThen:\n1. Open the affected service's spec\n2. Add the new constraint to the Constraints section\n3. Add a test expectation that validates the fix\n4. Note the incident date and ID in a 'Lessons Learned' section\n\nThis ensures the AI will never generate code that repeats this mistake."
    }
  }]
}
```

---

## Quick Reference: Kiro File Structure

```
your-project/
├── .kiro/
│   ├── hooks/
│   │   ├── security/
│   │   │   ├── scan-secrets.json
│   │   │   ├── validate-iam.json
│   │   │   └── pre-send-scan.json
│   │   ├── quality/
│   │   │   ├── test-on-save.json
│   │   │   ├── mutation-test.json
│   │   │   ├── enforce-coverage.json
│   │   │   └── coverage-report.json
│   │   ├── automation/
│   │   │   ├── update-docs.json
│   │   │   └── scaffold-service.json
│   │   ├── deployment/
│   │   │   ├── deployment-window.json
│   │   │   └── promote-to-staging.json
│   │   └── post-incident-learning.json
│   ├── steering/
│   │   ├── code-standards.md          # Always included — coding patterns
│   │   ├── security-rules.md           # Always included — security constraints
│   │   ├── test-requirements.md        # Always included — test quality
│   │   ├── excluded-paths.yaml         # File/pattern exclusions for security
│   │   └── region-config.yaml          # Data residency and Bedrock config
│   ├── mcp/
│   │   ├── cloudwatch.yaml
│   │   └── pagerduty.yaml
│   └── config.yaml
├── specs/
│   ├── services/
│   │   ├── payment-processor.spec.md
│   │   ├── rate-limiter.spec.md
│   │   └── settlement-engine.spec.md
│   └── golden/
│       ├── auth-pattern.spec.md
│       ├── logging-standard.spec.md
│       └── observability.spec.md
├── src/
├── infra/
└── docs/
```

---

## Secondary Concerns

These emerge once the primary blockers are addressed — typically during scaling or 3-6 months into adoption.

---

### 11. AI governance & accountability — who owns AI-generated code?

**The data:**
- Perforce 2026 State of DevOps: identified "governance gaps in AI adoption" as a key finding
- No industry consensus on liability for AI-generated production failures
- Traditional change management assumes a human author — AI complicates attribution

**The risk:** AI generates code. It passes review (because it looks right). It fails in production. Who's accountable — the developer who approved it? The model? The spec author?

**How Kiro addresses it:**

### Spec approval = change authorization (same as CAB, but reviewable)

Traditional change management reviews 500 lines of code diffs. With AI, you might review 5,000 lines. Impossible at scale.

**Kiro's approach:** Review the spec (intent, constraints, contracts) instead of the implementation. The spec IS the change authorization.

**Git workflow that creates audit trail:**

```
1. Engineer creates spec → Branch: feature/payment-v2
   File: specs/services/payment-v2.spec.md
   
2. Engineer opens PR #142: "Add payment v2 with fraud detection"
   Reviewers: @tech-lead-b (required), @risk-officer-c (required)
   
3. PR approval = spec approval = change authorization
   Git log: @tech-lead-b approved 2026-06-15 11:30
   Git log: @risk-officer-c approved 2026-06-15 11:35
   
4. PR merged → Hook triggered: generate-from-spec
   Agent generates code in src/services/payment-v2/
   All generated code includes header:
   # Generated from specs/services/payment-v2.spec.md
   # Spec approved by: @tech-lead-b, @risk-officer-c
   # Generation timestamp: 2026-06-15 11:45
   
5. Hook runs tests, security scans (see Section 1, 2)
   Results logged to .kiro/audit/payment-v2-generation.json
   
6. If all validations pass → Hook opens deployment PR
   Deployment PR includes:
   - Link to original spec PR
   - Approval chain
   - Test results
   - Security scan results
```

**Accountability chain (concrete):**

| Who | Owns What | Evidence | When Production Fails |
|-----|-----------|----------|----------------------|
| **Spec author** (@engineer-a) | Intent and constraints | Git commit + PR description | "Did the spec accurately define requirements?" |
| **Spec approvers** (@tech-lead-b, @risk-officer-c) | Behavior and business logic | PR approval in Git | "Did they approve behavior that caused the failure?" |
| **Agent** (sonnet) | Implementation matching spec | Generation log in .kiro/audit/ | "Did generated code match the spec?" (testable via spec constraints) |
| **Hooks** | Standards enforcement | Hook execution logs | "Did hooks catch violations?" (check logs) |

**The key insight:** If production fails, you trace back to the spec PR approval. The question becomes: "Did the approved spec contain the failure condition?" If yes → spec approvers are accountable. If no → agent implementation bug.

### Hook: Require spec approval before code generation

```yaml
# .kiro/hooks/require-spec-approval.yaml
name: require-spec-approval
on:
  spec_change:
    paths:
      - specs/services/**/*.spec.md
    status: created  # Runs when spec PR is opened
run:
  agent: nova
  task: |
    Check that this spec PR has the required approvals:
    - For production services: Engineering Lead + Risk Officer
    - For internal services: Engineering Lead only
    - For experimental services: Any senior engineer
    
    If approvals are missing, comment on PR:
    "⚠️ This spec requires approval from: [list]
     No code will be generated until approval gates are met."
    
    If approvals are present, add comment:
    "✅ Approval gates satisfied. Code generation is authorized.
     Spec approved by: [list with timestamps]"
  approval: none
```

### Hook: Generate compliance report for audits

```yaml
# .kiro/hooks/audit-report.yaml
name: generate-audit-report
on:
  manual_trigger:
    name: "Generate Audit Report"
run:
  agent: sonnet
  task: |
    Generate a compliance report for the date range provided by user.
    For each deployment to production:
    1. List the spec that authorized the change
    2. List who approved the spec (with timestamps)
    3. List what code was generated
    4. List what tests passed/failed
    5. List what security scans ran (with results)
    6. List deployment timestamp and deployment ID
    
    Output format: Markdown table + JSON export for SOX/audit tools
    Save to: audit-reports/YYYY-MM-DD.md
  approval: none
```

**Example audit report output:**

```markdown
# Production Changes Audit Report
Date Range: 2026-06-01 to 2026-06-30

| Service | Change | Spec Approvers | Code Gen | Tests | Security | Deployed | Incidents |
|---------|--------|---------------|----------|-------|----------|----------|-----------|
| payment-v2 | Add fraud detection | @tech-lead-b<br>@risk-officer-c<br>2026-06-15 11:30 | agent:sonnet<br>2026-06-15 11:45 | 47/47 ✅ | clean ✅ | 2026-06-15 14:22 | 0 |
| notification | Add SMS channel | @tech-lead-b<br>2026-06-18 09:15 | agent:sonnet<br>2026-06-18 09:30 | 23/23 ✅ | clean ✅ | 2026-06-18 10:05 | 0 |
| settlement | Update batch logic | @tech-lead-b<br>@risk-officer-c<br>@compliance-d<br>2026-06-20 15:45 | agent:sonnet<br>2026-06-20 16:00 | 31/31 ✅ | clean ✅ | 2026-06-21 19:00 | 1 (INC-4455) |

## Incident Analysis: INC-4455
- **Root cause**: Spec constraint "batch size ≤ 500" was correct, but implementation used signed int16 (max 32,767) instead of constraint value
- **Accountability**: Agent implementation bug (correct spec, incorrect code generation)
- **Resolution**: Spec constraint enforcement added to test expectations → code regenerated
- **Prevention**: Mutation testing now validates constraint boundaries (see Section 2)
```

**For organizations with existing CAB processes:**

Map Kiro's spec approval workflow to your CAB:

| Traditional CAB | Kiro Equivalent |
|-----------------|-----------------|
| CAB meeting to review change | PR review of spec (async, documented) |
| Change request form | Spec file (intent, constraints, contracts) |
| Risk assessment | Spec constraints + test expectations |
| Implementation plan | Agent generates from spec |
| Rollback plan | Spec includes rollback section (see Section 9) |
| Post-implementation review | Hook: post-incident-learning (see Section 10) |

**Key advantage:** Spec review is more auditable than code review because intent is explicit. A CAB can review a spec in English, not 5,000 lines of generated TypeScript.

---

### 12. Cost visibility — Bedrock spend per team/hook

**The data:**
- Gartner CIO 2026: "Optimizing AI cloud investments" is a top-3 CIO priority
- Usage-based pricing (Bedrock) can surprise if unmetered
- Hooks running on every file save can generate significant token volume if using Sonnet for everything

**The risk:** A team enables 10 hooks all using Sonnet. Every file save triggers 10 model calls. At scale (50 developers, 200 saves/day each), costs are non-trivial.

### Cost calculation example: Why model routing matters

**Scenario:** 50 developers, 200 file saves per day each, 10 hooks configured

**Bad configuration (all hooks use Sonnet):**
```
50 devs × 200 saves/day × 10 hooks = 100,000 hook executions/day
Average 1,000 tokens input + 500 tokens output per hook = 1,500 tokens/execution
Total: 150M tokens/day = 4.5B tokens/month

Bedrock pricing (Claude Sonnet 4):
- Input: $3.00 per 1M tokens
- Output: $15.00 per 1M tokens

Monthly cost:
- Input: 3,000M tokens × $3/1M = $9,000
- Output: 1,500M tokens × $15/1M = $22,500
Total: $31,500/month = $378,000/year
```

**Optimized configuration (local + Nova + Sonnet strategically):**
```
Breakdown by hook type:
- 6 hooks use local execution (lint, format, secrets scan) = 60,000 executions/day → $0
- 3 hooks use Nova (doc updates, test scaffolding, completions) = 30,000 executions/day
- 1 hook uses Sonnet (architecture review, only on spec changes) = 50 executions/day

Nova cost (30,000 executions/day):
- 30,000 × 1,500 tokens = 45M tokens/day = 1.35B tokens/month
- Input: 900M tokens × $0.024/1M = $216
- Output: 450M tokens × $0.096/1M = $432
- Subtotal: $648/month

Sonnet cost (50 executions/day for critical reviews):
- 50 × 5,000 tokens (larger context for reviews) = 250K tokens/day = 7.5M tokens/month
- Input: 5M tokens × $3/1M = $15
- Output: 2.5M tokens × $15/1M = $37.50
- Subtotal: $52.50/month

Total optimized: $700.50/month = $8,406/year
Savings: $369,594/year (97.8% reduction)
```

### Model routing controls cost at the hook level

```yaml
# .kiro/config.yaml
model_routing:
  # Expensive (Sonnet) — use sparingly, high-value tasks only
  spec_authoring: sonnet
  architecture_review: sonnet
  iac_generation: sonnet
  security_review: sonnet

  # Cost-effective (Nova) — use for high-frequency hooks
  lint_fixes: nova
  test_scaffolding: nova
  doc_updates: nova
  completions: nova
  code_generation: nova

  # Free (local) — no model call at all
  secret_scanning: local    # Uses gitleaks, no tokens
  lint_check: local         # Uses eslint locally
  format_check: local       # Uses prettier locally
  coverage_check: local     # Uses jest/nyc locally
```

**The principle:** Reserve Sonnet for tasks requiring deep reasoning (architecture, security design, spec authoring). Use Nova for routine code generation and documentation. Use local execution for validation tasks that don't need AI at all.

### CloudWatch cost monitoring dashboard

```bash
# Create CloudWatch dashboard for Bedrock costs by model
aws cloudwatch put-dashboard \
  --dashboard-name kiro-bedrock-costs \
  --dashboard-body '{
    "widgets": [
      {
        "type": "metric",
        "properties": {
          "metrics": [
            ["AWS/Bedrock", "InvocationCount", {"stat": "Sum"}],
            [".", "TokenCount", {"stat": "Sum"}]
          ],
          "period": 3600,
          "stat": "Sum",
          "region": "us-east-1",
          "title": "Bedrock Usage - Hourly"
        }
      },
      {
        "type": "metric",
        "properties": {
          "metrics": [
            ["AWS/Bedrock", "InvocationLatency", {"stat": "Average"}]
          ],
          "period": 300,
          "stat": "Average",
          "region": "us-east-1",
          "title": "Model Latency"
        }
      }
    ]
  }'
```

### Cost allocation by team using resource tags

```yaml
# .kiro/config.yaml
bedrock:
  region: us-east-1
  resource_tags:
    Team: platform-team
    Project: payment-service
    Environment: production
    CostCenter: engineering-123
```

**Query costs by tag in Cost Explorer:**
```bash
# Get Bedrock costs for a specific team for the last 30 days
aws ce get-cost-and-usage \
  --time-period Start=2026-05-23,End=2026-06-22 \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --filter '{
    "And": [
      {"Dimensions": {"Key": "SERVICE", "Values": ["Amazon Bedrock"]}},
      {"Tags": {"Key": "Team", "Values": ["platform-team"]}}
    ]
  }' \
  --group-by Type=TAG,Key=Project
```

### Budget alerts to prevent cost overruns

```bash
# Create budget alert at $5,000/month threshold
aws budgets create-budget \
  --account-id 123456789012 \
  --budget '{
    "BudgetName": "kiro-bedrock-monthly",
    "BudgetLimit": {
      "Amount": "5000",
      "Unit": "USD"
    },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST",
    "CostFilters": {
      "Service": ["Amazon Bedrock"]
    }
  }' \
  --notifications-with-subscribers '[
    {
      "Notification": {
        "NotificationType": "ACTUAL",
        "ComparisonOperator": "GREATER_THAN",
        "Threshold": 80,
        "ThresholdType": "PERCENTAGE"
      },
      "Subscribers": [
        {
          "SubscriptionType": "EMAIL",
          "Address": "engineering-leads@company.com"
        }
      ]
    }
  ]'
```

### Cost optimization checklist

| Hook Type | Recommended Model | Rationale | Monthly Cost (50 devs) |
|-----------|------------------|-----------|----------------------|
| Secret scanning | Local (gitleaks) | No AI needed, pattern matching | $0 |
| Lint/format | Local (eslint/prettier) | Deterministic rules, no reasoning | $0 |
| Coverage check | Local (jest) | Math, not reasoning | $0 |
| Doc updates | Nova | Simple text generation | ~$100 |
| Test scaffolding | Nova | Template generation | ~$150 |
| Code completions | Nova | High frequency, simple context | ~$200 |
| Spec authoring | Sonnet | Deep reasoning, critical path | ~$150 |
| Architecture review | Sonnet | Complex analysis | ~$50 |
| Security review | Sonnet | Critical, low frequency | ~$25 |

**Total optimized monthly cost:** ~$675 for 50 developers

**Impact:**
- 97% cost reduction vs naive "Sonnet everywhere" approach
- Local execution = instant feedback, zero cost
- Nova = 80x cheaper than Sonnet for routine tasks
- Sonnet reserved for tasks that justify the cost

---

### 13. Spec-to-coverage traceability — proving every requirement is tested

**The data:**
- 48% cite code rework as a major bottleneck in the AI era (DevOps.com 2026)
- AI generates code quickly, but without traceability you can't prove which requirements are actually implemented and tested
- In regulated industries (FSI, healthcare), auditors ask: "Show me that requirement X is implemented and tested"
- Traditional approach: manual traceability matrices in spreadsheets, always outdated

**The risk:** AI generates 5,000 lines of code from a spec. Six months later:
- Which spec requirements are actually implemented?
- Which code paths validate which constraints?
- If a test is removed, which requirement becomes untested?
- When a requirement changes, which tests need to update?

**Without traceability:** You can't confidently answer these questions. Rework, over-testing, or under-testing.

### Hook: Generate traceability report from spec to coverage

```yaml
# .kiro/hooks/generate-traceability.yaml
name: spec-to-coverage-traceability
on:
  spec_change:
    paths:
      - specs/services/**/*.spec.md
    status: approved
  manual_trigger:
    name: "Generate Traceability Report"
run:
  agent: sonnet
  task: |
    Generate a traceability report for ${event.path}.
    
    For each requirement in the spec:
    1. Contracts → Which functions implement this endpoint/interface?
    2. Constraints → Which code enforces this constraint?
    3. Test Expectations → Which test cases validate this?
    4. Coverage → What's the line/branch coverage for the implementing code?
    
    Output format: Markdown table + link to HTML coverage report
    Save to: traceability-reports/${SERVICE_NAME}.md
    
    Flag any gaps:
    - ❌ Constraint with no enforcing code
    - ❌ Test expectation with no test case
    - ❌ Code with <80% coverage for critical paths
  approval: none
```

**Example traceability report:**

```markdown
# Traceability Report: Rate Limiter Service
Generated: 2026-06-22 10:15 AM
Spec: specs/services/rate-limiter.spec.md
Code: src/services/rate-limiter/
Coverage Report: coverage-reports/rate-limiter/index.html

## Contracts → Code → Tests → Coverage

| Spec Requirement | Implementation | Test Cases | Line Coverage | Branch Coverage | Status |
|------------------|----------------|------------|---------------|-----------------|--------|
| **Contract: POST /limit** | `src/services/rate-limiter/handler.ts:15-45` | `handler.test.ts:10-25` | 95% | 90% | ✅ |
| Input: tenantId, endpoint | `handler.ts:20` (validation) | `handler.test.ts:15` (invalid input) | 100% | 100% | ✅ |
| Output: 200 or 429 | `handler.ts:35, 42` | `handler.test.ts:18, 22` | 100% | 100% | ✅ |

## Constraints → Code → Tests → Coverage

| Constraint | Enforcement Code | Test Cases | Coverage | Status |
|------------|------------------|------------|----------|--------|
| **Must use sliding window** | `src/services/rate-limiter/window.ts:25-60` | `window.test.ts:30-45` | 88% | 85% | ✅ |
| Algorithm validation | `window.ts:30` (calculate window) | `window.test.ts:35` (boundary test) | 100% | 100% | ✅ |
| NOT fixed window | No fixed-window code detected ✅ | `window.test.ts:40` (anti-test: fixed fails) | N/A | N/A | ✅ |
| **Handle Redis failure** | `src/services/rate-limiter/storage.ts:45-65` | `storage.test.ts:50-70` | 72% | 60% | ⚠️ LOW |
| Graceful degradation | `storage.ts:50` (try/catch) | `storage.test.ts:55` (Redis down) | 85% | 75% | ✅ |
| Fail-open with logging | `storage.ts:58` (log + allow) | `storage.test.ts:65` (verify log) | 60% | 45% | ❌ INSUFFICIENT |
| **Latency < 5ms p99** | `handler.ts:15-45` (entire path) | `performance.test.ts:10-25` | 95% | 90% | ✅ |
| Measured in tests | `performance.test.ts:15` (latency assertion) | Test includes timer ✅ | N/A | N/A | ✅ |

## Test Expectations → Test Cases → Coverage

| Test Expectation (from spec) | Test Case | Line Coverage | Status |
|-------------------------------|-----------|---------------|--------|
| ✓ 100th request returns 200 | `rate-limiter.test.ts:20-30` | 100% | ✅ |
| ✓ 101st request returns 429 | `rate-limiter.test.ts:35-45` | 100% | ✅ |
| ✓ Request at 61s returns 200 | `rate-limiter.test.ts:50-65` | 100% | ✅ |
| ✗ Fixed window NOT acceptable | `window.test.ts:40` (anti-regression) | 100% | ✅ |
| ✗ Must NOT throw if Redis down | `storage.test.ts:55` | 85% | ✅ |
| ✗ Must NOT exceed 10ms p99 | `performance.test.ts:15` | 95% | ✅ |

## Gaps Requiring Attention

| Issue | Severity | Recommendation |
|-------|----------|----------------|
| Redis failure path: 60% coverage | ⚠️ Medium | Add tests for edge cases in storage.ts lines 58-65 |
| Fail-open logging: 45% branch coverage | ❌ High | Test both log-success and log-failure paths |

## Summary
- **Total Constraints**: 3
- **Fully Covered**: 2 (67%)
- **Partially Covered**: 1 (33%)
- **Uncovered**: 0 (0%)
- **Overall Traceability Score**: 85% (target: 90%)

**Action Required**: Increase coverage for Redis failure path before production deployment.
```

### Automated traceability validation

```yaml
# .kiro/hooks/validate-traceability.yaml
name: validate-traceability
on:
  file_save:
    paths:
      - src/**/*.ts
run:
  command: |
    # After code changes, check if traceability is still valid
    SERVICE=$(echo "${event.file}" | sed 's|src/services/\([^/]*\).*|\1|')
    SPEC="specs/services/${SERVICE}.spec.md"
    
    if [ ! -f "$SPEC" ]; then
      echo "⚠️  No spec found for service: ${SERVICE}"
      exit 0  # Not blocking, just warn
    fi
    
    # Check if all spec requirements are still traced
    echo "📊 Checking traceability for ${SERVICE}..."
    
    # Run coverage
    npx jest --coverage --testMatch="**/${SERVICE}/**/*.test.ts" --silent
    
    # Parse spec for constraints
    CONSTRAINT_COUNT=$(grep -c "^-.*MUST" "$SPEC" || echo 0)
    
    # Count tests
    TEST_COUNT=$(find src/services/${SERVICE} -name "*.test.ts" -exec grep -c "it(" {} + | awk '{s+=$1} END {print s}')
    
    # Simple heuristic: should have at least as many tests as constraints
    if [ "$TEST_COUNT" -lt "$CONSTRAINT_COUNT" ]; then
      echo "⚠️  Traceability warning:"
      echo "   Spec has ${CONSTRAINT_COUNT} constraints"
      echo "   Found ${TEST_COUNT} test cases"
      echo "   Recommendation: Each constraint should have 1-3 test cases"
    else
      echo "✅ Traceability looks good: ${TEST_COUNT} tests for ${CONSTRAINT_COUNT} constraints"
    fi
  on_failure: warn
```

### Spec annotations for traceability

**How the mapping works:**

The traceability system uses explicit ID markers to create bidirectional links:

1. **In specs**: Add `[REQ-###]` IDs to requirements
2. **In test files**: Add comments linking tests to requirements: `// [TEST-001] validates [REQ-001]`
3. **Hook parses both**: Reads spec IDs, searches code for matching comments, generates report

**Example: Adding traceability IDs to a spec**

```markdown
# specs/services/rate-limiter.spec.md

## Constraints
- [REQ-001] Must use sliding window algorithm (not fixed window)
- [REQ-002] Must handle Redis connection failure gracefully (fail-open with logging)
- [REQ-003] Latency overhead must be < 5ms at p99

## Test Expectations
- [TEST-001] ✓ 100th request within 60s returns 200 → validates REQ-001
- [TEST-002] ✓ 101st request within 60s returns 429 → validates REQ-001
- [TEST-003] ✓ Request at 61s returns 200 → validates REQ-001 (window slides)
- [TEST-004] ✗ Must NOT throw unhandled exception if Redis is unavailable → validates REQ-002
- [TEST-005] ✗ Must NOT add > 10ms latency at p99 → validates REQ-003
```

**Then in test files, add comments linking to spec IDs:**

```typescript
// src/services/rate-limiter/rate-limiter.test.ts

describe('Rate Limiter', () => {
  // [TEST-001] validates [REQ-001]: sliding window allows 100 requests
  it('should allow 100th request within 60 seconds', async () => {
    // test implementation
  });

  // [TEST-002] validates [REQ-001]: sliding window blocks 101st
  it('should block 101st request within 60 seconds', async () => {
    // test implementation
  });

  // [TEST-004] validates [REQ-002]: graceful Redis failure
  it('should not throw when Redis is unavailable', async () => {
    // Inject Redis failure
    redis.simulateFailure();
    
    // Should fail open and log, not crash
    const result = await rateLimiter.check('tenant-123');
    expect(result.allowed).toBe(true);
    expect(mockLogger).toHaveBeenCalledWith('Redis unavailable, failing open');
  });
});
```

**How the traceability hook works:**

1. **Parse spec for requirement IDs**:
   ```bash
   grep -o '\[REQ-[0-9]*\]' specs/services/rate-limiter.spec.md
   # Returns: [REQ-001], [REQ-002], [REQ-003]
   ```

2. **Find implementing code** by searching for test comments:
   ```bash
   grep -r '\[REQ-001\]' src/services/rate-limiter/
   # Returns:
   #   rate-limiter.test.ts:10: // [TEST-001] validates [REQ-001]
   #   rate-limiter.test.ts:15: // [TEST-002] validates [REQ-001]
   ```

3. **Run coverage** on implementing files:
   ```bash
   npx jest --coverage --testMatch="**/rate-limiter.test.ts"
   # Parses coverage report to get line/branch percentages
   ```

4. **Generate traceability report** linking:
   - Spec requirement → Test IDs → Test files → Line numbers → Coverage %

**Alternative: Convention-based mapping (no IDs required)**

If you don't want to add IDs, use naming conventions:

```typescript
// Convention: Test file name matches spec file name
// specs/services/rate-limiter.spec.md → rate-limiter.test.ts

describe('REQ: Must use sliding window', () => {
  // Test name mirrors constraint text
  it('100th request within 60s returns 200', async () => {
    // Hook matches test description to spec constraint by text similarity
  });
});
```

Hook uses fuzzy matching to connect tests to requirements based on similar text.

### Visual traceability dashboard

```yaml
# .kiro/hooks/traceability-dashboard.yaml
name: generate-traceability-dashboard
on:
  schedule:
    cron: "0 */6 * * *"  # Every 6 hours
run:
  agent: sonnet
  task: |
    Generate a dashboard showing traceability for all services.
    
    For each service in specs/services/:
    1. Parse spec for requirements (contracts, constraints, test expectations)
    2. Find implementing code
    3. Find test cases
    4. Get coverage metrics
    5. Calculate traceability score
    
    Output: HTML dashboard at traceability-reports/index.html
    
    Include:
    - Traffic light status per service (green/yellow/red)
    - Drill-down to requirement-level details
    - Trend over time (traceability improving or degrading?)
  approval: none
```

**Example dashboard output:**

```
┌─────────────────────────────────────────────────────────────┐
│ Traceability Dashboard - All Services                       │
│ Generated: 2026-06-22 10:15 AM                              │
└─────────────────────────────────────────────────────────────┘

Service              | Requirements | Traced | Coverage | Status
---------------------|--------------|--------|----------|--------
rate-limiter         | 8           | 7      | 85%      | 🟡 WARN
payment-processor    | 12          | 12     | 92%      | 🟢 GOOD
notification-service | 10          | 9      | 88%      | 🟡 WARN
settlement-engine    | 15          | 15     | 95%      | 🟢 GOOD
legacy-adapter       | 6           | 5      | 78%      | 🔴 CRITICAL

Overall: 50 requirements, 48 traced (96%), average coverage: 88%
Target: 100% traced, >90% coverage

🔴 Action Required: legacy-adapter missing test for REQ-004
🟡 Recommendations: 2 services below 90% coverage threshold
```

### Integration with CI/CD gates

```yaml
# .github/workflows/traceability-gate.yml
name: Traceability Gate
on: [pull_request]
jobs:
  traceability:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      
      - name: Generate traceability report
        run: |
          node scripts/generate-traceability.js
          
      - name: Check traceability threshold
        run: |
          SCORE=$(jq '.traceabilityScore' traceability-reports/summary.json)
          if (( $(echo "$SCORE < 85" | bc -l) )); then
            echo "❌ Traceability score too low: ${SCORE}% (required: 85%)"
            echo "Some spec requirements are not fully implemented or tested."
            exit 1
          fi
          echo "✅ Traceability acceptable: ${SCORE}%"
          
      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('traceability-reports/summary.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: report
            });
```

### Benefits of spec-to-coverage traceability

| Problem | Without Traceability | With Traceability |
|---------|---------------------|-------------------|
| **Audit question: "Is requirement X tested?"** | Manual search through code and tests (hours) | Auto-generated report with exact line numbers (seconds) |
| **Removing legacy code** | Fear of breaking untested requirements | Know exactly which requirements will be affected |
| **AI generates code without tests** | Might not notice until production | Traceability gap flagged immediately |
| **Requirement changes** | Unknown which tests need updating | Report shows all affected tests |
| **Coverage drops** | Don't know which requirements are now at risk | Dashboard shows which requirements lost coverage |
| **Onboarding new engineers** | "Read all the code" | "Read the traceability report" — see how system is validated |

**Key insight:** In the AI era, code is cheap but **proving correctness is expensive**. Automated traceability makes correctness provable and auditable, converting spec requirements into testable, measurable outcomes.

---

---

## Acceleration: How Kiro Speeds Up Cloud Engineering

The concerns above are defensive — protecting quality, security, and stability. This section is the offensive case: how Kiro compresses timelines for Cloud Engineering teams.

---

### A1. New microservice: from idea to deployed in hours, not weeks

**Traditional timeline:**
```
Day 1:     Write requirements in Confluence (2 hrs)
Day 2-3:   Design doc, review with team (8 hrs + calendar delay)
Day 4-7:   Implement code (3-5 days)
Day 8:     Write tests (1 day)
Day 9:     Set up infra (CDK/Terraform) — copy from another service, modify (4 hrs)
Day 10:    Pipeline setup, deploy to staging (half day)
Day 11-12: Code review, fix feedback (2 days)
Day 13:    Compliance review (1 day)
Day 14:    Deploy to production

Total: ~14 days
```

**Kiro-accelerated timeline:**
```
Hour 1:    Write spec — intent, contracts, constraints, test expectations (30 min)
           Spec reviewed and approved by tech lead (30 min — they read English, not code)
Hour 2:    Agent generates implementation + tests from spec (minutes)
           Hooks validate: tests pass, standards met, security clean
Hour 3:    IaC hook generates CDK stack from spec integration points
           Hooks auto-generate API docs, client stubs
Hour 4:    Spec approved → promotion hook deploys to staging
           Integration tests run automatically
Hour 5:    Compliance review = spec review (already done in Hour 1)
           Deploy to production

Total: ~5 hours
```

**Tactical example — the spec that drives all of this:**

```markdown
# specs/services/notification-service.spec.md

## Intent
Send transactional notifications (email, SMS, push) to customers
based on account events. Replaces legacy batch-email system.

## Contracts
- POST /api/notifications/send
  - Input: { customerId: string, channel: "email"|"sms"|"push", templateId: string, params: object }
  - Output: { notificationId: string, status: "queued"|"failed", estimatedDelivery: ISO8601 }
- GET /api/notifications/{id}/status
  - Output: { status: "queued"|"sent"|"delivered"|"failed", timestamps: object }

## Integration Points
- Amazon SES (email)
- Amazon SNS (SMS, push)
- DynamoDB (notification log)
- SQS (async processing queue)
- EventBridge (triggers from account-events topic)

## Constraints
- Must process 10,000 notifications/minute at peak
- Must retry failed sends 3x with exponential backoff (1s, 4s, 16s)
- Must not send duplicate notifications (idempotency key on customerId + templateId + 1hr window)
- PII (email, phone) must not appear in CloudWatch logs
- Must support opt-out checking before send (DynamoDB preferences table)

## Test Expectations
- ✓ Valid request returns 202 with notificationId
- ✓ Invalid channel returns 400
- ✓ Duplicate within 1hr window returns 200 with original notificationId (not re-sent)
- ✓ Opted-out customer returns 200 with status "suppressed"
- ✗ Must NOT send if customer has opted out
- ✗ Must NOT log email address or phone number
- ✗ Must NOT exceed 30s end-to-end latency for queue + send
```

**What happens automatically after this spec is approved:**
1. Agent generates: `src/services/notification/` (handler, types, queue processor, retry logic)
2. Agent generates: `src/services/notification/notification.test.ts` (all test cases from spec)
3. Hook generates: `infra/stacks/notification-stack.ts` (SES, SNS, DynamoDB, SQS, EventBridge, IAM roles)
4. Hook generates: `docs/api/notification.md` + `docs/openapi/notification.yaml`
5. Hook generates: `packages/clients/notification-client.ts` (typed client for consumers)
6. Hook scans: secrets check (local), standards check, test run
7. Hook deploys: CDK diff → staging

---

### A2. Cross-cutting change across 5 services: hours, not a sprint

**Scenario:** You need to add request tracing (X-Ray trace ID) across all 5 services.

**Traditional approach:**
- Open 5 PRs manually
- Each developer modifies their service
- Coordinate via Slack/meetings to agree on header format
- Stagger PRs, wait for reviews, fix conflicts
- **Timeline: 1-2 sprints**

**Kiro approach:**

```markdown
# specs/golden/tracing-standard.spec.md

## Intent
All services must propagate AWS X-Ray trace IDs via X-Amzn-Trace-Id header.

## Constraints
- Every inbound request must extract or generate a trace ID
- Every outbound HTTP call must include the trace ID in headers
- Every SQS message must include trace ID in message attributes
- Every log line must include trace ID in structured log format
- If no trace ID is received, generate one (root trace)
```

```yaml
# .kiro/hooks/enforce-tracing-standard.yaml
name: enforce-tracing
on:
  spec_change:
    paths:
      - specs/golden/tracing-standard.spec.md
    status: approved
run:
  agent: sonnet
  task: |
    The tracing standard golden spec was updated.
    For every service in specs/services/:
    1. Check if it already satisfies the tracing constraints
    2. If not, generate the required changes:
       - Add trace ID extraction middleware
       - Add trace ID propagation to outbound calls
       - Update structured logging to include trace ID
    3. Open one PR per service with the changes
    4. Run each service's tests to validate
  approval: pr_review
```

**Timeline: 1-2 hours** — golden spec approved → hooks cascade to all services → PRs opened → tests pass → reviewed and merged.

---

### A3. Onboarding a new engineer: days, not months

**Traditional onboarding:**
- Read Confluence pages (outdated)
- Shadow senior engineer for 2 weeks
- Try to understand the codebase by reading it
- First meaningful PR: week 3-4

**Kiro-accelerated onboarding:**
- Day 1: Read specs for the 3 services you'll own. Understand intent, contracts, constraints.
- Day 1: Read golden specs. Understand team standards.
- Day 2: Write your first spec for a small feature. Get it reviewed.
- Day 2: Kiro generates the implementation from your spec. Hooks validate.
- Day 3: First PR merged. Hooks enforced standards automatically — no senior needed for code review of standards compliance.

**First meaningful PR: Day 2-3** (instead of week 3-4).

---

### A4. Acceleration metrics (what to measure)

| Metric | Before Kiro (baseline) | Target with Kiro |
|--------|----------------------|-----------------|
| Spec to working code | N/A (no specs) | < 1 hour |
| New service: idea to staging | 10-14 days | < 1 day |
| Cross-cutting change (5 services) | 1-2 sprints | < 4 hours |
| New engineer: first meaningful PR | 3-4 weeks | 2-3 days |
| Compliance review time | 1-5 days | < 1 hour (spec review) |
| Post-incident fix propagation | "Add to backlog" (weeks) | Same day (spec constraint + regenerate) |
| API change coordination | Slack + meetings + manual PRs | Spec changes trigger doc updates (hooks auto-sync) |
| Documentation currency | Always outdated | Always current (hooks update on change) |

---

## DORA Metrics → Kiro/AI-DLC Mapping

DORA (DevOps Research and Assessment) measures what high-performing teams achieve. AI-DLC/Kiro prescribes how to get there.

| DORA Metric | Elite Target | How Kiro Gets You There |
|---|---|---|
| Deployment frequency | On demand, multiple/day | Spec approval triggers auto-deploy hooks; environment promotion removes manual gates |
| Lead time for changes | < 1 hour | Spec → synthesize → hooks validate → PR opened (minutes, not days) |
| Change failure rate | < 5% | Specs constrain generation; hooks catch failures before pipeline; tests run on save |
| Time to restore | < 1 hour | Specs as runbooks; auto-generated rollback plans; post-incident constraints prevent repeat |

**The framing:** "DORA tells us what elite teams achieve. AI-DLC/Kiro is how you get there."

AWS blog on implementing DORA metrics: [Balance deployment speed and stability with DORA metrics](https://aws.amazon.com/jp/blogs/devops/balance-deployment-speed-and-stability-with-dora-metrics/)

---

## Reference Points

| What | Result | Source |
|---|---|---|
| 6 engineers rebuilt Bedrock inference engine | 76 days (original: 40 engineers, 1 year) | Andy Jassy 2025 Shareholder Letter |
| European FSI adopted AI-DLC | 3 devs delivering 35 features/sprint (was 12 devs, 15 features) | AWS FSI Blog |
| PKFARE built ticketing system | 100K lines, 3 engineers, 5 weeks | AWS Case Study |
| PKFARE test case authoring | 6x faster (3 days → half day) | AWS Case Study |
| PKFARE prototype cycles | 60x faster (months → days) | AWS Case Study |

---

## How Kiro fits into your existing stack

| What you use | How Kiro interacts |
|---|---|
| CodeCatalyst / GitHub | Hooks trigger on PR, merge, workflow state changes |
| Amazon Bedrock | Every agent call flows through Bedrock — same IAM, metering, permissions |
| IAM & Organizations | Honors existing roles, SCPs, per-project scoping |
| CDK / Terraform / CloudFormation | Hooks generate and validate IaC from specs |
| CloudWatch / PagerDuty / Datadog | Connected via MCP |
| VS Code | Built on Code OSS — settings and plugins carry over |

Model routing: Claude Sonnet for reasoning-heavy work (spec authoring, architecture). Amazon Nova for high-throughput work (completions, formatting). Teams control which hooks use which model.

---

## Next Steps

1. **Try it** — Kiro is free during preview. Mac, Windows, Linux. VS Code settings carry over.
2. **Workshop** — Build a real feature from spec to deployment in your environment.
3. **Pilot** — Identify one service or new feature for spec-driven development.
4. **Scale** — Roll out golden specs and hooks org-wide once validated.

---

## Recommended Reading

| Document | What It Covers |
|----------|---------------|
| [AI-DLC for Financial Services](https://aws.amazon.com/blogs/industries/ai-driven-development-lifecycle-for-financial-services/) | Full methodology — governance, team structure, regulatory alignment |
| [Introducing Kiro](https://kiro.dev/blog/introducing-kiro/) | Product overview — specs, hooks, how they work |
| [PKFARE Case Study](https://aws.amazon.com/solutions/case-studies/pkfare/) | Spec-driven development in production — metrics |
| [Amazon Kiro 2026 Developer Guide](https://www.digitalapplied.com/blog/amazon-kiro-aws-agentic-ide-complete-guide) | Architecture — model routing, hooks YAML, migration |
