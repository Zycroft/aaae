---
phase: 05-shared-schema-config-foundation
plan: "01"
subsystem: auth
tags: [zod, typescript, jwt, schema, entra-external-id]

# Dependency graph
requires: []
provides:
  - UserClaimsSchema Zod schema with sub, tid, oid (required) and email, name (optional)
  - UserClaims TypeScript type inferred from schema
  - Barrel export in shared/src/index.ts for server and client consumption
affects:
  - 06-server-jwt-middleware
  - 07-client-msal-auth

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD: write failing tests first, then implement, follow message.ts schema pattern"
    - "Zod schema in shared/src/schemas/*.ts with z.infer type alongside it"
    - "Barrel re-export in shared/src/index.ts using named export blocks"

key-files:
  created:
    - shared/src/schemas/auth.ts
    - shared/src/schemas/auth.test.ts
  modified:
    - shared/src/index.ts

key-decisions:
  - "oid required (not optional) — stable Azure AD object ID always present in Entra External ID tokens and needed for user identification in Phase 6"
  - "email and name optional — CIAM tokens do not always include these claims depending on user flow configuration"

patterns-established:
  - "Pattern 1: JWT claims schema mirrors token fields 1:1, no transformation at schema layer"
  - "Pattern 2: JSDoc on schema references requirement IDs (SCHEMA-01, SCHEMA-02) for traceability"

requirements-completed: [SCHEMA-01, SCHEMA-02]

# Metrics
duration: 2min
completed: 2026-02-21
---

# Phase 5 Plan 01: Shared Schema Config Foundation Summary

**UserClaims Zod schema (sub/tid/oid required, email/name optional) added to shared workspace as single source of truth for decoded JWT claims**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-21T06:00:13Z
- **Completed:** 2026-02-21T06:01:31Z
- **Tasks:** 4 (TDD: RED + GREEN + barrel update + build verify)
- **Files modified:** 3

## Accomplishments
- Created `shared/src/schemas/auth.ts` with `UserClaimsSchema` and `UserClaims` type following existing `message.ts` pattern
- Wrote 10 Vitest tests covering all valid and invalid parse cases (all pass)
- Updated `shared/src/index.ts` barrel to re-export `UserClaimsSchema` and `type UserClaims`
- Verified `shared/dist/` compiled output contains both JS and `.d.ts` declarations for `UserClaims`

## Task Commits

Each task was committed atomically:

1. **RED phase: failing auth schema tests** - `f937e8a` (test)
2. **GREEN phase: UserClaimsSchema + barrel update + build** - `271cb84` (feat)

_Note: TDD tasks have two commits (test RED → feat GREEN)_

## Files Created/Modified
- `shared/src/schemas/auth.ts` - UserClaimsSchema Zod object with sub/tid/oid required and email/name optional; exports UserClaims type
- `shared/src/schemas/auth.test.ts` - 10 Vitest tests covering valid minimal, full, partial optional, and all invalid cases
- `shared/src/index.ts` - Barrel re-export block added for UserClaimsSchema and UserClaims

## Decisions Made
- `oid` is required (not optional): the stable Azure AD / Entra External ID object identifier is always present and needed for user identity in Phase 6 server middleware
- `email` and `name` are optional: Entra External ID CIAM token claims vary by user flow configuration — these may not always be present

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `shared/dist/` is gitignored so dist files were not staged in commit — build verification confirmed via grep after `tsc --build` exit 0. This is expected and correct behavior per project conventions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `UserClaimsSchema` and `UserClaims` type are ready for Phase 6 server JWT middleware to import from `@copilot-chat/shared`
- Type can be used as `req.user: UserClaims` in Express middleware after JWT verification
- Phase 7 client can import `type UserClaims` for display logic without any Zod runtime dependency

---
*Phase: 05-shared-schema-config-foundation*
*Completed: 2026-02-21*
