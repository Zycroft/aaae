---
phase: 07-client-msal-authentication
plan: "01"
subsystem: auth
tags: [msal, azure-ad, ciam, react, entra-external-id, typescript, vite]

# Dependency graph
requires:
  - phase: 05-shared-schema-config-foundation
    provides: VITE_AZURE_* env var declarations in .env.example
  - phase: 06-server-jwt-validation
    provides: server expecting Bearer tokens from MSAL-authenticated clients
provides:
  - PublicClientApplication singleton configured for Entra External ID (ciamlogin.com authority)
  - MsalProvider context wrapper (AuthProvider) available for React tree
  - loginRequest scopes constant for acquiring tokens
affects:
  - 07-02 (AuthGuard — consumes msalInstance and AuthProvider)
  - client/src/main.tsx (will wrap App in AuthProvider in Plan 02)

# Tech tracking
tech-stack:
  added:
    - "@azure/msal-browser@4.28.2 (core MSAL SPA library)"
    - "@azure/msal-react@3.0.26 (React 18-compatible MSAL hooks and MsalProvider)"
  patterns:
    - "MSAL singleton pattern: PublicClientApplication created once at module load, shared via MsalProvider context"
    - "sessionStorage cache: tokens scoped to browser tab, cleared on tab close"
    - "Thin provider wrapper: AuthProvider binds msalInstance, auth logic stays in AuthGuard"

key-files:
  created:
    - client/src/auth/msalConfig.ts
    - client/src/auth/AuthProvider.tsx
    - client/src/vite-env.d.ts
  modified:
    - client/package.json (added @azure/msal-browser and @azure/msal-react)
    - package-lock.json

key-decisions:
  - "Installed @azure/msal-react@3.x (not 5.x) — v5 requires React 19, project uses React 18; v3.x supports React 16/17/18/19"
  - "cacheLocation: sessionStorage — tokens survive page reload within tab but cleared when tab closes; safer than localStorage"
  - "navigateToLoginRequestUrl: false — after MSAL redirect, always return to app root, not the URL that triggered login"
  - "loginRequest scopes use api://{clientId}/access_as_user convention — matches server app registration's exposed scope"
  - "Added vite-env.d.ts (was missing from project) to provide ImportMeta.env types for VITE_* variables"

patterns-established:
  - "MSAL singleton: export msalInstance from msalConfig.ts, never re-instantiate"
  - "Auth directory: all MSAL-related files under client/src/auth/"
  - "AuthProvider is thin: only binds instance to context; all auth logic in AuthGuard"

requirements-completed: [CAUTH-02, CAUTH-04]

# Metrics
duration: 2min
completed: 2026-02-21
---

# Phase 7 Plan 01: MSAL Installation and Provider Foundation Summary

**MSAL PublicClientApplication singleton for Entra External ID CIAM (ciamlogin.com authority) with sessionStorage token cache and React MsalProvider wrapper**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T07:18:13Z
- **Completed:** 2026-02-21T07:20:13Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Installed `@azure/msal-browser@4.28.2` and `@azure/msal-react@3.0.26` as client-only dependencies (React 18-compatible versions)
- Created `client/src/auth/msalConfig.ts` with CIAM authority (`ciamlogin.com`) and sessionStorage token cache; exports `msalInstance` singleton and `loginRequest` scopes
- Created `client/src/auth/AuthProvider.tsx` — thin `MsalProvider` wrapper binding the singleton instance, ready to wrap `App` in `main.tsx`

## Task Commits

Each task was committed atomically:

1. **Task 1: Install MSAL packages in client workspace** - `012f06c` (chore)
2. **Task 2: Create MSAL configuration and PublicClientApplication singleton** - `b2417d9` (feat)
3. **Task 3: Create AuthProvider wrapper component** - `03b375f` (feat)

**Plan metadata:** (docs commit — see final commit hash)

## Files Created/Modified

- `client/src/auth/msalConfig.ts` — MSAL `Configuration` object + `PublicClientApplication` singleton + `loginRequest` scopes export
- `client/src/auth/AuthProvider.tsx` — Thin `MsalProvider` wrapper component; auth logic intentionally deferred to AuthGuard (Plan 02)
- `client/src/vite-env.d.ts` — Vite `ImportMetaEnv` interface declaring all `VITE_*` env vars (was missing from project)
- `client/package.json` — Added `@azure/msal-browser` and `@azure/msal-react` under `dependencies`
- `package-lock.json` — Updated with 3 new packages (msal-browser, msal-react, and their shared dep)

## Decisions Made

- Installed `@azure/msal-react@3.x` instead of the latest `5.x` — v5 requires React 19 as a peer dependency; the project uses React 18. v3.0.26 is the last stable release supporting React 16/17/18/19.
- `cacheLocation: 'sessionStorage'` — safer than `localStorage` for auth tokens; tokens are tab-scoped and cleared when the tab closes, reducing XSS exposure window.
- `navigateToLoginRequestUrl: false` — after MSAL redirect completes, always return to the app root rather than the originating URL, keeping UX simple during Phase 7 development.
- `loginRequest.scopes` use `api://{clientId}/access_as_user` — matches the server app registration's exposed API scope by convention; can be overridden via env if needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pinned @azure/msal-react to v3.x for React 18 compatibility**
- **Found during:** Task 1 (Install MSAL packages)
- **Issue:** `npm install @azure/msal-react` resolved to v5.0.4 which has `peerDependencies: react@"^19.2.1"`. Project uses React 18, causing `ERESOLVE` npm error.
- **Fix:** Installed `@azure/msal-react@^3.0.26` (last React 18-compatible series) with matching `@azure/msal-browser@^4.28.2` (required by msal-react v3.x)
- **Files modified:** client/package.json, package-lock.json
- **Verification:** `npm ls --workspace=client @azure/msal-browser @azure/msal-react` shows both installed without errors
- **Committed in:** `012f06c` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added vite-env.d.ts for ImportMeta.env type support**
- **Found during:** Task 2 (Create MSAL configuration)
- **Issue:** `import.meta.env` produced TypeScript error `TS2339: Property 'env' does not exist on type 'ImportMeta'`. The standard `vite-env.d.ts` file was missing from the project.
- **Fix:** Created `client/src/vite-env.d.ts` with `/// <reference types="vite/client" />` and `ImportMetaEnv` interface declaring all `VITE_*` env vars used in the project.
- **Files modified:** client/src/vite-env.d.ts (created)
- **Verification:** `cd client && npx tsc --noEmit` compiles without errors
- **Committed in:** `b2417d9` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking peer dependency conflict, 1 missing critical type declaration)
**Impact on plan:** Both fixes were necessary for correctness. Version pin maintains React 18 compatibility. vite-env.d.ts is standard Vite project setup that was overlooked during initial scaffolding.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None — no external service configuration required for this plan. MSAL environment variables (`VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_NAME`, `VITE_AZURE_REDIRECT_URI`) are already documented in `client/.env.example` from prior phases.

## Next Phase Readiness

- `msalInstance` and `AuthProvider` are ready for Plan 02 (AuthGuard implementation)
- `main.tsx` still needs to be updated to wrap `App` in `AuthProvider` — that's Plan 02's task
- Pre-existing lint concerns remain (3 errors in AdaptiveCardMessage.tsx, ChatInput.tsx) — out of scope, logged in STATE.md

---
*Phase: 07-client-msal-authentication*
*Completed: 2026-02-21*
