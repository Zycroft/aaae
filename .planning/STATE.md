# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected.
**Current focus:** v1.2 Entra External ID Authentication (MSAL) — Phase 7 (Client MSAL Authentication)

## Current Position

Phase: 7 of 7 (Client MSAL Authentication)
Plan: Not started
Status: Ready to plan
Last activity: 2026-02-21 — Phase 6 complete (Server JWT Validation + Org Allowlist)

Progress: [████████████████████] 4/4 v1.2 plans complete (Phases 5-6); Phase 7 TBD

## Performance Metrics

**v1.2 Velocity (in progress):**
- Plans completed: 4 (Phase 5: plans 01, 02; Phase 6: plans 01, 02)
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
- [Phase 06-01]: jose v6 moves JWTExpired/JWTClaimValidationFailed under errors.* namespace — import { errors } from 'jose' and destructure
- [Phase 06-01]: createRemoteJWKSet called once at module load; jose handles JWKS caching and key rotation internally
- [Phase 06-01]: JWTClaimValidationFailed.claim inspected to distinguish audience_mismatch vs issuer_mismatch error codes
- [Phase 06-01]: Entra External ID JWKS endpoint confirmed — ciamlogin.com/.../discovery/v2.0/keys (blocker resolved)
- [Phase 06-02]: orgAllowlist is synchronous — Array.includes on in-memory string[] needs no async/await
- [Phase 06-02]: No WWW-Authenticate header on 403 — only 401 uses that per RFC 6750
- [Phase 06-02]: Denial logs include tid (tenant identifier, not PII) only — email/name never logged

### Pending Todos

None.

### Blockers/Concerns

- ESLint missing @react-eslint plugin — pre-existing tech debt, non-blocking
- 3 pre-existing lint errors in AdaptiveCardMessage.tsx and ChatInput.tsx — known debt, non-blocking
- MSAL acquireTokenSilent may need explicit account hint to avoid interaction_required errors in Phase 7

## Session Continuity

Last session: 2026-02-21
Stopped at: Phase 6 complete, ready to plan Phase 7
Resume file: None
