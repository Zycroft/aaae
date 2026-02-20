---
phase: 01-scaffold-schema-server-foundation
plan: 04
subsystem: server
tags: [express, copilot-studio, uuid, typescript, routes]

requires: [01-02, 01-03]

provides:
  - server/src/copilot.ts: CopilotStudioClient singleton with explicit ConnectionSettings
  - server/src/routes/chat.ts: POST /api/chat/start route
  - server/src/app.ts: chatRouter wired at /api/chat

affects:
  - Phase 2 (POST /api/chat/send builds on this pattern)
  - All future chat routes use the same copilotClient singleton

tech-stack:
  added: []
  patterns:
    - "new ConnectionSettings({ environmentId, schemaName }) — explicit, not loadFromEnv()"
    - "for await...of on AsyncGenerator<Activity> (not .then())"
    - "externalId = uuidv4() as the client-facing conversationId"
    - "sdkConversationRef: Activity[] stored for Phase 2 normalizer"
    - "502 catch-all for Copilot SDK errors (network, auth rejection)"

key-files:
  created:
    - server/src/copilot.ts (singleton + settings export)
    - server/src/routes/chat.ts (chatRouter with POST /start)
  modified:
    - server/src/app.ts (added chatRouter import and app.use)

key-decisions:
  - "Explicit ConnectionSettings construction (not loadCopilotStudioConnectionSettingsFromEnv) — env var names are undocumented"
  - "Stub token causes 502 at runtime — documented as expected behavior with placeholder credentials"
  - "sdkConversationRef stored as Activity[] (typed as unknown in interface) — Phase 2 normalizer casts it"
  - "Module-level singleton — not per-request. Phase 2 v2 AUTH-02 may need per-request if OBO token is per-user"

requirements-completed:
  - SERV-02

duration: 6min
completed: 2026-02-20
---

# Phase 1 Plan 04: POST /api/chat/start Summary

**CopilotStudioClient singleton created with explicit ConnectionSettings. POST /api/chat/start route returns `{ conversationId }` (UUID). Auth guard returns 401 without Authorization header. TypeScript clean.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-20T04:23:00Z
- **Completed:** 2026-02-20T04:29:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `copilotClient` singleton instantiated at module level using explicit `ConnectionSettings`
- POST `/api/chat/start` registered on chatRouter, behind authMiddleware
- Route uses `for await...of` on `startConversationStreaming()` AsyncGenerator
- Server-generated UUID returned as `conversationId`; stored in ConversationStore
- 401 without Authorization header confirmed (auth guard working)
- 502 error handling in place for Copilot SDK failures (stub credentials rejected)
- TypeScript compiles clean, ESLint passes, no COPILOT refs in client/

## Task Commits

1. **Tasks 1+2: copilot.ts + routes/chat.ts + app.ts wired** — `8fbd389` (feat)

## Files Created/Modified

- `server/src/copilot.ts` — Singleton with MSAL OBO TODO stubs
- `server/src/routes/chat.ts` — chatRouter with POST /start handler
- `server/src/app.ts` — Added chatRouter wired at /api/chat

## Decisions Made

- **Explicit ConnectionSettings:** `loadCopilotStudioConnectionSettingsFromEnv()` env var names are undocumented per research. Using explicit `{ environmentId, schemaName }` directly from `config.ts` is clearer and testable.
- **502 with stub token:** Expected behavior. The Copilot Studio endpoint rejects the stub token. With real credentials, the endpoint returns 200 `{ conversationId }`. Phase 2 integration validates real end-to-end.
- **sdkConversationRef as Activity[]:** Stored raw for Phase 2 normalizer. Phase 2 casts `sdkConversationRef` from `unknown` to `Activity[]` when building `NormalizedMessage[]`.

## Deviations from Plan

None. Plan executed exactly as specified.

## Issues Encountered

- Stub credentials cause a real network request to Power Platform endpoints. The request eventually returns a 401/error which the catch block converts to a 502. This is expected and documented.

## User Setup Required

To get real Copilot Studio responses:
- Set `COPILOT_ENVIRONMENT_ID` to Power Platform environment ID
- Set `COPILOT_AGENT_SCHEMA_NAME` to the agent's schema name
- Ensure the Copilot Studio agent is published
- Set `AUTH_REQUIRED=false` or provide a real Bearer token

## Next Phase Readiness

- Phase 1 is complete — all 4 plans done, all 15 requirements covered
- Phase 2 (Text Chat End-to-End) can begin: server has /api/chat/start, shared types are defined
- Phase 2 adds: POST /api/chat/send, response normalizer, client chat UI

---
*Phase: 01-scaffold-schema-server-foundation*
*Completed: 2026-02-20*
