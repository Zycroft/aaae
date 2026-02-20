---
phase: 02-text-chat-end-to-end
plan: "03"
subsystem: client
tags: [react, hooks, fetch, retry, useReducer, typescript]

requires:
  - "02-02"

provides:
  - client/src/api/chatApi.ts: startConversation() and sendMessage() fetch wrappers
  - client/src/hooks/useChatApi.ts: useChatApi hook with useReducer state + retry + TranscriptMessage type

affects:
  - Phase 2 Plan 02-04 (ChatShell, ChatInput consume useChatApi)
  - Phase 3 (hook will need cardAction added; same pattern)

tech-stack:
  added: []
  patterns:
    - "useReducer with typed Action union for multi-step async state (not useState)"
    - "fetchWithRetry: MAX_RETRIES=3, BASE_DELAY_MS=200, exponential backoff (200/400/800ms)"
    - "SKELETON_DELAY_MS=300ms setTimeout — clearTimeout on fast response to prevent flicker"
    - "AbortController per send — abortRef holds latest, cleanup on unmount"
    - "crypto.randomUUID() for client-side optimistic message IDs"
    - "Object.assign(new Error(), { status }) pattern to preserve HTTP status in thrown errors"

key-files:
  created:
    - client/src/api/chatApi.ts
    - client/src/hooks/useChatApi.ts
  modified:
    - client/src/main.tsx (fixed pre-existing .tsx extension import error)

key-decisions:
  - "useReducer over useState: multiple async state transitions (optimistic add, loading, success replace, error update) require action-based state to prevent race conditions"
  - "3 retry attempts (MAX_RETRIES=3): Claude's discretion per CONTEXT.md; 3 is the standard for transient server errors"
  - "Smart scroll not implemented yet: done in 02-04 TranscriptView"
  - "sendMessage exposed as `sendMessage` in hook return (renamed from internal `send`) for clarity"

requirements-completed:
  - UI-09

duration: 1 min
completed: 2026-02-20
---

# Phase 2 Plan 03: useChatApi Hook Summary

**`chatApi.ts` fetch wrappers (startConversation, sendMessage) and `useChatApi` hook built: useReducer-based transcript state, optimistic bubbles dispatched before fetch, 300ms skeleton delay, 3-attempt exponential backoff retry (200/400/800ms). TypeScript compiles clean.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-20T05:24:44Z
- **Completed:** 2026-02-20T05:25:52Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `client/src/api/chatApi.ts`: `startConversation(signal?)` and `sendMessage(conversationId, text, signal?)` — no state, no retry, throw on non-ok with status preserved
- `client/src/hooks/useChatApi.ts`: useReducer with 6-action State machine (INIT_CONVERSATION, ADD_OPTIMISTIC_MESSAGE, START_LOADING, SEND_SUCCESS, SEND_ERROR, GLOBAL_ERROR)
- Optimistic user bubble dispatched synchronously before any fetch
- 300ms setTimeout for START_LOADING — clearTimeout on fast response
- fetchWithRetry: 3 attempts, 5xx or network errors trigger retry, AbortError rethrown immediately
- Auto-startConversation on mount via useEffect with AbortController cleanup
- TypeScript compiles clean (fixed pre-existing .tsx extension issue in main.tsx)

## Task Commits

1. **Tasks 1+2: chatApi + useChatApi + main.tsx fix** — `f76e522` (feat)

## Files Created/Modified

- `client/src/api/chatApi.ts` — Raw fetch wrappers
- `client/src/hooks/useChatApi.ts` — Hook with state machine + retry
- `client/src/main.tsx` — Fixed pre-existing `.tsx` extension import

## Deviations from Plan

- **[Rule 1 - Bug] Pre-existing .tsx import in main.tsx**: `import App from './App.tsx'` caused TS5097 error with `moduleResolution: Bundler`. Changed to `import App from './App'`. Zero behavior change — Vite resolves both forms at runtime; this only affects `tsc --noEmit`.

**Total deviations:** 1 auto-fixed.
**Impact:** TypeScript compile now clean; no behavior change.

## Self-Check: PASSED

- `client/src/api/chatApi.ts` ✓ exists with startConversation + sendMessage exports
- `client/src/hooks/useChatApi.ts` ✓ exists with useChatApi + TranscriptMessage exports
- `git log --oneline --all --grep="02-03"` returns ≥1 commit ✓
- `cd client && npx tsc --noEmit` exits 0 ✓

## Next Phase Readiness

Ready for Plan 02-04: ChatShell can consume useChatApi; ChatInput calls sendMessage; TranscriptView renders messages.
