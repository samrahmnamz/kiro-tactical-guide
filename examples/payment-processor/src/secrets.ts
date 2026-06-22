/**
 * AWS Secrets Manager integration
 * Loads secrets at runtime (never hardcoded)
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// Cache for secrets to reduce API calls
const secretCache = new Map<string, { value: string; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Retrieve a secret from AWS Secrets Manager
 * 
 * @param secretName - Name of the secret in Secrets Manager
 * @returns Secret value as string
 */
export async function getSecret(secretName: string): Promise<string> {
  // Check cache first
  const cached = secretCache.get(secretName);
  if (cached && Date.now() < cached.expiry) {
    return cached.value;
  }

  try {
    const command = new GetSecretValueCommand({
      SecretId: secretName,
    });

    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error(`Secret ${secretName} has no string value`);
    }

    // Cache the secret
    secretCache.set(secretName, {
      value: response.SecretString,
      expiry: Date.now() + CACHE_TTL_MS,
    });

    return response.SecretString;
  } catch (error) {
    throw new Error(
      `Failed to retrieve secret ${secretName}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Clear the secret cache (useful for testing)
 */
export function clearSecretCache(): void {
  secretCache.clear();
}
