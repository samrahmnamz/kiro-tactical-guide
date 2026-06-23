# Golden Spec: Distributed Tracing Standard

**Status**: Golden Spec (Organizational Standard)  
**Owner**: Platform Engineering Team  
**Last Updated**: 2025  
**Applies To**: All backend services and APIs

---

## Intent

All services must implement distributed tracing using AWS X-Ray to enable end-to-end request tracking, performance analysis, and debugging across service boundaries. This standard ensures trace context propagates consistently through HTTP requests, asynchronous messaging, and all logging, enabling platform teams to troubleshoot issues that span multiple services.

## Why This Matters

**Problem:** Without consistent trace ID propagation, debugging distributed systems becomes extremely difficult. When a request fails or performs poorly, engineers waste hours manually correlating logs across services, often failing to identify the root cause.

**Solution:** By enforcing X-Ray trace ID propagation at every service boundary, we gain:
- **End-to-end visibility**: See the complete request path across all services
- **Performance bottleneck identification**: Pinpoint which service/operation is slow
- **Error correlation**: Instantly identify which service caused a failure
- **Reduced MTTR**: Time to restore from hours to minutes

## Constraints

All services MUST satisfy the following requirements:

### 1. Inbound Request Handling

- **HTTP APIs**: Extract the `X-Amzn-Trace-Id` header from every incoming request
- **SQS Messages**: Extract trace ID from message attributes (`AWSTraceHeader`)
- **SNS Events**: Extract trace ID from message attributes (`AWSTraceHeader`)
- **EventBridge Events**: Extract trace ID from event detail
- **Root Trace Generation**: If no trace ID is received, generate a new root trace ID using AWS X-Ray format

### 2. Outbound Request Propagation

- **HTTP Calls**: Include `X-Amzn-Trace-Id` header in all outbound HTTP requests
- **SQS Messages**: Include trace ID in message attributes (`AWSTraceHeader`)
- **SNS Publishing**: Include trace ID in message attributes (`AWSTraceHeader`)
- **EventBridge Events**: Include trace ID in event detail
- **Database Calls**: Annotate X-Ray segments with database query metadata (operation, table, latency)

### 3. Structured Logging Integration

- **Required Field**: Every log line must include `traceId` field with current X-Ray trace ID
- **Format**: Use structured JSON logging (see `logging-standard.spec.md`)
- **Example**:
  ```json
  {
    "timestamp": "2025-01-15T10:30:00Z",
    "level": "info",
    "service": "payment-service",
    "traceId": "1-5f7c9c2a-12345678abcdef012345678",
    "message": "Payment processed successfully",
    "paymentId": "pay_xyz123",
    "amount": 99.99
  }
  ```

### 4. X-Ray SDK Integration

- **Instrument HTTP Clients**: Wrap all HTTP clients (axios, fetch, etc.) with X-Ray instrumentation
- **Instrument AWS SDK Calls**: Use X-Ray SDK to automatically trace all AWS service calls (DynamoDB, S3, etc.)
- **Custom Segments**: Create subsegments for critical business operations (payment processing, order validation, etc.)
- **Error Recording**: Record exceptions in X-Ray segments with full stack traces

### 5. Performance Requirements

- **Overhead**: Tracing instrumentation must add <5ms overhead per request
- **Sampling**: Use X-Ray default sampling rules (1 request per second + 5% of additional requests)
- **Custom Sampling**: Services with >1000 RPS may implement custom sampling rules (document in service spec)

### 6. Security and Privacy

- **No PII in Traces**: Never include PII, passwords, tokens, or sensitive data in X-Ray annotations or metadata
- **Sanitize URLs**: Remove query parameters containing sensitive data before recording in traces
- **IAM Permissions**: Service execution role must have `xray:PutTraceSegments` and `xray:PutTelemetryRecords` permissions

## Implementation Patterns

### Pattern 1: Express.js Middleware (Node.js/TypeScript)

```typescript
// middleware/tracing.ts
import AWSXRay from 'aws-xray-sdk-core';
import { Request, Response, NextFunction } from 'express';

export const tracingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Extract trace ID from header or generate new root trace
  const traceHeader = req.headers['x-amzn-trace-id'];
  
  if (traceHeader) {
    // Parse and set existing trace context
    AWSXRay.setSegment(AWSXRay.getSegment().parent);
  } else {
    // Generate new root trace
    const segment = new AWSXRay.Segment('payment-service');
    AWSXRay.setSegment(segment);
  }

  // Add trace ID to request context for logging
  req.traceId = AWSXRay.getSegment().trace_id;

  // Propagate trace ID in response headers (optional, useful for debugging)
  res.setHeader('X-Amzn-Trace-Id', req.traceId);

  next();
};

// Wrap express app with X-Ray
import express from 'express';
const app = express();
AWSXRay.captureHTTPsGlobal(require('http'));
AWSXRay.captureHTTPsGlobal(require('https'));
app.use(AWSXRay.express.openSegment('payment-service'));
app.use(tracingMiddleware);
// ... your routes ...
app.use(AWSXRay.express.closeSegment());
```

### Pattern 2: SQS Message Handler (Node.js/TypeScript)

```typescript
// handlers/sqs-handler.ts
import AWSXRay from 'aws-xray-sdk-core';
import { SQSEvent, SQSRecord } from 'aws-lambda';
import { logger } from '../logger';

export const handler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    // Extract trace ID from SQS message attributes
    const traceHeader = record.messageAttributes?.AWSTraceHeader?.stringValue;
    
    let segment;
    if (traceHeader) {
      // Continue existing trace
      segment = AWSXRay.getSegment();
      AWSXRay.setSegment(segment);
    } else {
      // Generate new root trace
      segment = new AWSXRay.Segment('notification-handler');
      AWSXRay.setSegment(segment);
    }

    const traceId = segment.trace_id;

    try {
      // Process message with trace context
      await processMessage(record, traceId);
      segment.close();
    } catch (error) {
      // Record error in X-Ray
      segment.addError(error);
      segment.close();
      logger.error('Message processing failed', { traceId, error: error.message });
      throw error;
    }
  }
};

async function processMessage(record: SQSRecord, traceId: string) {
  logger.info('Processing message', { traceId, messageId: record.messageId });
  // ... business logic ...
}
```

### Pattern 3: Outbound HTTP Call with Trace Propagation

```typescript
// clients/payment-gateway.ts
import axios from 'axios';
import AWSXRay from 'aws-xray-sdk-core';

const httpClient = AWSXRay.captureHTTPsGlobal(axios);

export async function processPayment(paymentData: any) {
  const segment = AWSXRay.getSegment();
  const traceId = segment.trace_id;

  // X-Ray automatically adds trace header to outbound requests
  const response = await httpClient.post('https://payment-gateway.example.com/charge', {
    ...paymentData,
  }, {
    headers: {
      'Content-Type': 'application/json',
      // X-Ray SDK automatically includes X-Amzn-Trace-Id header
    }
  });

  return response.data;
}
```

### Pattern 4: Publishing to SQS with Trace Propagation

```typescript
// services/notification-service.ts
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import AWSXRay from 'aws-xray-sdk-core';

const sqs = AWSXRay.captureAWSv3Client(new SQSClient({}));

export async function sendNotification(userId: string, message: string) {
  const segment = AWSXRay.getSegment();
  const traceId = segment.trace_id;

  const command = new SendMessageCommand({
    QueueUrl: process.env.NOTIFICATION_QUEUE_URL,
    MessageBody: JSON.stringify({ userId, message }),
    MessageAttributes: {
      AWSTraceHeader: {
        DataType: 'String',
        StringValue: traceId, // Propagate trace ID
      },
    },
  });

  await sqs.send(command);
}
```

## Validation

Services must validate compliance with this golden spec through:

### Automated Validation (via `validate-against-golden.yaml` hook)

The validation hook automatically checks service specs for:
- ✓ Trace ID extraction documented in service spec
- ✓ Trace ID propagation patterns documented
- ✓ Structured logging includes traceId field
- ✓ X-Ray SDK integration mentioned in dependencies

### Manual Testing Checklist

Before deploying a new service, verify:

1. **Trace Continuity**: 
   - Make a request to your service
   - Check CloudWatch Logs for trace ID in logs
   - Check X-Ray console for complete trace visualization
   - Verify trace spans through all downstream calls

2. **Log Correlation**:
   - Query CloudWatch Logs Insights: `fields @timestamp, message, traceId | filter traceId = "YOUR_TRACE_ID"`
   - Verify all log lines for the request have the same trace ID

3. **Cross-Service Tracing**:
   - Make a request that calls another service
   - Verify X-Ray shows both services in the same trace map
   - Check that subsegments show latency breakdown

4. **Error Handling**:
   - Trigger an error in your service
   - Verify X-Ray marks the segment as error with exception details
   - Check that trace ID appears in error logs

## Customization Guide

### Custom Sampling Rules

High-traffic services (>1000 RPS) should configure custom sampling to reduce overhead:

```json
// xray-sampling-rules.json
{
  "version": 2,
  "rules": [
    {
      "description": "High-priority endpoints - sample all",
      "host": "*",
      "http_method": "POST",
      "url_path": "/api/payments/*",
      "fixed_target": 1,
      "rate": 1.0
    },
    {
      "description": "Health checks - sample minimally",
      "host": "*",
      "http_method": "GET",
      "url_path": "/health",
      "fixed_target": 0,
      "rate": 0.01
    },
    {
      "description": "Default - X-Ray defaults",
      "host": "*",
      "http_method": "*",
      "url_path": "*",
      "fixed_target": 1,
      "rate": 0.05
    }
  ],
  "default": {
    "fixed_target": 1,
    "rate": 0.05
  }
}
```

Load custom rules in your service:
```typescript
import AWSXRay from 'aws-xray-sdk-core';
import samplingRules from './xray-sampling-rules.json';
AWSXRay.middleware.setSamplingRules(samplingRules);
```

### Adding Custom Segments

For critical business operations, add custom segments:

```typescript
import AWSXRay from 'aws-xray-sdk-core';

async function processOrder(orderId: string) {
  const segment = AWSXRay.getSegment();
  const subsegment = segment.addNewSubsegment('process-order');

  try {
    subsegment.addAnnotation('orderId', orderId);
    subsegment.addMetadata('orderDetails', { /* order data */ });

    // Business logic here
    await validateOrder(orderId);
    await chargePayment(orderId);
    await fulfillOrder(orderId);

    subsegment.close();
  } catch (error) {
    subsegment.addError(error);
    subsegment.close();
    throw error;
  }
}
```

### Infrastructure as Code

Ensure your service has X-Ray permissions in IAM policy:

```typescript
// CDK example
import * as iam from 'aws-cdk-lib/aws-iam';

const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
  ],
});

// Add X-Ray permissions
lambdaRole.addToPolicy(new iam.PolicyStatement({
  actions: [
    'xray:PutTraceSegments',
    'xray:PutTelemetryRecords',
  ],
  resources: ['*'],
}));
```

Enable X-Ray tracing for Lambda:
```typescript
import * as lambda from 'aws-cdk-lib/aws-lambda';

const myFunction = new lambda.Function(this, 'MyFunction', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('dist'),
  tracing: lambda.Tracing.ACTIVE, // Enable X-Ray tracing
});
```

## Exceptions and Waivers

Services may request exemption from this standard in the following scenarios:

1. **Public-facing static assets**: CDN-served static files (HTML, CSS, JS, images) do not require tracing
2. **Health check endpoints**: `/health` and `/ready` endpoints may omit tracing to reduce overhead
3. **Legacy third-party integrations**: Services integrating with third-party APIs that don't support trace headers may document inability to propagate traces beyond the service boundary

**Exception Process**:
1. Document exception rationale in service spec
2. Get approval from Platform Engineering team lead
3. Track exception in `docs/golden-spec-exceptions.md`
4. Review exception annually for potential resolution

## Related Standards

This golden spec should be used in conjunction with:
- `logging-standard.spec.md` - Structured logging format (includes traceId field)
- `observability.spec.md` - CloudWatch metrics and alarms
- `error-handling.spec.md` - Error handling and recovery patterns

## References

- [AWS X-Ray Developer Guide](https://docs.aws.amazon.com/xray/latest/devguide/)
- [X-Ray Node.js SDK](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-nodejs.html)
- [X-Ray Sampling Rules](https://docs.aws.amazon.com/xray/latest/devguide/xray-console-sampling.html)
- [CloudWatch Logs Insights for Trace Correlation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html)

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-15 | Platform Engineering | Initial golden spec for distributed tracing standard |

---

**Questions or need help implementing?**  
Contact: #platform-engineering on Slack  
Documentation: [Internal Wiki - Distributed Tracing Guide](https://wiki.internal/tracing)
