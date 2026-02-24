# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected, authenticated via Entra External ID.
**Current focus:** v1.7 OpenAI Dev/Demo Backend — Phase 23: LLM Provider Interface + Config

## Current Position

Phase: 23 — LLM Provider Interface + Config
Plan: —
Status: Roadmap created, ready to plan Phase 23
Last activity: 2026-02-23 — v1.7 roadmap created (Phases 23–28)

Progress: ░░░░░░░░░░ 0/6 phases (v1.7)

## Performance Metrics

**v1.6 Velocity (shipped):**
- Plans completed: 9 (Phase 19: 2, Phase 20: 3, Phase 21: 3, Phase 22: 1)
- Timeline: 2026-02-22 (1 day)
- Requirements: 30/30 fulfilled

**v1.5 Velocity (shipped):**
- Plans completed: 11 (Phase 15: 3, Phase 16: 3, Phase 17: 3, Phase 18: 2)
- Timeline: 2026-02-22 (1 day)
- Requirements: 25/25 fulfilled

**v1.4 Velocity (shipped):**
- Plans completed: 6 (Phase 11: 2, Phase 12: 2, Phase 13: 1, Phase 14: 1)
- Timeline: 2026-02-21 → 2026-02-22 (1 day)
- Requirements: 26/26 fulfilled

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

### v1.7 Key Architecture Decisions

- `LlmProvider` interface owns all normalization internally — orchestrator receives `NormalizedMessage[]` only
- `CopilotStudioClient` singleton in `copilot.ts` stays unchanged — `CopilotProvider` wraps it
- OpenAI provider maintains per-conversation history in a `Map<string, ChatMessage[]>` (server memory)
- Provider factory uses dynamic imports for lazy-loading (avoids loading unused SDK at startup)
- `shared/` and `client/` require zero changes — provider abstraction is entirely server-side

### Pending Todos

None.

### Blockers/Concerns

- ESLint missing @react-eslint plugin — pre-existing tech debt, non-blocking
- 3 pre-existing lint errors in AdaptiveCardMessage.tsx and ChatInput.tsx — known debt, non-blocking
- Context builder maxLength 2000 chars default — needs live validation with real Copilot workloads (carried from v1.5)

## Session Continuity

Last session: 2026-02-23
Stopped at: v1.7 roadmap creation complete
Resume file: .planning/ROADMAP.md
Next step: `/gsd:plan-phase 23` — plan Phase 23: LLM Provider Interface + Config
