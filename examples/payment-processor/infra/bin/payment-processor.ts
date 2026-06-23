#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PaymentProcessorStack } from '../lib/payment-processor-stack';

/**
 * Payment Processor CDK App
 * 
 * Entry point for AWS CDK deployment
 * 
 * Deployment:
 *   npm install
 *   npm run cdk:deploy
 * 
 * Synthesis (for local validation):
 *   npm run cdk:synth
 * 
 * Destruction (cleanup):
 *   npm run cdk:destroy
 */

const app = new cdk.App();

new PaymentProcessorStack(app, 'PaymentProcessorStack', {
  /* 
   * CUSTOMIZE: Specify your AWS account and region
   * Uncomment and modify the env section below:
   */
  // env: {
  //   account: process.env.CDK_DEFAULT_ACCOUNT,
  //   region: process.env.CDK_DEFAULT_REGION,
  // },

  /*
   * Stack configuration
   */
  description: 'Payment Processor infrastructure with security best practices (PCI DSS, encryption, least privilege IAM)',
  
  /*
   * Tags for cost tracking and organization
   */
  tags: {
    Project: 'PaymentProcessor',
    Environment: 'Production',
    ManagedBy: 'CDK',
    CostCenter: 'Engineering',
    Compliance: 'PCI-DSS',
  },
});
