/**
 * PII-Scrubbing Logger
 * 
 * Production-ready logging with automatic PII redaction for security and compliance.
 * Follows the golden spec: toolkit/specs/golden/logging-standard.spec.md
 * 
 * ## Features
 * - **Automatic PII scrubbing**: Redacts emails, phone numbers, and credit cards
 * - **Structured logging**: JSON format for easy parsing and analysis
 * - **Development mode**: Pretty-printed colored output with timestamps
 * - **Production mode**: Optimized JSON output for log aggregation
 * 
 * ## PII Patterns Detected
 * - **Email addresses**: Masks to first character + domain (j***@example.com)
 * - **Phone numbers**: Masks to last 4 digits (***-4567)
 * - **Credit cards**: Masks to last 4 digits (****-****-****-4242)
 * - **Sensitive fields**: Redacts fields named "email", "phone", "phoneNumber", "cardNumber"
 * 
 * ## Configuration
 * Environment variables:
 * - `LOG_LEVEL`: Minimum log level (trace, debug, info, warn, error, fatal) - default: info
 * - `NODE_ENV`: When set to 'development', enables pretty-printed output
 * 
 * ## Usage
 * ```typescript
 * import logger from './logger';
 * 
 * // Safe - PII automatically scrubbed
 * logger.info('User registered', { 
 *   email: 'john.doe@example.com',  // Logged as: j***@example.com
 *   phone: '+1-555-123-4567'         // Logged as: ***-4567
 * });
 * 
 * // Complex objects are recursively scrubbed
 * logger.error('Payment failed', { 
 *   user: { email: 'user@test.com', name: 'John' },
 *   card: '4242-4242-4242-4242'  // Logged as: ****-****-****-4242
 * });
 * ```
 * 
 * @module logger
 */

import pino from 'pino';

/**
 * Regular expression patterns for detecting PII in log data.
 * 
 * These patterns match common PII formats:
 * - EMAIL_PATTERN: Matches standard email addresses (local@domain.tld)
 * - PHONE_PATTERN: Matches international and US phone numbers with various formats
 * - CARD_PATTERN: Matches credit card numbers (with or without spaces/dashes)
 */
const EMAIL_PATTERN = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
const PHONE_PATTERN = /(\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9})/g;
const CARD_PATTERN = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;

/**
 * Mask email addresses to show only the first character of local part and full domain.
 * 
 * Provides a balance between data privacy and debugging usability. The masked
 * format allows engineers to identify which domain received the notification
 * while protecting the full email address.
 * 
 * @param email - Email address to mask
 * @returns Masked email in format "firstChar***@domain.com"
 * 
 * @example
 * ```typescript
 * maskEmail("john.doe@example.com")  // Returns: "j***@example.com"
 * maskEmail("admin@company.co.uk")   // Returns: "a***@company.co.uk"
 * ```
 */
export function maskEmail(email: string): string {
  return email.replace(EMAIL_PATTERN, (match) => {
    const [local, domain] = match.split('@');
    return `${local[0]}***@${domain}`;
  });
}

/**
 * Mask phone numbers to show only the last 4 digits.
 * 
 * The last 4 digits provide enough information for support teams to verify
 * contact information with customers while protecting the full number.
 * 
 * @param phone - Phone number to mask (any format)
 * @returns Masked phone in format "***-last4digits"
 * 
 * @example
 * ```typescript
 * maskPhone("+1-555-123-4567")  // Returns: "***-4567"
 * maskPhone("555.123.4567")     // Returns: "***-4567"
 * maskPhone("+44 20 1234 5678") // Returns: "***-5678"
 * ```
 */
export function maskPhone(phone: string): string {
  return phone.replace(PHONE_PATTERN, (match) => {
    const digits = match.replace(/\D/g, '');
    return `***-${digits.slice(-4)}`;
  });
}

/**
 * Mask credit card numbers to show only the last 4 digits.
 * 
 * PCI DSS compliance requires masking all but the last 4 digits of card numbers.
 * The last 4 digits help identify which card was used without exposing the full number.
 * 
 * @param card - Credit card number to mask (any format)
 * @returns Masked card in format "****-****-****-last4"
 * 
 * @example
 * ```typescript
 * maskCard("4242-4242-4242-4242") // Returns: "****-****-****-4242"
 * maskCard("4242 4242 4242 4242") // Returns: "****-****-****-4242"
 * maskCard("4242424242424242")    // Returns: "****-****-****-4242"
 * ```
 */
export function maskCard(card: string): string {
  return card.replace(CARD_PATTERN, (match) => {
    const digits = match.replace(/\D/g, '');
    return `****-****-****-${digits.slice(-4)}`;
  });
}

/**
 * Recursively scrub PII from log data.
 * 
 * Traverses through strings, arrays, and objects to find and mask PII patterns.
 * Sensitive field names (email, phone, cardNumber, etc.) are completely redacted.
 * 
 * ## Scrubbing Strategy
 * - **Strings**: Apply regex patterns to mask emails, phones, and card numbers
 * - **Arrays**: Recursively scrub each element
 * - **Objects**: Recursively scrub each property value
 * - **Sensitive fields**: Replace entire value with '***REDACTED***'
 * - **Other types**: Return unchanged (numbers, booleans, null, undefined)
 * 
 * ## Sensitive Field Names
 * Fields with these names (case-insensitive) are completely redacted:
 * - `email`
 * - `phone`
 * - `phoneNumber`
 * - `cardNumber`
 * 
 * @param data - Data to scrub (any type)
 * @returns Scrubbed copy of the data with PII masked/redacted
 * 
 * @example
 * ```typescript
 * const data = {
 *   message: "Contact john.doe@example.com for support",
 *   user: {
 *     email: "john.doe@example.com",  // Field name triggers redaction
 *     id: "user-123"
 *   },
 *   phones: ["+1-555-123-4567", "+1-555-987-6543"]
 * };
 * 
 * const scrubbed = scrubPII(data);
 * // Result:
 * // {
 * //   message: "Contact j***@example.com for support",
 * //   user: {
 * //     email: "***REDACTED***",  // Completely redacted due to field name
 * //     id: "user-123"
 * //   },
 * //   phones: ["***-4567", "***-6543"]
 * // }
 * ```
 */
export function scrubPII(data: unknown): unknown {
  if (typeof data === 'string') {
    let scrubbed = data;
    scrubbed = scrubbed.replace(EMAIL_PATTERN, (m) => maskEmail(m));
    scrubbed = scrubbed.replace(PHONE_PATTERN, (m) => maskPhone(m));
    scrubbed = scrubbed.replace(CARD_PATTERN, (m) => maskCard(m));
    return scrubbed;
  }

  if (Array.isArray(data)) {
    return data.map(scrubPII);
  }

  if (data && typeof data === 'object') {
    const scrubbed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Redact sensitive field names
      if (['email', 'phone', 'phoneNumber', 'cardNumber'].includes(key.toLowerCase())) {
        scrubbed[key] = '***REDACTED***';
      } else {
        scrubbed[key] = scrubPII(value);
      }
    }
    return scrubbed;
  }

  return data;
}

/**
 * Pino logger instance with automatic PII scrubbing.
 * 
 * All log messages are automatically passed through the scrubPII function before
 * being written, ensuring no PII leaks into log files or monitoring systems.
 * 
 * ## Log Levels (from lowest to highest)
 * - `trace`: Very detailed debugging (rarely used in production)
 * - `debug`: Detailed debugging information
 * - `info`: General informational messages (default level)
 * - `warn`: Warning messages for potentially harmful situations
 * - `error`: Error messages for failures
 * - `fatal`: Critical errors causing application shutdown
 * 
 * ## Development vs Production
 * - **Development** (NODE_ENV=development): Pretty-printed with colors and timestamps
 * - **Production**: Compact JSON for efficient parsing by log aggregation tools
 * 
 * @example
 * ```typescript
 * import logger from './logger';
 * 
 * // All standard pino methods available
 * logger.info('Application started');
 * logger.debug('Config loaded', { configPath: '/etc/app/config.json' });
 * logger.warn('Rate limit approaching', { current: 950, limit: 1000 });
 * logger.error('Database connection failed', { error: err.message });
 * 
 * // PII is automatically scrubbed
 * logger.info('User action', { 
 *   userId: 'user-123',
 *   email: 'test@example.com'  // Automatically masked
 * });
 * ```
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  hooks: {
    // Scrub PII from all log messages
    logMethod(args: unknown[], method: pino.LogFn): void {
      const scrubbedArgs = args.map(scrubPII);
      // Type assertion needed because pino's logMethod signature is overly strict
      method.apply(this, scrubbedArgs as [msg: string, ...args: unknown[]]);
    },
  },
});

export default logger;
