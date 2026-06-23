# Artifact Index Validation Checklist

**Task:** 20.2 Validate artifact index completeness  
**Date:** 2025-06-17

---

## Security Hooks

- [x] scan-secrets.yaml - root ✅ | toolkit ✅
- [x] scan-secrets-regex.yaml - root ✅ | toolkit ❌ MISSING
- [x] validate-iam.yaml - root ✅ | toolkit ✅
- [x] pre-send-scan.yaml - root ✅ | toolkit ✅

**Status:** 4/4 exist, 3/4 in toolkit

---

## Stability Hooks

- [x] test-on-save.yaml - root ✅ | toolkit N/A
- [x] validate-spec-constraints.yaml - root ✅ | toolkit N/A

**Status:** 2/2 exist (root only)

---

## Automation Hooks

- [x] update-docs.yaml - root ✅ | toolkit ✅
- [x] scaffold-service.yaml - root ✅ | toolkit ✅
- [x] regen-clients.yaml - root ✅ | toolkit ❌ MISSING

**Status:** 3/3 exist, 2/3 in toolkit

---

## Deployment Hooks

- [x] cascade-api-change.yaml - root ✅ | toolkit ✅
- [x] promote-to-staging.yaml - root ✅ | toolkit ✅

**Status:** 2/2 exist

---

## Regulatory Hooks

- [x] deployment-window.yaml - documented as regulatory, actually in toolkit/hooks/deployment/ ⚠️
- [x] require-approvals.yaml - documented as regulatory, actually in hooks/deployment/ ⚠️

**Status:** 2/2 exist (location mismatch)

---

## Quality Hooks

- [x] lint-on-save.yaml - toolkit ✅
- [x] require-spec-coverage.yaml - toolkit ✅
- [x] validate-against-golden.yaml - toolkit ✅

**Status:** 3/3 exist (toolkit only)

---

## Post-Incident Learning

- [x] post-incident-learning.yaml - toolkit ✅

**Status:** 1/1 exists

---

## Golden Specs

- [x] auth-pattern.spec.md ✅
- [x] logging-standard.spec.md ✅
- [x] observability.spec.md ✅
- [ ] tracing-standard.spec.md ❌ MISSING

**Status:** 3/4 exist

---

## Spec Templates

- [x] service.spec.md ✅
- [x] feature.spec.md ✅
- [x] infrastructure.spec.md ✅

**Status:** 3/3 exist

---

## Steering Rules

- [x] excluded-paths.yaml ✅
- [x] region-config.yaml ✅

**Status:** 2/2 exist

---

## MCP Integrations

- [x] cloudwatch.yaml ✅
- [x] pagerduty.yaml ✅

**Status:** 2/2 exist

---

## Working Examples

- [x] payment-processor/ ✅
- [x] rate-limiter/ ✅
- [x] notification-service/ ✅
- [x] settlement-engine/ ✅

**Status:** 4/4 exist

---

## Summary

**Total Documented:** 32 artifacts  
**Total Found:** 31 artifacts  
**Fully Present:** 28 artifacts  
**Location Issues:** 3 artifacts  
**Missing:** 1 artifact  

---

## Critical Issues

1. ❌ **MISSING:** tracing-standard.spec.md
2. ⚠️ **LOCATION:** scan-secrets-regex.yaml (missing from toolkit)
3. ⚠️ **LOCATION:** regen-clients.yaml (missing from toolkit)
4. ⚠️ **CATEGORIZATION:** regulatory hooks in deployment/ directories

---

## Action Items

- [ ] Create toolkit/specs/golden/tracing-standard.spec.md
- [ ] Copy hooks/security/scan-secrets-regex.yaml → toolkit/hooks/security/
- [ ] Copy hooks/automation/regen-clients.yaml → toolkit/hooks/automation/
- [ ] Resolve regulatory hooks location/categorization
- [ ] Update artifact index with accurate paths

---

## Validation Status

✅ **COMPLETE** - Issues documented and actionable

**Detailed Report:** `tests/artifact-index-validation-report.md`  
**Summary:** `tests/artifact-index-validation-summary.md`
