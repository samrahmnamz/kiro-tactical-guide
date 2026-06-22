#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PaymentProcessorStack } from '../lib/payment-processor-stack';

const app = new cdk.App();

new PaymentProcessorStack(app, 'PaymentProcessorStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Payment processor service with PCI DSS compliance and security controls',
});
