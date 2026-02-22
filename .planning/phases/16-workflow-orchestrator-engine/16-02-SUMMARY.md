---
phase: 16-workflow-orchestrator-engine
plan: 02
subsystem: server, shared
tags: [types, workflow-definition, schema, zod, config]

requires:
  - phase: 15
    provides: WorkflowState, ParsedTurn, NormalizedMessage, ContextBuilderConfig
provides:
  - WorkflowResponse type with progress + turnMeta
  - WorkflowDefinition and WorkflowStep types
  - DEFAULT_WORKFLOW_DEFINITION constant (5 generic steps)
  - getStepProgress helper for progress computation
  - Extended WorkflowState schema (status, currentPhase, userId, tenantId)
affects: [16-03-orchestrator, 17-routes]

tech-stack:
  added: []
  patterns: [configurable-workflow-definition, progress-computation]

key-files:
  created:
    - server/src/orchestrator/types.ts
    - server/src/workflow/workflowDefinition.ts
  modified:
    - shared/src/schemas/workflowState.ts

key-decisions:
  - "WorkflowProgress uses stepIndex/totalSteps for percentage, not arbitrary weights"
  - "All new WorkflowState fields optional or defaulted for backward compatibility"
  - "Default workflow has 5 generic steps: initial, gather_info, research, confirm, complete"

patterns-established:
  - "Config-based workflow definitions (not embedded in state)"
  - "Progress computation from step index position"

requirements-completed: [ORCH-04]

duration: 2min
completed: 2026-02-22
---

# Phase 16 Plan 02: Orchestrator Types + Workflow Definitions Summary

**WorkflowResponse type, workflow step definitions, and extended WorkflowState schema**

## Performance

- **Duration:** 2 min
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- WorkflowResponse type with messages, parsedTurn, workflowState, progress, turnMeta, latencyMs
- WorkflowDefinition with default 5-step workflow and getStepProgress helper
- ProcessTurnParams and ProcessCardActionParams for orchestrator input
- WorkflowState extended with status, currentPhase, userId, tenantId (backward compatible)

## Task Commits

1. **Tasks 1+2: Types and workflow definition** - `ccad1d4` (feat)
2. **Task 3: WorkflowState schema extension** - `7a38aed` (feat)

## Decisions Made
- Progress percentage computed from step index / total steps (simple, predictable)
- All new WorkflowState fields optional or defaulted — existing stored states parse without error

## Deviations from Plan
- None

---
*Phase: 16-workflow-orchestrator-engine*
*Completed: 2026-02-22*
