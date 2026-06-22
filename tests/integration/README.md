# Integration Tests

This directory contains integration test scripts that validate the example projects in the repository.

## Available Tests

### notification-service.sh

Validates the notification-service example project for:

- **Build and Compilation**: TypeScript compilation, output files, type checking
- **Unit Tests**: Test execution, coverage, test file organization
- **Infrastructure**: CDK definitions, IAM policies, DynamoDB tables, SQS queues
- **SQS Message Processing**: Queue module, priority routing, message types
- **SNS Notification Delivery**: Multi-channel support (email/SMS/push), retry logic
- **API Integration**: API tests, positive/negative/edge cases
- **Data Privacy & Security**: PII scrubbing, opt-out enforcement, idempotency
- **Automation Patterns**: Spec-driven development, hook integration
- **Documentation**: README, spec completeness, API documentation

**Usage:**
```bash
./tests/integration/notification-service.sh
```

**Exit Codes:**
- `0`: All tests passed
- `1`: One or more tests failed

### settlement-engine.sh

Validates the settlement-engine example project for regulatory compliance patterns.

**Usage:**
```bash
./tests/integration/settlement-engine.sh
```

## Running All Integration Tests

To run all integration tests:

```bash
for test in tests/integration/*.sh; do
  echo "Running $test..."
  bash "$test"
  echo ""
done
```

## Test Output

Each test script provides:
- Color-coded pass/fail indicators (✓/✗)
- Test category groupings
- Detailed error messages for failures
- Summary statistics (tests passed, tests failed, success rate)
- Recommendations based on failure severity

## Notes

- Integration tests may show warnings for AWS service dependencies (SQS, SNS, DynamoDB)
- These warnings are expected when running tests without AWS credentials configured
- Tests validate code structure, types, and logic even without live AWS services
- Some integration tests (API tests requiring AWS) may be marked as failures in CI environments
