# Spec Templates

This directory contains spec templates and golden specs for the Kiro Cloud Engineering/DevOps Toolbox.

## Purpose

Specs serve as the source of truth for all development work:
- Define intent, contracts, constraints, and test expectations
- Drive automatic generation of implementation, tests, IaC, and documentation
- Capture design decisions and rationale ("why" behind choices)
- Enable knowledge preservation across team changes

## Contents

### Templates
Ready-to-use spec templates with bracketed placeholders for customization:
- `service.spec.md` - Template for microservices
- `feature.spec.md` - Template for feature specifications
- `infrastructure.spec.md` - Template for infrastructure as code

### Golden Specs
Organization-wide standards that all services must follow:
- `golden/auth-pattern.spec.md` - Authentication and authorization standards
- `golden/logging-standard.spec.md` - Structured logging requirements
- `golden/observability.spec.md` - Metrics, traces, and alarms standards
- `golden/tracing-standard.spec.md` - Distributed tracing and correlation ID standards

## Spec Structure

All specs follow a consistent format:
```markdown
## Intent
Single sentence: what this does and why it exists

## Contracts
Input/output interfaces, API signatures, event schemas

## Constraints
Non-negotiable requirements (security, performance, compliance, integration)

## Design Decisions (and why)
Rationale for architectural choices, trade-offs, historical context

## Test Expectations
- ✓ Positive cases that must pass
- ✗ Negative cases that must be rejected
- Edge cases that must be handled

## Rollback Plan (for production services)
Rollback triggers, procedure, and time targets
```

## Usage

1. Copy the appropriate template from this directory
2. Fill in bracketed placeholders: `[YOUR_SERVICE_NAME]`, `[YOUR_REGION]`, etc.
3. Follow inline guidance for each section
4. Use `validate-against-golden.yaml` hook to ensure compliance with golden specs

## Principles

- **Spec as Source of Truth**: Fix the spec, not the prompt
- **Explicit over Implicit**: State all requirements, constraints, and expectations
- **Knowledge Preservation**: Capture "why" behind decisions for future engineers
- **Standards as Code**: Golden specs define org-wide patterns, validated automatically
