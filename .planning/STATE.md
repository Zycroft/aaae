# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected, authenticated via Entra External ID.
**Current focus:** v1.5 — Phase 17: Route Integration + Compatibility

## Current Position

Phase: 17 of 17 in v1.5 (Route Integration + Compatibility)
Plan: 0 of ? in current phase
Status: Ready to plan
Last activity: 2026-02-22 — Phase 16 complete (3/3 plans, 7/7 requirements, all 142 tests passing)

Progress: [████████████████░░░] 16/17 phases complete (v1.5 in progress)

## Performance Metrics

**v1.5 Velocity (in progress):**
- Plans completed: 6 (Phase 15: 3, Phase 16: 3)
- Timeline: 2026-02-22 (ongoing)
- Requirements: 15/25 fulfilled (Phase 15: 8/8, Phase 16: 7/7)

**v1.4 Velocity (complete):**
- Plans completed: 6 (Phase 11: 2, Phase 12: 2, Phase 13: 1, Phase 14: 1)
- Timeline: 2026-02-21 → 2026-02-22 (1 day)
- Requirements: 26/26 fulfilled

**v1.3b Velocity (complete):**
- Plans completed: 9 (Phase 8: 3, Phase 9: 3, Phase 10: 3)
- Timeline: 2026-02-21 (1 day)
- Requirements: 19/19 fulfilled

**v1.2 Velocity (complete):**
- Plans completed: 7 (Phase 5: 2, Phase 6: 2, Phase 7: 3)
- Requirements: 24/24 fulfilled

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Recent decisions affecting v1.5:
- [v1.3b]: Priority chain extraction (value > entities > text) — reused in Phase 15 parser via extractedPayload
- [v1.4]: Factory pattern for store selection — WorkflowOrchestrator follows same factory pattern
- [v1.4]: isRedisError() name-based detection — carry forward into orchestrator error handling
- [v1.5-P15]: CopilotStructuredOutputSchema all fields optional with .passthrough() for forward compatibility
- [v1.5-P15]: Parser operates on NormalizedMessage[] (post-normalization), not raw Activity[]
- [v1.5-P15]: Context builder default maxLength 2000 chars, configurable preamble template
- [v1.5-P16]: Redis SET NX PX for per-conversation distributed locks with Lua release
- [v1.5-P16]: 10s default lock TTL (2x conservative Copilot P99 latency estimate)
- [v1.5-P16]: WorkflowOrchestrator uses DI constructor for full testability
- [v1.5-P16]: Rollback-on-failure: state only saved at end of successful turn
- [v1.5-P16]: ACTION_TO_STEP mapping for workflow progression (ask->gather_info, etc.)

### Pending Todos

None.

### Blockers/Concerns

- ESLint missing @react-eslint plugin — pre-existing tech debt, non-blocking
- 3 pre-existing lint errors in AdaptiveCardMessage.tsx and ChatInput.tsx — known debt, non-blocking
- Phase 15: COMPLETE — CopilotStructuredOutputSchema format locked, parser + context builder shipped
- Phase 16: COMPLETE — WorkflowOrchestrator service with Redis state, locking, context enrichment

## Session Continuity

Last session: 2026-02-22
Stopped at: Phase 16 verified and complete. Ready for Phase 17 planning.
Resume file: None
Next step: `/gsd:plan-phase 17`
