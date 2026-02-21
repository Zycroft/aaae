---
phase: 08-sdk-capability-audit-structured-extraction
plan: 02
subsystem: api
tags: [normalizer, structured-extraction, tdd, copilot-studio-sdk]

requires:
  - phase: 08-sdk-capability-audit-structured-extraction
    plan: 01
    provides: ExtractedPayloadSchema and ExtractedPayload type in shared/
provides:
  - extractStructuredPayload helper extracting from value/entities/text
  - 20 new extraction tests (value, entities, text, cross-cutting)
  - NormalizedMessage.extractedPayload populated when extraction succeeds
affects: [09, 10]

tech-stack:
  added: []
  patterns: [priority-chain-extraction, confidence-based-sourcing]

key-files:
  created: []
  modified:
    - server/src/normalizer/activityNormalizer.ts
    - server/src/normalizer/activityNormalizer.test.ts

key-decisions:
  - "Extraction priority: value > entities > text — first match wins, no redundant extraction"
  - "Entity type key omitted from merged data to avoid noise — only useful fields extracted"
  - "Text JSON parse only for bot (assistant) messages — user messages never have extraction"
  - "Code fence regex handles both ```json and plain ``` fences"

patterns-established:
  - "Priority chain extraction: check sources in confidence order, return first match"
  - "Activity field access via (activity as Record<string, unknown>) for SDK type safety"

requirements-completed: [SOUT-01, SOUT-02, SOUT-03, SOUT-05, SOUT-06]

duration: 5min
completed: 2026-02-21
---

# Plan 08-02: Normalizer Structured Extraction Summary

**extractStructuredPayload helper extracting from activity.value (high), entities (medium), and bot text JSON (low) with TDD**

## Performance

- **Duration:** 5 min
- **Tasks:** 1 (TDD: RED -> GREEN -> REFACTOR)
- **Files modified:** 2
- **Tests:** 54 total (14 existing + 20 new extraction + 20 negative/edge cases)

## Accomplishments
- Implemented extractStructuredPayload with three-surface priority chain extraction
- All 14 pre-existing normalizer tests continue passing (SOUT-06)
- 20 new tests covering all extraction surfaces, edge cases, and cross-cutting concerns
- NormalizedMessage.extractedPayload is populated when extraction succeeds (SOUT-05)
- Hybrid turns carry the same extractedPayload on both text and card messages

## Task Commits

TDD cycle:

1. **RED: Extraction tests** - `c4ddd50` (test) — 9 failing + 11 passing new tests
2. **GREEN: extractStructuredPayload** - `56e5115` (feat) — all 54 tests pass

## Files Created/Modified
- `server/src/normalizer/activityNormalizer.ts` - Added extractStructuredPayload, isPlainObject, tryParseJsonFromText helpers
- `server/src/normalizer/activityNormalizer.test.ts` - 20 new test cases across 4 describe blocks

## Decisions Made
- Extraction priority: value > entities > text (highest confidence first)
- Entity `type` key omitted from merged data to reduce noise
- Text JSON parse restricted to bot messages only (user messages never extracted from text)
- Used `(activity as Record<string, unknown>)` for accessing value/entities since Activity class types may not include them

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Next Phase Readiness
- Normalizer now populates extractedPayload on all NormalizedMessage objects when structured data is found
- Phase 9 (context injection) and Phase 10 (evaluation) can build on this extraction engine

---
*Phase: 08-sdk-capability-audit-structured-extraction*
*Completed: 2026-02-21*
