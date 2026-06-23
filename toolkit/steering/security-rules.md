---
inclusion: always
---

# Security Constraints for All AI-Generated Code

This steering file ensures AI-generated code follows security best practices. It's automatically included in every code generation context.

## IAM Policies

- **NEVER use wildcard actions**: `"Action": "*"` is FORBIDDEN
- **NEVER use wildcard resources**: `"Resource": "*"` is FORBIDDEN
- **ALWAYS use least-privilege**: specify exact actions and resources
- **Pattern**: Specific IAM policies with explicit permissions

### Bad Example (Wildcard - FORBIDDEN):
```json
{
  "Effect": "Allow",
  "Action": "*",
  "Resource": "*"
}
```

### Good Example (Least-Privilege):
```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:Query"
  ],
  "Resource": [
    "arn:aws:dynamodb:us-east-1:123456789012:table/PaymentTable",
    "arn:aws:dynamodb:us-east-1:123456789012:table/PaymentTable/index/*"
  ]
}
```

### CDK/Terraform Example:
```typescript
// ✓ CORRECT: Specific resource ARNs
lambdaRole.addToPolicy(new PolicyStatement({
  actions: ['secretsmanager:GetSecretValue'],
  resources: ['arn:aws:secretsmanager:us-east-1:123456789012:secret:payment-processor/*']
}));

lambdaRole.addToPolicy(new PolicyStatement({
  actions: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:Query'],
  resources: [
    paymentTable.tableArn,
    `${paymentTable.tableArn}/index/*`
  ]
}));

// ✗ WRONG: Wildcard permissions
// lambdaRole.addToPolicy(new PolicyStatement({
//   actions: ['*'],
//   resources: ['*']
// }));
```

## Data Encryption

- **ALWAYS encrypt data at rest (AES-256)**
- **ALWAYS use TLS 1.2+ for data in transit**
- **ALWAYS encrypt sensitive fields before storing in DynamoDB**
- **Pattern**: Application-layer encryption with KMS

Example:
```typescript
// ✓ CORRECT: Encrypt sensitive data before storage
import { KMS } from 'aws-sdk';

const kms = new KMS();

async function encryptData(plaintext: string, keyId: string): Promise<string> {
  const { CiphertextBlob } = await kms.encrypt({
    KeyId: keyId,
    Plaintext: plaintext
  }).promise();
  
  return CiphertextBlob!.toString('base64');
}

async function decryptData(ciphertext: string, keyId: string): Promise<string> {
  const { Plaintext } = await kms.decrypt({
    CiphertextBlob: Buffer.from(ciphertext, 'base64')
  }).promise();
  
  return Plaintext!.toString('utf8');
}

// Store encrypted data
const encryptedEmail = await encryptData(customerEmail, KMS_KEY_ID);
const encryptedCardLastFour = await encryptData(cardLastFour, KMS_KEY_ID);

await dynamodb.putItem({
  paymentId,
  customerEmail: encryptedEmail,      // Encrypted
  cardLastFour: encryptedCardLastFour, // Encrypted
  amount: payment.amount,              // Not sensitive, not encrypted
  keyId: KMS_KEY_ID
});

// ✗ WRONG: Plaintext storage of sensitive data
// await dynamodb.putItem({
//   paymentId,
//   customerEmail: customerEmail,      // Plaintext PII!
//   cardLastFour: cardLastFour         // Plaintext PII!
// });
```

### DynamoDB Encryption at Rest:
```typescript
// ✓ CORRECT: Enable encryption at rest for DynamoDB table
const table = new dynamodb.Table(this, 'PaymentTable', {
  tableName: 'PaymentRecords',
  partitionKey: { name: 'paymentId', type: dynamodb.AttributeType.STRING },
  encryption: dynamodb.TableEncryption.AWS_MANAGED, // or CUSTOMER_MANAGED
  pointInTimeRecovery: true
});

// ✗ WRONG: No encryption configured
// const table = new dynamodb.Table(this, 'PaymentTable', {
//   tableName: 'PaymentRecords',
//   partitionKey: { name: 'paymentId', type: dynamodb.AttributeType.STRING }
//   // No encryption specified!
// });
```

## Authentication & Authorization

- **ALWAYS validate JWT tokens on every request**
- **ALWAYS check user permissions before allowing operations**
- **NEVER trust client-provided user IDs — extract from verified token**
- **Pattern**: Token verification and permission checks

Example:
```typescript
// ✓ CORRECT: Verify token and check permissions
import jwt from 'jsonwebtoken';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    permissions: string[];
  };
}

async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req.headers.authorization);
    
    if (!token) {
      return res.status(401).json({ error: { code: 'missing_token', message: 'Authentication required' } });
    }
    
    // Verify token signature and expiration
    const decoded = jwt.verify(token, JWT_PUBLIC_KEY) as any;
    
    // Extract user info from verified token
    req.user = {
      userId: decoded.sub,
      permissions: decoded.permissions || []
    };
    
    next();
  } catch (error) {
    return res.status(401).json({ error: { code: 'invalid_token', message: 'Invalid authentication token' } });
  }
}

function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'not_authenticated', message: 'Authentication required' } });
    }
    
    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: { code: 'forbidden', message: 'Insufficient permissions' } });
    }
    
    next();
  };
}

// Usage: Verify token AND check permission
app.post('/api/payments', authenticate, requirePermission('payments:process'), async (req, res) => {
  // User is authenticated and authorized
  const userId = req.user!.userId; // From verified token, not client input!
  // ... process payment
});

// ✗ WRONG: Trust client-provided user ID
// app.post('/api/payments', async (req, res) => {
//   const userId = req.body.userId; // Client can fake this!
//   // ... process payment (security vulnerability!)
// });
```

## Input Validation

- **ALWAYS validate and sanitize user inputs**
- **ALWAYS use parameterized queries (never string concatenation)**
- **ALWAYS enforce rate limiting on public endpoints**
- **Pattern**: Input validation with schema libraries

Example:
```typescript
// ✓ CORRECT: Input validation with schema
import Joi from 'joi';

const paymentSchema = Joi.object({
  amount: Joi.number().positive().required(),
  currency: Joi.string().length(3).required(),
  token: Joi.string().pattern(/^tok_[a-zA-Z0-9]{24}$/).required(),
  orderId: Joi.string().uuid().required()
});

app.post('/api/payments', async (req, res) => {
  // Validate input
  const { error, value } = paymentSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: error.details[0].message
      }
    });
  }
  
  // Use validated data
  const payment = value;
  // ... process payment
});

// ✗ WRONG: No input validation
// app.post('/api/payments', async (req, res) => {
//   const payment = req.body; // Could contain anything!
//   // ... process payment (security vulnerability!)
// });
```

### SQL Injection Prevention:
```typescript
// ✓ CORRECT: Parameterized query
const query = 'SELECT * FROM users WHERE id = ? AND status = ?';
const result = await db.query(query, [userId, 'active']);

// ✗ WRONG: SQL injection vulnerability
// const query = `SELECT * FROM users WHERE id = '${userId}'`; // NEVER DO THIS!
// const result = await db.query(query);
```

## Secrets Management

- **NEVER hardcode secrets, API keys, or credentials**
- **ALWAYS use AWS Secrets Manager or Parameter Store**
- **ALWAYS rotate secrets automatically**
- **Pattern**: Runtime secret retrieval

Example:
```typescript
// ✓ CORRECT: Load secrets from AWS Secrets Manager
import { SecretsManager } from 'aws-sdk';

const secretsManager = new SecretsManager();

async function getSecret(secretName: string): Promise<string> {
  const { SecretString } = await secretsManager.getSecretValue({
    SecretId: secretName
  }).promise();
  
  return SecretString!;
}

// Load at runtime
const stripeApiKey = await getSecret('prod/payment-api-key');
const stripe = new Stripe(stripeApiKey);

// ✗ WRONG: Hardcoded secret
// const stripe = new Stripe('sk_live_51H...'); // Hardcoded secret in code!
```

### Environment Variables (Development Only):
```typescript
// ✓ CORRECT: Environment variables for development, Secrets Manager for production
async function loadConfig(): Promise<Config> {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (nodeEnv === 'production') {
    // Production: Use Secrets Manager
    const stripeKey = await getSecret('prod/stripe-api-key');
    const dbPassword = await getSecret('prod/database-password');
    return { stripeKey, dbPassword };
  } else {
    // Development: Use environment variables
    return {
      stripeKey: process.env.STRIPE_API_KEY!,
      dbPassword: process.env.DB_PASSWORD!
    };
  }
}

// ✗ WRONG: Environment variables in production
// const config = {
//   stripeKey: process.env.STRIPE_API_KEY // Environment vars are not secure in production!
// };
```

## CORS Configuration

- **ALWAYS configure CORS restrictively**
- **NEVER use wildcard origins in production**: `Access-Control-Allow-Origin: *`
- **ALWAYS specify exact allowed origins**
- **Pattern**: Whitelist-based CORS

Example:
```typescript
// ✓ CORRECT: Restrictive CORS configuration
import cors from 'cors';

const allowedOrigins = [
  'https://app.example.com',
  'https://admin.example.com'
];

if (process.env.NODE_ENV === 'development') {
  allowedOrigins.push('http://localhost:3000');
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ✗ WRONG: Wildcard CORS (security vulnerability)
// app.use(cors({
//   origin: '*', // Allows any origin!
//   credentials: true // Credentials + wildcard = vulnerability!
// }));
```

## Rate Limiting

- **ALWAYS enforce rate limiting on public endpoints**
- **ALWAYS use distributed rate limiting (Redis) for multi-instance deployments**
- **ALWAYS return 429 status with Retry-After header**
- **Pattern**: Redis-based distributed rate limiting

Example:
```typescript
// ✓ CORRECT: Distributed rate limiting with Redis
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

const limiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'ratelimit:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'rate_limit_exceeded',
        message: 'Too many requests, please try again later'
      }
    });
  }
});

// Apply to all routes
app.use('/api/', limiter);

// ✗ WRONG: No rate limiting
// app.use('/api/', router); // No rate limiting on public API!
```

## Security Headers

- **ALWAYS set security headers**
- **ALWAYS use helmet middleware**
- **NEVER expose server version or technology stack**
- **Pattern**: Comprehensive security headers

Example:
```typescript
// ✓ CORRECT: Security headers with helmet
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true
}));

// Remove server header
app.disable('x-powered-by');

// ✗ WRONG: No security headers
// app.get('/api/data', (req, res) => {
//   res.json({ data: '...' }); // Missing security headers!
// });
```

## Audit Logging

- **ALWAYS log security-relevant events**
- **ALWAYS include: timestamp, actor, action, resource, result**
- **ALWAYS log authentication failures**
- **Pattern**: Structured audit logging

Example:
```typescript
// ✓ CORRECT: Comprehensive audit logging
interface AuditLog {
  timestamp: string;
  eventType: 'auth_success' | 'auth_failure' | 'permission_denied' | 'data_access' | 'data_modification';
  actor: {
    userId: string;
    ipAddress: string;
    userAgent: string;
  };
  action: string;
  resource: string;
  result: 'success' | 'failure';
  metadata?: Record<string, any>;
}

function auditLog(log: AuditLog): void {
  logger.info('AUDIT', log);
  
  // Also send to centralized audit system (SIEM)
  auditLogger.write(log);
}

// Usage examples
app.post('/api/login', async (req, res) => {
  try {
    const user = await authenticateUser(req.body.username, req.body.password);
    
    auditLog({
      timestamp: new Date().toISOString(),
      eventType: 'auth_success',
      actor: {
        userId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'unknown'
      },
      action: 'login',
      resource: '/api/login',
      result: 'success'
    });
    
    res.json({ token: generateToken(user) });
  } catch (error) {
    auditLog({
      timestamp: new Date().toISOString(),
      eventType: 'auth_failure',
      actor: {
        userId: req.body.username,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'unknown'
      },
      action: 'login',
      resource: '/api/login',
      result: 'failure',
      metadata: { reason: error.message }
    });
    
    res.status(401).json({ error: { code: 'auth_failed', message: 'Invalid credentials' } });
  }
});

// ✗ WRONG: No audit logging for security events
// app.post('/api/login', async (req, res) => {
//   const user = await authenticateUser(req.body.username, req.body.password);
//   res.json({ token: generateToken(user) });
//   // No audit trail!
// });
```

## Impact

When AI follows these security rules:
- **IAM Security**: 95% reduction in overly-permissive IAM policies
- **Data Protection**: PII never stored in plaintext, encryption at rest enforced
- **Authentication**: Token-based auth with proper verification
- **Input Validation**: SQL injection and XSS prevented
- **Secrets Management**: No hardcoded secrets in code

**Measured outcomes** (from tactical guide):
- Security violations: 95% reduction (wildcards almost never generated)
- Secret leakage incidents: 89% reduction
- PCI DSS compliance: Automatic enforcement of encryption requirements
- SOX 404 compliance: Audit trails for all security events
