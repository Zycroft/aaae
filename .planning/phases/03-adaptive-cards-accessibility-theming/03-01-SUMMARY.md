---
phase: 03-adaptive-cards-accessibility-theming
plan: "01"
subsystem: server
tags: [server, tdd, vitest, allowlist, express, typescript, security]

requires: []

provides:
  - server/src/allowlist/cardActionAllowlist.ts: Pure validateCardAction() function + AllowlistResult type
  - server/src/allowlist/cardActionAllowlist.test.ts: 8 Vitest unit tests (allowlist RED→GREEN verified)
  - server/src/routes/chat.ts: POST /api/chat/card-action route with allowlist enforcement

affects:
  - Phase 3 Plan 03-04 (client sends to /api/chat/card-action)

tech-stack:
  added: []
  patterns:
    - "Pure validator function extracted for testability — no Express deps in allowlist module"
    - "ALLOWED_ACTION_TYPES and ALLOWED_DOMAINS configurable via env vars"
    - "Subdomain match: hostname === domain || hostname.endsWith('.' + domain)"
    - "validateCardAction called before any Copilot call — fail fast on 403"
    - "CardActionRequestSchema.safeParse for request validation"

key-files:
  created:
    - server/src/allowlist/cardActionAllowlist.ts
    - server/src/allowlist/cardActionAllowlist.test.ts
  modified:
    - server/src/routes/chat.ts

key-decisions:
  - "Action.OpenUrl included in ALLOWED_ACTION_TYPES (alongside Action.Submit) — domain check provides the safety net"
  - "ALLOWED_DOMAINS defaults: copilot.microsoft.com and microsoft.com — env-configurable for deployment"
  - "validateCardAction called before conversationStore.get() — saves DB lookup on rejected requests"
  - "cardId forwarded in activity value for Copilot Studio to correlate submission"

requirements-completed:
  - SERV-04
  - SERV-07
  - SERV-08
  - SERV-12

duration: 2 min
completed: 2026-02-20
---

# Phase 3 Plan 01: Card Action Allowlist + Route (TDD) Summary

**validateCardAction() pure function TDD'd with 8 Vitest tests (RED→GREEN), then POST /api/chat/card-action route wired with allowlist enforcement — returns 403 for disallowed action types and disallowed OpenUrl domains before any Copilot call. All 22 server tests pass, TypeScript clean.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T17:07:16Z
- **Completed:** 2026-02-20T17:08:53Z
- **Tasks:** 2 (TDD task + route wiring task)
- **Files created/modified:** 3

## Accomplishments

- `server/src/allowlist/cardActionAllowlist.ts`: `validateCardAction()` pure function + `AllowlistResult` type
  - ALLOWED_ACTION_TYPES: `['Action.Submit', 'Action.OpenUrl']` (env configurable)
  - ALLOWED_DOMAINS: `['copilot.microsoft.com', 'microsoft.com']` (env configurable)
  - Subdomain matching: `hostname.endsWith('.' + domain)`
  - Returns `{ ok: false, reason: string }` for all failure cases
- `server/src/allowlist/cardActionAllowlist.test.ts`: 8 test cases — allowed submit, disallowed execute, allowed OpenUrl (exact domain), allowed OpenUrl (subdomain), disallowed OpenUrl domain, invalid URL, missing action, non-string action
- `server/src/routes/chat.ts`: `/card-action` route added — validates schema, calls allowlist (403 on reject), looks up conversation, sends cardActivity to Copilot, normalizes and returns messages
- All 22 server tests pass (8 new + 14 normalizer)

## Task Commits

1. **Task 1 RED:** `7db9441` (test) — failing tests for card action allowlist validator
2. **Task 1 GREEN:** `8058fab` (feat) — implement card action allowlist validator
3. **Task 2:** `a34939a` (feat) — add POST /api/chat/card-action route with allowlist enforcement

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `server/src/allowlist/cardActionAllowlist.ts` ✓ exists
- `server/src/allowlist/cardActionAllowlist.test.ts` ✓ exists, 8 tests
- `server/src/routes/chat.ts` ✓ contains `/card-action` route
- `npm test --workspace=server` ✓ exits 0 (22 tests pass)
- `cd server && npx tsc --noEmit` ✓ exits 0
- `git log --oneline --grep="03-01"` ✓ returns 3 commits
