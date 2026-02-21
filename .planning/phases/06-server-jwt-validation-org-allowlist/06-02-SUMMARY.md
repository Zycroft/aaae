---
phase: 06-server-jwt-validation-org-allowlist
plan: "02"
subsystem: auth
tags: [express, middleware, jwt, tenant, allowlist, vitest, tdd]

# Dependency graph
requires:
  - phase: 06-01
    provides: authMiddleware that populates req.user with validated UserClaims (tid claim available)
  - phase: 05-01
    provides: UserClaimsSchema with tid field; req.user TypeScript type via express.d.ts
  - phase: 05-02
    provides: config.ALLOWED_TENANT_IDS parsed to string[] at startup
provides:
  - orgAllowlist Express middleware checking tid claim against ALLOWED_TENANT_IDS
  - 5 Vitest unit tests covering all org allowlist cases
  - app.ts with authMiddleware → orgAllowlist → chatRouter pipeline
affects: [phase-07-client-msal, phase-08-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Synchronous Express middleware for in-memory string[] lookups (no async needed)
    - Fail-closed empty allowlist: zero configured tenants = all denied
    - Logging denial with tid (non-PII tenant ID) only — no email/name in logs
    - vi.mock config injection pattern for unit-testing middleware with varying ALLOWED_TENANT_IDS

key-files:
  created:
    - server/src/middleware/orgAllowlist.ts
    - server/src/middleware/orgAllowlist.test.ts
  modified:
    - server/src/app.ts

key-decisions:
  - "orgAllowlist is synchronous — Array.includes on an in-memory string[] needs no async/await"
  - "No WWW-Authenticate header on 403 responses — only 401 uses that per RFC 6750"
  - "Denial logs include tid (tenant identifier, not PII) — email/name never logged"

patterns-established:
  - "vi.mocked(config).ALLOWED_TENANT_IDS = [...] pattern for overriding config per test in beforeEach"

requirements-completed: [ORG-01, ORG-02, ORG-03, ORG-04, TEST-02]

# Metrics
duration: 2min
completed: 2026-02-21
---

# Phase 6 Plan 02: Org Allowlist Middleware Summary

**Synchronous orgAllowlist middleware with fail-closed empty-allowlist and 403 tenant_not_allowed responses, wired into app.ts after authMiddleware**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-21T06:36:38Z
- **Completed:** 2026-02-21T06:38:35Z
- **Tasks:** 3 (TDD RED + GREEN + app wiring)
- **Files modified:** 3

## Accomplishments
- Implemented `orgAllowlist.ts`: synchronous Express middleware that checks `req.user.tid` against `config.ALLOWED_TENANT_IDS`
- 5 Vitest unit tests covering: allowed tenant, denied tenant, empty allowlist (fail-closed), undefined req.user (defensive), multiple allowlist entries
- Wired `orgAllowlist` into `app.ts` immediately after `authMiddleware` — full auth pipeline: JWT validation → tenant membership → chat routes

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — failing tests** - `c31cf5e` (test)
2. **Task 2: GREEN — implement orgAllowlist.ts** - `1e1b5c7` (feat)
3. **Task 3: Wire into app.ts** - `8e4a5ab` (feat)

_Note: TDD tasks have RED + GREEN commits_

## Files Created/Modified
- `server/src/middleware/orgAllowlist.ts` — synchronous Express middleware; checks tid against ALLOWED_TENANT_IDS; fail-closed on empty list; logs denials with tid
- `server/src/middleware/orgAllowlist.test.ts` — 5 Vitest unit tests with vi.mock config injection; covers all branch paths
- `server/src/app.ts` — added orgAllowlist import and `app.use('/api', orgAllowlist)` after authMiddleware

## Decisions Made
- orgAllowlist is synchronous: Array.includes on an in-memory string[] is fast and needs no async
- No WWW-Authenticate header on 403: only 401 uses that per RFC 6750; 403 is authorization failure not authentication
- Denial logs include tid (tenant identifier) only — email, name, sub never appear in log output
- vi.mocked(config).ALLOWED_TENANT_IDS reassignment per test in beforeEach for clean isolation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The ALLOWED_TENANT_IDS environment variable is documented in server/.env.example from Phase 5.

## Next Phase Readiness
- Server auth stack is complete: JWT validation (Phase 6-01) + org allowlist (Phase 6-02) + config (Phase 5-02)
- Every request reaching the Copilot proxy has: (1) valid JWT signature, (2) correct audience/issuer, (3) approved tenant
- Phase 7 (Client MSAL) can proceed — server-side enforcement is in place
- Concern: MSAL acquireTokenSilent may need explicit account hint in Phase 7 (pre-existing note in STATE.md)

---

## Self-Check

**Files:**
- `server/src/middleware/orgAllowlist.ts` — FOUND
- `server/src/middleware/orgAllowlist.test.ts` — FOUND
- `server/src/app.ts` — FOUND (contains orgAllowlist)

**Commits:**
- `c31cf5e` — FOUND (test: RED tests)
- `1e1b5c7` — FOUND (feat: GREEN implementation)
- `8e4a5ab` — FOUND (feat: app.ts wiring)

## Self-Check: PASSED

---
*Phase: 06-server-jwt-validation-org-allowlist*
*Completed: 2026-02-21*
