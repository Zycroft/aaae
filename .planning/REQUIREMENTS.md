# Requirements: Agentic Copilot Chat App

**Defined:** 2026-02-20
**Core Value:** Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected.

## v1.2 Requirements

Requirements for v1.2 Entra External ID Authentication (MSAL). Each maps to roadmap phases.

### Client Authentication

- [ ] **CAUTH-01**: User sees a sign-in page (not the chat UI) when unauthenticated
- [ ] **CAUTH-02**: User can sign in via Entra External ID (CIAM) redirect flow
- [ ] **CAUTH-03**: After sign-in, chat functions identically to v1.1 (no regression)
- [ ] **CAUTH-04**: Token is acquired silently on mount (acquireTokenSilent) with redirect fallback
- [ ] **CAUTH-05**: Authorization: Bearer {token} is attached to every API call automatically
- [ ] **CAUTH-06**: User can sign out (clears MSAL cache, returns to sign-in page)
- [ ] **CAUTH-07**: Token refresh happens silently — user is not logged out mid-conversation

### Server Authentication

- [ ] **SAUTH-01**: Server validates JWT signature using JWKS from CIAM discovery endpoint
- [ ] **SAUTH-02**: Server rejects tokens with wrong audience (not `api://{server-app-id}`)
- [ ] **SAUTH-03**: Server rejects expired tokens
- [ ] **SAUTH-04**: Server rejects tokens with invalid issuer
- [ ] **SAUTH-05**: Decoded claims are attached to `req.user` for downstream use
- [ ] **SAUTH-06**: Invalid/missing tokens return 401 with `WWW-Authenticate` header

### Org Allowlist

- [ ] **ORG-01**: Server extracts `tid` (tenant ID) claim from validated JWT
- [ ] **ORG-02**: Server checks `tid` against `ALLOWED_TENANT_IDS` environment variable
- [ ] **ORG-03**: Disallowed tenants receive 403 with clear error message
- [ ] **ORG-04**: Denied access attempts are logged (tenant ID, timestamp)

### Shared Schema

- [ ] **SCHEMA-01**: `UserClaims` Zod schema exists in `shared/src/schemas/auth.ts` with fields: sub, tid, email?, name?, oid
- [ ] **SCHEMA-02**: TypeScript type exported for server-side `req.user`

### Configuration

- [ ] **CFG-01**: Server env vars added: `AZURE_TENANT_NAME`, `AZURE_CLIENT_ID`, `ALLOWED_TENANT_IDS`
- [ ] **CFG-02**: Client env vars added: `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_NAME`, `VITE_AZURE_REDIRECT_URI`
- [ ] **CFG-03**: `.env.example` files updated for both workspaces
- [ ] **CFG-04**: Server fails closed (refuses all requests) if `AZURE_CLIENT_ID` is not set when `AUTH_REQUIRED=true`
- [ ] **CFG-05**: `AUTH_REQUIRED=false` still works for local dev without Azure AD setup

### Testing

- [ ] **TEST-01**: Unit tests for JWT validation middleware (mock JWKS, test expired/invalid/valid tokens)
- [ ] **TEST-02**: Unit tests for Org Allowlist middleware (allowed/denied tenants, missing tid)
- [ ] **TEST-03**: CI continues to pass with new code

## Future Requirements

### Downstream API Calls (v1.3+)

- **OBO-01**: Server acquires OBO tokens to call downstream APIs as the user
- **OBO-02**: Token cache per user session

### Enhanced Auth UX (v1.3+)

- **UX-01**: User profile display (name, email from claims)
- **UX-02**: Session timeout warning before token expiry

## Out of Scope

| Feature | Reason |
|---------|--------|
| MSAL Node OBO flow | v1.2 server only validates incoming tokens; Copilot Studio uses its own credentials |
| Custom login UI (username/password form) | MSAL handles the login UI via redirect to Entra |
| Multi-factor authentication config | MFA is configured in Entra portal, not in app code |
| Role-based access control (RBAC) | Not needed for v1.2; all authenticated users from allowed tenants have equal access |
| Social identity providers (Google, Facebook) | Can be configured in Entra External ID portal later; no code changes needed |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| — | — | — |

**Coverage:**
- v1.2 requirements: 24 total
- Mapped to phases: 0
- Unmapped: 24 ⚠️

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 after initial definition*
