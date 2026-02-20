---
phase: 01-scaffold-schema-server-foundation
plan: 02
subsystem: shared
tags: [zod, tdd, typescript, schemas, monorepo]

requires: [01-01]

provides:
  - NormalizedMessageSchema (id UUID, role user|assistant, kind text|adaptiveCard, optional text/cardJson/cardId)
  - API endpoint schemas: StartConversationResponse, SendMessage{Request,Response}, CardAction{Request,Response}
  - TypeScript types via z.infer<> exported from shared/ barrel
  - 14 Vitest tests covering all valid/invalid schema cases
  - shared/dist/ rebuilt with all schema exports

affects:
  - 01-03 (server imports NormalizedMessage type from @copilot-chat/shared)
  - 01-04 (chat route returns StartConversationResponse shape)
  - All phases (NormalizedMessage is the universal message shape)

tech-stack:
  added: []
  patterns:
    - TDD: RED (test file with module not found) → GREEN (schemas) → build
    - z.string().uuid() for all conversationId fields
    - z.string().min(1) for user text in send request
    - z.enum(['text', 'adaptiveCard']) for kind (not z.literal union)
    - z.record(z.string(), z.unknown()) for cardJson and submitData
    - Barrel re-export with explicit named exports (no wildcard *)

key-files:
  created:
    - shared/src/schemas/message.ts (NormalizedMessageSchema + NormalizedMessage type)
    - shared/src/schemas/api.ts (5 API schemas + 5 inferred types)
    - shared/src/__tests__/schemas.test.ts (14 test cases)
  modified:
    - shared/src/index.ts (replaced placeholder with barrel exports)

key-decisions:
  - "z.record(z.string(), z.unknown()) for cardJson — Adaptive Card JSON is open-ended, no fixed shape"
  - "dist/ excluded by .gitignore — consumers rebuild shared/ locally (correct monorepo pattern)"
  - "NormalizedMessage text/cardJson/cardId are all optional — kind discriminant is enough for type narrowing"

requirements-completed:
  - SCHEMA-01
  - SCHEMA-02
  - SCHEMA-03
  - SCHEMA-04

duration: 5min
completed: 2026-02-20
---

# Phase 1 Plan 02: Shared Schemas Summary

**TDD implementation of NormalizedMessage and all three API endpoint Zod schemas, with TypeScript types exported from the shared/ barrel. 14 tests pass.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T04:10:00Z
- **Completed:** 2026-02-20T04:15:00Z
- **Tasks:** 1 (single TDD feature block)
- **Files modified:** 4

## Accomplishments

- NormalizedMessage schema with all required fields and optional card fields
- 5 API endpoint schemas covering all three routes (start, send, card-action)
- 14 Vitest tests pass in RED → GREEN sequence
- All TypeScript types inferred with `z.infer<>` and exported from barrel
- Single Zod instance confirmed — not added to server or client deps

## Task Commits

1. **TDD schemas + barrel export** — `6bdb9f7` (feat)

## Files Created/Modified

- `shared/src/schemas/message.ts` — NormalizedMessageSchema + NormalizedMessage type
- `shared/src/schemas/api.ts` — 5 API schemas + 5 TypeScript types
- `shared/src/__tests__/schemas.test.ts` — 14 Vitest test cases
- `shared/src/index.ts` — Barrel export (replaced placeholder)

## Decisions Made

- **z.record for cardJson:** Adaptive Card JSON is open-ended with no fixed schema — `z.record(z.string(), z.unknown())` is correct. Type narrowing by `kind` field handles the discriminant pattern.
- **Optional text/cardJson/cardId:** All three optional fields; `kind` is the discriminant. TypeScript narrowing (`if (msg.kind === 'text')`) gives type safety at usage sites.
- **dist/ not committed:** `.gitignore` excludes dist/. Consumers must run `npm run build --workspace=shared`. This is correct monorepo behavior — dist is a build artifact.

## Deviations from Plan

None. Plan executed exactly as specified.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- Plan 01-03 (Express server foundation) can proceed: server imports `NormalizedMessage` from `@copilot-chat/shared`
- Plan 01-04 (POST /api/chat/start) can proceed after 01-03: uses `StartConversationResponseSchema` shape

---
*Phase: 01-scaffold-schema-server-foundation*
*Completed: 2026-02-20*
