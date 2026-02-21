# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected.
**Current focus:** v1.2 Entra External ID Authentication (MSAL) — Phase 6 (Server JWT Validation)

## Current Position

Phase: 6 of 7 (Server JWT Validation + Org Allowlist)
Plan: Not started
Status: Ready to plan
Last activity: 2026-02-21 — Phase 5 complete (Shared Schema + Config Foundation)

Progress: [████████████████████] 5/5 plans (100% of planned v1.2 plans; Phases 6–7 TBD)

## Performance Metrics

**v1.2 Velocity (in progress):**
- Plans completed: 2 (Phase 5: plans 01, 02)
- Timeline: 2026-02-21

**v1.1 Velocity:**
- Total plans completed: 3 (Phase 4)
- Timeline: 1 day (2026-02-20)
- Requirements: 6/6

**v1.0 Velocity:**
- Total plans completed: 13
- Timeline: 1 day (2026-02-19 → 2026-02-20)
- Files: 91 changed, ~2,341 LOC TypeScript/JS

*Updated after each plan completion*

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- CIAM authority URLs use `ciamlogin.com`, not `login.microsoftonline.com` — affects MSAL config in Phase 7
- MSAL React `InteractionStatus` can cause rendering loops — AuthGuard must handle in-progress states carefully in Phase 7
- AZURE_CLIENT_ID guard fires by default (AUTH_REQUIRED defaults to true) — must explicitly set AUTH_REQUIRED=false for local dev without Azure AD
- ALLOWED_TENANT_IDS parsed to string[] at config load time (not per-request) for efficiency
- AZURE_CLIENT_ID exported as `string | undefined` from config — Phase 6 callers narrow after startup guard ensures it is set
- [Phase 05-01]: oid required in UserClaimsSchema — stable Azure AD object ID always present in Entra External ID tokens
- [Phase 05-01]: email and name optional in UserClaimsSchema — CIAM tokens vary by user flow configuration

### Pending Todos

None.

### Blockers/Concerns

- ESLint missing @react-eslint plugin — pre-existing tech debt, non-blocking
- 3 pre-existing lint errors in AdaptiveCardMessage.tsx and ChatInput.tsx — known debt, non-blocking
- Entra External ID JWKS endpoint format differs from standard Entra ID — confirm discovery URL in Phase 6 planning
- MSAL acquireTokenSilent may need explicit account hint to avoid interaction_required errors in Phase 7

## Session Continuity

Last session: 2026-02-21
Stopped at: Phase 5 complete, ready to plan Phase 6
Resume file: None
