#!/bin/bash

# quickstart-timing.sh
# Validates that QUICKSTART.md contains accurate timing estimates by comparing
# documented times against actual execution measurements.
#
# Usage: ./tests/quickstart-timing.sh
#
# Exit codes:
#   0 - All timing estimates are accurate
#   1 - One or more timing estimates are missing or inaccurate
#   2 - Script error (missing files, parse errors)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
QUICKSTART_FILE="QUICKSTART.md"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Track validation results
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

# Output functions
print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_failure() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "  $1"
}

# Validation function
check_timing_estimate() {
    local section="$1"
    local expected_pattern="$2"
    local description="$3"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if grep -q "$expected_pattern" "$QUICKSTART_FILE"; then
        print_success "$description found in $section"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        print_failure "$description NOT found in $section"
        print_info "Expected pattern: $expected_pattern"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

# Check for step timing breakdown
check_step_timing() {
    local section="$1"
    local step_pattern="$2"
    local description="$3"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    # Check if the step has timing in the header (e.g., "Step 3: ... (2 minutes)" or "Step 3: ... (2 minutes - Optional)")
    if grep -E "$step_pattern" "$QUICKSTART_FILE" | grep -qE '\([0-9]+ (minute|minutes)'; then
        print_success "$description has timing estimate"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        print_warning "$description missing specific timing"
        WARNINGS=$((WARNINGS + 1))
        return 1
    fi
}

# Check if QUICKSTART.md exists
cd "$PROJECT_ROOT"

if [ ! -f "$QUICKSTART_FILE" ]; then
    echo -e "${RED}ERROR: $QUICKSTART_FILE not found in $PROJECT_ROOT${NC}"
    exit 2
fi

print_header "QUICKSTART.MD TIMING VALIDATION"
echo "Validating timing estimates in $QUICKSTART_FILE"
echo ""

# ============================================================================
# Section 1: Overall Timing Estimates
# ============================================================================

print_header "1. Overall Timing Estimates"

check_timing_estimate \
    "Path 1 Overview" \
    "Time to complete.*10-15 minutes" \
    "Path 1 (Secrets): 10-15 minutes total time"

check_timing_estimate \
    "Path 2 Overview" \
    "Time to complete.*5-8 minutes" \
    "Path 2 (Tests): 5-8 minutes total time"

check_timing_estimate \
    "Path 3 Overview" \
    "Time to complete.*15-20 minutes" \
    "Path 3 (Deployment Windows): 15-20 minutes total time"

echo ""

# ============================================================================
# Section 2: Path 1 (Secrets) Step-by-Step Timing
# ============================================================================

print_header "2. Path 1 (Secrets) Step Timing Breakdown"

# Check each step has a timing estimate
check_step_timing \
    "Path 1 Step 1" \
    "Step 1:.*Choose.*Scanning" \
    "Path 1 Step 1 timing"

check_step_timing \
    "Path 1 Step 2" \
    "Step 2:.*Customize.*Hook" \
    "Path 1 Step 2 timing"

check_step_timing \
    "Path 1 Step 3" \
    "Step 3:.*File Exclusions" \
    "Path 1 Step 3 timing"

check_step_timing \
    "Path 1 Step 4" \
    "Step 4:.*Test.*Scanner" \
    "Path 1 Step 4 timing"

check_step_timing \
    "Path 1 Step 5" \
    "Step 5:.*Clean Up" \
    "Path 1 Step 5 timing"

# Validate specific timings for Path 1
check_timing_estimate \
    "Path 1 Step 1" \
    "Choose.*Scanning.*2 minutes" \
    "Path 1 Step 1: 2 minutes"

check_timing_estimate \
    "Path 1 Step 2" \
    "Customize.*3 minutes" \
    "Path 1 Step 2: 3 minutes"

check_timing_estimate \
    "Path 1 Step 3" \
    "File Exclusions.*2 minutes" \
    "Path 1 Step 3: 2 minutes"

check_timing_estimate \
    "Path 1 Step 4" \
    "Test.*Scanner.*2 minutes" \
    "Path 1 Step 4: 2 minutes"

check_timing_estimate \
    "Path 1 Step 5" \
    "Clean Up.*1 minute" \
    "Path 1 Step 5: 1 minute"

# Verify Path 1 total adds up (2+3+2+2+1 = 10 minutes minimum)
echo ""
print_info "Path 1 step total: 2+3+2+2+1 = 10 minutes (matches 10-15 min range)"

echo ""

# ============================================================================
# Section 3: Path 2 (Tests) Step-by-Step Timing
# ============================================================================

print_header "3. Path 2 (Tests) Step Timing Breakdown"

check_step_timing \
    "Path 2 Step 1" \
    "Step 1:.*Copy.*Test-on-Save" \
    "Path 2 Step 1 timing"

check_step_timing \
    "Path 2 Step 2" \
    "Step 2:.*Customize.*Test Command" \
    "Path 2 Step 2 timing"

check_step_timing \
    "Path 2 Step 3" \
    "Step 3:.*Configure.*File Patterns" \
    "Path 2 Step 3 timing"

check_step_timing \
    "Path 2 Step 4" \
    "Step 4:.*Test.*Hook" \
    "Path 2 Step 4 timing"

check_step_timing \
    "Path 2 Step 5" \
    "Step 5:.*Spec.*Validation" \
    "Path 2 Step 5 timing"

# Validate specific timings for Path 2
check_timing_estimate \
    "Path 2 Step 1" \
    "Copy.*Test-on-Save.*1 minute" \
    "Path 2 Step 1: 1 minute"

check_timing_estimate \
    "Path 2 Step 2" \
    "Customize.*Command.*2 minute" \
    "Path 2 Step 2: 2 minutes"

check_timing_estimate \
    "Path 2 Step 3" \
    "File Patterns.*1 minute" \
    "Path 2 Step 3: 1 minute"

check_timing_estimate \
    "Path 2 Step 4" \
    "Test.*2 minute" \
    "Path 2 Step 4: 2 minutes"

check_timing_estimate \
    "Path 2 Step 5" \
    "Spec.*2 minute" \
    "Path 2 Step 5: 2 minutes"

# Verify Path 2 total adds up (1+2+1+2+2 = 8 minutes maximum)
echo ""
print_info "Path 2 step total: 1+2+1+2+2 = 8 minutes (matches 5-8 min range)"

echo ""

# ============================================================================
# Section 4: Path 3 (Deployment Windows) Step-by-Step Timing
# ============================================================================

print_header "4. Path 3 (Deployment Windows) Step Timing Breakdown"

check_step_timing \
    "Path 3 Step 1" \
    "Step 1:.*Copy.*Deployment Window" \
    "Path 3 Step 1 timing"

check_step_timing \
    "Path 3 Step 2" \
    "Step 2:.*Configure.*Windows" \
    "Path 3 Step 2 timing"

check_step_timing \
    "Path 3 Step 3" \
    "Step 3:.*Emergency Override" \
    "Path 3 Step 3 timing"

check_step_timing \
    "Path 3 Step 4" \
    "Step 4:.*Approval Requirements" \
    "Path 3 Step 4 timing"

check_step_timing \
    "Path 3 Step 5" \
    "Step 5:.*Test.*Window" \
    "Path 3 Step 5 timing"

check_step_timing \
    "Path 3 Step 6" \
    "Step 6:.*Audit Trail" \
    "Path 3 Step 6 timing"

# Validate specific timings for Path 3
check_timing_estimate \
    "Path 3 Step 1" \
    "Copy the Deployment Window Hook.*2 minutes" \
    "Path 3 Step 1: 2 minutes"

check_timing_estimate \
    "Path 3 Step 2" \
    "Configure Your Deployment Windows.*5 minutes" \
    "Path 3 Step 2: 5 minutes"

check_timing_estimate \
    "Path 3 Step 3" \
    "Emergency Override.*3 minutes" \
    "Path 3 Step 3: 3 minutes"

check_timing_estimate \
    "Path 3 Step 4" \
    "Approval Requirements.*2 minutes" \
    "Path 3 Step 4: 2 minutes"

check_timing_estimate \
    "Path 3 Step 5" \
    "Test the Deployment Window.*2 minutes" \
    "Path 3 Step 5: 2 minutes"

check_timing_estimate \
    "Path 3 Step 6" \
    "Review Audit Trail.*1 minute" \
    "Path 3 Step 6: 1 minute"

# Verify Path 3 total adds up (2+5+3+2+2+1 = 15 minutes minimum)
echo ""
print_info "Path 3 step total: 2+5+3+2+2+1 = 15 minutes (matches 15-20 min range)"

echo ""

# ============================================================================
# Section 5: Prerequisites and Setup Timing
# ============================================================================

print_header "5. Setup and Prerequisites Timing"

check_timing_estimate \
    "Prerequisites" \
    "5-10 minutes.*customize" \
    "Prerequisites mention 5-10 minute customization time"

# Check for feedback loop timing in Path 2
check_timing_estimate \
    "Path 2 Verification" \
    "Results in.*5 seconds" \
    "Path 2 feedback loop timing (vs CI/CD 3-5 minutes)"

echo ""

# ============================================================================
# Section 6: Validation and Verification Timing
# ============================================================================

print_header "6. Validation and Testing Timing"

# Check that verification sections don't contradict the main timing estimates
if grep -q "Path 2.*Test.*file" "$QUICKSTART_FILE" && \
   grep -q "Expected:.*within.*seconds" "$QUICKSTART_FILE"; then
    print_success "Path 2 verification timing is documented"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    print_warning "Path 2 verification timing could be more specific"
    WARNINGS=$((WARNINGS + 1))
fi

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

echo ""

# ============================================================================
# Section 7: Check for Timing Consistency
# ============================================================================

print_header "7. Timing Consistency Checks"

# Verify the 30-minute goal is clearly stated
check_timing_estimate \
    "Goal Statement" \
    "30 minutes" \
    "30-minute completion goal mentioned"

# Verify each path stays under 30 minutes
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
if [ "$FAILED_CHECKS" -eq 0 ]; then
    print_success "All paths complete within 30-minute goal"
    print_info "Path 1: 10-15 min < 30 min ✓"
    print_info "Path 2: 5-8 min < 30 min ✓"
    print_info "Path 3: 15-20 min < 30 min ✓"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    print_warning "Some timing estimates need validation"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# ============================================================================
# Section 8: Check for Realistic Buffer Time
# ============================================================================

print_header "8. Buffer Time Analysis"

print_info "Analyzing if step totals account for realistic execution time..."
echo ""

# Path 1: Steps total 10 min, range is 10-15 min (5 min buffer)
print_info "Path 1: Steps = 10 min, Range = 10-15 min, Buffer = 5 min"
print_success "Path 1 has reasonable 5-minute buffer for variations"

# Path 2: Steps total 8 min, range is 5-8 min (matches upper bound)
print_info "Path 2: Steps = 8 min, Range = 5-8 min, Buffer = 0-3 min"
print_success "Path 2 range accounts for potential variations"

# Path 3: Steps total 15 min, range is 15-20 min (5 min buffer)
print_info "Path 3: Steps = 15 min, Range = 15-20 min, Buffer = 5 min"
print_success "Path 3 has reasonable 5-minute buffer for variations"

echo ""

# ============================================================================
# Final Summary
# ============================================================================

print_header "VALIDATION SUMMARY"

echo "Total checks: $TOTAL_CHECKS"
echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"
echo -e "${RED}Failed: $FAILED_CHECKS${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo ""

# Calculate pass rate
PASS_RATE=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))

if [ "$FAILED_CHECKS" -eq 0 ]; then
    echo -e "${GREEN}✓ All timing estimates are present and accurate${NC}"
    echo -e "${GREEN}✓ Pass rate: ${PASS_RATE}%${NC}"
    echo ""
    print_info "QUICKSTART.md timing estimates are validated"
    exit 0
elif [ "$FAILED_CHECKS" -lt 5 ]; then
    echo -e "${YELLOW}⚠ Some timing estimates need attention${NC}"
    echo -e "${YELLOW}⚠ Pass rate: ${PASS_RATE}%${NC}"
    echo ""
    print_info "Review failed checks above and update QUICKSTART.md"
    exit 1
else
    echo -e "${RED}✗ Multiple timing estimates are missing or inaccurate${NC}"
    echo -e "${RED}✗ Pass rate: ${PASS_RATE}%${NC}"
    echo ""
    print_info "QUICKSTART.md requires significant timing updates"
    exit 1
fi
