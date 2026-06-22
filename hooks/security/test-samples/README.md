# Security Test Samples

⚠️ **IMPORTANT**: This directory contains **INTENTIONAL FAKE/TEST SECRETS** for validation purposes only.

## Purpose

These files are used to test and validate the secret scanning hooks:
- `toolkit/hooks/security/scan-secrets.json` - Gitleaks-based local secret scanning
- `toolkit/hooks/security/pre-send-scan.json` - Regex-based pre-send secret scanning

## Files

### context-buffer-test.txt
Test file containing various patterns to validate context buffer scanning including:
- Redacted real secret patterns (AWS keys, GitHub tokens, Stripe keys)
- Safe placeholders and environment variable references
- High entropy strings that are NOT secrets
- Compliance-sensitive data examples

### secrets-test-file.ts
TypeScript file with intentional (redacted) test secrets to validate scanning functionality:
- AWS Access/Secret Keys (REDACTED)
- GitHub Personal Access Tokens (REDACTED)
- Stripe API Keys (REDACTED)
- Database connection strings (REDACTED)
- Private keys (REDACTED)

## Git-Defender Configuration

These files are excluded from git-defender scanning via:
```bash
git config defender.bypass.files 'hooks/security/test-samples/context-buffer-test.txt,hooks/security/test-samples/secrets-test-file.ts,tests/secret-scanning/test-patterns.sh'
```

## Security Notice

**All secrets in these files are:**
1. Intentionally redacted with `************` or `[REDACTED]` markers
2. Based on AWS's official documentation examples (e.g., `AKIAIOSFODNN7EXAMPLE`)
3. Publicly known test patterns that are NOT real credentials
4. Excluded from git-defender via configuration

**DO NOT:**
- Use any patterns from these files in production code
- Add real credentials to these test files
- Remove the redaction markers or git-defender bypass configuration

## Validation

To test that secret scanning is working correctly:

1. **Local scanning** (gitleaks):
   ```bash
   gitleaks detect --source=hooks/security/test-samples/secrets-test-file.ts --no-git
   ```

2. **Regex-based scanning**:
   ```bash
   ./tests/secret-scanning/test-patterns.sh
   ```

Both should detect the redacted patterns appropriately while allowing safe placeholders.

## References

- [AWS Example Credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html)
- [Gitleaks Patterns](https://github.com/gitleaks/gitleaks)
- Kiro Tactical Guide - Section 4: "AI tools leaking sensitive data"
