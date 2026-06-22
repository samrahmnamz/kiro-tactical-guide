# Deployment Controls

## Overview

This document describes change management and deployment window enforcement controls that satisfy SOX Section 404 and Federal Reserve payment system risk management requirements.

**Key Controls**:
1. Market hours deployment restrictions (9:30 AM - 4:00 PM ET)
2. Change Advisory Board (CAB) approval requirements
3. Emergency override procedures (MFA + VP approval)
4. Deployment audit trail

---

## Deployment Window Enforcement

### Allowed Deployment Windows

**Weekdays** (Monday-Friday):
- ✓ 6:00 PM ET - 8:00 AM ET (next day)
- ✗ 8:00 AM ET - 6:00 PM ET (market hours + buffer)

**Weekends**:
- ✓ All day Saturday and Sunday

**Blackout Periods**:
- ✗ Last business day of month (month-end close)
- ✗ 24 hours before Federal Reserve settlement deadlines

### Rationale

**Market Hours Restriction**:
- Prevents deployments from disrupting live settlement processing
- Reduces operational risk during peak transaction volume
- Satisfies Federal Reserve payment system availability requirements

**Month-End Blackout**:
- Protects financial reporting close process
- Prevents SOX Section 404 control failures during critical period

---

## Automated Enforcement

### Hook: `deployment-window.yaml`

**Location**: `examples/settlement-engine/toolkit/hooks/deployment-window.yaml`

```yaml
name: deployment-window
description: Enforce deployment window restrictions for financial settlement system
event: preToolUse
toolTypes:
  - ".*deploy.*"
  - ".*cdk.*"
  - ".*terraform.*"
condition: |
  const now = new Date();
  const etHour = now.getUTCHours() - 5; // Convert UTC to ET
  const day = now.getUTCDay(); // 0=Sunday, 6=Saturday
  
  // Check if weekend
  const isWeekend = day === 0 || day === 6;
  
  // Check if allowed hour (before 8 AM or after 6 PM ET)
  const isAllowedHour = etHour < 8 || etHour >= 18;
  
  // Check if month-end (last business day)
  const isMonthEnd = isLastBusinessDayOfMonth(now);
  
  // Month-end blackout period
  if (isMonthEnd) {
    return {
      approved: false,
      severity: 'high',
      message: 'Deployments blocked during month-end financial close. Next window: First business day of next month at 6:00 PM ET.',
      documentation: 'https://wiki.company.com/deployment-windows'
    };
  }
  
  // Weekend deployments always allowed
  if (isWeekend) {
    return {
      approved: true,
      message: 'Weekend deployment window - proceeding'
    };
  }
  
  // Weekday deployment window check
  if (!isAllowedHour) {
    const nextWindow = calculateNextDeploymentWindow(now);
    return {
      approved: false,
      severity: 'high',
      message: `Deployment blocked during market hours (8:00 AM - 6:00 PM ET). Next window: ${nextWindow.toISOString()} (${formatET(nextWindow)})`,
      queuedUntil: nextWindow.toISOString(),
      documentation: 'https://wiki.company.com/deployment-windows'
    };
  }
  
  return {
    approved: true,
    message: `Deployment window valid (${formatET(now)})`
  };

function isLastBusinessDayOfMonth(date) {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return date.getMonth() !== tomorrow.getMonth();
}

function calculateNextDeploymentWindow(now) {
  const next = new Date(now);
  const etHour = now.getUTCHours() - 5;
  
  // If before 6 PM today, next window is 6 PM today
  if (etHour < 18) {
    next.setUTCHours(18 + 5, 0, 0, 0); // 6 PM ET
    return next;
  }
  
  // Otherwise, next window is 6 PM tomorrow
  next.setDate(next.getDate() + 1);
  next.setUTCHours(18 + 5, 0, 0, 0);
  return next;
}

function formatET(date) {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}
```

### Validation Examples

**Example 1: Market Hours Deployment (Blocked)**

```bash
# Attempt deployment at 2:00 PM ET on Wednesday
cdk deploy

# Hook output:
# ❌ Hook validation failed: deployment-window
# Deployment blocked during market hours (8:00 AM - 6:00 PM ET).
# Next window: 2024-01-17T23:00:00.000Z (Wed, Jan 17, 2024, 06:00 PM EST)
# Documentation: https://wiki.company.com/deployment-windows
```

**Example 2: Weekend Deployment (Allowed)**

```bash
# Attempt deployment at 2:00 PM ET on Saturday
cdk deploy

# Hook output:
# ✓ Hook validation passed: deployment-window
# Weekend deployment window - proceeding
```

**Example 3: Month-End Deployment (Blocked)**

```bash
# Attempt deployment on January 31 (last business day)
cdk deploy

# Hook output:
# ❌ Hook validation failed: deployment-window
# Deployments blocked during month-end financial close.
# Next window: First business day of next month at 6:00 PM ET.
```

---

## Change Advisory Board (CAB) Approval

### CAB Process

**Change Request Submission** (48 hours before deployment):
1. Developer creates change request in ServiceNow
2. Change request includes:
   - Business justification
   - Impact assessment (high/medium/low)
   - Rollback plan
   - Test results (unit tests + integration tests)
   - Deployment window preference

**CAB Review**:
- Scheduled meetings: Tuesday/Thursday 2:00 PM ET
- Emergency CAB: On-demand for critical fixes (4-hour turnaround)
- Approval requires: 2 CAB members (VP+ level)
- CAB composition: VP Engineering, VP Finance, CISO, Compliance Director

**Approval Ticket Issuance**:
- Format: `CHG` + 7 digits (e.g., `CHG0001234`)
- Ticket valid for 7 days
- Ticket includes: Approved deployment window, rollback authorization

### Hook: `require-approvals.yaml`

**Location**: `examples/settlement-engine/toolkit/hooks/require-approvals.yaml`

```yaml
name: require-approvals
description: Validate CAB approval ticket before production deployment
event: preToolUse
toolTypes:
  - ".*deploy.*"
condition: |
  const commitMessage = context.git.lastCommitMessage;
  const prDescription = context.git.prDescription;
  const cabTicketRegex = /\[CHG\d{7}\]/;
  
  // Check commit message for CAB ticket
  const commitMatch = commitMessage.match(cabTicketRegex);
  const prMatch = prDescription?.match(cabTicketRegex);
  
  if (!commitMatch && !prMatch) {
    return {
      approved: false,
      severity: 'high',
      message: 'CAB approval ticket required for production deployment. Format: [CHG1234567]',
      documentation: 'https://wiki.company.com/cab-process'
    };
  }
  
  const cabTicket = commitMatch ? commitMatch[0] : prMatch[0];
  const ticketNumber = cabTicket.replace(/[\[\]]/g, '');
  
  // Validate ticket in ServiceNow
  const ticketValid = await validateCABTicket(ticketNumber);
  
  if (!ticketValid.approved) {
    return {
      approved: false,
      severity: 'high',
      message: `CAB ticket ${ticketNumber} is invalid: ${ticketValid.reason}`,
      documentation: 'https://wiki.company.com/cab-process'
    };
  }
  
  // Verify ticket hasn't expired (7-day validity)
  const approvalDate = new Date(ticketValid.approvedAt);
  const now = new Date();
  const daysSinceApproval = (now - approvalDate) / (1000 * 60 * 60 * 24);
  
  if (daysSinceApproval > 7) {
    return {
      approved: false,
      severity: 'high',
      message: `CAB ticket ${ticketNumber} expired (approved ${Math.floor(daysSinceApproval)} days ago). Valid for 7 days.`,
      documentation: 'https://wiki.company.com/cab-process'
    };
  }
  
  return {
    approved: true,
    message: `CAB ticket ${ticketNumber} validated (approved by ${ticketValid.approvers.join(', ')})`
  };

async function validateCABTicket(ticketNumber) {
  // Call ServiceNow API to validate ticket
  const response = await fetch(`https://servicenow.company.com/api/change/${ticketNumber}`, {
    headers: { 'Authorization': `Bearer ${process.env.SERVICENOW_TOKEN}` }
  });
  
  if (!response.ok) {
    return { approved: false, reason: 'Ticket not found in ServiceNow' };
  }
  
  const ticket = await response.json();
  
  if (ticket.state !== 'approved') {
    return { approved: false, reason: `Ticket state is ${ticket.state}, expected approved` };
  }
  
  return {
    approved: true,
    approvedAt: ticket.approved_date,
    approvers: ticket.approved_by.split(',')
  };
}
```

### Validation Examples

**Example 1: Missing CAB Ticket (Blocked)**

```bash
# Commit message: "feat: Add rollback API"
git commit -m "feat: Add rollback API"

# Attempt deployment
cdk deploy

# Hook output:
# ❌ Hook validation failed: require-approvals
# CAB approval ticket required for production deployment.
# Format: [CHG1234567]
# Documentation: https://wiki.company.com/cab-process
```

**Example 2: Valid CAB Ticket (Allowed)**

```bash
# Commit message: "feat: Add rollback API [CHG0001234]"
git commit -m "feat: Add rollback API [CHG0001234]"

# Attempt deployment
cdk deploy

# Hook output:
# ✓ Hook validation passed: require-approvals
# CAB ticket CHG0001234 validated (approved by vp-eng@company.com, vp-finance@company.com)
```

**Example 3: Expired CAB Ticket (Blocked)**

```bash
# CAB ticket approved 8 days ago
cdk deploy

# Hook output:
# ❌ Hook validation failed: require-approvals
# CAB ticket CHG0001234 expired (approved 8 days ago). Valid for 7 days.
# Documentation: https://wiki.company.com/cab-process
```

---

## Emergency Override Procedures

### When Emergency Override Is Justified

**Critical Production Issues**:
- Severity 1 incident (complete service outage)
- Data integrity issue affecting settlements
- Security vulnerability requiring immediate patching

**NOT Justified**:
- Feature releases
- Performance optimizations
- Non-critical bug fixes

### Emergency Override Requirements

1. **VP+ Approval**: VP Engineering or higher
2. **MFA Authentication**: Multi-factor authentication required
3. **Emergency Ticket**: Format `EMRG-XXXXXXX`
4. **Post-Mortem**: Required within 24 hours
5. **CAB Notification**: Retroactive CAB review within 48 hours

### Emergency Override Workflow

```bash
# Step 1: Request emergency override role
aws sts assume-role \
  --role-arn arn:aws:iam::123456789012:role/EmergencyOverrideRole \
  --role-session-name emergency-deployment-$(date +%s) \
  --serial-number arn:aws:iam::123456789012:mfa/vp-engineering \
  --token-code 123456

# Step 2: Set emergency override environment variable
export EMERGENCY_OVERRIDE=true
export EMERGENCY_TICKET=EMRG-001234

# Step 3: Deploy with override
cdk deploy --require-approval never

# Hook will detect emergency override and log for post-mortem
```

### Emergency Override Audit Trail

```json
{
  "eventType": "emergency_override_deployment",
  "timestamp": "2024-01-16T14:30:00.000Z",
  "actor": {
    "userId": "vp-engineering@company.com",
    "iamRole": "EmergencyOverrideRole",
    "mfaAuthenticated": true
  },
  "authorization": {
    "emergencyTicket": "EMRG-001234",
    "justification": "Severity 1 incident - settlement execution failing",
    "incidentTicket": "INC-567890"
  },
  "deployment": {
    "deploymentTime": "2024-01-16T14:30:00.000Z",
    "marketHours": true,
    "deploymentWindow": "violated",
    "cabApprovalStatus": "pending_retroactive_review"
  },
  "postMortemRequired": true,
  "postMortemDueDate": "2024-01-17T14:30:00.000Z"
}
```

---

## Deployment Metrics

### Compliance Metrics (Q4 2023)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Deployment window compliance | 100% | 100% | ✓ Pass |
| CAB approval compliance | 100% | 100% | ✓ Pass |
| Emergency overrides | < 2 per quarter | 1 | ✓ Pass |
| Unauthorized deployment attempts | 0 | 0 | ✓ Pass |
| Month-end deployment attempts | 0 | 0 | ✓ Pass |
| Post-mortem completion (emergency) | 100% within 24h | 100% | ✓ Pass |

### Deployment Frequency

- **Average deployments per week**: 3.2
- **Average deployment duration**: 12 minutes
- **Deployment success rate**: 98.5%
- **Rollback rate**: 1.5% (2 rollbacks in Q4 2023)

---

## Related Documentation

- [SOX 404 Compliance Mapping](./sox-404-compliance.md)
- [Rollback Procedures](./rollback-procedures.md)
- [Audit Log Examples](./audit-log-examples.md)
- [Service Specification](../spec.md)

---

*This document demonstrates deployment control implementation for financial services regulatory compliance.*
