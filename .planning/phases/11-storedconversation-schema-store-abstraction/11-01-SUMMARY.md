---
phase: 11-storedconversation-schema-store-abstraction
plan: 01
subsystem: database
tags: [zod, schema, typescript, persistence]

requires:
  - phase: 10-workflow-orchestrator
    provides: WorkflowState schema pattern in shared/
provides:
  - StoredConversation Zod schema with persistence metadata
  - StoredConversation TypeScript type exported from shared/
  - Backward-compatible deserialization via Zod .default() chains
affects: [11-02, 12-redis-store, 13-route-integration]

tech-stack:
  added: []
  patterns: [arrow-function defaults for Zod datetime, z.unknown() for non-serializable SDK refs]

key-files:
  created:
    - shared/src/schemas/storedConversation.ts
  modified:
    - shared/src/index.ts

key-decisions:
  - "Arrow function form for datetime defaults — evaluated at parse time, not schema definition"
  - "sdkConversationRef typed as z.unknown() — never round-tripped through Redis"
  - "userId/tenantId use .default() not .optional() — always present after parse"

patterns-established:
  - "Persistent entity schema: Zod .default() chains for backward-compatible field additions"
  - "Non-serializable fields: z.unknown() for in-memory-only SDK references"

requirements-completed: [STATE-01, STATE-02, STATE-03, STATE-04, STATE-05, STATE-06]

duration: 2min
completed: 2026-02-22
---

# Plan 11-01: StoredConversation Schema Summary

**StoredConversation Zod schema with userId, tenantId, ISO timestamps, lifecycle status, and optional workflow fields — backward-compatible defaults for all new fields**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-22T03:03:00Z
- **Completed:** 2026-02-22T03:05:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- StoredConversation Zod schema with all STATE-01 through STATE-06 fields
- Backward-compatible deserialization — old records with only {externalId, sdkConversationRef, history} parse successfully with defaults applied
- Barrel export from shared/src/index.ts makes schema and type available to server/

## Task Commits

Each task was committed atomically:

1. **Task 1: Create StoredConversation Zod schema** - `b0ae1bf` (feat)
2. **Task 2: Export StoredConversation from barrel** - `184f3bb` (feat)

## Files Created/Modified
- `shared/src/schemas/storedConversation.ts` - Zod schema with transport data, persistence metadata, and optional workflow fields
- `shared/src/index.ts` - Added StoredConversationSchema and StoredConversation type exports

## Decisions Made
- Arrow function form `.default(() => new Date().toISOString())` for createdAt/updatedAt — ensures each parsed record gets its own timestamp at parse time
- `sdkConversationRef: z.unknown()` — this field holds the live SDK object in memory, never serialized to Redis
- userId/tenantId use `.default('anonymous')` and `.default('dev')` respectively — always present after parse, never optional

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- StoredConversation schema and type ready for Plan 11-02 (store abstraction)
- shared/ rebuilt with new exports accessible via @copilot-chat/shared

---
*Phase: 11-storedconversation-schema-store-abstraction*
*Completed: 2026-02-22*
