# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected.
**Current focus:** Phase 1 — Scaffold + Schema + Server Foundation

## Current Position

Phase: 1 of 4 (Scaffold + Schema + Server Foundation)
Plan: 3 of 4 in current phase (01-01, 01-02, 01-03 complete; 01-04 Wave 3 next)
Status: Executing — Wave 3
Last activity: 2026-02-20 — Plans 01-02 (schemas) + 01-03 (server foundation) complete

Progress: [███░░░░░░░] 19% (3/4 plans in phase 1; 3/16 total plans est.)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 9 min
- Total execution time: 0.46 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 1 | 3/4 | 28 min | 9 min |

**Recent Trend:**
- Last 5 plans: 01-01 (15 min), 01-02 (5 min), 01-03 (8 min)
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-phase]: Monorepo with npm workspaces — shared types without a separate publish step
- [Pre-phase]: Zod declared in `shared/` only — prevents dual-instance hoisting (verified via `npm ls zod`)
- [Pre-phase]: Custom `useRef`/`useEffect` Adaptive Cards wrapper — `adaptivecards-react` abandoned for React 18
- [Pre-phase]: Auth stub must be fail-closed (`AUTH_REQUIRED=true` default; bypass only via explicit env var with `NODE_ENV !== 'production'` guard)

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Verify `CopilotStudioConnectionSettings` fields (`directConnectUrl` vs named-settings branching) against actual Copilot Studio environment before implementing the stub — wrong config produces cryptic errors
- [Phase 1]: Confirm whether `CopilotStudioClient` v1.2.3 handles DirectLine token refresh internally or requires explicit refresh call (30-min expiry)
- [Phase 3]: `adaptivecards` v3 `render()` API and `onExecuteAction` callback signature should be verified against current npm package — community examples reference the abandoned React wrapper and may be outdated

## Session Continuity

Last session: 2026-02-20
Stopped at: Plans 01-02 (schemas, 6bdb9f7) + 01-03 (server, f036e33) complete; Wave 3 (01-04 chat/start) next
Resume file: None
