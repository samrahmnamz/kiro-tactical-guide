# Stability Hooks

This directory contains hooks that ensure stability despite high AI-generated code volume.

## Purpose

Stability hooks prevent AI from destabilizing delivery by:
- Running tests immediately when code is saved
- Validating generated code against spec constraints
- Enforcing explicit test expectations (✓ must pass, ✗ must fail)
- Catching issues before they reach version control

## Primary Concern Addressed

**Primary Concern #2: AI Destabilizing Delivery**
- 25% increase in AI adoption correlates with 7.2% reduction in delivery stability
- PRs up 98%, incidents up 242.7%
- Solution: Instant validation with immediate feedback loops

## Hooks

Stability hooks will include:
- `test-on-save.yaml` - Execute tests immediately when agent-generated code is saved
- `validate-spec-constraints.yaml` - Verify generated code satisfies all spec constraints

## Usage

Copy hooks to your project's `.kiro/hooks/` directory and customize file paths and test commands according to the inline guides in each hook.
