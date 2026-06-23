# Deployment Hooks

This directory contains hooks that automate deployment coordination and enforce deployment policies.

## Purpose

Deployment hooks increase velocity without sacrificing stability by:
- Automatically cascading API changes to downstream consumers
- Auto-deploying to staging when specs are approved
- Enforcing deployment windows for regulatory compliance
- Validating change authorization before deployment

## Primary Concerns Addressed

**Primary Concern #4: Deployment Velocity Gap**
- 77% of teams wait for others before shipping
- Only 29% can deploy on demand
- Solution: Cascading hooks and automated promotion

**Primary Concern #9: FSI Regulatory Complexity**
- Deployment during market hours prohibited
- Change approval requirements (CAB authorization)
- Solution: Time-based deployment windows with audit trails

## Hooks

Deployment hooks will include:
- `cascade-api-change.yaml` - Automatically update downstream consumers when API contracts change
- `promote-to-staging.yaml` - Auto-deploy to staging when spec is approved
- `deployment-window.yaml` - Enforce time-based deployment restrictions (FSI compliance)
- `require-approvals.yaml` - Validate spec changes have required approvals before deployment

## Usage

Copy hooks to your project's `.kiro/hooks/` directory and customize deployment targets, approval requirements, and time windows according to the inline guides in each hook.
