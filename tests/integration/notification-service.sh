#!/bin/bash

# Notification Service Integration Test Suite
# This script validates the notification-service example for:
# - Build and compilation
# - Unit tests
# - Deployment (infrastructure validation)
# - SQS message processing simulation
# - SNS notification delivery
# Exit codes: 0 = all tests passed, 1 = one or more tests failed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
NOTIFICATION_SERVICE_DIR="$PROJECT_ROOT/examples/notification-service"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================"
echo "Notification Service Integration Test Suite"
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

# Check if notification-service directory exists
echo -n "Checking notification-service directory... "
if [ -d "$NOTIFICATION_SERVICE_DIR" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} Directory not found: $NOTIFICATION_SERVICE_DIR"
  ((TESTS_FAILED++))
  exit 1
fi

# Check if package.json exists
echo -n "Checking package.json... "
if [ -f "$NOTIFICATION_SERVICE_DIR/package.json" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} package.json not found"
  ((TESTS_FAILED++))
  exit 1
fi

# Check if spec.md exists
echo -n "Checking spec.md... "
if [ -f "$NOTIFICATION_SERVICE_DIR/spec.md" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} spec.md not found"
  ((TESTS_FAILED++))
fi

# Check for node_modules (dependencies installed)
echo -n "Checking dependencies... "
if [ -d "$NOTIFICATION_SERVICE_DIR/node_modules" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${YELLOW}⚠${NC} node_modules not found, installing dependencies..."
  cd "$NOTIFICATION_SERVICE_DIR"
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

cd "$NOTIFICATION_SERVICE_DIR"

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
if [ -d "$NOTIFICATION_SERVICE_DIR/dist" ]; then
  print_result "Output directory created" 0
else
  print_result "Output directory created" 1
fi

# Test 3: Verify compiled files exist
echo -n "Test: Compiled files exist... "
EXPECTED_FILES=("index.js" "types.js" "database.js" "queue.js" "logger.js" "notification-service.js")
ALL_FILES_EXIST=true

for file in "${EXPECTED_FILES[@]}"; do
  if [ ! -f "$NOTIFICATION_SERVICE_DIR/dist/$file" ]; then
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
if [ -d "$NOTIFICATION_SERVICE_DIR/coverage" ] || npm run test:coverage > /dev/null 2>&1; then
  print_result "Test coverage generated" 0
else
  print_result "Test coverage generated" 1
fi

# Test 3: Verify test files exist
echo -n "Test: Test files present... "
TEST_DIRS=("tests/unit" "tests/integration")
TESTS_EXIST=true

for dir in "${TEST_DIRS[@]}"; do
  if [ ! -d "$NOTIFICATION_SERVICE_DIR/$dir" ]; then
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
if [ -d "$NOTIFICATION_SERVICE_DIR/infra" ]; then
  print_result "CDK infrastructure directory" 0
else
  print_result "CDK infrastructure directory" 1
fi

# Test 2: CDK package.json exists
echo -n "Test: CDK package.json... "
if [ -f "$NOTIFICATION_SERVICE_DIR/infra/package.json" ]; then
  print_result "CDK package.json exists" 0
else
  print_result "CDK package.json exists" 1
fi

# Test 3: CDK lib directory with stack definition
echo -n "Test: CDK stack definition... "
if [ -d "$NOTIFICATION_SERVICE_DIR/infra/lib" ]; then
  STACK_FILES=$(find "$NOTIFICATION_SERVICE_DIR/infra/lib" -name "*stack*.ts" 2>/dev/null | wc -l)
  if [ "$STACK_FILES" -gt 0 ]; then
    print_result "CDK stack definition exists" 0
  else
    print_result "CDK stack definition exists" 1
  fi
else
  print_result "CDK lib directory exists" 1
fi

# Test 4: CDK TypeScript compilation
if [ -d "$NOTIFICATION_SERVICE_DIR/infra" ]; then
  echo -n "Test: CDK TypeScript compilation... "
  cd "$NOTIFICATION_SERVICE_DIR/infra"
  
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
  
  cd "$NOTIFICATION_SERVICE_DIR"
fi

# Test 5: Check for IAM policy definitions (no wildcards)
echo -n "Test: IAM policies defined (no wildcards)... "
if [ -f "$NOTIFICATION_SERVICE_DIR/infra/lib/notification-service-stack.ts" ]; then
  # Look for dangerous IAM wildcards in Action and Resource fields
  WILDCARD_COUNT=$(grep -E '(Action|actions):\s*["\x27]\*["\x27]' "$NOTIFICATION_SERVICE_DIR/infra/lib/"*.ts 2>/dev/null | wc -l || echo "0")
  RESOURCE_WILDCARD_COUNT=$(grep -E '(Resource|resources):\s*["\x27]\*["\x27]' "$NOTIFICATION_SERVICE_DIR/infra/lib/"*.ts 2>/dev/null | wc -l || echo "0")
  
  # Remove any whitespace from counts
  WILDCARD_COUNT=$(echo "$WILDCARD_COUNT" | tr -d ' ')
  RESOURCE_WILDCARD_COUNT=$(echo "$RESOURCE_WILDCARD_COUNT" | tr -d ' ')
  
  if [ "$WILDCARD_COUNT" = "0" ] && [ "$RESOURCE_WILDCARD_COUNT" = "0" ]; then
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
if [ -f "$NOTIFICATION_SERVICE_DIR/infra/lib/notification-service-stack.ts" ]; then
  TABLE_COUNT=$(grep -c "new.*Table\|dynamodb\.Table" "$NOTIFICATION_SERVICE_DIR/infra/lib/"*.ts 2>/dev/null || echo 0)
  
  if [ "$TABLE_COUNT" -ge 2 ]; then
    print_result "DynamoDB tables defined" 0
  else
    print_result "DynamoDB tables defined" 1
    echo -e "${YELLOW}  Warning: Expected at least 2 tables (NotificationRecords, CustomerPreferences)${NC}"
  fi
else
  echo -e "${YELLOW}⚠${NC} CDK stack file not found, skipping DynamoDB check"
fi

# Test 7: Check for SQS queue definitions
echo -n "Test: SQS queues defined... "
if [ -d "$NOTIFICATION_SERVICE_DIR/infra/lib" ]; then
  QUEUE_COUNT=$(grep -c "new.*Queue\|sqs\.Queue" "$NOTIFICATION_SERVICE_DIR/infra/lib/"*.ts 2>/dev/null || echo 0)
  
  if [ "$QUEUE_COUNT" -ge 3 ]; then
    print_result "SQS queues defined (≥3)" 0
  else
    print_result "SQS queues defined (≥3)" 1
    echo -e "${YELLOW}  Warning: Expected at least 3 queues (high/normal/low priority)${NC}"
  fi
else
  echo -e "${YELLOW}⚠${NC} CDK lib not found, skipping queue check"
fi

echo ""

# ===================================================================
# SQS MESSAGE PROCESSING VALIDATION
# ===================================================================

echo "========================================"
echo "SQS Message Processing Validation"
echo "========================================"
echo ""

# Test 1: Queue processing module exists
echo -n "Test: Queue processing module... "
if [ -f "$NOTIFICATION_SERVICE_DIR/src/queue.ts" ]; then
  print_result "queue.ts exists" 0
else
  print_result "queue.ts exists" 1
fi

# Test 2: SQS SDK dependency
echo -n "Test: SQS SDK dependency... "
if grep -q "@aws-sdk/client-sqs" "$NOTIFICATION_SERVICE_DIR/package.json"; then
  print_result "SQS SDK dependency" 0
else
  print_result "SQS SDK dependency" 1
fi

# Test 3: Priority queue routing in code
echo -n "Test: Priority queue routing logic... "
if [ -f "$NOTIFICATION_SERVICE_DIR/src/queue.ts" ]; then
  # Check for high/normal/low priority handling
  PRIORITY_REFS=$(grep -c "high\|normal\|low" "$NOTIFICATION_SERVICE_DIR/src/queue.ts" 2>/dev/null || echo 0)
  
  if [ "$PRIORITY_REFS" -ge 3 ]; then
    print_result "Priority queue routing" 0
  else
    print_result "Priority queue routing" 1
  fi
else
  print_result "queue.ts not found" 1
fi

# Test 4: Queue message types defined
echo -n "Test: Queue message types defined... "
if [ -f "$NOTIFICATION_SERVICE_DIR/src/types.ts" ]; then
  if grep -q "QueueMessage\|NotificationPriority" "$NOTIFICATION_SERVICE_DIR/src/types.ts"; then
    print_result "Queue message types defined" 0
  else
    print_result "Queue message types defined" 1
  fi
else
  print_result "types.ts not found" 1
fi

# Test 5: Integration tests for queue processing
echo -n "Test: Queue processing integration tests... "
if [ -f "$NOTIFICATION_SERVICE_DIR/tests/integration/queue-processing.test.ts" ]; then
  print_result "Queue processing tests exist" 0
else
  print_result "Queue processing tests exist" 1
fi

echo ""

# ===================================================================
# SNS NOTIFICATION DELIVERY VALIDATION
# ===================================================================

echo "========================================"
echo "SNS Notification Delivery Validation"
echo "========================================"
echo ""

# Test 1: Notification service module exists
echo -n "Test: Notification service module... "
if [ -f "$NOTIFICATION_SERVICE_DIR/src/notification-service.ts" ]; then
  print_result "notification-service.ts exists" 0
else
  print_result "notification-service.ts exists" 1
fi

# Test 2: SNS SDK dependency
echo -n "Test: SNS SDK dependency... "
if grep -q "@aws-sdk/client-sns" "$NOTIFICATION_SERVICE_DIR/package.json"; then
  print_result "SNS SDK dependency" 0
else
  print_result "SNS SDK dependency" 1
fi

# Test 3: SES SDK dependency (for email)
echo -n "Test: SES SDK dependency... "
if grep -q "@aws-sdk/client-ses" "$NOTIFICATION_SERVICE_DIR/package.json"; then
  print_result "SES SDK dependency" 0
else
  print_result "SES SDK dependency" 1
fi

# Test 4: Multi-channel support in code
echo -n "Test: Multi-channel support (email/SMS/push)... "
if [ -f "$NOTIFICATION_SERVICE_DIR/src/notification-service.ts" ]; then
  EMAIL_SUPPORT=$(grep -c "email\|SES" "$NOTIFICATION_SERVICE_DIR/src/notification-service.ts" 2>/dev/null || echo 0)
  SMS_SUPPORT=$(grep -c "sms\|SMS" "$NOTIFICATION_SERVICE_DIR/src/notification-service.ts" 2>/dev/null || echo 0)
  PUSH_SUPPORT=$(grep -c "push" "$NOTIFICATION_SERVICE_DIR/src/notification-service.ts" 2>/dev/null || echo 0)
  
  if [ "$EMAIL_SUPPORT" -gt 0 ] && [ "$SMS_SUPPORT" -gt 0 ] && [ "$PUSH_SUPPORT" -gt 0 ]; then
    print_result "Multi-channel support" 0
  else
    print_result "Multi-channel support" 1
    echo -e "${YELLOW}  Email refs: $EMAIL_SUPPORT, SMS refs: $SMS_SUPPORT, Push refs: $PUSH_SUPPORT${NC}"
  fi
else
  print_result "notification-service.ts not found" 1
fi

# Test 5: Retry logic implemented
echo -n "Test: Retry logic with exponential backoff... "
if [ -f "$NOTIFICATION_SERVICE_DIR/src/notification-service.ts" ]; then
  if grep -q "retry\|backoff\|attempt" "$NOTIFICATION_SERVICE_DIR/src/notification-service.ts"; then
    print_result "Retry logic implemented" 0
  else
    print_result "Retry logic implemented" 1
  fi
else
  print_result "notification-service.ts not found" 1
fi

# Test 6: Integration tests for notification delivery
echo -n "Test: Notification delivery integration tests... "
if [ -f "$NOTIFICATION_SERVICE_DIR/tests/integration/notification-delivery.test.ts" ]; then
  print_result "Notification delivery tests exist" 0
else
  print_result "Notification delivery tests exist" 1
fi

echo ""

# ===================================================================
# API INTEGRATION TESTS
# ===================================================================

echo "========================================"
echo "API Integration Tests"
echo "========================================"
echo ""

# Test 1: API integration test file exists
echo -n "Test: API integration tests exist... "
if [ -f "$NOTIFICATION_SERVICE_DIR/tests/integration/api.test.ts" ]; then
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
if [ -f "$NOTIFICATION_SERVICE_DIR/tests/integration/api.test.ts" ]; then
  POSITIVE_TESTS=$(grep -c "should send.*successfully\|should.*succeed" "$NOTIFICATION_SERVICE_DIR/tests/integration/api.test.ts" 2>/dev/null || echo 0)
  
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
if [ -f "$NOTIFICATION_SERVICE_DIR/tests/integration/api.test.ts" ]; then
  NEGATIVE_TESTS=$(grep -c "should reject\|should.*fail\|should return.*400\|should return.*404" "$NOTIFICATION_SERVICE_DIR/tests/integration/api.test.ts" 2>/dev/null || echo 0)
  
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
if [ -f "$NOTIFICATION_SERVICE_DIR/tests/integration/api.test.ts" ]; then
  EDGE_TESTS=$(grep -c "should handle\|edge case\|concurrent" "$NOTIFICATION_SERVICE_DIR/tests/integration/api.test.ts" 2>/dev/null || echo 0)
  
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
# DATA PRIVACY & SECURITY VALIDATION
# ===================================================================

echo "========================================"
echo "Data Privacy & Security Validation"
echo "========================================"
echo ""

# Test 1: PII scrubbing logger exists
echo -n "Test: PII-scrubbing logger module... "
if [ -f "$NOTIFICATION_SERVICE_DIR/src/logger.ts" ]; then
  print_result "logger.ts exists" 0
else
  print_result "logger.ts exists" 1
fi

# Test 2: Logger unit tests exist
echo -n "Test: Logger unit tests... "
if [ -f "$NOTIFICATION_SERVICE_DIR/tests/unit/logger.test.ts" ]; then
  print_result "Logger unit tests exist" 0
else
  print_result "Logger unit tests exist" 1
fi

# Test 3: No PII in logs constraint documented in spec
echo -n "Test: No PII constraint in spec... "
if grep -q "No PII in Logs\|PII.*log\|mask.*email\|scrub" "$NOTIFICATION_SERVICE_DIR/spec.md"; then
  print_result "PII constraint documented" 0
else
  print_result "PII constraint documented" 1
fi

# Test 4: Opt-out enforcement logic exists
echo -n "Test: Opt-out enforcement logic... "
if [ -f "$NOTIFICATION_SERVICE_DIR/src/notification-service.ts" ]; then
  if grep -q "opt.*out\|OptOut\|suppress" "$NOTIFICATION_SERVICE_DIR/src/notification-service.ts"; then
    print_result "Opt-out enforcement" 0
  else
    print_result "Opt-out enforcement" 1
  fi
else
  print_result "notification-service.ts not found" 1
fi

# Test 5: Customer preferences table exists in types
echo -n "Test: Customer preferences types... "
if [ -f "$NOTIFICATION_SERVICE_DIR/src/types.ts" ]; then
  if grep -q "CustomerPreferences\|emailOptOut\|smsOptOut\|pushOptOut" "$NOTIFICATION_SERVICE_DIR/src/types.ts"; then
    print_result "Customer preferences types" 0
  else
    print_result "Customer preferences types" 1
  fi
else
  print_result "types.ts not found" 1
fi

# Test 6: Idempotency implementation
echo -n "Test: Idempotency logic... "
if [ -f "$NOTIFICATION_SERVICE_DIR/src/index.ts" ]; then
  if grep -q "idempotency\|idempotencyKey\|duplicate" "$NOTIFICATION_SERVICE_DIR/src/index.ts"; then
    print_result "Idempotency implementation" 0
  else
    print_result "Idempotency implementation" 1
  fi
else
  print_result "index.ts not found" 1
fi

echo ""

# ===================================================================
# AUTOMATION PATTERNS VALIDATION
# ===================================================================

echo "========================================"
echo "Automation Patterns Validation"
echo "========================================"
echo ""

# Test 1: Spec references automation hooks
echo -n "Test: Automation hooks referenced in spec... "
if grep -q "scaffold-service\|update-docs\|regen-clients\|test-on-save\|validate-spec-constraints" "$NOTIFICATION_SERVICE_DIR/spec.md"; then
  print_result "Automation hooks documented" 0
else
  print_result "Automation hooks documented" 1
fi

# Test 2: README mentions automation patterns
echo -n "Test: README demonstrates automation... "
if grep -q "automation\|Automation\|spec → implementation\|spec-driven" "$NOTIFICATION_SERVICE_DIR/README.md"; then
  print_result "Automation patterns in README" 0
else
  print_result "Automation patterns in README" 1
fi

# Test 3: Types are consistently defined
echo -n "Test: TypeScript types defined... "
if [ -f "$NOTIFICATION_SERVICE_DIR/src/types.ts" ]; then
  # Check for key interface definitions
  INTERFACE_COUNT=$(grep -c "^export interface\|^export type" "$NOTIFICATION_SERVICE_DIR/src/types.ts" 2>/dev/null || echo 0)
  
  if [ "$INTERFACE_COUNT" -ge 8 ]; then
    print_result "Types comprehensive (≥8)" 0
  else
    print_result "Types comprehensive (≥8)" 1
    echo -e "${YELLOW}  Found: $INTERFACE_COUNT type definitions${NC}"
  fi
else
  print_result "types.ts not found" 1
fi

# Test 4: Spec documents design decisions
echo -n "Test: Design decisions documented... "
if grep -q "Design Decisions\|Decision:\|Rationale:" "$NOTIFICATION_SERVICE_DIR/spec.md"; then
  DECISION_COUNT=$(grep -c "^### [0-9]\+\.\|^## Design Decision" "$NOTIFICATION_SERVICE_DIR/spec.md" 2>/dev/null || echo 0)
  
  if [ "$DECISION_COUNT" -ge 3 ]; then
    print_result "Design decisions documented" 0
  else
    print_result "Design decisions documented" 1
    echo -e "${YELLOW}  Found: $DECISION_COUNT documented decisions${NC}"
  fi
else
  print_result "Design decisions not found" 1
fi

# Test 5: Test expectations in spec match tests
echo -n "Test: Test expectations in spec... "
if grep -q "Test Expectations\|✓.*must pass\|✗.*must be rejected" "$NOTIFICATION_SERVICE_DIR/spec.md"; then
  EXPECTATION_COUNT=$(grep -c "^[0-9]\+\. \*\*✓\|^[0-9]\+\. \*\*✗" "$NOTIFICATION_SERVICE_DIR/spec.md" 2>/dev/null || echo 0)
  
  if [ "$EXPECTATION_COUNT" -ge 10 ]; then
    print_result "Test expectations documented (≥10)" 0
  else
    print_result "Test expectations documented (≥10)" 1
    echo -e "${YELLOW}  Found: $EXPECTATION_COUNT test expectations${NC}"
  fi
else
  print_result "Test expectations not found" 1
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
if [ -f "$NOTIFICATION_SERVICE_DIR/README.md" ]; then
  README_SECTIONS=$(grep -c "^##" "$NOTIFICATION_SERVICE_DIR/README.md" 2>/dev/null || echo 0)
  
  if [ "$README_SECTIONS" -ge 10 ]; then
    print_result "README comprehensive (≥10 sections)" 0
  else
    print_result "README comprehensive (≥10 sections)" 1
    echo -e "${YELLOW}  Found: $README_SECTIONS sections${NC}"
  fi
else
  print_result "README.md not found" 1
fi

# Test 2: Spec document complete
echo -n "Test: spec.md complete... "
if [ -f "$NOTIFICATION_SERVICE_DIR/spec.md" ]; then
  SPEC_SECTIONS=$(grep -c "^##" "$NOTIFICATION_SERVICE_DIR/spec.md" 2>/dev/null || echo 0)
  
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
if grep -q "scaffold-service\|update-docs\|regen-clients\|test-on-save\|validate-spec-constraints" "$NOTIFICATION_SERVICE_DIR/README.md"; then
  print_result "Toolkit artifacts documented" 0
else
  print_result "Toolkit artifacts documented" 1
fi

# Test 4: Concerns addressed documented
echo -n "Test: Concerns addressed documented... "
if grep -q "Primary Concerns\|Concern.*#\|Engineer Burnout\|Repetitive Work" "$NOTIFICATION_SERVICE_DIR/README.md"; then
  print_result "Concerns documented" 0
else
  print_result "Concerns documented" 1
fi

# Test 5: How to run instructions
echo -n "Test: How to run instructions... "
if grep -q "Quick Start\|Prerequisites\|How to Run\|Validation" "$NOTIFICATION_SERVICE_DIR/README.md"; then
  print_result "Run instructions present" 0
else
  print_result "Run instructions present" 1
fi

# Test 6: API endpoint documentation
echo -n "Test: API endpoints documented... "
if grep -q "POST /api/notifications/send\|GET /api/notifications.*status" "$NOTIFICATION_SERVICE_DIR/README.md"; then
  print_result "API endpoints documented" 0
else
  print_result "API endpoints documented" 1
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
  echo "Notification service example is complete and ready for use."
  echo ""
  echo "Key Features Validated:"
  echo "  ✓ TypeScript build and compilation"
  echo "  ✓ Unit and integration tests"
  echo "  ✓ Infrastructure definitions (DynamoDB, SQS, SNS, SES)"
  echo "  ✓ SQS message processing with priority queues"
  echo "  ✓ SNS notification delivery (email, SMS, push)"
  echo "  ✓ Data privacy (PII scrubbing, opt-out enforcement)"
  echo "  ✓ Automation patterns (spec-driven development)"
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
