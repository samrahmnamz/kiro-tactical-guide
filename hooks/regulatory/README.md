# Regulatory Hooks

This directory contains hooks that ensure compliance with financial services regulations.

## Purpose

Regulatory hooks help FSI organizations meet compliance requirements by:
- Capturing post-incident lessons as spec constraints
- Enforcing deployment windows during market hours
- Validating change authorization and approval chains
- Maintaining audit trails for regulatory review

## Primary Concerns Addressed

**Primary Concern #9: FSI Regulatory Complexity**
- OCC, FDIC, Fed, SEC requirements
- No deployment during market hours
- Change Advisory Board (CAB) authorization
- SOX Section 404 traceability
- Solution: Automated enforcement with audit trails

**Primary Concern #10: Knowledge Loss When Engineers Leave**
- 47% burnout rate leads to knowledge loss
- Solution: Capture institutional knowledge in specs and constraints

## Hooks

Regulatory hooks will include:
- `post-incident-learning.yaml` - Capture lessons from incidents and encode them as spec constraints
- Deployment window enforcement (see deployment/ directory)
- Approval requirement validation (see deployment/ directory)

## Usage

Copy hooks to your project's `.kiro/hooks/` directory and customize regulatory requirements, deployment windows, and approval chains according to the inline guides in each hook.
