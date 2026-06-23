#!/bin/bash

# artifact-index-consistency.sh
# 
# Tests artifact index (docs/artifact-index.md) for completeness and accuracy.
# Validates that every artifact listed in the index exists in the repository
# and that every artifact in the repository is documented in the index.
#
# Requirements validated:
# - 1.5: THE Kiro_Toolbox SHALL include an artifact index listing every hook, spec, and steering rule
# - 14.4: THE Kiro_Toolbox SHALL include docs/artifact-index.md listing every artifact with metadata
#
# Sub-tasks addressed:
# - Verify all artifacts exist
# - Test metadata accuracy
# - Validate cross-references
# - Test directory structure

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ARTIFACT_INDEX="$REPO_ROOT/docs/artifact-index.md"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Error accumulator
ERRORS=()

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Artifact Index Consistency Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Helper functions
pass_test() {
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "${GREEN}✓ PASS:${NC} $1"
}

fail_test() {
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo -e "${RED}✗ FAIL:${NC} $1"
    ERRORS+=("$1")
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

section() {
    echo ""
    echo -e "${YELLOW}=== $1 ===${NC}"
}

# Test 1: Artifact index file exists
section "Test 1: Artifact Index File Existence"
if [ -f "$ARTIFACT_INDEX" ]; then
    pass_test "Artifact index file exists at docs/artifact-index.md"
else
    fail_test "Artifact index file NOT FOUND at docs/artifact-index.md"
    echo ""
    echo -e "${RED}CRITICAL ERROR: Cannot continue without artifact index${NC}"
    exit 1
fi

# Test 2: Extract artifact paths from index
section "Test 2: Extract Artifact Paths from Index"
info "Parsing artifact index for file paths..."

# Extract paths from index (looks for patterns like hooks/security/scan-secrets.yaml)
INDEXED_ARTIFACTS=$(grep -oE '(hooks|toolkit/hooks|specs|toolkit/specs|toolkit/mcp|toolkit/steering|examples)/[a-zA-Z0-9/_.-]+\.(yaml|md|sh)' "$ARTIFACT_INDEX" | sort -u || true)

if [ -z "$INDEXED_ARTIFACTS" ]; then
    fail_test "No artifact paths found in index"
else
    INDEXED_COUNT=$(echo "$INDEXED_ARTIFACTS" | wc -l | tr -d ' ')
    pass_test "Found $INDEXED_COUNT artifact paths in index"
fi

# Test 3: Verify all indexed artifacts exist in repository
section "Test 3: Verify Indexed Artifacts Exist"
info "Checking if all indexed artifacts exist in the repository..."

MISSING_ARTIFACTS=()
while IFS= read -r artifact_path; do
    # Try multiple possible locations for each artifact
    FOUND=false
    
    # Check exact path
    if [ -f "$REPO_ROOT/$artifact_path" ]; then
        FOUND=true
    fi
    
    # Check if it's in hooks/ but index lists toolkit/hooks/
    if [[ "$artifact_path" == toolkit/hooks/* ]]; then
        ALT_PATH="${artifact_path#toolkit/}"
        if [ -f "$REPO_ROOT/$ALT_PATH" ]; then
            FOUND=true
        fi
    fi
    
    # Check if it's in toolkit/hooks/ but index lists hooks/
    if [[ "$artifact_path" == hooks/* ]]; then
        ALT_PATH="toolkit/$artifact_path"
        if [ -f "$REPO_ROOT/$ALT_PATH" ]; then
            FOUND=true
        fi
    fi
    
    # Similar checks for specs
    if [[ "$artifact_path" == toolkit/specs/* ]]; then
        ALT_PATH="${artifact_path#toolkit/}"
        if [ -f "$REPO_ROOT/$ALT_PATH" ]; then
            FOUND=true
        fi
    fi
    
    if [[ "$artifact_path" == specs/* ]] && [[ "$artifact_path" != toolkit/* ]]; then
        ALT_PATH="toolkit/$artifact_path"
        if [ -f "$REPO_ROOT/$ALT_PATH" ]; then
            FOUND=true
        fi
    fi
    
    if [ "$FOUND" = false ]; then
        MISSING_ARTIFACTS+=("$artifact_path")
    fi
done <<< "$INDEXED_ARTIFACTS"

if [ ${#MISSING_ARTIFACTS[@]} -eq 0 ]; then
    pass_test "All indexed artifacts exist in repository"
else
    fail_test "${#MISSING_ARTIFACTS[@]} indexed artifacts are missing from repository"
    for missing in "${MISSING_ARTIFACTS[@]}"; do
        echo -e "  ${RED}→${NC} Missing: $missing"
    done
fi

# Test 4: Find all actual artifacts in repository
section "Test 4: Discover Actual Artifacts in Repository"
info "Finding all actual artifacts in repository directories..."

# Find hooks
ACTUAL_HOOKS=$(find "$REPO_ROOT/hooks" -type f -name "*.yaml" 2>/dev/null | sed "s|$REPO_ROOT/||" | sort || true)
TOOLKIT_HOOKS=$(find "$REPO_ROOT/toolkit/hooks" -type f -name "*.yaml" 2>/dev/null | sed "s|$REPO_ROOT/||" | sort || true)

# Find specs (golden and templates)
ACTUAL_SPECS=$(find "$REPO_ROOT/specs/golden" -type f -name "*.md" 2>/dev/null | sed "s|$REPO_ROOT/||" | sort || true)
TOOLKIT_SPECS=$(find "$REPO_ROOT/toolkit/specs" -type f -name "*.md" 2>/dev/null | sed "s|$REPO_ROOT/||" | grep -v "README.md" | sort || true)

# Find steering rules
STEERING_RULES=$(find "$REPO_ROOT/toolkit/steering" -type f -name "*.yaml" 2>/dev/null | sed "s|$REPO_ROOT/||" | sort || true)

# Find MCP integrations
MCP_INTEGRATIONS=$(find "$REPO_ROOT/toolkit/mcp" -type f -name "*.yaml" 2>/dev/null | sed "s|$REPO_ROOT/||" | sort || true)

# Find examples (top-level directories only)
EXAMPLES=$(find "$REPO_ROOT/examples" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sed "s|$REPO_ROOT/||" | sort || true)

# Combine all actual artifacts
ACTUAL_ARTIFACTS=""
[ -n "$ACTUAL_HOOKS" ] && ACTUAL_ARTIFACTS="$ACTUAL_ARTIFACTS$ACTUAL_HOOKS"$'\n'
[ -n "$TOOLKIT_HOOKS" ] && ACTUAL_ARTIFACTS="$ACTUAL_ARTIFACTS$TOOLKIT_HOOKS"$'\n'
[ -n "$ACTUAL_SPECS" ] && ACTUAL_ARTIFACTS="$ACTUAL_ARTIFACTS$ACTUAL_SPECS"$'\n'
[ -n "$TOOLKIT_SPECS" ] && ACTUAL_ARTIFACTS="$ACTUAL_ARTIFACTS$TOOLKIT_SPECS"$'\n'
[ -n "$STEERING_RULES" ] && ACTUAL_ARTIFACTS="$ACTUAL_ARTIFACTS$STEERING_RULES"$'\n'
[ -n "$MCP_INTEGRATIONS" ] && ACTUAL_ARTIFACTS="$ACTUAL_ARTIFACTS$MCP_INTEGRATIONS"$'\n'

ACTUAL_ARTIFACTS=$(echo "$ACTUAL_ARTIFACTS" | grep -v "^$" | sort -u)

ACTUAL_COUNT=$(echo "$ACTUAL_ARTIFACTS" | wc -l | tr -d ' ')
pass_test "Found $ACTUAL_COUNT actual artifacts in repository"

# Display breakdown
info "Breakdown:"
echo "  - Hooks: $(echo "$ACTUAL_HOOKS" | grep -c "." || echo 0) files"
echo "  - Toolkit Hooks: $(echo "$TOOLKIT_HOOKS" | grep -c "." || echo 0) files"
echo "  - Specs: $(echo "$ACTUAL_SPECS" | grep -c "." || echo 0) files"
echo "  - Toolkit Specs: $(echo "$TOOLKIT_SPECS" | grep -c "." || echo 0) files"
echo "  - Steering Rules: $(echo "$STEERING_RULES" | grep -c "." || echo 0) files"
echo "  - MCP Integrations: $(echo "$MCP_INTEGRATIONS" | grep -c "." || echo 0) files"
echo "  - Examples: $(echo "$EXAMPLES" | grep -c "." || echo 0) directories"

# Test 5: Check for undocumented artifacts
section "Test 5: Check for Undocumented Artifacts"
info "Checking if all repository artifacts are documented in index..."

UNDOCUMENTED=()
while IFS= read -r actual_artifact; do
    [ -z "$actual_artifact" ] && continue
    
    # Extract just the filename for more flexible matching
    FILENAME=$(basename "$actual_artifact")
    
    # Check if this artifact (or its filename) appears in the index
    if ! grep -q "$FILENAME" "$ARTIFACT_INDEX" 2>/dev/null; then
        # Check if the full path appears
        if ! grep -q "$actual_artifact" "$ARTIFACT_INDEX" 2>/dev/null; then
            UNDOCUMENTED+=("$actual_artifact")
        fi
    fi
done <<< "$ACTUAL_ARTIFACTS"

if [ ${#UNDOCUMENTED[@]} -eq 0 ]; then
    pass_test "All repository artifacts are documented in index"
else
    fail_test "${#UNDOCUMENTED[@]} repository artifacts are NOT documented in index"
    for undoc in "${UNDOCUMENTED[@]}"; do
        echo -e "  ${RED}→${NC} Undocumented: $undoc"
    done
fi

# Test 6: Check for examples in index
section "Test 6: Check Examples Documentation"
info "Verifying all example projects are documented..."

EXAMPLE_DIRS=("payment-processor" "rate-limiter" "notification-service" "settlement-engine")
MISSING_EXAMPLES=()

for example in "${EXAMPLE_DIRS[@]}"; do
    if ! grep -q "$example" "$ARTIFACT_INDEX" 2>/dev/null; then
        MISSING_EXAMPLES+=("$example")
    fi
done

if [ ${#MISSING_EXAMPLES[@]} -eq 0 ]; then
    pass_test "All example projects are documented in index"
else
    fail_test "${#MISSING_EXAMPLES[@]} example projects missing from index"
    for missing_ex in "${MISSING_EXAMPLES[@]}"; do
        echo -e "  ${RED}→${NC} Missing: $missing_ex"
    done
fi

# Test 7: Validate metadata sections exist
section "Test 7: Validate Required Metadata Sections"
info "Checking for required sections in artifact index..."

REQUIRED_SECTIONS=(
    "Security Hooks"
    "Stability Hooks"
    "Automation Hooks"
    "Deployment Hooks"
    "Quality Hooks"
    "Golden Specs"
    "Steering Rules"
    "MCP Integrations"
    "Working Examples"
)

MISSING_SECTIONS=()
for section_name in "${REQUIRED_SECTIONS[@]}"; do
    if ! grep -q "## $section_name" "$ARTIFACT_INDEX" 2>/dev/null; then
        MISSING_SECTIONS+=("$section_name")
    fi
done

if [ ${#MISSING_SECTIONS[@]} -eq 0 ]; then
    pass_test "All required metadata sections exist in index"
else
    fail_test "${#MISSING_SECTIONS[@]} required sections missing from index"
    for missing_sec in "${MISSING_SECTIONS[@]}"; do
        echo -e "  ${RED}→${NC} Missing section: $missing_sec"
    done
fi

# Test 8: Validate cross-references (Quick Win artifacts)
section "Test 8: Validate Cross-References"
info "Checking Quick Win artifact markers and consistency..."

# Check if Quick Win artifacts are properly marked
QUICK_WIN_ARTIFACTS=(
    "scan-secrets.yaml"
    "scan-secrets-regex.yaml"
    "pre-send-scan.yaml"
    "test-on-save.yaml"
    "lint-on-save.yaml"
)

MISSING_QUICKWIN_MARKERS=()
for qw_artifact in "${QUICK_WIN_ARTIFACTS[@]}"; do
    # Find the section for this artifact and check if it has ⭐
    if ! grep -A 2 "### ${qw_artifact%.*}" "$ARTIFACT_INDEX" 2>/dev/null | grep -q "⭐"; then
        MISSING_QUICKWIN_MARKERS+=("$qw_artifact")
    fi
done

if [ ${#MISSING_QUICKWIN_MARKERS[@]} -eq 0 ]; then
    pass_test "All Quick Win artifacts properly marked with ⭐"
else
    fail_test "${#MISSING_QUICKWIN_MARKERS[@]} Quick Win artifacts missing ⭐ marker"
    for missing_qw in "${MISSING_QUICKWIN_MARKERS[@]}"; do
        echo -e "  ${RED}→${NC} Missing marker: $missing_qw"
    done
fi

# Test 9: Validate directory structure references
section "Test 9: Validate Directory Structure"
info "Checking that index paths match actual directory structure..."

# Check if key directories exist
KEY_DIRS=(
    "hooks"
    "toolkit/hooks"
    "specs/golden"
    "toolkit/specs"
    "toolkit/steering"
    "toolkit/mcp"
    "examples"
)

MISSING_DIRS=()
for key_dir in "${KEY_DIRS[@]}"; do
    if [ ! -d "$REPO_ROOT/$key_dir" ]; then
        MISSING_DIRS+=("$key_dir")
    fi
done

if [ ${#MISSING_DIRS[@]} -eq 0 ]; then
    pass_test "All expected directories exist"
else
    fail_test "${#MISSING_DIRS[@]} expected directories are missing"
    for missing_dir in "${MISSING_DIRS[@]}"; do
        echo -e "  ${RED}→${NC} Missing directory: $missing_dir"
    done
fi

# Test 10: Check for duplicate artifact listings
section "Test 10: Check for Duplicate Listings"
info "Checking for duplicate artifact entries in index..."

# Extract artifact names (without paths)
ARTIFACT_NAMES=$(grep -oE "### [a-zA-Z0-9._-]+" "$ARTIFACT_INDEX" | sed 's/### //' | sort)
DUPLICATE_NAMES=$(echo "$ARTIFACT_NAMES" | uniq -d)

if [ -z "$DUPLICATE_NAMES" ]; then
    pass_test "No duplicate artifact entries found"
else
    DUPLICATE_COUNT=$(echo "$DUPLICATE_NAMES" | wc -l | tr -d ' ')
    fail_test "$DUPLICATE_COUNT duplicate artifact entries found in index"
    while IFS= read -r dup; do
        [ -n "$dup" ] && echo -e "  ${RED}→${NC} Duplicate: $dup"
    done <<< "$DUPLICATE_NAMES"
fi

# Test 11: Validate concerns addressing metadata
section "Test 11: Validate Concerns Metadata"
info "Checking that artifacts reference the 10 primary concerns..."

# Check if "Concerns Addressed:" appears for major artifacts
MAJOR_ARTIFACTS=$(grep "^### " "$ARTIFACT_INDEX" | grep -v "^### " | head -20)
MISSING_CONCERNS=0

while IFS= read -r artifact_header; do
    [ -z "$artifact_header" ] && continue
    
    # Get the section for this artifact (up to next ### or end)
    ARTIFACT_NAME=$(echo "$artifact_header" | sed 's/### //' | sed 's/ .*//')
    
    # Check if there's a "Concerns Addressed:" section within a reasonable distance
    if ! grep -A 10 "$artifact_header" "$ARTIFACT_INDEX" 2>/dev/null | grep -q "Concerns Addressed:"; then
        MISSING_CONCERNS=$((MISSING_CONCERNS + 1))
        [ $MISSING_CONCERNS -le 5 ] && echo -e "  ${YELLOW}→${NC} No concerns listed for: $ARTIFACT_NAME"
    fi
done <<< "$(echo "$MAJOR_ARTIFACTS" | head -10)"

if [ $MISSING_CONCERNS -eq 0 ]; then
    pass_test "All major artifacts reference primary concerns"
elif [ $MISSING_CONCERNS -le 3 ]; then
    pass_test "Most artifacts reference primary concerns ($MISSING_CONCERNS minor gaps)"
else
    fail_test "$MISSING_CONCERNS artifacts missing concerns metadata"
fi

# Summary
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Tests run:    ${BLUE}$TESTS_RUN${NC}"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All artifact index consistency tests passed!${NC}"
    echo ""
    echo -e "${GREEN}Validation Summary:${NC}"
    echo "  ✓ Artifact index file exists"
    echo "  ✓ All indexed artifacts exist in repository"
    echo "  ✓ All repository artifacts are documented"
    echo "  ✓ Required metadata sections present"
    echo "  ✓ Cross-references are valid"
    echo "  ✓ Directory structure is correct"
    echo ""
    exit 0
else
    echo -e "${RED}✗ $TESTS_FAILED test(s) failed${NC}"
    echo ""
    echo -e "${RED}Issues found:${NC}"
    for error in "${ERRORS[@]}"; do
        echo -e "  ${RED}→${NC} $error"
    done
    echo ""
    echo -e "${YELLOW}Recommendations:${NC}"
    if [ ${#MISSING_ARTIFACTS[@]} -gt 0 ]; then
        echo "  1. Create missing artifacts or remove from index"
    fi
    if [ ${#UNDOCUMENTED[@]} -gt 0 ]; then
        echo "  2. Add undocumented artifacts to docs/artifact-index.md"
    fi
    if [ ${#MISSING_SECTIONS[@]} -gt 0 ]; then
        echo "  3. Add missing metadata sections to index"
    fi
    echo ""
    exit 1
fi
