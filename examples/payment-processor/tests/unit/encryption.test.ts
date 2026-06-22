/**
 * Unit tests for encryption utilities
 * Validates encryption/decryption roundtrip and error handling
 */

// Mock AWS KMS client - must be done before imports
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-kms', () => {
  const actual = jest.requireActual('@aws-sdk/client-kms');
  return {
    ...actual,
    KMSClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

import { encrypt, decrypt, encryptFields, decryptFields } from '../../src/encryption';

describe('Encryption Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('encrypt', () => {
    it('should encrypt plaintext successfully', async () => {
      const plaintext = 'sensitive-data';
      const mockCiphertext = Buffer.from('encrypted-data');

      mockSend.mockResolvedValueOnce({
        CiphertextBlob: mockCiphertext,
      });

      const result = await encrypt(plaintext, 'test-key-id');
      expect(result).toBe(mockCiphertext.toString('base64'));
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error for empty plaintext', async () => {
      await expect(encrypt('', 'test-key-id')).rejects.toThrow(
        'Plaintext cannot be empty'
      );
    });

    it('should throw error when KMS returns no ciphertext', async () => {
      mockSend.mockResolvedValueOnce({
        CiphertextBlob: undefined,
      });

      await expect(encrypt('data', 'test-key-id')).rejects.toThrow(
        'KMS encryption returned no ciphertext'
      );
    });

    it('should handle KMS errors gracefully', async () => {
      mockSend.mockRejectedValueOnce(new Error('KMS unavailable'));

      await expect(encrypt('data', 'test-key-id')).rejects.toThrow(
        'Encryption failed: KMS unavailable'
      );
    });
  });

  describe('decrypt', () => {
    it('should decrypt ciphertext successfully', async () => {
      const plaintext = 'decrypted-data';
      const ciphertext = Buffer.from('encrypted-data').toString('base64');

      mockSend.mockResolvedValueOnce({
        Plaintext: Buffer.from(plaintext, 'utf-8'),
      });

      const result = await decrypt(ciphertext);
      expect(result).toBe(plaintext);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error for empty ciphertext', async () => {
      await expect(decrypt('')).rejects.toThrow('Ciphertext cannot be empty');
    });

    it('should throw error when KMS returns no plaintext', async () => {
      mockSend.mockResolvedValueOnce({
        Plaintext: undefined,
      });

      const ciphertext = Buffer.from('encrypted').toString('base64');
      await expect(decrypt(ciphertext)).rejects.toThrow(
        'KMS decryption returned no plaintext'
      );
    });

    it('should handle KMS errors gracefully', async () => {
      mockSend.mockRejectedValueOnce(new Error('KMS unavailable'));

      const ciphertext = Buffer.from('encrypted').toString('base64');
      await expect(decrypt(ciphertext)).rejects.toThrow(
        'Decryption failed: KMS unavailable'
      );
    });
  });

  describe('encryptFields', () => {
    it('should encrypt multiple fields', async () => {
      const fields = {
        email: 'user@example.com',
        cardLastFour: '4242',
      };

      mockSend
        .mockResolvedValueOnce({
          CiphertextBlob: Buffer.from('encrypted-email'),
        })
        .mockResolvedValueOnce({
          CiphertextBlob: Buffer.from('encrypted-card'),
        });

      const result = await encryptFields(fields, 'test-key-id');

      expect(result.email).toBe(
        Buffer.from('encrypted-email').toString('base64')
      );
      expect(result.cardLastFour).toBe(
        Buffer.from('encrypted-card').toString('base64')
      );
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should handle empty object', async () => {
      const result = await encryptFields({}, 'test-key-id');
      expect(result).toEqual({});
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('decryptFields', () => {
    it('should decrypt multiple fields', async () => {
      const fields = {
        email: Buffer.from('encrypted-email').toString('base64'),
        cardLastFour: Buffer.from('encrypted-card').toString('base64'),
      };

      mockSend
        .mockResolvedValueOnce({
          Plaintext: Buffer.from('user@example.com'),
        })
        .mockResolvedValueOnce({
          Plaintext: Buffer.from('4242'),
        });

      const result = await decryptFields(fields);

      expect(result.email).toBe('user@example.com');
      expect(result.cardLastFour).toBe('4242');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should handle empty object', async () => {
      const result = await decryptFields({});
      expect(result).toEqual({});
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('Encryption Roundtrip', () => {
    it('should successfully roundtrip encrypt and decrypt', async () => {
      const originalData = 'sensitive-customer-email@example.com';

      // Mock encryption
      const mockEncrypted = Buffer.from('mock-encrypted-data');
      mockSend.mockResolvedValueOnce({
        CiphertextBlob: mockEncrypted,
      });

      const encrypted = await encrypt(originalData, 'test-key-id');

      // Mock decryption
      mockSend.mockResolvedValueOnce({
        Plaintext: Buffer.from(originalData, 'utf-8'),
      });

      const decrypted = await decrypt(encrypted);

      expect(decrypted).toBe(originalData);
    });
  });
});
