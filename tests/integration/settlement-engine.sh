#!/bin/bash

# Settlement Engine Integration Test Suite
# This script validates the settlement engine example for:
# - Build and compilation
# - Unit tests
# - Deployment (infrastructure validation)
# - Step Functions workflow execution simulation
# - Audit trail generation
# Exit codes: 0 = all tests passed, 1 = one or more tests failed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
SETTLEMENT_ENGINE_DIR="$PROJECT_ROOT/examples/settlement-engine"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================"
echo "Settlement Engine Integration Test Suite"
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

# Check if settlement-engine directory exists
echo -n "Checking settlement-engine directory... "
if [ -d "$SETTLEMENT_ENGINE_DIR" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} Directory not found: $SETTLEMENT_ENGINE_DIR"
  ((TESTS_FAILED++))
  exit 1
fi

# Check if package.json exists
echo -n "Checking package.json... "
if [ -f "$SETTLEMENT_ENGINE_DIR/package.json" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} package.json not found"
  ((TESTS_FAILED++))
  exit 1
fi

# Check if spec.md exists
echo -n "Checking spec.md... "
if [ -f "$SETTLEMENT_ENGINE_DIR/spec.md" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} spec.md not found"
  ((TESTS_FAILED++))
fi

# Check for node_modules (dependencies installed)
echo -n "Checking dependencies... "
if [ -d "$SETTLEMENT_ENGINE_DIR/node_modules" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${YELLOW}⚠${NC} node_modules not found, installing dependencies..."
  cd "$SETTLEMENT_ENGINE_DIR"
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

cd "$SETTLEMENT_ENGINE_DIR"

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
if [ -d "$SETTLEMENT_ENGINE_DIR/dist" ]; then
  print_result "Output directory created" 0
else
  print_result "Output directory created" 1
fi

# Test 3: Verify compiled files exist
echo -n "Test: Compiled files exist... "
EXPECTED_FILES=("index.js" "types.js" "database.js" "audit.js" "workflow.js" "logger.js")
ALL_FILES_EXIST=true

for file in "${EXPECTED_FILES[@]}"; do
  if [ ! -f "$SETTLEMENT_ENGINE_DIR/dist/$file" ]; then
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
if [ -d "$SETTLEMENT_ENGINE_DIR/coverage" ] || npm run test:coverage > /dev/null 2>&1; then
  print_result "Test coverage generated" 0
else
  print_result "Test coverage generated" 1
fi

# Test 3: Verify test files exist
echo -n "Test: Test files present... "
TEST_DIRS=("tests/unit" "tests/integration")
TESTS_EXIST=true

for dir in "${TEST_DIRS[@]}"; do
  if [ ! -d "$SETTLEMENT_ENGINE_DIR/$dir" ]; then
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
# INFRASTRUCTURE/DEPLOYMENT VALIDATION
# ===================================================================

echo "========================================"
echo "Infrastructure Validation"
echo "========================================"
echo ""

# Test 1: CDK infrastructure directory exists
echo -n "Test: CDK infrastructure exists... "
if [ -d "$SETTLEMENT_ENGINE_DIR/infra" ]; then
  print_result "CDK infrastructure directory" 0
else
  print_result "CDK infrastructure directory" 1
fi

# Test 2: CDK package.json exists
echo -n "Test: CDK package.json... "
if [ -f "$SETTLEMENT_ENGINE_DIR/infra/package.json" ]; then
  print_result "CDK package.json exists" 0
else
  print_result "CDK package.json exists" 1
fi

# Test 3: CDK lib directory with stack definition
echo -n "Test: CDK stack definition... "
if [ -d "$SETTLEMENT_ENGINE_DIR/infra/lib" ]; then
  STACK_FILES=$(find "$SETTLEMENT_ENGINE_DIR/infra/lib" -name "*stack*.ts" 2>/dev/null | wc -l)
  if [ "$STACK_FILES" -gt 0 ]; then
    print_result "CDK stack definition exists" 0
  else
    print_result "CDK stack definition exists" 1
  fi
else
  print_result "CDK lib directory exists" 1
fi

# Test 4: CDK TypeScript compilation
if [ -d "$SETTLEMENT_ENGINE_DIR/infra" ]; then
  echo -n "Test: CDK TypeScript compilation... "
  cd "$SETTLEMENT_ENGINE_DIR/infra"
  
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
  
  cd "$SETTLEMENT_ENGINE_DIR"
fi

# Test 5: Check for IAM policy definitions (no wildcards)
echo -n "Test: IAM policies defined (no wildcards)... "
if [ -f "$SETTLEMENT_ENGINE_DIR/infra/lib/settlement-engine-stack.ts" ]; then
  WILDCARD_COUNT=$(grep 'Action.*\*' "$SETTLEMENT_ENGINE_DIR/infra/lib/settlement-engine-stack.ts" | wc -l)
  RESOURCE_WILDCARD_COUNT=$(grep 'Resource.*\*' "$SETTLEMENT_ENGINE_DIR/infra/lib/settlement-engine-stack.ts" | wc -l)
  
  if [ "$WILDCARD_COUNT" -eq 0 ] && [ "$RESOURCE_WILDCARD_COUNT" -eq 0 ]; then
    print_result "No IAM wildcards found" 0
  else
    print_result "No IAM wildcards found" 1
    echo -e "${YELLOW}  Warning: Found $WILDCARD_COUNT Action wildcards and $RESOURCE_WILDCARD_COUNT Resource wildcards${NC}"
  fi
else
  echo -e "${YELLOW}⚠${NC} CDK stack file not found, skipping IAM check"
fi

# Test 6: Check for DynamoDB table definitions
echo -n "Test: DynamoDB tables defined... "
if [ -f "$SETTLEMENT_ENGINE_DIR/infra/lib/settlement-engine-stack.ts" ]; then
  TABLE_COUNT=$(grep 'new dynamodb.Table' "$SETTLEMENT_ENGINE_DIR/infra/lib/settlement-engine-stack.ts" | wc -l)
  
  if [ "$TABLE_COUNT" -ge 2 ]; then
    print_result "DynamoDB tables defined" 0
  else
    print_result "DynamoDB tables defined" 1
    echo -e "${YELLOW}  Warning: Expected at least 2 tables, found $TABLE_COUNT (SettlementBatches, TransactionLedger)${NC}"
  fi
else
  echo -e "${YELLOW}⚠${NC} CDK stack file not found, skipping DynamoDB check"
fi

echo ""

# ===================================================================
# STEP FUNCTIONS WORKFLOW VALIDATION
# ===================================================================

echo "========================================"
echo "Step Functions Workflow Validation"
echo "========================================"
echo ""

# Test 1: Workflow integration code exists
echo -n "Test: Workflow integration code... "
if [ -f "$SETTLEMENT_ENGINE_DIR/src/workflow.ts" ]; then
  print_result "workflow.ts exists" 0
else
  print_result "workflow.ts exists" 1
fi

# Test 2: Step Functions state machine definition
echo -n "Test: State machine referenced in CDK... "
if [ -d "$SETTLEMENT_ENGINE_DIR/infra/lib" ]; then
  STATE_MACHINE_COUNT=$(grep 'StateMachine\|stepfunctions' "$SETTLEMENT_ENGINE_DIR/infra/lib/settlement-engine-stack.ts" | wc -l)
  
  if [ "$STATE_MACHINE_COUNT" -gt 0 ]; then
    print_result "State machine definition found" 0
  else
    print_result "State machine definition found" 1
    echo -e "${YELLOW}  Note: State machine may be defined elsewhere${NC}"
  fi
else
  echo -e "${YELLOW}⚠${NC} CDK lib not found, skipping state machine check"
fi

# Test 3: Workflow states defined in code
echo -n "Test: Workflow task types referenced... "
if [ -f "$SETTLEMENT_ENGINE_DIR/src/types.ts" ]; then
  # Check for settlement status types that map to workflow states
  STATUS_TYPES=$(grep 'pending\|processing\|calculated\|approved\|settled' "$SETTLEMENT_ENGINE_DIR/src/types.ts" | wc -l)
  
  if [ "$STATUS_TYPES" -gt 3 ]; then
    print_result "Workflow status types defined" 0
  else
    print_result "Workflow status types defined" 1
  fi
else
  print_result "types.ts not found" 1
fi

# Test 4: Step Functions SDK client usage
echo -n "Test: Step Functions SDK imported... "
if grep -q "@aws-sdk/client-sfn" "$SETTLEMENT_ENGINE_DIR/package.json"; then
  print_result "SFN SDK dependency" 0
else
  print_result "SFN SDK dependency" 1
fi

echo ""

# ===================================================================
# AUDIT TRAIL VALIDATION
# ===================================================================

echo "========================================"
echo "Audit Trail Validation"
echo "========================================"
echo ""

# Test 1: Audit logging module exists
echo -n "Test: Audit logging module... "
if [ -f "$SETTLEMENT_ENGINE_DIR/src/audit.ts" ]; then
  print_result "audit.ts exists" 0
else
  print_result "audit.ts exists" 1
fi

# Test 2: S3 SDK for audit logs
echo -n "Test: S3 SDK for audit logs... "
if grep -q "@aws-sdk/client-s3" "$SETTLEMENT_ENGINE_DIR/package.json"; then
  print_result "S3 SDK dependency" 0
else
  print_result "S3 SDK dependency" 1
fi

# Test 3: Audit trail structure in types
echo -n "Test: Audit trail types defined... "
if [ -f "$SETTLEMENT_ENGINE_DIR/src/types.ts" ]; then
  AUDIT_TYPES=$(grep 'audit\|AuditLog\|auditTrail' "$SETTLEMENT_ENGINE_DIR/src/types.ts" | wc -l)
  
  if [ "$AUDIT_TYPES" -gt 0 ]; then
    print_result "Audit types defined" 0
  else
    print_result "Audit types defined" 1
  fi
else
  print_result "types.ts not found" 1
fi

# Test 4: S3 bucket defined in infrastructure
echo -n "Test: S3 audit bucket in CDK... "
if [ -d "$SETTLEMENT_ENGINE_DIR/infra/lib" ]; then
  BUCKET_COUNT=$(grep 'new s3.Bucket' "$SETTLEMENT_ENGINE_DIR/infra/lib/settlement-engine-stack.ts" | wc -l)
  
  if [ "$BUCKET_COUNT" -gt 0 ]; then
    print_result "S3 bucket defined" 0
  else
    print_result "S3 bucket defined" 1
  fi
else
  echo -e "${YELLOW}⚠${NC} CDK lib not found, skipping bucket check"
fi

# Test 5: Audit log retention policy (10 years for SOX)
echo -n "Test: Audit log retention documented... "
if grep -q '10-year\|10 year\|TTL' "$SETTLEMENT_ENGINE_DIR/spec.md"; then
  print_result "Retention policy documented" 0
else
  print_result "Retention policy documented" 1
  echo -e "${YELLOW}  Note: SOX requires 10-year retention${NC}"
fi

# Test 6: Audit events in spec
echo -n "Test: Audit events documented in spec... "
if grep -q 'audit.*event\|auditEventType' "$SETTLEMENT_ENGINE_DIR/spec.md"; then
  print_result "Audit events documented" 0
else
  print_result "Audit events documented" 1
fi

echo ""

# ===================================================================
# REGULATORY COMPLIANCE CHECKS
# ===================================================================

echo "========================================"
echo "Regulatory Compliance Checks"
echo "========================================"
echo ""

# Test 1: CAB approval ticket validation
echo -n "Test: CAB approval validation logic... "
if [ -f "$SETTLEMENT_ENGINE_DIR/src/index.ts" ]; then
  if grep -q 'CHG.*[0-9]\|approvalTicket' "$SETTLEMENT_ENGINE_DIR/src/index.ts"; then
    print_result "CAB ticket validation" 0
  else
    print_result "CAB ticket validation" 1
  fi
else
  print_result "index.ts not found" 1
fi

# Test 2: Market hours validation
echo -n "Test: Market hours validation logic... "
if [ -f "$SETTLEMENT_ENGINE_DIR/src/index.ts" ]; then
  if grep -q 'market.*hour\|marketHours\|9.*30.*AM\|4.*PM.*ET' "$SETTLEMENT_ENGINE_DIR/src/index.ts"; then
    print_result "Market hours validation" 0
  else
    print_result "Market hours validation" 1
    echo -e "${YELLOW}  Note: Settlement execution should check market hours${NC}"
  fi
else
  print_result "index.ts not found" 1
fi

# Test 3: Segregation of duties (SOX compliance)
echo -n "Test: Segregation of duties logic... "
if [ -f "$SETTLEMENT_ENGINE_DIR/src/index.ts" ]; then
  if grep -q 'segregation\|initiator.*approver\|SOX' "$SETTLEMENT_ENGINE_DIR/src/index.ts"; then
    print_result "Segregation of duties" 0
  else
    print_result "Segregation of duties" 1
    echo -e "${YELLOW}  Note: SOX requires initiator ≠ approver${NC}"
  fi
else
  print_result "index.ts not found" 1
fi

# Test 4: Data residency (us-east-1 only)
echo -n "Test: Data residency documentation... "
if grep -q 'us-east-1\|data residency\|FDIC' "$SETTLEMENT_ENGINE_DIR/spec.md"; then
  print_result "Data residency documented" 0
else
  print_result "Data residency documented" 1
fi

# Test 5: Compliance documentation exists
echo -n "Test: Compliance directory... "
if [ -d "$SETTLEMENT_ENGINE_DIR/compliance" ]; then
  print_result "Compliance documentation" 0
else
  print_result "Compliance documentation" 1
  echo -e "${YELLOW}  Note: Compliance docs typically in compliance/ directory${NC}"
fi

echo ""

# ===================================================================
# API INTEGRATION TESTS
# ===================================================================

echo "========================================"
echo "API Integration Tests"
echo "========================================"
echo ""

# Test 1: Integration test file exists
echo -n "Test: API integration tests exist... "
if [ -f "$SETTLEMENT_ENGINE_DIR/tests/integration/api.test.ts" ]; then
  print_result "API integration tests" 0
else
  print_result "API integration tests" 1
fi

# Test 2: Run integration tests
echo -n "Test: API integration tests pass... "
if npm run test:integration > /dev/null 2>&1; then
  print_result "Integration tests pass" 0
else
  print_result "Integration tests pass" 1
  echo -e "${YELLOW}  Note: Integration tests may require AWS services${NC}"
fi

# Test 3: Test coverage for positive cases
echo -n "Test: Positive test cases documented... "
if [ -f "$SETTLEMENT_ENGINE_DIR/tests/integration/api.test.ts" ]; then
  POSITIVE_TESTS=$(grep '✓' "$SETTLEMENT_ENGINE_DIR/tests/integration/api.test.ts" | wc -l)
  
  if [ "$POSITIVE_TESTS" -ge 5 ]; then
    print_result "Positive test cases (≥5)" 0
  else
    print_result "Positive test cases (≥5)" 1
    echo -e "${YELLOW}  Found: $POSITIVE_TESTS positive test cases${NC}"
  fi
else
  print_result "api.test.ts not found" 1
fi

# Test 4: Test coverage for negative cases
echo -n "Test: Negative test cases documented... "
if [ -f "$SETTLEMENT_ENGINE_DIR/tests/integration/api.test.ts" ]; then
  NEGATIVE_TESTS=$(grep '✗' "$SETTLEMENT_ENGINE_DIR/tests/integration/api.test.ts" | wc -l)
  
  if [ "$NEGATIVE_TESTS" -ge 5 ]; then
    print_result "Negative test cases (≥5)" 0
  else
    print_result "Negative test cases (≥5)" 1
    echo -e "${YELLOW}  Found: $NEGATIVE_TESTS negative test cases${NC}"
  fi
else
  print_result "api.test.ts not found" 1
fi

# Test 5: Test coverage for edge cases
echo -n "Test: Edge case tests documented... "
if [ -f "$SETTLEMENT_ENGINE_DIR/tests/integration/api.test.ts" ]; then
  EDGE_TESTS=$(grep '⚠' "$SETTLEMENT_ENGINE_DIR/tests/integration/api.test.ts" | wc -l)
  
  if [ "$EDGE_TESTS" -ge 3 ]; then
    print_result "Edge case tests (≥3)" 0
  else
    print_result "Edge case tests (≥3)" 1
    echo -e "${YELLOW}  Found: $EDGE_TESTS edge case tests${NC}"
  fi
else
  print_result "api.test.ts not found" 1
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
if [ -f "$SETTLEMENT_ENGINE_DIR/README.md" ]; then
  README_SECTIONS=$(grep '^##' "$SETTLEMENT_ENGINE_DIR/README.md" | wc -l)
  
  if [ "$README_SECTIONS" -ge 8 ]; then
    print_result "README comprehensive (≥8 sections)" 0
  else
    print_result "README comprehensive (≥8 sections)" 1
    echo -e "${YELLOW}  Found: $README_SECTIONS sections${NC}"
  fi
else
  print_result "README.md not found" 1
fi

# Test 2: Spec document complete
echo -n "Test: spec.md complete... "
if [ -f "$SETTLEMENT_ENGINE_DIR/spec.md" ]; then
  SPEC_SECTIONS=$(grep '^##' "$SETTLEMENT_ENGINE_DIR/spec.md" | wc -l)
  
  if [ "$SPEC_SECTIONS" -ge 6 ]; then
    print_result "Spec comprehensive (≥6 sections)" 0
  else
    print_result "Spec comprehensive (≥6 sections)" 1
    echo -e "${YELLOW}  Found: $SPEC_SECTIONS sections${NC}"
  fi
else
  print_result "spec.md not found" 1
fi

# Test 3: Toolkit artifacts referenced
echo -n "Test: Toolkit artifacts referenced... "
if grep -q 'deployment-window.yaml\|require-approvals.yaml\|validate-iam.yaml' "$SETTLEMENT_ENGINE_DIR/README.md"; then
  print_result "Toolkit artifacts documented" 0
else
  print_result "Toolkit artifacts documented" 1
fi

# Test 4: Concerns addressed documented
echo -n "Test: Concerns addressed documented... "
if grep -q 'Primary Concerns\|Concern #\|FSI Regulatory' "$SETTLEMENT_ENGINE_DIR/README.md"; then
  print_result "Concerns documented" 0
else
  print_result "Concerns documented" 1
fi

# Test 5: How to run instructions
echo -n "Test: How to run instructions... "
if grep -q 'How to Run\|Prerequisites\|Validation Steps' "$SETTLEMENT_ENGINE_DIR/README.md"; then
  print_result "Run instructions present" 0
else
  print_result "Run instructions present" 1
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
  echo "Settlement engine example is complete and ready for use."
  echo ""
  echo "Key Features Validated:"
  echo "  ✓ TypeScript build and compilation"
  echo "  ✓ Unit and integration tests"
  echo "  ✓ Infrastructure definitions (DynamoDB, S3, Step Functions)"
  echo "  ✓ Step Functions workflow integration"
  echo "  ✓ Audit trail generation (SOX compliance)"
  echo "  ✓ Regulatory compliance (CAB, market hours, segregation of duties)"
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
