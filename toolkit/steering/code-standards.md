---
inclusion: always
---

# Coding Standards for All AI-Generated Code

This steering file ensures AI-generated code follows team coding patterns consistently. It's automatically included in every code generation context.

## Rate Limiting

- **ALWAYS use sliding window algorithm, never fixed window**
- **Reason**: Fixed window allows burst traffic at window boundaries
- **Implementation**: Use Redis sorted sets with ZREMRANGEBYSCORE

Example:
```typescript
// ✓ CORRECT: Sliding window using Redis sorted sets
async function checkRateLimit(userId: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);
  
  // Remove old entries outside the window
  await redis.zremrangebyscore(`ratelimit:${userId}`, 0, windowStart);
  
  // Count requests in current window
  const count = await redis.zcard(`ratelimit:${userId}`);
  
  if (count >= limit) {
    return false; // Rate limited
  }
  
  // Add current request
  await redis.zadd(`ratelimit:${userId}`, now, `${now}`);
  return true; // Allowed
}

// ✗ WRONG: Fixed window (bursty at boundaries)
// async function checkRateLimit(userId: string, limit: number) {
//   const bucket = Math.floor(Date.now() / 60000); // 1-minute bucket
//   const key = `ratelimit:${userId}:${bucket}`;
//   const count = await redis.incr(key);
//   return count <= limit;
// }
```

## Error Handling

- **ALWAYS handle external service failures gracefully (fail-open with logging)**
- **NEVER let unhandled exceptions crash the service**
- **Pattern**: Try-catch with fallback behavior

Example:
```typescript
// ✓ CORRECT: Graceful error handling with fail-open
try {
  const result = await externalService.call();
  return result;
} catch (error) {
  logger.error('External service failed', { 
    error, 
    service: 'externalService',
    fallback: 'defaultValue' 
  });
  return defaultValue; // Fail-open
}

// ✗ WRONG: Let exceptions propagate and crash
// const result = await externalService.call(); // No error handling
// return result;
```

## Redis Usage

- **ALWAYS use connection pooling (ioredis cluster mode)**
- **ALWAYS set command timeout (5 seconds default)**
- **NEVER use blocking operations (BLPOP, BRPOP) in request handlers**
- **Pattern**: Configure cluster with retry strategy

Example:
```typescript
// ✓ CORRECT: Connection pooling with timeouts and retry
import Redis from 'ioredis';

const redis = new Redis.Cluster([
  { host: 'redis-node-1', port: 6379 },
  { host: 'redis-node-2', port: 6379 },
  { host: 'redis-node-3', port: 6379 }
], {
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  clusterRetryStrategy: (times) => Math.min(times * 100, 2000),
  redisOptions: {
    commandTimeout: 5000, // 5 second timeout
    connectTimeout: 10000
  }
});

// ✗ WRONG: Single connection without timeout
// const redis = new Redis({ host: 'localhost', port: 6379 });
```

## Logging

- **NEVER log PII (credit cards, SSNs, emails, phone numbers)**
- **ALWAYS mask sensitive data**: `card: '****1234'`
- **ALWAYS include request ID in structured logs**
- **Pattern**: Structured logging with masked sensitive fields

Example:
```typescript
// ✓ CORRECT: Structured logging with PII masking
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}

function maskCard(card: string): string {
  return `****${card.slice(-4)}`;
}

logger.info('Payment processed', {
  requestId: req.id,
  amount: payment.amount,
  currency: payment.currency,
  card: maskCard(payment.card),           // Masked
  customerEmail: maskEmail(payment.email) // Masked
});

// ✗ WRONG: Log full PII
// logger.info('Payment processed', {
//   card: payment.card,           // Full card number exposed
//   email: payment.email          // Email exposed
// });
```

## Performance

- **ALWAYS set explicit timeouts for external API calls (≤ 5 seconds)**
- **ALWAYS use pipelining for multiple Redis operations**
- **NEVER make sequential external calls in loops — batch them**
- **Pattern**: Timeout configuration and batching

Example:
```typescript
// ✓ CORRECT: Explicit timeouts and batching
const stripe = new Stripe(apiKey, {
  timeout: 5000, // 5 second timeout
  maxNetworkRetries: 2
});

// Batch multiple operations using Promise.all
const results = await Promise.all([
  stripe.charges.create(charge1),
  stripe.charges.create(charge2),
  stripe.charges.create(charge3)
]);

// ✗ WRONG: No timeouts, sequential calls in loop
// for (const charge of charges) {
//   await stripe.charges.create(charge); // Sequential, slow
// }
```

## Database Queries

- **ALWAYS use parameterized queries (never string concatenation)**
- **ALWAYS set query timeouts**
- **ALWAYS use connection pooling**
- **NEVER trust user input directly in queries**

Example:
```typescript
// ✓ CORRECT: Parameterized query with timeout
const result = await db.query(
  'SELECT * FROM users WHERE id = $1 AND status = $2',
  [userId, 'active'],
  { timeout: 5000 }
);

// ✗ WRONG: SQL injection vulnerability
// const result = await db.query(
//   `SELECT * FROM users WHERE id = '${userId}'` // SQL injection risk!
// );
```

## API Response Structure

- **ALWAYS use consistent error response format**
- **ALWAYS include error codes and user-friendly messages**
- **NEVER expose internal error details to clients**
- **Pattern**: Standardized error response

Example:
```typescript
// ✓ CORRECT: Consistent error response structure
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Request failed', { error: err, requestId: req.id });
  
  const response: ErrorResponse = {
    error: {
      code: err.code || 'internal_error',
      message: err.message || 'An internal error occurred'
      // Never include: stack trace, internal paths, database errors
    }
  };
  
  res.status(err.statusCode || 500).json(response);
});

// ✗ WRONG: Expose internal error details
// app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
//   res.status(500).json({ error: err.stack }); // Exposes internal details!
// });
```

## Async/Await Best Practices

- **ALWAYS handle promise rejections**
- **NEVER use async without await or proper error handling**
- **ALWAYS use try-catch for async operations**
- **Pattern**: Proper async error handling

Example:
```typescript
// ✓ CORRECT: Proper async error handling
async function processPayment(payment: Payment): Promise<Result> {
  try {
    const charge = await stripe.charges.create(payment);
    await db.saveCharge(charge);
    return { success: true, chargeId: charge.id };
  } catch (error) {
    logger.error('Payment processing failed', { error, payment });
    return { success: false, error: error.message };
  }
}

// ✗ WRONG: Unhandled promise rejection
// async function processPayment(payment: Payment): Promise<Result> {
//   const charge = await stripe.charges.create(payment); // Could reject!
//   await db.saveCharge(charge);                         // Could reject!
//   return { success: true };
// }
```

## Environment Configuration

- **ALWAYS use environment variables for configuration**
- **NEVER hardcode environment-specific values**
- **ALWAYS validate required environment variables on startup**
- **Pattern**: Validated configuration loading

Example:
```typescript
// ✓ CORRECT: Validated environment configuration
interface Config {
  port: number;
  redisUrl: string;
  stripeApiKey: string;
  nodeEnv: 'development' | 'staging' | 'production';
}

function loadConfig(): Config {
  const required = ['REDIS_URL', 'STRIPE_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    redisUrl: process.env.REDIS_URL!,
    stripeApiKey: process.env.STRIPE_API_KEY!,
    nodeEnv: (process.env.NODE_ENV as any) || 'development'
  };
}

const config = loadConfig(); // Fails fast if misconfigured

// ✗ WRONG: Hardcoded values
// const config = {
//   port: 3000,
//   redisUrl: 'redis://localhost:6379', // Hardcoded!
//   stripeApiKey: 'sk_test_...'          // Hardcoded secret!
// };
```

## Testing Patterns

- **ALWAYS write tests for new functionality**
- **ALWAYS test error paths, not just happy paths**
- **ALWAYS use dependency injection for testability**
- **Pattern**: Testable code with mocked dependencies

Example:
```typescript
// ✓ CORRECT: Dependency injection for testability
class PaymentService {
  constructor(
    private stripe: StripeClient,
    private db: Database,
    private logger: Logger
  ) {}
  
  async processPayment(payment: Payment): Promise<Result> {
    try {
      const charge = await this.stripe.charges.create(payment);
      await this.db.saveCharge(charge);
      this.logger.info('Payment processed', { chargeId: charge.id });
      return { success: true, chargeId: charge.id };
    } catch (error) {
      this.logger.error('Payment failed', { error });
      return { success: false, error: error.message };
    }
  }
}

// Test with mocks
describe('PaymentService', () => {
  it('should process payment successfully', async () => {
    const mockStripe = { charges: { create: jest.fn().resolves({ id: 'ch_123' }) } };
    const mockDb = { saveCharge: jest.fn().resolves() };
    const mockLogger = { info: jest.fn(), error: jest.fn() };
    
    const service = new PaymentService(mockStripe as any, mockDb as any, mockLogger as any);
    const result = await service.processPayment({ amount: 1000 });
    
    expect(result.success).toBe(true);
    expect(mockStripe.charges.create).toHaveBeenCalled();
  });
});

// ✗ WRONG: Hard dependencies make testing impossible
// class PaymentService {
//   async processPayment(payment: Payment) {
//     const stripe = new Stripe('hardcoded-key'); // Can't mock!
//     const charge = await stripe.charges.create(payment);
//     // ... impossible to test without real Stripe API
//   }
// }
```

## Impact

When AI follows these standards:
- **Consistency**: All generated code follows the same patterns
- **Security**: PII is never logged, SQL injection prevented
- **Reliability**: External failures handled gracefully
- **Performance**: Timeouts prevent cascading failures
- **Testability**: Dependency injection enables comprehensive testing

**Measured outcomes** (from tactical guide):
- PR review time: 45 min → 15 min (consistency enforced)
- Code rework: 30% → <5% (standards prevent common mistakes)
- Production incidents: 70% reduction (error handling + performance patterns)
