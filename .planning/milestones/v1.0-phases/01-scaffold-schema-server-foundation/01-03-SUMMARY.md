---
phase: 01-scaffold-schema-server-foundation
plan: 03
subsystem: server
tags: [express, typescript, auth, cors, lru-cache, dotenv]

requires: [01-01]

provides:
  - config.ts: validated env config with process.exit(1) on missing required vars
  - middleware/auth.ts: fail-closed auth stub (AUTH_REQUIRED defaults to true)
  - app.ts: createApp() Express factory with CORS + JSON + health + auth middleware
  - index.ts: entry point importing config first
  - store/ConversationStore.ts: interface + StoredConversation type
  - store/InMemoryStore.ts: LRU max=100 implementation
  - store/index.ts: conversationStore singleton

affects:
  - 01-04 (chat route uses createApp(), conversationStore, config)
  - All server routes (auth middleware, CORS are always active)

tech-stack:
  added: []
  patterns:
    - createApp() factory separates app creation from listen (testable)
    - config imported as first import in index.ts (validation at startup)
    - AUTH_REQUIRED !== 'false' pattern (fail-closed — absence = true)
    - ConversationStore interface + InMemoryConversationStore (swap-in production store)
    - LRUCache<string, StoredConversation>({ max: 100 }) for bounded memory

key-files:
  created:
    - server/src/config.ts
    - server/src/middleware/auth.ts
    - server/src/app.ts
    - server/src/store/ConversationStore.ts
    - server/src/store/InMemoryStore.ts
    - server/src/store/index.ts
  modified:
    - server/src/index.ts (replaced placeholder)

key-decisions:
  - "createApp() factory (not direct app export) — enables unit testing routes without starting a listener"
  - "AUTH_REQUIRED defaults to true via !== 'false' — absence of env var is treated as enabled (fail-closed)"
  - "StoredConversation.sdkConversationRef typed as unknown — SDK type only imported server-side, routes cast at point of use"
  - "conversationStore singleton at module level in store/index.ts — routes import singleton, no constructor args"

requirements-completed:
  - SERV-01
  - SERV-05
  - SERV-09
  - SERV-10

duration: 8min
completed: 2026-02-20
---

# Phase 1 Plan 03: Express Server Foundation Summary

**Express server with fail-closed auth middleware, CORS restricted to configured origin, validated env config, and LRU-backed ConversationStore. All verification checks pass.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-20T04:15:00Z
- **Completed:** 2026-02-20T04:23:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Express server starts cleanly and logs port/auth/CORS settings
- `/health` returns `{"status":"ok","authRequired":true}` unauthenticated
- POST to `/api/chat/start` with no auth returns 401 `{"error":"Unauthorized"}`
- With `AUTH_REQUIRED=false`: POST returns 404 (route not found — auth bypassed correctly)
- TypeScript compiles clean (`tsc --noEmit` exits 0)
- ConversationStore LRU implementation created, singleton exported

## Task Commits

1. **Tasks 1+2: Server foundation + ConversationStore** — `f036e33` (feat)

## Files Created/Modified

- `server/src/config.ts` — Env validation with process.exit(1) on missing required vars
- `server/src/middleware/auth.ts` — Fail-closed auth stub with MSAL OBO TODO comments
- `server/src/app.ts` — Express factory: CORS + JSON + health + auth on /api
- `server/src/index.ts` — Entry point (replaced placeholder)
- `server/src/store/ConversationStore.ts` — Interface + StoredConversation type
- `server/src/store/InMemoryStore.ts` — LRUCache implementation (max=100)
- `server/src/store/index.ts` — Singleton export

## Decisions Made

- **createApp() factory:** Separates app creation from `listen()` call, enabling tests to import `createApp()` and test routes without actually binding a port.
- **fail-closed pattern:** `process.env.AUTH_REQUIRED !== 'false'` — any value other than the exact string "false" keeps auth enabled. Absence of the env var = enabled.
- **StoredConversation.sdkConversationRef as unknown:** The SDK's conversation reference type is only available server-side. Typing as `unknown` in the interface lets the store remain SDK-agnostic; routes cast at point of use.

## Deviations from Plan

None. Plan executed exactly as specified.

## Issues Encountered

None.

## User Setup Required

- `server/.env` must exist with at minimum `COPILOT_ENVIRONMENT_ID` and `COPILOT_AGENT_SCHEMA_NAME` set. The `.env` file was created with placeholder values (not committed — excluded by .gitignore).

## Next Phase Readiness

- Plan 01-04 (POST /api/chat/start) can begin immediately: depends on 01-02 (shared schemas) and 01-03 (server foundation) — both now complete.

---
*Phase: 01-scaffold-schema-server-foundation*
*Completed: 2026-02-20*
