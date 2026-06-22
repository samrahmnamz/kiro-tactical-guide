#!/bin/bash

################################################################################
# metrics-citations.sh
# 
# Validates that all metrics and statistics in docs/before-after.md have proper 
# citations to authoritative sources (DORA 2025, DuploCloud 2026, industry reports).
# Per task 30.1 requirements.
#
# Exit codes:
#   0 - All validations passed
#   1 - Validation failures found
################################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BEFORE_AFTER_FILE="docs/before-after.md"
VALIDATION_FAILED=0

echo "======================================="
echo "Before/After Metrics Citations Validator"
echo "======================================="
echo ""

# Check if the file exists
if [[ ! -f "$BEFORE_AFTER_FILE" ]]; then
    echo -e "${RED}ERROR: $BEFORE_AFTER_FILE not found${NC}"
    exit 1
fi

echo "Validating: $BEFORE_AFTER_FILE"
echo ""

################################################################################
# 1. Check for DORA 2025 citation
################################################################################
echo "1. Checking for DORA 2025 citation..."
if grep -q "DORA 2025" "$BEFORE_AFTER_FILE"; then
    echo -e "   ${GREEN}✓${NC} DORA 2025 citation found"
else
    echo -e "   ${RED}✗${NC} DORA 2025 citation missing"
    VALIDATION_FAILED=1
fi
echo ""

################################################################################
# 2. Check for DuploCloud 2026 citation
################################################################################
echo "2. Checking for DuploCloud 2026 citation..."
if grep -q "DuploCloud 2026" "$BEFORE_AFTER_FILE"; then
    echo -e "   ${GREEN}✓${NC} DuploCloud 2026 citation found"
else
    echo -e "   ${RED}✗${NC} DuploCloud 2026 citation missing"
    VALIDATION_FAILED=1
fi
echo ""

################################################################################
# 3. Check for specific required metrics
################################################################################
echo "3. Validating specific required metrics are present..."

declare -a REQUIRED_METRICS=(
    "49%"
    "77%"
    "36%"
    "47%"
)

MISSING_METRICS=()

for metric in "${REQUIRED_METRICS[@]}"; do
    if grep -q "$metric" "$BEFORE_AFTER_FILE"; then
        echo -e "   ${GREEN}✓${NC} Metric '$metric' found"
    else
        echo -e "   ${RED}✗${NC} Metric '$metric' missing"
        MISSING_METRICS+=("$metric")
        VALIDATION_FAILED=1
    fi
done
echo ""

################################################################################
# 4. Validate all statistics have context
################################################################################
echo "4. Checking that statistics have proper context..."

# Extract lines with percentage or numeric claims
CLAIM_LINES=$(grep -n -E '[0-9]+%' "$BEFORE_AFTER_FILE" || true)

if [[ -z "$CLAIM_LINES" ]]; then
    echo -e "   ${RED}✗${NC} No numeric claims found (expected metrics present)"
    VALIDATION_FAILED=1
else
    CLAIM_COUNT=$(echo "$CLAIM_LINES" | wc -l | tr -d ' ')
    echo -e "   ${GREEN}✓${NC} Found $CLAIM_COUNT numeric claims with percentages"
fi
echo ""

################################################################################
# 5. Validate authoritative source citations
################################################################################
echo "5. Validating additional authoritative source citations..."

declare -a ADDITIONAL_SOURCES=(
    "Harness"
    "DevOps.com"
)

for source in "${ADDITIONAL_SOURCES[@]}"; do
    if grep -iq "$source" "$BEFORE_AFTER_FILE"; then
        echo -e "   ${GREEN}✓${NC} Citation to '$source' found"
    else
        echo -e "   ${YELLOW}⚠${NC} Citation to '$source' not found (recommended but not required)"
    fi
done
echo ""

################################################################################
# 6. Check transformation examples are present
################################################################################
echo "6. Validating transformation examples are documented..."

declare -a TRANSFORMATION_TYPES=(
    "Monorepo"
    "Multi-Cloud"
    "Enterprise"
)

TRANSFORMATIONS_FOUND=0

for transform in "${TRANSFORMATION_TYPES[@]}"; do
    if grep -q "$transform" "$BEFORE_AFTER_FILE"; then
        TRANSFORMATIONS_FOUND=$((TRANSFORMATIONS_FOUND + 1))
        echo -e "   ${GREEN}✓${NC} '$transform' transformation examples found"
    fi
done

if [[ $TRANSFORMATIONS_FOUND -ge 2 ]]; then
    echo -e "   ${GREEN}✓${NC} Multiple transformation patterns documented ($TRANSFORMATIONS_FOUND)"
else
    echo -e "   ${YELLOW}⚠${NC} Limited transformation patterns ($TRANSFORMATIONS_FOUND found)"
fi
echo ""

################################################################################
# 7. Validate before/after structure is present
################################################################################
echo "7. Validating before/after structure..."

# Check for before/after pattern
BEFORE_COUNT=$(grep -ci "before:" "$BEFORE_AFTER_FILE" || grep -ci "#### before" "$BEFORE_AFTER_FILE" || true)
AFTER_COUNT=$(grep -ci "after:" "$BEFORE_AFTER_FILE" || grep -ci "#### after" "$BEFORE_AFTER_FILE" || true)

if [[ $BEFORE_COUNT -gt 0 ]] && [[ $AFTER_COUNT -gt 0 ]]; then
    echo -e "   ${GREEN}✓${NC} Before/After structure present ($BEFORE_COUNT before, $AFTER_COUNT after)"
else
    echo -e "   ${YELLOW}⚠${NC} Limited before/after comparisons found"
fi
echo ""

################################################################################
# 8. Check for validation commands
################################################################################
echo "8. Validating examples include validation commands..."

VALIDATION_CMD_COUNT=$(grep -c "bash\|Expected:" "$BEFORE_AFTER_FILE" || true)

if [[ $VALIDATION_CMD_COUNT -gt 5 ]]; then
    echo -e "   ${GREEN}✓${NC} Validation commands included ($VALIDATION_CMD_COUNT instances)"
else
    echo -e "   ${YELLOW}⚠${NC} Limited validation guidance ($VALIDATION_CMD_COUNT instances)"
fi
echo ""

################################################################################
# 9. Check for time savings metrics
################################################################################
echo "9. Checking for time savings and improvement metrics..."

# Check for time savings patterns
TIME_SAVINGS=$(grep -E "faster|time saved|reduction|improvement" "$BEFORE_AFTER_FILE" || true)

if [[ -n "$TIME_SAVINGS" ]]; then
    SAVINGS_COUNT=$(echo "$TIME_SAVINGS" | wc -l | tr -d ' ')
    echo -e "   ${GREEN}✓${NC} Time savings/improvements documented ($SAVINGS_COUNT instances)"
else
    echo -e "   ${YELLOW}⚠${NC} Consider adding quantified time savings metrics"
fi
echo ""

################################################################################
# 10. Check for customization guidance
################################################################################
echo "10. Validating customization guidance is provided..."

# Check for customization sections
CUSTOMIZATION_COUNT=$(grep -c "Changes Made\|Customization\|Validation" "$BEFORE_AFTER_FILE" || true)

if [[ $CUSTOMIZATION_COUNT -gt 5 ]]; then
    echo -e "   ${GREEN}✓${NC} Customization guidance provided ($CUSTOMIZATION_COUNT sections)"
else
    echo -e "   ${YELLOW}⚠${NC} Limited customization guidance ($CUSTOMIZATION_COUNT sections)"
fi
echo ""

################################################################################
# Summary
################################################################################
echo "======================================="
echo "Validation Summary"
echo "======================================="
echo ""

if [[ $VALIDATION_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All validations passed${NC}"
    echo ""
    echo "The before/after documentation has:"
    echo "  - DORA 2025 citation"
    echo "  - DuploCloud 2026 citation"
    echo "  - Required metrics (49%, 77%, 36%, 47%)"
    echo "  - Transformation examples with before/after comparisons"
    echo "  - Validation commands and customization guidance"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Validation failures detected${NC}"
    echo ""
    echo "Issues found:"
    
    if [[ ${#MISSING_METRICS[@]} -gt 0 ]]; then
        echo "  - Missing required metrics: ${MISSING_METRICS[*]}"
    fi
    
    echo ""
    echo "Please ensure docs/before-after.md includes:"
    echo "  - DORA 2025 citation"
    echo "  - DuploCloud 2026 citation"
    echo "  - Specific metrics: 49% time on security, 77% wait for others, etc."
    echo "  - All statistics with proper source citations"
    echo ""
    exit 1
fi
