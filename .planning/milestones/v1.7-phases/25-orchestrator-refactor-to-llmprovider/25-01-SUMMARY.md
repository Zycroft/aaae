---
phase: 25-orchestrator-refactor-to-llmprovider
plan: 01
subsystem: api
tags: [llm-provider, dependency-inversion, typescript, refactor, orchestrator]

# Dependency graph
requires:
  - phase: 24-copilotprovider-extraction
    provides: CopilotProvider class implementing LlmProvider interface
provides:
  - WorkflowOrchestrator accepting LlmProvider instead of CopilotStudioClient
  - Singleton wiring via CopilotProvider(copilotClient) in index.ts
  - Test files mocking LlmProvider instead of Copilot SDK types
affects:
  - 26-openai-provider-implementation
  - 27-provider-factory-auth-polish
  - 28-testing-verification

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dependency inversion: WorkflowOrchestrator depends on LlmProvider interface, not concrete SDK"
    - "Provider delegation: orchestrator calls llmProvider.sendMessage/sendCardAction/startSession"

key-files:
  created: []
  modified:
    - server/src/orchestrator/WorkflowOrchestrator.ts
    - server/src/orchestrator/index.ts
    - server/src/orchestrator/WorkflowOrchestrator.test.ts
    - server/src/orchestrator/WorkflowOrchestrator.integration.test.ts

key-decisions:
  - "processCardAction passes { ...submitData, cardId } to sendCardAction — userSummary not forwarded since CopilotProvider uses empty text for card actions"
  - "Test helper textMessage() creates NormalizedMessage with deterministic IDs (padded counter) — avoids uuid dependency in tests"
  - "greetingMessages stored as sdkConversationRef in conversation store — NormalizedMessage[] is compatible with unknown[] store type"

patterns-established:
  - "LlmProvider mock pattern: { startSession, sendMessage, sendCardAction } with vi.fn() returning NormalizedMessage[]"
  - "Structured test data: textMessage(text, structuredData?) sets extractedPayload directly instead of relying on normalizer"

requirements-completed: [PROV-03, COMPAT-01]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 25 Plan 01: Orchestrator Refactor to LlmProvider Summary

**WorkflowOrchestrator refactored to accept LlmProvider interface — zero Copilot SDK imports, all 201 tests pass**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-24T04:00:00Z
- **Completed:** 2026-02-24T04:05:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Removed all `@microsoft/agents-copilotstudio-client` and `@microsoft/agents-activity` imports from WorkflowOrchestrator.ts
- Replaced direct SDK calls (Activity streaming, normalizeActivities) with LlmProvider.startSession/sendMessage/sendCardAction delegation
- Updated index.ts singleton wiring: `new CopilotProvider(copilotClient)` passed as LlmProvider to orchestrator
- Updated both test files to mock LlmProvider instead of CopilotStudioClient — all 201 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor WorkflowOrchestrator to use LlmProvider** - `2e74b45` (feat)
2. **Task 2: Update test files to mock LlmProvider** - `03fbc72` (test)

## Files Created/Modified
- `server/src/orchestrator/WorkflowOrchestrator.ts` - Constructor accepts LlmProvider, all methods delegate to provider interface
- `server/src/orchestrator/index.ts` - Creates CopilotProvider(copilotClient) and passes as llmProvider
- `server/src/orchestrator/WorkflowOrchestrator.test.ts` - Mocks LlmProvider instead of CopilotStudioClient, uses textMessage() helper
- `server/src/orchestrator/WorkflowOrchestrator.integration.test.ts` - Same mock pattern update for multi-turn integration tests

## Decisions Made
- `processCardAction` passes `{ ...submitData, cardId }` directly to `llmProvider.sendCardAction` — the `userSummary` parameter is not forwarded because `CopilotProvider.sendCardAction` uses empty text by design (card actions carry their payload in the value field)
- Test helper `textMessage()` uses deterministic padded-counter IDs instead of `uuid` — simpler, no external dependency
- `greetingMessages` from `llmProvider.startSession()` stored as `sdkConversationRef` in the conversation store record — maintains backward compatibility with existing store shape

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript compiled cleanly. All 201 tests passed (151 pre-existing server + shared tests + 4 CopilotProvider tests, all green).

## User Setup Required

None - no external service configuration required for this plan.

## Next Phase Readiness
- WorkflowOrchestrator is now backend-agnostic via LlmProvider interface
- Phase 26 (OpenAI Provider) can implement LlmProvider and plug into the orchestrator without touching orchestrator code
- Phase 27 (Provider Factory) can select between CopilotProvider and OpenAiProvider at startup

---
*Phase: 25-orchestrator-refactor-to-llmprovider*
*Completed: 2026-02-24*
