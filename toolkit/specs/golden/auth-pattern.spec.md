# Authentication Pattern - Golden Spec

> **Golden Spec**: Org-wide authentication standard
> 
> **Purpose**: Define authentication and authorization patterns that all services must follow
> 
> **Status**: Approved by Platform Engineering Team
> 
> **Last Updated**: 2024-01-15
>
> **Validation**: Services must reference this spec and implement all REQUIRED constraints

---

## Intent

Define organization-wide authentication and authorization standards to ensure consistent security posture across all services, prevent common authentication vulnerabilities, and enable centralized identity management while supporting multiple auth patterns (OAuth2/OIDC, API keys, service-to-service JWT).

**Why it exists**: Authentication is a cross-cutting concern where inconsistency leads to security vulnerabilities. This golden spec establishes mandatory patterns that prevent credential exposure, ensure proper session management, enforce token validation, and enable security team oversight without blocking service autonomy.

---

## Supported Authentication Patterns

Services MUST use one or more of these approved patterns based on their access requirements:

### 1. OAuth 2.0 / OpenID Connect (OIDC)
**Use for**: User-facing applications, web UIs, mobile apps

**Requirements**:
- Authorization Code Flow with PKCE (Proof Key for Code Exchange) for browser-based apps
- Client Credentials Flow for machine-to-machine communication
- Token endpoint: `https://auth.example.com/oauth2/token`
- Authorization endpoint: `https://auth.example.com/oauth2/authorize`
- UserInfo endpoint: `https://auth.example.com/oauth2/userinfo`

**Token Lifetime**:
- Access tokens: 1 hour maximum
- Refresh tokens: 30 days maximum
- ID tokens: 1 hour maximum

### 2. API Keys
**Use for**: External developer APIs, webhook endpoints, third-party integrations

**Requirements**:
- Format: `apikey_[environment]_[32-char-random]` (e.g., `apikey_prod_a8f3e9d2c1b4...`)
- Storage: AWS Secrets Manager or DynamoDB with encryption at rest
- Rotation: Mandatory every 90 days (automated via hook)
- Scopes: API keys MUST be scoped to specific resources/operations

### 3. Service-to-Service JWT
**Use for**: Internal microservice communication, Lambda-to-Lambda calls

**Requirements**:
- Algorithm: RS256 (RSA with SHA-256)
- Issuer: Service name (e.g., `payment-processor`)
- Audience: Target service name (e.g., `notification-service`)
- Token lifetime: 5 minutes maximum (short-lived for security)
- Claims MUST include: `sub` (service ID), `iat` (issued at), `exp` (expiration), `aud` (audience)

### 4. AWS IAM Roles (SigV4)
**Use for**: AWS service-to-service calls, Lambda functions accessing AWS APIs

**Requirements**:
- Use IAM roles, never IAM users
- Assume role with temporary credentials
- Credential rotation: Automatic via AWS STS
- Least privilege: Scope permissions to specific resources (no wildcard `*`)

---

## Mandatory Constraints

All services implementing authentication MUST satisfy these constraints:

### 1. No Credentials in Code or Configuration Files
**Requirement**: Credentials (passwords, API keys, private keys, tokens) MUST NEVER be hardcoded in source code, committed to version control, or stored in configuration files.

**Validation**: 
- ✓ Automated by `toolkit/hooks/security/scan-secrets.yaml` on file save
- ✓ Automated by `toolkit/hooks/security/scan-secrets-regex.yaml` as fallback
- ✓ Pre-commit hooks block commits containing credential patterns

**Implementation**:
```typescript
// ✓ CORRECT: Load from Secrets Manager
const apiKey = await getSecret('service-name/api-key');

// ✓ CORRECT: Load from environment variable (for local dev only)
const apiKey = process.env.API_KEY; // .env file excluded via excluded-paths.yaml

// ✗ WRONG: Hardcoded credential (blocked by scan-secrets.yaml)
// const apiKey = 'apikey_prod_a8f3e9d2c1b4...';
```

### 2. Token Validation Required
**Requirement**: All incoming requests with authentication tokens (JWT, OAuth2, API key) MUST be validated before processing.

**Validation Steps** (in order):
1. **Signature verification**: Verify token signature using public key or shared secret
2. **Expiration check**: Reject tokens where `exp` claim < current time
3. **Issuer validation**: Verify `iss` claim matches expected issuer
4. **Audience validation**: Verify `aud` claim includes this service
5. **Scope/permissions check**: Verify token has required scopes for the requested operation

**Implementation**:
```typescript
// ✓ CORRECT: Full token validation
async function validateToken(token: string): Promise<TokenClaims> {
  // 1. Verify signature
  const decoded = await jwt.verify(token, publicKey, { algorithms: ['RS256'] });
  
  // 2. Check expiration
  if (decoded.exp < Date.now() / 1000) {
    throw new Error('Token expired');
  }
  
  // 3. Validate issuer
  if (decoded.iss !== 'https://auth.example.com') {
    throw new Error('Invalid issuer');
  }
  
  // 4. Validate audience
  if (!decoded.aud.includes('payment-processor')) {
    throw new Error('Invalid audience');
  }
  
  return decoded;
}

// ✗ WRONG: No validation (security vulnerability)
// const claims = jwt.decode(token); // decode without verify
```

### 3. Session Management
**Requirement**: Services with user sessions MUST implement secure session handling.

**Requirements**:
- Session IDs: Cryptographically random, minimum 128 bits entropy
- Session storage: Server-side only (Redis, DynamoDB), never client-side
- Session timeout: 30 minutes of inactivity (configurable per service, max 2 hours)
- Absolute timeout: 8 hours (user must re-authenticate)
- Cookie flags: `HttpOnly`, `Secure`, `SameSite=Strict`

**Implementation**:
```typescript
// ✓ CORRECT: Secure session cookie
res.cookie('sessionId', sessionId, {
  httpOnly: true,      // Prevents JavaScript access
  secure: true,        // HTTPS only
  sameSite: 'strict',  // CSRF protection
  maxAge: 30 * 60 * 1000, // 30 minutes
});

// ✗ WRONG: Insecure session cookie
// res.cookie('sessionId', sessionId); // Missing security flags
```

### 4. Password Requirements (if applicable)
**Requirement**: Services that manage user passwords MUST enforce these minimum requirements.

**Password Policy**:
- Minimum length: 12 characters
- Must contain: uppercase, lowercase, number, special character
- Password hashing: bcrypt (cost factor 12) or Argon2id
- No password reuse: Block last 5 passwords
- Password rotation: Recommended every 90 days (not enforced)

**Implementation**:
```typescript
// ✓ CORRECT: bcrypt with salt rounds = 12
import bcrypt from 'bcrypt';
const hashedPassword = await bcrypt.hash(password, 12);

// ✗ WRONG: Weak hashing algorithm
// const hashedPassword = crypto.createHash('md5').update(password).digest('hex');
```

### 5. Multi-Factor Authentication (MFA)
**Requirement**: Services handling sensitive operations (financial transactions, PII access, admin actions) MUST support MFA.

**Approved MFA Methods**:
- TOTP (Time-based One-Time Password): Google Authenticator, Authy
- SMS (fallback only, discouraged for high-security operations)
- Hardware tokens: YubiKey, AWS IAM hardware MFA
- Push notifications: Duo, Okta Verify

**Implementation**:
- MFA MUST be enforced for admin roles
- MFA SHOULD be optional for end users (with strong encouragement)
- MFA bypass requires security team approval and audit logging

### 6. Rate Limiting and Brute Force Protection
**Requirement**: All authentication endpoints MUST implement rate limiting to prevent brute force attacks.

**Rate Limits**:
- Login attempts: 5 failures per user per 15 minutes → account temporarily locked
- Token refresh: 10 requests per user per minute
- API key validation: 1000 requests per API key per minute
- Lockout duration: 15 minutes (increases exponentially for repeated violations)

**Implementation**:
```typescript
// ✓ CORRECT: Rate limiting with Redis
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  store: new RedisStore({ client: redisClient }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again later',
});

app.post('/auth/login', loginLimiter, handleLogin);
```

### 7. Secure Token Storage
**Requirement**: Services MUST store tokens securely and never log them.

**Storage Requirements**:
- Refresh tokens: Encrypted at rest (AES-256), stored in DynamoDB or Redis
- Access tokens: In-memory only (stateless JWT), never persisted
- API keys: AWS Secrets Manager with automatic rotation
- Session IDs: Redis with TTL matching session timeout

**Logging Constraints**:
- Tokens MUST be redacted from all logs (CloudWatch, application logs)
- Use log scrubbing utility to mask tokens in error messages
- Only log token metadata (expiration time, issuer, user ID - never the token itself)

**Implementation**:
```typescript
// ✓ CORRECT: Log token metadata only
logger.info('Token validated', {
  userId: claims.sub,
  expiresAt: claims.exp,
  issuer: claims.iss,
});

// ✗ WRONG: Log full token (security vulnerability)
// logger.info('Token received', { token: authHeader });
```

### 8. Authorization (Beyond Authentication)
**Requirement**: Authentication alone is insufficient—services MUST implement authorization checks.

**Authorization Patterns**:
- **Role-Based Access Control (RBAC)**: Users have roles (admin, user, guest), roles have permissions
- **Attribute-Based Access Control (ABAC)**: Fine-grained permissions based on user attributes, resource attributes, context
- **Resource-Based Access Control**: Check ownership (e.g., "can user X access document Y they created?")

**Implementation**:
```typescript
// ✓ CORRECT: Check both authentication and authorization
async function handleDeletePayment(req: Request, res: Response) {
  // 1. Authentication: Validate token
  const claims = await validateToken(req.headers.authorization);
  
  // 2. Authorization: Check permissions
  if (!claims.roles.includes('admin') && claims.sub !== payment.userId) {
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
  }
  
  // 3. Process request
  await deletePayment(req.params.paymentId);
  res.status(204).send();
}

// ✗ WRONG: Authentication only, no authorization check
// async function handleDeletePayment(req: Request, res: Response) {
//   const claims = await validateToken(req.headers.authorization);
//   await deletePayment(req.params.paymentId); // Any authenticated user can delete any payment!
// }
```

### 9. Audit Logging for Authentication Events
**Requirement**: All authentication and authorization events MUST be logged to CloudWatch for security monitoring and compliance.

**Events to Log**:
- Successful login (user ID, timestamp, IP address, user agent)
- Failed login attempt (username, timestamp, IP address, failure reason)
- Account lockout (user ID, timestamp, reason)
- Token issued (user ID, token expiration, scopes granted)
- Token refresh (user ID, old token expiration, new token expiration)
- MFA enrollment (user ID, MFA method, timestamp)
- MFA challenge success/failure
- Authorization denied (user ID, resource, required permission, timestamp)

**Log Format** (structured JSON):
```json
{
  "timestamp": "2024-01-15T14:23:45.123Z",
  "event": "auth.login.success",
  "userId": "user-123",
  "ip": "203.0.113.42",
  "userAgent": "Mozilla/5.0...",
  "metadata": {
    "mfaUsed": true,
    "sessionDuration": 1800
  }
}
```

**Retention**:
- Authentication logs: 1 year minimum
- Authorization denied logs: 2 years minimum (compliance requirement)

### 10. TLS/HTTPS Enforcement
**Requirement**: All authentication and authorization endpoints MUST use TLS 1.2 or higher.

**Configuration**:
- API Gateway: Enforce HTTPS only, reject HTTP requests
- Load Balancer: TLS termination at ALB, redirect HTTP → HTTPS
- Inter-service communication: TLS for service-to-service calls (mTLS preferred)

**Certificate Management**:
- Use AWS Certificate Manager (ACM) for certificate issuance and renewal
- Rotate certificates annually (ACM handles automatically)
- Monitor certificate expiration via CloudWatch alarms (30-day warning)

---

## Integration Requirements

Services implementing this golden spec MUST integrate with these organization services:

### 1. Identity Provider Integration
**Requirement**: Services using OAuth2/OIDC MUST integrate with the organization's identity provider.

**Configuration**:
- **Production IdP**: `https://auth.example.com` (Okta, Auth0, AWS Cognito, or internal OIDC provider)
- **Staging IdP**: `https://auth-staging.example.com`
- **Development IdP**: `https://auth-dev.example.com` or local mock

**Discovery Endpoint**: Services SHOULD use OIDC Discovery (`/.well-known/openid-configuration`) to retrieve IdP endpoints dynamically.

### 2. Secret Management Service
**Requirement**: All credentials MUST be stored in AWS Secrets Manager.

**Naming Convention**:
- Format: `{service-name}/{environment}/{credential-type}`
- Examples: 
  - `payment-processor/prod/api-key`
  - `notification-service/staging/database-password`
  - `settlement-engine/prod/stripe-secret-key`

**Rotation**:
- API keys: 90 days
- Database passwords: 180 days
- Service JWTs: Private keys rotated annually

### 3. Audit Service
**Requirement**: All authentication/authorization logs MUST be sent to the central audit service.

**Destination**:
- CloudWatch Log Group: `/aws/audit/{service-name}`
- Kinesis Firehose: `audit-events-stream` (for long-term S3 archival)

**Alerting**:
- Failed login rate > 10/minute → Alert security team
- Authorization denied rate > 100/minute → Alert service owner
- MFA bypass attempts → Immediate security alert

---

## Design Decisions (and why)

### 1. OAuth2/OIDC as Primary Pattern
**Decision**: Standardize on OAuth2 with OIDC for user authentication instead of custom session-based auth.

**Rationale**:
- **Industry Standard**: Well-vetted protocol with extensive library support
- **SSO Support**: Single Sign-On across multiple services without re-authentication
- **Token-Based**: Stateless authentication scales horizontally without shared session state
- **Security**: Built-in protections (PKCE for SPAs, state parameter for CSRF, refresh token rotation)

**Trade-offs**:
- Complexity: OAuth2 has learning curve vs simple username/password
- IdP Dependency: Outage of identity provider blocks all authentication
- **Decision**: Benefits outweigh complexity, and IdP redundancy addresses availability concerns

### 2. Short-Lived Service JWTs (5 minutes)
**Decision**: Service-to-service JWTs expire after 5 minutes instead of traditional 1-hour tokens.

**Rationale**:
- **Reduced Blast Radius**: If a service JWT is compromised, attacker has narrow window for exploitation
- **Lateral Movement Prevention**: Stolen token can't be used for extended reconnaissance
- **Performance**: 5-minute lifetime keeps signature verification in hot cache, minimal overhead

**Trade-offs**:
- Higher token issuance rate (more CPU cycles for signing)
- Requires robust token refresh logic in service clients
- **Decision**: Security benefit justifies computational cost (measured: 0.2ms overhead per request)

### 3. API Key Rotation Every 90 Days
**Decision**: Enforce mandatory API key rotation every 90 days instead of "never expire" keys.

**Rationale**:
- **Compliance**: Aligns with SOC 2 Type II and ISO 27001 requirements for credential rotation
- **Leaked Key Mitigation**: Limits damage from undiscovered key leaks (e.g., accidentally committed to public GitHub)
- **Automation**: Tooling forces rotation via expiration, preventing "manual rotation someday" procrastination

**Trade-offs**:
- Operational overhead for external partners (must update keys quarterly)
- Risk of service disruption if key rotation fails or partner forgets to update
- **Decision**: Automated rotation hooks + 30-day warning notifications mitigate risk

### 4. bcrypt Cost Factor 12
**Decision**: Use bcrypt with cost factor 12 for password hashing instead of 10 (default) or 14 (maximum practical).

**Rationale**:
- **Security vs Performance**: Factor 12 takes ~250ms on modern hardware, balancing GPU attack resistance with user experience
- **Future-Proof**: As hardware improves, cost factor can be increased incrementally (rehash on login)
- **Comparison**: MD5/SHA1 are trivially crackable (billions of hashes/sec), bcrypt factor 12 limits to ~4 hashes/sec

**Trade-offs**:
- 250ms latency for login/registration (acceptable for occasional operation)
- Higher CPU cost for batch operations (e.g., bulk user imports)
- **Decision**: Security benefits far outweigh performance cost for authentication

### 5. Session Server-Side Storage
**Decision**: Store session state server-side (Redis/DynamoDB) instead of client-side (encrypted JWT cookies).

**Rationale**:
- **Revocation Support**: Server-side sessions can be invalidated immediately (e.g., logout, security incident)
- **Session Hijacking Defense**: Even if cookie stolen, session can be revoked when suspicious activity detected
- **Stateful Benefits**: Can track concurrent sessions, last activity time, IP address changes

**Trade-offs**:
- Requires session store infrastructure (Redis cluster, DynamoDB table)
- Higher latency (network call to fetch session data)
- Horizontal scaling complexity (shared session store across service instances)
- **Decision**: Security and auditability benefits justify infrastructure investment

---

## Test Expectations

### Positive Cases (✓ must pass)

1. **✓ Valid OAuth2 Token Authentication**
   - Given: Valid OAuth2 access token in Authorization header
   - When: Request to protected endpoint
   - Then: Token validated, user claims extracted, request processed

2. **✓ Valid API Key Authentication**
   - Given: Valid API key in `X-API-Key` header
   - When: Request to API endpoint
   - Then: API key validated against Secrets Manager, request processed

3. **✓ Valid Service-to-Service JWT**
   - Given: Valid service JWT with correct audience and issuer
   - When: Internal service call
   - Then: JWT signature verified, claims validated, request authorized

4. **✓ Token Refresh**
   - Given: Valid refresh token and expired access token
   - When: POST to `/auth/token` with refresh token
   - Then: New access token issued, refresh token optionally rotated

5. **✓ Session Creation and Validation**
   - Given: Successful login
   - When: Session cookie set with secure flags
   - Then: Subsequent requests with session cookie are authenticated

6. **✓ MFA Enrollment and Validation**
   - Given: User enrolls TOTP MFA
   - When: Login with username/password + TOTP code
   - Then: MFA validated, session created with MFA flag set

7. **✓ Authorization Check (RBAC)**
   - Given: User with "admin" role
   - When: Access admin-only endpoint
   - Then: Role verified, request authorized

8. **✓ Rate Limiting Allows Normal Traffic**
   - Given: 3 login attempts in 15 minutes
   - When: Fourth login attempt
   - Then: Request processed normally (under rate limit threshold)

### Negative Cases (✗ must be rejected)

1. **✗ Expired Access Token**
   - Given: OAuth2 token where `exp` < current time
   - When: Request to protected endpoint
   - Then: Returns 401 Unauthorized with error `{ "error": "token_expired" }`

2. **✗ Invalid Token Signature**
   - Given: JWT with tampered signature
   - When: Token validation
   - Then: Returns 401 Unauthorized with error `{ "error": "invalid_signature" }`

3. **✗ Wrong Audience**
   - Given: Service JWT with `aud: "notification-service"` sent to payment-processor
   - When: Token validation
   - Then: Returns 403 Forbidden with error `{ "error": "invalid_audience" }`

4. **✗ Revoked API Key**
   - Given: API key that was rotated/revoked
   - When: Request with revoked API key
   - Then: Returns 401 Unauthorized with error `{ "error": "api_key_revoked" }`

5. **✗ Weak Password**
   - Given: Password "password123" (no uppercase, no special char)
   - When: User registration
   - Then: Returns 400 Bad Request with error `{ "error": "password_policy_violation" }`

6. **✗ Brute Force Attack**
   - Given: 6 failed login attempts in 15 minutes
   - When: Seventh login attempt
   - Then: Returns 429 Too Many Requests, account temporarily locked

7. **✗ Missing Authorization Header**
   - Given: Request to protected endpoint without Authorization header
   - When: Authentication middleware
   - Then: Returns 401 Unauthorized with error `{ "error": "missing_auth_header" }`

8. **✗ Insufficient Permissions**
   - Given: User with "user" role attempts admin operation
   - When: Authorization check
   - Then: Returns 403 Forbidden with error `{ "error": "insufficient_permissions" }`

9. **✗ Session Timeout**
   - Given: Session idle for 31 minutes (timeout is 30 minutes)
   - When: Request with expired session cookie
   - Then: Returns 401 Unauthorized, user redirected to login

10. **✗ Token Logged in Application**
    - Given: Code contains `logger.info('Token:', token)`
    - When: Unit test suite runs
    - Then: Test fails with message "Token logging detected - security violation"

### Edge Cases (must be handled)

1. **⚠ IdP Outage**
   - Given: Identity provider returns 503 Service Unavailable
   - When: OAuth2 token validation
   - Then: Return 503 with `Retry-After` header, cache last-known-good public keys for 5 minutes

2. **⚠ Clock Skew**
   - Given: Server clock 3 minutes ahead of JWT `iat` claim
   - When: Token validation
   - Then: Allow 5-minute clock skew window before rejecting as "not yet valid"

3. **⚠ Concurrent Session Limit**
   - Given: User has 5 active sessions (limit is 5)
   - When: User logs in from 6th device
   - Then: Oldest session terminated, new session created

4. **⚠ API Key Rotation Overlap**
   - Given: API key rotation in progress (old key expires in 1 hour, new key active)
   - When: Request with old key
   - Then: Accept old key with warning, log recommendation to migrate to new key

5. **⚠ MFA Backup Codes**
   - Given: User lost MFA device but has backup codes
   - When: Login with username/password + backup code
   - Then: Backup code consumed (single-use), session created, user prompted to re-enroll MFA

---

## Service Spec Integration

Services referencing this golden spec MUST include the following in their spec:

### Required Spec Sections

1. **Authentication Pattern Declaration**:
   ```markdown
   ## Authentication
   
   This service follows `toolkit/specs/golden/auth-pattern.spec.md`.
   
   **Pattern Used**: OAuth2/OIDC (user authentication), Service-to-Service JWT (internal calls)
   
   **Deviations**: None (or document approved exceptions)
   ```

2. **Endpoint Security Matrix**:
   | Endpoint | Auth Required | Method | Roles/Scopes |
   |----------|---------------|--------|--------------|
   | `GET /api/payments` | Yes | OAuth2 | `read:payments` |
   | `POST /api/payments` | Yes | OAuth2 | `write:payments` |
   | `GET /health` | No | None | Public |
   | `POST /internal/process` | Yes | Service JWT | `service:payment-processor` |

3. **Credential Storage**:
   ```markdown
   ## Secrets
   
   The following secrets are stored in AWS Secrets Manager:
   - `payment-processor/prod/jwt-private-key` (RS256 private key for signing service JWTs)
   - `payment-processor/prod/jwt-public-key` (RS256 public key for verification)
   - `payment-processor/prod/oauth-client-secret` (OAuth2 client secret for token exchange)
   ```

4. **Audit Events**:
   ```markdown
   ## Audit Logging
   
   This service logs the following authentication/authorization events to CloudWatch Log Group `/aws/audit/payment-processor`:
   - `auth.token.validated` (every authenticated request)
   - `auth.token.expired` (rejected expired tokens)
   - `auth.authorization.denied` (insufficient permissions)
   ```

---

## Validation Hooks

Services implementing this golden spec SHOULD use these toolkit hooks for automated compliance validation:

### 1. toolkit/hooks/security/scan-secrets.yaml
**Purpose**: Prevent credential exposure in source code

**What it validates**:
- No hardcoded API keys, passwords, tokens
- No private keys in code
- `.env` files excluded from commits

**Usage**: Runs automatically on file save

### 2. toolkit/hooks/quality/validate-against-golden.yaml
**Purpose**: Verify service spec aligns with this golden spec

**What it validates**:
- Service spec declares authentication pattern
- Endpoint security matrix present
- Secrets stored in AWS Secrets Manager
- Audit logging configured

**Usage**: Runs on spec approval, before deployment

### 3. toolkit/hooks/security/validate-iam.yaml
**Purpose**: Ensure IAM roles follow least privilege

**What it validates**:
- No wildcard IAM permissions (`Action: *`, `Resource: *`)
- IAM roles scoped to specific resources
- Secrets Manager permissions limited to service secrets

**Usage**: Runs on CDK synthesis

---

## Exception Process

Services that cannot fully comply with this golden spec MUST document exceptions and obtain approval.

### Exception Documentation Template

```markdown
## Authentication Pattern Exception

**Service**: [Service Name]
**Exception**: [What part of golden spec is not followed]
**Rationale**: [Why exception is necessary]
**Risk Mitigation**: [What compensating controls are in place]
**Approval**: [Security team approval ticket ID]
**Expiration**: [When exception must be re-evaluated]

**Example**:
**Service**: Legacy Invoice System
**Exception**: Uses API keys without 90-day rotation (static keys)
**Rationale**: Third-party vendor integration requires static keys, vendor does not support key rotation
**Risk Mitigation**: Keys stored in Secrets Manager, access restricted to specific IP ranges, additional monitoring for key misuse
**Approval**: SEC-2024-001 (approved by Security Team on 2024-01-10)
**Expiration**: 2024-06-30 (migrate to OAuth2 by Q2 2024)
```

### Exception Tracking

All exceptions MUST be tracked in `docs/golden-spec-exceptions.md` for audit visibility.

---

## Lessons Learned

### From Security Incidents

1. **2023-08 Incident: Hardcoded JWT Secret in Code**
   - **What happened**: Developer committed JWT signing secret to GitHub (private repo, but still violation)
   - **Impact**: Secret rotated, all issued tokens invalidated, 2 hours of user re-authentication
   - **Prevention**: This golden spec now requires Secrets Manager, enforced by scan-secrets.yaml hook
   - **Outcome**: Zero credential commits since hook deployed (100% prevention rate over 6 months)

2. **2023-11 Incident: Token Logged in CloudWatch**
   - **What happened**: Debug logging included full OAuth2 access token, visible in CloudWatch Logs Insights
   - **Impact**: Token manually revoked, affected user re-authenticated, log retention shortened to 24 hours for incident window
   - **Prevention**: Golden spec now mandates log scrubbing, unit tests verify no token logging
   - **Outcome**: Log scanning detects token patterns before production deployment

3. **2024-02 Incident: Brute Force Attack on Login Endpoint**
   - **What happened**: Attacker attempted 10,000 login requests targeting high-value accounts
   - **Impact**: 3 accounts compromised before rate limiting activated (old rate limit: 100/min was too permissive)
   - **Prevention**: Golden spec now requires 5 failures per 15 minutes per user (not per IP)
   - **Outcome**: Subsequent attacks blocked within 5 attempts, zero compromises since rate limit adjustment

4. **2024-04 Incident: Session Fixation Attack**
   - **What happened**: Attacker pre-set session ID in victim's browser, victim logged in with that session ID
   - **Impact**: 1 account compromised, attacker gained access to user's session
   - **Prevention**: Golden spec now requires session ID regeneration after authentication
   - **Outcome**: Session fixation attacks no longer possible (new session ID issued post-login)

### Design Constraints from Compliance Requirements

1. **GDPR Right to Be Forgotten**
   - **Requirement**: Users can request account deletion, including all authentication records
   - **Implementation**: Session store (Redis/DynamoDB) supports deletion, audit logs retain pseudonymized data (user ID only, no PII)
   - **Trade-off**: Cannot fully delete audit logs (SOX compliance requires 7-year retention), but pseudonymization satisfies GDPR

2. **SOC 2 Type II Credential Rotation**
   - **Requirement**: All credentials must rotate at least every 90 days
   - **Implementation**: API key rotation enforced by expiration, automated hook notifies partners 30 days before expiration
   - **Trade-off**: Partner friction (quarterly key updates), but automation reduces human error

3. **PCI DSS Strong Cryptography**
   - **Requirement**: All authentication tokens must use "strong cryptography" (per PCI DSS 3.2.1)
   - **Implementation**: RS256 (RSA 2048-bit) for JWTs, AES-256 for session encryption, TLS 1.2+ for transport
   - **Trade-off**: Slightly higher computational cost vs weaker algorithms (e.g., HS256), but security justifies overhead

---

## Reference Implementation

### Minimal OAuth2/OIDC Service (TypeScript + Express)

```typescript
import express from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const app = express();
const OIDC_DISCOVERY_URL = 'https://auth.example.com/.well-known/openid-configuration';

// 1. Load OIDC configuration
let oidcConfig: any;
async function loadOIDCConfig() {
  const response = await axios.get(OIDC_DISCOVERY_URL);
  oidcConfig = response.data;
}

// 2. Middleware: Validate OAuth2 token
async function validateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'missing_auth_header' });
    }

    const token = authHeader.substring(7);
    
    // Fetch public key from JWKS endpoint
    const jwksResponse = await axios.get(oidcConfig.jwks_uri);
    const publicKey = jwksResponse.data.keys[0]; // Simplified: should match kid

    // Verify token
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: oidcConfig.issuer,
      audience: 'payment-processor',
    });

    req.user = decoded; // Attach claims to request
    next();
  } catch (error) {
    res.status(401).json({ error: 'invalid_token' });
  }
}

// 3. Protected endpoint
app.get('/api/payments', validateToken, async (req, res) => {
  // Authorization check
  if (!req.user.roles.includes('read:payments')) {
    return res.status(403).json({ error: 'insufficient_permissions' });
  }

  // Process request
  res.json({ payments: [] });
});

loadOIDCConfig().then(() => {
  app.listen(3000, () => console.log('Server running'));
});
```

### Minimal API Key Authentication (TypeScript + Express)

```typescript
import express from 'express';
import { getSecret } from '@aws-sdk/client-secrets-manager';

const app = express();

// 1. Validate API key
async function validateApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ error: 'missing_api_key' });
    }

    // Load valid API keys from Secrets Manager
    const secretValue = await getSecret({ SecretId: 'payment-processor/prod/api-keys' });
    const validKeys = JSON.parse(secretValue.SecretString);

    // Validate format
    if (!apiKey.startsWith('apikey_prod_')) {
      return res.status(401).json({ error: 'invalid_api_key_format' });
    }

    // Check if key exists and not expired
    const keyData = validKeys[apiKey];
    if (!keyData || new Date(keyData.expiresAt) < new Date()) {
      return res.status(401).json({ error: 'api_key_invalid_or_expired' });
    }

    req.apiKey = keyData; // Attach key metadata to request
    next();
  } catch (error) {
    res.status(500).json({ error: 'auth_system_error' });
  }
}

// 2. Rate limiting per API key
const apiKeyRateLimits = new Map(); // In production: use Redis

function rateLimitApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const apiKey = req.headers['x-api-key'];
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 1000;

  if (!apiKeyRateLimits.has(apiKey)) {
    apiKeyRateLimits.set(apiKey, { count: 1, resetTime: now + windowMs });
    return next();
  }

  const limit = apiKeyRateLimits.get(apiKey);
  if (now > limit.resetTime) {
    limit.count = 1;
    limit.resetTime = now + windowMs;
    return next();
  }

  if (limit.count >= maxRequests) {
    return res.status(429).json({ error: 'rate_limit_exceeded', retryAfter: Math.ceil((limit.resetTime - now) / 1000) });
  }

  limit.count++;
  next();
}

// 3. Protected endpoint
app.get('/api/payments', validateApiKey, rateLimitApiKey, async (req, res) => {
  res.json({ payments: [] });
});

app.listen(3000);
```

### Service-to-Service JWT Generation (TypeScript)

```typescript
import jwt from 'jsonwebtoken';
import { getSecret } from '@aws-sdk/client-secrets-manager';

// 1. Generate service JWT
async function generateServiceJWT(targetService: string): Promise<string> {
  // Load private key from Secrets Manager
  const secretValue = await getSecret({ SecretId: 'payment-processor/prod/jwt-private-key' });
  const privateKey = secretValue.SecretString;

  // Create JWT
  const token = jwt.sign(
    {
      sub: 'payment-processor', // This service's identifier
      aud: targetService,        // Target service (e.g., 'notification-service')
      iss: 'payment-processor',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (5 * 60), // 5 minutes
    },
    privateKey,
    { algorithm: 'RS256' }
  );

  return token;
}

// 2. Call another service
async function callNotificationService(payload: any) {
  const token = await generateServiceJWT('notification-service');
  
  const response = await fetch('https://notification-service.internal/api/notify', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return response.json();
}
```

---

## Related Toolkit Artifacts

- `toolkit/hooks/security/scan-secrets.yaml` - Prevent credential exposure
- `toolkit/hooks/security/validate-iam.yaml` - Enforce least privilege IAM
- `toolkit/hooks/quality/validate-against-golden.yaml` - Verify compliance with this spec
- `toolkit/steering/excluded-paths.yaml` - Exclude sensitive files from model context
- `toolkit/specs/golden/logging-standard.spec.md` - Structured logging (complements audit requirements)

---

## Changelog

### Version 1.0 (2024-01-15)
- Initial release
- Approved by Platform Engineering and Security teams
- Defines OAuth2/OIDC, API keys, Service-to-Service JWT, IAM patterns
- Establishes mandatory constraints and validation requirements

---

## Support and Questions

- **Questions**: #security-team Slack channel
- **Security Issues**: security@example.com
- **Golden Spec Updates**: Submit PR to `toolkit/specs/golden/auth-pattern.spec.md` with justification
- **Exception Requests**: File ticket with Security team, include exception template

