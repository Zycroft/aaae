---
phase: 17-route-integration-compatibility
plan: 01
subsystem: api
tags: [zod, typescript, shared-schemas, workflow-state, backward-compatibility]

# Dependency graph
requires:
  - phase: 16-workflow-orchestrator-engine
    provides: WorkflowStateSchema defined in shared/src/schemas/workflowState.ts
provides:
  - Optional workflowState field in StartConversationResponse, SendMessageResponse, CardActionResponse TypeScript types
  - Backward-compatible schema extensions for all three chat response types
affects:
  - 17-02 (route handlers that emit workflowState in responses)
  - client (consumes updated response types)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional schema field via WorkflowStateSchema.optional() — backward-compatible extension pattern for Zod objects"

key-files:
  created: []
  modified:
    - shared/src/schemas/api.ts

key-decisions:
  - "workflowState added as .optional() (not required) to preserve backward compatibility with v1.4 clients that parse { conversationId, messages } without the field"
  - "OrchestrateResponseSchema left unchanged — it retains required workflowState as designed in Phase 16"

patterns-established:
  - "Schema extension pattern: add WorkflowStateSchema.optional() to response schemas; z.infer propagates to TypeScript types automatically"

requirements-completed: [ROUTE-04]

# Metrics
duration: 1min
completed: 2026-02-22
---

# Phase 17 Plan 01: Extend Chat Response Schemas Summary

**Optional workflowState field added to StartConversationResponse, SendMessageResponse, and CardActionResponse Zod schemas, preserving v1.4 client backward compatibility**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-22T21:40:48Z
- **Completed:** 2026-02-22T21:41:45Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `workflowState: WorkflowStateSchema.optional()` to three chat response schemas in shared/src/schemas/api.ts
- Rebuilt shared package — TypeScript types (StartConversationResponse, SendMessageResponse, CardActionResponse) now include `workflowState?: WorkflowState | undefined`
- OrchestrateResponseSchema unchanged — required workflowState preserved as designed in Phase 16
- Confirmed backward compatibility: v1.4 clients parsing `{ conversationId, messages }` continue to work since field is optional

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend API response schemas with optional workflowState** - `eaa7daf` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `shared/src/schemas/api.ts` - Added `workflowState: WorkflowStateSchema.optional()` to StartConversationResponseSchema, SendMessageResponseSchema, and CardActionResponseSchema

## Decisions Made
- workflowState is `.optional()` not required — route handlers in Plan 02 will include it only when orchestrator is active; v1.4 clients continue to function unchanged
- OrchestrateResponseSchema intentionally not modified — it already has required workflowState from Phase 16 design

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shared schema update complete; Plan 02 route handlers can now type their responses as StartConversationResponse/SendMessageResponse/CardActionResponse and include optional workflowState
- No blockers

---
*Phase: 17-route-integration-compatibility*
*Completed: 2026-02-22*

## Self-Check: PASSED
- FOUND: .planning/phases/17-route-integration-compatibility/17-01-SUMMARY.md
- FOUND: shared/src/schemas/api.ts
- FOUND commit: eaa7daf (feat(17-01): extend chat response schemas with optional workflowState)
