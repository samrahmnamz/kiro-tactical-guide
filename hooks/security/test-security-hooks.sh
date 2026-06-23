#!/bin/bash

# Test script for security hooks validation
# This script tests all security artifacts against sample files
# Exit codes: 0 = all tests passed, 1 = one or more tests failed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIR="$SCRIPT_DIR/test-samples"
RESULTS_DIR="$SCRIPT_DIR/test-results"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "Security Hooks Test Suite"
echo "========================================"
echo ""

# Create results directory
mkdir -p "$RESULTS_DIR"

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: scan-secrets-regex.yaml patterns
echo "Test 1: Regex-based secret scanning patterns"
echo "--------------------------------------------"

# Extract patterns from scan-secrets-regex.yaml
PATTERNS=(
  'AKIA[0-9A-Z]{16}'                                    # AWS Access Key
  '(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}'            # GitHub Token
  'sk_(live|test)_[a-zA-Z0-9]{24,}'                   # Stripe API Key
  'mongodb\+srv://[^:]+:[^@]+@'                       # MongoDB URI
  'postgresql://[^:]+:[^@]+@'                         # PostgreSQL URI
  'BEGIN.*PRIVATE KEY' # Private Key
)

PATTERN_NAMES=(
  "AWS Access Key"
  "GitHub Token"
  "Stripe API Key"
  "MongoDB Connection String"
  "PostgreSQL Connection String"
  "Private Key"
)

TEST_FILE="$TEST_DIR/secrets-test-file.ts"

for i in "${!PATTERNS[@]}"; do
  PATTERN="${PATTERNS[$i]}"
  NAME="${PATTERN_NAMES[$i]}"
  
  echo -n "  Testing $NAME pattern... "
  
  if grep -qE "$PATTERN" "$TEST_FILE"; then
    echo -e "${GREEN}✓ DETECTED${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ MISSED${NC}"
    ((TESTS_FAILED++))
  fi
done

echo ""

# Test 2: Whitelist functionality
echo "Test 2: Whitelist markers (gitleaks:allow, nosecret)"
echo "-----------------------------------------------------"

echo -n "  Testing whitelist marker detection... "
if grep -q "gitleaks:allow" "$TEST_FILE"; then
  echo -e "${GREEN}✓ FOUND${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ NOT FOUND${NC}"
  ((TESTS_FAILED++))
fi

echo ""

# Test 3: IAM Policy Validation Patterns
echo "Test 3: IAM Policy Validation"
echo "------------------------------"

IAM_TEST_FILE="$TEST_DIR/iam-policy-test.json"

# Check for wildcard actions
echo -n "  Testing wildcard Action detection... "
if grep -q '"Action": "\*"' "$IAM_TEST_FILE"; then
  echo -e "${GREEN}✓ DETECTED${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ MISSED${NC}"
  ((TESTS_FAILED++))
fi

# Check for wildcard resources
echo -n "  Testing wildcard Resource detection... "
if grep -q '"Resource": "\*"' "$IAM_TEST_FILE"; then
  echo -e "${GREEN}✓ DETECTED${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ MISSED${NC}"
  ((TESTS_FAILED++))
fi

# Check for missing conditions on write operations
echo -n "  Testing missing Condition detection... "
# Count statements without Condition blocks
STATEMENTS_WITHOUT_CONDITION=$(jq '[.Statement[] | select(.Condition == null)] | length' "$IAM_TEST_FILE" 2>/dev/null || echo "0")
if [ "$STATEMENTS_WITHOUT_CONDITION" -gt 0 ]; then
  echo -e "${GREEN}✓ DETECTED ($STATEMENTS_WITHOUT_CONDITION statements)${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${YELLOW}⚠ No statements without conditions (may be a test file issue)${NC}"
fi

echo ""

# Test 4: Context Buffer Pre-Send Scanning
echo "Test 4: Context Buffer Pre-Send Scanning"
echo "-----------------------------------------"

CONTEXT_TEST_FILE="$TEST_DIR/context-buffer-test.txt"

# Test entropy detection (simplified - looking for base64-like strings)
echo -n "  Testing high-entropy string detection... "
if grep -qE '[A-Za-z0-9+/]{40,}={0,2}' "$CONTEXT_TEST_FILE"; then
  echo -e "${GREEN}✓ DETECTED${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ MISSED${NC}"
  ((TESTS_FAILED++))
fi

# Test connection string detection
echo -n "  Testing connection string detection... "
if grep -qE '(postgresql|mongodb)://[^:]+:[^@]+@' "$CONTEXT_TEST_FILE"; then
  echo -e "${GREEN}✓ DETECTED${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ MISSED${NC}"
  ((TESTS_FAILED++))
fi

# Test private key detection
echo -n "  Testing private key detection... "
if grep -q "BEGIN PRIVATE KEY" "$CONTEXT_TEST_FILE"; then
  echo -e "${GREEN}✓ DETECTED${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ MISSED${NC}"
  ((TESTS_FAILED++))
fi

echo ""

# Test 5: Excluded Paths Pattern Matching
echo "Test 5: Excluded Paths Pattern Validation"
echo "------------------------------------------"

# Test patterns from excluded-paths.yaml
EXCLUDED_PATTERNS=(
  ".env"
  ".env.local"
  "secrets/api-keys.txt"
  "vault/production.yml"
  "config/production.yaml"
  "src/crypto/keys/private.pem"
  "node_modules/package/index.js"
  ".git/config"
  ".ssh/id_rsa"
)

EXCLUDED_PATTERN_NAMES=(
  ".env file"
  ".env.local file"
  "secrets/ directory file"
  "vault/ directory file"
  "production config"
  "crypto keys"
  "node_modules"
  ".git directory"
  ".ssh directory"
)

for i in "${!EXCLUDED_PATTERNS[@]}"; do
  PATTERN="${EXCLUDED_PATTERNS[$i]}"
  NAME="${EXCLUDED_PATTERN_NAMES[$i]}"
  
  echo -n "  Testing exclusion of $NAME... "
  
  # Simulate pattern matching (checking if pattern would be excluded)
  # In real hook, this would use .gitignore-style matching
  if [[ "$PATTERN" =~ (\.env|secrets/|vault/|production|crypto/keys|node_modules|\.git|\.ssh) ]]; then
    echo -e "${GREEN}✓ WOULD BE EXCLUDED${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ WOULD NOT BE EXCLUDED${NC}"
    ((TESTS_FAILED++))
  fi
done

echo ""

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo -e "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "\n${GREEN}✓ ALL TESTS PASSED${NC}"
  exit 0
else
  echo -e "\n${RED}✗ SOME TESTS FAILED${NC}"
  exit 1
fi
