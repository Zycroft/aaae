---
phase: 23-llm-provider-interface-config
plan: 01
subsystem: api
tags: [llm-provider, config, openai, copilot, typescript, interface]

# Dependency graph
requires: []
provides:
  - LlmProvider TypeScript interface with startSession, sendMessage, sendCardAction
  - Conditional provider-aware env var validation in server config
  - LLM_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL exported from config
  - Updated .env.example documenting three new env vars
affects:
  - 23-llm-provider-interface-config
  - 24-copilot-provider-implementation
  - 26-openai-provider-implementation

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provider interface pattern: all LLM backends implement LlmProvider, return NormalizedMessage[] only"
    - "Conditional env var validation: validate only the vars required for the active provider"
    - "Provider factory via LLM_PROVIDER env var with default to 'copilot'"

key-files:
  created:
    - server/src/provider/LlmProvider.ts
  modified:
    - server/src/config.ts
    - server/.env.example

key-decisions:
  - "LlmProvider interface methods all return Promise<NormalizedMessage[]> — implementations normalize internally, callers never see raw SDK types"
  - "LLM_PROVIDER defaults to 'copilot' for full backward-compatibility — existing deployments unchanged"
  - "COPILOT_ENVIRONMENT_ID and COPILOT_AGENT_SCHEMA_NAME use ?? '' instead of ! assertion since validation is now conditional"
  - "Invalid LLM_PROVIDER value causes immediate FATAL exit — fail loudly rather than falling through to a wrong provider"

patterns-established:
  - "Provider interface: server/src/provider/LlmProvider.ts — interface only, no implementation"
  - "Conditional config validation: check LLM_PROVIDER first, then validate provider-specific vars"

requirements-completed: [PROV-01, CONF-01, CONF-02, CONF-03]

# Metrics
duration: 2min
completed: 2026-02-24
---

# Phase 23 Plan 01: LLM Provider Interface + Config Summary

**LlmProvider TypeScript interface and provider-conditional env var validation enabling copilot/openai backend switching via LLM_PROVIDER**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-24T03:25:00Z
- **Completed:** 2026-02-24T03:27:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `server/src/provider/LlmProvider.ts` interface with `startSession`, `sendMessage`, `sendCardAction` — all returning `Promise<NormalizedMessage[]>`
- Replaced unconditional `REQUIRED` array in `config.ts` with provider-conditional validation: Copilot vars only when `LLM_PROVIDER=copilot`, OpenAI vars only when `LLM_PROVIDER=openai`
- Added `LLM_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL` exports to the config object
- Documented three new env vars in `server/.env.example` with a new `# --- LLM Provider (Phase 23+) ---` section

## Task Commits

Each task was committed atomically:

1. **Task 1: Create LlmProvider interface** - `c86e40d` (feat)
2. **Task 2: Conditional provider validation in config + .env.example** - `cfa60e2` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `server/src/provider/LlmProvider.ts` - LlmProvider interface defining the contract all LLM backends must implement
- `server/src/config.ts` - Provider-conditional env var validation with LLM_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL exports
- `server/.env.example` - New LLM Provider section documenting LLM_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL

## Decisions Made
- LlmProvider interface methods all return `Promise<NormalizedMessage[]>` — implementations handle normalization internally, callers receive typed messages only
- `LLM_PROVIDER` defaults to `'copilot'` so all existing deployments without the new env var continue to work unchanged
- `COPILOT_ENVIRONMENT_ID` and `COPILOT_AGENT_SCHEMA_NAME` switched from `!` assertion to `?? ''` since conditional validation now guards them
- Invalid `LLM_PROVIDER` values cause immediate `process.exit(1)` with a FATAL log — no silent fallback

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript compiled cleanly on first attempt. All 173 tests (147 server + 26 client) passed without modification.

## User Setup Required

None - no external service configuration required for this plan. Users who want to use `LLM_PROVIDER=openai` will need to set `OPENAI_API_KEY`; this is documented in `.env.example`.

## Next Phase Readiness
- `LlmProvider` interface is ready for Phase 24 (`CopilotProvider`) and Phase 26 (`OpenAiProvider`) to implement
- `config.LLM_PROVIDER` is exported and ready for use by the provider factory (Phase 25)
- Backward-compatible: all existing Copilot paths unchanged, all tests pass

---
*Phase: 23-llm-provider-interface-config*
*Completed: 2026-02-24*
