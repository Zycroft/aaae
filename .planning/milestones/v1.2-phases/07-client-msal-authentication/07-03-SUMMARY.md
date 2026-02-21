---
phase: 07-client-msal-authentication
plan: "03"
subsystem: auth
tags: [msal, azure-ad, bearer-token, react, typescript, entra-external-id]

# Dependency graph
requires:
  - phase: 07-02
    provides: AuthGuard, SignInPage, AuthProvider — MSAL session management and sign-in flow
  - phase: 07-01
    provides: msalConfig.ts, loginRequest, msalInstance — MSAL configuration and instance
provides:
  - Bearer token injection on all three chat API endpoints (start, send, card-action)
  - Silent token acquisition with loginRedirect fallback in ChatShell
  - Sign-out button in chat header with logoutRedirect
  - useChatApi hook accepts getToken dependency for token-per-request pattern
affects: [future-api-changes, any-new-api-endpoints-need-token-param]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Token-as-parameter: chatApi functions accept token string; acquisition is caller's concern"
    - "getToken injection: useChatApi accepts getToken factory; acquires token before each request"
    - "acquireTokenSilent + loginRedirect fallback: silent-first, redirect on failure"
    - "void operator for logoutRedirect floating promise in event handler"

key-files:
  created: []
  modified:
    - client/src/api/chatApi.ts
    - client/src/hooks/useChatApi.ts
    - client/src/components/ChatShell.tsx
    - client/src/components/chat.css

key-decisions:
  - "Token-as-parameter pattern: chatApi functions accept token string — acquisition stays in ChatShell, not inside the API layer"
  - "getToken injected into useChatApi via config object — avoids positional arg brittleness and keeps hook testable"
  - "Empty dependency array on mount useEffect in useChatApi — intentional to prevent re-mount loops if getToken reference changes"
  - "Remove eslint-disable-next-line for react-hooks/exhaustive-deps — plugin not installed, disable comment itself triggered a new lint error"

patterns-established:
  - "All new API endpoints must accept token: string as a parameter — acquisition is always the caller's responsibility"
  - "Token acquisition: acquireTokenSilent first, loginRedirect fallback — MSAL CIAM pattern for silent refresh"

requirements-completed: [CAUTH-04, CAUTH-05, CAUTH-06, CAUTH-07, TEST-03]

# Metrics
duration: 12min
completed: 2026-02-21
---

# Phase 7 Plan 03: Bearer Token Injection and Sign-out Summary

**Silent token acquisition injected into all API calls via useChatApi hook, with sign-out button in chat header — completing the MSAL auth loop for Entra External ID**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-21T07:27:23Z
- **Completed:** 2026-02-21T07:39:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- All three chat API endpoints (`/api/chat/start`, `/api/chat/send`, `/api/chat/card-action`) now include `Authorization: Bearer <token>` headers on every request (CAUTH-05)
- Silent token acquisition (`acquireTokenSilent`) with `loginRedirect` fallback wired into ChatShell — tokens refresh mid-conversation without UI disruption (CAUTH-04, CAUTH-07)
- Sign-out button added to chat header; clicking calls `logoutRedirect` to clear MSAL cache and return to sign-in page (CAUTH-06)
- `npm run build`, `npm test`, and `npm run lint` all pass — only 3 pre-existing lint errors remain (TEST-03)

## Task Commits

1. **Task 1: Add Bearer token parameter to all chatApi.ts fetch wrappers** - `a0f1482` (feat)
2. **Task 2: Add token acquisition, token forwarding, and sign-out to ChatShell** - `949fabb` (feat)
3. **Task 3: Fix lint regression (invalid eslint-disable comment)** - `e265ccc` (fix)

**Plan metadata:** _(final docs commit — see below)_

## Files Created/Modified

- `client/src/api/chatApi.ts` — Added `token: string` param to `startConversation`, `sendMessage`, `sendCardAction`; inject `Authorization: Bearer ${token}` header in each fetch call
- `client/src/hooks/useChatApi.ts` — Changed signature to `useChatApi({ getToken })`, calls `getToken()` before each API request; mount `useEffect` uses IIFE async pattern
- `client/src/components/ChatShell.tsx` — Added `useMsal` hook, `useCallback getToken` with `acquireTokenSilent` + `loginRedirect` fallback, `handleSignOut` with `logoutRedirect`, sign-out button in `.chatHeader` flex container
- `client/src/components/chat.css` — Added `.chatHeader`, `.signOutButton`, `.signOutButton:hover`, `.signOutButton:focus-visible`; updated `.themeToggle` from `position: absolute` to `position: static` (now flows in flex header)

## Decisions Made

- **Token-as-parameter pattern:** `chatApi` functions accept `token: string` — token acquisition stays in the UI layer (ChatShell), not embedded in the API module. Keeps chatApi pure and testable.
- **getToken injection into useChatApi:** Using a config object `{ getToken }` instead of positional args — avoids brittleness and keeps the hook's dependency explicit and mockable.
- **Empty dep array on mount useEffect:** Intentional — including `getToken` in the dep array would cause re-mount (and re-start conversation) on every render where `accounts` changes during MSAL init. Comment documents the intent.
- **Removed eslint-disable comment for `react-hooks/exhaustive-deps`:** The `@react-eslint` plugin is not installed in this project. Adding a disable comment for an unknown rule caused ESLint to report a new error (`Definition for rule not found`). Plain comment explaining intent is the correct approach here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed lint-triggering eslint-disable-next-line comment**
- **Found during:** Task 3 (CI verification — `npm run lint`)
- **Issue:** Added `// eslint-disable-next-line react-hooks/exhaustive-deps` in `useChatApi.ts` to document the intentional empty dep array. But `@react-eslint` plugin is not installed, so ESLint reported `Definition for rule 'react-hooks/exhaustive-deps' was not found` — a new lint error.
- **Fix:** Replaced the eslint-disable comment with a plain explanatory comment documenting why the empty dep array is intentional.
- **Files modified:** `client/src/hooks/useChatApi.ts`
- **Verification:** `npm run lint` now shows only 3 pre-existing errors (AdaptiveCardMessage, ChatInput) — no new errors.
- **Committed in:** `e265ccc` (separate fix commit within Task 3)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Minor. The disable comment pattern was incorrect for this project's ESLint configuration. Plain comment is equivalent and avoids the error.

## Issues Encountered

None beyond the eslint-disable deviation above, which was self-contained and resolved within the same task.

## User Setup Required

**External services require manual configuration.** Azure App Registration must be configured before the auth flow will work end-to-end:

- `VITE_AZURE_CLIENT_ID` — Azure Portal > App Registrations > your client SPA app > Overview > Application (client) ID
- `VITE_AZURE_TENANT_NAME` — Azure Portal > your Entra External ID tenant > Overview > Tenant name (e.g. 'contoso' from contoso.ciamlogin.com)
- `VITE_AZURE_REDIRECT_URI` — http://localhost:5173 for dev (must be registered in Azure Portal > App Registration > Authentication > Single-page application redirect URIs)
- Server app must expose `access_as_user` scope; client app must have permission to that scope

## Next Phase Readiness

Phase 7 (Client MSAL Authentication) is complete. All 8 CAUTH requirements fulfilled:
- CAUTH-01: Unauthenticated users see SignInPage (Phase 7 Plan 02)
- CAUTH-02: Sign-in button triggers loginRedirect (Phase 7 Plan 02)
- CAUTH-03: Post-auth chat is functionally identical to v1.1 (Phase 7 Plans 01-02)
- CAUTH-04: Silent token acquisition with redirect fallback (this plan)
- CAUTH-05: Authorization Bearer header on all API requests (this plan)
- CAUTH-06: Sign-out button in chat header (this plan)
- CAUTH-07: Silent refresh without UI disruption (this plan)
- TEST-03: CI passes with no new failures (this plan)

v1.2 Entra External ID Authentication milestone is complete. No blockers.

---
*Phase: 07-client-msal-authentication*
*Completed: 2026-02-21*
