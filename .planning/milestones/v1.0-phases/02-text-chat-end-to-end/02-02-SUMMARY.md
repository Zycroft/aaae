---
phase: 02-text-chat-end-to-end
plan: "02"
subsystem: server
tags: [express, routes, normalizer, copilot-studio, typescript]

requires:
  - "02-01"

provides:
  - server/src/routes/chat.ts: POST /api/chat/send route added to chatRouter

affects:
  - Phase 2 Plan 02-03 (useChatApi hook calls this endpoint)
  - All Phase 3+ card action routing follows same validate→store→call→normalize→return pattern

tech-stack:
  added: []
  patterns:
    - "SendMessageRequestSchema.safeParse() for request body validation (400 on failure)"
    - "conversationStore.get() lookup before any Copilot call (404 on unknown ID)"
    - "ActivityTypes.Message from @microsoft/agents-activity for building user activity"
    - "copilotClient.sendActivityStreaming(userActivity) with no conversationId arg (singleton pattern)"
    - "normalizeActivities() called on collected activities before returning"
    - "conversationStore.set() to update history after successful response"

key-files:
  modified:
    - server/src/routes/chat.ts

key-decisions:
  - "No conversationId passed to sendActivityStreaming — singleton uses its internally stored ID from last startConversationStreaming call (Phase 2 single-conversation approach, documented)"
  - "Activity cast via `as Activity` — ActivityTypes.Message type is string, minimal object satisfies SDK's runtime check"

requirements-completed:
  - SERV-03

duration: 1 min
completed: 2026-02-20
---

# Phase 2 Plan 02: POST /api/chat/send Summary

**POST /api/chat/send added to chatRouter: validates body with Zod, looks up conversation (404 on miss), calls sendActivityStreaming, normalizes via normalizeActivities(), updates history, returns NormalizedMessage[]. TypeScript clean, all tests pass.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-20T05:23:31Z
- **Completed:** 2026-02-20T05:24:07Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- POST /send handler added to chatRouter (behind existing authMiddleware)
- Request body validated with SendMessageRequestSchema.safeParse() → 400 on failure
- conversationStore.get() → 404 if unknown conversationId
- ActivityTypes.Message activity built and sent via sendActivityStreaming
- normalizeActivities() applied to collected activities
- Conversation history updated in store after each turn
- 502 error handling for Copilot SDK failures
- TypeScript compiles clean, 14 normalizer tests still pass

## Task Commits

1. **Task 1: POST /api/chat/send route** — `ae6d205` (feat)

## Files Modified

- `server/src/routes/chat.ts` — Added POST /send handler (imports: ActivityTypes, SendMessageRequestSchema, normalizeActivities)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `server/src/routes/chat.ts` ✓ modified with POST /send handler
- `git log --oneline --all --grep="02-02"` returns ≥1 commit ✓
- `cd server && npx tsc --noEmit` exits 0 ✓
- `cd server && npm test` exits 0 (14 tests pass) ✓

## Next Phase Readiness

Ready for Plan 02-03: useChatApi hook can now call POST /api/chat/send.
