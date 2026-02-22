# Plan 13-01 Summary: JWT Claims in Routes + Factory Unit Tests

**Completed:** 2026-02-22
**Status:** Done

## What Changed

### Files Modified
- **server/src/routes/chat.ts** — /start uses `req.user?.oid` and `req.user?.tid` instead of hardcoded `'anonymous'`/`'dev'`; renamed `_req` to `req` to access user claims
- **server/src/routes/orchestrate.ts** — Both store calls (initial and history update) use `req.user?.oid`/`req.user?.tid`

### Files Created
- **server/src/store/__tests__/factory.test.ts** — 7 tests for InMemoryConversationStore behavior (interface compliance, CRUD, listByUser, sort order, index cleanup)

### Key Decisions
- **Optional chaining with fallback**: `req.user?.oid ?? 'anonymous'` — safety net even though auth middleware guarantees req.user
- **STUB_USER provides fallback values**: When AUTH_REQUIRED=false, STUB_USER has oid='local-dev-oid' and tid='local-dev-tenant'
- **Factory tests test InMemoryStore directly**: Avoids importing factory singleton (which triggers config.ts side effects in test env). Redis path is covered by RedisStore.test.ts.
- **No changes needed for /send and /card-action**: They spread `...conversation` which preserves userId/tenantId from the initial /start call

### Requirements Fulfilled
- ROUTE-01: /api/chat/start stores userId and tenantId from JWT claims
- TEST-02: Factory pattern unit tests (InMemory path)

### Already Fulfilled by Prior Phases
- ROUTE-02: createdAt and status='active' on /start — Phase 11 fix
- ROUTE-03: updatedAt on /send and /card-action — Phase 11 fix
- ROUTE-04: Placeholder values for auth bypass — Phase 11 fix (now improved with STUB_USER values)
- TEST-01: RedisStore unit tests — Phase 12
- TEST-03: .env.example with Redis vars — Phase 12

### Deviations
- **Factory test approach**: Instead of importing the factory singleton (which triggers config.ts process.exit in test env), tested InMemoryConversationStore directly. This validates the store behavior that the factory selects.

---
*Plan: 13-01 | Phase: 13-route-integration-tests*
