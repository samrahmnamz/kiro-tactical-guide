/**
 * Unit tests for PII-scrubbing logger
 * 
 * Tests automatic PII redaction for security and regulatory compliance.
 */

import {
  maskEmail,
  maskPhone,
  maskAccountNumber,
  maskRoutingNumber,
  scrubPII,
} from '../../src/logger';

describe('Logger PII Scrubbing', () => {
  describe('maskEmail', () => {
    it('should mask email addresses correctly', () => {
      const input = 'Contact john.doe@bank.com for support';
      const result = maskEmail(input);
      expect(result).toBe('Contact j***@bank.com for support');
    });

    it('should mask multiple emails', () => {
      const input = 'Send to admin@treasury.gov and support@bank.com';
      const result = maskEmail(input);
      expect(result).toContain('a***@treasury.gov');
      expect(result).toContain('s***@bank.com');
    });
  });

  describe('maskPhone', () => {
    it('should mask phone numbers showing only last 4 digits', () => {
      const input = 'Call +1-555-123-4567';
      const result = maskPhone(input);
      expect(result).toBe('Call ***-4567');
    });

    it('should handle various phone formats', () => {
      expect(maskPhone('555.123.4567')).toContain('***-4567');
      expect(maskPhone('+44 20 1234 5678')).toContain('***-5678');
    });
  });

  describe('maskAccountNumber', () => {
    it('should mask account numbers showing only last 4 digits', () => {
      const input = 'Account 1234567890 was debited';
      const result = maskAccountNumber(input);
      expect(result).toBe('Account ****-7890 was debited');
    });
  });

  describe('maskRoutingNumber', () => {
    it('should completely redact routing numbers', () => {
      const input = 'Routing 123456789 for transfer';
      const result = maskRoutingNumber(input);
      expect(result).toBe('Routing ***REDACTED*** for transfer');
    });
  });

  describe('scrubPII', () => {
    it('should scrub PII from strings', () => {
      const data = 'Transfer from account 1234567890 to john@bank.com';
      const scrubbed = scrubPII(data);
      expect(scrubbed).toContain('***-7890');
      expect(scrubbed).toContain('j***@bank.com');
    });

    it('should scrub PII from nested objects', () => {
      const data = {
        message: 'Transfer from account 1234567890',
        counterparty: {
          accountNumber: '9876543210',
          name: 'Bank XYZ',
        },
        amount: 50000.0,
      };

      const scrubbed = scrubPII(data) as Record<string, unknown>;
      expect(scrubbed.message).toContain('***-7890');
      expect(scrubbed.counterparty).toEqual({
        accountNumber: '***REDACTED***',
        name: 'Bank XYZ',
      });
      expect(scrubbed.amount).toBe(50000.0);
    });

    it('should scrub PII from arrays', () => {
      const data = ['Account 1234567890', 'john@bank.com', 'Phone: 555-1234'];
      const scrubbed = scrubPII(data) as string[];
      expect(scrubbed[0]).toContain('***-7890');
      expect(scrubbed[1]).toContain('j***@bank.com');
      expect(scrubbed[2]).toContain('***-1234');
    });

    it('should redact sensitive field names', () => {
      const data = {
        email: 'admin@bank.com',
        phone: '555-1234',
        accountNumber: '1234567890',
        routingNumber: '123456789',
        normalField: 'Should not be redacted',
      };

      const scrubbed = scrubPII(data) as Record<string, unknown>;
      expect(scrubbed.email).toBe('***REDACTED***');
      expect(scrubbed.phone).toBe('***REDACTED***');
      expect(scrubbed.accountNumber).toBe('***REDACTED***');
      expect(scrubbed.routingNumber).toBe('***REDACTED***');
      expect(scrubbed.normalField).toBe('Should not be redacted');
    });

    it('should handle null and undefined', () => {
      expect(scrubPII(null)).toBeNull();
      expect(scrubPII(undefined)).toBeUndefined();
    });

    it('should handle numbers and booleans unchanged', () => {
      expect(scrubPII(123)).toBe(123);
      expect(scrubPII(true)).toBe(true);
    });
  });
});
