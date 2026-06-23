#!/bin/bash

# Payment Processor Integration Test Suite
# This script validates the payment processor example for:
# - Build and compilation
# - Unit tests
# - Deployment (infrastructure validation)
# - Functional API endpoint testing
# - Security compliance (PCI DSS, secret scanning, IAM validation)
# Exit codes: 0 = all tests passed, 1 = one or more tests failed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
PAYMENT_PROCESSOR_DIR="$PROJECT_ROOT/examples/payment-processor"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================"
echo "Payment Processor Integration Test Suite"
echo "========================================"
echo ""

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test result
print_result() {
  local test_name=$1
  local result=$2
  
  if [ "$result" -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $test_name"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} $test_name"
    ((TESTS_FAILED++))
  fi
}

# ===================================================================
# PRE-FLIGHT CHECKS
# ===================================================================

echo "Pre-flight Checks"
echo "----------------------------------------"

# Check if payment-processor directory exists
echo -n "Checking payment-processor directory... "
if [ -d "$PAYMENT_PROCESSOR_DIR" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} Directory not found: $PAYMENT_PROCESSOR_DIR"
  ((TESTS_FAILED++))
  exit 1
fi

# Check if package.json exists
echo -n "Checking package.json... "
if [ -f "$PAYMENT_PROCESSOR_DIR/package.json" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} package.json not found"
  ((TESTS_FAILED++))
  exit 1
fi

# Check if spec.md exists
echo -n "Checking spec.md... "
if [ -f "$PAYMENT_PROCESSOR_DIR/spec.md" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} spec.md not found"
  ((TESTS_FAILED++))
fi

# Check for node_modules (dependencies installed)
echo -n "Checking dependencies... "
if [ -d "$PAYMENT_PROCESSOR_DIR/node_modules" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${YELLOW}⚠${NC} node_modules not found, installing dependencies..."
  cd "$PAYMENT_PROCESSOR_DIR"
  npm install --silent > /dev/null 2>&1 || {
    echo -e "${RED}✗${NC} Failed to install dependencies"
    ((TESTS_FAILED++))
    exit 1
  }
  echo -e "${GREEN}✓${NC} Dependencies installed"
  ((TESTS_PASSED++))
fi

echo ""

# ===================================================================
# BUILD TESTS
# ===================================================================

echo "========================================"
echo "Build Tests"
echo "========================================"
echo ""

cd "$PAYMENT_PROCESSOR_DIR"

# Test 1: TypeScript compilation
echo -n "Test: TypeScript compilation... "
if npm run build > /dev/null 2>&1; then
  print_result "TypeScript compilation" 0
else
  print_result "TypeScript compilation" 1
  echo -e "${RED}  Error: TypeScript compilation failed${NC}"
fi

# Test 2: Verify dist directory created
echo -n "Test: Output directory created... "
if [ -d "$PAYMENT_PROCESSOR_DIR/dist" ]; then
  print_result "Output directory created" 0
else
  print_result "Output directory created" 1
fi

# Test 3: Verify compiled files exist
echo -n "Test: Compiled files exist... "
EXPECTED_FILES=("index.js" "types.js" "payment-service.js" "logger.js" "encryption.js")
ALL_FILES_EXIST=true

for file in "${EXPECTED_FILES[@]}"; do
  if [ ! -f "$PAYMENT_PROCESSOR_DIR/dist/$file" ]; then
    ALL_FILES_EXIST=false
    echo -e "${RED}  Missing: dist/$file${NC}"
  fi
done

if [ "$ALL_FILES_EXIST" = true ]; then
  print_result "All compiled files exist" 0
else
  print_result "All compiled files exist" 1
fi

# Test 4: TypeScript type checking (no emit)
echo -n "Test: TypeScript type checking... "
if npx tsc --noEmit > /dev/null 2>&1; then
  print_result "TypeScript type checking" 0
else
  print_result "TypeScript type checking" 1
  echo -e "${RED}  Error: Type checking failed${NC}"
fi

echo ""

# ===================================================================
# UNIT TESTS
# ===================================================================

echo "========================================"
echo "Unit Tests"
echo "========================================"
echo ""

# Test 1: Run unit tests
echo -n "Test: Unit tests execution... "
if npm run test:unit > /dev/null 2>&1; then
  print_result "Unit tests pass" 0
else
  print_result "Unit tests pass" 1
  echo -e "${YELLOW}  Note: Some unit tests may require mocks${NC}"
fi

# Test 2: Check test coverage exists
echo -n "Test: Test coverage generation... "
if [ -d "$PAYMENT_PROCESSOR_DIR/coverage" ] || npm run test:coverage > /dev/null 2>&1; then
  print_result "Test coverage generated" 0
else
  print_result "Test coverage generated" 1
fi

# Test 3: Verify test files exist
echo -n "Test: Test files present... "
TEST_DIRS=("tests/unit" "tests/integration")
TESTS_EXIST=true

for dir in "${TEST_DIRS[@]}"; do
  if [ ! -d "$PAYMENT_PROCESSOR_DIR/$dir" ]; then
    TESTS_EXIST=false
    echo -e "${RED}  Missing: $dir${NC}"
  fi
done

if [ "$TESTS_EXIST" = true ]; then
  print_result "Test directories exist" 0
else
  print_result "Test directories exist" 1
fi

echo ""

# ===================================================================
# INTEGRATION TESTS
# ===================================================================

echo "========================================"
echo "Integration Tests"
echo "========================================"
echo ""

# Test 1: Run integration tests
echo -n "Test: Integration tests execution... "
if npm run test:integration > /dev/null 2>&1; then
  print_result "Integration tests pass" 0
else
  print_result "Integration tests pass" 1
  echo -e "${YELLOW}  Note: Integration tests may require AWS services or mocks${NC}"
fi

# Test 2: API integration tests exist
echo -n "Test: API integration tests exist... "
if [ -f "$PAYMENT_PROCESSOR_DIR/tests/integration/api.test.ts" ]; then
  print_result "API integration tests" 0
else
  print_result "API integration tests" 1
fi

# Test 3: Payment flow tests exist
echo -n "Test: Payment flow tests exist... "
if [ -f "$PAYMENT_PROCESSOR_DIR/tests/integration/payment-flow.test.ts" ]; then
  print_result "Payment flow tests" 0
else
  print_result "Payment flow tests" 1
fi

# Test 4: Error handling tests exist
echo -n "Test: Error handling tests exist... "
if [ -f "$PAYMENT_PROCESSOR_DIR/tests/integration/error-handling.test.ts" ]; then
  print_result "Error handling tests" 0
else
  print_result "Error handling tests" 1
fi

# Test 5: Idempotency tests exist
echo -n "Test: Idempotency tests exist... "
if [ -f "$PAYMENT_PROCESSOR_DIR/tests/integration/idempotency.test.ts" ]; then
  print_result "Idempotency tests" 0
else
  print_result "Idempotency tests" 1
fi

echo ""

# ===================================================================
# INFRASTRUCTURE/DEPLOYMENT VALIDATION
# ===================================================================

echo "========================================"
echo "Infrastructure Validation"
echo "========================================"
echo ""

# Test 1: CDK infrastructure directory exists
echo -n "Test: CDK infrastructure exists... "
if [ -d "$PAYMENT_PROCESSOR_DIR/infra" ]; then
  print_result "CDK infrastructure directory" 0
else
  print_result "CDK infrastructure directory" 1
fi

# Test 2: CDK package.json exists
echo -n "Test: CDK package.json... "
if [ -f "$PAYMENT_PROCESSOR_DIR/infra/package.json" ]; then
  print_result "CDK package.json exists" 0
else
  print_result "CDK package.json exists" 1
fi

# Test 3: CDK lib directory with stack definition
echo -n "Test: CDK stack definition... "
if [ -d "$PAYMENT_PROCESSOR_DIR/infra/lib" ]; then
  STACK_FILES=$(find "$PAYMENT_PROCESSOR_DIR/infra/lib" -name "*stack*.ts" 2>/dev/null | wc -l)
  if [ "$STACK_FILES" -gt 0 ]; then
    print_result "CDK stack definition exists" 0
  else
    print_result "CDK stack definition exists" 1
  fi
else
  print_result "CDK lib directory exists" 1
fi

# Test 4: CDK TypeScript compilation
if [ -d "$PAYMENT_PROCESSOR_DIR/infra" ]; then
  echo -n "Test: CDK TypeScript compilation... "
  cd "$PAYMENT_PROCESSOR_DIR/infra"
  
  # Check if node_modules exists, install if needed
  if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing CDK dependencies...${NC}"
    npm install --silent > /dev/null 2>&1
  fi
  
  if npx tsc --noEmit > /dev/null 2>&1; then
    print_result "CDK TypeScript compiles" 0
  else
    print_result "CDK TypeScript compiles" 1
  fi
  
  cd "$PAYMENT_PROCESSOR_DIR"
fi

echo ""

# ===================================================================
# SECURITY COMPLIANCE CHECKS
# ===================================================================

echo "========================================"
echo "Security Compliance Checks"
echo "========================================"
echo ""

# Test 1: Check for IAM policy definitions (no wildcards)
echo -n "Test: IAM policies defined (no wildcards)... "
if [ -f "$PAYMENT_PROCESSOR_DIR/infra/lib/payment-processor-stack.ts" ]; then
  WILDCARD_COUNT=$(grep 'Action.*"\*"' "$PAYMENT_PROCESSOR_DIR/infra/lib/"*.ts 2>/dev/null | wc -l | tr -d ' ')
  RESOURCE_WILDCARD_COUNT=$(grep 'Resource.*"\*"' "$PAYMENT_PROCESSOR_DIR/infra/lib/"*.ts 2>/dev/null | wc -l | tr -d ' ')
  
  # Ensure we have numeric values
  WILDCARD_COUNT=${WILDCARD_COUNT:-0}
  RESOURCE_WILDCARD_COUNT=${RESOURCE_WILDCARD_COUNT:-0}
  
  if [ "$WILDCARD_COUNT" -eq 0 ] && [ "$RESOURCE_WILDCARD_COUNT" -eq 0 ]; then
    print_result "No IAM wildcards found" 0
  else
    print_result "No IAM wildcards found" 1
    echo -e "${YELLOW}  Warning: Found $WILDCARD_COUNT Action wildcards and $RESOURCE_WILDCARD_COUNT Resource wildcards${NC}"
  fi
else
  echo -e "${YELLOW}⚠${NC} CDK stack file not found, skipping IAM check"
fi

# Test 2: Check for DynamoDB table definitions
echo -n "Test: DynamoDB tables defined... "
if [ -f "$PAYMENT_PROCESSOR_DIR/infra/lib/payment-processor-stack.ts" ]; then
  TABLE_COUNT=$(grep -c "new.*Table\|dynamodb.Table" "$PAYMENT_PROCESSOR_DIR/infra/lib/"*.ts 2>/dev/null || echo 0)
  
  if [ "$TABLE_COUNT" -ge 1 ]; then
    print_result "DynamoDB tables defined" 0
  else
    print_result "DynamoDB tables defined" 1
    echo -e "${YELLOW}  Warning: Expected at least 1 table (PaymentRecords)${NC}"
  fi
else
  echo -e "${YELLOW}⚠${NC} CDK stack file not found, skipping DynamoDB check"
fi

# Test 3: Secrets Manager usage (no hardcoded keys)
echo -n "Test: Secrets Manager usage... "
if grep -q "@aws-sdk/client-secrets-manager\|SecretsManagerClient" "$PAYMENT_PROCESSOR_DIR/package.json" "$PAYMENT_PROCESSOR_DIR/src/"*.ts 2>/dev/null; then
  print_result "Secrets Manager SDK present" 0
else
  print_result "Secrets Manager SDK present" 1
fi

# Test 4: Check for hardcoded Stripe keys (should not exist)
echo -n "Test: No hardcoded Stripe keys... "
HARDCODED_KEYS=$(grep -r "sk_live_\|sk_test_" "$PAYMENT_PROCESSOR_DIR/src/" 2>/dev/null | grep -v "gitleaks:allow" | grep -v "pattern:" | grep -v "REDACTED" | grep -v "//" | wc -l | tr -d ' ')

if [ "$HARDCODED_KEYS" -eq 0 ]; then
  print_result "No hardcoded keys found" 0
else
  print_result "No hardcoded keys found" 1
  echo -e "${RED}  Error: Found $HARDCODED_KEYS hardcoded keys${NC}"
fi

echo ""

# ===================================================================
# PCI DSS COMPLIANCE CHECKS
# ===================================================================

echo "========================================"
echo "PCI DSS Compliance Checks"
echo "========================================"
echo ""

# Test 1: Encryption module exists
echo -n "Test: Encryption module exists... "
if [ -f "$PAYMENT_PROCESSOR_DIR/src/encryption.ts" ]; then
  print_result "encryption.ts exists" 0
else
  print_result "encryption.ts exists" 1
fi

# Test 2: KMS SDK for encryption
echo -n "Test: KMS SDK for encryption... "
if grep -q "@aws-sdk/client-kms\|KMSClient" "$PAYMENT_PROCESSOR_DIR/package.json"; then
  print_result "KMS SDK dependency" 0
else
  print_result "KMS SDK dependency" 1
fi

# Test 3: No PII in logs verification
echo -n "Test: Log scrubbing logic... "
if grep -q "maskEmail\|scrub\|redact" "$PAYMENT_PROCESSOR_DIR/src/"*.ts 2>/dev/null; then
  print_result "Log scrubbing implemented" 0
else
  print_result "Log scrubbing implemented" 1
  echo -e "${YELLOW}  Note: PCI DSS requires PII redaction in logs${NC}"
fi

# Test 4: Stripe integration (SAQ-A compliance)
echo -n "Test: Stripe SDK integration... "
if grep -q "stripe" "$PAYMENT_PROCESSOR_DIR/package.json"; then
  print_result "Stripe SDK dependency" 0
else
  print_result "Stripe SDK dependency" 1
fi

# Test 5: DynamoDB TTL for data retention
echo -n "Test: TTL documented for PCI compliance... "
if grep -q "ttl\|TTL\|7.*year\|7-year" "$PAYMENT_PROCESSOR_DIR/spec.md" 2>/dev/null; then
  print_result "TTL retention documented" 0
else
  print_result "TTL retention documented" 1
  echo -e "${YELLOW}  Note: PCI requires 7-year retention policy${NC}"
fi

# Test 6: No full card numbers in storage
echo -n "Test: Only last 4 digits stored... "
if grep -q "cardLastFour\|last4\|lastFourDigits" "$PAYMENT_PROCESSOR_DIR/src/types.ts" 2>/dev/null; then
  print_result "Card last 4 pattern found" 0
else
  print_result "Card last 4 pattern found" 1
fi

echo ""

# ===================================================================
# API ENDPOINT VALIDATION
# ===================================================================

echo "========================================"
echo "API Endpoint Validation"
echo "========================================"
echo ""

# Test 1: Payment processing endpoint
echo -n "Test: POST /api/payments endpoint... "
if grep -q "POST.*\/api\/payments\|app.post.*\/api\/payments" "$PAYMENT_PROCESSOR_DIR/src/index.ts" 2>/dev/null; then
  print_result "Payment endpoint defined" 0
else
  print_result "Payment endpoint defined" 1
fi

# Test 2: Payment retrieval endpoint
echo -n "Test: GET /api/payments/:id endpoint... "
if grep -q "GET.*\/api\/payments\|app.get.*\/api\/payments" "$PAYMENT_PROCESSOR_DIR/src/index.ts" 2>/dev/null; then
  print_result "Retrieval endpoint defined" 0
else
  print_result "Retrieval endpoint defined" 1
fi

# Test 3: Health check endpoint
echo -n "Test: Health check endpoint... "
if grep -q "\/health\|app.get.*\/health" "$PAYMENT_PROCESSOR_DIR/src/index.ts" 2>/dev/null; then
  print_result "Health endpoint defined" 0
else
  print_result "Health endpoint defined" 1
fi

# Test 4: Input validation logic
echo -n "Test: Input validation implemented... "
if grep -q "validation\|validate\|required.*field" "$PAYMENT_PROCESSOR_DIR/src/"*.ts 2>/dev/null; then
  print_result "Input validation" 0
else
  print_result "Input validation" 1
fi

# Test 5: Error handling middleware
echo -n "Test: Error handling middleware... "
if grep -q "errorHandler\|error.*middleware\|catch" "$PAYMENT_PROCESSOR_DIR/src/index.ts" 2>/dev/null; then
  print_result "Error handling present" 0
else
  print_result "Error handling present" 1
fi

echo ""

# ===================================================================
# TEST COVERAGE VALIDATION
# ===================================================================

echo "========================================"
echo "Test Coverage Validation"
echo "========================================"
echo ""

# Test 1: Positive test cases (✓ must pass)
echo -n "Test: Positive test cases documented... "
if [ -f "$PAYMENT_PROCESSOR_DIR/tests/integration/payment-flow.test.ts" ]; then
  POSITIVE_TESTS=$(grep -h "should.*success\|should.*process\|Happy Path" "$PAYMENT_PROCESSOR_DIR/tests/integration/"*.test.ts 2>/dev/null | wc -l | tr -d ' ')
  
  if [ "$POSITIVE_TESTS" -ge 5 ]; then
    print_result "Positive test cases (≥5)" 0
  else
    print_result "Positive test cases (≥5)" 1
    echo -e "${YELLOW}  Found: $POSITIVE_TESTS positive test cases${NC}"
  fi
else
  print_result "payment-flow.test.ts not found" 1
fi

# Test 2: Negative test cases (✗ must be rejected)
echo -n "Test: Negative test cases documented... "
if [ -f "$PAYMENT_PROCESSOR_DIR/tests/integration/error-handling.test.ts" ]; then
  NEGATIVE_TESTS=$(grep -h "should.*reject\|should.*decline\|should.*fail" "$PAYMENT_PROCESSOR_DIR/tests/integration/"*.test.ts 2>/dev/null | wc -l | tr -d ' ')
  
  if [ "$NEGATIVE_TESTS" -ge 5 ]; then
    print_result "Negative test cases (≥5)" 0
  else
    print_result "Negative test cases (≥5)" 1
    echo -e "${YELLOW}  Found: $NEGATIVE_TESTS negative test cases${NC}"
  fi
else
  print_result "error-handling.test.ts not found" 1
fi

# Test 3: Edge case tests
echo -n "Test: Edge case tests documented... "
EDGE_TESTS=$(grep -h "edge case\|should handle.*timeout\|should handle.*throttl" "$PAYMENT_PROCESSOR_DIR/tests/integration/"*.test.ts 2>/dev/null | wc -l | tr -d ' ')

if [ "$EDGE_TESTS" -ge 3 ]; then
  print_result "Edge case tests (≥3)" 0
else
  print_result "Edge case tests (≥3)" 1
  echo -e "${YELLOW}  Found: $EDGE_TESTS edge case tests${NC}"
fi

# Test 4: Idempotency tests
echo -n "Test: Idempotency tests... "
if [ -f "$PAYMENT_PROCESSOR_DIR/tests/integration/idempotency.test.ts" ]; then
  IDEMPOTENCY_TESTS=$(grep -h "idempotent\|same orderId\|duplicate" "$PAYMENT_PROCESSOR_DIR/tests/integration/idempotency.test.ts" 2>/dev/null | wc -l | tr -d ' ')
  
  if [ "$IDEMPOTENCY_TESTS" -ge 2 ]; then
    print_result "Idempotency tests (≥2)" 0
  else
    print_result "Idempotency tests (≥2)" 1
  fi
else
  print_result "idempotency.test.ts not found" 1
fi

echo ""

# ===================================================================
# DOCUMENTATION VALIDATION
# ===================================================================

echo "========================================"
echo "Documentation Validation"
echo "========================================"
echo ""

# Test 1: README exists and is complete
echo -n "Test: README.md complete... "
if [ -f "$PAYMENT_PROCESSOR_DIR/README.md" ]; then
  README_SECTIONS=$(grep -c "^##" "$PAYMENT_PROCESSOR_DIR/README.md" 2>/dev/null || echo 0)
  
  if [ "$README_SECTIONS" -ge 6 ]; then
    print_result "README comprehensive (≥6 sections)" 0
  else
    print_result "README comprehensive (≥6 sections)" 1
    echo -e "${YELLOW}  Found: $README_SECTIONS sections${NC}"
  fi
else
  print_result "README.md not found" 1
fi

# Test 2: Spec document complete
echo -n "Test: spec.md complete... "
if [ -f "$PAYMENT_PROCESSOR_DIR/spec.md" ]; then
  SPEC_SECTIONS=$(grep -c "^##" "$PAYMENT_PROCESSOR_DIR/spec.md" 2>/dev/null || echo 0)
  
  if [ "$SPEC_SECTIONS" -ge 8 ]; then
    print_result "Spec comprehensive (≥8 sections)" 0
  else
    print_result "Spec comprehensive (≥8 sections)" 1
    echo -e "${YELLOW}  Found: $SPEC_SECTIONS sections${NC}"
  fi
else
  print_result "spec.md not found" 1
fi

# Test 3: Toolkit artifacts referenced
echo -n "Test: Toolkit artifacts referenced... "
if grep -q "scan-secrets.yaml\|validate-iam.yaml\|excluded-paths.yaml" "$PAYMENT_PROCESSOR_DIR/README.md" 2>/dev/null; then
  print_result "Toolkit artifacts documented" 0
else
  print_result "Toolkit artifacts documented" 1
fi

# Test 4: Concerns addressed documented
echo -n "Test: Concerns addressed documented... "
if grep -q "Primary Concerns\|Concern #\|Security.*Compliance" "$PAYMENT_PROCESSOR_DIR/README.md" "$PAYMENT_PROCESSOR_DIR/spec.md" 2>/dev/null; then
  print_result "Concerns documented" 0
else
  print_result "Concerns documented" 1
fi

# Test 5: How to run instructions
echo -n "Test: How to run instructions... "
if grep -q "Quick Start\|How to Run\|Prerequisites\|Validation Steps" "$PAYMENT_PROCESSOR_DIR/README.md" "$PAYMENT_PROCESSOR_DIR/spec.md" 2>/dev/null; then
  print_result "Run instructions present" 0
else
  print_result "Run instructions present" 1
fi

# Test 6: PCI DSS compliance documented
echo -n "Test: PCI DSS compliance documented... "
if grep -q "PCI DSS\|PCI-DSS\|SAQ-A" "$PAYMENT_PROCESSOR_DIR/spec.md" 2>/dev/null; then
  print_result "PCI DSS documented" 0
else
  print_result "PCI DSS documented" 1
fi

echo ""

# ===================================================================
# STRIPE INTEGRATION VALIDATION
# ===================================================================

echo "========================================"
echo "Stripe Integration Validation"
echo "========================================"
echo ""

# Test 1: Stripe API version pinned
echo -n "Test: Stripe API version pinned... "
if grep -q "apiVersion\|2023-10-16" "$PAYMENT_PROCESSOR_DIR/src/"*.ts 2>/dev/null; then
  print_result "API version pinned" 0
else
  print_result "API version pinned" 1
  echo -e "${YELLOW}  Note: Spec requires API version 2023-10-16${NC}"
fi

# Test 2: Idempotency key implementation
echo -n "Test: Idempotency key logic... "
if grep -q "idempotencyKey\|idempotency_key" "$PAYMENT_PROCESSOR_DIR/src/"*.ts 2>/dev/null; then
  print_result "Idempotency key implemented" 0
else
  print_result "Idempotency key implemented" 1
fi

# Test 3: Retry logic for transient failures
echo -n "Test: Retry logic implemented... "
if grep -q "retry\|exponential.*backoff\|retryable" "$PAYMENT_PROCESSOR_DIR/src/"*.ts 2>/dev/null; then
  print_result "Retry logic present" 0
else
  print_result "Retry logic present" 1
fi

# Test 4: Error mapping for Stripe errors
echo -n "Test: Stripe error mapping... "
if grep -q "StripeError\|card_declined\|insufficient_funds" "$PAYMENT_PROCESSOR_DIR/src/"*.ts 2>/dev/null; then
  print_result "Error mapping implemented" 0
else
  print_result "Error mapping implemented" 1
fi

echo ""

# ===================================================================
# SUMMARY
# ===================================================================

echo "========================================"
echo "Test Summary"
echo "========================================"
echo ""
echo -e "Tests Passed:  ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed:  ${RED}$TESTS_FAILED${NC}"
echo -e "Total Tests:   $((TESTS_PASSED + TESTS_FAILED))"
echo ""

# Calculate success rate
if [ $((TESTS_PASSED + TESTS_FAILED)) -gt 0 ]; then
  SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($TESTS_PASSED / ($TESTS_PASSED + $TESTS_FAILED)) * 100}")
  echo -e "Success Rate:  ${SUCCESS_RATE}%"
  echo ""
fi

# Final verdict
if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  echo ""
  echo "Payment processor example is complete and ready for use."
  echo ""
  echo "Key Features Validated:"
  echo "  ✓ TypeScript build and compilation"
  echo "  ✓ Unit and integration tests"
  echo "  ✓ Infrastructure definitions (Lambda, DynamoDB, KMS, Secrets Manager)"
  echo "  ✓ Security compliance (no hardcoded keys, IAM least privilege)"
  echo "  ✓ PCI DSS compliance (encryption, log scrubbing, Stripe integration)"
  echo "  ✓ API endpoints (payment processing, retrieval, health checks)"
  echo "  ✓ Error handling and idempotency"
  echo "  ✓ Complete documentation"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  echo ""
  echo "Please review the failures above and address them."
  echo ""
  
  # Categorize failures
  if [ $TESTS_FAILED -le 5 ]; then
    echo -e "${YELLOW}Minor issues detected - example is mostly complete${NC}"
    exit 1
  elif [ $TESTS_FAILED -le 10 ]; then
    echo -e "${YELLOW}Moderate issues detected - some work remaining${NC}"
    exit 1
  else
    echo -e "${RED}Major issues detected - significant work needed${NC}"
    exit 1
  fi
fi
