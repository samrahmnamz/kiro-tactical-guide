# Repository Alignment with Kiro Tactical Guide

## Executive Summary

**Overall Alignment: 40-50%**

The repository has good foundational content but **significant gaps** between what's documented in specs and what's actually implemented in the toolkit. The tactical guide shows modern v2 JSON hook format, but the toolkit exclusively uses legacy YAML format.

---

## Major Gaps

### 1. Hook Format Mismatch ⚠️ CRITICAL

**Tactical Guide Shows**: v2 JSON format (`.json` files)
```json
{
  "version": "v1",
  "hooks": [{
    "name": "scan-secrets",
    "trigger": "PostFileSave",
    "matcher": "pattern",
    "action": { "type": "command", "command": "..." }
  }]
}
```

**Toolkit Actually Has**: Legacy YAML format (`.yaml` files)
```yaml
name: scan-secrets-gitleaks
on:
  file_save:
    paths: [...]
run:
  command: |
    ...
```

**Impact**: 
- All 12+ toolkit hooks are in wrong format
- Examples in specs now reference `.json` hooks that don't exist
- Users following tactical guide will find mismatched implementations
- No actual `.json` hook files in toolkit

**Files Affected**:
- `toolkit/hooks/security/scan-secrets.yaml` ❌
- `toolkit/hooks/security/validate-iam.yaml` ❌
- `toolkit/hooks/deployment/deployment-window.yaml` ❌
- `toolkit/hooks/deployment/promote-to-staging.yaml` ❌
- `toolkit/hooks/automation/update-docs.yaml` ❌
- `toolkit/hooks/automation/scaffold-service.yaml` ❌
- All others in toolkit/hooks/* ❌

---

### 2. Missing Steering Files ⚠️ HIGH PRIORITY

**Tactical Guide Shows**: Comprehensive steering files for AI behavior enforcement
- `toolkit/steering/code-standards.md` ❌ **MISSING**
- `toolkit/steering/security-rules.md` ❌ **MISSING**
- `toolkit/steering/test-requirements.md` ❌ **MISSING**
- `toolkit/steering/aws-patterns.md` ❌ **MISSING**
- `toolkit/steering/api-standards.md` ❌ **MISSING**

**Toolkit Actually Has**: Only config files (not steering content)
- `toolkit/steering/excluded-paths.yaml` ✅ (config, not content)
- `toolkit/steering/region-config.yaml` ✅ (config, not content)
- `toolkit/steering/README.md` ✅ (documentation only)

**Impact**:
- No persistent AI behavior guidance
- Specs reference steering files that don't exist
- Missing the "prevention" layer of defense-in-depth
- 80% reduction in hook failures (claimed in tactical guide) cannot be achieved

**Example Gap**: Tactical guide shows:
```markdown
# .kiro/steering/code-standards.md

## Coding Standards for All AI-Generated Code

### Rate Limiting
- ALWAYS use sliding window algorithm, never fixed window
- Reason: Fixed window allows burst traffic at window boundaries
```

This file does not exist in the repository.

---

### 3. Trigger Naming Inconsistency ⚠️ MEDIUM

**Tactical Guide Uses**: PascalCase triggers
- `PostFileSave`
- `PreToolUse`
- `SessionStart`

**Toolkit Uses**: snake_case and different names
- `file_save`
- `fileEdited`
- `context_send`

**Files with Inconsistent Triggers**:
- All YAML hooks use old format ❌

---

### 4. Incomplete Tactical Guide Patterns

**Missing from Tactical Guide**:
- Section 3+ appears truncated (deployment velocity, other concerns)
- No coverage of concerns #4, #5, #8, #10 (mentioned in examples but not in guide sections loaded)
- Mutation testing section (2.2) is present ✅
- Coverage enforcement section (2.2) is present ✅
- Steering files section (2.5) is present ✅

---

## What's Working Well ✅

### 1. Example Specs (Now Updated)
- ✅ `examples/notification-service/spec.md` - Uses v2 JSON format
- ✅ `examples/payment-processor/spec.md` - Uses v2 JSON format
- ✅ `examples/rate-limiter/spec.md` - Uses v2 JSON format + steering integration
- ✅ `examples/settlement-engine/spec.md` - Uses v2 JSON format + compliance patterns

All example specs NOW match tactical guide patterns after recent updates.

### 2. Documentation Quality
- ✅ Hooks have extensive inline customization guidance
- ✅ Clear examples by industry (FSI, healthcare, retail)
- ✅ Troubleshooting sections
- ✅ Security notes and compliance references

### 3. Comprehensive Coverage
- ✅ Security hooks (scan-secrets, validate-iam, pre-send-scan)
- ✅ Deployment hooks (deployment-window, require-approvals, cascade-api-change)
- ✅ Automation hooks (update-docs, scaffold-service)
- ✅ Quality hooks (lint-on-save, validate-against-golden)

### 4. Real-World Patterns
- ✅ FSI deployment windows (market hours)
- ✅ SOX 404 compliance (segregation of duties)
- ✅ Secret scanning (gitleaks integration)
- ✅ Emergency override mechanisms

---

## Detailed Analysis by Component

### Hooks: 40% Alignment

| Aspect | Status | Notes |
|--------|--------|-------|
| **Content Quality** | ✅ Excellent | Comprehensive customization guides, industry examples |
| **Format** | ❌ Wrong | YAML instead of JSON v2 |
| **Trigger Names** | ❌ Inconsistent | snake_case instead of PascalCase |
| **Coverage** | ✅ Good | Security, deployment, automation, quality |
| **Documentation** | ✅ Excellent | Inline guides, troubleshooting, examples |

**Recommendation**: Convert all YAML hooks to JSON v2 format while preserving excellent documentation.

---

### Steering Files: 10% Alignment

| Aspect | Status | Notes |
|--------|--------|-------|
| **Content Files** | ❌ Missing | No .md steering files with AI guidance |
| **Config Files** | ✅ Present | excluded-paths.yaml, region-config.yaml |
| **Documentation** | ✅ Good | README explains purpose |
| **Tactical Guide Refs** | ❌ Broken | Specs reference files that don't exist |

**Recommendation**: Create the 5 core steering files shown in tactical guide.

---

### Specs: 90% Alignment (After Updates)

| Aspect | Status | Notes |
|--------|--------|-------|
| **Hook Format** | ✅ Correct | Now use v2 JSON in examples |
| **Steering Refs** | ✅ Present | Reference steering files appropriately |
| **Trigger Names** | ✅ Correct | PascalCase (PostFileSave, PreToolUse) |
| **Patterns** | ✅ Complete | Defense-in-depth, metrics, impact |
| **Industry Examples** | ✅ Excellent | FSI, security, automation, stability |

**Recommendation**: Specs are now aligned. Toolkit needs to catch up.

---

### Tactical Guide: 70% Complete

| Section | Status | Notes |
|---------|--------|-------|
| **Concern #1 (Security)** | ✅ Complete | Secret scanning, IAM validation, encryption |
| **Concern #2 (AI Stability)** | ✅ Complete | Specs, test-on-save, mutation testing, coverage |
| **Concern #2.5 (Steering)** | ✅ Complete | Comprehensive steering file patterns |
| **Concern #3 (Deployment)** | ⚠️ Partial | Starts but appears truncated |
| **Other Concerns** | ❌ Missing | #4-#10 not fully documented |

**Recommendation**: Complete the tactical guide with all 10 concerns.

---

## Priority Recommendations

### P0: Critical (Blocks Users)

1. **Convert Toolkit Hooks to JSON v2 Format**
   - Action: Rewrite all `.yaml` hooks as `.json` with v2 schema
   - Files: 12+ hook files in toolkit/hooks/
   - Effort: 2-3 days (preserve documentation, convert format)
   - Impact: Removes major confusion for users following tactical guide

2. **Create Missing Steering Files**
   - Action: Create the 5 core .md steering files referenced in specs
   - Files: code-standards.md, security-rules.md, test-requirements.md, aws-patterns.md, api-standards.md
   - Effort: 1-2 days (content exists in tactical guide, needs extraction)
   - Impact: Enables the "prevention" layer of defense-in-depth

### P1: High Priority (Improves Experience)

3. **Standardize Trigger Naming**
   - Action: Update all triggers to PascalCase
   - Files: All hooks (after JSON conversion)
   - Effort: Part of P0 work
   - Impact: Consistency with Kiro platform standards

4. **Complete Tactical Guide**
   - Action: Add missing concern sections (#3-#10)
   - Files: Kiro Tactical Guide.md
   - Effort: 3-5 days (research + writing)
   - Impact: Comprehensive guidance for all DevOps concerns

### P2: Nice to Have (Polish)

5. **Add Hook Examples to Toolkit**
   - Action: Create example hooks in both formats (migration guide)
   - Files: New toolkit/examples/ directory
   - Effort: 1 day
   - Impact: Helps users understand conversion

6. **Create Validation Script**
   - Action: Script to check repo alignment with tactical guide
   - Files: New scripts/validate-alignment.sh
   - Effort: 1 day
   - Impact: Prevents future drift

---

## Specific File Changes Needed

### Files to Convert (YAML → JSON)

```
toolkit/hooks/
├── automation/
│   ├── scaffold-service.yaml → scaffold-service.json ❌
│   └── update-docs.yaml → update-docs.json ❌
├── deployment/
│   ├── cascade-api-change.yaml → cascade-api-change.json ❌
│   ├── deployment-window.yaml → deployment-window.json ❌
│   └── promote-to-staging.yaml → promote-to-staging.json ❌
├── quality/
│   ├── lint-on-save.yaml → lint-on-save.json ❌
│   ├── require-spec-coverage.yaml → require-spec-coverage.json ❌
│   └── validate-against-golden.yaml → validate-against-golden.json ❌
├── security/
│   ├── pre-send-scan.yaml → pre-send-scan.json ❌
│   ├── scan-secrets.yaml → scan-secrets.json ❌
│   └── validate-iam.yaml → validate-iam.json ❌
└── post-incident-learning.yaml → post-incident-learning.json ❌
```

### Files to Create (Steering)

```
toolkit/steering/
├── code-standards.md ❌ CREATE
├── security-rules.md ❌ CREATE
├── test-requirements.md ❌ CREATE
├── aws-patterns.md ❌ CREATE
└── api-standards.md ❌ CREATE
```

### Files Already Aligned ✅

```
examples/
├── notification-service/spec.md ✅
├── payment-processor/spec.md ✅
├── rate-limiter/spec.md ✅
└── settlement-engine/spec.md ✅

toolkit/steering/
├── excluded-paths.yaml ✅
├── region-config.yaml ✅
└── README.md ✅
```

---

## Impact of Current Gaps

### User Experience Impact

**New User Journey** (Current State):
1. Read tactical guide → See JSON v2 format
2. Read example specs → See JSON v2 format references
3. Look at toolkit → Find YAML files only ❌ **CONFUSION**
4. Try to use steering files → File not found ❌ **BROKEN**
5. Copy hook examples → Wrong trigger names ❌ **DOESN'T WORK**

**Expected User Journey** (Desired State):
1. Read tactical guide → See JSON v2 format
2. Read example specs → See JSON v2 format references
3. Look at toolkit → Find matching JSON v2 files ✅
4. Try to use steering files → Files exist and work ✅
5. Copy hook examples → Works immediately ✅

### Learning Curve Impact

- **Current**: High confusion due to format mismatch
- **Desired**: Smooth onboarding with consistent patterns
- **Blocker**: First-time users cannot successfully implement patterns

### Adoption Impact

- **Current**: Users must figure out conversion themselves
- **Desired**: Copy-paste ready examples
- **Risk**: Users give up or implement incorrectly

---

## Conclusion

The repository has **strong foundational content** but suffers from:
1. **Format inconsistency** (YAML vs JSON v2)
2. **Missing steering files** (referenced but not present)
3. **Incomplete tactical guide** (concerns #3-#10)

**Recommended Action Plan**:
1. **Week 1**: Convert all hooks to JSON v2 format (P0)
2. **Week 2**: Create 5 core steering files (P0)
3. **Week 3**: Complete tactical guide sections (P1)
4. **Week 4**: Add validation + examples (P2)

After these changes, alignment would improve from **40-50%** to **90-95%**.

---

## Quick Wins (1-2 hours each)

1. Create `code-standards.md` from tactical guide section 2.5
2. Create `security-rules.md` from tactical guide section 2.5
3. Create `test-requirements.md` from tactical guide section 2.5
4. Convert one hook (e.g., scan-secrets.yaml) to JSON as a template
5. Add alignment validation script to CI/CD

These quick wins would immediately improve user experience and provide templates for the remaining work.
