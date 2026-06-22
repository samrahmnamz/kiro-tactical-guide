# Security Hooks Architecture

## Overview

This directory contains a comprehensive security hook suite implementing **defense in depth** for Cloud Engineering and DevOps teams. The hooks address the primary security concerns identified in research: 62% of teams rank security/compliance as their #1 challenge, with developers spending 49% of their week on security issues.

The security architecture is organized into **four defensive layers** that work together to prevent secret leakage, IAM misconfiguration, and data residency violations.

## Defense in Depth Layers

### Layer 1: Local Secret Scanning (Pre-Transmission)

**Purpose**: Detect and block secrets before they reach model context or version control.

**Hooks**:
- `scan-secrets.yaml` - Gitleaks-based scanning with comprehensive detection rules
- `scan-secrets-regex.yaml` - Zero-dependency alternative using pure regex patterns

**When it runs**: On file save (before context transmission)

**Execution mode**: `run: command:` (local-only, zero network calls)

**Blocking behavior**: `on_failure: block_context` prevents file from reaching model

**What it detects**:
- AWS credentials (Access Keys, Secret Keys, Session Tokens)
- API keys (GitHub, Stripe, OpenAI, Slack, etc.)
- Private keys and certificates (RSA, EC, SSH, TLS)
- Connection strings (PostgreSQL, MongoDB, Redis, MySQL)
- High-entropy strings (potential secrets, base64-encoded credentials)
- Hardcoded passwords and bearer tokens

**When to use which**:
- Use `scan-secrets.yaml` if your team can install gitleaks (more comprehensive, actively maintained)
- Use `scan-secrets-regex.yaml` for zero-dependency environments or air-gapped networks

**Customization**: Add organization-specific secret patterns to either hook's pattern list.

---

### Layer 2: IAM Policy Validation (Configuration Review)

**Purpose**: Detect overly permissive IAM policies before deployment.

**Hook**: `validate-iam.yaml`

**When it runs**: On save of IAM policy files (`*.json`, `*.yaml`, `*.yml` with IAM content)

**Execution mode**: `run: agent:` (model-assisted analysis)

**What it detects**:
- **HIGH SEVERITY**: Full wildcard policies (`Action: "*"`, `Resource: "*"`)
- **MEDIUM SEVERITY**: Service-level wildcards without conditions (`s3:*` on `Resource: "*"`)
- **LOW SEVERITY**: Missing condition blocks on write operations (PutItem, DeleteItem without conditions)
- **INFO**: Read-only wildcards (acceptable in most cases: `Get*`, `List*`, `Describe*`)

**Analysis approach**:
1. Parses IAM policy JSON/YAML
2. Checks each statement for wildcard actions and resources
3. Validates presence of condition blocks on sensitive operations
4. Classifies findings by severity (HIGH/MEDIUM/LOW/INFO)
5. Provides specific remediation guidance

**When to use**: All IAM policy changes, especially for production roles and policies.

**Customization**: Update severity thresholds and add organization-specific policy patterns in hook configuration.

---

### Layer 3: Pre-Send Context Buffer Scanning

**Purpose**: Final safety check before context transmission to model.

**Hook**: `pre-send-scan.yaml`

**When it runs**: On context_send event (right before transmission to model)

**Execution mode**: `run: command:` (local scanning)

**Blocking behavior**: `on_failure: block_send` prevents context transmission

**What it detects**:
- All Layer 1 secret patterns (AWS keys, API tokens, connection strings)
- High-entropy strings (potential secrets with entropy > 4.5 bits/character)
- Private key headers and footers
- Sensitive file path mentions (`.ssh/`, `.aws/`, `vault/`, `secrets/`)
- Production indicators (`PROD_`, `production-`, `prod-`)
- Compliance-sensitive data patterns (credit cards, SSNs for test validation)

**Entropy detection**:
```python
# Example: Calculating Shannon entropy
def calculate_entropy(string):
    entropy = 0
    for char in set(string):
        p = string.count(char) / len(string)
        entropy -= p * math.log2(p)
    return entropy
```

Thresholds:
- Entropy > 4.5: High suspicion (likely base64-encoded secret)
- Entropy > 4.0: Medium suspicion (flag for review)
- Entropy < 4.0: Low suspicion (likely normal text)

**When to use**: Always active for all context_send events (last line of defense).

**Customization**: Adjust entropy threshold based on your codebase characteristics.

---

### Layer 4: Data Residency Controls

**Purpose**: Enforce where data can be sent and which operations are allowed.

**Steering Rule**: `../../toolkit/steering/excluded-paths.yaml`

**What it controls**:
- File patterns that NEVER reach model context (`.env`, `secrets/`, `vault/`)
- Directory patterns for dependencies (noise reduction: `node_modules/`, `.git/`)
- Binary file exclusions (images, PDFs, compiled artifacts)
- Temporary file exclusions (logs, cache, build artifacts)

**Enforcement**: Path exclusions are checked before any hook execution.

**When to use**: Define once during initial setup, review quarterly.

**Customization**: Add customer-specific sensitive directories and file patterns.

---

## How Hooks Work Together

### Scenario 1: Developer Saves File with AWS Secret

1. **Layer 1** (`scan-secrets.yaml`): Detects `AKIAI44QH8DHBEXAMPLE` pattern
2. **Action**: `on_failure: block_context` prevents file from reaching model
3. **Developer sees**: "❌ Secret detected: AWS Access Key on line 42"
4. **Resolution**: Developer removes secret, references environment variable instead
5. **Result**: File never transmitted, zero data leakage risk

### Scenario 2: Developer Modifies IAM Policy

1. **Layer 2** (`validate-iam.yaml`): Analyzes policy changes
2. **Detection**: Finds `Action: "s3:*"` with `Resource: "*"` and no `Condition` block
3. **Severity**: **MEDIUM** (service wildcard without conditions)
4. **Developer sees**: "⚠️ IAM Policy Issue (MEDIUM): s3:* on all resources without conditions. Recommendation: Add resource constraint or IP condition."
5. **Resolution**: Developer adds `Resource: "arn:aws:s3:::my-specific-bucket/*"`
6. **Result**: Policy is scoped appropriately before deployment

### Scenario 3: Developer Sends Large Context to Model

1. **Layer 4** (`excluded-paths.yaml`): Pre-filters context buffer
   - Removes `node_modules/` (noise reduction)
   - Removes `.env` files (secret prevention)
2. **Layer 3** (`pre-send-scan.yaml`): Scans remaining context
3. **Detection**: Finds high-entropy string in `config/database.ts`: `dGVzdDpwYXNzd29yZDEyMw==`
4. **Entropy**: 4.8 bits/character (above 4.5 threshold)
5. **Action**: `on_failure: block_send`
6. **Developer sees**: "❌ High-entropy string detected in context buffer. Potential secret at config/database.ts:17"
7. **Resolution**: Developer removes hardcoded base64 string, uses environment variable
8. **Result**: Context transmission blocked, secret never leaves developer's machine

### Scenario 4: CI/CD Pipeline Deployment

1. **Layer 2** (`validate-iam.yaml`): Validates all IAM policies in infrastructure-as-code
2. **Layer 1** (`scan-secrets.yaml`): Scans all configuration files
3. **Layer 4** (`excluded-paths.yaml`): Ensures production config files aren't accidentally committed
4. **Result**: Infrastructure changes validated before deployment, no misconfigurations reach production

---

## Integration Patterns

### Pattern 1: Kiro IDE + Local Development

```yaml
# Developer workflow:
1. Edit file → Layer 1 (scan-secrets) runs on save
2. Edit IAM policy → Layer 2 (validate-iam) runs on save
3. Send context to model → Layer 4 filters → Layer 3 scans → Layer 1 patterns checked
```

All layers run locally on developer's machine. Zero secrets ever transmitted.

### Pattern 2: CI/CD Safety Net

```yaml
# CI/CD pipeline (GitHub Actions, GitLab CI, etc.):
name: Security Validation
on: [push, pull_request]
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
      - name: Validate IAM Policies
        run: |
          # Run validate-iam.yaml hook logic
          # Flag any HIGH severity findings as pipeline failure
```

Hooks run in IDE (instant feedback) AND in CI/CD (safety net).

### Pattern 3: Pre-Commit Git Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash
# Run secret scanning before allowing commit
kiro hook run scan-secrets.yaml --staged-files
if [ $? -ne 0 ]; then
  echo "❌ Secrets detected. Commit blocked."
  exit 1
fi
```

Prevents secrets from ever reaching version control.

### Pattern 4: Model Routing with Security Context

```yaml
# .kiro/config.yaml
model_routing:
  # IAM validation uses model-assisted analysis
  iam_validation: sonnet  # Complex reasoning required
  
  # Secret scanning is local-only (no model needed)
  secret_scanning: local  # Zero cost, zero latency
  
  # Context filtering is local-only
  pre_send_scan: local    # Last line of defense
```

Security-critical operations are local-only where possible, model-assisted only when necessary.

---

## When to Use Each Hook

### Use `scan-secrets.yaml` when:
- ✅ Your team can install gitleaks (via brew, apt, or binary)
- ✅ You want the most comprehensive, actively maintained secret detection
- ✅ You trust external tool dependencies in your environment
- ✅ You want regular pattern updates (gitleaks is updated frequently)

### Use `scan-secrets-regex.yaml` when:
- ✅ You cannot install external dependencies (corporate restrictions)
- ✅ You're in an air-gapped or restricted network environment
- ✅ You want full control over detection patterns
- ✅ You need to customize patterns for proprietary secret formats

### Use `validate-iam.yaml` when:
- ✅ Your team writes IAM policies (CloudFormation, Terraform, Pulumi, CDK)
- ✅ You deploy to AWS and need to prevent overly permissive policies
- ✅ You want automated enforcement of least-privilege principle
- ✅ You need audit trail of policy changes (for SOX, FISMA, etc.)

### Use `pre-send-scan.yaml` when:
- ✅ Always (recommended for all teams using AI-assisted development)
- ✅ You want a final safety check before context transmission
- ✅ You need defense against secrets in context buffer (not just files)
- ✅ You want entropy-based detection for unknown secret formats

### Use `excluded-paths.yaml` when:
- ✅ Always (recommended for all teams)
- ✅ You have sensitive directories that should never reach models
- ✅ You want to reduce noise (exclude `node_modules/`, build artifacts)
- ✅ You need to enforce data residency controls

---

## Compliance Mapping

### PCI DSS (Payment Card Industry Data Security Standard)

**Requirement 3.4**: Render PAN unreadable anywhere it is stored
- **Hooks**: `scan-secrets.yaml`, `scan-secrets-regex.yaml` detect hardcoded credit card numbers
- **Evidence**: Hook execution logs showing detection and blocking

**Requirement 6.3.1**: Remove development, test, and custom accounts and credentials before production release
- **Hooks**: `scan-secrets.yaml` detects test API keys, hardcoded passwords
- **Evidence**: Pre-commit hook logs preventing secrets in version control

**Requirement 8.3.1**: Implement multifactor authentication for all remote network access
- **Hooks**: `validate-iam.yaml` flags missing MFA conditions on IAM policies
- **Evidence**: IAM policy validation reports

### SOX Section 404 (Sarbanes-Oxley Internal Controls)

**Control**: Change management with audit trails
- **Hooks**: All hooks log execution, findings, and remediation
- **Evidence**: Hook execution logs, IAM policy change history

**Control**: Segregation of duties (approval requirements)
- **Hooks**: `validate-iam.yaml` can require approval for HIGH severity findings
- **Evidence**: PR reviews with security validation results

### GDPR (General Data Protection Regulation)

**Article 32**: Security of processing (appropriate technical measures)
- **Hooks**: All four layers implement technical controls for data protection
- **Evidence**: Hook configuration, execution logs, blocked transmissions

**Data minimization**: Only necessary data sent to models
- **Hooks**: `excluded-paths.yaml` enforces data minimization
- **Evidence**: Path exclusion configuration, context filtering logs

### FISMA (Federal Information Security Management Act)

**Control**: Access control (least privilege)
- **Hooks**: `validate-iam.yaml` enforces least-privilege IAM policies
- **Evidence**: IAM policy validation reports

**Control**: Configuration management
- **Hooks**: All hooks enforce secure configuration baseline
- **Evidence**: Hook configuration files, validation results

---

## Performance Considerations

### Scanning Performance

| Hook | Typical Execution Time | Files Scanned | Impact |
|------|------------------------|---------------|--------|
| `scan-secrets.yaml` | 50-200ms | Current file | Negligible (runs on save) |
| `scan-secrets-regex.yaml` | 10-50ms | Current file | Negligible (pure regex) |
| `validate-iam.yaml` | 500ms-2s | Current IAM file | Low (infrequent, model call) |
| `pre-send-scan.yaml` | 100-500ms | Context buffer | Low (runs once per context send) |

### Optimization Strategies

1. **Incremental Scanning**: Only scan changed files, not entire codebase
2. **Caching**: Cache gitleaks binary, regex pattern compilation
3. **Parallel Execution**: Run multiple pattern checks concurrently
4. **Smart Filtering**: Use `excluded-paths.yaml` to skip large dependency directories
5. **Async Model Calls**: IAM validation doesn't block file save, shows results after completion

### Scaling to Large Codebases

For monorepos with 10,000+ files:
- Use `excluded-paths.yaml` aggressively to skip `node_modules/`, `vendor/`, etc.
- Configure scan-secrets to only scan tracked files (not untracked/ignored)
- Use gitleaks' built-in caching and incremental scanning modes
- Consider running full scans in CI/CD, lightweight scans in IDE

---

## Troubleshooting

### Issue: "Gitleaks not found in PATH"

**Cause**: `scan-secrets.yaml` requires gitleaks binary

**Solution 1** (Mac): `brew install gitleaks`
**Solution 2** (Linux): Download from https://github.com/gitleaks/gitleaks/releases
**Solution 3** (Alternative): Use `scan-secrets-regex.yaml` instead (zero-dependency)

### Issue: "False positive: Documentation example flagged as secret"

**Cause**: Example API keys in documentation match secret patterns

**Solution**: Add inline whitelist marker:
```typescript
const apiKey = "sk_test_1234567890abcdefghijklmnop"; // gitleaks:allow
```

OR add to gitleaks configuration:
```toml
[allowlist]
  paths = ["docs/examples/**"]
```

### Issue: "IAM validation taking too long"

**Cause**: Model call for complex policy analysis

**Solution**: 
1. Use caching for repeated validations of same policy
2. Run validation async (don't block file save)
3. Configure timeout (default 60s)
4. For very large policies, consider chunking statements

### Issue: "High-entropy false positive on Git commit hash"

**Cause**: Commit hashes have high entropy but aren't secrets

**Solution**: Update `pre-send-scan.yaml` to exclude Git SHA patterns:
```yaml
exclude_patterns:
  - '[0-9a-f]{40}' # Git commit SHA-1
  - '[0-9a-f]{64}' # Git commit SHA-256
```

### Issue: "Production deployment blocked by security hook"

**Cause**: Legitimate use case needs exception (e.g., read-only wildcard IAM)

**Solution**:
1. Add inline exception with documentation:
```json
{
  "Action": "s3:Get*",
  "Resource": "*",
  "_comment": "Exception approved 2024-01-15: Read-only wildcard for audit role"
}
```

2. Update `validate-iam.yaml` to allow read-only wildcards (already configured)

---

## Testing and Validation

### Running the Test Suite

```bash
# From repository root
./hooks/security/test-security-hooks.sh

# Expected output: All 22 tests should pass
# ✓ AWS Access Key detection
# ✓ GitHub Token detection
# ✓ Stripe API Key detection
# ✓ MongoDB Connection String detection
# ✓ PostgreSQL Connection String detection
# ✓ Private Key detection
# ✓ Whitelist marker handling
# ✓ IAM wildcard detection
# ✓ IAM missing condition detection
# ✓ High-entropy string detection
# ✓ Context buffer scanning
# ✓ Excluded paths pattern matching
```

### Test Files

Located in `hooks/security/test-samples/`:
- `secrets-test-file.ts` - Contains intentional test secrets for pattern validation
- `iam-policy-test.json` - Sample IAM policies with known issues
- `context-buffer-test.txt` - Context buffer with various secret patterns

⚠️ **WARNING**: Test files contain INTENTIONAL secrets for validation purposes. Do NOT use these patterns in production code. Do NOT commit real secrets to test files.

### Manual Testing

1. **Test secret detection**:
   ```bash
   # Add a test secret to a file
   echo 'const key = "AKIAI44QH8DHBEXAMPLE"' > test.ts
   # Hook should block on save
   ```

2. **Test IAM validation**:
   ```bash
   # Create overly permissive policy
   cat > test-policy.json <<EOF
   {
     "Action": "*",
     "Resource": "*"
   }
   EOF
   # Hook should flag as HIGH severity
   ```

3. **Test pre-send scanning**:
   ```bash
   # Attempt to send context with high-entropy string
   # Context buffer should be blocked
   ```

---

## Migration from Other Tools

### Migrating from TruffleHog

TruffleHog is Git-history focused. Kiro hooks are file-save focused.

**Migration path**:
1. Keep TruffleHog in CI/CD for historical scans
2. Add Kiro hooks for real-time prevention (instant feedback)
3. Both tools can coexist (defense in depth)

**Pattern mapping**:
- TruffleHog regexes → `scan-secrets-regex.yaml` patterns
- TruffleHog entropy → `pre-send-scan.yaml` entropy detection

### Migrating from AWS IAM Access Analyzer

IAM Access Analyzer is post-deployment. Kiro hooks are pre-deployment.

**Migration path**:
1. Keep Access Analyzer for deployed resources (continuous monitoring)
2. Add `validate-iam.yaml` for development-time prevention
3. Both tools complement each other

**Policy mapping**:
- Access Analyzer findings → `validate-iam.yaml` detection patterns
- External access findings → Add to validation rules

### Migrating from Git-Secrets

Git-Secrets is pre-commit. Kiro hooks are pre-save AND pre-commit.

**Migration path**:
1. Remove `.git/hooks/pre-commit` (replaced by Kiro hooks)
2. Migrate patterns from `.git/secrets` to `scan-secrets-regex.yaml`
3. Gain instant feedback (on save) instead of delayed (on commit)

**Pattern migration**:
```bash
# Extract patterns from git-secrets
git secrets --list

# Add to scan-secrets-regex.yaml
# Convert AWS provider patterns to regex
# Test with validation suite
```

---

## Architecture Decisions

### Why Four Layers?

**Single point of failure is unacceptable for security.**

Each layer addresses different failure modes:
- **Layer 1** fails: File saved with secret, but Layers 3 and 4 still block transmission
- **Layer 2** fails: Bad IAM policy saved, but CI/CD safety net catches it
- **Layer 3** fails: Context buffer not scanned, but Layer 4 exclusions prevent sensitive files
- **Layer 4** fails: Sensitive file reaches context, but Layers 1 and 3 detect secrets

### Why Local-First Execution?

**Trust but verify: Secrets should never leave the developer's machine.**

- `run: command:` executes locally, zero network calls
- No secrets ever sent to any external service (including Kiro models)
- Compliance requirement for PCI DSS, GDPR, FISMA
- Zero cost (no API calls for security checks)
- Zero latency (instant feedback on file save)

### Why Model-Assisted IAM Validation?

**IAM policies are complex and context-dependent.**

Static analysis misses:
- Conditional logic (when is `s3:*` acceptable?)
- Resource constraints (wildcards with specific buckets)
- Role assumptions (cross-account access patterns)

Model-assisted analysis:
- Understands policy intent from comments
- Classifies by severity (HIGH/MEDIUM/LOW/INFO)
- Provides remediation guidance specific to the policy
- Learns from organization-specific patterns

### Why Both Gitleaks and Regex Alternatives?

**Different environments have different constraints.**

- **Gitleaks**: Comprehensive, actively maintained, industry standard
  - Requires binary installation (not always possible)
  - External dependency (supply chain consideration)

- **Regex**: Zero dependencies, full control, customizable
  - Patterns require manual maintenance
  - May have lower detection rate than Gitleaks

Provide both → customers choose based on their environment.

---

## Metrics and Monitoring

### Hook Execution Metrics

Track these metrics for security visibility:

| Metric | What it Measures | Target |
|--------|------------------|--------|
| `secrets_blocked_count` | Number of secrets prevented from reaching models | N/A (higher is better) |
| `iam_high_severity_count` | HIGH severity IAM findings | 0 in production |
| `iam_medium_severity_count` | MEDIUM severity IAM findings | < 5 per quarter |
| `false_positive_rate` | Secrets flagged but whitelisted | < 2% |
| `hook_execution_time_p95` | 95th percentile hook execution time | < 200ms for Layer 1, < 2s for Layer 2 |
| `context_blocks_count` | Context transmissions blocked | N/A (indicates hook effectiveness) |

### Security Dashboard

Recommended metrics to visualize:

```
Security Hooks Dashboard
========================

Secrets Detected (Last 30 Days): 47
├─ AWS Keys: 12
├─ API Tokens: 18
├─ Private Keys: 5
├─ Connection Strings: 9
└─ High-Entropy: 3

IAM Issues (Last 30 Days): 23
├─ HIGH: 2 (🚨 action required)
├─ MEDIUM: 8 (⚠️ review recommended)
├─ LOW: 13 (ℹ️ informational)

Context Blocks: 5
├─ High-Entropy: 3
├─ Sensitive Paths: 2

False Positives: 3 (1.5% of total detections)
```

### Audit Logging

Hook executions are logged for compliance:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "hook": "scan-secrets.yaml",
  "file": "src/config/database.ts",
  "result": "blocked",
  "finding": {
    "type": "AWS_ACCESS_KEY",
    "line": 42,
    "pattern": "AKIA[0-9A-Z]{16}"
  },
  "user": "developer@example.com",
  "action_taken": "file_excluded_from_context"
}
```

Retain logs for:
- PCI DSS: 1 year minimum
- SOX: 7 years minimum
- GDPR: As required by data retention policy

---

## Future Enhancements

### Planned Features

1. **ML-Based Secret Detection**
   - Train model on known secret formats
   - Detect unknown secret patterns via anomaly detection
   - Reduce false positives with context-aware classification

2. **Automated Remediation**
   - Auto-replace hardcoded secrets with environment variable references
   - Generate `.env.example` from detected environment variable usage
   - Suggest AWS Secrets Manager integration

3. **Team-Wide Secret Inventory**
   - Central tracking of all detected secrets across team
   - Identify patterns (which types of secrets are most common?)
   - Rotation reminders for long-lived secrets

4. **IAM Policy Generation**
   - Generate least-privilege policies from code usage analysis
   - Suggest condition blocks based on resource access patterns
   - Auto-update policies when code changes

5. **Compliance Report Generation**
   - One-click compliance reports for PCI DSS, SOX, GDPR
   - Evidence collection (hook logs, blocked transmissions)
   - Audit trail export for regulators

---

## Support and Contributing

### Getting Help

- **Documentation**: This README and inline hook comments
- **Examples**: Test files in `test-samples/` directory
- **Issues**: Report bugs or request features via GitHub Issues

### Contributing New Patterns

To add a new secret pattern to `scan-secrets-regex.yaml`:

1. Add pattern to `patterns` list with descriptive comment
2. Add test case to `test-samples/secrets-test-file.ts`
3. Run test suite: `./test-security-hooks.sh`
4. Submit PR with pattern, test, and documentation

### Contributing IAM Detection Rules

To add organization-specific IAM rules to `validate-iam.yaml`:

1. Document the policy pattern that should be flagged
2. Add test case to `test-samples/iam-policy-test.json`
3. Update hook with new detection logic
4. Document severity classification rationale
5. Submit PR

---

## Summary

The security hooks architecture implements **defense in depth** with four complementary layers:

1. **Layer 1**: Local secret scanning (gitleaks or regex)
2. **Layer 2**: IAM policy validation (model-assisted analysis)
3. **Layer 3**: Pre-send context buffer scanning (entropy detection)
4. **Layer 4**: Data residency controls (path exclusions)

All hooks are **local-first** where possible, ensuring secrets never leave the developer's machine. Model-assisted analysis is used only when necessary (IAM validation) and never transmits secrets.

The architecture is **production-ready**, **compliance-friendly** (PCI DSS, SOX, GDPR, FISMA), and **extensively tested** (22 automated tests, comprehensive test samples).

**Time Savings**: Research shows developers spend 49% of weekly time on security issues. These hooks automate secret scanning, IAM validation, and data residency enforcement → reducing security work to background automation.

**Integration**: Hooks run in Kiro IDE (instant feedback) AND in CI/CD (safety net) AND as pre-commit hooks (version control protection) for comprehensive coverage.

For questions, see inline hook comments or contact your Cloud Engineering team.
