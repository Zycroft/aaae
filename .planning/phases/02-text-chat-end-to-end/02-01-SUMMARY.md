---
phase: 02-text-chat-end-to-end
plan: "01"
subsystem: server
tags: [normalizer, vitest, tdd, activity, typescript]

requires: []

provides:
  - server/src/normalizer/activityNormalizer.ts: normalizeActivities(Activity[]) → NormalizedMessage[] pure function
  - server/src/normalizer/activityNormalizer.test.ts: 14 Vitest tests covering text, card, hybrid, skip cases

affects:
  - Phase 2 Plan 02-02 (POST /api/chat/send imports and calls normalizeActivities)
  - Phase 3 (card normalization already handles attachments, cardId assigned here)

tech-stack:
  added: []
  patterns:
    - "act() helper: cast plain object to Activity via `as unknown as Activity` for test fixtures"
    - "ADAPTIVE_CARD_CONTENT_TYPE constant: 'application/vnd.microsoft.card.adaptive'"
    - "NormalizedMessageSchema.parse() as runtime validation inside normalizer (fail-fast on schema drift)"
    - "Text emitted before cards in hybrid turns (order guaranteed)"
    - "uuidv4() for both message id and cardId"

key-files:
  created:
    - server/src/normalizer/activityNormalizer.ts
    - server/src/normalizer/activityNormalizer.test.ts

key-decisions:
  - "Activity is a class with required properties — test fixtures use `as unknown as Activity` cast via act() helper to avoid TypeScript TS2740 errors without importing class constructor"
  - "Runtime NormalizedMessageSchema.parse() validation inside normalizer ensures output always matches shared schema, catches schema drift early"
  - "Empty string text skipped (text: '') — only non-empty strings produce text messages"
  - "No from.role → defaults to 'user' (conservative assumption)"

requirements-completed:
  - SERV-06
  - SERV-11

duration: 2 min
completed: 2026-02-20
---

# Phase 2 Plan 01: Activity Normalizer (TDD) Summary

**Pure `normalizeActivities()` function built TDD: 14 Vitest tests pass covering text-only, card-only, hybrid turns, and non-message activity skipping. TypeScript compiles clean.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T05:20:26Z
- **Completed:** 2026-02-20T05:22:35Z
- **Tasks:** 1 (TDD feature)
- **Files modified:** 2

## Accomplishments

- `normalizeActivities(activities: Activity[]): NormalizedMessage[]` implemented and exported
- 14 test cases passing: empty input, skip non-message types (typing/endOfConversation/event/trace), text-only bot/user messages, default user role when no from field, empty text skipped, card-only with Adaptive Card, non-Adaptive Card attachments skipped silently, card with no content skipped, hybrid turn (text+card → 2 messages, text first), multiple activities, schema validation (all outputs pass NormalizedMessageSchema.parse()), unique IDs per message
- Runtime NormalizedMessageSchema.parse() validation inside normalizer (fail-fast on schema drift)
- TypeScript compiles clean (used `act()` helper to cast test fixtures to Activity type)

## Task Commits

1. **RED: failing tests** — `cfb8cf0` (test)
2. **GREEN + fix: implementation + test cast helper** — `ae77473` (feat)

## Files Created/Modified

- `server/src/normalizer/activityNormalizer.ts` — Pure normalizer function
- `server/src/normalizer/activityNormalizer.test.ts` — 14 Vitest test cases

## Decisions Made

- **`act()` helper pattern**: Activity is a class (not interface) with 13+ required properties. Test fixtures use `as unknown as Activity` via a local helper to bypass structural type checking. This is test-only — the real implementation receives proper Activity objects from the SDK.
- **Runtime validation**: `NormalizedMessageSchema.parse()` called inside the normalizer as a fail-fast guard. If the shared schema changes and the normalizer output no longer matches, this will throw early rather than producing silent bad data downstream.

## Deviations from Plan

- **[Rule 1 - Bug] TypeScript TS2740 class property errors on test fixtures**: The test file used `Activity[]` type annotation on array literals. `Activity` is a class with ~13 required properties; plain objects don't satisfy this. Fixed by adding the `act()` helper function (`as unknown as Activity` cast) and removing the explicit `Activity[]` type annotations from test arrays. Tests still exercise all intended normalizer behaviors.

**Total deviations:** 1 auto-fixed.
**Impact:** Test file is cleaner; no behavior change.

## Self-Check: PASSED

- `server/src/normalizer/activityNormalizer.ts` ✓ exists
- `server/src/normalizer/activityNormalizer.test.ts` ✓ exists
- `git log --oneline --all --grep="02-01"` returns ≥1 commit ✓
- All 14 tests pass ✓
- TypeScript compiles clean ✓

## Next Phase Readiness

Ready for Plan 02-02: POST /api/chat/send route can import and use `normalizeActivities`.
