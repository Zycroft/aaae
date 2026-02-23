---
phase: 19-workflowstate-schema-client-state-foundation
plan: 02
subsystem: ui
tags: [react, hooks, useReducer, workflow-state, typescript]

requires:
  - phase: 19-workflowstate-schema-client-state-foundation
    provides: Extended WorkflowStateSchema with progress, suggestedInputType, choices
provides:
  - chatApi.ts return types with optional workflowState on all three API functions
  - useChatApi hook exposing reactive workflowState (WorkflowState | null) and resetConversation()
  - SET_WORKFLOW_STATE reducer action dispatched on every API response containing workflowState
affects: [20-progress-bar, 21-input-mode-selector, 22-integration]

tech-stack:
  added: []
  patterns: [conditional dispatch pattern for optional response fields, resetConversation via reducer]

key-files:
  created: []
  modified:
    - client/src/api/chatApi.ts
    - client/src/hooks/useChatApi.ts

key-decisions:
  - "SET_WORKFLOW_STATE dispatched AFTER SEND_SUCCESS/CARD_ACTION_SUCCESS for atomic message-first update"
  - "Guard pattern: only dispatch when data.workflowState exists — null stays null for COMPAT-01"
  - "RESET_CONVERSATION returns to initialState spread — ensures all future state additions are also cleared"

patterns-established:
  - "Conditional workflow dispatch: if (data.workflowState) dispatch after success actions"
  - "resetConversation pattern: single dispatch returning to initialState"

requirements-completed: [STATE-01, STATE-02, STATE-03, COMPAT-01, COMPAT-02]

duration: 4min
completed: 2026-02-22
---

# Plan 19-02: Client State Wiring Summary

**chatApi return types updated + useChatApi extended with reactive workflowState and resetConversation -- full pipeline from API response to hook consumer**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-22T18:20:00Z
- **Completed:** 2026-02-22T18:24:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- All three chatApi functions now include optional workflowState in return types
- useChatApi reducer tracks workflowState (WorkflowState | null) with SET_WORKFLOW_STATE action
- workflowState dispatched conditionally on every send/cardAction/init response (COMPAT-01: stays null when absent)
- resetConversation() clears all state back to initial including workflowState
- Zero TypeScript errors, no hardcoded phase/step strings (COMPAT-02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update chatApi.ts return types** - `a4fb34f` (feat)
2. **Task 2: Extend useChatApi with workflowState + resetConversation** - `57658f7` (feat)

## Files Created/Modified
- `client/src/api/chatApi.ts` - Added WorkflowState import, optional workflowState in all 3 return types
- `client/src/hooks/useChatApi.ts` - Added WorkflowState to State, SET_WORKFLOW_STATE + RESET_CONVERSATION actions, conditional dispatch, resetConversation function, exposed in return value

## Decisions Made
- Dispatch SET_WORKFLOW_STATE after (not inside) success actions for atomic message-first updates
- Guard with if (data.workflowState) rather than always dispatching -- keeps null semantics clean
- RESET_CONVERSATION uses spread of initialState so future state additions are automatically cleared

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness
- Consumers can now read workflowState from useChatApi for dynamic UI rendering
- Phase 20 can build ProgressBar component consuming workflowState.progress
- Phase 21 can build InputModeSelector consuming workflowState.suggestedInputType + choices
- resetConversation() available for new-conversation button implementation

---
*Phase: 19-workflowstate-schema-client-state-foundation*
*Completed: 2026-02-22*
