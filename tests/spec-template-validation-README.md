# Spec Template Validation Tests

## Overview

The `validate-spec-templates.sh` script validates the structure, format, and content of spec templates in the Kiro Cloud Engineering/DevOps Toolbox. This ensures that all spec templates maintain consistency, completeness, and adherence to the toolbox standards.

## Purpose

Spec templates are critical artifacts that developers copy and customize for their services and features. This validation suite ensures:

1. **Required sections are present** - All templates have the essential sections needed for complete specifications
2. **Metadata format is correct** - Templates include proper frontmatter/metadata for categorization and discovery
3. **Task format compliance** - Templates follow the ✓/✗/⚠ convention and Given-When-Then test format
4. **Optional sections are properly handled** - Optional sections are clearly marked with deletion instructions

## Test Suites

### Suite 1: Validate Required Sections Present (12 tests)

Verifies that each template type (service, feature, infrastructure) contains all required sections:

- **Intent** - One-sentence description of what and why
- **Contracts** - API endpoints, event schemas, data models
- **Constraints** - Security, performance, compliance, integration requirements
- **Design Decisions** - Rationale for architectural choices
- **Test Expectations** - Positive (✓), negative (✗), and edge (⚠) cases
- **Rollback Plan** - Trigger conditions, procedures, time targets

**Why it matters:** Missing sections lead to incomplete specifications that omit critical information like security constraints or rollback procedures.

### Suite 2: Test Metadata Format (6 tests)

Validates that templates include proper metadata fields:

- **Primary Concerns Addressed** - Which of the 10 concerns this addresses
- **Toolkit Artifacts Used** - References to hooks, golden specs, steering rules
- **Feature Type** - (Feature template only) New Feature, Enhancement, Bug Fix, Refactor
- **Parent Service** - (Feature template only) Service this feature belongs to

**Why it matters:** Metadata enables discovery and ensures templates reference relevant toolkit artifacts.

### Suite 3: Verify Task Format Compliance (9 tests)

Checks that templates follow standardized formats for tests and implementation examples:

- **✓ Positive test cases** - Must pass scenarios
- **✗ Negative test cases** - Must be rejected scenarios  
- **⚠ Edge case handling** - Boundary conditions, race conditions, timeouts
- **✓ CORRECT / ✗ WRONG examples** - Code examples showing right and wrong patterns
- **Given-When-Then format** - Structured test case descriptions
- **Validation checkmarks** - How each constraint is verified

**Why it matters:** Consistent test formatting makes specs easier to read and ensures completeness.

### Suite 4: Test Optional Section Handling (12 tests)

Validates that optional sections are properly marked and customization is documented:

- **CUSTOMIZATION GUIDE comments** - Inline instructions for adapting templates
- **Placeholder format** - Consistent [YOUR_*] bracketed placeholders
- **Deletion instructions** - Clear guidance on removing inapplicable sections
- **Optional sections clearly marked** - "if applicable", "Delete if", etc.
- **Golden spec references** - Links to organizational standards
- **Toolkit integration** - References to hooks and steering rules

**Why it matters:** Clear customization guidance ensures customers can adapt templates quickly without trial-and-error.

## Additional Validation Checks (12 tests)

Verifies template completeness and quality:

- API endpoint examples with HTTP methods and paths
- TypeScript schema examples for type safety
- Security constraints (IAM, PII, secrets)
- Rollback plans with trigger conditions
- Quick Start sections for developer onboarding
- Validation commands (bash examples)
- Success criteria and lessons learned sections

## Running the Tests

### Prerequisites

- Bash shell (macOS, Linux, or WSL on Windows)
- Templates must exist in `toolkit/specs/templates/`

### Execute

```bash
cd /path/to/kiro-cloudeng-devops
./tests/validate-spec-templates.sh
```

### Expected Output

```
========================================
Spec Template Validation Tests
========================================

Test Suite 1: Validate Required Sections Present
==================================================
✓ Service template has Intent section
✓ Service template has Contracts section
...

Test Suite 2: Test Metadata Format
===================================
✓ Service template has Primary Concerns metadata
...

Test Suite 3: Verify Task Format Compliance
============================================
✓ Service template has positive test cases (✓)
...

Test Suite 4: Test Optional Section Handling
==============================================
✓ Service template includes customization guide comments
...

========================================
Test Summary
========================================
Total tests: 43
Passed: 43
Failed: 0

All spec template validation tests passed!
```

### Exit Codes

- **0** - All tests passed
- **1** - One or more tests failed (failed tests listed in output)

## What Gets Validated

### Service Template (`service.spec.md`)

Required sections:
- Intent
- Contracts (API Endpoints, Event Processing, Data Models, Integration Points)
- Constraints (Security, Performance, Data Privacy, Compliance, Integration)
- Design Decisions (and why)
- Test Expectations (✓ Positive, ✗ Negative, ⚠ Edge Cases)
- Rollback Plan (Trigger Conditions, Procedure, Time Target)

Required metadata:
- Primary Concerns Addressed
- Toolkit Artifacts Used

Required format elements:
- ✓/✗ test case markers
- ✓ CORRECT / ✗ WRONG code examples
- Validation checkmarks
- [YOUR_SERVICE_NAME] placeholder
- CUSTOMIZATION GUIDE comments
- Optional section deletion instructions

### Feature Template (`feature.spec.md`)

Required sections:
- Intent
- Contracts (API Changes, Data Schema Changes, Event Schema)
- Constraints (Functional, Security, Performance, Compliance, Integration)
- Design Decisions (and why)
- Test Expectations (✓ Positive, ✗ Negative, ⚠ Edge Cases)
- Rollback Plan (Pre-Deployment Checklist, Deployment Strategy, Rollback Triggers)

Required metadata:
- Feature Type (New Feature | Enhancement | Bug Fix | Refactor)
- Parent Service
- Primary Concerns Addressed
- Toolkit Artifacts Used

Required format elements:
- ✓/✗/⚠ test case markers
- Given-When-Then test format
- ✓ CORRECT / ✗ WRONG code examples
- [YOUR_FEATURE_NAME] placeholder
- CUSTOMIZATION GUIDE comments
- Optional section deletion instructions ("Delete if", "if applicable")

### Infrastructure Template (`infrastructure.spec.md`)

Required sections:
- Intent

(Additional validation for infrastructure template can be expanded as the template matures)

## When to Run These Tests

### During Development

Run after making changes to any spec template to ensure:
- No required sections were accidentally removed
- New placeholders follow the [YOUR_*] convention
- Customization guides are updated
- New optional sections are marked for deletion

### In CI/CD

Include in pre-commit hooks or CI pipeline to:
- Catch template regressions before merge
- Ensure PRs modifying templates maintain standards
- Validate templates before release

### Before Release

Run as part of release validation to:
- Confirm all templates are complete
- Verify customer-facing quality
- Ensure Quick Start guide references valid templates

## Extending the Tests

### Adding New Template Types

To add validation for a new template type:

1. Add template existence check:
```bash
run_test "New template exists" \
    "test -f '$TEMPLATES_DIR/new-template.spec.md'"
```

2. Add required section checks:
```bash
run_test "New template has Required Section" \
    "section_exists '$TEMPLATES_DIR/new-template.spec.md' 'Required Section'"
```

3. Add metadata checks if applicable
4. Update the README with the new template's requirements

### Adding New Validation Rules

To add a new validation rule:

1. Add to appropriate test suite (or create new suite):
```bash
echo ""
echo "Test Suite N: New Validation Category"
echo "======================================"
echo ""

run_test "Test description" \
    "validation_command_here"
```

2. Update test count expectations in this README
3. Document what the new validation checks and why it matters

## Troubleshooting

### Test Fails: "Section not found"

**Cause:** Required section missing or section header doesn't match expected format

**Fix:** 
- Check section header is exactly `## Section Name` (two hashes, space, title)
- Case-sensitive match required
- No extra punctuation before/after section name

### Test Fails: "Placeholder not found"

**Cause:** Placeholder format doesn't match [YOUR_*] convention

**Fix:**
- Use square brackets: `[YOUR_SERVICE_NAME]` not `<YOUR_SERVICE_NAME>` or `{YOUR_SERVICE_NAME}`
- All caps after YOUR_: `[YOUR_NAME]` not `[your_name]`
- Include YOUR_ prefix: `[YOUR_FIELD]` not `[FIELD]`

### Test Fails: "Metadata field missing"

**Cause:** Metadata field not found or format incorrect

**Fix:**
- Use bold markdown: `**Field Name**:` or `> **Field Name**:`
- Include colon after field name
- Check spelling and capitalization exactly

### All Tests Pass but Template Has Issues

**Cause:** Validation tests don't cover every possible quality issue

**Action:**
- Add new test for the specific issue
- Consider manual review for subjective quality
- Expand test suites for comprehensive coverage

## Integration with Other Tests

This test suite is part of the broader validation framework:

- **`validate-hooks.sh`** - Validates YAML syntax and hook structure
- **`decision-tree-coverage.sh`** - Ensures decision tree covers all concerns
- **`artifact-index-consistency.sh`** - Cross-references artifact index with actual files
- **`secret-scanning/test-patterns.sh`** - Tests secret detection accuracy
- **Integration tests** - End-to-end example project validation

Run all validation tests before release:

```bash
./tests/validate-hooks.sh
./tests/validate-spec-templates.sh
./tests/decision-tree-coverage.sh
./tests/artifact-index-consistency.sh
./tests/secret-scanning/test-patterns.sh
```

## Maintenance

### Updating Tests When Templates Change

When modifying spec templates:

1. Update template content
2. Run `./tests/validate-spec-templates.sh`
3. If new sections added, add corresponding test
4. If sections renamed, update test expectations
5. Update this README with changes
6. Re-run full test suite

### Test Coverage Goals

- **100% coverage** of required sections
- **100% coverage** of required metadata fields
- **100% coverage** of format conventions (✓/✗/⚠, placeholders)
- **Sample coverage** of optional sections (verify marking, not content)

## Contact

For questions or issues with spec template validation:

- File issue in repository issue tracker
- Reference failing test name and output
- Include template file being validated
