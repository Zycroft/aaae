---
phase: 26-openai-provider-implementation
plan: 01
subsystem: api
tags: [openai, llm-provider, structured-output, chat-completions, typescript]

# Dependency graph
requires:
  - phase: 25-orchestrator-refactor-to-llmprovider
    provides: LlmProvider interface and WorkflowOrchestrator accepting any LlmProvider
provides:
  - OpenAiProvider class implementing LlmProvider via OpenAI chat completions API
  - Per-conversation history management in server memory
  - Structured output (json_schema) producing extractedPayload compatible with existing parser
  - Card action to text conversion for Copilot-agnostic processing
affects:
  - 27-provider-factory-auth-polish
  - 28-testing-verification

# Tech tracking
tech-stack:
  added: [openai]
  patterns:
    - "Structured output via response_format json_schema — ensures every OpenAI response matches CopilotStructuredOutputSchema"
    - "extractedPayload source:'value' confidence:'high' for json_schema responses — same trust level as Copilot SDK activity.value"
    - "Card action text conversion: [Card Action] User submitted: key1: value1, key2: value2"
    - "Per-conversation history: Map<string, ChatMessage[]> with system prompt prepended per-call"

key-files:
  created:
    - server/src/provider/OpenAiProvider.ts
    - server/src/provider/OpenAiProvider.test.ts
  modified:
    - server/package.json

key-decisions:
  - "System prompt teaches workflow steps (initial, gather_info, research, confirm, complete) and JSON schema format — contextBuilder preamble provides per-turn state, system prompt provides static instructions"
  - "extractedPayload uses source:'value' and confidence:'high' because OpenAI json_schema mode guarantees valid structured JSON — analogous to Copilot SDK activity.value surface"
  - "sendCardAction converts action payload to text description and delegates to sendMessage — no separate OpenAI call path needed since card actions are Copilot-specific"
  - "Conversation history stores raw JSON content strings from assistant — not parsed objects — for faithful round-tripping to OpenAI"
  - "Mock strategy: module-scope vi.fn() shared between mock factory and test code — avoids vitest hoisting issues with __mockCreate pattern"

patterns-established:
  - "OpenAI mock pattern: module-scope mockCreate = vi.fn() + vi.mock('openai') factory returning { default: class with chat.completions.create: mockCreate }"
  - "mockCompletion() helper: creates OpenAI chat completion response shape from Record<string, unknown>"

requirements-completed: [OAPI-01, OAPI-02, OAPI-03, OAPI-04, OAPI-05, OAPI-06]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 26 Plan 01: OpenAiProvider TDD Summary

**OpenAiProvider implementing LlmProvider via OpenAI chat completions API with structured output, per-conversation history, and card action text conversion**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T20:09:00Z
- **Completed:** 2026-02-24T20:14:00Z
- **Tasks:** 2 (RED + GREEN, REFACTOR skipped — code clean)
- **Files modified:** 3

## Accomplishments
- OpenAiProvider implements all three LlmProvider methods (startSession, sendMessage, sendCardAction)
- Structured output via response_format json_schema produces extractedPayload matching CopilotStructuredOutputSchema
- Per-conversation history accumulates across turns for multi-turn context
- Card action submit payloads converted to text descriptions and processed through sendMessage
- 12 unit tests with mocked OpenAI SDK — all passing
- All 163 server tests pass (zero regressions)

## Task Commits

TDD plan with RED -> GREEN cycle:

1. **RED: Failing tests** - `7701de1` (test)
   - 12 test cases covering all 6 OAPI requirements
   - Installed openai SDK dependency
2. **GREEN: Implementation** - `452fda8` (feat)
   - OpenAiProvider class with system prompt, history management, structured output
   - All 12 tests pass, full server suite green

**REFACTOR:** Skipped — implementation already clean and well-structured.

## Files Created/Modified
- `server/src/provider/OpenAiProvider.ts` — OpenAI-backed LlmProvider implementation (235 lines)
- `server/src/provider/OpenAiProvider.test.ts` — Unit tests with mocked OpenAI SDK (12 tests)
- `server/package.json` — Added openai dependency

## Decisions Made
- System prompt designed as static instructions about workflow steps and JSON format — per-turn state injected by contextBuilder preamble already in user messages
- extractedPayload uses source:'value' confidence:'high' since json_schema mode guarantees valid structured output
- sendCardAction delegates to sendMessage with text conversion — simplest correct approach for Copilot-agnostic processing
- History stores raw JSON content strings for faithful OpenAI round-tripping

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed OpenAI mock pattern for vitest hoisting**
- **Found during:** GREEN phase (tests failing with "Cannot read properties of undefined")
- **Issue:** Original `__mockCreate` export pattern doesn't work with vitest module hoisting — mock factory runs before variable assignment
- **Fix:** Moved `mockCreate = vi.fn()` to module scope before `vi.mock()` — shared reference between factory and tests
- **Files modified:** server/src/provider/OpenAiProvider.test.ts
- **Verification:** All 12 tests pass
- **Committed in:** 452fda8 (GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Mock pattern fix was necessary for tests to function. No scope creep.

## Issues Encountered
None — TDD cycle completed smoothly after mock pattern fix.

## User Setup Required
None - no external service configuration required. The openai SDK is installed but the API key is injected at runtime via OPENAI_API_KEY env var (already configured in Phase 23).

## Next Phase Readiness
- OpenAiProvider ready for factory wiring in Phase 27
- Provider factory will instantiate OpenAiProvider with config.OPENAI_API_KEY and config.OPENAI_MODEL
- Health endpoint can report provider name and model from factory

---
*Phase: 26-openai-provider-implementation*
*Completed: 2026-02-24*
