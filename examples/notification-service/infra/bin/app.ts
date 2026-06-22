#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NotificationServiceStack } from '../lib/notification-service-stack';

/**
 * Notification Service CDK App
 * 
 * Entry point for AWS CDK deployment
 * 
 * This infrastructure demonstrates automation patterns where the CDK code
 * is generated from the spec.md file using Kiro's hooks:
 * - toolkit/hooks/automation/scaffold-service.yaml
 * - toolkit/hooks/automation/update-docs.yaml
 * 
 * Deployment:
 *   cd examples/notification-service/infra
 *   npm install
 *   npm run build
 *   npm run cdk synth    # Preview CloudFormation template
 *   npm run cdk deploy   # Deploy to AWS
 * 
 * Destruction (cleanup):
 *   npm run cdk destroy
 * 
 * Prerequisites:
 * - AWS CLI configured with credentials
 * - Node.js 18+ and npm installed
 * - AWS CDK CLI installed (npm install -g aws-cdk)
 * - SES sender email addresses verified (see README)
 * - SNS spending limits configured for your environment
 */

const app = new cdk.App();

new NotificationServiceStack(app, 'NotificationServiceStack', {
  /* 
   * CUSTOMIZE: Specify your AWS account and region
   * Uncomment and modify the env section below:
   */
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },

  /*
   * Stack configuration
   */
  description: 'Notification Service - Multi-channel notifications with automation patterns (email, SMS, push)',
  
  /*
   * Tags for cost tracking and organization
   */
  tags: {
    Project: 'NotificationService',
    Environment: 'Production',
    ManagedBy: 'CDK',
    CostCenter: 'Engineering',
    Purpose: 'AutomationExample',
    Concern: 'EngineerBurnout',
  },
});
