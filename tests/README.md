# Validation Tests

This directory contains validation tests for the Kiro Cloud Engineering/DevOps Toolbox.

## Purpose

Validation tests ensure the integrity and correctness of toolkit artifacts:
- Hook YAML syntax and required fields validation
- Spec template format and placeholder consistency
- Secret scanning pattern accuracy
- Decision tree coverage completeness
- Artifact index consistency with actual directory contents
- Customization guide completeness
- Integration tests for example projects

## Test Categories

### Syntax and Structure Tests
- `validate-hooks.sh` - Check YAML syntax and required fields for all hooks
- `validate-spec-templates.sh` - Check spec template structure and placeholders

### Functional Tests
- `secret-scanning/test-patterns.sh` - Test secret detection accuracy with known patterns
- `integration/payment-processor.sh` - Build, test, and deploy payment processor example
- `integration/rate-limiter.sh` - Build, test, and deploy rate limiter example
- `integration/notification-service.sh` - Build, test, and deploy notification service example
- `integration/settlement-engine.sh` - Build, test, and deploy settlement engine example

### Documentation Tests
- `decision-tree-coverage.sh` - Verify all 10 primary concerns are covered
- `artifact-index-consistency.sh` - Check artifact index matches actual files
- `customization-guide-check.sh` - Verify customization instructions exist
- `metrics-citations.sh` - Validate citations for statistics and metrics
- `dora-mapping-completeness.sh` - Verify DORA metrics mapping completeness

### Timing Tests
- `quickstart-timing.sh` - Validate Quick Start paths complete in <30 minutes

## Running Tests

Individual test scripts can be run directly:
```bash
./tests/validate-hooks.sh
./tests/secret-scanning/test-patterns.sh
```

Or run all tests:
```bash
./tests/run-all-tests.sh
```

## Test Requirements

Some tests require:
- AWS CLI configured with test credentials
- Node.js and npm for example projects
- Docker for integration tests
- gitleaks installed for secret scanning tests

See individual test scripts for specific prerequisites.
