# Deployment Hooks

This directory contains production-ready hooks that automate deployment coordination and enforce deployment policies.

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

## Available Hooks

### cascade-api-change.yaml
Automatically updates downstream consumers when an API contract changes.

**Use when:**
- You have multiple services consuming your API
- API contract changes require coordinated updates
- Manual consumer updates cause deployment delays

**Key features:**
- Detects API contract changes in specs
- Identifies downstream consumers
- Generates updated client code
- Creates PR with changes for review
- Handles partial success (reports which consumers succeeded/failed)

**Customization:** 5-10 minutes (consumer discovery patterns, client generation commands)

### promote-to-staging.yaml
Auto-deploys to staging environment when spec is approved.

**Use when:**
- You want fast feedback on infrastructure changes
- Manual staging deployments cause delays
- Spec approval should trigger immediate validation

**Key features:**
- Triggers on spec file approval
- Validates deployment safety (diff review, destructive change detection)
- Executes staging deployment
- Runs post-deployment validation
- Requires human approval (PR review) as final gate

**Customization:** 5-10 minutes (deployment command, staging environment identifier, diff command)

## Quick Start

1. **Copy hook to your project:**
   ```bash
   cp toolkit/hooks/deployment/promote-to-staging.yaml .kiro/hooks/
   ```

2. **Customize deployment settings:**
   Edit the hook file and update:
   - `DEPLOYMENT_COMMAND` - Your deployment tool command
   - `STAGING_ENVIRONMENT` - Your staging identifier
   - `DIFF_COMMAND` - Command to show deployment diff

3. **Test the hook:**
   - Approve a spec file
   - Verify deployment triggers and creates PR
   - Review deployment plan in PR
   - Approve PR to execute deployment

4. **Validate deployment:**
   - Check staging environment health
   - Run smoke tests
   - Verify deployment matches spec

## Usage Patterns

### AWS CDK
```yaml
DEPLOYMENT_COMMAND: "cd infra && cdk deploy --require-approval never --context env=staging"
STAGING_ENVIRONMENT: "123456789012"  # AWS Account ID
DIFF_COMMAND: "cd infra && cdk diff --context env=staging"
```

### Serverless Framework
```yaml
DEPLOYMENT_COMMAND: "serverless deploy --stage staging --region us-west-2"
STAGING_ENVIRONMENT: "staging"
DIFF_COMMAND: "serverless package --stage staging"
```

### Kubernetes
```yaml
DEPLOYMENT_COMMAND: "kubectl apply -f k8s/staging/ --namespace=staging"
STAGING_ENVIRONMENT: "staging"
DIFF_COMMAND: "kubectl diff -f k8s/staging/ --namespace=staging"
```

### Terraform
```yaml
DEPLOYMENT_COMMAND: "cd terraform && terraform workspace select staging && terraform apply -auto-approve"
STAGING_ENVIRONMENT: "staging"
DIFF_COMMAND: "cd terraform && terraform workspace select staging && terraform plan"
```

## Integration with CI/CD

Deployment hooks complement existing CI/CD pipelines:

**Kiro Hooks (This):**
- Spec approval → Staging deployment
- Fast feedback on infrastructure changes
- Human approval gate (PR review)
- Triggered from IDE

**CI/CD Pipeline:**
- Code merge → Staging deployment
- Full test suite execution
- Security scans and compliance checks
- Triggered from version control

**Best Practice:** Use both
- Hooks: Fast iteration for spec-driven infrastructure changes
- Pipeline: Comprehensive validation for code changes
- Both deploy to staging before production

## Safety Features

### Diff Validation
- Shows infrastructure changes before deployment
- Highlights resources to create, update, delete
- Catches unintended deletions and security regressions
- Estimates deployment time and potential downtime

### Destructive Change Detection
- Scans for potentially destructive operations:
  - Database schema changes (DROP TABLE, DROP COLUMN)
  - Data deletion operations (TRUNCATE, DELETE FROM)
  - Resource deletions (DynamoDB, S3, RDS)
  - Service interruptions (instance replacements)
- Warns with: "⚠️ DESTRUCTIVE CHANGE DETECTED"
- Provides specific details and impact assessment

### Approval Gates
- Human review required before deployment (pr_review)
- Deployment plan shown in PR description
- Reviewer can approve or reject
- No silent deployments

### Error Handling
- Full error output and logs captured
- Root cause identification
- Actionable remediation steps
- Rollback instructions for partial deployments
- No automatic retries (surface to human operator)

## DORA Metrics Impact

### Deployment Frequency
- Enable on-demand staging deployments
- Reduce manual deployment overhead
- **Target:** Multiple deployments per day

### Lead Time for Changes
- Reduce time from spec approval to staging validation
- Automated promotion eliminates wait time
- **Target:** <1 hour from spec approval to staging

### Change Failure Rate
- Diff validation catches issues before production
- Destructive change detection prevents data loss
- **Target:** <5% failure rate

### Time to Restore
- Automated rollback reduces restore time
- Clear rollback instructions in deployment report
- **Target:** <1 hour

## Troubleshooting

### "Deployment command not found"
- Verify deployment tool installed (cdk, terraform, kubectl, etc.)
- Check PATH includes deployment tool binaries
- Test command manually before enabling hook

### "Permission denied" errors
- Check AWS credentials configured (aws configure)
- Verify IAM policies allow deployment actions
- Check Kubernetes context and permissions

### "Diff validation fails"
- Verify DIFF_COMMAND is correct for your tool
- Check command exits with 0 on success
- Test diff command manually first

### "Destructive change not detected"
- Add custom patterns to DESTRUCTIVE_PATTERNS
- Check pattern matching is case-sensitive
- Review diff output format for your tool

### "Deployment succeeds but service unhealthy"
- Enable post-deployment validation (health checks)
- Add smoke tests for critical functionality
- Check CloudWatch logs for errors
- Verify service discovery registration

## Related Documentation

- [Decision Tree](../../../docs/decision-tree.md) - Map your problem to the right hooks
- [DORA Metrics](../../../docs/dora-metrics.md) - Track deployment performance
- [Before/After](../../../docs/before-after.md) - See transformation examples
- [Examples](../../../examples/) - Complete working examples

## Related Hooks

- `toolkit/hooks/stability/validate-spec-constraints.yaml` - Ensures code matches spec
- `toolkit/hooks/stability/test-on-save.yaml` - Validates tests pass before deployment
- `toolkit/hooks/deployment/cascade-api-change.yaml` - Updates downstream consumers
- `toolkit/hooks/deployment/deployment-window.yaml` - Enforces regulatory windows (prod)
- `toolkit/hooks/deployment/require-approvals.yaml` - Validates approval gates

## Support

For questions or issues:
1. Check inline customization guides in each hook
2. Review troubleshooting section above
3. See examples in `examples/` directory
4. Consult decision tree in `docs/decision-tree.md`
