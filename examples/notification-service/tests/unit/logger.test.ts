/**
 * Unit tests for logger with PII scrubbing
 * **Validates: Requirements 3.4** (No PII in Logs constraint)
 */

import { maskEmail, maskPhone, maskCard, scrubPII } from '../../src/logger';

describe('Logger - PII Scrubbing', () => {
  describe('maskEmail', () => {
    it('should mask email addresses correctly', () => {
      const email = 'john.doe@example.com';
      const masked = maskEmail(email);
      expect(masked).toBe('j***@example.com');
    });

    it('should handle multiple emails', () => {
      const text = 'Contact john@example.com or jane@test.com';
      const masked = maskEmail(text);
      expect(masked).toContain('j***@example.com');
      expect(masked).toContain('j***@test.com');
    });
  });

  describe('maskPhone', () => {
    it('should mask phone numbers correctly', () => {
      const phone = '+1-555-123-4567';
      const masked = maskPhone(phone);
      expect(masked).toBe('***-4567');
    });

    it('should handle phone without country code', () => {
      const phone = '555-123-4567';
      const masked = maskPhone(phone);
      expect(masked).toContain('4567');
    });
  });

  describe('maskCard', () => {
    it('should mask credit card numbers', () => {
      const card = '4242-4242-4242-4242';
      const masked = maskCard(card);
      expect(masked).toBe('****-****-****-4242');
    });

    it('should handle cards without dashes', () => {
      const card = '4242424242424242';
      const masked = maskCard(card);
      expect(masked).toContain('4242');
    });
  });

  describe('scrubPII', () => {
    it('should scrub email from strings', () => {
      const text = 'Send to customer@example.com';
      const scrubbed = scrubPII(text);
      expect(scrubbed).toContain('c***@example.com');
      expect(scrubbed).not.toContain('customer@example.com');
    });

    it('should scrub phone from strings', () => {
      const text = 'Call +1-555-123-4567';
      const scrubbed = scrubPII(text);
      expect(scrubbed).toContain('4567');
      expect(scrubbed).not.toContain('555-123-4567');
    });

    it('should redact sensitive field names in objects', () => {
      const obj = {
        customerId: '123',
        email: 'test@example.com',
        phone: '+1-555-123-4567',
      };
      const scrubbed = scrubPII(obj) as Record<string, unknown>;
      expect(scrubbed.customerId).toBe('123');
      expect(scrubbed.email).toBe('***REDACTED***');
      expect(scrubbed.phone).toBe('***REDACTED***');
    });

    it('should scrub arrays recursively', () => {
      const arr = ['customer@example.com', '+1-555-123-4567'];
      const scrubbed = scrubPII(arr) as string[];
      expect(scrubbed[0]).toContain('c***@example.com');
      expect(scrubbed[1]).toContain('4567');
    });

    it('should handle nested objects', () => {
      const obj = {
        user: {
          email: 'nested@example.com',
          metadata: {
            phone: '+1-555-123-4567',
          },
        },
      };
      const scrubbed = scrubPII(obj) as Record<string, unknown>;
      const user = scrubbed.user as Record<string, unknown>;
      expect(user.email).toBe('***REDACTED***');
      const metadata = user.metadata as Record<string, unknown>;
      expect(metadata.phone).toBe('***REDACTED***');
    });
  });
});
