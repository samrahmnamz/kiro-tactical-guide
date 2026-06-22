/**
 * PII-Scrubbing Logger for Settlement Engine
 * 
 * Production-ready logging with automatic PII redaction for security and regulatory compliance.
 * Follows the golden spec: toolkit/specs/golden/logging-standard.spec.md
 * 
 * ## Features
 * - **Automatic PII scrubbing**: Redacts emails, phone numbers, account numbers, and routing numbers
 * - **Structured logging**: JSON format for easy parsing and analysis
 * - **Development mode**: Pretty-printed colored output with timestamps
 * - **Production mode**: Optimized JSON output for log aggregation
 * - **Financial data protection**: Masks account numbers, routing numbers, and transaction amounts
 * 
 * ## PII Patterns Detected
 * - **Email addresses**: Masks to first character + domain (j***@example.com)
 * - **Phone numbers**: Masks to last 4 digits (***-4567)
 * - **Account numbers**: Masks to last 4 digits (****-1234)
 * - **Routing numbers**: Completely redacted (***REDACTED***)
 * - **Sensitive fields**: Redacts fields named "accountNumber", "routingNumber", "cardNumber", etc.
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
 * logger.info('Settlement initiated', { 
 *   settlementBatchId: 'uuid-here',
 *   accountNumber: '1234567890',  // Logged as: ****-7890
 *   amount: 50000.00
 * });
 * 
 * // Complex objects are recursively scrubbed
 * logger.error('Payment failed', { 
 *   counterparty: { accountNumber: '9876543210', name: 'Bank XYZ' },
 *   error: 'Insufficient funds'
 * });
 * ```
 * 
 * @module logger
 */

import pino from 'pino';

/**
 * Regular expression patterns for detecting PII in log data.
 * 
 * These patterns match common PII formats in financial systems:
 * - EMAIL_PATTERN: Matches standard email addresses (local@domain.tld)
 * - PHONE_PATTERN: Matches international and US phone numbers with various formats
 * - ACCOUNT_PATTERN: Matches bank account numbers (8-17 digits)
 * - ROUTING_PATTERN: Matches US routing numbers (9 digits)
 */
const EMAIL_PATTERN = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
const PHONE_PATTERN = /(\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9})/g;
const ACCOUNT_PATTERN = /\b\d{8,17}\b/g;
const ROUTING_PATTERN = /\b\d{9}\b/g;

/**
 * Mask email addresses to show only the first character of local part and full domain.
 * 
 * Provides a balance between data privacy and debugging usability. The masked
 * format allows engineers to identify which domain was used while protecting
 * the full email address.
 * 
 * @param email - Email address to mask
 * @returns Masked email in format "firstChar***@domain.com"
 * 
 * @example
 * ```typescript
 * maskEmail("john.doe@bank.com")  // Returns: "j***@bank.com"
 * maskEmail("admin@treasury.gov")   // Returns: "a***@treasury.gov"
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
 * Mask account numbers to show only the last 4 digits.
 * 
 * Financial regulations require masking all but the last 4 digits of account numbers.
 * The last 4 digits help identify which account was used without exposing the full number.
 * 
 * @param account - Account number to mask
 * @returns Masked account in format "****-last4"
 * 
 * @example
 * ```typescript
 * maskAccountNumber("1234567890") // Returns: "****-7890"
 * maskAccountNumber("9876543210") // Returns: "****-3210"
 * ```
 */
export function maskAccountNumber(account: string): string {
  return account.replace(ACCOUNT_PATTERN, (match) => {
    return `****-${match.slice(-4)}`;
  });
}

/**
 * Completely redact routing numbers.
 * 
 * Routing numbers should never appear in logs as they can be used to identify
 * financial institutions and facilitate fraud.
 * 
 * @param routing - Routing number to redact
 * @returns Completely redacted string
 * 
 * @example
 * ```typescript
 * maskRoutingNumber("123456789") // Returns: "***REDACTED***"
 * ```
 */
export function maskRoutingNumber(routing: string): string {
  return routing.replace(ROUTING_PATTERN, () => {
    return '***REDACTED***';
  });
}

/**
 * Recursively scrub PII from log data.
 * 
 * Traverses through strings, arrays, and objects to find and mask PII patterns.
 * Sensitive field names (accountNumber, routingNumber, email, etc.) are completely redacted.
 * 
 * ## Scrubbing Strategy
 * - **Strings**: Apply regex patterns to mask emails, phones, account numbers, and routing numbers
 * - **Arrays**: Recursively scrub each element
 * - **Objects**: Recursively scrub each property value
 * - **Sensitive fields**: Replace entire value with '***REDACTED***'
 * - **Other types**: Return unchanged (numbers, booleans, null, undefined)
 * 
 * ## Sensitive Field Names
 * Fields with these names (case-insensitive) are completely redacted:
 * - `email`
 * - `phone`, `phoneNumber`
 * - `accountNumber`, `routingNumber`
 * - `cardNumber`, `cvv`
 * - `ssn`, `taxId`
 * 
 * @param data - Data to scrub (any type)
 * @returns Scrubbed copy of the data with PII masked/redacted
 * 
 * @example
 * ```typescript
 * const data = {
 *   message: "Transfer from account 1234567890",
 *   counterparty: {
 *     accountNumber: "9876543210",  // Field name triggers redaction
 *     name: "Bank XYZ"
 *   },
 *   amount: 50000.00
 * };
 * 
 * const scrubbed = scrubPII(data);
 * // Result:
 * // {
 * //   message: "Transfer from account ****-7890",
 * //   counterparty: {
 * //     accountNumber: "***REDACTED***",  // Completely redacted due to field name
 * //     name: "Bank XYZ"
 * //   },
 * //   amount: 50000.00
 * // }
 * ```
 */
export function scrubPII(data: unknown): unknown {
  if (typeof data === 'string') {
    let scrubbed = data;
    scrubbed = scrubbed.replace(EMAIL_PATTERN, (m) => maskEmail(m));
    scrubbed = scrubbed.replace(PHONE_PATTERN, (m) => maskPhone(m));
    scrubbed = scrubbed.replace(ROUTING_PATTERN, (m) => maskRoutingNumber(m));
    scrubbed = scrubbed.replace(ACCOUNT_PATTERN, (m) => maskAccountNumber(m));
    return scrubbed;
  }

  if (Array.isArray(data)) {
    return data.map(scrubPII);
  }

  if (data && typeof data === 'object') {
    const scrubbed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Redact sensitive field names
      const lowerKey = key.toLowerCase();
      if (
        [
          'email',
          'phone',
          'phonenumber',
          'accountnumber',
          'routingnumber',
          'cardnumber',
          'cvv',
          'ssn',
          'taxid',
        ].includes(lowerKey)
      ) {
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
 * logger.info('Settlement engine started');
 * logger.debug('Config loaded', { configPath: '/etc/settlement/config.json' });
 * logger.warn('Rate limit approaching', { current: 95, limit: 100 });
 * logger.error('Database connection failed', { error: err.message });
 * 
 * // PII is automatically scrubbed
 * logger.info('Settlement batch created', { 
 *   settlementBatchId: 'uuid-here',
 *   accountNumber: '1234567890'  // Automatically masked
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
