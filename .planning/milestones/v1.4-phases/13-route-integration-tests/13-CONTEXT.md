# Phase 13: Route Integration + Tests - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire JWT claims from req.user into chat route userId/tenantId fields, add factory pattern unit tests, and ensure backward compatibility with AUTH_REQUIRED=false dev bypass. Most route integration was already completed as part of the Phase 11 build fix (createdAt, updatedAt, status fields are already populated). Phase 13 only needs to replace the hardcoded 'anonymous'/'dev' values with JWT-derived values.

</domain>

<decisions>
## Implementation Decisions

### JWT Claim Mapping
- userId maps to req.user.oid (Azure AD object ID — stable, unique per user)
- tenantId maps to req.user.tid (Azure AD tenant ID)
- When AUTH_REQUIRED=false, req.user is the STUB_USER with oid: 'local-dev-oid' and tid: 'local-dev-tenant'
- Routes should use req.user unconditionally — the auth middleware guarantees req.user is populated (either real claims or stub)

### Already Complete (Phase 11 Fix)
- ROUTE-02: createdAt timestamp and status='active' on /start — already in chat.ts
- ROUTE-03: updatedAt timestamp on /send and /card-action — already in chat.ts
- ROUTE-04: Placeholder values for auth-bypass — STUB_USER already returns oid and tid

### Remaining Work
- ROUTE-01: Replace `userId: 'anonymous'` with `req.user.oid` and `tenantId: 'dev'` with `req.user.tid`
- TEST-02: Factory pattern unit tests (createConversationStore)
- Same changes needed in orchestrate.ts routes

### Express Request Type Extension
- req.user is typed via Express declaration merging in types/express.d.ts (Phase 6)
- req.user contains UserClaims shape: { sub, tid, oid, name?, email? }

### Claude's Discretion
- Test structure for factory tests
- Whether to mock process.env or use test helpers

</decisions>

<specifics>
## Specific Ideas

- The auth middleware already handles the AUTH_REQUIRED=false → STUB_USER flow. Routes don't need to check AUTH_REQUIRED — they just use req.user.oid and req.user.tid unconditionally.
- STUB_USER has oid: 'local-dev-oid' and tid: 'local-dev-tenant' — these are the new anonymous/dev equivalents.
- The orchestrate.ts route also needs the same treatment (it creates StoredConversation objects).

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>

---

*Phase: 13-route-integration-tests*
*Context gathered: 2026-02-22*
