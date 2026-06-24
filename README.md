# Kiro Cloud Engineering/DevOps Reference Implementation

**A customer-facing toolkit demonstrating spec-driven development patterns, hooks, and golden specs for Cloud Engineering and DevOps teams.**

This repository maps directly to the **[Kiro Tactical Guide](./Kiro%20Tactical%20Guide.md)** and provides production-ready artifacts you can copy, customize, and deploy immediately. Each artifact addresses specific concerns identified in the tactical guide with concrete, working examples.

---

## What Problem Does This Solve?

Cloud Engineering and DevOps teams face 6 primary systematic challenges (plus additional concerns during scaling) that compound in the AI era. This repository provides concrete solutions including the new **Powers** capability that extends Kiro into production intelligence:

| Problem | Impact | What You'll Find Here |
|---------|--------|----------------------|
| **1. Security & compliance eating engineering time** | 62% rank as #1 challenge; 49% of weekly time on security (DuploCloud 2026) | Local secret scanning, IAM validation, pre-send filtering |
| **2. AI destabilizing delivery** | 25% ↑ in AI adoption = 7.2% ↓ in delivery stability (DORA 2025) | Test-on-save hooks, spec constraint validation |
| **3. Deployment velocity gap** | 77% wait for others; only 29% can deploy on demand (Harness 2024) | API change cascading, auto-promotion, golden spec enforcement |
| **4. AI tools leaking sensitive data** | 68% experienced data leakage (Cyberhaven 2024) | Pre-send scanning, excluded-paths steering, region controls |
| **5. FSI regulatory complexity** | OCC/FDIC/Fed/SEC simultaneous compliance requirements | Deployment windows, approval workflows, audit trails |
| **6. Knowledge loss when engineers leave** | 47% burnout → experienced engineers leaving (DuploCloud 2026) | Specs capture "why", post-incident learning hooks |

**Secondary concerns** (emerge during scaling): Resiliency and cascading failures (70% of outages from single dependency failure), engineer burnout from repetitive work (47% report burnout; 36% of time on manual tasks), cognitive overload (teams run 7 CI/CD systems, 5 monitoring solutions), fragmented toolchains (IaC "part of the problem" not solution), cost visibility (Bedrock spend tracking).

**Powers** (NEW): Production intelligence capabilities that extend Kiro beyond build-time into runtime operations - see section below.

**This repository provides the artifacts** to solve these problems—not as theory, but as copy-paste ready hooks, specs, Powers, and working examples that map directly to the **[Kiro Tactical Guide](./Kiro%20Tactical%20Guide.md)**.

---

## Repository Structure at a Glance

```
kiro-cloudeng-devops/
├── hooks/               # Ready-to-use automation
│   ├── security/       # Secret scanning, IAM validation (Concerns 1, 4)
│   ├── stability/      # Test-on-save, spec validation (Concern 2)
│   ├── resiliency/     # Circuit breakers, retry patterns, timeouts
│   ├── automation/     # Doc updates, scaffolding (burnout reduction)
│   └── regulatory/     # Deployment windows, approvals (Concern 5)
│
├── examples/           # Complete working projects
│   ├── payment-processor/    # Security: PCI DSS, secret scanning
│   ├── rate-limiter/         # Stability: test-on-save patterns
│   ├── resilient-service/    # Resiliency: circuit breakers, graceful degradation
│   ├── notification-service/ # Automation: spec → impl + tests + IaC
│   └── settlement-engine/    # Regulatory: FSI compliance
│
├── specs/              # Spec templates and golden standards
│   ├── golden/        # Org-wide standards (Concern 3, 6)
│   └── templates/     # Service, feature, infrastructure templates
│
├── toolkit/           # Steering rules, MCP integrations, and Powers
│   ├── steering/     # Data residency, excluded paths (Concern 4)
│   ├── mcp/          # CloudWatch, PagerDuty (cognitive overload)
│   ├── hooks/        # JSON hooks (production format)
│   └── powers/       # Curated capability packages (production intelligence)
│       └── spec-test-quality/  # Test quality enforcement power
│
├── docs/              # Comprehensive guides
│   ├── guides/       # How-to guides for specific scenarios
│   ├── patterns/     # Migration patterns, customization
│   └── reference/    # Detailed configuration reference
│
├── Kiro Tactical Guide.md  # Maps 6 primary concerns to solutions + Powers
├── QUICKSTART.md           # 30-minute path to value
└── CONTRIBUTING.md         # Guidelines for contributing
```

---

## Problem-to-Artifact Quick Reference

### If your #1 problem is...

**🔐 Security/Secrets in code (Concern 1)** → Copy `hooks/security/scan-secrets.yaml` or `scan-secrets-regex.yaml`  
**✅ AI-generated code stability (Concern 2)** → Copy `hooks/stability/test-on-save.yaml`  
**🚀 Waiting for others to deploy (Concern 3)** → Copy `hooks/deployment/cascade-api-change.yaml`  
**🔒 Data leakage from AI tools (Concern 4)** → Copy `toolkit/steering/excluded-paths.yaml`  
**📋 FSI regulatory compliance (Concern 5)** → Copy `hooks/regulatory/deployment-window.yaml`  
**📖 Knowledge loss (Concern 6)** → Copy `specs/templates/service.spec.md` and start documenting "why"  
**🛡️ Cascading failures / Resiliency** → Copy `hooks/resiliency/validate-circuit-breaker.yaml` + `validate-retry-patterns.yaml` + `validate-timeouts.yaml`  
**🤖 Repetitive documentation work** → Copy `hooks/automation/update-docs.yaml`  
**🧪 Test quality for AI code** → Install `toolkit/powers/spec-test-quality/` Power

**Detailed setup:** See [QUICKSTART.md](./QUICKSTART.md) for step-by-step instructions.

---

## How to Use This Repository

### For Individual Engineers

1. **Browse hooks** by concern in the [hooks/](./hooks/) directory
2. **Copy the hook** that solves your problem to `.kiro/hooks/` in your project
3. **Customize** following inline comments (5-10 minutes)
4. **Validate** with test files to ensure it works
5. **Iterate** — add more hooks as you identify more problems

### For Platform/DevOps Teams

1. **Define golden specs** in `specs/golden/` for org-wide standards (auth, logging, observability)
2. **Deploy validation hooks** to automatically enforce golden specs across all services
3. **Provide spec templates** to teams via `specs/templates/`
4. **Measure adoption** using DORA metrics (deployment frequency, lead time, change failure rate, MTTR)
5. **Scale gradually** — start with one team/service, expand after proving value

### For Decision-Makers Evaluating Kiro

1. **Read the [Kiro Tactical Guide](./Kiro%20Tactical%20Guide.md)** — Understand the 6 primary concerns, Powers capability, and how Kiro addresses them
2. **Review working examples** — See complete implementations in [examples/](./examples/)
3. **Try the Quick Start** — Solve one problem in 30 minutes using [QUICKSTART.md](./QUICKSTART.md)
4. **Assess impact** — Review metrics showing time savings, stability improvements, velocity gains
5. **Plan rollout** — See [docs/adoption-path.md](./docs/adoption-path.md) for phased deployment strategy

---

## Kiro Powers: Production Intelligence (Solution Layer)

**Powers extend Kiro beyond build-time into production operations** - they are not a concern, but a solution layer that addresses runtime challenges. Kiro Powers are curated packages (MCP servers + steering files + hooks) that give Kiro specialized capabilities for production operations.

### What Are Powers?

Powers extend Kiro beyond build-time development into production operations and runtime intelligence. Each Power packages:
- **MCP Server**: Connects to external tools/data (CloudWatch, X-Ray, Security Agent)
- **Steering Files**: Domain-specific instructions for AI routing
- **Hooks**: Automated actions triggered by events

### Available in This Repository

#### Spec-Driven Test Quality Power
**Location**: `toolkit/powers/spec-test-quality/`

Enforces comprehensive test quality for AI-generated code through:
- **Coverage enforcement**: Automatic line/branch coverage checks on file save
- **Mutation testing**: Validates tests catch code mutations (prevents "tests pass but code is wrong")
- **Traceability**: Maps spec requirements → implementation → tests → coverage
- **Spec-driven validation**: Test expectations defined in specs, AI implements, Power validates

**Use for**: Any TypeScript/Jest service (API services, data processing, integration services)

**Quick install**:
```bash
# Copy hooks
cp -r toolkit/powers/spec-test-quality/hooks/* .kiro/hooks/quality/

# Copy steering file  
cp toolkit/powers/spec-test-quality/steering/test-quality.md .kiro/steering/

# Copy Stryker config
cp toolkit/powers/spec-test-quality/config/stryker.conf.json ./

# Install dependencies
npm install --save-dev @stryker-mutator/core @stryker-mutator/jest-runner
```

**See**: [toolkit/powers/spec-test-quality/POWER.md](./toolkit/powers/spec-test-quality/POWER.md) for complete documentation

### AWS Powers (Available via Powers Panel)

These Powers are available for install via the Kiro Powers Panel:

- **AWS DevOps Agent**: Incident investigation, cost optimization, release readiness, remediation code generation
- **AWS Security Agent**: Threat modeling, continuous security scanning, penetration testing, compliance packs
- **AWS Observability**: Alarm response, gap analysis, distributed tracing, SLO monitoring

**Learn more**: See [Kiro Tactical Guide - Section 7](./Kiro%20Tactical%20Guide.md#7-kiro-powers--mcp--production-intelligence-in-the-ide) for complete Powers documentation.

---

## What's Inside: Artifact Catalog

### 🔐 Security Hooks (Concern 1, 7)

| Artifact | Purpose | Time to Deploy | Complexity |
|----------|---------|----------------|------------|
| [scan-secrets.yaml](./hooks/security/scan-secrets.yaml) | Local gitleaks integration for secret detection | 5 min | Easy |
| [scan-secrets-regex.yaml](./hooks/security/scan-secrets-regex.yaml) | Zero-dependency regex-based scanning | 5 min | Easy |
| [validate-iam.yaml](./hooks/security/validate-iam.yaml) | Flag wildcard IAM actions and missing conditions | 10 min | Medium |
| [pre-send-scan.yaml](./hooks/security/pre-send-scan.yaml) | Pre-transmission context buffer scanning | 5 min | Easy |

### ✅ Stability Hooks (Concern 2)

| Artifact | Purpose | Time to Deploy | Complexity |
|----------|---------|----------------|------------|
| [test-on-save.yaml](./hooks/stability/test-on-save.yaml) | Instant test execution on file save | 5 min | Easy |
| [validate-spec-constraints.yaml](./hooks/stability/validate-spec-constraints.yaml) | Verify code satisfies spec requirements | 10 min | Medium |

### 🤖 Automation Hooks (Concern 3)

| Artifact | Purpose | Time to Deploy | Complexity |
|----------|---------|----------------|------------|
| [update-docs.yaml](./hooks/automation/update-docs.yaml) | Auto-sync API documentation | 10 min | Medium |
| [scaffold-service.yaml](./hooks/automation/scaffold-service.yaml) | Generate service boilerplate from specs | 15 min | Medium |
| [regen-clients.yaml](./hooks/automation/regen-clients.yaml) | Regenerate client stubs on contract changes | 15 min | Hard |

### 🚀 Deployment Hooks (Concern 4, 8)

| Artifact | Purpose | Time to Deploy | Complexity |
|----------|---------|----------------|------------|
| [cascade-api-change.yaml](./hooks/deployment/cascade-api-change.yaml) | Update downstream consumers automatically | 20 min | Hard |
| [promote-to-staging.yaml](./hooks/deployment/promote-to-staging.yaml) | Auto-deploy on spec approval | 15 min | Medium |

### 📋 Regulatory Hooks (Concern 9)

| Artifact | Purpose | Time to Deploy | Complexity |
|----------|---------|----------------|------------|
| [deployment-window.yaml](./hooks/regulatory/deployment-window.yaml) | Enforce time-based deployment restrictions | 15 min | Hard |
| [require-approvals.yaml](./hooks/regulatory/require-approvals.yaml) | Validate change authorization | 10 min | Medium |

### ⭐ Golden Specs (Concern 4, 10)

| Artifact | Purpose | Use Case |
|----------|---------|----------|
| [auth-pattern.spec.md](./specs/golden/auth-pattern.spec.md) | Organizational authentication standards | Platform teams defining org-wide auth |
| [logging-standard.spec.md](./specs/golden/logging-standard.spec.md) | Structured logging requirements | Consistent logging across all services |
| [observability.spec.md](./specs/golden/observability.spec.md) | Metrics, traces, and alarms standards | Platform team observability requirements |
| [tracing-standard.spec.md](./specs/golden/tracing-standard.spec.md) | X-Ray trace ID propagation patterns | Distributed tracing implementation |

### 💡 Working Examples (All Concerns)

| Example | Concerns Addressed | Stack | Demonstrates |
|---------|-------------------|-------|--------------|
| [payment-processor/](./examples/payment-processor/) | Security (1, 7) | TypeScript, Stripe, DynamoDB, CDK | Secret scanning, IAM validation, PCI DSS |
| [rate-limiter/](./examples/rate-limiter/) | Stability (2) | TypeScript, Redis, Express | Test-on-save, explicit test expectations |
| [notification-service/](./examples/notification-service/) | Automation (3) | TypeScript, SQS, SNS, CDK | Spec → impl + tests + IaC + docs |
| [settlement-engine/](./examples/settlement-engine/) | Regulatory (9) | TypeScript, DynamoDB, Step Functions | Deployment windows, approvals, audit trails |

**Each example includes:**
- Complete, runnable code with tests
- Infrastructure as code (CDK)
- README explaining which concerns it addresses
- "How to run this example" section with prerequisites

### 🔋 Powers (Curated Capability Packages)

| Power | Purpose | Components | Use Case |
|-------|---------|------------|----------|
| [Spec-Driven Test Quality](./toolkit/powers/spec-test-quality/) | Enforce test quality for AI code | 4 hooks + steering + Stryker config | Prevent "tests pass but code is wrong" |

**Each Power includes:**
- Complete documentation (POWER.md)
- Installation guide (README.md)
- All required hooks, steering files, and configurations
- Spec templates and examples

---

## Key Concepts

### Hooks: Event-Driven Automation

Hooks are YAML files that trigger actions based on IDE events:

```yaml
name: scan-secrets
on: fileEdited
filePatterns: "**/*.{ts,js,py,yaml,env}"
run:
  command: gitleaks detect --source .
on_failure: block_context
```

**When to use hooks:**
- Automate repetitive tasks (secret scanning, doc updates)
- Enforce standards (IAM validation, spec compliance)
- Accelerate feedback loops (test-on-save, lint-on-save)

### Specs: Living Documentation

Specs are markdown files that capture intent, contracts, constraints, and test expectations:

```markdown
## Intent
Payment processor for Stripe transactions with PCI DSS compliance.

## Constraints
- ✓ AES-256 encryption for card data at rest
- ✗ No PII in CloudWatch logs
- ✓ IAM policies follow principle of least privilege
```

**Why specs matter:**
- Capture "why" decisions were made (prevent knowledge loss)
- Drive code generation (spec → impl + tests + IaC + docs)
- Enable validation (ensure code satisfies spec requirements)
- Provide runbooks (reduce MTTR during incidents)

### Golden Specs: Organizational Standards

Golden specs define org-wide patterns that all services must follow:

- **auth-pattern.spec.md** → OAuth2/OIDC standards
- **logging-standard.spec.md** → Structured logging requirements
- **observability.spec.md** → Metrics, traces, alarms standards
- **tracing-standard.spec.md** → X-Ray trace ID propagation

**Platform teams**: Define once, enforce everywhere with `validate-against-golden.yaml` hook.

### Steering Rules: AI Behavior Control

Steering rules are YAML files that configure AI model behavior:

```yaml
excluded_paths:
  - .env
  - secrets/
  - vault/
  - "**/*.pem"
```

**Use steering rules to:**
- Prevent data leakage (exclude sensitive files from context)
- Enforce compliance (restrict to specific AWS regions)
- Control costs (route to appropriate models by task complexity)

### Powers: Curated Capability Packages

Powers package MCP servers, steering files, and hooks into cohesive capabilities:

**Components of a Power:**
- **MCP Server**: Connects to external tools (CloudWatch, Security Agent)
- **Steering Files**: Domain-specific AI routing instructions
- **Hooks**: Event-driven automation
- **Documentation**: Complete setup and usage guides

**Example Power**: Spec-Driven Test Quality
- Enforces coverage thresholds automatically
- Runs mutation testing to validate test quality
- Generates traceability reports (spec → tests → coverage)
- Works for any TypeScript/Jest service

**See**: `toolkit/powers/spec-test-quality/` for a complete example

---

## Quick Start: Solve One Problem in 30 Minutes

Ready to get started? Choose your path:

**🔐 Path 1: Stop committing secrets** → [Secret Scanning Quick Start](./QUICKSTART.md#path-1-secret-scanning)

**✅ Path 2: Get instant test feedback** → [Test-on-Save Quick Start](./QUICKSTART.md#path-2-test-on-save)

**📋 Path 3: Enforce FSI deployment windows** → [Deployment Windows Quick Start](./QUICKSTART.md#path-3-deployment-windows)

Each path includes:
- Copy-paste ready files
- 5-10 minute customization guide
- Validation steps to verify it works
- Troubleshooting for common issues

See [QUICKSTART.md](./QUICKSTART.md) for step-by-step instructions.

---

## Learn More

- **[Kiro Tactical Guide](./Kiro%20Tactical%20Guide.md)** — Deep dive into the 10 concerns and how Kiro addresses them (now includes Powers section)
- **[Powers Documentation](./Kiro%20Tactical%20Guide.md#7-kiro-powers--mcp--production-intelligence-in-the-ide)** — Complete guide to Powers: what they are, how to use them, AWS Powers overview
- **[Spec-Driven Test Quality Power](./toolkit/powers/spec-test-quality/POWER.md)** — Complete documentation for the test quality enforcement power
- **[Decision Tree](./docs/decision-tree.md)** — Interactive flowchart to find the right artifacts for your situation
- **[Artifact Index](./docs/artifact-index.md)** — Complete catalog of all hooks, specs, examples, and Powers with metadata
- **[Before/After Transformations](./docs/before-after.md)** — Concrete metrics showing time saved and incidents reduced
- **[DORA Metrics Mapping](./docs/dora-metrics.md)** — How toolkit artifacts improve DORA metrics
- **[Adoption Path](./docs/adoption-path.md)** — Phased rollout strategy from Quick Start to org-wide
- **[Customization Patterns](./docs/customization-patterns.md)** — Adapt for monorepo, multi-cloud, enterprise scenarios
- **[AWS Integration](./docs/guides/aws-integration.md)** — Kiro + CodeCatalyst, Bedrock, CDK patterns

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- How to add new hooks, specs, or examples
- Code style and documentation standards
- Testing requirements
- Pull request process

---

## Support and Community

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/your-org/kiro-cloudeng-devops/issues)
- **Discussions**: Ask questions and share patterns in [GitHub Discussions](https://github.com/your-org/kiro-cloudeng-devops/discussions)
- **Enterprise Support**: Contact us for custom implementations, training, and dedicated support

---

## License

This repository is provided as a reference implementation for Kiro customers. See [LICENSE](./LICENSE) for details.

---

## What's Next?

1. **Read the [Kiro Tactical Guide](./Kiro%20Tactical%20Guide.md)** to understand the 10 concerns
2. **Try the [Quick Start](./QUICKSTART.md)** to solve one problem in 30 minutes
3. **Browse [examples/](./examples/)** to see complete working implementations
4. **Review [docs/adoption-path.md](./docs/adoption-path.md)** to plan org-wide rollout

**This is a living repository.** As new patterns emerge and the Kiro platform evolves, we'll continue adding artifacts, examples, and best practices. Watch this repo for updates.
