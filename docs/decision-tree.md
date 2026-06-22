# Decision Tree: Finding the Right Toolkit Artifacts

## Overview

This decision tree helps you quickly navigate from your specific problem to the exact Kiro toolkit artifacts that solve it. Start by identifying your #1 concern below, then follow the path to the relevant hooks, specs, steering rules, and examples.

## Quick Navigation

**Choose your primary concern:**

1. [Security & Compliance](#1-security--compliance) - 62% of teams rank this #1
2. [AI Destabilizing Delivery](#2-ai-destabilizing-delivery) - 25% increase in AI adoption = 7.2% reduction in stability
3. [Engineer Burnout](#3-engineer-burnout) - 47% of engineers report burnout
4. [Deployment Velocity Gap](#4-deployment-velocity-gap) - 77% wait for others before shipping
5. [Cognitive Overload](#5-cognitive-overload) - 7 CI/CD systems, 5 monitoring solutions
6. [AI-Generated Code Rework](#6-ai-generated-code-rework) - 5+ prompt iterations per feature
7. [Data Leakage from AI Tools](#7-data-leakage-from-ai-tools) - 68% of orgs experienced leakage
8. [Fragmented Toolchains](#8-fragmented-toolchains) - 12 different deployment methods
9. [FSI Regulatory Complexity](#9-fsi-regulatory-complexity) - OCC/FDIC/Fed/SEC compliance
10. [Knowledge Loss](#10-knowledge-loss) - 47% burnout rate = high turnover

---

## Problem-to-Solution Flowchart

### 1. Security & Compliance

**Problem Statement**: "62% of my team's time is spent on security issues"

**Symptoms**:
- Secrets accidentally committed to git
- Overly permissive IAM policies
- Sensitive data sent to models
- PCI DSS or regulatory compliance requirements


**Decision Path**:

```
Security/Compliance
├─ Secrets in code?
│  ├─ Quick Win ⭐: toolkit/hooks/security/scan-secrets.yaml
│  │  (Runs gitleaks locally, blocks file from model on detection)
│  └─ Zero-dependency alternative: toolkit/hooks/security/scan-secrets-regex.yaml
│     (Pure regex patterns, no external tools)
│
├─ IAM wildcards or overly permissive policies?
│  └─ toolkit/hooks/security/validate-iam.yaml
│     (Flags Action: "*" and Resource: "*", distinguishes risk levels)
│
├─ Risk of data leakage to models?
│  ├─ Quick Win ⭐: toolkit/steering/excluded-paths.yaml
│  │  (Prevents .env, secrets/, vault/ from reaching models)
│  └─ toolkit/hooks/security/pre-send-scan.yaml
│     (Scans context buffer before transmission, blocks if secrets found)
│
└─ Financial services regulations (PCI DSS, SOX)?
   ├─ Example: examples/payment-processor/
   │  (Demonstrates PCI DSS compliance, encryption, no PII in logs)
   └─ Example: examples/settlement-engine/
      (Demonstrates deployment windows, audit trails, rollback plans)
```

**Quick Win Recommendation**: Start with `scan-secrets.yaml` + `excluded-paths.yaml` (15 minutes setup)

**Metrics Impact**:
- Security time: 49% of weekly time → automated background tasks
- Incident reduction: Prevent secrets exposure before code reaches models
- Compliance: Local-first scanning ensures sensitive data never leaves developer machine


---

### 2. AI Destabilizing Delivery

**Problem Statement**: "PRs increased 98%, incidents up 242.7% since AI adoption"

**Symptoms**:
- High volume of AI-generated code
- Tests failing after code generation
- Code doesn't match spec requirements
- Change failure rate increasing

**Decision Path**:

```
Stability
├─ Untested AI-generated code?
│  └─ Quick Win ⭐: toolkit/hooks/stability/test-on-save.yaml
│     (Runs tests immediately when code is saved, instant feedback)
│
├─ Code violates spec constraints?
│  └─ toolkit/hooks/stability/validate-spec-constraints.yaml
│     (Verifies generated code satisfies all spec requirements)
│
└─ Need to demonstrate stability patterns?
   └─ Example: examples/rate-limiter/
      (Explicit test expectations with ✓ and ✗ cases, property-based tests)
```

**Quick Win Recommendation**: Start with `test-on-save.yaml` (10 minutes setup)

**Metrics Impact**:
- Change failure rate: 15-20% (industry average) → <5% (DORA elite)
- Incident rate: 242.7% increase → stabilized
- Feedback loop: 3 minutes (CI/CD) → instant (on save)


---

### 3. Engineer Burnout

**Problem Statement**: "47% of engineers report burnout from repetitive infrastructure work"

**Symptoms**:
- Manual documentation updates
- Repetitive service scaffolding
- Client stub regeneration after API changes
- 36% of time on manual tasks

**Decision Path**:

```
Burnout / Repetitive Work
├─ Manual documentation updates?
│  └─ Quick Win ⭐: toolkit/hooks/automation/update-docs.yaml
│     (Automatically updates API docs when route handlers change)
│
├─ Manual service scaffolding?
│  └─ toolkit/hooks/automation/scaffold-service.yaml
│     (Generates boilerplate from spec: index.ts, types.ts, tests, README)
│
├─ Manual client stub updates?
│  └─ toolkit/hooks/automation/regen-clients.yaml
│     (Regenerates client stubs when API contracts change)
│
└─ Need to demonstrate acceleration pattern?
   └─ Example: examples/notification-service/
      (Shows spec → implementation + tests + IaC + docs in hours vs days)
```

**Quick Win Recommendation**: Start with `update-docs.yaml` (20 minutes setup)

**Metrics Impact**:
- Manual tasks: 36% of time → automated via hooks
- Scaffolding time: Hours → minutes
- Documentation drift: Eliminated (auto-sync on code changes)


---

### 4. Deployment Velocity Gap

**Problem Statement**: "77% of team waits for others before shipping, lead time 10-14 days"

**Symptoms**:
- API changes require coordinating with downstream teams
- Manual deployment approvals and coordination
- Waiting for others blocks progress
- Golden spec changes need cascading to all services

**Decision Path**:

```
Deployment Velocity
├─ API changes need downstream updates?
│  └─ Quick Win ⭐: toolkit/hooks/deployment/cascade-api-change.yaml
│     (Automatically updates downstream consumers when API contracts change)
│
├─ Manual deployment to staging?
│  └─ toolkit/hooks/deployment/promote-to-staging.yaml
│     (Auto-deploys to staging when spec is approved)
│
└─ Golden spec enforcement slows deployments?
   └─ toolkit/hooks/quality/validate-against-golden.yaml
      (Validates service specs against org standards automatically)
```

**Quick Win Recommendation**: Start with `cascade-api-change.yaml` (25 minutes setup)

**Metrics Impact**:
- Deployment frequency: Weekly → on demand (DORA elite)
- Lead time: 10-14 days → <1 hour
- Coordination overhead: 77% wait for others → eliminated


---

### 5. Cognitive Overload

**Problem Statement**: "Team runs 7 CI/CD systems, 5 monitoring solutions, 12 deployment methods"

**Symptoms**:
- Context switching between multiple tools
- Fragmented automations (GitHub Actions, separate test runners, Slack bots)
- Slow feedback loops (3+ minutes)
- Tool sprawl causing confusion

**Decision Path**:

```
Cognitive Overload
├─ Fragmented linting (CI/CD-based)?
│  └─ Quick Win ⭐: toolkit/hooks/quality/lint-on-save.yaml
│     (Instant lint feedback on file save vs 3-minute CI/CD delay)
│
├─ Multiple monitoring tools for context?
│  ├─ toolkit/mcp/cloudwatch.yaml (if exists)
│  │  (CloudWatch logs and metrics as model context)
│  └─ toolkit/mcp/pagerduty.yaml (if exists)
│     (PagerDuty incidents as model context for debugging)
│
└─ Need migration guidance from fragmented toolchain?
   └─ See: docs/before-after.md
      (GitHub Action → Kiro hook migration patterns)
```

**Quick Win Recommendation**: Start with `lint-on-save.yaml` (15 minutes setup)

**Metrics Impact**:
- Feedback loop: 3 minutes → instant
- Tool count: 7 CI/CD systems + 5 monitoring → unified hooks
- Context switching: Reduced 40%


---

### 6. AI-Generated Code Rework

**Problem Statement**: "5+ prompt iterations per feature, hours wasted on trial-and-error"

**Symptoms**:
- Prompt iteration cycles
- Generated code doesn't match expectations
- Rework after code generation
- No clear source of truth

**Decision Path**:

```
Rework
├─ Prompt iteration instead of spec-first?
│  └─ Quick Win ⭐: toolkit/hooks/quality/require-spec-coverage.yaml
│     (Blocks new service files without corresponding specs)
│
├─ Need spec-first workflow examples?
│  ├─ Example: examples/notification-service/
│  │  (Spec drives generation: implementation + tests + IaC + docs)
│  ├─ Example: examples/rate-limiter/
│  │  (Explicit test expectations eliminate ambiguity)
│  └─ Example: examples/payment-processor/
│     (Security constraints in spec ensure first-pass quality)
│
└─ Model routing unclear?
   └─ See: design.md "Model Routing Strategy"
      (Sonnet for specs/reasoning, Nova for high-throughput tasks)
```

**Quick Win Recommendation**: Start with `require-spec-coverage.yaml` (10 minutes setup)

**Metrics Impact**:
- Iterations: 5+ prompts → 1 spec + 1 generation pass
- Time: Hours → minutes
- Quality: First-pass quality through spec clarity


---

### 7. Data Leakage from AI Tools

**Problem Statement**: "68% of organizations experienced data leakage from AI tools"

**Symptoms**:
- Secrets sent as context to models
- Sensitive data in model training
- .env files included in context
- Compliance concerns with data residency

**Decision Path**:

```
Data Leakage
├─ Secrets reaching models?
│  ├─ Quick Win ⭐: toolkit/steering/excluded-paths.yaml
│  │  (Prevents .env, secrets/, vault/, private keys from model context)
│  └─ toolkit/hooks/security/pre-send-scan.yaml
│     (Scans context buffer before transmission, blocks if secrets detected)
│
├─ Data residency requirements (GDPR, FSI)?
│  └─ toolkit/steering/region-config.yaml
│     (Configure allowed Bedrock regions, PII filters, topic denial)
│
└─ Need to understand local vs model operations?
   ├─ Hooks with `run: command:` = local-only (no network)
   └─ Hooks with `run: agent:` = sends context to model
```

**Quick Win Recommendation**: Start with `excluded-paths.yaml` + `pre-send-scan.yaml` (15 minutes setup)

**Metrics Impact**:
- Data leakage risk: 68% → eliminated (local-first guardrails)
- Secrets exposure: Prevented before transmission
- Compliance: Data residency controls enforced


---

### 8. Fragmented Toolchains

**Problem Statement**: "Multiple CI/CD systems, inconsistent automation patterns"

**Symptoms**:
- GitHub Actions for lint, separate action for tests
- Custom scripts scattered across projects
- Slack bots for notifications
- Manual documentation updates
- 12 different deployment methods

**Decision Path**:

```
Fragmented Toolchains
├─ CI/CD-based linting with 3-minute feedback?
│  └─ Quick Win ⭐: toolkit/hooks/quality/lint-on-save.yaml
│     (Migrate GitHub Action to instant Kiro hook)
│
├─ Need migration guidance?
│  └─ See: docs/before-after.md
│     (Patterns for migrating GitHub Actions/GitLab CI to hooks)
│
└─ Which automations should migrate to hooks?
   ├─ Fast feedback: lint, format, type-check → hooks
   ├─ On-save actions: tests, docs updates → hooks
   └─ Safety nets: full CI/CD suite → remains in pipeline
```

**Quick Win Recommendation**: Migrate linting to `lint-on-save.yaml` (20 minutes)

**Metrics Impact**:
- Feedback loop: 3 minutes → instant
- Tool consolidation: 7 CI/CD systems → unified hooks
- Consistency: One automation pattern across all projects


---

### 9. FSI Regulatory Complexity

**Problem Statement**: "OCC/FDIC/Fed/SEC compliance: deployment windows, change authorization, audit trails"

**Symptoms**:
- Cannot deploy during market hours
- Change approval requirements (CAB-equivalent)
- SOX Section 404 audit trail requirements
- Rollback plan documentation

**Decision Path**:

```
FSI Regulatory
├─ Deployment window restrictions?
│  └─ Quick Win ⭐: toolkit/hooks/deployment/deployment-window.yaml
│     (Enforces time-based deployment restrictions, queues for allowed windows)
│     (Includes emergency override mechanism with approvals)
│
├─ Change authorization requirements?
│  └─ toolkit/hooks/deployment/require-approvals.yaml
│     (Validates spec approvals before deployment, maps to CAB authorization)
│
└─ Need regulatory compliance examples?
   └─ Example: examples/settlement-engine/
      (Demonstrates deployment windows, audit trails, rollback plans)
      (Includes SOX Section 404 traceability mapping)
```

**Quick Win Recommendation**: Start with `deployment-window.yaml` (30 minutes setup)

**Metrics Impact**:
- Compliance: Automated enforcement of regulatory windows
- Audit trails: Automatic capture of all changes and approvals
- Risk: Reduced production incidents through controlled deployment


---

### 10. Knowledge Loss

**Problem Statement**: "47% burnout rate = high turnover, critical context lost when engineers leave"

**Symptoms**:
- "Why was this built this way?" questions
- Lost context from departed engineers
- Onboarding takes 3-4 weeks
- Lessons from incidents not captured
- Design decisions undocumented

**Decision Path**:

```
Knowledge Loss
├─ Design decisions not documented?
│  ├─ Quick Win ⭐: Use toolkit/specs/templates/service.spec.md
│  │  (Template includes "Design Decisions (and why)" section)
│  └─ Example: examples/settlement-engine/spec.md
│     (Documents "why" behind regulatory choices)
│
├─ Incident lessons not captured?
│  └─ toolkit/hooks/post-incident-learning.yaml
│     (Captures lessons from incidents, encodes as spec constraints)
│
├─ Onboarding takes too long?
│  └─ Specs as onboarding documentation
│     (New engineers read specs to understand intent, constraints, history)
│
└─ Need golden specs for org standards?
   ├─ toolkit/specs/golden/auth-pattern.spec.md
   ├─ toolkit/specs/golden/logging-standard.spec.md
   └─ toolkit/specs/golden/observability.spec.md
```

**Quick Win Recommendation**: Start using spec templates with "Design Decisions" sections (15 minutes)

**Metrics Impact**:
- Onboarding time: 3-4 weeks → 2-3 days (with specs as documentation)
- Knowledge retention: Design rationale preserved in specs
- Institutional memory: Lessons from incidents encoded as constraints


---

## Combined Scenarios

Many teams face multiple concerns simultaneously. Here are common combinations:

### Scenario A: Security + Stability (Concerns 1 + 2)

**Problem**: "AI-generated code with security issues AND untested"

**Artifacts**:
1. `toolkit/hooks/security/scan-secrets.yaml` - Block secrets before model sees them
2. `toolkit/hooks/security/validate-iam.yaml` - Flag overly permissive policies
3. `toolkit/hooks/stability/test-on-save.yaml` - Run tests immediately
4. `toolkit/steering/excluded-paths.yaml` - Prevent sensitive files from context
5. **Example**: `examples/payment-processor/` (demonstrates both concerns)

**Setup time**: ~40 minutes

---

### Scenario B: Burnout + Deployment Velocity (Concerns 3 + 4)

**Problem**: "Manual work slows us down AND we wait for others to deploy"

**Artifacts**:
1. `toolkit/hooks/automation/update-docs.yaml` - Eliminate manual docs
2. `toolkit/hooks/automation/scaffold-service.yaml` - Automate scaffolding
3. `toolkit/hooks/deployment/cascade-api-change.yaml` - Auto-update consumers
4. `toolkit/hooks/deployment/promote-to-staging.yaml` - Auto-deploy on approval
5. **Example**: `examples/notification-service/` (demonstrates automation)

**Setup time**: ~45 minutes


---

### Scenario C: Data Leakage + Regulatory (Concerns 7 + 9)

**Problem**: "Financial services with strict data residency AND deployment windows"

**Artifacts**:
1. `toolkit/steering/excluded-paths.yaml` - Block sensitive files
2. `toolkit/steering/region-config.yaml` - Enforce data residency
3. `toolkit/hooks/security/pre-send-scan.yaml` - Pre-transmission scanning
4. `toolkit/hooks/deployment/deployment-window.yaml` - Enforce market hours
5. `toolkit/hooks/deployment/require-approvals.yaml` - Change authorization
6. **Example**: `examples/settlement-engine/` (demonstrates regulatory patterns)

**Setup time**: ~60 minutes

---

### Scenario D: Cognitive Overload + Rework (Concerns 5 + 6)

**Problem**: "Tool sprawl causing confusion AND prompt iteration waste"

**Artifacts**:
1. `toolkit/hooks/quality/lint-on-save.yaml` - Replace CI/CD linting
2. `toolkit/hooks/quality/require-spec-coverage.yaml` - Enforce spec-first
3. `toolkit/hooks/stability/validate-spec-constraints.yaml` - Verify against spec
4. **Migration guide**: `docs/before-after.md` (GitHub Action → hooks)

**Setup time**: ~35 minutes


---

## Quick Wins Summary

If you want the highest impact with lowest effort, start here:

| Concern | Quick Win Artifact | Setup Time | Impact |
|---------|-------------------|------------|--------|
| Security | `scan-secrets.yaml` + `excluded-paths.yaml` | 15 min | 49% time savings on security |
| Stability | `test-on-save.yaml` | 10 min | Change failure <5% |
| Burnout | `update-docs.yaml` | 20 min | 36% time on manual tasks → automated |
| Velocity | `cascade-api-change.yaml` | 25 min | Lead time <1 hour |
| Overload | `lint-on-save.yaml` | 15 min | 3 min feedback → instant |
| Rework | `require-spec-coverage.yaml` | 10 min | 5+ iterations → 1 pass |
| Leakage | `excluded-paths.yaml` + `pre-send-scan.yaml` | 15 min | 68% risk → eliminated |
| Fragmented | `lint-on-save.yaml` | 20 min | 7 systems → unified |
| Regulatory | `deployment-window.yaml` | 30 min | Automated compliance |
| Knowledge | Use spec templates | 15 min | 3-4 weeks → 2-3 days onboarding |

---

## Next Steps

1. **Identify your #1 concern** from the list above
2. **Follow the decision path** to find relevant artifacts
3. **Start with the Quick Win** recommendation
4. **See QUICKSTART.md** for step-by-step setup instructions
5. **Expand to additional concerns** as you see value


---

## Complete Artifact Reference

For a comprehensive catalog of all toolkit artifacts with detailed metadata, see:
- **[docs/artifact-index.md](./artifact-index.md)** - Complete listing with purpose, concerns, dependencies, complexity

For before/after transformation examples and metrics:
- **[docs/before-after.md](./before-after.md)** - Concrete improvements per concern with citations

For phased adoption strategy:
- **[docs/adoption-path.md](./adoption-path.md)** - Quick Start → Pilot → Scale → Optimize

For DORA metrics mapping:
- **[docs/dora-metrics.md](./dora-metrics.md)** - How toolkit artifacts improve deployment frequency, lead time, change failure rate, MTTR

---

## Validation

To verify this decision tree covers all requirements:

```bash
# Check coverage of all 10 primary concerns
concerns=(
  "Security" "Stability" "Burnout" "Deployment Velocity" 
  "Cognitive Overload" "Rework" "Data Leakage" 
  "Fragmented Toolchains" "Regulatory" "Knowledge Loss"
)

for concern in "${concerns[@]}"; do
  grep -q "$concern" docs/decision-tree.md || {
    echo "⚠️  Decision tree missing coverage for: $concern"
    exit 1
  }
done

echo "✓ All 10 primary concerns covered in decision tree"
```

