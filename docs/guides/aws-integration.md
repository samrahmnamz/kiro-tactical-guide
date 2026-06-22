# Kiro + AWS Services Integration Guide

## Overview

This guide explains how Kiro integrates with AWS services to provide a comprehensive development experience for Cloud Engineering and DevOps teams. Kiro is designed to work seamlessly with your existing AWS infrastructure and development workflows.

**Key Integration Points:**
- **Amazon Bedrock**: AI model access and routing
- **AWS CodeCatalyst**: CI/CD pipeline integration
- **AWS CDK/CloudFormation**: Infrastructure as Code generation
- **Amazon CloudWatch**: Observability and logging
- **AWS X-Ray**: Distributed tracing
- **AWS Systems Manager**: Parameter Store and operational data
- **Cost Management**: Bedrock usage metering and optimization

---

## 1. Kiro + Amazon Bedrock Integration

### Model Routing

Kiro uses Amazon Bedrock to access foundation models. Different tasks use different models based on complexity and frequency:

```yaml
# .kiro/config.yaml
model_routing:
  # Complex reasoning tasks (use Claude Sonnet)
  spec_authoring: bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0
  architecture_review: bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0
  code_generation: bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0
  iac_generation: bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0
  
  # High-throughput tasks (use Nova)
  completions: bedrock/amazon.nova-lite-v1:0
  formatting: bedrock/amazon.nova-lite-v1:0
  test_generation: bedrock/amazon.nova-pro-v1:0
  doc_updates: bedrock/amazon.nova-lite-v1:0
  lint_fixes: bedrock/amazon.nova-lite-v1:0
```

**Model Selection Guidelines:**
- **Sonnet**: Use for tasks requiring deep reasoning (specs, architecture, complex refactoring)
- **Nova Pro**: Use for code generation and test writing
- **Nova Lite**: Use for high-frequency, straightforward tasks (formatting, documentation updates)

### IAM Configuration

Kiro requires IAM permissions to invoke Bedrock models. Create an IAM role with the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0",
        "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0",
        "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:ApplyGuardrail"
      ],
      "Resource": "arn:aws:bedrock:us-east-1:*:guardrail/*"
    }
  ]
}
```

**Best Practices:**
- Use IAM roles, not access keys
- Restrict model access to only what your team needs
- Enable Bedrock guardrails for content filtering and PII protection
- Use VPC endpoints for Bedrock in production environments

### Data Residency and Guardrails

Control which AWS regions are used for Bedrock calls:

```yaml
# toolkit/steering/region-config.yaml
name: data-residency
description: Data residency and model access controls

bedrock_config:
  allowed_regions:
    - us-east-1      # Customize for compliance requirements
    # - eu-west-1    # Uncomment for EU data residency
    # - ap-southeast-2  # Uncomment for APAC data residency
  
  guardrails:
    pii_filter: enabled               # Block PII from model responses
    topic_denial:
      - "internal company financials"
      - "employee personal information"
      - "customer credit card numbers"
    content_filter: enabled            # Bedrock content filtering
```

**Customization:**
- For **GDPR compliance**, use `eu-west-1` or `eu-central-1`
- For **FSI data residency**, configure region restrictions per regulatory requirements
- Add custom topic denials for your organization's sensitive topics

---

## 2. Kiro + AWS CodeCatalyst Integration

### Hook Triggers on CodeCatalyst Events

Kiro hooks can be triggered by CodeCatalyst PR and merge events, enabling automated quality checks and deployment workflows.

#### Example: PR Review Hook

```yaml
# .kiro/hooks/codecatalyst-pr-review.yaml
name: codecatalyst-pr-review
description: Run validation when PR is opened in CodeCatalyst
on:
  codecatalyst_pr:
    events:
      - opened
      - synchronized
run:
  agent: sonnet
  task: |
    Review this PR for:
    1. Spec compliance (does code match spec constraints?)
    2. Test coverage (are new features tested?)
    3. Security (no secrets, proper IAM policies?)
    
    Provide feedback as PR comments.
  approval: none
on_failure: warn
```

#### Example: Post-Merge Deployment

```yaml
# .kiro/hooks/codecatalyst-deploy-staging.yaml
name: codecatalyst-deploy-staging
description: Deploy to staging when PR is merged to main
on:
  codecatalyst_merge:
    branches:
      - main
run:
  agent: sonnet
  task: |
    1. Verify all tests pass
    2. Check for destructive changes (database schema, API breaking changes)
    3. Deploy to staging environment using CDK
    4. Run smoke tests
  approval: pr_review
on_failure: block_context
```

### CodeCatalyst Workflow Integration

Kiro hooks work **alongside** CodeCatalyst workflows, not as a replacement:

**Hook Responsibilities (fast feedback loop):**
- Instant validation on file save (linting, formatting, secret scanning)
- Local test execution before commit
- Pre-send context filtering

**CodeCatalyst Workflow Responsibilities (safety net):**
- Full test suite execution across multiple environments
- Integration tests requiring AWS resources
- Security scanning with AWS services (Inspector, GuardDuty)
- Final deployment to production environments

**Integration Pattern:**
```
Developer saves file
  ↓
Kiro hook runs locally (instant feedback)
  ↓
Developer commits + pushes
  ↓
CodeCatalyst workflow runs (comprehensive validation)
  ↓
If all pass → merge + deploy
```

### Setup Instructions

1. **Configure CodeCatalyst webhooks** in your project settings:
   - Navigate to Project Settings → Webhooks
   - Add webhook URL: `https://your-kiro-instance.example.com/webhooks/codecatalyst`
   - Select events: Pull request created, Pull request updated, Merged to branch

2. **Configure Kiro to receive webhooks**:
   ```yaml
   # .kiro/config.yaml
   webhooks:
     codecatalyst:
       enabled: true
       secret: ${CODECATALYST_WEBHOOK_SECRET}  # Store in SSM Parameter Store
       events:
         - pull_request.opened
         - pull_request.synchronized
         - merge.completed
   ```

3. **Test the integration**:
   - Open a test PR in CodeCatalyst
   - Verify Kiro hook runs and provides feedback
   - Check hook execution logs in Kiro dashboard

---

## 3. CDK/CloudFormation Generation from Specs

### Spec-Driven Infrastructure

Kiro can generate AWS CDK or CloudFormation templates directly from spec documents. This ensures infrastructure matches your documented requirements.

#### Example Spec with Infrastructure Requirements

```markdown
# specs/services/payment-processor.spec.md

## Intent
Process payments securely with PCI DSS compliance.

## Infrastructure Requirements

### Compute
- Lambda function: Node.js 20.x runtime, 512MB memory, 30s timeout
- Provisioned concurrency: 5 instances for prod

### Storage
- DynamoDB table: pay-per-request billing, point-in-time recovery enabled
- Partition key: `paymentId` (String)
- GSI: `customerId-timestamp-index` for customer payment history

### Security
- Encryption: All data at rest encrypted with KMS (customer-managed key)
- IAM: Principle of least privilege, no wildcard actions
- VPC: Lambda in private subnets with NAT gateway for external API calls

### Monitoring
- CloudWatch alarms: Error rate >1%, Duration >25s
- X-Ray tracing: Enabled for all requests
- Log retention: 30 days
```

#### Generated CDK Stack

Kiro hook can generate CDK infrastructure from this spec:

```yaml
# toolkit/hooks/generate-infrastructure.yaml
name: generate-infrastructure
description: Generate CDK stack from spec infrastructure requirements
on:
  spec_change:
    status: approved
run:
  agent: sonnet
  task: |
    Generate AWS CDK TypeScript stack matching the infrastructure requirements in this spec.
    
    Output: infra/lib/{service-name}-stack.ts
    
    Follow these patterns:
    1. Use L2 constructs where available
    2. Enable all specified monitoring and security features
    3. Follow AWS Well-Architected Framework best practices
    4. Include inline comments explaining each resource
  approval: pr_review
on_failure: warn
```

#### Example Generated CDK Code

```typescript
// Generated from specs/services/payment-processor.spec.md

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class PaymentProcessorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // KMS key for encryption at rest (customer-managed)
    const encryptionKey = new kms.Key(this, 'PaymentEncryptionKey', {
      description: 'Payment data encryption key',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // DynamoDB table with specifications from spec
    const paymentsTable = new dynamodb.Table(this, 'PaymentsTable', {
      partitionKey: { name: 'paymentId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: encryptionKey,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI for customer payment history
    paymentsTable.addGlobalSecondaryIndex({
      indexName: 'customerId-timestamp-index',
      partitionKey: { name: 'customerId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
    });

    // Lambda function with specifications from spec
    const paymentFunction = new lambda.Function(this, 'PaymentFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('dist'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,  // X-Ray enabled
      environment: {
        PAYMENTS_TABLE: paymentsTable.tableName,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Provisioned concurrency for production
    const version = paymentFunction.currentVersion;
    const alias = new lambda.Alias(this, 'PaymentFunctionAlias', {
      aliasName: 'prod',
      version: version,
      provisionedConcurrentExecutions: 5,
    });

    // Grant DynamoDB permissions (principle of least privilege)
    paymentsTable.grantReadWriteData(paymentFunction);

    // CloudWatch alarms per spec
    paymentFunction.metricErrors().createAlarm(this, 'ErrorAlarm', {
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      alarmDescription: 'Payment function error rate exceeds 1%',
    });

    paymentFunction.metricDuration().createAlarm(this, 'DurationAlarm', {
      threshold: 25000,  // 25 seconds
      evaluationPeriods: 1,
      alarmDescription: 'Payment function duration exceeds 25s',
    });
  }
}
```

### CloudFormation Export

If your team uses CloudFormation directly instead of CDK, Kiro can generate CloudFormation YAML:

```yaml
# toolkit/hooks/generate-cloudformation.yaml
name: generate-cloudformation
description: Generate CloudFormation template from spec
on:
  spec_change:
    status: approved
run:
  agent: sonnet
  task: |
    Generate CloudFormation YAML template matching the infrastructure requirements in this spec.
    
    Output: infra/template.yaml
    
    Follow CloudFormation best practices:
    1. Use intrinsic functions (Ref, GetAtt) correctly
    2. Define all resources with complete property specifications
    3. Include Outputs section for important resource identifiers
  approval: pr_review
on_failure: warn
```

---

## 4. MCP Integrations: CloudWatch, X-Ray, Systems Manager

Model Context Protocol (MCP) integrations provide AWS operational data as context for AI-assisted debugging and development.

### CloudWatch Logs and Metrics

Connect CloudWatch logs and metrics to Kiro for debugging and troubleshooting:

```yaml
# toolkit/mcp/cloudwatch.yaml
name: cloudwatch
description: CloudWatch logs and metrics as model context
mcp_server:
  command: mcp-server-cloudwatch
  args:
    - --log-groups
    - /aws/lambda/payment-processor
    - /aws/lambda/notification-service
    - --metrics-namespace
    - PaymentProcessing
connection:
  aws_region: ${AWS_REGION}
  aws_profile: ${AWS_PROFILE}  # or use IAM role
permissions:
  - logs:GetLogEvents
  - logs:DescribeLogGroups
  - logs:FilterLogEvents
  - cloudwatch:GetMetricData
  - cloudwatch:ListMetrics
```

**Usage Example:**
```
Developer: "Why did the payment processor fail at 2pm today?"

Kiro (with CloudWatch context):
Looking at CloudWatch logs for /aws/lambda/payment-processor around 2pm...

Found error logs:
  2025-01-15T14:03:27Z ERROR Stripe API timeout after 30s
  2025-01-15T14:03:28Z ERROR DynamoDB throttling exception
  
CloudWatch metrics show:
  - Payment processor duration spiked to 45s (normally 2-3s)
  - DynamoDB read capacity consumed 100% at 14:03
  
Root cause: DynamoDB table hit provisioned capacity limit during high traffic.
Recommendation: Switch to on-demand billing or increase provisioned capacity.
```

### X-Ray Distributed Tracing

Connect AWS X-Ray traces to understand distributed system behavior:

```yaml
# toolkit/mcp/xray.yaml
name: xray
description: X-Ray traces as model context
mcp_server:
  command: mcp-server-xray
  args:
    - --trace-hours
    - 24
connection:
  aws_region: ${AWS_REGION}
permissions:
  - xray:GetTraceSummaries
  - xray:BatchGetTraces
  - xray:GetServiceGraph
```

**Usage Example:**
```
Developer: "Trace request ID abc-123-xyz and explain why it took 8 seconds"

Kiro (with X-Ray context):
Retrieved trace abc-123-xyz...

Trace breakdown:
  1. API Gateway: 50ms
  2. Lambda (payment-processor): 120ms
     - DynamoDB GetItem: 15ms ✓
     - Stripe API call: 7.2s ✗ (timeout retries)
     - DynamoDB PutItem: 18ms ✓
  3. SQS send: 10ms ✓
  Total: 8.0s

Bottleneck: Stripe API call took 7.2 seconds with 2 retry attempts.
Recommendation: Implement circuit breaker for Stripe API or reduce timeout.
```

### Systems Manager Parameter Store

Access SSM Parameter Store for configuration values:

```yaml
# toolkit/mcp/ssm.yaml
name: systems-manager
description: SSM Parameter Store as model context
mcp_server:
  command: mcp-server-ssm
  args:
    - --parameter-path
    - /app/config/
connection:
  aws_region: ${AWS_REGION}
permissions:
  - ssm:GetParameter
  - ssm:GetParameters
  - ssm:GetParametersByPath
  - ssm:DescribeParameters
```

**Usage Example:**
```
Developer: "Update the rate limiter to use the threshold from SSM"

Kiro (with SSM context):
Found parameter: /app/config/rate-limit-threshold = 1000

Updated code to fetch from SSM:
```typescript
const ssm = new AWS.SSM();
const param = await ssm.getParameter({
  Name: '/app/config/rate-limit-threshold'
}).promise();
const threshold = parseInt(param.Parameter.Value);
```
```

### MCP Setup Instructions

1. **Install MCP servers**:
   ```bash
   npm install -g @modelcontextprotocol/server-cloudwatch
   npm install -g @modelcontextprotocol/server-xray
   npm install -g @modelcontextprotocol/server-ssm
   ```

2. **Configure AWS credentials**:
   - Use IAM roles (recommended for EC2/ECS/Lambda)
   - Or configure AWS profile: `aws configure --profile kiro-mcp`

3. **Enable MCP in Kiro config**:
   ```yaml
   # .kiro/config.yaml
   mcp:
     enabled: true
     servers:
       - cloudwatch
       - xray
       - ssm
   ```

4. **Test MCP connection**:
   ```bash
   kiro mcp test cloudwatch
   # Should return: ✓ Connected to CloudWatch, 5 log groups accessible
   ```

---

## 5. Hooks + CI/CD Pipeline Integration Pattern

Kiro hooks and AWS CI/CD pipelines work together as **layered validation**:

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Developer Machine (Fast Feedback)                          │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Kiro Hooks                                          │    │
│  │ • Secret scanning (local)                           │    │
│  │ • Lint on save (instant)                            │    │
│  │ • Test on save (fast)                               │    │
│  │ • Pre-send context filtering (local)                │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          ↓ Commit + Push
┌─────────────────────────────────────────────────────────────┐
│  AWS CodePipeline/CodeCatalyst (Safety Net)                 │
│  ┌────────────────────────────────────────────────────┐    │
│  │ CI/CD Pipeline                                      │    │
│  │ • Full test suite (all environments)                │    │
│  │ • Integration tests (requires AWS resources)        │    │
│  │ • Security scanning (Inspector, GuardDuty)          │    │
│  │ • Performance tests                                 │    │
│  │ • Compliance validation                             │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          ↓ If all pass
┌─────────────────────────────────────────────────────────────┐
│  Deployment                                                  │
│  • Staging environment                                       │
│  • Production environment (with approval)                    │
└─────────────────────────────────────────────────────────────┘
```

### Decision Guide: Hook vs Pipeline

| Task | Hook (Local) | Pipeline (CI/CD) | Reasoning |
|------|--------------|------------------|-----------|
| Secret scanning | ✓ | ✓ | Hook blocks before commit, pipeline is safety net |
| Linting | ✓ |  | Instant feedback more valuable than pipeline |
| Unit tests | ✓ | ✓ | Hook runs changed tests, pipeline runs full suite |
| Integration tests |  | ✓ | Requires AWS resources, expensive to run locally |
| Security scanning |  | ✓ | Tools like Inspector require AWS infrastructure |
| Deployment |  | ✓ | Production deployments require approval workflows |
| Smoke tests | ✓ (staging) | ✓ (prod) | Hook for staging, pipeline for production |

### Example CodePipeline Configuration

```yaml
# buildspec.yml for AWS CodeBuild
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - npm install
  
  pre_build:
    commands:
      # Lint (safety net, hooks already ran this locally)
      - npm run lint
      
      # Secret scanning (safety net)
      - gitleaks detect --source . --verbose
      
  build:
    commands:
      # Build
      - npm run build
      
      # Full test suite (unit + integration)
      - npm test
      
      # Security scanning
      - npm audit --audit-level=high
      
  post_build:
    commands:
      # Deploy infrastructure
      - cd infra && npm run cdk deploy -- --require-approval never
      
      # Run smoke tests
      - npm run test:smoke

artifacts:
  files:
    - '**/*'
  base-directory: dist

reports:
  test-results:
    files:
      - 'test-results/**/*.xml'
    file-format: 'JUNITXML'
```

### CodeCatalyst Workflow Example

```yaml
# .codecatalyst/workflows/main.yml
Name: MainWorkflow
SchemaVersion: 1.0

Triggers:
  - Type: PUSH
    Branches:
      - main

Actions:
  Build:
    Identifier: aws/build@v1
    Inputs:
      Sources:
        - WorkflowSource
    Configuration:
      Steps:
        - Run: npm install
        - Run: npm run build
        - Run: npm test
    
  SecurityScan:
    Identifier: aws/managed-test@v1
    DependsOn:
      - Build
    Configuration:
      Steps:
        - Run: aws inspector2 scan --resource-arn ${LAMBDA_ARN}
    
  DeployStaging:
    Identifier: aws/cdk-deploy@v1
    DependsOn:
      - Build
      - SecurityScan
    Environment:
      Name: staging
    Configuration:
      StackName: PaymentProcessorStack-Staging
      
  DeployProduction:
    Identifier: aws/cdk-deploy@v1
    DependsOn:
      - DeployStaging
    Environment:
      Name: production
      RequireApproval: true
    Configuration:
      StackName: PaymentProcessorStack-Prod
```

---

## 6. Cost Visibility and Bedrock Metering

### Understanding Bedrock Costs

Amazon Bedrock pricing varies by model:

| Model | Input (per 1k tokens) | Output (per 1k tokens) |
|-------|----------------------|------------------------|
| Claude 3.5 Sonnet | $0.003 | $0.015 |
| Nova Pro | $0.0008 | $0.0032 |
| Nova Lite | $0.00006 | $0.00024 |

**Cost Optimization Strategies:**
1. Use Nova Lite for high-frequency, simple tasks (formatting, doc updates)
2. Use Nova Pro for code generation and test writing
3. Reserve Sonnet for complex reasoning (specs, architecture reviews)
4. Enable response streaming to reduce perceived latency and token usage

### Metering by Team/Project

Tag Bedrock API calls with team and project identifiers for cost allocation:

```yaml
# .kiro/config.yaml
bedrock:
  tags:
    team: ${TEAM_NAME}
    project: ${PROJECT_NAME}
    cost_center: ${COST_CENTER}
```

### CloudWatch Metrics for Usage Tracking

Kiro publishes Bedrock usage metrics to CloudWatch:

```yaml
# Automatically published metrics
Namespace: Kiro/Bedrock
Metrics:
  - ModelInvocations (Count)
  - InputTokens (Count)
  - OutputTokens (Count)
  - Cost (USD)
Dimensions:
  - Model (sonnet | nova-pro | nova-lite)
  - Team
  - Project
```

### Cost Dashboard

Create a CloudWatch dashboard to track Bedrock costs:

```typescript
// infra/lib/cost-dashboard.ts
const dashboard = new cloudwatch.Dashboard(this, 'BedrockCostDashboard', {
  dashboardName: 'kiro-bedrock-costs',
});

// Cost by model
dashboard.addWidgets(new cloudwatch.GraphWidget({
  title: 'Bedrock Cost by Model',
  left: [
    new cloudwatch.Metric({
      namespace: 'Kiro/Bedrock',
      metricName: 'Cost',
      dimensionsMap: { Model: 'sonnet' },
      statistic: 'Sum',
      label: 'Sonnet',
    }),
    new cloudwatch.Metric({
      namespace: 'Kiro/Bedrock',
      metricName: 'Cost',
      dimensionsMap: { Model: 'nova-pro' },
      statistic: 'Sum',
      label: 'Nova Pro',
    }),
    new cloudwatch.Metric({
      namespace: 'Kiro/Bedrock',
      metricName: 'Cost',
      dimensionsMap: { Model: 'nova-lite' },
      statistic: 'Sum',
      label: 'Nova Lite',
    }),
  ],
}));

// Cost by team
dashboard.addWidgets(new cloudwatch.GraphWidget({
  title: 'Bedrock Cost by Team',
  left: [
    new cloudwatch.Metric({
      namespace: 'Kiro/Bedrock',
      metricName: 'Cost',
      dimensionsMap: { Team: 'payments' },
      statistic: 'Sum',
    }),
    new cloudwatch.Metric({
      namespace: 'Kiro/Bedrock',
      metricName: 'Cost',
      dimensionsMap: { Team: 'notifications' },
      statistic: 'Sum',
    }),
  ],
}));
```

### Budget Alerts

Set up AWS Budgets to alert on Bedrock spending:

```typescript
// infra/lib/budget-alerts.ts
import * as budgets from 'aws-cdk-lib/aws-budgets';

new budgets.CfnBudget(this, 'BedrockBudget', {
  budget: {
    budgetName: 'kiro-bedrock-monthly',
    budgetType: 'COST',
    timeUnit: 'MONTHLY',
    budgetLimit: {
      amount: 1000,  // $1000/month
      unit: 'USD',
    },
    costFilters: {
      Service: ['Amazon Bedrock'],
    },
  },
  notificationsWithSubscribers: [
    {
      notification: {
        notificationType: 'ACTUAL',
        comparisonOperator: 'GREATER_THAN',
        threshold: 80,  // Alert at 80% of budget
      },
      subscribers: [
        {
          subscriptionType: 'EMAIL',
          address: 'devops-team@example.com',
        },
      ],
    },
  ],
});
```

### Usage Recommendations

**For Small Teams (< 10 developers):**
- Expected cost: $100-300/month
- Use Nova Lite for most tasks
- Reserve Sonnet for critical specs and architecture reviews

**For Medium Teams (10-50 developers):**
- Expected cost: $500-2000/month
- Implement model routing to optimize costs
- Set up team-level budgets and alerts
- Review usage monthly and adjust model routing

**For Large Organizations (50+ developers):**
- Expected cost: $3000+/month
- Implement cost allocation tags by team/project
- Create dedicated Bedrock budget per business unit
- Consider Bedrock Provisioned Throughput for high-volume teams

---

## Summary

Kiro integrates deeply with AWS services to provide a comprehensive development experience:

✅ **Amazon Bedrock** for AI model access with intelligent routing  
✅ **AWS CodeCatalyst** for CI/CD pipeline coordination  
✅ **AWS CDK/CloudFormation** for infrastructure generation from specs  
✅ **CloudWatch, X-Ray, Systems Manager** for operational context  
✅ **Cost visibility** through tagging, metrics, and budget alerts  

This integration ensures Kiro fits seamlessly into your existing AWS infrastructure while providing the automation and intelligence to accelerate Cloud Engineering and DevOps workflows.

---

## Next Steps

1. **Review the [Quick Start Guide](../../QUICKSTART.md)** to set up your first Kiro hook
2. **Explore the [example projects](../../examples/)** to see AWS integrations in action:
   - `payment-processor/`: Bedrock + Lambda + DynamoDB
   - `notification-service/`: CDK generation from specs
   - `settlement-engine/`: CloudWatch and X-Ray integration
3. **Read the [Decision Tree](decision-tree.md)** to find the right artifacts for your use case
4. **Set up [MCP integrations](../reference/mcp-configuration.md)** for CloudWatch and X-Ray

## Additional Resources

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [AWS CodeCatalyst User Guide](https://docs.aws.amazon.com/codecatalyst/)
