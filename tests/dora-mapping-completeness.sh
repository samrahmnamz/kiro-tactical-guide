#!/bin/bash

# DORA Metrics Mapping Completeness Validation Script
# 
# This script validates that docs/dora-metrics.md properly maps all four DORA metrics
# to specific kiro-cloudeng-devops features with concrete examples.
#
# Requirements (from task 30.2):
# - Verify all 4 DORA metrics have documentation
# - Check each metric has artifact mapping
# - Validate traceability from artifacts to metrics
#
# Exit codes:
#   0 - All validations passed
#   1 - Validation failures detected

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0
CHECKS=0

# Helper functions
error() {
    echo -e "${RED}✗ ERROR: $1${NC}" >&2
    ERRORS=$((ERRORS + 1))
}

warning() {
    echo -e "${YELLOW}⚠ WARNING: $1${NC}" >&2
    WARNINGS=$((WARNINGS + 1))
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

info() {
    echo "ℹ $1"
}

check() {
    CHECKS=$((CHECKS + 1))
}

# File path
DORA_FILE="docs/dora-metrics.md"

# Check if file exists
if [ ! -f "$DORA_FILE" ]; then
    error "File $DORA_FILE not found"
    exit 1
fi

info "Validating DORA metrics documentation at $DORA_FILE"
echo ""

# ============================================================================
# 1. Verify all 4 DORA metrics are documented
# ============================================================================

info "Checking for all 4 DORA metrics..."
echo ""

METRICS=(
    "Deployment Frequency"
    "Lead Time for Changes"
    "Change Failure Rate"
    "Time to Restore Service"
)

for metric in "${METRICS[@]}"; do
    check
    if grep -q "$metric" "$DORA_FILE"; then
        success "Found metric: $metric"
    else
        error "Missing metric: $metric"
    fi
done

echo ""

# ============================================================================
# 2. Verify each metric has a dedicated section with heading
# ============================================================================

info "Checking for dedicated sections for each metric..."
echo ""

# Check for section headings (## 1., ## 2., etc.)
for i in {1..4}; do
    check
    if grep -q "^## $i\. " "$DORA_FILE"; then
        SECTION_NAME=$(grep "^## $i\. " "$DORA_FILE" | sed 's/^## [0-9]\. //')
        success "Found section $i: $SECTION_NAME"
    else
        error "Missing section heading for metric $i"
    fi
done

echo ""

# ============================================================================
# 3. Verify each metric has a target defined
# ============================================================================

info "Checking for performance targets for each metric..."
echo ""

TARGET_PATTERNS=(
    "Target:.*On-Demand"
    "Target:.*< 1 Hour"
    "Target:.*< 5%"
    "Target:.*< 1 Hour"
)

for i in "${!TARGET_PATTERNS[@]}"; do
    check
    if grep -E "${TARGET_PATTERNS[$i]}" "$DORA_FILE" > /dev/null; then
        success "Found target for metric $((i + 1))"
    else
        error "Missing or incorrect target for metric $((i + 1)). Expected pattern: ${TARGET_PATTERNS[$i]}"
    fi
done

echo ""

# ============================================================================
# 4. Verify each metric has "Toolkit Artifacts" section
# ============================================================================

info "Checking for 'Toolkit Artifacts' sections..."
echo ""

check
TOOLKIT_COUNT=$(grep -c "### Toolkit Artifacts" "$DORA_FILE" || true)
if [ "$TOOLKIT_COUNT" -eq 4 ]; then
    success "Found 'Toolkit Artifacts' section for all 4 metrics"
elif [ "$TOOLKIT_COUNT" -gt 0 ]; then
    warning "Found only $TOOLKIT_COUNT 'Toolkit Artifacts' sections (expected 4)"
else
    error "No 'Toolkit Artifacts' sections found"
fi

echo ""

# ============================================================================
# 5. Verify artifact mappings with concrete hook/spec references
# ============================================================================

info "Checking for concrete artifact references (hooks, specs)..."
echo ""

# Check for hook references (should have backticks and .yaml extension)
check
HOOK_COUNT=$(grep -c '`.*\.yaml`' "$DORA_FILE" || true)
if [ "$HOOK_COUNT" -ge 10 ]; then
    success "Found $HOOK_COUNT hook references (✓ adequate coverage)"
else
    warning "Found only $HOOK_COUNT hook references (expected at least 10 for good coverage)"
fi

# Check for spec references
check
SPEC_COUNT=$(grep -c '`.*\.spec\.md`' "$DORA_FILE" || true)
if [ "$SPEC_COUNT" -ge 3 ]; then
    success "Found $SPEC_COUNT spec references (✓ adequate coverage)"
else
    warning "Found only $SPEC_COUNT spec references (expected at least 3)"
fi

echo ""

# ============================================================================
# 6. Verify each metric has "Before/After Metrics" table
# ============================================================================

info "Checking for 'Before/After Metrics' comparison tables..."
echo ""

check
METRICS_TABLE_COUNT=$(grep -c "### Before/After Metrics" "$DORA_FILE" || true)
if [ "$METRICS_TABLE_COUNT" -eq 4 ]; then
    success "Found 'Before/After Metrics' tables for all 4 metrics"
elif [ "$METRICS_TABLE_COUNT" -gt 0 ]; then
    warning "Found only $METRICS_TABLE_COUNT 'Before/After Metrics' tables (expected 4)"
else
    error "No 'Before/After Metrics' tables found"
fi

# Check for table structure
check
TABLE_HEADER_COUNT=$(grep -c "| Metric | Before Kiro | After Kiro | Improvement |" "$DORA_FILE" || true)
if [ "$TABLE_HEADER_COUNT" -ge 4 ]; then
    success "Found proper table headers in metrics tables"
else
    warning "Found only $TABLE_HEADER_COUNT table headers (expected at least 4)"
fi

echo ""

# ============================================================================
# 7. Verify each metric has "Measurement Guidance" section
# ============================================================================

info "Checking for 'Measurement Guidance' sections..."
echo ""

check
MEASUREMENT_COUNT=$(grep -c "### Measurement Guidance" "$DORA_FILE" || true)
if [ "$MEASUREMENT_COUNT" -eq 4 ]; then
    success "Found 'Measurement Guidance' section for all 4 metrics"
elif [ "$MEASUREMENT_COUNT" -gt 0 ]; then
    warning "Found only $MEASUREMENT_COUNT 'Measurement Guidance' sections (expected 4)"
else
    error "No 'Measurement Guidance' sections found"
fi

echo ""

# ============================================================================
# 8. Verify specific critical hooks are mentioned
# ============================================================================

info "Checking for mentions of critical hooks..."
echo ""

CRITICAL_HOOKS=(
    "cascade-api-change.yaml"
    "promote-to-staging.yaml"
    "test-on-save.yaml"
    "validate-spec-constraints.yaml"
    "post-incident-learning.yaml"
)

for hook in "${CRITICAL_HOOKS[@]}"; do
    check
    if grep -q "$hook" "$DORA_FILE"; then
        success "Found critical hook: $hook"
    else
        error "Missing critical hook reference: $hook"
    fi
done

echo ""

# ============================================================================
# 9. Verify golden specs are referenced
# ============================================================================

info "Checking for golden spec references..."
echo ""

GOLDEN_SPECS=(
    "auth-pattern.spec.md"
    "logging-standard.spec.md"
    "observability.spec.md"
)

for spec in "${GOLDEN_SPECS[@]}"; do
    check
    if grep -q "$spec" "$DORA_FILE"; then
        success "Found golden spec: $spec"
    else
        warning "Golden spec not referenced: $spec"
    fi
done

echo ""

# ============================================================================
# 10. Verify measurement timeline section exists
# ============================================================================

info "Checking for implementation guidance..."
echo ""

check
if grep -q "### Measurement Timeline" "$DORA_FILE"; then
    success "Found 'Measurement Timeline' section"
else
    warning "Missing 'Measurement Timeline' section"
fi

check
if grep -q "### Success Criteria Checklist" "$DORA_FILE"; then
    success "Found 'Success Criteria Checklist' section"
else
    warning "Missing 'Success Criteria Checklist' section"
fi

echo ""

# ============================================================================
# 11. Verify cross-cutting benefits section
# ============================================================================

info "Checking for cross-cutting benefits documentation..."
echo ""

check
if grep -q "## Cross-Cutting Benefits" "$DORA_FILE"; then
    success "Found 'Cross-Cutting Benefits' section"
else
    warning "Missing 'Cross-Cutting Benefits' section"
fi

check
if grep -q "Automation Compounding Effect" "$DORA_FILE"; then
    success "Found 'Automation Compounding Effect' discussion"
else
    warning "Missing 'Automation Compounding Effect' discussion"
fi

echo ""

# ============================================================================
# 12. Verify numeric improvement metrics are present
# ============================================================================

info "Checking for concrete numeric improvements..."
echo ""

# Check for percentage improvements
check
PERCENTAGE_COUNT=$(grep -c '%' "$DORA_FILE" || true)
if [ "$PERCENTAGE_COUNT" -ge 20 ]; then
    success "Found $PERCENTAGE_COUNT percentage-based improvements (✓ good quantification)"
else
    warning "Found only $PERCENTAGE_COUNT percentage-based improvements (expected more for concrete metrics)"
fi

# Check for time-based improvements
check
TIME_PATTERNS=("< 1 hour" "< 5 minutes" "< 5 seconds" "< 30 minutes")
TIME_IMPROVEMENT_FOUND=0
for pattern in "${TIME_PATTERNS[@]}"; do
    if grep -q "$pattern" "$DORA_FILE"; then
        TIME_IMPROVEMENT_FOUND=$((TIME_IMPROVEMENT_FOUND + 1))
    fi
done

if [ "$TIME_IMPROVEMENT_FOUND" -ge 3 ]; then
    success "Found time-based improvement metrics"
else
    warning "Limited time-based improvement metrics found"
fi

echo ""

# ============================================================================
# 13. Verify traceability from artifacts to metrics
# ============================================================================

info "Checking traceability from artifacts to metrics..."
echo ""

# For each critical hook, verify it's mentioned in a section dedicated to a DORA metric
# We check if the hook appears between a metric section header (## N.) and the next ## section
check
TRACEABILITY_ISSUES=0

for hook in "${CRITICAL_HOOKS[@]}"; do
    # Find which section (if any) contains this hook
    SECTION_FOUND=false
    
    # Check if hook appears in any of the four metric sections
    # Section 1: Deployment Frequency
    if sed -n '/^## 1\. Deployment Frequency/,/^## 2\. Lead Time for Changes/p' "$DORA_FILE" | grep -q "$hook"; then
        SECTION_FOUND=true
    # Section 2: Lead Time for Changes
    elif sed -n '/^## 2\. Lead Time for Changes/,/^## 3\. Change Failure Rate/p' "$DORA_FILE" | grep -q "$hook"; then
        SECTION_FOUND=true
    # Section 3: Change Failure Rate
    elif sed -n '/^## 3\. Change Failure Rate/,/^## 4\. Time to Restore Service/p' "$DORA_FILE" | grep -q "$hook"; then
        SECTION_FOUND=true
    # Section 4: Time to Restore Service (to end of content before Cross-Cutting)
    elif sed -n '/^## 4\. Time to Restore Service/,/^## Cross-Cutting Benefits/p' "$DORA_FILE" | grep -q "$hook"; then
        SECTION_FOUND=true
    fi
    
    if [ "$SECTION_FOUND" = false ]; then
        warning "Weak traceability for $hook - not found in any DORA metric section"
        TRACEABILITY_ISSUES=$((TRACEABILITY_ISSUES + 1))
    fi
done

if [ "$TRACEABILITY_ISSUES" -eq 0 ]; then
    success "All critical hooks have clear traceability to DORA metrics"
else
    warning "$TRACEABILITY_ISSUES hooks have weak traceability to metrics"
fi

echo ""

# ============================================================================
# Final summary
# ============================================================================

echo "========================================"
echo "VALIDATION SUMMARY"
echo "========================================"
echo "Total checks performed: $CHECKS"
echo -e "Errors: ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
    echo -e "${GREEN}✓ All validations passed! DORA metrics documentation is complete.${NC}"
    exit 0
elif [ "$ERRORS" -eq 0 ]; then
    echo -e "${YELLOW}⚠ Validations passed with $WARNINGS warnings.${NC}"
    echo "Consider addressing warnings for improved documentation quality."
    exit 0
else
    echo -e "${RED}✗ Validation failed with $ERRORS errors and $WARNINGS warnings.${NC}"
    echo "Please fix the errors above."
    exit 1
fi
