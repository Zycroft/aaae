---
phase: 06-server-jwt-validation-org-allowlist
plan: "01"
subsystem: auth
tags: [jwt, jose, entra-external-id, ciam, express, vitest, tdd]

# Dependency graph
requires:
  - phase: 05-shared-schema-config-foundation
    provides: UserClaimsSchema, UserClaims type, AZURE_TENANT_NAME/AZURE_CLIENT_ID in config

provides:
  - authMiddleware with real JWT validation via jose createRemoteJWKSet + jwtVerify
  - Express Request type augmentation (req.user: UserClaims)
  - AUTH_REQUIRED=false stub user path for local dev
  - 7 unit tests covering all auth scenarios

affects: [07-client-msal-auth, any server route handler using req.user]

# Tech tracking
tech-stack:
  added: [jose@^6.x]
  patterns:
    - jose errors namespace API (errors.JWTExpired, errors.JWTClaimValidationFailed) — not direct exports in jose v6
    - createRemoteJWKSet called once at module load (jose handles JWKS caching internally)
    - TypeScript declaration merging via express.d.ts to augment Request with req.user
    - WWW-Authenticate: Bearer header on all 401 responses (RFC 6750)

key-files:
  created:
    - server/src/middleware/auth.ts
    - server/src/types/express.d.ts
    - server/src/middleware/auth.test.ts
  modified:
    - server/package.json (jose dependency added)
    - package-lock.json

key-decisions:
  - "jose chosen over jsonwebtoken: pure ESM (server is type=module), typed error classes, built-in JWKS caching via createRemoteJWKSet"
  - "jose v6 moves JWTExpired/JWTClaimValidationFailed under errors.* namespace — destructure from errors, not direct import"
  - "JWKS and issuer/audience built once at module load time for performance; jose handles key rotation internally"
  - "AUTH_REQUIRED=false warning logged once at module import time (not per-request) via top-level if block"
  - "JWTClaimValidationFailed.claim inspected: aud → audience_mismatch, iss → issuer_mismatch, other → token_invalid"

patterns-established:
  - "Pattern 1: Jose errors namespace — import { errors } from 'jose' and destructure, not named imports"
  - "Pattern 2: Express type augmentation — declare module 'express-serve-static-core' in server/src/types/*.d.ts"
  - "Pattern 3: No PII logging — console.warn only error code/type, never token contents or claims"

requirements-completed: [SAUTH-01, SAUTH-02, SAUTH-03, SAUTH-04, SAUTH-05, SAUTH-06, TEST-01]

# Metrics
duration: 4min
completed: 2026-02-21
---

# Phase 6 Plan 01: JWT Validation Middleware Summary

**Real JWT validation via jose createRemoteJWKSet against Entra External ID CIAM JWKS endpoint, replacing Phase 1 auth stub with typed error handling for 5 distinct failure modes**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-21T06:29:43Z
- **Completed:** 2026-02-21T06:33:54Z
- **Tasks:** 5 (install jose, express.d.ts, RED tests, GREEN implementation, build verification)
- **Files modified:** 5

## Accomplishments

- Replaced Phase 1 auth stub with full JWKS-backed JWT validation using jose (pure ESM, built-in caching)
- Implemented typed error handling: JWTExpired → token_expired, JWTClaimValidationFailed on aud/iss → audience_mismatch/issuer_mismatch
- Added Express Request type augmentation so req.user: UserClaims is available in all route handlers
- AUTH_REQUIRED=false path injects stub user (sub: 'local-dev-user') with module-level warning log
- 7 Vitest unit tests cover all auth failure modes and success path (29 total tests pass)

## Task Commits

Each task was committed atomically:

1. **Install jose** - `a145623` (chore: add jose JWT library dependency)
2. **Express type augmentation** - `9c0948f` (feat: add Express Request type augmentation for req.user)
3. **RED tests** - `a303266` (test: add failing tests for JWT authMiddleware)
4. **GREEN implementation** - `8b160f3` (feat: implement JWT validation middleware with jose)
5. **Fix jose v6 API** - `bdba02d` (fix: adapt to jose v6 errors namespace API)

_Note: TDD plan — RED commit followed by GREEN commit. Fix commit was required due to jose v6 API discovery._

## Files Created/Modified

- `server/src/middleware/auth.ts` - Real JWT middleware using jose; replaced Phase 1 stub
- `server/src/types/express.d.ts` - Express Request augmentation with user?: UserClaims
- `server/src/middleware/auth.test.ts` - 7 Vitest unit tests (all passing)
- `server/package.json` - jose@^6.x dependency added
- `package-lock.json` - Updated lockfile

## Decisions Made

- **jose over jsonwebtoken**: Server is `"type": "module"` (pure ESM) — jose is ESM-native, no CJS wrapper friction. Also provides `createRemoteJWKSet` with built-in JWKS caching and typed error classes.
- **jose v6 errors namespace**: In jose v6, `JWTExpired` and `JWTClaimValidationFailed` are under `errors.*` not direct exports. Implemented via `import { errors } from 'jose'` then destructure.
- **Module-load JWKS initialization**: `createRemoteJWKSet` called once at module load — jose handles JWKS key rotation internally so this is safe and efficient.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adapted to jose v6 error class API change**
- **Found during:** Task 5 (TypeScript build verification)
- **Issue:** Plan specified `import { JWTExpired, JWTClaimValidationFailed } from 'jose'` but jose v6 moved these under the `errors` namespace — `import { errors } from 'jose'`
- **Fix:** Updated auth.ts to `import { errors } from 'jose'` and destructure. Updated test mocks to match jose v6 constructor signatures `(message, payload, claim?, reason?)`
- **Files modified:** server/src/middleware/auth.ts, server/src/middleware/auth.test.ts
- **Verification:** `npm run build` exits 0, all 29 tests pass
- **Committed in:** bdba02d

---

**Total deviations:** 1 auto-fixed (Rule 1 — jose v6 API discovery during build verification)
**Impact on plan:** Required to match actual jose v6 public API. No scope creep — same functionality, different import path.

## Issues Encountered

- jose v6 breaking change: error classes moved from direct exports to `errors.*` namespace. Discovered during TypeScript compilation (`TS2305: Module '"jose"' has no exported member 'JWTExpired'`). Fixed inline per Rule 1.

## User Setup Required

None - no external service configuration required. Real JWT validation requires Azure credentials in `server/.env` (already documented in Phase 5 setup).

## Next Phase Readiness

- `authMiddleware` is complete and ready — all Phase 6 plan 02 (org allowlist) can import and extend it
- `req.user: UserClaims` is available in all API route handlers after auth passes
- Phase 7 (client MSAL auth) can rely on server correctly validating Entra External ID tokens

## Self-Check: PASSED

- FOUND: server/src/middleware/auth.ts
- FOUND: server/src/types/express.d.ts
- FOUND: server/src/middleware/auth.test.ts
- FOUND: .planning/phases/06-server-jwt-validation-org-allowlist/06-01-SUMMARY.md
- All 5 commits verified: a145623, 9c0948f, a303266, 8b160f3, bdba02d
- 29/29 tests pass
- npm run build exits 0

---
*Phase: 06-server-jwt-validation-org-allowlist*
*Completed: 2026-02-21*
