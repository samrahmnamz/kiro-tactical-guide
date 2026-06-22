/**
 * Unit tests for Secrets Manager integration
 * **Validates: Requirements 3.4 (payment processor tests)**
 */

// Mock AWS Secrets Manager BEFORE imports
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  GetSecretValueCommand: jest.fn(),
}));

import { getSecret, clearSecretCache } from '../../src/secrets';
import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

describe('Secrets Manager Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSecretCache();
  });

  describe('getSecret', () => {
    it('should retrieve a secret from Secrets Manager', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: 'sk_test_secret_key_12345',
      });

      const result = await getSecret('stripe-api-key');

      expect(result).toBe('sk_test_secret_key_12345');
      expect(GetSecretValueCommand).toHaveBeenCalledWith({
        SecretId: 'stripe-api-key',
      });
    });

    it('should cache secrets to reduce API calls', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: 'cached_secret_value',
      });

      // First call
      const result1 = await getSecret('my-secret');
      expect(result1).toBe('cached_secret_value');
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Second call (should use cache)
      const result2 = await getSecret('my-secret');
      expect(result2).toBe('cached_secret_value');
      expect(mockSend).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it('should refresh cache after TTL expires', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: 'first_value',
      });

      // First call
      await getSecret('my-secret');
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Clear cache to simulate TTL expiry
      clearSecretCache();

      mockSend.mockResolvedValueOnce({
        SecretString: 'second_value',
      });

      // Second call after cache clear
      const result = await getSecret('my-secret');
      expect(result).toBe('second_value');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should cache different secrets independently', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: 'secret_one',
      });
      mockSend.mockResolvedValueOnce({
        SecretString: 'secret_two',
      });

      const result1 = await getSecret('secret-1');
      const result2 = await getSecret('secret-2');

      expect(result1).toBe('secret_one');
      expect(result2).toBe('secret_two');
      expect(mockSend).toHaveBeenCalledTimes(2);

      // Both should be cached
      await getSecret('secret-1');
      await getSecret('secret-2');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should throw error for missing SecretString', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: undefined,
      });

      await expect(getSecret('my-secret')).rejects.toThrow(
        'Secret my-secret has no string value'
      );
    });

    it('should throw error on Secrets Manager failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('Access denied'));

      await expect(getSecret('restricted-secret')).rejects.toThrow(
        'Failed to retrieve secret restricted-secret: Access denied'
      );
    });

    it('should handle secrets with special characters', async () => {
      const complexSecret = 'sk_live_!@#$%^&*()_+-={}[]|:;"<>,.?/~`';
      mockSend.mockResolvedValueOnce({
        SecretString: complexSecret,
      });

      const result = await getSecret('complex-secret');

      expect(result).toBe(complexSecret);
    });
  });

  describe('clearSecretCache', () => {
    it('should clear all cached secrets', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: 'first_value',
      });

      // Cache a secret
      await getSecret('my-secret');
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Clear cache
      clearSecretCache();

      mockSend.mockResolvedValueOnce({
        SecretString: 'second_value',
      });

      // Should fetch again after cache clear
      const result = await getSecret('my-secret');
      expect(result).toBe('second_value');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });
});
