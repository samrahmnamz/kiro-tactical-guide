/**
 * Jest test setup and global configuration
 * 
 * Configures test environment, mocks, and global settings.
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.DYNAMODB_TABLE_BATCHES = 'test-settlement-batches';
process.env.DYNAMODB_TABLE_LEDGER = 'test-transaction-ledger';
process.env.S3_AUDIT_BUCKET = 'test-audit-logs';
process.env.STEP_FUNCTIONS_STATE_MACHINE_ARN = 'arn:aws:states:us-east-1:123456789012:stateMachine:test-settlement-workflow';
process.env.DEPLOYMENT_VERSION = '1.0.0-test';
process.env.ENVIRONMENT = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// Increase timeout for integration tests
jest.setTimeout(10000);

// Global test utilities
global.beforeAll(() => {
  // Setup before all tests
});

global.afterAll(() => {
  // Cleanup after all tests
});
