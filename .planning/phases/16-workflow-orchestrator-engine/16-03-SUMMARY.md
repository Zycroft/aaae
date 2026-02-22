---
phase: 16-workflow-orchestrator-engine
plan: 03
subsystem: server
tags: [orchestrator, workflow, tdd, di, lock, context-enrichment, rollback]

requires:
  - phase: 16
    plan: 01
    provides: WorkflowStateStore, ConversationLock, factory singletons
  - phase: 16
    plan: 02
    provides: WorkflowResponse, ProcessTurnParams, WorkflowDefinition, getStepProgress
provides:
  - WorkflowOrchestrator service class with DI constructor
  - processTurn — full per-turn orchestration loop
  - processCardAction — card submission orchestration
  - startSession — initial state + conversation creation
  - orchestrator singleton pre-wired for Phase 17 route integration
affects: [17-routes]

tech-stack:
  added: []
  patterns: [lock-protected-read-modify-write, rollback-on-failure, action-to-step-mapping]

key-files:
  created:
    - server/src/orchestrator/WorkflowOrchestrator.ts
    - server/src/orchestrator/WorkflowOrchestrator.test.ts
    - server/src/orchestrator/index.ts
  modified:
    - server/src/routes/orchestrate.ts

key-decisions:
  - "ACTION_TO_STEP mapping converts parsed nextAction to workflow definition step IDs"
  - "Data extracted from parsedTurn.data.data (nested data field in structured output)"
  - "processCardAction skips context enrichment — card actions are self-contained"
  - "orchestrate.ts route updated with missing status field for backward compatibility"

patterns-established:
  - "Lock-protected read-modify-write with single save point (rollback-on-failure)"
  - "Action-to-step mapping for workflow progression"
  - "DI constructor with fully mocked test dependencies"

requirements-completed: [ORCH-01, ORCH-02, ORCH-03, ORCH-06]

duration: 4min
completed: 2026-02-22
---

# Phase 16 Plan 03: WorkflowOrchestrator Service Class Summary

**Core per-turn orchestration service with DI constructor, lock-protected state lifecycle, context enrichment, and rollback-on-failure semantics**

## Performance

- **Duration:** 4 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- WorkflowOrchestrator with startSession, processTurn, processCardAction methods
- Full per-turn loop: lock acquire -> state load -> context enrich -> Copilot call -> normalize -> parse -> data merge -> state save -> lock release
- Rollback-on-failure: if any step fails after lock, state is NOT saved (finally block releases lock)
- Context enrichment via buildContextualQuery injects accumulated state into Copilot queries
- Data accumulation: structured output data merged into collectedData across turns
- Action-to-step mapping for workflow progression (ask->gather_info, research->research, etc.)
- Orchestrator singleton exported with pre-wired dependencies for Phase 17 consumption
- 10 new tests (all mocked dependencies), 142 total passing

## Task Commits

1. **Task 1: TDD WorkflowOrchestrator** - `31c3007` (test) + `0a9e650` (feat)
2. **Task 2: Export orchestrator singleton** - `d554d6d` (feat)

## Decisions Made
- ACTION_TO_STEP maps parsed nextAction values to workflow definition step IDs
- Data is extracted from `parsedTurn.data.data` — the nested data field within CopilotStructuredOutput
- processCardAction sends submitData in activity.value (self-contained, no context enrichment)

## Deviations from Plan
- Fixed pre-existing TypeScript error in orchestrate.ts (missing status field from 16-02 schema extension)
- Removed unused uuid import from implementation after lint check

---
*Phase: 16-workflow-orchestrator-engine*
*Completed: 2026-02-22*
