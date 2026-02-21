---
phase: 05-shared-schema-config-foundation
plan: "02"
subsystem: auth
tags: [azure-ad, entra-external-id, config, env-vars, fail-closed]

# Dependency graph
requires:
  - phase: 05-shared-schema-config-foundation
    provides: Plan 01 schema definitions (basis for phase config work)
provides:
  - Azure AD env var documentation in server/.env.example and client/.env.example
  - Fail-closed AZURE_CLIENT_ID guard in server config (process.exit on AUTH_REQUIRED=true without AZURE_CLIENT_ID)
  - AZURE_TENANT_NAME, AZURE_CLIENT_ID, ALLOWED_TENANT_IDS exported from server config
affects:
  - 06-server-jwt-validation
  - 07-client-msal-integration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-closed config validation: process.exit(1) when required Azure AD vars missing under AUTH_REQUIRED=true"
    - "process.env.AUTH_REQUIRED !== 'false' pattern used consistently for guard conditions"
    - "ALLOWED_TENANT_IDS split from comma-separated string to string[] at config load time"

key-files:
  created: []
  modified:
    - server/.env.example
    - client/.env.example
    - server/src/config.ts

key-decisions:
  - "AZURE_CLIENT_ID guard fires by default (AUTH_REQUIRED defaults to true) — must explicitly set AUTH_REQUIRED=false for local dev without Azure AD"
  - "ALLOWED_TENANT_IDS parsed at startup as string[] to avoid repeated split in middleware"
  - "AZURE_CLIENT_ID typed as string | undefined in config export — Phase 6 callers will assert non-null after auth guard"

patterns-established:
  - "Fail-closed: AUTH_REQUIRED=true (default) requires all Azure AD vars — no silent passthrough"
  - "AUTH_REQUIRED=false exempts from Azure AD validation entirely (local dev escape hatch)"

requirements-completed: [CFG-01, CFG-02, CFG-03, CFG-04, CFG-05]

# Metrics
duration: 6min
completed: 2026-02-21
---

# Phase 5 Plan 02: Shared Schema + Config Foundation Summary

**Azure AD env var documentation in both .env.example files plus fail-closed AZURE_CLIENT_ID guard in server config using process.exit(1)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-21T06:00:19Z
- **Completed:** 2026-02-21T06:06:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Both .env.example files document all required Azure AD variables with inline comments explaining where to find values in Azure Portal
- server/src/config.ts now refuses to start when AUTH_REQUIRED=true (default) and AZURE_CLIENT_ID is unset — logs FATAL and exits with code 1
- config exports AZURE_TENANT_NAME, AZURE_CLIENT_ID, ALLOWED_TENANT_IDS (pre-split string array) for use in Phase 6 JWT validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Update .env.example files with Azure AD variables** - `cfa9ddc` (feat)
2. **Task 2: Update server config to fail closed on missing AZURE_CLIENT_ID** - `480e57b` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `server/.env.example` - Added AZURE_TENANT_NAME, AZURE_CLIENT_ID, ALLOWED_TENANT_IDS section with documentation comments
- `client/.env.example` - Added VITE_AZURE_CLIENT_ID, VITE_AZURE_TENANT_NAME, VITE_AZURE_REDIRECT_URI section with documentation comments
- `server/src/config.ts` - Added fail-closed AZURE_CLIENT_ID guard and exported three Azure AD config fields

## Decisions Made
- Used the same `process.env.AUTH_REQUIRED !== 'false'` pattern already established in the codebase for consistency
- ALLOWED_TENANT_IDS parsed to string[] at config load (not at middleware call time) for efficiency
- AZURE_CLIENT_ID exported as `string | undefined` — caller narrowing happens in Phase 6 after the startup guard already ensured it is set

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required in this plan. (Phase 6 will add a USER-SETUP.md for Azure Portal app registration steps.)

## Next Phase Readiness
- Phase 6 (Server JWT Validation) can now import `config.AZURE_CLIENT_ID`, `config.AZURE_TENANT_NAME`, and `config.ALLOWED_TENANT_IDS` directly from `server/src/config.ts`
- The fail-closed guard ensures Phase 6 JWT middleware never runs without required Azure AD credentials
- Both .env.example files serve as developer onboarding documentation for Azure Portal configuration

---
*Phase: 05-shared-schema-config-foundation*
*Completed: 2026-02-21*
