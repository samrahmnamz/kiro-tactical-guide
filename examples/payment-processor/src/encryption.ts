/**
 * Encryption utilities using AWS KMS
 * Implements AES-256 encryption at application layer
 */

import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

const client = new KMSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// Data key cache to reduce KMS API calls (for future optimization)
// interface CachedDataKey {
//   plaintext: Buffer;
//   ciphertext: Buffer;
//   expiry: number;
// }

// const dataKeyCache = new Map<string, CachedDataKey>();
// const DATA_KEY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Encrypt sensitive data using AWS KMS
 * 
 * @param plaintext - Data to encrypt
 * @param kmsKeyId - KMS key ID or alias
 * @returns Encrypted data as base64 string
 */
export async function encrypt(
  plaintext: string,
  kmsKeyId: string
): Promise<string> {
  if (!plaintext) {
    throw new Error('Plaintext cannot be empty');
  }

  try {
    const command = new EncryptCommand({
      KeyId: kmsKeyId,
      Plaintext: Buffer.from(plaintext, 'utf-8'),
    });

    const response = await client.send(command);

    if (!response.CiphertextBlob) {
      throw new Error('KMS encryption returned no ciphertext');
    }

    // Return as base64 string for storage
    return Buffer.from(response.CiphertextBlob).toString('base64');
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decrypt data using AWS KMS
 * 
 * @param ciphertext - Encrypted data as base64 string
 * @returns Decrypted plaintext
 */
export async function decrypt(ciphertext: string): Promise<string> {
  if (!ciphertext) {
    throw new Error('Ciphertext cannot be empty');
  }

  try {
    const command = new DecryptCommand({
      CiphertextBlob: Buffer.from(ciphertext, 'base64'),
    });

    const response = await client.send(command);

    if (!response.Plaintext) {
      throw new Error('KMS decryption returned no plaintext');
    }

    return Buffer.from(response.Plaintext).toString('utf-8');
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Encrypt multiple fields in a record
 * 
 * @param fields - Object with field names and values to encrypt
 * @param kmsKeyId - KMS key ID or alias
 * @returns Object with encrypted values
 */
export async function encryptFields(
  fields: Record<string, string>,
  kmsKeyId: string
): Promise<Record<string, string>> {
  const encrypted: Record<string, string> = {};

  for (const [key, value] of Object.entries(fields)) {
    encrypted[key] = await encrypt(value, kmsKeyId);
  }

  return encrypted;
}

/**
 * Decrypt multiple fields in a record
 * 
 * @param fields - Object with field names and encrypted values
 * @returns Object with decrypted values
 */
export async function decryptFields(
  fields: Record<string, string>
): Promise<Record<string, string>> {
  const decrypted: Record<string, string> = {};

  for (const [key, value] of Object.entries(fields)) {
    decrypted[key] = await decrypt(value);
  }

  return decrypted;
}

/**
 * Clear the data key cache (useful for testing)
 * Currently not implemented as caching is disabled
 */
export function clearDataKeyCache(): void {
  // dataKeyCache.clear();
}
