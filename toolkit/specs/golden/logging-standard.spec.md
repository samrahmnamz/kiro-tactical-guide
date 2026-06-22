# Golden Spec: Logging Standard

## Status
**Type**: Golden Standard  
**Owner**: Platform Engineering  
**Status**: Approved  
**Version**: 1.0.0  
**Last Updated**: 2025-01-XX

---

## Intent

Establish organization-wide logging standards that ensure **security, compliance, observability, and operational excellence** across all services. This golden spec defines non-negotiable requirements for structured logging, PII protection, log aggregation readiness, and debugging support.

All services MUST follow these standards to:
1. **Prevent data leakage** by scrubbing PII before logging
2. **Enable centralized observability** with consistent structured formats
3. **Support debugging** with appropriate context and correlation IDs
4. **Meet compliance requirements** (GDPR, PCI DSS, SOX, etc.)
5. **Reduce cognitive load** with standardized patterns across all services

---

## Scope

### In Scope
- Application logging (services, functions, batch jobs)
- Log format and structure requirements
- PII scrubbing and sensitive data handling
- Log levels and appropriate usage
- Correlation ID propagation
- Development vs production logging behavior
- Integration with centralized log aggregation

### Out of Scope
- Infrastructure logs (load balancer, VPC flow logs) - covered by separate infrastructure golden spec
- Application Performance Monitoring (APM) traces - covered by `tracing-standard.spec.md`
- Security audit logs - covered by `audit-logging-standard.spec.md`
- Database query logs - database-specific configuration

---

## Contracts

### Log Entry Structure

All log entries MUST follow this JSON structure in production:

```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "level": "info",
  "message": "User action completed",
  "service": "payment-processor",
  "version": "1.2.3",
  "environment": "production",
  "correlationId": "req-abc-123",
  "traceId": "1-5e1234ab-1234567890abcdef12345678",
  "context": {
    "userId": "user-456",
    "action": "payment.process",
    "duration_ms": 234
  }
}
```

### Required Fields

Every log entry MUST include:
- `timestamp`: ISO 8601 format with milliseconds and timezone (UTC preferred)
- `level`: One of: `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- `message`: Human-readable description (no PII)
- `service`: Service name (kebab-case, matches repository name)
- `version`: Semantic version of deployed service (x.y.z)
- `environment`: Deployment environment (`development`, `staging`, `production`)

### Optional but Recommended Fields

- `correlationId`: Request/transaction identifier for tracing across services
- `traceId`: X-Ray trace ID for distributed tracing integration
- `context`: Object with additional structured data (user IDs, action names, performance metrics)
- `error`: Error object with `name`, `message`, `stack` for exceptions

---

## Constraints

### 1. PII Scrubbing (Security - MANDATORY)

**Constraint**: NO personally identifiable information (PII) may be logged in any environment.

**Requirements**:
- MUST automatically scrub PII patterns before logging:
  - Email addresses → mask to `firstChar***@domain.com`
  - Phone numbers → mask to `***-last4digits`
  - Credit card numbers → mask to `****-****-****-last4`
  - SSN/national IDs → mask completely to `***REDACTED***`
- MUST redact fields with sensitive names:
  - `email`, `phone`, `phoneNumber`, `cardNumber`, `ssn`, `password`, `token`, `apiKey`, `secret`
  - Field names are case-insensitive
- MUST apply scrubbing recursively to nested objects and arrays
- MUST scrub BEFORE logging (not after)

**Validation**:
- Unit tests MUST verify PII patterns are masked correctly
- Integration tests MUST verify no PII in actual log output
- Pre-commit hooks SHOULD scan committed code for logging calls with sensitive data
- Example implementations: `examples/notification-service/src/logger.ts`

**Rationale**: GDPR Article 5, PCI DSS Requirement 3.3, SOX Section 404 compliance. Data leakage prevention is non-negotiable.

### 2. Structured Logging (Observability - MANDATORY)

**Constraint**: All production logs MUST be in structured JSON format.

**Requirements**:
- Production environment: JSON format with consistent schema
- Development environment: Human-readable format allowed (colored, pretty-printed)
- MUST NOT use unstructured string concatenation in log messages
- MUST use fields in `context` object for variable data, not string interpolation in message

**Example - Correct**:
```typescript
logger.info('Payment processed', { 
  context: { 
    userId: 'user-123', 
    amount: 50.00, 
    currency: 'USD' 
  } 
});
```

**Example - Incorrect**:
```typescript
logger.info(`Payment of $50.00 processed for user-123`); // NO - unstructured
```

**Validation**:
- JSON schema validation on log output in CI/CD
- Log aggregation system MUST successfully parse all production logs
- Example implementations: `examples/*/src/logger.ts`

**Rationale**: Enables centralized log aggregation, querying, and alerting. Unstructured logs cannot be efficiently searched or analyzed at scale.

### 3. Log Levels (Operational Excellence - MANDATORY)

**Constraint**: Log levels MUST be used consistently according to semantic meaning.

**Level Definitions**:
- `trace`: Very detailed debugging (function entry/exit, variable values) - NEVER in production
- `debug`: Detailed debugging information (algorithm steps, state transitions) - Sparingly in production
- `info`: General operational messages (service started, request received, action completed) - Default production level
- `warn`: Potentially harmful situations that don't block operation (retry succeeded, deprecated API used, rate limit approaching)
- `error`: Error conditions that affect operations (request failed, external service unavailable, data validation error)
- `fatal`: Critical errors causing service shutdown (database unreachable, required config missing, unrecoverable state)

**Requirements**:
- Default production log level MUST be `info` or higher
- Log level MUST be configurable via environment variable (`LOG_LEVEL`)
- MUST NOT log sensitive operations (authentication, payment processing) at `debug` or `trace` levels
- Error logs MUST include error context: error type, message, and stack trace
- Fatal logs SHOULD trigger alerts/pages to on-call engineers

**Validation**:
- Code review MUST verify appropriate log level usage
- Monitoring MUST alert on `fatal` level logs
- Log volume SHOULD be reasonable (<1000 log lines per request)

**Rationale**: Consistent log levels enable effective filtering, alerting, and debugging. Excessive logging at low levels degrades performance and increases costs.

### 4. Correlation IDs (Distributed Systems - MANDATORY)

**Constraint**: All logs within a request/transaction MUST include the same correlation ID.

**Requirements**:
- MUST accept correlation ID from incoming requests (HTTP header: `X-Correlation-ID` or `X-Request-ID`)
- MUST generate new correlation ID if none provided (UUID v4 format)
- MUST include correlation ID in all log entries for that request
- MUST propagate correlation ID to downstream service calls (HTTP headers, message attributes)
- MUST include correlation ID in error responses for debugging

**Format**: `[prefix]-[uuid-v4]` where prefix indicates service/request type
- Examples: `req-a1b2c3d4-e5f6-7890-abcd-ef1234567890`, `job-12345678-90ab-cdef-1234-567890abcdef`

**Validation**:
- Integration tests MUST verify correlation ID propagation
- Log queries MUST be able to retrieve all logs for a single request using correlation ID
- Example implementations: `examples/*/src/index.ts` (middleware)

**Rationale**: Enables tracing requests across distributed services. Essential for debugging multi-service transactions.

### 5. Performance and Cost (Operational Excellence - MANDATORY)

**Constraint**: Logging MUST NOT degrade application performance or incur excessive costs.

**Requirements**:
- MUST use asynchronous/buffered logging (non-blocking)
- MUST NOT log complete request/response bodies (log metadata only)
- MUST limit log message size (max 8KB per log entry)
- MUST implement sampling for high-volume debug logs (e.g., 1% of requests)
- SHOULD use log rotation to prevent disk space exhaustion in local development

**Cost Optimization**:
- Production log retention: 7 days in hot storage, 90 days in cold storage, then delete
- Debug logs in production: Sample only, or enable temporarily for specific correlation IDs
- Avoid logging inside tight loops (>100 iterations)

**Validation**:
- Performance tests MUST verify <5ms latency overhead from logging
- Cost monitoring MUST track log storage and ingestion costs per service
- Load tests MUST verify logging doesn't become bottleneck under high traffic

**Rationale**: Excessive logging can cost more than compute resources. Logs must provide value without degrading user experience.

### 6. Development vs Production Behavior (Developer Experience - MANDATORY)

**Constraint**: Logging behavior MUST adapt to environment for developer productivity.

**Development Environment** (`NODE_ENV=development` or equivalent):
- Human-readable format: pretty-printed, colored output
- Include timestamps and log levels in readable format
- Allow higher verbosity (debug or trace levels)
- Log to console/stdout

**Production Environment** (`NODE_ENV=production` or equivalent):
- JSON format for log aggregation
- Compact output (no pretty-printing)
- Default to `info` level
- Log to stdout (captured by container runtime / log aggregation)

**Requirements**:
- MUST detect environment automatically (environment variable)
- MUST NOT require code changes to switch between development and production logging
- MUST provide clear documentation on configuring log level

**Validation**:
- CI/CD tests MUST run with production logging format
- Local development MUST use human-readable format by default
- Example implementations: `examples/*/src/logger.ts`

**Rationale**: Developers need readable logs during development. Production systems need parseable structured logs. Both must work without code changes.

---

## Design Decisions (and Why)

### Decision 1: Automatic PII Scrubbing vs Manual Developer Care

**Chosen**: Automatic scrubbing via logger hooks/middleware

**Alternatives Considered**:
1. Manual developer responsibility (linter rules, code review)
2. Post-log filtering in log aggregation system
3. No PII logging policy (trust developers)

**Why This Approach**:
- **Security by default**: Prevents accidental PII logging even during incidents when developers rush
- **Zero ongoing effort**: No developer training needed, no code review burden
- **Compliance proof**: Automated scrubbing provides audit trail for regulators
- **Trade-off accepted**: Slight performance overhead (2-3ms per log call) for guaranteed compliance

**Context**: After GDPR violations costing €20M+ at similar organizations, automated prevention is non-negotiable. Post-log filtering is too late—logs already breached compliance during transmission.

### Decision 2: JSON in Production, Pretty-Print in Development

**Chosen**: Environment-based format switching

**Alternatives Considered**:
1. Always JSON (even in development)
2. Always pretty-print (even in production)
3. Developer-configurable per service

**Why This Approach**:
- **Developer productivity**: Readable logs accelerate local debugging (30% faster issue resolution in internal study)
- **Production efficiency**: JSON parsing by log aggregation is 10x faster than unstructured logs
- **Zero configuration**: Environment variable auto-detection, no manual switches
- **Trade-off accepted**: Slight format difference between dev and prod (mitigated by CI/CD testing with production format)

**Context**: CloudWatch Logs Insights, Splunk, and Datadog all require structured JSON for efficient querying. Human-readable logs in production waste engineer time during outages.

### Decision 3: Correlation ID Format (UUID v4 with Prefix)

**Chosen**: `[service-prefix]-[uuid-v4]` format

**Alternatives Considered**:
1. Plain UUID v4 (no prefix)
2. Sequential IDs (database-generated)
3. Timestamp-based IDs (ULID)

**Why This Approach**:
- **Service identification**: Prefix allows quick identification of originating service in multi-service traces
- **Uniqueness guaranteed**: UUID v4 collision probability is negligible (<10⁻¹⁵ for billions of IDs)
- **No coordination needed**: No database or central ID service required (avoids single point of failure)
- **Kubernetes friendly**: Works across ephemeral containers without state sharing
- **Trade-off accepted**: Slightly longer IDs vs sequential (acceptable for log aggregation systems)

**Context**: Sequential IDs require coordination (database bottleneck). Timestamp-based IDs leak information about request rates. UUID v4 is the pragmatic choice.

### Decision 4: Log Level Semantics (6 Levels vs 4 Levels)

**Chosen**: 6-level system (trace, debug, info, warn, error, fatal)

**Alternatives Considered**:
1. 4-level system (debug, info, warn, error) - used by some languages
2. 3-level system (info, error, critical) - extreme minimalism
3. 8+ level system with fine-grained distinctions

**Why This Approach**:
- **Industry standard**: Aligns with syslog RFC 5424 and most logging frameworks (Pino, Winston, Log4j, Logback)
- **Clear semantics**: Each level has distinct operational meaning and alert routing
- **Fatal vs Error distinction**: Fatal logs trigger immediate pages; errors trigger investigation during business hours
- **Trace/Debug separation**: Trace is extremely verbose (disabled in prod); debug is useful for temporary troubleshooting
- **Trade-off accepted**: More levels to choose from vs simpler mental model (mitigated by clear definitions in this spec)

**Context**: After incidents where "everything is an error," we need semantic distinction. Fatal = wake up on-call engineer. Error = investigate next day. Warn = monitor for patterns.

### Decision 5: Default Log Level: Info (not Debug)

**Chosen**: Default production log level is `info`

**Alternatives Considered**:
1. Default to `debug` for more visibility
2. Default to `warn` to reduce noise
3. Different defaults per environment

**Why This Approach**:
- **Cost-performance balance**: Info logs capture operational events without excessive volume
- **Signal-to-noise ratio**: Debug logs in production overwhelm engineers (90% noise in post-incident analysis)
- **Temporary elevation**: Can enable debug logs for specific correlation IDs during active troubleshooting
- **Industry standard**: AWS, Google Cloud, Azure all default to info level
- **Trade-off accepted**: May miss some debugging context vs always having it (mitigated by dynamic log level adjustment)

**Context**: Analysis of production incidents showed <5% of debugs were useful. Info-level logs plus X-Ray traces provide 95% of needed context at 10% of log volume.

---

## Implementation Guidance

### Recommended Libraries

**Node.js / TypeScript**:
- **Primary**: Pino (https://getpino.io/)
  - Fastest Node.js logger (5-10x faster than Winston)
  - Built-in pretty-printing for development (`pino-pretty`)
  - Supports custom serializers and hooks for PII scrubbing
- **Alternative**: Winston (https://github.com/winstonjs/winston)
  - More flexible transports, slightly slower

**Python**:
- **Primary**: `structlog` (https://www.structlog.org/)
  - Structured logging with processor chains
  - Easy PII scrubbing via processors
- **Alternative**: Standard library `logging` with JSON formatter

**Java**:
- **Primary**: Logback (https://logback.qos.ch/)
  - Built-in JSON encoding with `logstash-logback-encoder`
  - PatternLayout for masking PII
- **Alternative**: Log4j 2 with JSON layout

**Go**:
- **Primary**: `zap` (https://github.com/uber-go/zap)
  - Zero-allocation logging for performance
  - Structured logging with type-safe fields
- **Alternative**: `logrus` with JSON formatter

### Quick Start: Implementing This Standard

**Step 1**: Copy reference implementation from `examples/notification-service/src/logger.ts`

**Step 2**: Customize PII patterns for your domain
```typescript
// Add custom sensitive patterns
const INTERNAL_ID_PATTERN = /INTERNAL-\d{6}/g;  // Example: company-specific IDs
```

**Step 3**: Configure environment-based behavior
```typescript
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? 'json' : 'pretty'
});
```

**Step 4**: Add correlation ID middleware (HTTP services)
```typescript
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || generateUUID();
  res.setHeader('X-Correlation-ID', req.correlationId);
  logger.child({ correlationId: req.correlationId });
  next();
});
```

**Step 5**: Validate with tests
```typescript
describe('PII Scrubbing', () => {
  it('masks email addresses', () => {
    const logOutput = captureLogOutput(() => {
      logger.info('User registered', { email: 'test@example.com' });
    });
    expect(logOutput).toContain('t***@example.com');
    expect(logOutput).not.toContain('test@example.com');
  });
});
```

---

## Test Expectations

### Positive Cases (✓ Must Pass)

1. **✓ PII Masking - Email**: Log entry with email address MUST mask to `firstChar***@domain.com`
   ```typescript
   logger.info('Test', { email: 'john.doe@example.com' });
   // Expected output: email: 'j***@example.com'
   ```

2. **✓ PII Masking - Phone**: Log entry with phone number MUST mask to `***-last4`
   ```typescript
   logger.info('Test', { phone: '+1-555-123-4567' });
   // Expected output: phone: '***-4567'
   ```

3. **✓ PII Masking - Credit Card**: Log entry with card number MUST mask to `****-****-****-last4`
   ```typescript
   logger.info('Test', { card: '4242-4242-4242-4242' });
   // Expected output: card: '****-****-****-4242'
   ```

4. **✓ Field Name Redaction**: Fields named `email`, `phone`, `password`, `token` MUST be completely redacted
   ```typescript
   logger.info('Test', { email: 'test@example.com', name: 'John' });
   // Expected output: email: '***REDACTED***', name: 'John'
   ```

5. **✓ Recursive Scrubbing**: Nested objects and arrays MUST have PII scrubbed at all levels
   ```typescript
   logger.info('Test', { user: { email: 'test@example.com', id: '123' }, items: ['+1-555-1234'] });
   // Expected output: user: { email: '***REDACTED***', id: '123' }, items: ['***-1234']
   ```

6. **✓ JSON Format in Production**: When `NODE_ENV=production`, logs MUST be valid JSON
   ```bash
   NODE_ENV=production node app.js | jq .
   # Must not error; all logs parseable as JSON
   ```

7. **✓ Correlation ID Propagation**: Correlation ID MUST appear in all logs within same request
   ```typescript
   // Initial request sets correlationId='req-abc-123'
   logger.info('Step 1');  // Must include correlationId: 'req-abc-123'
   logger.info('Step 2');  // Must include correlationId: 'req-abc-123'
   ```

8. **✓ Log Level Filtering**: When `LOG_LEVEL=warn`, debug and info logs MUST NOT appear
   ```bash
   LOG_LEVEL=warn node app.js
   # debug() and info() calls produce no output
   ```

9. **✓ Required Fields Present**: Every log MUST include timestamp, level, message, service, version, environment
   ```typescript
   const logEntry = JSON.parse(logOutput);
   expect(logEntry).toHaveProperty('timestamp');
   expect(logEntry).toHaveProperty('level');
   expect(logEntry).toHaveProperty('message');
   expect(logEntry).toHaveProperty('service');
   expect(logEntry).toHaveProperty('version');
   expect(logEntry).toHaveProperty('environment');
   ```

10. **✓ Error Stack Traces**: Error logs MUST include stack trace when error object provided
    ```typescript
    logger.error('Operation failed', { error: new Error('Connection timeout') });
    // Expected: log includes error.stack field
    ```

### Negative Cases (✗ Must Reject/Block)

1. **✗ Raw PII in Logs**: Log output MUST NOT contain unmasked email addresses
   ```typescript
   logger.info('User action', { email: 'john.doe@example.com' });
   // Validation: grep log output, MUST NOT find 'john.doe@example.com'
   ```

2. **✗ Raw PII in Messages**: Log messages MUST NOT contain unmasked phone numbers
   ```typescript
   logger.info('Contact user at +1-555-123-4567');
   // Validation: log output MUST NOT contain '+1-555-123-4567'
   ```

3. **✗ Sensitive Field Values**: Fields named `password`, `token`, `apiKey`, `secret` MUST NOT contain actual values
   ```typescript
   logger.info('Auth', { password: 'hunter2', username: 'admin' });
   // Validation: log output MUST NOT contain 'hunter2'
   ```

4. **✗ Unstructured Logs in Production**: When `NODE_ENV=production`, plain string logs MUST NOT be used
   ```typescript
   // BAD - triggers lint error or CI failure
   console.log('User logged in');  
   // GOOD - structured with context
   logger.info('User logged in', { context: { userId: 'user-123' } });
   ```

5. **✗ Missing Correlation ID**: HTTP responses MUST NOT omit correlation ID header
   ```bash
   curl -i http://api.example.com/test
   # Must include: X-Correlation-ID: req-...
   ```

6. **✗ Log Level Misuse**: Authentication failures MUST NOT be logged at `info` level (use `warn` or `error`)
   ```typescript
   // BAD
   logger.info('Login failed', { username: 'admin' });
   // GOOD
   logger.warn('Login failed', { context: { reason: 'invalid_credentials' } });
   ```

7. **✗ Excessive Log Volume**: Single request MUST NOT generate >1000 log lines
   ```typescript
   // BAD - log inside loop
   for (let i = 0; i < 10000; i++) {
     logger.debug('Processing item', { index: i });
   }
   // GOOD - sample or aggregate
   if (i % 100 === 0) {
     logger.debug('Processing batch', { batchStart: i });
   }
   ```

8. **✗ Large Log Payloads**: Single log entry MUST NOT exceed 8KB
   ```typescript
   // Validation: CI/CD MUST fail if log entry > 8192 bytes
   logger.info('Request', { body: largeObject });  // REJECTED if too large
   ```

### Edge Cases (Must Handle Gracefully)

1. **Edge: Null/Undefined Values**: Logger MUST handle null/undefined without errors
   ```typescript
   logger.info('Test', { user: null, data: undefined });
   // Must not throw; includes fields with null/undefined values
   ```

2. **Edge: Circular References**: Logger MUST handle circular object references
   ```typescript
   const obj = { name: 'test' };
   obj.self = obj;
   logger.info('Circular', { data: obj });
   // Must not throw; may serialize as '[Circular]' or equivalent
   ```

3. **Edge: Non-UTF8 Characters**: Logger MUST handle non-UTF8 characters gracefully
   ```typescript
   logger.info('Test', { text: 'Hello \uD83D\uDE00 World' });
   // Must log without corruption
   ```

4. **Edge: Logger Initialization Failure**: Application MUST NOT crash if logger initialization fails
   ```typescript
   // If logger setup fails, fall back to console with warning
   try {
     setupLogger();
   } catch (err) {
     console.warn('Logger init failed, using console fallback');
   }
   ```

---

## Integration Points

### Services Following This Standard

This golden spec MUST be referenced by all application services:

- `examples/payment-processor/` - Reference implementation with PCI DSS compliance
- `examples/notification-service/` - Reference implementation with PII scrubbing
- `examples/rate-limiter/` - Reference implementation with performance logging
- `examples/settlement-engine/` - Reference implementation with audit logging

### Related Golden Specs

- **`tracing-standard.spec.md`**: X-Ray trace ID propagation and distributed tracing
- **`observability.spec.md`**: Metrics, alarms, and dashboards (complements logging)
- **`audit-logging-standard.spec.md`**: Compliance audit logs (higher retention, immutability)
- **`error-handling-standard.spec.md`**: Error response format and logging patterns

### External Systems

**Log Aggregation** (Required):
- **CloudWatch Logs**: All production services MUST ship logs to CloudWatch
  - Log group naming: `/aws/[service-type]/[service-name]/[environment]`
  - Example: `/aws/lambda/payment-processor/production`
- **Retention**: 7 days in hot storage, 90 days in S3 cold storage

**Alerting** (Required):
- **Fatal logs**: MUST trigger immediate PagerDuty alert to on-call engineer
- **Error logs**: MUST create ticket for investigation (aggregate by error type)
- **Warn logs**: SHOULD aggregate to daily summary for proactive monitoring

**Distributed Tracing** (Recommended):
- **AWS X-Ray**: Correlation IDs SHOULD map to X-Ray trace IDs
- **OpenTelemetry**: Logging SHOULD integrate with OTEL span context

**SIEM Integration** (Regulated Industries):
- **Splunk/Datadog**: JSON logs directly ingestible
- **Security Events**: Auth failures, permission denials MUST flow to SIEM

---

## Compliance Mapping

### GDPR (General Data Protection Regulation)

- **Article 5 (Data Minimization)**: PII scrubbing ensures minimal personal data in logs
- **Article 17 (Right to be Forgotten)**: 90-day log retention enables data deletion
- **Article 32 (Security)**: Encrypted log storage, access controls on log systems

### PCI DSS (Payment Card Industry Data Security Standard)

- **Requirement 3.3**: Cardholder data masking (only last 4 digits visible)
- **Requirement 3.4**: Cardholder data unreadable (masking before storage)
- **Requirement 10**: Audit trail requirements (correlation IDs enable tracing)

### SOX (Sarbanes-Oxley Act)

- **Section 404**: Internal control documentation (logs provide audit trail)
- **Retention**: 7-year retention for financial transaction logs (implemented via S3 lifecycle)

### HIPAA (Health Insurance Portability and Accountability Act)

- **§164.312(b)**: Audit controls (log access, modifications, deletions)
- **§164.308(a)(5)**: Automatic logoff after inactivity (not applicable to logging itself)
- **PHI Masking**: Protected Health Information treated same as PII (automatic scrubbing)

---

## Rollout and Adoption

### Phase 1: New Services (Immediate)

- All NEW services MUST implement this standard from Day 1
- Use reference implementation from `examples/notification-service/src/logger.ts`
- Validation hook `toolkit/hooks/validate-against-golden.yaml` MUST pass before deployment

### Phase 2: Existing Services (12-Month Migration)

**Month 1-3**: Add PII scrubbing to existing loggers
- Copy `scrubPII()` function from reference implementation
- Add tests to verify PII patterns are masked
- Deploy to non-production environments

**Month 4-6**: Convert to structured JSON logging
- Replace string concatenation with structured fields
- Test JSON parsing in CI/CD
- Deploy to production with gradual rollout

**Month 7-9**: Add correlation ID propagation
- Implement middleware/interceptors for correlation IDs
- Update integration tests
- Deploy to production

**Month 10-12**: Full compliance validation
- Run `validate-against-golden.yaml` hook
- Verify all log queries work in CloudWatch Logs Insights
- Document any exceptions with rationale

### Phase 3: Enforcement (After Month 12)

- CI/CD pipeline MUST block deployments that don't follow this standard
- Code review checklist MUST include logging standard compliance
- Quarterly audits to verify ongoing compliance

### Migration Support

**Platform Engineering Provides**:
- Migration guide with code samples for each language
- Office hours for teams needing assistance
- Automated migration script for common frameworks
- Slack channel: `#logging-standard-help`

**Service Teams Responsible For**:
- Implementing standard in their services
- Writing tests to verify compliance
- Updating runbooks and documentation
- Training new team members

---

## Exceptions and Waivers

### When Exceptions Are Allowed

Exceptions to this golden spec MAY be granted for:

1. **Legacy System Integration**: Systems with technical constraints preventing compliance
   - Example: Third-party vendor logging that cannot be modified
   - Mitigation: Log scrubbing gateway between legacy system and log aggregation

2. **Performance-Critical Paths**: Hot paths where logging overhead is unacceptable
   - Example: Inner loop of high-frequency trading algorithm
   - Mitigation: Implement sampling (log 1% of operations) or aggregate logs

3. **Specialized Compliance Requirements**: Regulated systems with stricter logging requirements
   - Example: Financial audit logs requiring immutability and 7-year retention
   - Mitigation: Use separate audit logging system with appropriate controls

### Exception Request Process

1. **Document Rationale**: Create spec section explaining why standard cannot be followed
2. **Propose Mitigation**: Document alternative approach and risk acceptance
3. **Platform Team Review**: Submit to platform engineering for approval
4. **Annual Re-evaluation**: Exceptions reviewed yearly; technology may have changed

### Tracking Exceptions

- All exceptions documented in `docs/golden-spec-exceptions.md`
- Exceptions include: service name, date granted, rationale, mitigation, next review date
- Dashboards track exception count (goal: <5% of services)

---

## Lessons Learned

### Incident 2024-03-15: Customer PII Leaked in Logs

**What Happened**: Engineer logged request body for debugging, accidentally exposing 5,000 customer email addresses in CloudWatch. Discovered during GDPR audit.

**Root Cause**: No automatic PII scrubbing; reliance on developer awareness.

**Impact**: GDPR fine avoided by proving accidental breach + immediate remediation. 40 hours of incident response.

**Lesson**: Manual PII prevention doesn't work under pressure. Automatic scrubbing MUST be enforced by logger, not developer discipline.

**Encoded as Constraint**: Section 1 - PII Scrubbing (Security - MANDATORY)

### Incident 2024-05-22: Unstructured Logs During Outage

**What Happened**: Production outage, engineers unable to query logs efficiently. 50% of services logged unstructured strings, not JSON.

**Root Cause**: Inconsistent logging practices; some teams used `console.log()` directly.

**Impact**: Mean Time to Resolution increased by 45 minutes. Unable to correlate events across services.

**Lesson**: Structured logging is not optional. Outages are when you need logs most—can't afford unqueryable data.

**Encoded as Constraint**: Section 2 - Structured Logging (Observability - MANDATORY)

### Incident 2024-08-10: Debug Logs Cost $12,000/Month

**What Happened**: Service accidentally deployed with `LOG_LEVEL=debug` to production. Generated 2TB of logs per day.

**Root Cause**: Environment variable not properly set in deployment configuration.

**Impact**: $12,000 extra CloudWatch Logs cost in first month. Performance degradation from log volume.

**Lesson**: Default to appropriate log level. Make debug opt-in, not accidental.

**Encoded as Constraint**: Section 3 - Log Levels, Section 5 - Performance and Cost

### Incident 2024-10-03: Multi-Service Transaction Debugging Failure

**What Happened**: Payment processing bug affecting multiple microservices. Unable to trace requests across services due to missing/inconsistent correlation IDs.

**Root Cause**: Correlation ID implementation varied per service; some didn't propagate IDs.

**Impact**: 8 hours to debug transaction flow that should have taken 30 minutes with proper tracing.

**Lesson**: Correlation IDs are non-negotiable for distributed systems. Standardize implementation.

**Encoded as Constraint**: Section 4 - Correlation IDs (Distributed Systems - MANDATORY)

---

## Tooling and Automation

### Enforcement Hooks

**Pre-commit**: `toolkit/hooks/scan-logs-for-pii.yaml`
- Scans code for logging calls with potential PII
- Blocks commits with unmasked sensitive data
- Example: `logger.info(\`User email: ${email}\`)` → BLOCKED

**On File Save**: `toolkit/hooks/validate-logger-usage.yaml`
- Checks logger is imported from standard module
- Verifies no direct `console.log()` usage in production code
- Suggests corrections

**CI/CD**: `toolkit/hooks/validate-against-golden.yaml`
- Runs test suite to verify logging standard compliance
- Validates JSON format in production mode
- Checks PII scrubbing test coverage

### Developer Tools

**Linter Rules**: ESLint/Pylint/Checkstyle configuration
- No direct console logging (except in tests)
- No string interpolation in log messages (use structured fields)
- No sensitive field names in logging calls

**IDE Snippets**: Code snippets for common logging patterns
- `loginfo` → generates structured info log with correlation ID
- `logerror` → generates error log with stack trace
- `logpii` → generates PII-safe logging with scrubbing reminder

**Testing Utilities**: `toolkit/testing/logger-test-helpers.ts`
- `captureLogOutput()`: Captures logger output for assertions
- `assertNoPII()`: Validates log output contains no raw PII
- `mockLogger()`: Mock logger for unit tests

---

## Questions and Support

### FAQ

**Q: What if I need to log actual PII for debugging?**  
A: Use structured fields with scrubbing disabled ONLY in local development (`NODE_ENV=development`). Never in production.

**Q: How do I temporarily enable debug logs in production?**  
A: Set `LOG_LEVEL=debug` environment variable and redeploy, OR implement dynamic log level adjustment via API endpoint (with auth controls).

**Q: What if my logging library doesn't support hooks for PII scrubbing?**  
A: Wrap library with custom logger class that scrubs before passing to underlying library. See `examples/*/src/logger.ts` for patterns.

**Q: How do I handle logs from third-party libraries?**  
A: If library allows custom logger, inject your logger. Otherwise, log to separate stream and scrub during aggregation (less ideal).

**Q: What's the performance impact of PII scrubbing?**  
A: 2-3ms per log call. Negligible for most services. If performance-critical, implement sampling or move to separate thread/process.

### Contact

- **Spec Owner**: Platform Engineering Team
- **Slack Channel**: `#logging-standard`
- **Office Hours**: Tuesdays 2-3pm PT
- **GitHub Issues**: `kiro-cloudeng-devops/issues` (label: `logging-standard`)

---

## Changelog

### Version 1.0.0 (2025-01-XX)
- Initial golden spec
- PII scrubbing requirements
- Structured logging requirements
- Log level semantics
- Correlation ID propagation
- Performance and cost constraints
- Development vs production behavior
- Compliance mappings (GDPR, PCI DSS, SOX, HIPAA)
- Migration plan and enforcement hooks

### Future Enhancements (Planned)
- **v1.1**: OpenTelemetry integration guidance
- **v1.2**: Log sampling strategies for high-volume services
- **v1.3**: Multi-region log aggregation patterns
- **v1.4**: Real-time log streaming for anomaly detection
