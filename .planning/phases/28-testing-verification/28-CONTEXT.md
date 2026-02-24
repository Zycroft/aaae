# Phase 28: Testing + Verification - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Full test coverage for both providers and the factory. Audit existing tests from earlier phases (CopilotProvider from Phase 24, OpenAiProvider from Phase 26), fill gaps for provider factory and config validation, create an orchestrator integration test with mocked LlmProvider, and document a manual smoke test checklist. This is the final phase of v1.7 — it closes the milestone.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation decisions are delegated:

- **Test scope** — Audit existing test files from Phases 24-27, identify coverage gaps, and add only what's missing to satisfy TEST-01 through TEST-05. Don't duplicate tests that already exist.
- **Integration test depth** — Claude designs the orchestrator integration test to drive a multi-turn workflow to completion using a mocked LlmProvider, matching the depth specified in the success criteria.
- **Manual smoke test** — Claude decides how to document the manual verification checklist (file, README section, or verification notes). The success criteria require: UI works with LLM_PROVIDER=openai, health endpoint shows provider, switching back to copilot restores behavior.
- **Config validation tests** — Claude adds tests asserting correct fatal errors for each bad-config scenario (wrong provider value, missing key).

**Hard constraints (from ROADMAP.md — non-negotiable):**
1. `npm test` is green with all new and existing tests passing
2. OpenAiProvider unit tests cover message history, structured output parsing, and card action conversion (may already exist from Phase 26)
3. Orchestrator integration test drives multi-turn workflow to completion using mocked LlmProvider
4. Config validation tests assert correct fatal error for each bad-config scenario
5. Manual smoke test confirms: UI works with LLM_PROVIDER=openai, health shows provider, copilot switch restores behavior

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Focus on closing all 5 TEST requirements and ensuring the milestone is shippable.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 28-testing-verification*
*Context gathered: 2026-02-24*
