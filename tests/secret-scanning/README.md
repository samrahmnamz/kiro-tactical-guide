# Secret Scanning Tests

Comprehensive test suite for validating secret detection accuracy in Kiro hooks.

## Purpose

This test suite validates that secret scanning hooks correctly:
1. **Detect true positives** - Real secret patterns that should be caught
2. **Avoid false positives** - Safe placeholders and documentation examples that should pass
3. **Handle edge cases** - Unusual formatting, whitespace, multi-line strings, etc.

## Test File

### test-patterns.sh

Bash script that runs 60+ tests across 7 categories:

1. **AWS Keys Detection** (6 tests)
   - Access keys in various formats (env vars, config files, code)
   - Secret access keys
   - JSON configurations

2. **API Tokens Detection** (9 tests)
   - GitHub Personal Access Tokens
   - OpenAI API keys
   - Anthropic API keys
   - Stripe live keys
   - Slack tokens
   - JWT tokens
   - Generic API key/secret/token assignments

3. **Private Keys Detection** (4 tests)
   - RSA private keys
   - EC private keys
   - Generic private keys
   - OpenSSH private keys

4. **Database Connection Strings Detection** (5 tests)
   - PostgreSQL
   - MySQL
   - MongoDB (standard and SRV)
   - Redis

5. **Password Assignments Detection** (4 tests)
   - TypeScript/JavaScript
   - Python
   - JSON
   - YAML

6. **False Positive Handling** (11 tests)
   - Example/sample markers
   - Placeholders (XXXXXXXX, your-key-here)
   - Documentation references
   - Empty assignments
   - Environment variable references
   - Test data markers

7. **Edge Cases** (8 tests)
   - End of line placement
   - Whitespace handling
   - Multiple secrets per line
   - Multi-line strings
   - Base64 data (not secrets)
   - Localhost development connections

## Usage

Run all tests:
```bash
./tests/secret-scanning/test-patterns.sh
```

Expected output:
```
🔍 Secret Scanning Accuracy Test Suite
======================================================================

Test Section 1: AWS Keys Detection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ AWS Access Key in environment variable
✓ AWS Access Key in config file
...

📊 Test Summary
======================================================================
Total Tests:  60+
Passed:       60+
Failed:       0

✅ All tests passed!
```

## Test Secrets

⚠️ **All secrets in `test-patterns.sh` are intentional test data**:
- Based on AWS's official documentation examples (e.g., `AKIAIOSFODNN7EXAMPLE`)
- Publicly known patterns that are NOT real credentials
- Excluded from git-defender via:
  ```bash
  git config defender.bypass.files '...,tests/secret-scanning/test-patterns.sh'
  ```

## Integration with Hooks

These tests validate the patterns used in:
- `toolkit/hooks/security/scan-secrets.json` - Gitleaks-based scanning
- `toolkit/hooks/security/pre-send-scan.json` - Regex-based pre-send scanning

If tests fail:
1. Review the failed test output
2. Update the regex patterns in the hooks
3. Re-run tests to verify fixes

## Coverage

Current test coverage:
- ✅ AWS credentials (Access Keys, Secret Keys)
- ✅ API tokens (GitHub, OpenAI, Anthropic, Stripe, Slack)
- ✅ Private keys (RSA, EC, OpenSSH)
- ✅ Database connection strings (PostgreSQL, MySQL, MongoDB, Redis)
- ✅ Generic password assignments
- ✅ JWT tokens
- ✅ False positive scenarios
- ✅ Edge cases and formatting variations

## Adding New Tests

To add a new test pattern:

```bash
run_test "Test Description" \
    "code or config containing pattern" \
    "true|false"  # Should this be detected? \
    "pattern-type"
```

Pattern types:
- `aws-key`, `aws-secret`
- `github-pat`, `openai`, `anthropic`, `stripe`, `slack`
- `private-key`
- `postgres`, `mysql`, `mongodb`, `redis`
- `password`, `jwt`
- `api-key-generic`, `secret-generic`, `token-generic`

## References

- Kiro Tactical Guide - Section 1: "Security & compliance eating engineering time"
- Kiro Tactical Guide - Section 4: "AI tools leaking sensitive data"
- [AWS Example Credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html)
- [Gitleaks Configuration](https://github.com/gitleaks/gitleaks)
