#!/bin/bash

# validate-spec-templates.sh
# Validates spec template structure and content
# Part of Kiro Cloud Engineering/DevOps Toolbox validation suite

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Test results array
declare -a FAILURES

# Base directory for templates
TEMPLATES_DIR="toolkit/specs/templates"

echo "========================================"
echo "Spec Template Validation Tests"
echo "========================================"
echo ""

# Helper function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if eval "$test_command" > /dev/null 2>&1; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo -e "${GREEN}✓${NC} $test_name"
        return 0
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo -e "${RED}✗${NC} $test_name"
        FAILURES+=("$test_name")
        return 1
    fi
}

# Helper function to check if a section exists in a file
section_exists() {
    local file="$1"
    local section="$2"
    grep -q "^## $section" "$file"
}

# Helper function to check if a field exists in frontmatter/metadata
metadata_field_exists() {
    local file="$1"
    local field="$2"
    grep -q "^\*\*$field\*\*:" "$file" || grep -q "^> \*\*$field\*\*:" "$file"
}

# Helper function to check for placeholder format
has_placeholder_format() {
    local file="$1"
    local placeholder_pattern="$2"
    grep -q "\[$placeholder_pattern\]" "$file"
}

# Helper function to check for customization guide
has_customization_guide() {
    local file="$1"
    grep -q "CUSTOMIZATION GUIDE" "$file"
}

echo "Test Suite 1: Validate Required Sections Present"
echo "=================================================="
echo ""

# Test 1.1: Service template has Intent section
run_test "Service template has Intent section" \
    "section_exists '$TEMPLATES_DIR/service.spec.md' 'Intent'"

# Test 1.2: Service template has Contracts section
run_test "Service template has Contracts section" \
    "section_exists '$TEMPLATES_DIR/service.spec.md' 'Contracts'"

# Test 1.3: Service template has Constraints section
run_test "Service template has Constraints section" \
    "section_exists '$TEMPLATES_DIR/service.spec.md' 'Constraints'"

# Test 1.4: Service template has Design Decisions section
run_test "Service template has Design Decisions section" \
    "section_exists '$TEMPLATES_DIR/service.spec.md' 'Design Decisions (and why)'"

# Test 1.5: Service template has Test Expectations section
run_test "Service template has Test Expectations section" \
    "section_exists '$TEMPLATES_DIR/service.spec.md' 'Test Expectations'"

# Test 1.6: Service template has Rollback Plan section
run_test "Service template has Rollback Plan section" \
    "section_exists '$TEMPLATES_DIR/service.spec.md' 'Rollback Plan'"

# Test 1.7: Feature template has Intent section
run_test "Feature template has Intent section" \
    "section_exists '$TEMPLATES_DIR/feature.spec.md' 'Intent'"

# Test 1.8: Feature template has Contracts section
run_test "Feature template has Contracts section" \
    "section_exists '$TEMPLATES_DIR/feature.spec.md' 'Contracts'"

# Test 1.9: Feature template has Constraints section
run_test "Feature template has Constraints section" \
    "section_exists '$TEMPLATES_DIR/feature.spec.md' 'Constraints'"

# Test 1.10: Feature template has Test Expectations section
run_test "Feature template has Test Expectations section" \
    "section_exists '$TEMPLATES_DIR/feature.spec.md' 'Test Expectations'"

# Test 1.11: Infrastructure template exists
run_test "Infrastructure template exists" \
    "test -f '$TEMPLATES_DIR/infrastructure.spec.md'"

# Test 1.12: Infrastructure template has Intent section
if [ -f "$TEMPLATES_DIR/infrastructure.spec.md" ]; then
    run_test "Infrastructure template has Intent section" \
        "section_exists '$TEMPLATES_DIR/infrastructure.spec.md' 'Intent'"
fi

echo ""
echo "Test Suite 2: Test Metadata Format"
echo "==================================="
echo ""

# Test 2.1: Service template has Primary Concerns metadata
run_test "Service template has Primary Concerns metadata" \
    "metadata_field_exists '$TEMPLATES_DIR/service.spec.md' 'Primary Concerns Addressed'"

# Test 2.2: Service template has Toolkit Artifacts metadata
run_test "Service template has Toolkit Artifacts metadata" \
    "metadata_field_exists '$TEMPLATES_DIR/service.spec.md' 'Toolkit Artifacts Used'"

# Test 2.3: Feature template has Feature Type metadata
run_test "Feature template has Feature Type metadata" \
    "metadata_field_exists '$TEMPLATES_DIR/feature.spec.md' 'Feature Type'"

# Test 2.4: Feature template has Parent Service metadata
run_test "Feature template has Parent Service metadata" \
    "metadata_field_exists '$TEMPLATES_DIR/feature.spec.md' 'Parent Service'"

# Test 2.5: Feature template has Primary Concerns metadata
run_test "Feature template has Primary Concerns metadata" \
    "metadata_field_exists '$TEMPLATES_DIR/feature.spec.md' 'Primary Concerns Addressed'"

# Test 2.6: Feature template has Toolkit Artifacts metadata
run_test "Feature template has Toolkit Artifacts metadata" \
    "metadata_field_exists '$TEMPLATES_DIR/feature.spec.md' 'Toolkit Artifacts Used'"

echo ""
echo "Test Suite 3: Verify Task Format Compliance"
echo "============================================"
echo ""

# Test 3.1: Service template has positive test cases (✓)
run_test "Service template has positive test cases (✓)" \
    "grep -q '✓' '$TEMPLATES_DIR/service.spec.md'"

# Test 3.2: Service template has negative test cases (✗)
run_test "Service template has negative test cases (✗)" \
    "grep -q '✗' '$TEMPLATES_DIR/service.spec.md'"

# Test 3.3: Service template shows correct implementation examples
run_test "Service template shows correct implementation examples" \
    "grep -q '// ✓ CORRECT:' '$TEMPLATES_DIR/service.spec.md'"

# Test 3.4: Service template shows incorrect implementation examples
run_test "Service template shows incorrect implementation examples" \
    "grep -q '// ✗ WRONG:' '$TEMPLATES_DIR/service.spec.md'"

# Test 3.5: Feature template has positive test cases (✓)
run_test "Feature template has positive test cases (✓)" \
    "grep -q '✓' '$TEMPLATES_DIR/feature.spec.md'"

# Test 3.6: Feature template has negative test cases (✗)
run_test "Feature template has negative test cases (✗)" \
    "grep -q '✗' '$TEMPLATES_DIR/feature.spec.md'"

# Test 3.7: Feature template has edge case markers (⚠)
run_test "Feature template has edge case markers (⚠)" \
    "grep -q '⚠' '$TEMPLATES_DIR/feature.spec.md'"

# Test 3.8: Service template has validation checkmarks
run_test "Service template has validation checkmarks" \
    "grep -q '\*\*Validation\*\*:' '$TEMPLATES_DIR/service.spec.md'"

# Test 3.9: Feature template has Given-When-Then format
run_test "Feature template has Given-When-Then format" \
    "grep -q 'Given:' '$TEMPLATES_DIR/feature.spec.md' && grep -q 'When:' '$TEMPLATES_DIR/feature.spec.md' && grep -q 'Then:' '$TEMPLATES_DIR/feature.spec.md'"

echo ""
echo "Test Suite 4: Test Optional Section Handling"
echo "=============================================="
echo ""

# Test 4.1: Service template includes customization guide comments
run_test "Service template includes customization guide comments" \
    "has_customization_guide '$TEMPLATES_DIR/service.spec.md'"

# Test 4.2: Service template has placeholder brackets
run_test "Service template has [YOUR_SERVICE_NAME] placeholder" \
    "has_placeholder_format '$TEMPLATES_DIR/service.spec.md' 'YOUR_SERVICE_NAME'"

# Test 4.3: Service template has [YOUR_CONCERN] placeholder
run_test "Service template has [YOUR_CONCERN] placeholder" \
    "has_placeholder_format '$TEMPLATES_DIR/service.spec.md' 'YOUR_CONCERN'"

# Test 4.4: Feature template includes customization guide comments
run_test "Feature template includes customization guide comments" \
    "has_customization_guide '$TEMPLATES_DIR/feature.spec.md'"

# Test 4.5: Feature template has [YOUR_FEATURE_NAME] placeholder
run_test "Feature template has [YOUR_FEATURE_NAME] placeholder" \
    "has_placeholder_format '$TEMPLATES_DIR/feature.spec.md' 'YOUR_FEATURE_NAME'"

# Test 4.6: Service template includes optional section deletion instructions
run_test "Service template includes optional section deletion instructions" \
    "grep -iq 'delete' '$TEMPLATES_DIR/service.spec.md'"

# Test 4.7: Feature template includes optional section deletion instructions
run_test "Feature template includes optional section deletion instructions" \
    "grep -q 'Delete if' '$TEMPLATES_DIR/feature.spec.md' || grep -q 'delete' '$TEMPLATES_DIR/feature.spec.md'"

# Test 4.8: Service template has optional Event Processing section
run_test "Service template has optional Event Processing section" \
    "grep -q 'Event Processing (if applicable)' '$TEMPLATES_DIR/service.spec.md'"

# Test 4.9: Feature template has optional Feature Flag section
run_test "Feature template has optional Feature Flag section" \
    "section_exists '$TEMPLATES_DIR/feature.spec.md' 'Feature Flag Configuration'"

# Test 4.10: Feature template has optional Dependencies section
run_test "Feature template has optional Dependencies section" \
    "section_exists '$TEMPLATES_DIR/feature.spec.md' 'Dependencies'"

# Test 4.11: Service template references golden specs
run_test "Service template references golden specs" \
    "grep -q 'golden/' '$TEMPLATES_DIR/service.spec.md'"

# Test 4.12: Feature template references toolkit hooks
run_test "Feature template references toolkit hooks" \
    "grep -q 'toolkit/hooks/' '$TEMPLATES_DIR/feature.spec.md'"

echo ""
echo "Additional Validation Checks"
echo "============================="
echo ""

# Test 5.1: Service template has API endpoint examples
run_test "Service template has API endpoint examples" \
    "grep -q '\[HTTP_METHOD\]' '$TEMPLATES_DIR/service.spec.md'"

# Test 5.2: Service template has TypeScript schema examples
run_test "Service template has TypeScript schema examples" \
    "grep -q '```typescript' '$TEMPLATES_DIR/service.spec.md'"

# Test 5.3: Feature template has rollback plan
run_test "Feature template has rollback plan" \
    "section_exists '$TEMPLATES_DIR/feature.spec.md' 'Rollback Plan'"

# Test 5.4: Service template has security constraints
run_test "Service template has security constraints" \
    "grep -q 'Security Constraints' '$TEMPLATES_DIR/service.spec.md'"

# Test 5.5: Feature template has security constraints
run_test "Feature template has security constraints" \
    "grep -q 'Security Constraints' '$TEMPLATES_DIR/feature.spec.md'"

# Test 5.6: Service template includes IAM validation example
run_test "Service template includes IAM validation example" \
    "grep -q 'Least Privilege IAM' '$TEMPLATES_DIR/service.spec.md' || grep -q 'IAM' '$TEMPLATES_DIR/service.spec.md'"

# Test 5.7: Feature template includes no PII in logs constraint
run_test "Feature template includes no PII in logs constraint" \
    "grep -q 'No PII in Logs' '$TEMPLATES_DIR/feature.spec.md'"

# Test 5.8: Service template has Quick Start section
run_test "Service template has Quick Start section" \
    "grep -q 'Quick Start' '$TEMPLATES_DIR/service.spec.md'"

# Test 5.9: Feature template has Quick Start section
run_test "Feature template has Quick Start section" \
    "grep -q 'Quick Start' '$TEMPLATES_DIR/feature.spec.md'"

# Test 5.10: Service template has validation commands
run_test "Service template has validation commands" \
    "grep -q '```bash' '$TEMPLATES_DIR/service.spec.md'"

# Test 5.11: Feature template has success criteria
run_test "Feature template has success criteria section" \
    "section_exists '$TEMPLATES_DIR/feature.spec.md' 'Success Criteria'"

# Test 5.12: Service template has lessons learned section
run_test "Service template has lessons learned section" \
    "section_exists '$TEMPLATES_DIR/service.spec.md' 'Lessons Learned'"

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo "Total tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}Failed tests:${NC}"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
    echo ""
    exit 1
else
    echo -e "${GREEN}All spec template validation tests passed!${NC}"
    echo ""
    echo "Validated:"
    echo "  ✓ Required sections present in all templates"
    echo "  ✓ Metadata format correct and complete"
    echo "  ✓ Task format compliance (✓/✗/⚠ markers, Given-When-Then)"
    echo "  ✓ Optional sections properly marked and documented"
    echo "  ✓ Placeholder format consistent ([YOUR_*])"
    echo "  ✓ Customization guides present"
    echo "  ✓ Security constraints included"
    echo "  ✓ Integration with toolkit artifacts"
    exit 0
fi
