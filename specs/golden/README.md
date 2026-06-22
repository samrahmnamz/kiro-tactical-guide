# Golden Specs: Organizational Standards

## What Are Golden Specs?

Golden specs are **platform-team-approved specification templates** that define organizational standards for cross-cutting concerns that apply to all (or most) services. They represent the "golden standard" that individual service specs should follow or reference.

## Purpose

Golden specs serve multiple purposes:

1. **Consistency**: Ensure all services follow the same patterns for auth, logging, tracing, error handling, etc.
2. **Standards Enforcement**: Provide a single source of truth that can be automatically validated via hooks
3. **Knowledge Sharing**: Document organizational decisions and patterns in one place
4. **Cascade Updates**: When a golden spec changes, hooks can automatically propagate updates to all affected services
5. **Onboarding**: New engineers read golden specs first to understand team standards

## How to Use Golden Specs

### For Service Developers

When writing a service spec, **reference golden specs** instead of re-documenting standards:

```markdown
# specs/services/payment-service.spec.md

## Intent
Process credit card payments securely.

## Constraints

### Authentication
Follows `specs/golden/auth-pattern.spec.md` using OAuth2 client credentials flow.

### Logging
Follows `specs/golden/logging-standard.spec.md` with structured JSON logs.

### Tracing
Follows `specs/golden/tracing-standard.spec.md` with X-Ray trace ID propagation.

### Observability
Follows `specs/golden/observability.spec.md` with CloudWatch metrics and alarms.

### Service-Specific Constraints
- PCI DSS compliance required
- All card data encrypted at rest (AES-256)
- No PII in logs or traces
- ...
```

### For Platform Teams

When updating a golden spec:

1. **Update the golden spec** with new requirements
2. **Get approval** from platform team lead or architecture review board
3. **Mark spec as approved** (triggers cascade hooks)
4. **Hooks automatically open PRs** for all services that need to align
5. **Review and merge PRs** after tests pass

Example workflow:
```bash
# 1. Update golden spec
vim specs/golden/tracing-standard.spec.md

# 2. Commit and get approval
git add specs/golden/tracing-standard.spec.md
git commit -m "Add SQS trace propagation requirement to tracing standard"
# ... PR approval process ...

# 3. Hooks trigger automatically when spec is marked "approved"
# This opens PRs for all services to align with the new requirement
```

## Available Golden Specs

| Golden Spec | Purpose | Applies To |
|-------------|---------|------------|
| `tracing-standard.spec.md` | AWS X-Ray distributed tracing | All backend services |
| `auth-pattern.spec.md` | Authentication and authorization | All APIs |
| `logging-standard.spec.md` | Structured logging format | All services |
| `observability.spec.md` | CloudWatch metrics and alarms | All services |
| `error-handling.spec.md` | Error handling and recovery | All services |

## Validation

Golden spec compliance is automatically validated via the `validate-against-golden.yaml` hook:

```yaml
# .kiro/hooks/validate-against-golden.yaml
name: validate-golden-spec-compliance
on:
  spec_change:
    paths:
      - specs/services/**/*.spec.md
run:
  agent: sonnet
  task: |
    The spec at ${event.path} has been modified.
    Compare its constraints against the golden specs in specs/golden/:
    - specs/golden/auth-pattern.spec.md
    - specs/golden/logging-standard.spec.md
    - specs/golden/observability.spec.md
    - specs/golden/tracing-standard.spec.md
    
    Flag any contradictions. If the service spec defines patterns that
    conflict with golden specs, report the specific conflict and suggest alignment.
  approval: none
```

## Creating New Golden Specs

Platform teams can create new golden specs for cross-cutting concerns:

**When to create a golden spec:**
- The requirement applies to 80%+ of services
- The pattern is stable and unlikely to change frequently
- Inconsistency would cause operational problems

**Structure of a golden spec:**
```markdown
# Golden Spec: [Topic Name]

**Status**: Golden Spec (Organizational Standard)
**Owner**: Platform Engineering Team
**Last Updated**: YYYY-MM-DD
**Applies To**: [which services]

## Intent
[One sentence: what this standard achieves]

## Why This Matters
[Problem without this standard, solution with it]

## Constraints
[Specific, testable requirements that all services must satisfy]

## Implementation Patterns
[Code examples showing how to implement the standard]

## Validation
[How to verify compliance - automated and manual]

## Customization Guide
[When/how services can deviate from the standard]

## Exceptions and Waivers
[Process for requesting exceptions]

## Related Standards
[Links to other golden specs]

## References
[External documentation]

## Revision History
[Version, date, author, changes]
```

## Exception Process

If a service cannot comply with a golden spec:

1. **Document the exception** in the service spec with rationale
2. **Get approval** from Platform Engineering team lead
3. **Track in exceptions log**: `docs/golden-spec-exceptions.md`
4. **Review annually** to see if exception can be resolved

Example exception documentation:
```markdown
# specs/services/legacy-adapter.spec.md

## Constraints

### Authentication
**Exception to `auth-pattern.spec.md`**: This service uses API key authentication
instead of OAuth2 because it interfaces with a legacy third-party system that
only supports API keys.

**Approved by**: Platform Team Lead (2025-01-10)
**Review Date**: 2026-01-10
```

## Best Practices

1. **Keep golden specs focused**: One concern per golden spec (auth, logging, tracing, etc.)
2. **Make requirements testable**: Use specific, verifiable constraints
3. **Provide code examples**: Show how to implement the standard in TypeScript/Python/etc.
4. **Document the "why"**: Help engineers understand the reasoning behind requirements
5. **Version golden specs**: Track revision history for changes
6. **Review regularly**: Quarterly review to ensure standards remain relevant
7. **Communicate changes**: Announce golden spec updates in team channels before cascading

## FAQ

**Q: What if my service has unique requirements that conflict with a golden spec?**  
A: Document the conflict and request an exception (see Exception Process above).

**Q: Can I propose changes to a golden spec?**  
A: Yes! Open an issue or PR with your proposal. Platform team will review.

**Q: How do I know if my service is compliant?**  
A: The `validate-against-golden.yaml` hook checks automatically on spec changes.

**Q: What happens if I don't follow a golden spec?**  
A: The validation hook will flag conflicts. You must either align or document an approved exception.

**Q: Are golden specs mandatory?**  
A: Yes, unless you have an approved exception documented in your service spec.

---

**Questions?**  
Contact: #platform-engineering on Slack  
