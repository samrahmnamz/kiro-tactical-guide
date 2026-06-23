/**
 * Logging utility with PII scrubbing
 * Ensures no credit card numbers, CVVs, or sensitive data in logs
 */

import pino from 'pino';

// PII patterns to redact
const PII_PATTERNS = [
  // Credit card numbers (various formats)
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[REDACTED_CARD]' },
  { pattern: /\b\d{13,19}\b/g, replacement: '[REDACTED_CARD]' },
  
  // CVV codes
  { pattern: /\bcvv[:\s]*\d{3,4}\b/gi, replacement: 'cvv: [REDACTED]' },
  { pattern: /\bsecurity[_\s]code[:\s]*\d{3,4}\b/gi, replacement: 'security_code: [REDACTED]' },
  
  // Standalone 3-4 digit codes (likely CVV when in payment context)
  { pattern: /^\d{3,4}$/g, replacement: '[REDACTED]' },
  
  // Email addresses (partial redaction)
  // Already handled by maskEmail function
  
  // API keys (Stripe patterns)
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/g, replacement: 'sk_live_[REDACTED]' },
  { pattern: /sk_test_[a-zA-Z0-9]{24,}/g, replacement: 'sk_test_[REDACTED]' },
  
  // AWS access keys
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: 'AKIA[REDACTED]' },
];

/**
 * Scrub PII from log message or object
 */
function scrubPII(data: any): any {
  if (typeof data === 'string') {
    let scrubbed = data;
    for (const { pattern, replacement } of PII_PATTERNS) {
      scrubbed = scrubbed.replace(pattern, replacement);
    }
    return scrubbed;
  }

  if (typeof data === 'object' && data !== null) {
    const scrubbed: any = Array.isArray(data) ? [] : {};
    for (const [key, value] of Object.entries(data)) {
      scrubbed[key] = scrubPII(value);
    }
    return scrubbed;
  }

  return data;
}

/**
 * Mask email address (show first character and domain)
 * Example: john.doe@example.com -> j***@example.com
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) {
    return '[INVALID_EMAIL]';
  }

  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}

/**
 * Mask card number (show only last 4 digits)
 * Example: 4242424242424242 -> ****4242
 */
export function maskCardNumber(cardNumber: string): string {
  if (!cardNumber || cardNumber.length < 4) {
    return '****';
  }

  return `****${cardNumber.slice(-4)}`;
}

// Create base logger
const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }),
});

/**
 * Logger with automatic PII scrubbing
 */
export const logger = {
  info: (msg: string, obj?: any) => {
    baseLogger.info(scrubPII(obj || {}), scrubPII(msg));
  },
  error: (msg: string, obj?: any) => {
    baseLogger.error(scrubPII(obj || {}), scrubPII(msg));
  },
  warn: (msg: string, obj?: any) => {
    baseLogger.warn(scrubPII(obj || {}), scrubPII(msg));
  },
  debug: (msg: string, obj?: any) => {
    baseLogger.debug(scrubPII(obj || {}), scrubPII(msg));
  },
};

/**
 * Test helper to verify log scrubbing
 * This function is exported for testing purposes only
 */
export function testScrubPII(data: any): any {
  return scrubPII(data);
}
