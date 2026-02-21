---
phase: 08-sdk-capability-audit-structured-extraction
plan: 01
subsystem: api
tags: [zod, typescript, schema, extracted-payload]

requires:
  - phase: 07-client-msal-authentication
    provides: NormalizedMessage schema and shared/ barrel exports
provides:
  - ExtractedPayloadSchema Zod schema with source/confidence/data fields
  - NormalizedMessage extended with optional extractedPayload field
  - Barrel exports for ExtractedPayload types from @copilot-chat/shared
affects: [08-02, 09, 10]

tech-stack:
  added: []
  patterns: [optional-schema-extension, confidence-enum]

key-files:
  created:
    - shared/src/schemas/extractedPayload.ts
  modified:
    - shared/src/schemas/message.ts
    - shared/src/index.ts

key-decisions:
  - "ExtractedPayload.data uses z.record with refine to reject empty objects — prevents phantom extractions"
  - "Confidence enum (high/medium/low) maps directly to extraction source priority"

patterns-established:
  - "Optional schema extension: new optional fields on NormalizedMessage without breaking existing consumers"
  - "Confidence enum: source-to-confidence mapping for structured extraction reliability"

requirements-completed: [SOUT-04]

duration: 3min
completed: 2026-02-21
---

# Plan 08-01: ExtractedPayload Schema Summary

**ExtractedPayload Zod schema with source/confidence/data fields, NormalizedMessage extended with optional extractedPayload**

## Performance

- **Duration:** 3 min
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Created ExtractedPayloadSchema with source (value/entities/text), confidence (high/medium/low), and data fields
- Extended NormalizedMessage with optional extractedPayload field — no breaking changes
- Barrel-exported all types and schemas from @copilot-chat/shared
- Empty data objects are rejected at parse time (refine validation)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ExtractedPayload schema and extend NormalizedMessage** - `b36a8cb` (feat)

## Files Created/Modified
- `shared/src/schemas/extractedPayload.ts` - ExtractedPayloadSchema and ExtractionConfidenceSchema
- `shared/src/schemas/message.ts` - NormalizedMessage extended with optional extractedPayload
- `shared/src/index.ts` - Barrel re-exports for all ExtractedPayload types

## Decisions Made
- Used z.record with refine (Object.keys.length > 0) to reject empty data — prevents phantom extractions at the schema level

## Deviations from Plan

None - plan executed exactly as written

## Issues Encountered
None

## Next Phase Readiness
- ExtractedPayload type is ready for Plan 08-02 (normalizer extraction engine)
- Schema is optional on NormalizedMessage so all existing consumers are unaffected

---
*Phase: 08-sdk-capability-audit-structured-extraction*
*Completed: 2026-02-21*
