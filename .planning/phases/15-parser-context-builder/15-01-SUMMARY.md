---
phase: 15-parser-context-builder
plan: 01
subsystem: shared
tags: [zod, typescript, schemas, workflow, discriminated-union]

requires:
  - phase: 14
    provides: ExtractedPayloadSchema, ExtractionConfidenceSchema, NormalizedMessageSchema
provides:
  - CopilotStructuredOutputSchema with .passthrough() for forward compatibility
  - ParsedTurn discriminated union type (structured/passthrough/parse_error)
  - NextAction enum type (ask, research, confirm, complete, error)
affects: [15-02-parser, 16-orchestrator, 17-routes]

tech-stack:
  added: []
  patterns: [discriminated-union-schema, passthrough-validation]

key-files:
  created:
    - shared/src/schemas/workflow.ts
  modified:
    - shared/src/index.ts

key-decisions:
  - "Used z.array(z.string()).max(0) for empty array variants in discriminated union instead of z.tuple([]) — better TypeScript inference"
  - "Used .passthrough() on CopilotStructuredOutputSchema to allow unknown fields from evolving Copilot responses"

patterns-established:
  - "Discriminated union with three kinds for parser outcomes: structured/passthrough/parse_error"
  - ".passthrough() on external API schemas for forward compatibility"

requirements-completed: [PARSE-05]

duration: 2min
completed: 2026-02-22
---

# Phase 15 Plan 01: Shared Workflow Schemas Summary

**CopilotStructuredOutputSchema (.passthrough()), ParsedTurn discriminated union (3 kinds), and NextAction enum in shared/src/schemas/workflow.ts**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-22T17:19:42Z
- **Completed:** 2026-02-22T17:22:06Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- CopilotStructuredOutputSchema with .passthrough() for forward-compatible Copilot response validation
- ParsedTurn discriminated union covering structured, passthrough, and parse_error outcomes
- NextAction enum (ask, research, confirm, complete, error) exported from shared
- All types accessible at runtime from shared/dist/index.js

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared/src/schemas/workflow.ts** - `3e4dbef` (feat)
2. **Task 2: Export workflow types from shared barrel** - `aac4370` (feat)

## Files Created/Modified
- `shared/src/schemas/workflow.ts` - CopilotStructuredOutputSchema, ParsedTurnSchema, NextActionSchema, type exports
- `shared/src/index.ts` - Barrel re-export of all new workflow types

## Decisions Made
- Used `z.array(z.string()).max(0)` for empty array variants in the discriminated union rather than `z.tuple([])` for better TypeScript type inference
- Applied `.passthrough()` on CopilotStructuredOutputSchema to allow unknown Copilot response fields without validation errors

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shared schemas ready for Plan 15-02 (structured output parser) and Plan 15-03 (context builder)
- Server can now import CopilotStructuredOutputSchema and ParsedTurn from @copilot-chat/shared

---
*Phase: 15-parser-context-builder*
*Completed: 2026-02-22*
