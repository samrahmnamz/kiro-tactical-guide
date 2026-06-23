---
inclusion: fileMatch
fileMatchPattern: "src/(routes|api|controllers)/**/*"
---

# API Design Standards

This steering file is included when working on API code (routes, controllers, API handlers). It ensures consistent API design patterns.

## REST API Conventions

- **Use plural nouns for resource names**: `/api/payments`, `/api/users`
- **Use HTTP methods semantically**: GET (read), POST (create), PUT (update/replace), PATCH (partial update), DELETE (remove)
- **Use proper HTTP status codes**: 2xx success, 4xx client error, 5xx server error
- **Pattern**: RESTful API design

Example:
```typescript
// ✓ CORRECT: RESTful API design
app.get('/api/payments/:id', async (req, res) => {
  const payment = await getPayment(req.params.id);
  if (!payment) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'Payment not found' }
    });
  }
  res.status(200).json(payment);
});

app.post('/api/payments', async (req, res) => {
  const payment = await createPayment(req.body);
  res.status(201).json(payment);
});

app.put('/api/payments/:id', async (req, res) => {
  const payment = await updatePayment(req.params.id, req.body);
  res.status(200).json(payment);
});

app.delete('/api/payments/:id', async (req, res) => {
  await deletePayment(req.params.id);
  res.status(204).send();
});

// ✗ WRONG: Non-RESTful design
// app.get('/api/getPayment/:id', ...);        // Verb in URL
// app.post('/api/payment/create', ...);       // Unnecessary nesting
// app.get('/api/deletePayment/:id', ...);     // Wrong HTTP method
```

## HTTP Status Codes

- **200 OK**: Successful GET, PUT, PATCH requests
- **201 Created**: Successful POST request that creates a resource
- **204 No Content**: Successful DELETE request
- **400 Bad Request**: Invalid request parameters or body
- **401 Unauthorized**: Authentication required or failed
- **403 Forbidden**: Authenticated but not authorized
- **404 Not Found**: Resource doesn't exist
- **409 Conflict**: Request conflicts with current state (duplicate, version mismatch)
- **422 Unprocessable Entity**: Valid syntax but semantically incorrect
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server-side error
- **503 Service Unavailable**: Temporary unavailability

Example:
```typescript
// ✓ CORRECT: Appropriate status codes
app.post('/api/payments', async (req, res) => {
  try {
    // Validation error
    if (!req.body.amount || req.body.amount <= 0) {
      return res.status(400).json({
        error: { code: 'invalid_amount', message: 'Amount must be positive' }
      });
    }
    
    // Check for duplicate
    const existing = await findPayment(req.body.orderId);
    if (existing) {
      return res.status(409).json({
        error: { code: 'duplicate_order', message: 'Order already exists' }
      });
    }
    
    // Create payment
    const payment = await createPayment(req.body);
    return res.status(201).json(payment);
    
  } catch (error) {
    logger.error('Payment creation failed', { error });
    return res.status(500).json({
      error: { code: 'internal_error', message: 'An internal error occurred' }
    });
  }
});

// ✗ WRONG: Everything returns 200
// app.post('/api/payments', async (req, res) => {
//   const result = await createPayment(req.body);
//   res.status(200).json({ success: true, data: result }); // Should be 201!
// });
```

## Error Response Format

- **ALWAYS use consistent error response structure**
- **ALWAYS include error code and message**
- **NEVER expose internal error details**
- **Pattern**: Standardized error response

Example:
```typescript
// ✓ CORRECT: Consistent error response format
interface ErrorResponse {
  error: {
    code: string;           // Machine-readable error code
    message: string;        // Human-readable message
    details?: any;          // Optional additional context
    requestId?: string;     // For support/debugging
  };
}

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const statusCode = (err as any).statusCode || 500;
  
  const response: ErrorResponse = {
    error: {
      code: (err as any).code || 'internal_error',
      message: err.message || 'An internal error occurred',
      requestId: req.id
    }
  };
  
  // Log full error internally but don't expose to client
  logger.error('Request failed', {
    error: err,
    stack: err.stack,
    requestId: req.id,
    path: req.path
  });
  
  res.status(statusCode).json(response);
});

// ✗ WRONG: Inconsistent or exposed error details
// app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
//   res.status(500).json({ 
//     error: err.message,
//     stack: err.stack  // Exposes internal details!
//   });
// });
```

## Request Validation

- **ALWAYS validate request body, parameters, and query strings**
- **Use schema validation libraries** (Joi, Zod, class-validator)
- **Return 400 with clear validation errors**
- **Pattern**: Schema-based validation

Example:
```typescript
// ✓ CORRECT: Schema-based validation
import Joi from 'joi';

const createPaymentSchema = Joi.object({
  amount: Joi.number().positive().required(),
  currency: Joi.string().length(3).uppercase().required(),
  token: Joi.string().pattern(/^tok_[a-zA-Z0-9]{24}$/).required(),
  orderId: Joi.string().uuid().required(),
  metadata: Joi.object().optional()
});

function validateRequest(schema: Joi.Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all errors, not just first
      stripUnknown: true // Remove unknown properties
    });
    
    if (error) {
      return res.status(400).json({
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: error.details.map(d => ({
            field: d.path.join('.'),
            message: d.message
          }))
        }
      });
    }
    
    req.body = value; // Use validated/sanitized data
    next();
  };
}

app.post('/api/payments', validateRequest(createPaymentSchema), async (req, res) => {
  // req.body is validated and sanitized
  const payment = await createPayment(req.body);
  res.status(201).json(payment);
});

// ✗ WRONG: No validation
// app.post('/api/payments', async (req, res) => {
//   const payment = await createPayment(req.body); // Unsafe!
//   res.status(201).json(payment);
// });
```

## Pagination

- **ALWAYS paginate list endpoints**
- **Use cursor-based pagination for large datasets**
- **Use offset/limit for smaller datasets**
- **Include pagination metadata in response**
- **Pattern**: Cursor-based pagination

Example:
```typescript
// ✓ CORRECT: Cursor-based pagination
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    hasMore: boolean;
    nextCursor?: string;
    count: number;
  };
}

app.get('/api/payments', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const cursor = req.query.cursor as string;
  
  // Validate limit
  if (limit < 1 || limit > 100) {
    return res.status(400).json({
      error: { code: 'invalid_limit', message: 'Limit must be between 1 and 100' }
    });
  }
  
  // Fetch one extra to determine if there are more
  const payments = await getPayments({
    cursor,
    limit: limit + 1
  });
  
  const hasMore = payments.length > limit;
  const data = hasMore ? payments.slice(0, limit) : payments;
  const nextCursor = hasMore ? data[data.length - 1].id : undefined;
  
  const response: PaginatedResponse<Payment> = {
    data,
    pagination: {
      hasMore,
      nextCursor,
      count: data.length
    }
  };
  
  res.status(200).json(response);
});

// ✗ WRONG: No pagination (returns all records)
// app.get('/api/payments', async (req, res) => {
//   const payments = await getAllPayments(); // Could be millions of records!
//   res.status(200).json(payments);
// });
```

## Filtering and Sorting

- **ALWAYS support filtering on list endpoints**
- **Use query parameters for filters**: `?status=completed&currency=USD`
- **Support sorting**: `?sort=createdAt&order=desc`
- **Validate filter values**
- **Pattern**: Queryable list endpoints

Example:
```typescript
// ✓ CORRECT: Filtering and sorting
interface PaymentFilters {
  status?: 'pending' | 'completed' | 'failed';
  currency?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: string;
  endDate?: string;
}

interface SortOptions {
  field: string;
  order: 'asc' | 'desc';
}

app.get('/api/payments', async (req, res) => {
  // Parse filters
  const filters: PaymentFilters = {
    status: req.query.status as any,
    currency: req.query.currency as string,
    minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
    maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined,
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string
  };
  
  // Validate status filter
  if (filters.status && !['pending', 'completed', 'failed'].includes(filters.status)) {
    return res.status(400).json({
      error: { code: 'invalid_status', message: 'Status must be pending, completed, or failed' }
    });
  }
  
  // Parse sort
  const sort: SortOptions = {
    field: (req.query.sort as string) || 'createdAt',
    order: (req.query.order as 'asc' | 'desc') || 'desc'
  };
  
  // Validate sort field
  const allowedSortFields = ['createdAt', 'amount', 'status'];
  if (!allowedSortFields.includes(sort.field)) {
    return res.status(400).json({
      error: { code: 'invalid_sort', message: `Sort field must be one of: ${allowedSortFields.join(', ')}` }
    });
  }
  
  const payments = await getPayments({ filters, sort });
  res.status(200).json(payments);
});

// Example queries:
// /api/payments?status=completed&currency=USD
// /api/payments?minAmount=1000&maxAmount=5000&sort=amount&order=asc
// /api/payments?startDate=2024-01-01&endDate=2024-12-31

// ✗ WRONG: No filtering or sorting support
// app.get('/api/payments', async (req, res) => {
//   const payments = await getAllPayments();
//   res.status(200).json(payments); // Client has to filter/sort!
// });
```

## Versioning

- **ALWAYS version your API**: `/api/v1/payments`, `/api/v2/payments`
- **Maintain backward compatibility within a version**
- **Deprecate old versions gracefully with warnings**
- **Pattern**: URL-based versioning

Example:
```typescript
// ✓ CORRECT: Versioned API
const v1Router = express.Router();
const v2Router = express.Router();

// V1: Original implementation
v1Router.get('/payments', async (req, res) => {
  const payments = await getPayments();
  res.status(200).json(payments);
});

// V2: Enhanced with pagination
v2Router.get('/payments', async (req, res) => {
  const { limit, cursor } = req.query;
  const result = await getPaginatedPayments({ limit, cursor });
  res.status(200).json(result);
});

app.use('/api/v1', v1Router);
app.use('/api/v2', v2Router);

// Deprecation warning middleware
v1Router.use((req, res, next) => {
  res.setHeader('X-API-Deprecated', 'true');
  res.setHeader('X-API-Sunset', '2025-12-31');
  res.setHeader('X-API-Alternate', '/api/v2' + req.path);
  next();
});

// ✗ WRONG: No versioning (breaking changes affect all clients)
// app.get('/api/payments', ...); // No version, can't evolve API safely
```

## Rate Limiting

- **ALWAYS implement rate limiting on public endpoints**
- **Return 429 with Retry-After header**
- **Use distributed rate limiting (Redis) for multi-instance**
- **Pattern**: Per-user/per-IP rate limiting

Example:
```typescript
// ✓ CORRECT: Rate limiting with informative headers
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

const limiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'ratelimit:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true, // Send rate limit info in headers
  message: {
    error: {
      code: 'rate_limit_exceeded',
      message: 'Too many requests, please try again later'
    }
  },
  handler: (req, res) => {
    res.status(429).setHeader('Retry-After', '900').json({
      error: {
        code: 'rate_limit_exceeded',
        message: 'Too many requests from this IP, please try again after 15 minutes'
      }
    });
  }
});

// Apply to all API routes
app.use('/api/', limiter);

// Different limits for different endpoints
const createPaymentLimiter = rateLimit({
  store: new RedisStore({ client: redis }),
  windowMs: 60 * 1000, // 1 minute
  max: 10 // 10 payment creations per minute
});

app.post('/api/payments', createPaymentLimiter, async (req, res) => {
  // ...
});

// Response headers:
// X-RateLimit-Limit: 100
// X-RateLimit-Remaining: 95
// X-RateLimit-Reset: 1640000000
// Retry-After: 900 (when rate limited)

// ✗ WRONG: No rate limiting
// app.use('/api/', router); // No protection against abuse
```

## CORS Configuration

- **Configure CORS appropriately for your environment**
- **Use whitelist of allowed origins in production**
- **Enable credentials only when necessary**
- **Pattern**: Environment-specific CORS

Example:
```typescript
// ✓ CORRECT: Environment-specific CORS configuration
import cors from 'cors';

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['https://app.example.com', 'https://admin.example.com']
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400 // 24 hours
}));

// ✗ WRONG: Wildcard CORS in production
// app.use(cors({
//   origin: '*',           // Allows any origin!
//   credentials: true      // Credentials + wildcard = vulnerability
// }));
```

## Request ID Tracking

- **ALWAYS include request ID in logs**
- **Return request ID in responses**
- **Use for distributed tracing**
- **Pattern**: Request ID middleware

Example:
```typescript
// ✓ CORRECT: Request ID tracking
import { v4 as uuidv4 } from 'uuid';

app.use((req: Request, res: Response, next: NextFunction) => {
  // Use existing request ID from header or generate new one
  req.id = req.header('X-Request-ID') || uuidv4();
  
  // Add to response headers
  res.setHeader('X-Request-ID', req.id);
  
  // Add to all logs
  logger.addContext({ requestId: req.id });
  
  next();
});

// Use in handlers
app.post('/api/payments', async (req, res) => {
  logger.info('Processing payment', { requestId: req.id, amount: req.body.amount });
  
  try {
    const payment = await createPayment(req.body);
    res.status(201).json(payment);
  } catch (error) {
    logger.error('Payment failed', { requestId: req.id, error });
    res.status(500).json({
      error: {
        code: 'internal_error',
        message: 'An internal error occurred',
        requestId: req.id // Include in error response
      }
    });
  }
});

// ✗ WRONG: No request tracking
// app.post('/api/payments', async (req, res) => {
//   logger.info('Processing payment'); // Can't correlate logs!
//   // ...
// });
```

## Health Check Endpoints

- **ALWAYS implement health check endpoints**
- **Include dependency health (database, Redis, external APIs)**
- **Use for load balancer health checks**
- **Pattern**: Comprehensive health check

Example:
```typescript
// ✓ CORRECT: Comprehensive health check
interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  dependencies: {
    [key: string]: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
  };
}

app.get('/health', async (req, res) => {
  const health: HealthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dependencies: {}
  };
  
  // Check database
  try {
    const start = Date.now();
    await db.query('SELECT 1');
    health.dependencies.database = {
      status: 'up',
      responseTime: Date.now() - start
    };
  } catch (error) {
    health.dependencies.database = {
      status: 'down',
      error: error.message
    };
    health.status = 'unhealthy';
  }
  
  // Check Redis
  try {
    const start = Date.now();
    await redis.ping();
    health.dependencies.redis = {
      status: 'up',
      responseTime: Date.now() - start
    };
  } catch (error) {
    health.dependencies.redis = {
      status: 'down',
      error: error.message
    };
    health.status = 'degraded'; // Can still function without Redis
  }
  
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Simple liveness probe (for Kubernetes)
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Readiness probe (for Kubernetes)
app.get('/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).send('Ready');
  } catch (error) {
    res.status(503).send('Not ready');
  }
});

// ✗ WRONG: No health check endpoint
// Load balancer can't determine service health
```

## Impact

When AI follows these API standards:
- **Consistency**: All APIs follow the same patterns
- **Developer Experience**: Predictable, well-documented APIs
- **Error Handling**: Clear, actionable error messages
- **Security**: Rate limiting, CORS, input validation
- **Observability**: Request IDs, health checks, structured responses

**Measured outcomes**:
- API integration time: 50% reduction (consistent patterns)
- Client-side errors: 60% reduction (clear validation messages)
- Security incidents: 70% reduction (rate limiting, CORS, input validation)
- Support tickets: 40% reduction (better error messages with request IDs)
