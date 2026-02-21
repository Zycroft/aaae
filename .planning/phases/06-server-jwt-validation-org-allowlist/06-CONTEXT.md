# Phase 6 Context: Server JWT Validation + Org Allowlist

**Created:** 2026-02-21
**Phase goal:** The server validates real Entra External ID JWT tokens and blocks requests from disallowed tenants — authenticated requests reach the Copilot proxy; unauthenticated or disallowed requests are rejected with appropriate HTTP errors

## Decisions

### Error Response Format

**Decision:** JSON error objects with status codes and `WWW-Authenticate` header on 401.

- 401 responses include `WWW-Authenticate: Bearer` header (per RFC 6750)
- All auth error responses are JSON: `{ "error": "<code>", "message": "<human-readable>" }`
- Error codes: `token_missing`, `token_invalid`, `token_expired`, `audience_mismatch`, `issuer_mismatch`
- 403 responses for org allowlist use: `{ "error": "tenant_not_allowed", "message": "..." }`
- No token details or claim values in error responses (security: don't leak info to attackers)

### Empty Allowlist Behavior

**Decision:** Fail-closed — empty ALLOWED_TENANT_IDS blocks ALL tenants.

- If `ALLOWED_TENANT_IDS` is empty or unset, no tenant passes the check
- This prevents accidental open access if the env var is forgotten
- Consistent with the fail-closed pattern established in Phase 5 (AZURE_CLIENT_ID guard)
- Operators must explicitly list at least one tenant ID to allow access

### Auth Failure Logging

**Decision:** Log rejection reason + tenant ID on failures. No PII (email, name).

- Log format: `[auth] Rejected: <reason> (tid: <tenant-id>)` for org allowlist denials
- Log format: `[auth] Rejected: <reason>` for JWT validation failures (no claims available)
- Include timestamp (Express default logging handles this)
- Do NOT log email, name, or full token payload — privacy concern
- Successful auth is not logged (too noisy)

### Local Dev req.user Stub

**Decision:** Always populate `req.user` with hardcoded stub when `AUTH_REQUIRED=false`.

- When `AUTH_REQUIRED=false`, middleware injects a fixed `UserClaims` stub:
  ```typescript
  {
    sub: 'local-dev-user',
    tid: 'local-dev-tenant',
    oid: 'local-dev-oid',
    name: 'Local Developer',
    email: 'dev@localhost'
  }
  ```
- Route handlers never need to check `req.user` for undefined — it's always present
- Hardcoded constants, NOT configurable via env vars (no extra vars to manage)
- Log once at startup: `[auth] WARNING: AUTH_REQUIRED=false — all requests bypass JWT validation with stub user`
- This stub matches the `UserClaims` schema from Phase 5 exactly

## Scope Boundaries

**In scope (Phase 6):**
- JWT validation middleware (JWKS, audience, issuer, expiry)
- Org allowlist middleware (tid check against ALLOWED_TENANT_IDS)
- req.user population from decoded claims
- AUTH_REQUIRED=false stub user injection
- Unit tests for both middleware layers

**Out of scope (explicitly deferred):**
- MSAL React client auth (Phase 7)
- OBO token acquisition (v1.3+)
- Role-based access control (not in v1.2)
- Rate limiting on auth failures (future consideration)

## Dependencies

**Consumes from Phase 5:**
- `UserClaimsSchema` and `UserClaims` type from `shared/src/schemas/auth.ts`
- `config.AZURE_CLIENT_ID`, `config.AZURE_TENANT_NAME`, `config.ALLOWED_TENANT_IDS` from `server/src/config.ts`
- Fail-closed startup guard already handles missing AZURE_CLIENT_ID

**Produces for Phase 7:**
- Working JWT validation on all `/api/*` routes — Phase 7 client must send `Authorization: Bearer {token}`
- `req.user: UserClaims` available in all route handlers
- 401/403 JSON error format that Phase 7 client can parse and display

## Research Hints

- Entra External ID JWKS endpoint: `https://{tenant}.ciamlogin.com/{tenant}.onmicrosoft.com/discovery/v2.0/keys` — confirm exact format
- Discovery URL: `https://{tenant}.ciamlogin.com/{tenant}.onmicrosoft.com/v2.0/.well-known/openid-configuration`
- Consider `jose` or `jsonwebtoken` + `jwks-rsa` for JWT validation — research which is best for Express middleware
- Express middleware pattern: auth middleware on router group, not per-route

---
*Phase: 06-server-jwt-validation-org-allowlist*
*Decisions captured: 2026-02-21*
