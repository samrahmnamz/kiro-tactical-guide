#!/bin/bash

# Hook Validation Test Suite
# This script validates hook YAML files for correct structure, syntax, and required fields
# Exit codes: 0 = all tests passed, 1 = one or more tests failed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$PROJECT_ROOT/hooks"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================"
echo "Hook Validation Test Suite"
echo "========================================"
echo ""

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0
HOOKS_TESTED=0

# Function to test hook file structure
test_hook_structure() {
  local hook_file=$1
  local hook_name=$(basename "$hook_file" .yaml)
  local category=$(basename "$(dirname "$hook_file")")
  
  echo "Testing: $category/$hook_name"
  echo "----------------------------------------"
  
  HOOKS_TESTED=$((HOOKS_TESTED + 1))
  local tests_in_hook=0
  local failures_in_hook=0
  
  # Test 1: File exists and is readable
  echo -n "  1. File exists and readable... "
  if [ -f "$hook_file" ] && [ -r "$hook_file" ]; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
    ((tests_in_hook++))
  else
    echo -e "${RED}✗${NC}"
    ((TESTS_FAILED++))
    ((failures_in_hook++))
    return 1
  fi
  
  # Test 2: Valid YAML syntax (using python or ruby)
  echo -n "  2. Valid YAML syntax... "
  if command -v python3 &> /dev/null && python3 -c "import yaml" 2>/dev/null; then
    if python3 -c "import yaml; yaml.safe_load(open('$hook_file'))" 2>/dev/null; then
      echo -e "${GREEN}✓${NC}"
      ((TESTS_PASSED++))
      ((tests_in_hook++))
    else
      echo -e "${RED}✗ Invalid YAML${NC}"
      ((TESTS_FAILED++))
      ((failures_in_hook++))
    fi
  elif command -v ruby &> /dev/null; then
    if ruby -ryaml -e "YAML.load_file('$hook_file')" 2>/dev/null; then
      echo -e "${GREEN}✓${NC}"
      ((TESTS_PASSED++))
      ((tests_in_hook++))
    else
      echo -e "${RED}✗ Invalid YAML${NC}"
      ((TESTS_FAILED++))
      ((failures_in_hook++))
    fi
  else
    # If no YAML parser available, do basic syntax check
    # Check for common YAML syntax errors
    if grep -q $'\\t' "$hook_file"; then
      echo -e "${RED}✗ Contains tabs (YAML requires spaces)${NC}"
      ((TESTS_FAILED++))
      ((failures_in_hook++))
    elif ! grep -v "^#" "$hook_file" | grep -v "^[[:space:]]*$" | grep -q "^[a-z_]"; then
      # Skip comments and blank lines, then check for valid YAML keys
      echo -e "${RED}✗ No valid YAML keys found${NC}"
      ((TESTS_FAILED++))
      ((failures_in_hook++))
    else
      echo -e "${YELLOW}⚠ Skipped (no YAML parser available)${NC}"
    fi
  fi
  
  # Test 3: Required field 'name' present
  echo -n "  3. Field 'name' present... "
  if grep -q "^name:" "$hook_file"; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
    ((tests_in_hook++))
  else
    echo -e "${RED}✗ Missing 'name' field${NC}"
    ((TESTS_FAILED++))
    ((failures_in_hook++))
  fi
  
  # Test 4: Required field 'description' present
  echo -n "  4. Field 'description' present... "
  if grep -q "^description:" "$hook_file"; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
    ((tests_in_hook++))
  else
    echo -e "${RED}✗ Missing 'description' field${NC}"
    ((TESTS_FAILED++))
    ((failures_in_hook++))
  fi
  
  # Test 5: Required section 'on' present
  echo -n "  5. Section 'on' present... "
  if grep -q "^on:" "$hook_file"; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
    ((tests_in_hook++))
  else
    echo -e "${RED}✗ Missing 'on' section${NC}"
    ((TESTS_FAILED++))
    ((failures_in_hook++))
  fi
  
  # Test 6: Required section 'run' present
  echo -n "  6. Section 'run' present... "
  if grep -q "^run:" "$hook_file"; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
    ((tests_in_hook++))
  else
    echo -e "${RED}✗ Missing 'run' section${NC}"
    ((TESTS_FAILED++))
    ((failures_in_hook++))
  fi
  
  # Test 7: Valid trigger types in 'on' section
  echo -n "  7. Valid trigger types... "
  local valid_triggers="file_save|fileEdited|spec_change|context_send|manual_trigger|promptSubmit|fileCreated|fileDeleted"
  if grep -A 10 "^on:" "$hook_file" | grep -qE "^\s+($valid_triggers):" ; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
    ((tests_in_hook++))
  else
    echo -e "${RED}✗ Invalid or missing trigger type${NC}"
    ((TESTS_FAILED++))
    ((failures_in_hook++))
  fi
  
  # Test 8: Valid run type (command or agent)
  echo -n "  8. Valid run type (command/agent)... "
  if grep -A 5 "^run:" "$hook_file" | grep -qE "^\s+(command|agent):" ; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
    ((tests_in_hook++))
  else
    echo -e "${RED}✗ Missing or invalid run type${NC}"
    ((TESTS_FAILED++))
    ((failures_in_hook++))
  fi
  
  # Test 9: on_failure field present and valid
  echo -n "  9. Field 'on_failure' valid... "
  if grep -q "^on_failure:" "$hook_file"; then
    local failure_mode=$(grep "^on_failure:" "$hook_file" | awk '{print $2}')
    if [[ "$failure_mode" =~ ^(block_context|warn|block_send)$ ]]; then
      echo -e "${GREEN}✓${NC}"
      ((TESTS_PASSED++))
      ((tests_in_hook++))
    else
      echo -e "${RED}✗ Invalid on_failure value: $failure_mode${NC}"
      ((TESTS_FAILED++))
      ((failures_in_hook++))
    fi
  else
    echo -e "${YELLOW}⚠ Missing 'on_failure' field (optional but recommended)${NC}"
  fi
  
  # Test 10: Customization guide present in comments
  echo -n "  10. Customization guide present... "
  if grep -q "CUSTOMIZATION GUIDE" "$hook_file" || grep -q "CUSTOMIZE:" "$hook_file"; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
    ((tests_in_hook++))
  else
    echo -e "${YELLOW}⚠ No customization guide found${NC}"
  fi
  
  # Test 11: If file_save trigger, check paths are defined
  echo -n "  11. File_save paths defined... "
  if grep -A 5 "^\s*file_save:" "$hook_file" | grep -q "paths:"; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
    ((tests_in_hook++))
  elif ! grep -q "file_save:" "$hook_file"; then
    echo -e "${BLUE}N/A (not file_save trigger)${NC}"
  else
    echo -e "${RED}✗ file_save without paths${NC}"
    ((TESTS_FAILED++))
    ((failures_in_hook++))
  fi
  
  # Test 12: If agent task, check approval field
  echo -n "  12. Agent task has approval field... "
  if grep -q "agent:" "$hook_file"; then
    # Look for approval field in the run section, not in comments
    if grep -A 20 "^run:" "$hook_file" | grep -q "^\s*approval:"; then
      local approval_mode=$(grep -A 20 "^run:" "$hook_file" | grep "^\s*approval:" | awk '{print $2}' | head -1)
      if [[ "$approval_mode" =~ ^(none|pr_review|manual)$ ]]; then
        echo -e "${GREEN}✓${NC}"
        ((TESTS_PASSED++))
        ((tests_in_hook++))
      else
        echo -e "${RED}✗ Invalid approval value: $approval_mode${NC}"
        ((TESTS_FAILED++))
        ((failures_in_hook++))
      fi
    else
      echo -e "${YELLOW}⚠ No approval field for agent task${NC}"
    fi
  else
    echo -e "${BLUE}N/A (command-based hook)${NC}"
  fi
  
  # Summary for this hook
  echo ""
  if [ $failures_in_hook -eq 0 ]; then
    echo -e "  ${GREEN}✓ Hook passed all tests${NC}"
  else
    echo -e "  ${RED}✗ Hook failed $failures_in_hook tests${NC}"
  fi
  echo ""
}

# Test Event Triggers
test_event_triggers() {
  echo "========================================"
  echo "Event Trigger Tests"
  echo "========================================"
  echo ""
  
  # Test 1: file_save triggers have valid path patterns
  echo "Test: file_save triggers have valid path patterns"
  echo "------------------------------------------------"
  local file_save_hooks=$(find "$HOOKS_DIR" -name "*.yaml" -exec grep -l "file_save:" {} \;)
  
  for hook in $file_save_hooks; do
    local hook_name=$(basename "$hook")
    echo -n "  $hook_name... "
    
    # Check if paths section exists and has at least one pattern
    if grep -A 10 "file_save:" "$hook" | grep -A 5 "paths:" | grep -q "^\s*-"; then
      echo -e "${GREEN}✓${NC}"
      ((TESTS_PASSED++))
    else
      echo -e "${RED}✗ No paths defined${NC}"
      ((TESTS_FAILED++))
    fi
  done
  echo ""
  
  # Test 2: context_send triggers have 'always' field
  echo "Test: context_send triggers configuration"
  echo "-----------------------------------------"
  local context_hooks=$(find "$HOOKS_DIR" -name "*.yaml" -exec grep -l "context_send:" {} \;)
  
  for hook in $context_hooks; do
    local hook_name=$(basename "$hook")
    echo -n "  $hook_name... "
    
    if grep -A 5 "context_send:" "$hook" | grep -q "always:"; then
      echo -e "${GREEN}✓${NC}"
      ((TESTS_PASSED++))
    else
      echo -e "${YELLOW}⚠ No 'always' field${NC}"
    fi
  done
  echo ""
}

# Test Action Execution
test_action_execution() {
  echo "========================================"
  echo "Action Execution Tests"
  echo "========================================"
  echo ""
  
  # Test 1: Command-based hooks have valid shell commands
  echo "Test: Command-based hooks have executable scripts"
  echo "------------------------------------------------"
  local command_hooks=$(find "$HOOKS_DIR" -name "*.yaml" -exec grep -l "command: |" {} \;)
  
  for hook in $command_hooks; do
    local hook_name=$(basename "$hook")
    echo -n "  $hook_name... "
    
    # Check if shebang is present in command block
    if grep -A 3 "command: |" "$hook" | grep -q "#!/bin/bash"; then
      echo -e "${GREEN}✓ Has shebang${NC}"
      ((TESTS_PASSED++))
    else
      echo -e "${YELLOW}⚠ No shebang${NC}"
    fi
  done
  echo ""
  
  # Test 2: Agent-based hooks have task descriptions
  echo "Test: Agent-based hooks have task descriptions"
  echo "----------------------------------------------"
  local agent_hooks=$(find "$HOOKS_DIR" -name "*.yaml" -exec grep -l "agent:" {} \;)
  
  for hook in $agent_hooks; do
    local hook_name=$(basename "$hook")
    echo -n "  $hook_name... "
    
    if grep -A 5 "agent:" "$hook" | grep -q "task:"; then
      echo -e "${GREEN}✓${NC}"
      ((TESTS_PASSED++))
    else
      echo -e "${RED}✗ No task description${NC}"
      ((TESTS_FAILED++))
    fi
  done
  echo ""
}

# Test Error Handling
test_error_handling() {
  echo "========================================"
  echo "Error Handling Tests"
  echo "========================================"
  echo ""
  
  # Test 1: All hooks have on_failure defined
  echo "Test: Hooks have on_failure behavior defined"
  echo "--------------------------------------------"
  local all_hooks=$(find "$HOOKS_DIR" -name "*.yaml")
  
  for hook in $all_hooks; do
    local hook_name=$(basename "$hook")
    echo -n "  $hook_name... "
    
    if grep -q "^on_failure:" "$hook"; then
      local failure_mode=$(grep "^on_failure:" "$hook" | awk '{print $2}')
      if [[ "$failure_mode" =~ ^(block_context|warn|block_send)$ ]]; then
        echo -e "${GREEN}✓ $failure_mode${NC}"
        ((TESTS_PASSED++))
      else
        echo -e "${RED}✗ Invalid: $failure_mode${NC}"
        ((TESTS_FAILED++))
      fi
    else
      echo -e "${YELLOW}⚠ Not defined${NC}"
    fi
  done
  echo ""
  
  # Test 2: Security hooks use appropriate failure modes
  echo "Test: Security hooks use blocking failure modes"
  echo "-----------------------------------------------"
  local security_hooks=$(find "$HOOKS_DIR/security" -name "*.yaml" 2>/dev/null || echo "")
  
  if [ -n "$security_hooks" ]; then
    for hook in $security_hooks; do
      local hook_name=$(basename "$hook")
      echo -n "  $hook_name... "
      
      if grep -q "^on_failure:" "$hook"; then
        local failure_mode=$(grep "^on_failure:" "$hook" | awk '{print $2}')
        if [[ "$failure_mode" =~ ^(block_context|block_send)$ ]]; then
          echo -e "${GREEN}✓ Uses blocking mode${NC}"
          ((TESTS_PASSED++))
        else
          echo -e "${YELLOW}⚠ Uses non-blocking mode: $failure_mode${NC}"
        fi
      else
        echo -e "${RED}✗ No failure mode defined${NC}"
        ((TESTS_FAILED++))
      fi
    done
  else
    echo "  No security hooks found to test"
  fi
  echo ""
}

# Main execution
echo "Scanning hooks directory: $HOOKS_DIR"
echo ""

# Find all hook YAML files
HOOK_FILES=$(find "$HOOKS_DIR" -name "*.yaml" -type f | sort)

if [ -z "$HOOK_FILES" ]; then
  echo -e "${RED}✗ No hook files found in $HOOKS_DIR${NC}"
  exit 1
fi

echo "Found $(echo "$HOOK_FILES" | wc -l) hook files"
echo ""

# Test each hook's structure
echo "========================================"
echo "Hook Structure Validation"
echo "========================================"
echo ""

for hook_file in $HOOK_FILES; do
  test_hook_structure "$hook_file"
done

# Run additional test categories
test_event_triggers
test_action_execution
test_error_handling

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Hooks Tested:  ${BLUE}$HOOKS_TESTED${NC}"
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

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  echo ""
  echo "All hook files are valid and follow the required structure."
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  echo ""
  echo "Please review the failures above and correct the hook files."
  exit 1
fi
