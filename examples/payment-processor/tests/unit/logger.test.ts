/**
 * Unit tests for logger with PII scrubbing
 * Validates that sensitive data is never logged
 */

import { testScrubPII, maskEmail, maskCardNumber } from '../../src/logger';

describe('Logger PII Scrubbing', () => {
  describe('Credit Card Number Scrubbing', () => {
    it('should redact credit card numbers with spaces', () => {
      const input = 'Card number: 4242 4242 4242 4242';
      const result = testScrubPII(input);
      expect(result).toContain('[REDACTED_CARD]');
      expect(result).not.toContain('4242 4242 4242 4242');
    });

    it('should redact credit card numbers with dashes', () => {
      const input = 'Card: 4242-4242-4242-4242';
      const result = testScrubPII(input);
      expect(result).toContain('[REDACTED_CARD]');
      expect(result).not.toContain('4242-4242-4242-4242');
    });

    it('should redact credit card numbers without separators', () => {
      const input = 'Card: 4242424242424242';
      const result = testScrubPII(input);
      expect(result).toContain('[REDACTED_CARD]');
      expect(result).not.toContain('4242424242424242');
    });

    it('should not redact partial card numbers (last 4 digits)', () => {
      const input = 'Last 4: 4242';
      const result = testScrubPII(input);
      expect(result).toBe(input); // Should not change
    });
  });

  describe('API Key Scrubbing', () => {
    it('should redact Stripe live API keys', () => {
      const input = 'API key: sk_live_51Habcdefghijklmnopqrstuv';
      const result = testScrubPII(input);
      expect(result).toContain('sk_live_[REDACTED]');
      expect(result).not.toContain('51Habcdefghijklmnopqrstuv');
    });

    it('should redact Stripe test API keys', () => {
      const input = 'Test key: sk_test_4eC39HqLyjWDarjtT1zdp7dc';
      const result = testScrubPII(input);
      expect(result).toContain('sk_test_[REDACTED]');
      expect(result).not.toContain('4eC39HqLyjWDarjtT1zdp7dc');
    });
  });

  describe('AWS Key Scrubbing', () => {
    it('should redact AWS access keys', () => {
      const input = 'AWS key: AKIAIOSFODNN7EXAMPLE';
      const result = testScrubPII(input);
      expect(result).toContain('AKIA[REDACTED]');
      expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });
  });

  describe('CVV Scrubbing', () => {
    it('should redact CVV codes', () => {
      const input = 'CVV: 123';
      const result = testScrubPII(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('123');
    });

    it('should redact security codes', () => {
      const input = 'security_code: 456';
      const result = testScrubPII(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('456');
    });
  });

  describe('Object Scrubbing', () => {
    it('should scrub PII from nested objects', () => {
      const input = {
        orderId: 'order123',
        payment: {
          card: '4242 4242 4242 4242',
          cvv: '123',
        },
        apiKey: 'sk_live_abcdefghijklmnopqrstuvwxyz',
      };

      const result = testScrubPII(input);
      expect(result.payment.card).toContain('[REDACTED_CARD]');
      expect(result.payment.cvv).toContain('[REDACTED]');
      expect(result.apiKey).toContain('sk_live_[REDACTED]');
      expect(result.orderId).toBe('order123'); // Non-sensitive data unchanged
    });

    it('should scrub PII from arrays', () => {
      const input = [
        'Card: 4242424242424242',
        'CVV: 123',
        'Order: order123',
      ];

      const result = testScrubPII(input);
      expect(result[0]).toContain('[REDACTED_CARD]');
      expect(result[1]).toContain('[REDACTED]');
      expect(result[2]).toBe('Order: order123'); // Unchanged
    });
  });

  describe('Email Masking', () => {
    it('should mask email addresses correctly', () => {
      const masked = maskEmail('john.doe@example.com');
      expect(masked).toBe('j***@example.com');
      expect(masked).not.toContain('john.doe');
    });

    it('should handle single character local part', () => {
      const masked = maskEmail('a@example.com');
      expect(masked).toBe('a***@example.com');
    });

    it('should handle invalid emails', () => {
      const masked = maskEmail('invalid-email');
      expect(masked).toBe('[INVALID_EMAIL]');
    });

    it('should handle empty emails', () => {
      const masked = maskEmail('');
      expect(masked).toBe('[INVALID_EMAIL]');
    });
  });

  describe('Card Number Masking', () => {
    it('should mask card numbers to show only last 4 digits', () => {
      const masked = maskCardNumber('4242424242424242');
      expect(masked).toBe('****4242');
    });

    it('should handle short card numbers', () => {
      const masked = maskCardNumber('123');
      expect(masked).toBe('****');
    });

    it('should handle empty card numbers', () => {
      const masked = maskCardNumber('');
      expect(masked).toBe('****');
    });
  });
});
