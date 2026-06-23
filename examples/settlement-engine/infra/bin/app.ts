#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SettlementEngineStack } from '../lib/settlement-engine-stack';

const app = new cdk.App();

/**
 * Settlement Engine Stack
 * 
 * Financial settlement processing engine with regulatory compliance.
 * 
 * IMPORTANT: This stack must be deployed in us-east-1 only for data residency compliance.
 * 
 * Environment Configuration:
 * - Region: us-east-1 (FDIC-approved region)
 * - Account: Use AWS_ACCOUNT_ID environment variable or CDK context
 */
new SettlementEngineStack(app, 'SettlementEngineStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // Data residency requirement - must be us-east-1
  },
  description: 'Settlement Engine - Financial settlement processing with SOX Section 404 compliance',
  tags: {
    Project: 'SettlementEngine',
    Environment: 'Production',
    Compliance: 'SOX-404',
    DataClassification: 'Financial',
  },
});

app.synth();
