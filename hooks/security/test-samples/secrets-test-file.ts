/**
 * Test file for secret scanning hooks
 * This file contains INTENTIONAL test secrets to validate scanning functionality
 * DO NOT use these patterns in production code
 * 
 * NOTE: All secrets below are REDACTED/FAKE for demonstration purposes
 */

// AWS Access Key (should be detected) - REDACTED
const awsAccessKey = "AKIA****************MPLE";

// AWS Secret Key (should be detected) - REDACTED
const awsSecretKey = "wJal********************************MPLEKEY";

// GitHub Personal Access Token (should be detected) - REDACTED
const githubToken = "ghp_****************************************";

// Stripe API Key (should be detected) - REDACTED
const stripeKey = "sk_live_********************************";

// MongoDB Connection String with credentials (should be detected) - REDACTED
const mongoUri = "mongodb+srv://admin:**********@cluster0.example.mongodb.net/mydb";

// PostgreSQL Connection String with credentials (should be detected) - REDACTED
const postgresUri = "postgresql://dbuser:**********@localhost:5432/mydb";

// Private Key (should be detected) - REDACTED
const privateKey = `-----BEGIN RSA PRIVATE KEY-----
[REDACTED - Test pattern for key detection]
-----END RSA PRIVATE KEY-----`;

// Generic Password (should be detected) - REDACTED
const password = "MyS3cr3tP@ssw0rd!"; // gitleaks:allow - test pattern only

// Safe example (should NOT be detected - whitelisted)
const exampleKey = "YOUR_API_KEY_HERE";

// Safe placeholder (should NOT be detected)
const apiKeyPlaceholder = "YOUR_API_KEY_HERE";

// Safe environment variable reference (should NOT be detected)
const envVar = process.env.API_KEY;

export {
  awsAccessKey,
  awsSecretKey,
  githubToken,
  stripeKey,
  mongoUri,
  postgresUri,
  privateKey,
  password,
  exampleKey,
  apiKeyPlaceholder,
  envVar,
};
