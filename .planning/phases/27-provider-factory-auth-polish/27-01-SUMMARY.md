---
phase: 27-provider-factory-auth-polish
plan: 01
subsystem: api
tags: [provider-factory, dynamic-import, lazy-loading, health-endpoint, config]

# Dependency graph
requires:
  - phase: 26-openai-provider-implementation
    provides: OpenAiProvider class implementing LlmProvider via OpenAI chat completions API
  - phase: 25-orchestrator-refactor-to-llmprovider
    provides: WorkflowOrchestrator accepting LlmProvider interface
provides:
  - Config-driven provider factory with dynamic imports (createProvider, getProviderInfo)
  - Async orchestrator initialization via initOrchestrator()
  - Health endpoint reporting active provider and model
  - Lazy-loading of provider SDKs (Copilot SDK not loaded when LLM_PROVIDER=openai)
affects:
  - 28-testing-verification

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provider factory pattern: dynamic import() for lazy-loading, only selected SDK loaded at runtime"
    - "Async server init: initOrchestrator() before app.listen(), wrapped in main().catch()"
    - "Deferred singleton: getOrchestrator() accessor instead of module-level export"

key-files:
  created:
    - server/src/provider/providerFactory.ts
  modified:
    - server/src/orchestrator/index.ts
    - server/src/routes/chat.ts
    - server/src/app.ts
    - server/src/index.ts

key-decisions:
  - "Provider factory uses dynamic import() for both paths — ensures no top-level SDK imports at module scope"
  - "getOrchestrator() throws if called before init — fail-fast prevents silent null reference"
  - "Health endpoint getProviderInfo() is synchronous (reads config, not SDK) — no async needed for health checks"
  - "routes/orchestrate.ts left as-is (legacy Copilot-only endpoint) — will be addressed in Phase 28 test coverage"

patterns-established:
  - "Provider factory: server/src/provider/providerFactory.ts — createProvider() for async LLM init, getProviderInfo() for metadata"
  - "Deferred singleton: initOrchestrator() + getOrchestrator() pattern for async-initialized singletons"

requirements-completed: [PROV-04, PROV-05, CONF-04, CONF-05, COMPAT-02]

# Metrics
duration: 2min
completed: 2026-02-24
---

# Phase 27 Plan 01: Provider Factory + Auth Polish Summary

**Config-driven provider factory with dynamic imports for lazy SDK loading, async orchestrator init, and health endpoint reporting active provider and model**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-24T04:30:45Z
- **Completed:** 2026-02-24T04:32:57Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created provider factory (`providerFactory.ts`) with `createProvider()` using dynamic `import()` to lazy-load only the selected provider's SDK
- Refactored orchestrator initialization from synchronous singleton to async `initOrchestrator()` + `getOrchestrator()` pattern
- Enhanced health endpoint (`GET /health`) with `provider` and `model` fields showing active backend
- Updated server startup to async `main()` pattern with error handling
- All 163 server tests pass, zero changes to shared/ or client/

## Task Commits

Each task was committed atomically:

1. **Task 1: Create provider factory with dynamic imports** - `d079db8` (feat)
2. **Task 2: Refactor orchestrator to factory + enhance health endpoint** - `049be03` (feat)

## Files Created/Modified
- `server/src/provider/providerFactory.ts` - Provider factory with createProvider() and getProviderInfo()
- `server/src/orchestrator/index.ts` - Async initOrchestrator() + getOrchestrator() replacing hardcoded CopilotProvider
- `server/src/routes/chat.ts` - Routes use getOrchestrator() at request time
- `server/src/app.ts` - Health endpoint includes provider and model fields
- `server/src/index.ts` - Async main() startup with initOrchestrator() before listen()

## Decisions Made
- Provider factory uses dynamic `import()` for both provider paths — no top-level SDK imports at module scope, ensuring lazy-loading
- `getOrchestrator()` throws if called before init — fail-fast approach prevents silent null reference errors
- Health endpoint's `getProviderInfo()` is synchronous (reads config, not SDK) — no async needed for health probes
- `routes/orchestrate.ts` left unchanged — it's a legacy Copilot-only endpoint that directly imports `copilotClient`; Phase 28 will address its test coverage

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript compiled cleanly on first attempt. All 163 server tests passed without modification.

## User Setup Required

None - no external service configuration required for this plan. The 3-env-var dev setup (`LLM_PROVIDER=openai`, `OPENAI_API_KEY`, `AUTH_REQUIRED=false`) is documented in `.env.example` from Phase 23.

## Next Phase Readiness
- Provider factory fully wired — config alone determines backend
- Health endpoint reports active provider for operator observability
- Phase 28 (Testing + Verification) can now add factory unit tests, integration tests, and config validation tests

---
*Phase: 27-provider-factory-auth-polish*
*Completed: 2026-02-24*
