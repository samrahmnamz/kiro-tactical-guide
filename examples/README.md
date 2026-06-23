# Example Projects

This directory contains complete, working sample projects demonstrating the Kiro Cloud Engineering/DevOps Toolbox in action.

## Purpose

Example projects show how toolkit artifacts work together in realistic scenarios:
- Complete implementations with source code, tests, and infrastructure
- Real-world use cases addressing specific primary concerns
- Before/after metrics demonstrating improvements
- Copy-paste ready code for common patterns

## Examples

Each example project addresses one or more of the 10 primary concerns:

### Payment Processor (Security & Compliance)
- **Concern**: Primary Concern #1 - Security & Compliance
- **Demonstrates**: Secret scanning, IAM validation, PCI DSS compliance, encryption standards
- **Stack**: TypeScript, Stripe API, DynamoDB, AWS CDK
- **Artifacts**: scan-secrets.yaml, validate-iam.yaml, excluded-paths.yaml

### Rate Limiter (Stability)
- **Concern**: Primary Concern #2 - AI Destabilizing Delivery
- **Demonstrates**: Test-on-save, explicit test expectations, spec constraint validation
- **Stack**: TypeScript, Redis, Express
- **Artifacts**: test-on-save.yaml, validate-spec-constraints.yaml

### Notification Service (Automation)
- **Concern**: Primary Concern #3 - Engineer Burnout
- **Demonstrates**: Spec → implementation + tests + IaC + docs automation
- **Stack**: TypeScript, SQS, SNS, AWS CDK
- **Artifacts**: update-docs.yaml, scaffold-service.yaml, regen-clients.yaml

### Settlement Engine (Regulatory)
- **Concern**: Primary Concern #9 - FSI Regulatory Complexity
- **Demonstrates**: Deployment windows, approval requirements, audit trails
- **Stack**: TypeScript, DynamoDB, Step Functions, AWS CDK
- **Artifacts**: deployment-window.yaml, require-approvals.yaml

## Usage

Each example includes:
- A complete spec document showing requirements and constraints
- Working implementation code
- Comprehensive test suite
- Infrastructure as code (AWS CDK)
- README with setup instructions and validation steps

Clone the example that matches your use case, customize the configuration, and adapt it for your specific needs.
