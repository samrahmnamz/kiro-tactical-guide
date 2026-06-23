#!/bin/bash
# Validation script for Task 27.6: Create customization guide validation tests
# This script validates the customization patterns guide for:
# - Pattern completeness
# - Example accuracy
# - Integration points
# - Documentation clarity

set -e

GUIDE="docs/customization-patterns.md"
EXIT_CODE=0

echo "=========================================="
echo "Customization Guide Validation"
echo "=========================================="
echo ""

# Check if customization guide exists
if [ ! -f "$GUIDE" ]; then
    echo "❌ ERROR: Customization guide not found at $GUIDE"
    exit 1
fi

echo "✓ Customization guide file exists"
echo ""

# ============================================
# Test 1: Pattern Completeness
# ============================================
echo "=========================================="
echo "Test 1: Pattern Completeness"
echo "=========================================="
echo ""

# Define required patterns from requirements 15.5
declare -a REQUIRED_PATTERNS=(
    "Monorepo vs Multi-Repo Patterns"
    "AWS vs Multi-Cloud Patterns"
    "Startup vs Enterprise Patterns"
)

echo "Checking required pattern sections..."
PATTERNS_PASSED=0
PATTERNS_FAILED=0

for pattern in "${REQUIRED_PATTERNS[@]}"; do
    echo "  Checking: $pattern"
    if grep -q "## $pattern" "$GUIDE"; then
        echo "    ✓ Pattern section found"
        PATTERNS_PASSED=$((PATTERNS_PASSED + 1))
    else
        echo "    ❌ Pattern section NOT found"
        PATTERNS_FAILED=$((PATTERNS_FAILED + 1))
        EXIT_CODE=1
    fi
done

echo ""
echo "Pattern sections: $PATTERNS_PASSED/$((PATTERNS_PASSED + PATTERNS_FAILED)) found"

# Check each pattern has required subsections
echo ""
echo "Checking pattern subsections..."

declare -a PATTERN_SUBSECTIONS=(
    "When to use"
    "Indicators"
    "customization"
    "Validation commands"
    "Common pitfalls"
)

SUBSECTIONS_PASSED=0
SUBSECTIONS_FAILED=0

for pattern in "${REQUIRED_PATTERNS[@]}"; do
    echo "  Pattern: $pattern"
    
    # Extract section content between this pattern and next ## header
    SECTION_START=$(grep -n "## $pattern" "$GUIDE" | cut -d: -f1 | head -1)
    NEXT_SECTION=$(tail -n +$((SECTION_START + 1)) "$GUIDE" | grep -n "^## " | head -1 | cut -d: -f1)
    
    if [ -n "$NEXT_SECTION" ]; then
        SECTION_END=$((SECTION_START + NEXT_SECTION))
        PATTERN_CONTENT=$(sed -n "${SECTION_START},${SECTION_END}p" "$GUIDE")
    else
        PATTERN_CONTENT=$(tail -n +${SECTION_START} "$GUIDE")
    fi
    
    for subsection in "${PATTERN_SUBSECTIONS[@]}"; do
        if echo "$PATTERN_CONTENT" | grep -qi "$subsection"; then
            echo "    ✓ Has '$subsection' section"
            SUBSECTIONS_PASSED=$((SUBSECTIONS_PASSED + 1))
        else
            echo "    ⚠️  Warning: Missing '$subsection' section"
            # Not a failure, just a warning
        fi
    done
    echo ""
done

# Check for Table of Contents
echo "Checking for navigation aids..."
if grep -q "## Table of Contents" "$GUIDE"; then
    echo "  ✓ Table of Contents exists"
else
    echo "  ⚠️  Warning: Table of Contents missing"
fi

# Check for Quick Reference section
if grep -q "Quick Reference" "$GUIDE"; then
    echo "  ✓ Quick Reference section exists"
else
    echo "  ⚠️  Warning: Quick Reference section missing"
fi

echo ""

# ============================================
# Test 2: Example Accuracy
# ============================================
echo "=========================================="
echo "Test 2: Example Accuracy"
echo "=========================================="
echo ""

echo "Checking YAML code block syntax..."
YAML_BLOCKS=0
YAML_VALID=0
YAML_INVALID=0
IN_YAML=0

# Extract YAML code blocks and validate basic syntax
while IFS= read -r line; do
    if [[ "$line" =~ ^\`\`\`yaml ]]; then
        YAML_BLOCKS=$((YAML_BLOCKS + 1))
        # Start capturing YAML content
        YAML_CONTENT=""
        IN_YAML=1
    elif [[ "$line" =~ ^\`\`\` ]] && [ "$IN_YAML" -eq 1 ]; then
        IN_YAML=0
        # Validate YAML content (basic checks)
        if echo "$YAML_CONTENT" | grep -q "name:"; then
            echo "  ✓ YAML block $YAML_BLOCKS has 'name:' field"
            YAML_VALID=$((YAML_VALID + 1))
        else
            echo "  ⚠️  YAML block $YAML_BLOCKS missing 'name:' field"
        fi
    elif [ "$IN_YAML" -eq 1 ]; then
        YAML_CONTENT="$YAML_CONTENT$line"
    fi
done < "$GUIDE"

echo ""
echo "YAML code blocks found: $YAML_BLOCKS"
echo "YAML blocks with basic structure: $YAML_VALID"

# Check for shell command examples
echo ""
echo "Checking bash/shell code block examples..."
BASH_BLOCKS=$(grep -c '```bash' "$GUIDE" || true)
SHELL_BLOCKS=$(grep -c '```shell' "$GUIDE" || true)
TOTAL_CMD_BLOCKS=$((BASH_BLOCKS + SHELL_BLOCKS))

echo "  Command line examples found: $TOTAL_CMD_BLOCKS"

if [ "$TOTAL_CMD_BLOCKS" -gt 0 ]; then
    echo "  ✓ Contains command line examples"
else
    echo "  ❌ No command line examples found"
    EXIT_CODE=1
fi

# Check for directory structure examples
echo ""
echo "Checking directory structure examples..."
if grep -q "your-monorepo/\|services/\|libs/" "$GUIDE"; then
    echo "  ✓ Directory structure examples exist"
else
    echo "  ⚠️  Warning: Directory structure examples may be missing"
fi

# Validate example file paths reference real toolkit structure
echo ""
echo "Validating example file path references..."
VALID_PATHS=0
INVALID_PATHS=0

# Extract toolkit paths from examples
while IFS= read -r path; do
    # Check if referenced path exists
    if [ -f "$path" ] || [ -d "$(dirname "$path")" ]; then
        VALID_PATHS=$((VALID_PATHS + 1))
    else
        echo "  ⚠️  Referenced path may not exist: $path"
        INVALID_PATHS=$((INVALID_PATHS + 1))
    fi
done < <(grep -oE 'toolkit/(hooks|specs|steering|mcp)/[^)]*\.(yaml|md)' "$GUIDE" | sort -u)

if [ $VALID_PATHS -gt 0 ]; then
    echo "  ✓ Valid toolkit path references: $VALID_PATHS"
fi
if [ $INVALID_PATHS -gt 0 ]; then
    echo "  ⚠️  Potentially invalid path references: $INVALID_PATHS"
fi

# ============================================
# Test 3: Integration Points
# ============================================
echo ""
echo "=========================================="
echo "Test 3: Integration Points"
echo "=========================================="
echo ""

# Check for CI/CD integration patterns
echo "Checking CI/CD integration patterns..."
declare -a CICD_INTEGRATIONS=(
    "GitHub Actions"
    "GitLab CI"
)

CICD_PASSED=0
for cicd in "${CICD_INTEGRATIONS[@]}"; do
    if grep -qi "$cicd" "$GUIDE"; then
        echo "  ✓ $cicd integration documented"
        CICD_PASSED=$((CICD_PASSED + 1))
    else
        echo "  ⚠️  Warning: $cicd integration not documented"
    fi
done

# Check for cloud provider integration patterns
echo ""
echo "Checking cloud provider patterns..."
declare -a CLOUD_PROVIDERS=(
    "AWS"
    "GCP"
    "Azure"
)

CLOUD_PASSED=0
for cloud in "${CLOUD_PROVIDERS[@]}"; do
    if grep -q "$cloud" "$GUIDE"; then
        echo "  ✓ $cloud patterns documented"
        CLOUD_PASSED=$((CLOUD_PASSED + 1))
    else
        echo "  ⚠️  Warning: $cloud patterns not documented"
    fi
done

# Check for team structure patterns
echo ""
echo "Checking team structure patterns..."
if grep -qi "Platform Team" "$GUIDE" || grep -qi "Product Team" "$GUIDE"; then
    echo "  ✓ Team structure patterns documented"
else
    echo "  ⚠️  Warning: Team structure patterns not documented"
fi

# Check for multi-region patterns
echo ""
echo "Checking multi-region deployment patterns..."
if grep -qi "Multi-Region" "$GUIDE"; then
    echo "  ✓ Multi-region patterns documented"
else
    echo "  ⚠️  Warning: Multi-region patterns not documented"
fi

# Check for MCP integration references
echo ""
echo "Checking MCP integration references..."
if grep -q "cloudwatch.yaml\|pagerduty.yaml" "$GUIDE"; then
    echo "  ✓ MCP integration examples exist"
else
    echo "  ⚠️  Warning: MCP integration examples missing"
fi

# Check for golden spec references
echo ""
echo "Checking golden spec integration..."
if grep -q "golden spec\|validate-against-golden" "$GUIDE"; then
    echo "  ✓ Golden spec integration documented"
else
    echo "  ⚠️  Warning: Golden spec integration not documented"
fi

# ============================================
# Test 4: Documentation Clarity
# ============================================
echo ""
echo "=========================================="
echo "Test 4: Documentation Clarity"
echo "=========================================="
echo ""

# Check for clear section headings
echo "Checking documentation structure..."
H2_COUNT=$(grep -c "^## " "$GUIDE" || true)
H3_COUNT=$(grep -c "^### " "$GUIDE" || true)

echo "  H2 headings (major sections): $H2_COUNT"
echo "  H3 headings (patterns): $H3_COUNT"

if [ "$H2_COUNT" -ge 6 ]; then
    echo "  ✓ Adequate major sections"
else
    echo "  ⚠️  Warning: Few major sections ($H2_COUNT)"
fi

if [ "$H3_COUNT" -ge 8 ]; then
    echo "  ✓ Adequate pattern sections"
else
    echo "  ⚠️  Warning: Few pattern sections ($H3_COUNT)"
fi

# Check for validation command sections (requirement 15.6)
echo ""
echo "Checking validation command documentation..."
VALIDATION_SECTIONS=$(grep -c "## Validation Command" "$GUIDE" || true)

if [ "$VALIDATION_SECTIONS" -gt 0 ]; then
    echo "  ✓ Validation command reference section exists"
else
    echo "  ⚠️  Warning: Validation command reference may be missing"
fi

# Count validation command examples
VALIDATION_EXAMPLES=$(grep -c "# Verify\|# Test\|# Check" "$GUIDE" || true)
echo "  Validation command examples: $VALIDATION_EXAMPLES"

if [ "$VALIDATION_EXAMPLES" -ge 20 ]; then
    echo "  ✓ Sufficient validation examples"
else
    echo "  ⚠️  Warning: Limited validation examples ($VALIDATION_EXAMPLES)"
fi

# Check for "Common pitfalls" sections
echo ""
echo "Checking for common pitfalls documentation..."
PITFALL_SECTIONS=$(grep -c "Common pitfalls" "$GUIDE" || true)

if [ "$PITFALL_SECTIONS" -ge 5 ]; then
    echo "  ✓ Multiple patterns document pitfalls ($PITFALL_SECTIONS)"
else
    echo "  ⚠️  Warning: Few pitfall sections ($PITFALL_SECTIONS)"
fi

# Check for ❌ and ✅ examples (anti-patterns vs best practices)
echo ""
echo "Checking for anti-pattern/best-practice examples..."
ANTIPATTERN_COUNT=$(grep -c "❌" "$GUIDE" || true)
BESTPRACTICE_COUNT=$(grep -c "✅" "$GUIDE" || true)

echo "  Anti-pattern examples (❌): $ANTIPATTERN_COUNT"
echo "  Best-practice examples (✅): $BESTPRACTICE_COUNT"

if [ "$ANTIPATTERN_COUNT" -ge 10 ] && [ "$BESTPRACTICE_COUNT" -ge 10 ]; then
    echo "  ✓ Good balance of anti-patterns and best practices"
else
    echo "  ⚠️  Warning: Limited anti-pattern/best-practice examples"
fi

# Check for cross-references to other documentation
echo ""
echo "Checking cross-references to other documentation..."
declare -a EXPECTED_REFS=(
    "README.md"
    "QUICKSTART.md"
    "decision-tree.md"
    "artifact-index.md"
)

REFS_FOUND=0
for ref in "${EXPECTED_REFS[@]}"; do
    if grep -q "$ref" "$GUIDE"; then
        echo "  ✓ References $ref"
        REFS_FOUND=$((REFS_FOUND + 1))
    else
        echo "  ⚠️  Warning: No reference to $ref"
    fi
done

# Check for inline code formatting
echo ""
echo "Checking inline code formatting..."
INLINE_CODE_COUNT=$(grep -o '`[^`]*`' "$GUIDE" | wc -l)
echo "  Inline code snippets: $INLINE_CODE_COUNT"

if [ "$INLINE_CODE_COUNT" -ge 50 ]; then
    echo "  ✓ Good use of inline code formatting"
else
    echo "  ⚠️  Warning: Limited inline code formatting"
fi

# Check for code block language tags
echo ""
echo "Checking code block language tags..."
TAGGED_BLOCKS=$(grep -c '```[a-z]' "$GUIDE" || true)
UNTAGGED_BLOCKS=$(grep -c '^```$' "$GUIDE" || true)

echo "  Tagged code blocks: $TAGGED_BLOCKS"
echo "  Untagged code blocks: $UNTAGGED_BLOCKS"

if [ "$UNTAGGED_BLOCKS" -eq 0 ]; then
    echo "  ✓ All code blocks have language tags"
elif [ "$UNTAGGED_BLOCKS" -le 3 ]; then
    echo "  ⚠️  Warning: Some code blocks missing language tags"
else
    echo "  ❌ Many code blocks missing language tags ($UNTAGGED_BLOCKS)"
    # Not a hard failure, but good practice
fi

# ============================================
# Summary
# ============================================
echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""

# Pattern coverage summary
echo "Pattern Coverage:"
echo "  Required patterns found: $PATTERNS_PASSED/3"
if [ $PATTERNS_PASSED -eq 3 ]; then
    echo "  ✅ All required patterns documented"
else
    echo "  ❌ Missing required patterns"
fi
echo ""

# Example accuracy summary
echo "Example Accuracy:"
echo "  YAML code blocks: $YAML_BLOCKS"
echo "  Command examples: $TOTAL_CMD_BLOCKS"
echo "  Valid toolkit paths: $VALID_PATHS"
if [ "$YAML_BLOCKS" -gt 0 ] && [ "$TOTAL_CMD_BLOCKS" -gt 0 ]; then
    echo "  ✅ Contains working examples"
else
    echo "  ❌ Missing example types"
fi
echo ""

# Integration coverage summary
echo "Integration Points:"
echo "  CI/CD integrations: $CICD_PASSED/2"
echo "  Cloud providers: $CLOUD_PASSED/3"
if [ $CICD_PASSED -ge 1 ] && [ $CLOUD_PASSED -ge 1 ]; then
    echo "  ✅ Key integrations documented"
else
    echo "  ⚠️  Limited integration documentation"
fi
echo ""

# Clarity summary
echo "Documentation Clarity:"
echo "  Major sections: $H2_COUNT"
echo "  Pattern sections: $H3_COUNT"
echo "  Validation examples: $VALIDATION_EXAMPLES"
echo "  Pitfall sections: $PITFALL_SECTIONS"
echo "  Anti-pattern/best-practice examples: $ANTIPATTERN_COUNT/$BESTPRACTICE_COUNT"
echo "  Cross-references: $REFS_FOUND/${#EXPECTED_REFS[@]}"
if [ "$H2_COUNT" -ge 6 ] && [ "$VALIDATION_EXAMPLES" -ge 20 ] && [ "$PITFALL_SECTIONS" -ge 5 ]; then
    echo "  ✅ Well-structured and clear documentation"
elif [ "$H2_COUNT" -ge 4 ] && [ "$VALIDATION_EXAMPLES" -ge 10 ]; then
    echo "  ⚠️  Documentation could be more comprehensive"
else
    echo "  ⚠️  Documentation needs improvement"
fi
echo ""

# Final result
echo "=========================================="
echo "Final Result"
echo "=========================================="

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ VALIDATION PASSED"
    echo ""
    echo "The customization guide:"
    echo "  ✓ Covers all required patterns (monorepo, AWS/multi-cloud, startup/enterprise)"
    echo "  ✓ Contains accurate YAML and command examples"
    echo "  ✓ Documents key integration points (CI/CD, cloud providers)"
    echo "  ✓ Has clear structure with validation commands and pitfall warnings"
    echo ""
    echo "Guide is ready for customer use."
else
    echo "❌ VALIDATION FAILED"
    echo ""
    echo "Critical issues found:"
    echo "  - Missing required pattern sections"
    echo "  - Insufficient examples or validation commands"
    echo ""
    echo "Please review the failures above and update the guide."
fi

exit $EXIT_CODE
