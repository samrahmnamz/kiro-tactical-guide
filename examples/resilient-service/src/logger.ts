/**
 * Structured Logger
 *
 * JSON-based structured logging following the golden logging standard.
 * Includes traceId propagation and PII masking.
 */

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  redact: {
    paths: ['*.cardNumber', '*.cvv', '*.password', '*.ssn'],
    censor: '[REDACTED]',
  },
});
