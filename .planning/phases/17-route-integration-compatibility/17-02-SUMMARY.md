---
phase: 17-route-integration-compatibility
plan: "02"
subsystem: api
tags: [express, orchestrator, workflow, chat-routes, typescript]

# Dependency graph
requires:
  - phase: 17-01
    provides: extended chat response schemas with optional workflowState
  - phase: 16-workflow-orchestrator-engine
    provides: WorkflowOrchestrator singleton exported from orchestrator/index.ts

provides:
  - "Orchestrator-delegating chat routes (/start, /send, /card-action)"
  - "Thin adapter routes: validate -> extract JWT -> delegate to orchestrator -> return extended response"
  - "Backward-compatible workflowState field in all three route responses"

affects:
  - client-chat-api
  - integration-tests
  - route-tests

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thin adapter route pattern: schema validation -> JWT claim extraction -> orchestrator delegation"
    - "Allowlist-before-orchestrator ordering preserved for /card-action 403 contract"
    - "buildContextPrefix inlined into orchestrate.ts when removed from chat.ts (avoid cross-route import)"

key-files:
  created: []
  modified:
    - server/src/routes/chat.ts
    - server/src/routes/orchestrate.ts

key-decisions:
  - "Dropped 404 check on /send — orchestrator.processTurn() handles missing state gracefully by creating initial state (orchestrator is now source of truth)"
  - "workflowContext in SendMessageRequest accepted but ignored — orchestrator enriches from its own WorkflowState (backward compat)"
  - "buildContextPrefix inlined into orchestrate.ts rather than exporting from a shared util — avoids circular dependency and keeps orchestrate.ts self-contained"

patterns-established:
  - "Route handlers are thin adapters: parse -> validate allowlist if needed -> extract req.user claims -> delegate to orchestrator -> return response"
  - "req.user?.oid ?? 'anonymous' and req.user?.tid ?? 'dev' as standard JWT claim extraction pattern"

requirements-completed: [ROUTE-01, ROUTE-02, ROUTE-03, COMPAT-01, COMPAT-02, COMPAT-03]

# Metrics
duration: 5min
completed: 2026-02-22
---

# Phase 17 Plan 02: Route Integration + Compatibility Summary

**chat.ts routes replaced with thin orchestrator adapters: /start calls startSession(), /send calls processTurn(), /card-action validates allowlist then calls processCardAction() — all returning workflowState**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-22T21:43:00Z
- **Completed:** 2026-02-22T21:45:12Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Removed all direct `copilotClient.sendActivityStreaming()` / `startConversationStreaming()` calls from `chat.ts`
- Removed `buildContextPrefix`, `normalizeActivities`, `conversationStore.set()`, `copilotClient` imports from `chat.ts`
- All three routes now delegate to the `orchestrator` singleton from `../orchestrator/index.js`
- `workflowState` included in all three response shapes (backward-compatible optional field from Phase 17-01)
- Allowlist-before-orchestrator ordering preserved on `/card-action` — 403 contract intact
- Inlined `buildContextPrefix` into `orchestrate.ts` to avoid broken import after removal from `chat.ts`
- 147 tests pass, TypeScript 0 errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite chat.ts routes to delegate to orchestrator singleton** - `a238df8` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `server/src/routes/chat.ts` - Replaced direct Copilot calls with orchestrator delegation; removed buildContextPrefix
- `server/src/routes/orchestrate.ts` - Inlined buildContextPrefix (was imported from chat.ts)

## Decisions Made
- Dropped the 404 check for missing conversation in `/send` — orchestrator creates initial state when none exists, so the 404 guard is no longer meaningful. Orchestrator is now the single source of truth for conversation lifecycle.
- `workflowContext` in `SendMessageRequestSchema` is accepted for backward compat but not passed to the orchestrator — the orchestrator reads from its own stored `WorkflowState` for context enrichment.
- `buildContextPrefix` inlined into `orchestrate.ts` rather than creating a shared utils file — `orchestrate.ts` is an older-style route that still uses manual Copilot calls; keeping it self-contained avoids coupling concerns.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed broken import in orchestrate.ts after removing buildContextPrefix from chat.ts**
- **Found during:** Task 1 (Rewrite chat.ts routes)
- **Issue:** `orchestrate.ts` imports `buildContextPrefix` from `./chat.js`. Removing it from `chat.ts` without fixing `orchestrate.ts` would cause a TypeScript error and runtime import failure.
- **Fix:** Inlined `buildContextPrefix` function into `orchestrate.ts` and added `WorkflowContext` type import from shared. The plan explicitly anticipated this: "either inline the function in orchestrate.ts or keep a copy there."
- **Files modified:** `server/src/routes/orchestrate.ts`
- **Verification:** TypeScript 0 errors, 147 tests pass
- **Committed in:** `a238df8` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug / broken import from planned removal)
**Impact on plan:** Required fix — plan explicitly anticipated this dependency and directed inlining. No scope creep.

## Issues Encountered
None beyond the orchestrate.ts import fix documented above.

## Next Phase Readiness
- All three chat routes now delegate to `WorkflowOrchestrator` — Phase 17 route integration complete
- Phase 17 is complete (Plans 01 and 02 done)
- v1.5 milestone reached: WorkflowOrchestrator handles all production traffic

---
*Phase: 17-route-integration-compatibility*
*Completed: 2026-02-22*
