# Observability Golden Spec

> **Golden Spec**: Organization-wide standard for observability patterns
> 
> **Purpose**: Define consistent metrics, traces, alarms, and dashboards standards for all services
> 
> **Primary Concerns Addressed**:
> - Cognitive Overload from Fragmented Toolchains (Concern #5)
> - Knowledge Loss When Engineers Leave (Concern #10)
> 
> **Integration Points**:
> - Amazon CloudWatch (logs, metrics, alarms)
> - AWS X-Ray (distributed tracing)
> - Amazon CloudWatch Insights (log analytics)
> - Amazon CloudWatch Dashboards

---

## Intent

Establish organization-wide observability standards that enable teams to:
1. **Monitor service health** through consistent metrics and alarms
2. **Debug production issues** with structured logs and distributed traces
3. **Understand system behavior** through standardized dashboards
4. **Reduce mean time to resolution (MTTR)** with actionable observability data

**Why it exists**: Without standardized observability, each team invents their own metrics, log formats, and dashboards—leading to cognitive overload (12 different monitoring tools), slow incident response, and knowledge loss when engineers leave. This golden spec ensures consistency, making it easy for any engineer to understand any service's health and behavior.

---

## Standards

### 1. CloudWatch Metrics

#### 1.1 Core Service Metrics (REQUIRED for all services)

Every service MUST emit the following metrics to CloudWatch:


**Request Metrics**:
- `RequestCount` (Count) - Total number of requests received
- `ErrorCount` (Count) - Total number of requests that resulted in errors (5xx responses)
- `Throttle` (Count) - Total number of requests throttled/rate-limited
- `Latency` (Milliseconds) - Request processing latency at percentiles (p50, p90, p99)

**Availability Metrics**:
- `SuccessRate` (Percent) - Percentage of successful requests (non-5xx / total requests)
- `HealthCheckStatus` (0 or 1) - Binary health check status (1 = healthy, 0 = unhealthy)

**Resource Utilization**:
- `CPUUtilization` (Percent) - For compute resources (Lambda concurrent executions percentage, ECS tasks)
- `MemoryUtilization` (Percent) - For compute resources
- `DiskUtilization` (Percent) - For persistent storage resources
- `ConnectionCount` (Count) - For databases, caches, message queues

**Dimensions** (REQUIRED for all metrics):
- `ServiceName` - Name of the service (e.g., "notification-service", "payment-processor")
- `Environment` - Deployment environment (e.g., "prod", "staging", "dev")
- `Version` - Service version or commit SHA (for canary deployments)

**Example Implementation** (TypeScript with AWS SDK):
```typescript
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

// ✓ CORRECT: Emit metric with required dimensions
await cloudwatch.putMetricData({
  Namespace: 'CustomApp/Services',
  MetricData: [{
    MetricName: 'RequestCount',
    Value: 1,
    Unit: 'Count',
    Timestamp: new Date(),
    Dimensions: [
      { Name: 'ServiceName', Value: 'notification-service' },
      { Name: 'Environment', Value: process.env.ENVIRONMENT },
      { Name: 'Version', Value: process.env.SERVICE_VERSION }
    ]
  }]
});

// ✗ WRONG: Missing required dimensions
await cloudwatch.putMetricData({
  Namespace: 'CustomApp/Services',
  MetricData: [{
    MetricName: 'RequestCount',
    Value: 1,
    Unit: 'Count'
    // Missing ServiceName, Environment, Version dimensions
  }]
});
```

#### 1.2 Business Metrics (RECOMMENDED)

Services SHOULD emit business-level metrics relevant to their domain:

**Examples**:
- Payment services: `PaymentsProcessed`, `PaymentAmount`, `RefundCount`
- Notification services: `NotificationsSent`, `DeliveryRate`, `OptOutCount`
- Auth services: `LoginAttempts`, `FailedLogins`, `TokensIssued`
- API services: `EndpointCalls` (per endpoint dimension)

**Dimensions** (in addition to required dimensions):
- Add business-relevant dimensions (e.g., `PaymentMethod`, `NotificationChannel`, `Country`)


#### 1.3 Metric Naming Conventions

**Standard**: Use PascalCase for metric names (e.g., `RequestCount`, `ErrorRate`)

**Prefix Pattern**: `<Domain>/<SubDomain>` for namespace
- ✓ CORRECT: `CustomApp/Services`, `CustomApp/DataPipelines`, `CustomApp/Auth`
- ✗ WRONG: `MyApp`, `Services`, `notifications-svc` (too generic or inconsistent)

**Aggregation Period**: Emit metrics every 60 seconds for standard metrics, 1 second for high-resolution

---

### 2. Structured Logging

#### 2.1 Log Format (REQUIRED)

All logs MUST be JSON-structured with the following required fields:

```json
{
  "timestamp": "2025-01-15T14:30:00.123Z",
  "level": "INFO",
  "service": "notification-service",
  "environment": "prod",
  "version": "1.2.3",
  "traceId": "1-5e4d1c6f-a0b2c3d4e5f6a7b8c9d0e1f2",
  "requestId": "abc123def456",
  "message": "Notification sent successfully",
  "metadata": {
    "customerId": "cust_789",
    "notificationId": "notif_xyz",
    "channel": "email",
    "latencyMs": 145
  }
}
```

**Required Fields**:
- `timestamp` (ISO 8601 format with milliseconds)
- `level` (ERROR, WARN, INFO, DEBUG)
- `service` (service name matching CloudWatch metrics ServiceName dimension)
- `environment` (deployment environment)
- `version` (service version)
- `traceId` (AWS X-Ray trace ID for correlation)
- `requestId` (unique request identifier)
- `message` (human-readable message)

**Optional Fields**:
- `metadata` (object with additional context)
- `error` (error object with `name`, `message`, `stack`)
- `userId` (authenticated user identifier, if applicable)
- `duration` (operation duration in milliseconds)

#### 2.2 Log Levels

**ERROR**: System errors requiring immediate attention (exceptions, failures, data loss)
- Trigger alarms and wake up on-call engineer
- Example: Database connection failed, payment processing failed, external API timeout

**WARN**: Degraded functionality or unexpected conditions (not failures, but concerning)
- Log for investigation during business hours
- Example: Retry attempt, cache miss, slow query (>1s)

**INFO**: Normal operations and significant state changes
- Audit trail and debugging context
- Example: Request received, notification sent, deployment completed


**DEBUG**: Verbose debugging information (disabled in production by default)
- Enable on-demand for troubleshooting
- Example: Variable values, detailed execution flow, intermediate calculations

#### 2.3 PII Protection (REQUIRED)

**Constraint**: Customer email addresses, phone numbers, credit card numbers, and other PII MUST NOT appear in logs.

**Implementation**: Use redaction functions before logging:

```typescript
import { logger } from './logger';

// ✓ CORRECT: Redact PII before logging
logger.info('User registered', {
  userId: 'user_123',
  email: maskEmail('john@example.com'),  // → j***@example.com
  phone: maskPhone('+15551234567')       // → +1555***4567
});

// ✗ WRONG: Log full PII (security violation)
logger.info('User registered', {
  email: 'john@example.com',
  phone: '+15551234567'
});
```

**Validation**: Unit tests MUST verify no PII in log output. See `toolkit/specs/golden/logging-standard.spec.md` for full requirements.

---

### 3. Distributed Tracing


#### 3.1 X-Ray Trace ID Propagation (REQUIRED)

All services MUST propagate AWS X-Ray trace IDs across service boundaries.

**HTTP Header**: `X-Amzn-Trace-Id`

**Format**: `Root=1-5e4d1c6f-a0b2c3d4e5f6a7b8c9d0e1f2;Parent=53995c3f42cd8ad8;Sampled=1`

**Example Implementation**:

```typescript
import AWSXRay from 'aws-xray-sdk-core';
import axios from 'axios';

// ✓ CORRECT: Propagate trace ID to downstream service
const response = await axios.get('https://downstream-service/api/data', {
  headers: {
    'X-Amzn-Trace-Id': process.env._X_AMZN_TRACE_ID
  }
});

// Log with trace ID for correlation
logger.info('Downstream request completed', {
  traceId: AWSXRay.getSegment()?.trace_id,
  statusCode: response.status,
  latencyMs: response.headers['x-response-time']
});
```

#### 3.2 Tracing Segments and Subsegments

**Segment**: Represents work done by a single service (automatically created by X-Ray SDK)

**Subsegment**: Represents work done within a segment (database queries, external API calls, business logic)


**Example: Tracing Database Queries**:

```typescript
import AWSXRay from 'aws-xray-sdk-core';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

// ✓ CORRECT: Wrap DynamoDB client with X-Ray
const dynamodb = AWSXRay.captureAWSv3Client(new DynamoDBClient({ region: 'us-east-1' }));

// Queries automatically create subsegments
await dynamodb.getItem({
  TableName: 'Customers',
  Key: { customerId: { S: 'cust_123' } }
});
// X-Ray captures: operation name, table name, latency, errors
```

**Example: Tracing External API Calls**:

```typescript
import AWSXRay from 'aws-xray-sdk-core';
import axios from 'axios';

// ✓ CORRECT: Create subsegment for external call
const subsegment = AWSXRay.getSegment()?.addNewSubsegment('ExternalAPICall');
subsegment?.addAnnotation('apiName', 'stripe-payment');

try {
  const response = await axios.post('https://api.stripe.com/v1/charges', paymentData);
  subsegment?.addMetadata('response', { statusCode: response.status });
  subsegment?.close();
} catch (error) {
  subsegment?.addError(error);
  subsegment?.close();
  throw error;
}
```


#### 3.3 Sampling Strategy

**Production**: 5% sampling rate (reduces cost while maintaining visibility)
- 100% sampling for errors (always trace failed requests)
- Configurable sampling rules via X-Ray console

**Staging/Development**: 100% sampling (full tracing for debugging)

**Configuration** (X-Ray sampling rules):
```json
{
  "version": 2,
  "rules": [
    {
      "description": "Trace all errors",
      "priority": 1,
      "fixedRate": 1.0,
      "reservoirSize": 1,
      "attributes": {
        "http.status_code": "5**"
      }
    },
    {
      "description": "Sample 5% of successful requests",
      "priority": 100,
      "fixedRate": 0.05,
      "reservoirSize": 1
    }
  ],
  "default": {
    "fixedRate": 0.05,
    "reservoirSize": 1
  }
}
```

---

### 4. CloudWatch Alarms


#### 4.1 Required Alarms (REQUIRED for all production services)

Every production service MUST have the following CloudWatch alarms:

**1. High Error Rate Alarm**
- **Metric**: `ErrorCount` or `SuccessRate`
- **Threshold**: Error rate > 5% for 2 consecutive periods (2 minutes)
- **Action**: Page on-call engineer (SNS → PagerDuty/Opsgenie)
- **Rationale**: Indicates service degradation requiring immediate attention

**2. High Latency Alarm**
- **Metric**: `Latency` (p99)
- **Threshold**: p99 latency > 5 seconds for 3 consecutive periods (3 minutes)
- **Action**: Alert on-call team (SNS → Slack/Email)
- **Rationale**: User experience degradation, potential performance bottleneck

**3. Health Check Failure Alarm**
- **Metric**: `HealthCheckStatus`
- **Threshold**: Status = 0 (unhealthy) for 1 period (1 minute)
- **Action**: Page on-call engineer immediately
- **Rationale**: Service is down or unreachable

**4. Resource Saturation Alarm**
- **Metric**: `CPUUtilization`, `MemoryUtilization`, or `ConnectionCount`
- **Threshold**: Utilization > 80% for 5 consecutive periods (5 minutes)
- **Action**: Alert ops team (SNS → Slack)
- **Rationale**: Resource exhaustion imminent, scale or investigate


**Example CDK Implementation**:

```typescript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';

// SNS topic for alarm notifications
const alarmTopic = new sns.Topic(this, 'AlarmTopic');

// ✓ REQUIRED: High Error Rate Alarm
const errorRateAlarm = new cloudwatch.Alarm(this, 'HighErrorRate', {
  metric: new cloudwatch.Metric({
    namespace: 'CustomApp/Services',
    metricName: 'ErrorCount',
    dimensionsMap: {
      ServiceName: 'notification-service',
      Environment: 'prod'
    },
    statistic: 'Sum',
    period: Duration.minutes(1)
  }),
  threshold: 10,  // More than 10 errors per minute
  evaluationPeriods: 2,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
});

errorRateAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));
```

#### 4.2 Alarm Naming Convention

**Format**: `[Environment]-[ServiceName]-[AlarmType]`

**Examples**:
- `prod-notification-service-high-error-rate`
- `prod-payment-processor-high-latency-p99`
- `staging-rate-limiter-cpu-utilization-high`


#### 4.3 Alarm Actions

**Severity Levels**:
- **Critical** (Error rate, health check failure): Page on-call engineer (SNS → PagerDuty/Opsgenie)
- **Warning** (High latency, resource saturation): Alert team channel (SNS → Slack)
- **Info** (Deployment events, scaling events): Log to ops channel (SNS → Slack ops channel)

---

### 5. CloudWatch Dashboards

#### 5.1 Standard Dashboard (REQUIRED for all production services)

Every production service MUST have a CloudWatch dashboard with the following widgets:

**1. Request Rate Widget**
- Line graph showing `RequestCount` over time (last 24 hours)
- Stacked by Environment dimension

**2. Error Rate Widget**
- Line graph showing `ErrorCount` and `SuccessRate` over time
- Include alarm threshold line

**3. Latency Widget**
- Line graph showing `Latency` at p50, p90, p99 percentiles
- Include alarm threshold line (p99)

**4. Resource Utilization Widget**
- Line graph showing `CPUUtilization` and `MemoryUtilization`
- Include alarm threshold line (80%)

**5. Alarm Status Widget**
- Summary showing all alarms for the service (green/red/gray status)


**Example CDK Implementation**:

```typescript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

const dashboard = new cloudwatch.Dashboard(this, 'ServiceDashboard', {
  dashboardName: 'prod-notification-service-dashboard'
});

// Request Rate Widget
dashboard.addWidgets(new cloudwatch.GraphWidget({
  title: 'Request Rate',
  left: [new cloudwatch.Metric({
    namespace: 'CustomApp/Services',
    metricName: 'RequestCount',
    dimensionsMap: { ServiceName: 'notification-service', Environment: 'prod' },
    statistic: 'Sum',
    period: Duration.minutes(1)
  })],
  width: 12,
  height: 6
}));

// Error Rate Widget
dashboard.addWidgets(new cloudwatch.GraphWidget({
  title: 'Error Rate',
  left: [new cloudwatch.Metric({
    namespace: 'CustomApp/Services',
    metricName: 'ErrorCount',
    dimensionsMap: { ServiceName: 'notification-service', Environment: 'prod' },
    statistic: 'Sum',
    period: Duration.minutes(1)
  })],
  leftAnnotations: [{
    value: 10,
    label: 'Alarm Threshold',
    color: cloudwatch.Color.RED
  }],
  width: 12,
  height: 6
}));
```


#### 5.2 Dashboard Naming Convention

**Format**: `[Environment]-[ServiceName]-dashboard`

**Examples**:
- `prod-notification-service-dashboard`
- `staging-payment-processor-dashboard`
- `prod-all-services-overview` (org-wide dashboard)

---

### 6. SLIs and SLOs

#### 6.1 Service Level Indicators (SLIs)

Define measurable indicators of service quality:

**Availability SLI**: Percentage of successful requests
```
Availability = (Total Requests - Error Requests) / Total Requests * 100
```

**Latency SLI**: Percentage of requests completing within target latency
```
Latency SLI = (Requests < 1s) / Total Requests * 100
```

**Throughput SLI**: Requests processed per second

#### 6.2 Service Level Objectives (SLOs)

Set target values for SLIs:

**Standard SLOs** (RECOMMENDED for most services):
- **Availability**: 99.9% (three nines) → <0.1% error rate
- **Latency**: 95% of requests < 1 second (p95 < 1s)
- **Uptime**: 99.95% measured over 30-day rolling window


**High-Reliability SLOs** (for critical services like payments, auth):
- **Availability**: 99.99% (four nines) → <0.01% error rate
- **Latency**: 99% of requests < 500ms (p99 < 500ms)
- **Uptime**: 99.99% measured over 30-day rolling window

**SLO Tracking**: Use CloudWatch Insights queries to calculate SLO compliance weekly.

```sql
-- CloudWatch Insights query for availability SLO
fields @timestamp, service, statusCode
| filter service = "notification-service"
| stats count() as TotalRequests, 
        sum(statusCode < 500) as SuccessfulRequests
| extend AvailabilityPercent = (SuccessfulRequests / TotalRequests) * 100
| display AvailabilityPercent
```

---

## Validation and Compliance

### Validation via Hook

Services MUST pass validation against this golden spec using `toolkit/hooks/quality/validate-against-golden.yaml`.

**Validation Checks**:
- ✓ All required metrics are emitted (RequestCount, ErrorCount, Latency, SuccessRate, HealthCheckStatus)
- ✓ All required dimensions are present (ServiceName, Environment, Version)
- ✓ Structured logs include required fields (timestamp, level, service, traceId, requestId, message)
- ✓ No PII in log statements (unit tests verify redaction)
- ✓ X-Ray trace ID propagation implemented for downstream calls
- ✓ Required alarms configured (high error rate, high latency, health check failure, resource saturation)
- ✓ Standard dashboard exists with required widgets


**Example Validation Errors**:

```
❌ Validation Failed: observability.spec.md compliance
  - Missing metric: HealthCheckStatus not emitted
  - Missing dimension: Version dimension not present in RequestCount metric
  - Log format violation: No traceId field in INFO log at src/handler.ts:42
  - PII violation: Detected phone number in log at src/notification.ts:87
  - Missing alarm: High error rate alarm not configured
  - Dashboard missing: prod-notification-service-dashboard does not exist
```

### Exceptions and Waivers

If a service cannot comply with this golden spec (e.g., legacy system, vendor constraints), document the exception:

**Exception Format** (in service's spec.md):

```markdown
## Golden Spec Exceptions

### Exception: X-Ray Tracing Not Supported
**Reason**: Third-party vendor SDK does not support X-Ray instrumentation
**Mitigation**: Manual correlation using requestId in logs and vendor's trace ID
**Approved By**: Platform Team (Jane Doe, 2025-01-10)
**Review Date**: 2025-07-10 (6 months)
```

All exceptions MUST be reviewed every 6 months.

---

## Implementation Guide


### Step 1: Emit CloudWatch Metrics

**TypeScript Example** (reusable metrics utility):

```typescript
// src/utils/metrics.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

export async function emitMetric(
  metricName: string,
  value: number,
  unit: 'Count' | 'Milliseconds' | 'Percent',
  additionalDimensions: Record<string, string> = {}
) {
  await cloudwatch.putMetricData({
    Namespace: 'CustomApp/Services',
    MetricData: [{
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Timestamp: new Date(),
      Dimensions: [
        { Name: 'ServiceName', Value: process.env.SERVICE_NAME },
        { Name: 'Environment', Value: process.env.ENVIRONMENT },
        { Name: 'Version', Value: process.env.SERVICE_VERSION },
        ...Object.entries(additionalDimensions).map(([key, value]) => ({ Name: key, Value: value }))
      ]
    }]
  });
}

// Usage in handler
export const handler = async (event: APIGatewayProxyEvent) => {
  const startTime = Date.now();
  
  await emitMetric('RequestCount', 1, 'Count');
  
  try {
    const result = await processRequest(event);
    const latency = Date.now() - startTime;
    
    await emitMetric('Latency', latency, 'Milliseconds');
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    await emitMetric('ErrorCount', 1, 'Count');
    throw error;
  }
};
```


### Step 2: Implement Structured Logging

**TypeScript Example** (reusable logger):

```typescript
// src/utils/logger.ts
import AWSXRay from 'aws-xray-sdk-core';

export interface LogEntry {
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
  metadata?: Record<string, any>;
  error?: Error;
}

export function log(entry: LogEntry) {
  const segment = AWSXRay.getSegment();
  
  const logObject = {
    timestamp: new Date().toISOString(),
    level: entry.level,
    service: process.env.SERVICE_NAME,
    environment: process.env.ENVIRONMENT,
    version: process.env.SERVICE_VERSION,
    traceId: segment?.trace_id || 'no-trace',
    requestId: process.env.AWS_REQUEST_ID || 'no-request-id',
    message: entry.message,
    ...(entry.metadata && { metadata: entry.metadata }),
    ...(entry.error && { 
      error: {
        name: entry.error.name,
        message: entry.error.message,
        stack: entry.error.stack
      }
    })
  };
  
  console.log(JSON.stringify(logObject));
}

// Convenience methods
export const logger = {
  error: (message: string, error?: Error, metadata?: Record<string, any>) => 
    log({ level: 'ERROR', message, error, metadata }),
  warn: (message: string, metadata?: Record<string, any>) => 
    log({ level: 'WARN', message, metadata }),
  info: (message: string, metadata?: Record<string, any>) => 
    log({ level: 'INFO', message, metadata }),
  debug: (message: string, metadata?: Record<string, any>) => 
    log({ level: 'DEBUG', message, metadata })
};
```


### Step 3: Propagate X-Ray Trace IDs

**TypeScript Example** (downstream HTTP calls):

```typescript
// src/utils/http-client.ts
import axios from 'axios';
import AWSXRay from 'aws-xray-sdk-core';

export async function makeDownstreamCall(url: string, data: any) {
  const subsegment = AWSXRay.getSegment()?.addNewSubsegment('DownstreamCall');
  subsegment?.addAnnotation('url', url);
  
  try {
    const response = await axios.post(url, data, {
      headers: {
        'X-Amzn-Trace-Id': process.env._X_AMZN_TRACE_ID
      }
    });
    
    subsegment?.addMetadata('response', {
      statusCode: response.status,
      headers: response.headers
    });
    subsegment?.close();
    
    return response.data;
  } catch (error) {
    subsegment?.addError(error);
    subsegment?.close();
    throw error;
  }
}
```

### Step 4: Configure CloudWatch Alarms

**AWS CDK Example**:

See Section 4.1 for complete CDK implementation of required alarms.

### Step 5: Create Standard Dashboard

**AWS CDK Example**:

See Section 5.1 for complete CDK implementation of standard dashboard.

---

## Benefits of Standardized Observability


### 1. Reduced Cognitive Overload
**Problem**: Teams run 5+ monitoring solutions with different metrics, log formats, and dashboards.
**Solution**: Single CloudWatch-based observability standard. Any engineer can understand any service's health.
**Impact**: From 12 different tools → 1 unified observability platform

### 2. Faster Incident Response (Improved MTTR)
**Problem**: During incidents, engineers waste time finding logs, correlating traces, and understanding metrics.
**Solution**: Standardized log format + X-Ray tracing enables instant correlation. All services have consistent dashboards.
**Impact**: Mean time to resolution (MTTR) from 2-3 hours → <1 hour (DORA elite)

### 3. Knowledge Preservation
**Problem**: When engineers leave, their knowledge of "how to debug service X" leaves with them.
**Solution**: Golden spec documents observability patterns. Any engineer can debug any service using same techniques.
**Impact**: Onboarding time reduced from 3-4 weeks → 2-3 days for new services

### 4. Proactive Problem Detection
**Problem**: Services fail silently or only discovered during business hours when customers complain.
**Solution**: Required alarms (error rate, latency, health check) with automated on-call paging.
**Impact**: From reactive incident response → proactive detection before customer impact

### 5. Compliance and Audit Readiness
**Problem**: Regulated industries (FSI) require audit trails and observability documentation.
**Solution**: Structured logs with complete metadata (userId, traceId, timestamp) provide audit trail.
**Impact**: SOX Section 404 compliance, simplified security audits

---

## Integration with MCP

This golden spec is integrated with the toolkit's MCP (Model Context Protocol) server for CloudWatch access.

**MCP Configuration**: `toolkit/mcp/cloudwatch.yaml`

**Available MCP Tools**:
- `cloudwatch_get_metrics` - Query CloudWatch metrics programmatically
- `cloudwatch_get_logs` - Retrieve structured logs from CloudWatch Logs
- `cloudwatch_get_alarms` - Check alarm states and history
- `cloudwatch_create_dashboard` - Generate dashboards from templates

**Example: Query Metrics via MCP**:

```typescript
// AI agent can query metrics using MCP
const metrics = await mcp.cloudwatch_get_metrics({
  namespace: 'CustomApp/Services',
  metricName: 'ErrorCount',
  dimensions: {
    ServiceName: 'notification-service',
    Environment: 'prod'
  },
  startTime: Date.now() - 3600000, // Last hour
  endTime: Date.now(),
  statistic: 'Sum'
});

// AI agent can analyze trends and suggest actions
if (metrics.some(m => m.value > 10)) {
  console.log('⚠️ High error rate detected. Check logs for root cause.');
}
```

**Use Cases**:
- AI-assisted incident debugging (query metrics + logs together)
- Automated dashboard generation from service definitions
- Intelligent alarm tuning based on historical patterns

---

## References

**Related Golden Specs**:
- `toolkit/specs/golden/logging-standard.spec.md` - Detailed logging format, PII redaction, log retention policies
- `toolkit/specs/golden/tracing-standard.spec.md` - Advanced X-Ray patterns, trace sampling, custom annotations
- `toolkit/specs/golden/alarms-runbook.spec.md` - Alarm response procedures, escalation policies, on-call playbooks

**AWS Documentation**:
- [CloudWatch Metrics Best Practices](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html)
- [AWS X-Ray Developer Guide](https://docs.aws.amazon.com/xray/latest/devguide/aws-xray.html)
- [CloudWatch Logs Insights Query Syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html)

**Industry Standards**:
- [Google SRE Book - Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [DORA Metrics - Observability for Elite Performers](https://dora.dev/)
- [OpenTelemetry Specification](https://opentelemetry.io/docs/specs/otel/) (for future migration path)

---

## Customization Guide

This golden spec is **opinionated by default** but allows customization for specific use cases. Here's where and how to customize:

### Customizable: Metric Namespaces

**Default**: `CustomApp/Services` for all services

**Customize for**: Multi-product organizations, different business units

**How to customize**:
```typescript
// ✓ ALLOWED: Use product-specific namespace
const namespace = 'ProductX/Services'; // Instead of CustomApp/Services

// ✗ AVOID: Per-service namespaces (hurts cross-service queries)
const namespace = 'NotificationService'; // Too granular
```

**Rationale**: Namespace controls CloudWatch billing and query scope. Use sparingly.

---

### Customizable: Additional Metrics Dimensions

**Default**: `ServiceName`, `Environment`, `Version` (required)

**Customize for**: Canary deployments, multi-region services, feature flags

**How to customize**:
```typescript
// ✓ ALLOWED: Add region dimension for multi-region services
await emitMetric('RequestCount', 1, 'Count', {
  Region: process.env.AWS_REGION // Additional dimension
});

// ✓ ALLOWED: Add feature flag dimension for A/B testing
await emitMetric('RequestCount', 1, 'Count', {
  FeatureFlag: 'new-checkout-flow' // Track metrics per feature
});
```

**Rationale**: Additional dimensions enable deeper analysis but increase metric cardinality (cost). Use only when needed.

---

### Customizable: Log Levels per Environment

**Default**: INFO in production, DEBUG in staging/dev

**Customize for**: High-traffic services (reduce log volume), debugging production issues

**How to customize**:
```typescript
// ✓ ALLOWED: Dynamic log level based on environment variable
const logLevel = process.env.LOG_LEVEL || 'INFO';

export const logger = {
  debug: (message: string, metadata?: any) => {
    if (['DEBUG'].includes(logLevel)) {
      log({ level: 'DEBUG', message, metadata });
    }
  },
  // ... other methods
};

// Enable DEBUG logs in production for specific requests
if (event.headers['x-debug-mode'] === 'true') {
  process.env.LOG_LEVEL = 'DEBUG';
}
```

**Rationale**: Log volume impacts cost and storage. Adjust log levels dynamically for troubleshooting.

---

### Customizable: Alarm Thresholds

**Default**: Error rate > 5% for 2 minutes, Latency p99 > 5s for 3 minutes

**Customize for**: High-reliability services (stricter thresholds), batch processing (looser thresholds)

**How to customize**:
```typescript
// ✓ ALLOWED: Stricter threshold for critical payment service
const errorRateAlarm = new cloudwatch.Alarm(this, 'HighErrorRate', {
  threshold: 5,  // 5 errors (not 5%) - stricter for low-volume critical service
  evaluationPeriods: 1 // Alert after 1 minute instead of 2
});

// ✓ ALLOWED: Looser threshold for batch processing
const latencyAlarm = new cloudwatch.Alarm(this, 'HighLatency', {
  threshold: 60000,  // 60 seconds for batch jobs (not 5 seconds)
  evaluationPeriods: 5 // Alert after 5 minutes instead of 3
});
```

**Rationale**: Alarm thresholds depend on service SLOs and business impact. Tune based on historical data.

---

### Customizable: X-Ray Sampling Rate

**Default**: 5% in production, 100% in staging/dev

**Customize for**: Debugging production issues (temporarily increase), cost optimization (decrease)

**How to customize**:
```json
// X-Ray sampling rules (AWS Console or SDK)
{
  "rules": [
    {
      "description": "Increase sampling for specific endpoint",
      "priority": 1,
      "fixedRate": 1.0,  // 100% sampling
      "reservoirSize": 1,
      "attributes": {
        "http.url": "**/api/payment/process"  // Critical endpoint
      }
    }
  ]
}
```

**Rationale**: Higher sampling improves debugging but increases cost. Use selectively for high-value traces.

---

### Non-Customizable: Required Fields

**These MUST NOT be changed** (breaks cross-service compatibility):
- ✗ Log structure: All 8 required fields (`timestamp`, `level`, `service`, `environment`, `version`, `traceId`, `requestId`, `message`)
- ✗ Metric dimensions: `ServiceName`, `Environment`, `Version` are required for all metrics
- ✗ X-Ray trace ID header: `X-Amzn-Trace-Id` is AWS standard
- ✗ Required alarms: All production services MUST have error rate, latency, health check, resource saturation alarms

**Rationale**: These standards enable cross-service queries, dashboards, and incident response.

---

## Quick Start

**Step-by-step guide to adopt this golden spec in an existing service**:

### 1. Install Dependencies

```bash
npm install @aws-sdk/client-cloudwatch aws-xray-sdk-core
```

### 2. Copy Reusable Utilities

Copy these files from any reference implementation (e.g., `examples/notification-service/src/utils/`):
- `metrics.ts` (CloudWatch metrics helper)
- `logger.ts` (Structured logging helper)
- `http-client.ts` (X-Ray instrumented HTTP client)

### 3. Instrument Your Handler

```typescript
// src/handler.ts
import { logger } from './utils/logger';
import { emitMetric } from './utils/metrics';
import AWSXRay from 'aws-xray-sdk-core';

// Wrap AWS SDK clients with X-Ray
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
const dynamodb = AWSXRay.captureAWSv3Client(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent) => {
  const startTime = Date.now();
  
  logger.info('Request received', { path: event.path, method: event.httpMethod });
  await emitMetric('RequestCount', 1, 'Count');
  
  try {
    // Your business logic here
    const result = await processRequest(event);
    
    const latency = Date.now() - startTime;
    await emitMetric('Latency', latency, 'Milliseconds');
    
    logger.info('Request completed successfully', { latency });
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    await emitMetric('ErrorCount', 1, 'Count');
    logger.error('Request failed', error as Error, { path: event.path });
    
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
```

### 4. Configure Alarms and Dashboard (CDK/CloudFormation)

Add alarms and dashboard to your infrastructure-as-code:

```typescript
// infra/monitoring-stack.ts
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cdk from 'aws-cdk-lib';

export class MonitoringStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    // Import reusable monitoring construct
    new StandardMonitoring(this, 'Monitoring', {
      serviceName: 'my-service',
      environment: 'prod',
      alarmTopic: sns.Topic.fromTopicArn(this, 'AlarmTopic', 'arn:aws:sns:...')
    });
  }
}
```

**Reusable CDK Construct** (`infra/constructs/standard-monitoring.ts`):
```typescript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export interface StandardMonitoringProps {
  serviceName: string;
  environment: string;
  alarmTopic: sns.ITopic;
}

export class StandardMonitoring extends Construct {
  constructor(scope: Construct, id: string, props: StandardMonitoringProps) {
    super(scope, id);
    
    // Create all required alarms (see Section 4.1 for full implementation)
    const errorRateAlarm = new cloudwatch.Alarm(this, 'HighErrorRate', { /* ... */ });
    const latencyAlarm = new cloudwatch.Alarm(this, 'HighLatency', { /* ... */ });
    const healthCheckAlarm = new cloudwatch.Alarm(this, 'HealthCheckFailure', { /* ... */ });
    
    // Create standard dashboard (see Section 5.1 for full implementation)
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `${props.environment}-${props.serviceName}-dashboard`
    });
    
    // Add widgets...
  }
}
```

### 5. Validate Compliance

Run validation hook to verify compliance:

```bash
kiro validate-golden-spec --spec observability.spec.md --service ./src
```

**Expected output**:
```
✅ All required metrics present (RequestCount, ErrorCount, Latency, SuccessRate, HealthCheckStatus)
✅ All required dimensions present (ServiceName, Environment, Version)
✅ Structured logs validated (all required fields present)
✅ No PII detected in log statements
✅ X-Ray trace ID propagation implemented
✅ All required alarms configured
✅ Standard dashboard exists

🎉 Service complies with observability.spec.md golden spec
```

### 6. Monitor and Iterate

After deployment:
1. **Verify metrics** in CloudWatch console (`CustomApp/Services` namespace)
2. **Test alarms** by injecting errors (e.g., return 500 status code)
3. **Review dashboard** to ensure widgets display data
4. **Trace requests** in X-Ray console to verify end-to-end tracing
5. **Query logs** in CloudWatch Insights to validate structured format

**Sample CloudWatch Insights Query**:
```sql
fields @timestamp, level, message, metadata.latencyMs, traceId
| filter service = "my-service" and level = "ERROR"
| sort @timestamp desc
| limit 20
```

---

## Adoption Checklist

Use this checklist to track adoption progress:

- [ ] **Step 1**: Dependencies installed (`@aws-sdk/client-cloudwatch`, `aws-xray-sdk-core`)
- [ ] **Step 2**: Utilities copied (`metrics.ts`, `logger.ts`, `http-client.ts`)
- [ ] **Step 3**: Handler instrumented (metrics, logs, X-Ray)
- [ ] **Step 4**: Alarms configured (error rate, latency, health check, resource saturation)
- [ ] **Step 5**: Dashboard created (request rate, error rate, latency, resource utilization, alarm status)
- [ ] **Step 6**: Validation passed (all checks green ✅)
- [ ] **Step 7**: Deployed to staging (verify metrics, alarms, dashboard)
- [ ] **Step 8**: Deployed to production (monitor for 7 days)
- [ ] **Step 9**: Documented exceptions (if any) in service's spec.md
- [ ] **Step 10**: Shared learnings with team (retro, wiki page)

---

## Maintenance and Evolution

**Golden Spec Owner**: Platform Engineering Team

**Review Cadence**: Quarterly (January, April, July, October)

**Update Process**:
1. Propose changes via RFC (Request for Comments) in `toolkit/specs/golden/rfcs/`
2. Review with engineering leads and on-call team
3. Pilot changes with 1-2 services
4. Update golden spec and notify all teams (Slack announcement)
5. Grace period: 60 days for existing services to adopt changes

**Version History**:
- `v1.0.0` (2025-01-15): Initial release (CloudWatch metrics, X-Ray tracing, alarms, dashboards)
- `v1.1.0` (TBD): Planned additions (OpenTelemetry migration path, cost optimization guides)

---

## Support and Questions

**Slack Channel**: `#platform-observability`

**Office Hours**: Tuesdays 2-3 PM PT (Platform Engineering team)

**Escalation**: Create a ticket in `PLATFORM` Jira project with label `observability-golden-spec`

**Documentation Bugs**: Open PR against `toolkit/specs/golden/observability.spec.md` with suggested fix

---

**Last Updated**: 2025-01-15  
**Version**: 1.0.0  
**Authors**: Platform Engineering Team  
**Reviewers**: SRE Team, Security Team, Engineering Leads
