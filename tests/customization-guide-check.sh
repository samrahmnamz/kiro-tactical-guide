#!/bin/bash
# Task 27.6: Create customization guide validation tests
# This script validates that hooks and spec templates have proper customization guidance

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

EXIT_CODE=0
CHECKS_PASSED=0
CHECKS_FAILED=0

echo "=========================================="
echo "Customization Guide Validation"
echo "=========================================="
echo ""
echo "This test validates that all hooks and spec templates"
echo "include proper customization guidance for users."
echo ""

# ============================================
# Check 1: Hooks have CUSTOMIZE comments
# ============================================
echo "=========================================="
echo "Check 1: Hooks have customization guidance"
echo "=========================================="
echo ""

HOOKS_DIR="$PROJECT_ROOT/hooks"
if [ ! -d "$HOOKS_DIR" ]; then
    echo "⚠️  Warning: hooks/ directory not found at $HOOKS_DIR"
    echo "   Skipping hook checks"
    echo ""
else
    HOOKS_CHECKED=0
    HOOKS_WITH_GUIDE=0
    HOOKS_WITHOUT_GUIDE=0

    echo "Checking hooks for '# CUSTOMIZE:' or 'CUSTOMIZATION GUIDE' comments..."
    echo ""

    # Find all YAML hook files
    while IFS= read -r -d '' hook_file; do
        HOOKS_CHECKED=$((HOOKS_CHECKED + 1))
        hook_relative="${hook_file#$PROJECT_ROOT/}"
        
        # Check for customization guidance
        if grep -q "# CUSTOMIZE:" "$hook_file" || grep -q "CUSTOMIZATION GUIDE" "$hook_file"; then
            echo "  ✓ $hook_relative"
            HOOKS_WITH_GUIDE=$((HOOKS_WITH_GUIDE + 1))
        else
            echo "  ❌ $hook_relative - Missing customization guidance"
            HOOKS_WITHOUT_GUIDE=$((HOOKS_WITHOUT_GUIDE + 1))
            EXIT_CODE=1
        fi
    done < <(find "$HOOKS_DIR" -name "*.yaml" -type f -print0 2>/dev/null)

    echo ""
    echo "Hooks checked: $HOOKS_CHECKED"
    echo "  With guidance: $HOOKS_WITH_GUIDE"
    echo "  Without guidance: $HOOKS_WITHOUT_GUIDE"
    echo ""

    if [ $HOOKS_WITHOUT_GUIDE -eq 0 ] && [ $HOOKS_CHECKED -gt 0 ]; then
        echo "✅ All hooks have customization guidance"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    elif [ $HOOKS_CHECKED -eq 0 ]; then
        echo "⚠️  No hooks found to check"
    else
        echo "❌ $HOOKS_WITHOUT_GUIDE hook(s) missing customization guidance"
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
    fi
fi

echo ""

# ============================================
# Check 2: Spec templates have placeholders
# ============================================
echo "=========================================="
echo "Check 2: Spec templates have placeholders"
echo "=========================================="
echo ""

TEMPLATES_DIR="$PROJECT_ROOT/toolkit/specs/templates"
if [ ! -d "$TEMPLATES_DIR" ]; then
    # Try alternative location
    TEMPLATES_DIR="$PROJECT_ROOT/specs/templates"
fi

if [ ! -d "$TEMPLATES_DIR" ]; then
    echo "⚠️  Warning: spec templates directory not found"
    echo "   Tried: $PROJECT_ROOT/toolkit/specs/templates"
    echo "   Tried: $PROJECT_ROOT/specs/templates"
    echo "   Skipping spec template checks"
    echo ""
else
    TEMPLATES_CHECKED=0
    TEMPLATES_WITH_PLACEHOLDERS=0
    TEMPLATES_WITHOUT_PLACEHOLDERS=0

    echo "Checking spec templates for [YOUR_*] placeholders..."
    echo ""

    # Find all markdown spec template files
    while IFS= read -r -d '' template_file; do
        TEMPLATES_CHECKED=$((TEMPLATES_CHECKED + 1))
        template_relative="${template_file#$PROJECT_ROOT/}"
        
        # Check for [YOUR_*] placeholders
        if grep -q '\[YOUR_' "$template_file"; then
            # Count how many placeholders
            PLACEHOLDER_COUNT=$(grep -o '\[YOUR_[^]]*\]' "$template_file" | wc -l)
            echo "  ✓ $template_relative ($PLACEHOLDER_COUNT placeholders)"
            TEMPLATES_WITH_PLACEHOLDERS=$((TEMPLATES_WITH_PLACEHOLDERS + 1))
        else
            echo "  ❌ $template_relative - Missing [YOUR_*] placeholders"
            TEMPLATES_WITHOUT_PLACEHOLDERS=$((TEMPLATES_WITHOUT_PLACEHOLDERS + 1))
            EXIT_CODE=1
        fi
    done < <(find "$TEMPLATES_DIR" -name "*.md" -type f -print0 2>/dev/null)

    echo ""
    echo "Templates checked: $TEMPLATES_CHECKED"
    echo "  With placeholders: $TEMPLATES_WITH_PLACEHOLDERS"
    echo "  Without placeholders: $TEMPLATES_WITHOUT_PLACEHOLDERS"
    echo ""

    if [ $TEMPLATES_WITHOUT_PLACEHOLDERS -eq 0 ] && [ $TEMPLATES_CHECKED -gt 0 ]; then
        echo "✅ All spec templates have placeholders"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    elif [ $TEMPLATES_CHECKED -eq 0 ]; then
        echo "⚠️  No spec templates found to check"
    else
        echo "❌ $TEMPLATES_WITHOUT_PLACEHOLDERS template(s) missing placeholders"
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
    fi
fi

echo ""

# ============================================
# Check 3: Verify instructions are actionable
# ============================================
echo "=========================================="
echo "Check 3: Customization instructions are actionable"
echo "=========================================="
echo ""

# Check customization-patterns.md guide exists
CUSTOMIZATION_GUIDE="$PROJECT_ROOT/docs/customization-patterns.md"

if [ ! -f "$CUSTOMIZATION_GUIDE" ]; then
    echo "⚠️  Warning: customization-patterns.md not found at:"
    echo "   $CUSTOMIZATION_GUIDE"
    echo "   Skipping actionability checks"
    echo ""
else
    echo "Checking customization-patterns.md for actionable instructions..."
    echo ""
    
    ACTIONABLE=true
    
    # Check for code examples (indicates actionability)
    CODE_BLOCKS=$(grep -c '```' "$CUSTOMIZATION_GUIDE" || true)
    if [ "$CODE_BLOCKS" -ge 10 ]; then
        echo "  ✓ Contains code examples ($CODE_BLOCKS code blocks)"
    else
        echo "  ❌ Insufficient code examples ($CODE_BLOCKS code blocks, need ≥10)"
        ACTIONABLE=false
        EXIT_CODE=1
    fi
    
    # Check for validation commands
    VALIDATION_COMMANDS=$(grep -c "# Verify\|# Test\|# Check\|# Validate" "$CUSTOMIZATION_GUIDE" || true)
    if [ "$VALIDATION_COMMANDS" -ge 10 ]; then
        echo "  ✓ Contains validation commands ($VALIDATION_COMMANDS found)"
    else
        echo "  ❌ Insufficient validation commands ($VALIDATION_COMMANDS, need ≥10)"
        ACTIONABLE=false
        EXIT_CODE=1
    fi
    
    # Check for step-by-step instructions (numbered lists or "Step 1", "Step 2")
    STEP_INSTRUCTIONS=$(grep -c "^1\. \|^Step [0-9]\|## Step [0-9]" "$CUSTOMIZATION_GUIDE" || true)
    if [ "$STEP_INSTRUCTIONS" -ge 5 ]; then
        echo "  ✓ Contains step-by-step instructions ($STEP_INSTRUCTIONS sections)"
    else
        echo "  ⚠️  Limited step-by-step instructions ($STEP_INSTRUCTIONS sections)"
    fi
    
    # Check for common pitfalls (helps users avoid mistakes)
    PITFALLS=$(grep -c "Common pitfall\|⚠️\|Warning:" "$CUSTOMIZATION_GUIDE" || true)
    if [ "$PITFALLS" -ge 5 ]; then
        echo "  ✓ Documents common pitfalls ($PITFALLS warnings)"
    else
        echo "  ⚠️  Limited pitfall documentation ($PITFALLS warnings)"
    fi
    
    # Check for before/after examples (❌ vs ✅)
    BEFORE_AFTER=$(grep -c "❌\|✅" "$CUSTOMIZATION_GUIDE" || true)
    if [ "$BEFORE_AFTER" -ge 10 ]; then
        echo "  ✓ Contains before/after examples ($BEFORE_AFTER examples)"
    else
        echo "  ⚠️  Limited before/after examples ($BEFORE_AFTER examples)"
    fi
    
    echo ""
    
    if [ "$ACTIONABLE" = true ]; then
        echo "✅ Customization instructions are actionable"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        echo "❌ Customization instructions need improvement"
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
    fi
fi

echo ""

# ============================================
# Summary
# ============================================
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""

echo "Checks passed: $CHECKS_PASSED"
echo "Checks failed: $CHECKS_FAILED"
echo ""

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ CUSTOMIZATION GUIDE VALIDATION PASSED"
    echo ""
    echo "All hooks and spec templates have proper customization guidance:"
    echo "  ✓ Hooks contain '# CUSTOMIZE:' comments"
    echo "  ✓ Spec templates contain [YOUR_*] placeholders"
    echo "  ✓ Customization instructions are actionable"
    echo ""
    echo "Users can confidently customize the toolkit for their needs."
else
    echo "❌ CUSTOMIZATION GUIDE VALIDATION FAILED"
    echo ""
    echo "Issues found:"
    [ $HOOKS_WITHOUT_GUIDE -gt 0 ] && echo "  - $HOOKS_WITHOUT_GUIDE hook(s) missing customization guidance"
    [ $TEMPLATES_WITHOUT_PLACEHOLDERS -gt 0 ] && echo "  - $TEMPLATES_WITHOUT_PLACEHOLDERS template(s) missing placeholders"
    [ "$ACTIONABLE" = false ] && echo "  - Customization instructions not sufficiently actionable"
    echo ""
    echo "Please add customization guidance to the affected files."
fi

exit $EXIT_CODE
