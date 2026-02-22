# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected, authenticated via Entra External ID.
**Current focus:** v1.4 Persistent State Store — milestone complete, all 14 phases shipped

## Current Position

Phase: 14 of 14 for v1.4 (Redis Error Differentiation — gap closure)
Plan: 1 of 1 in Phase 14
Status: v1.4 milestone complete, all phases verified
Last activity: 2026-02-22 — Phase 14 verified and complete

Progress: [████████████████████] 14/14 phases complete (v1.0–v1.3b shipped, v1.4 complete)

## Performance Metrics

**v1.3b Velocity (complete):**
- Plans completed: 9 (Phase 8: 3, Phase 9: 3, Phase 10: 3)
- Timeline: 2026-02-21 (1 day)
- Requirements: 19/19 fulfilled
- Files: 21 changed, 1,667 insertions

**v1.2 Velocity (complete):**
- Plans completed: 7 (Phase 5: 2, Phase 6: 2, Phase 7: 3)
- Timeline: 2026-02-20 to 2026-02-21
- Requirements: 24/24 fulfilled
- Files: 50 changed, 4,886 insertions

**v1.1 Velocity:**
- Total plans completed: 3 (Phase 4)
- Timeline: 1 day (2026-02-20)
- Requirements: 6/6

**v1.0 Velocity:**
- Total plans completed: 13
- Timeline: 1 day (2026-02-19 → 2026-02-20)
- Files: 91 changed, ~2,341 LOC TypeScript/JS

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Recent decisions affecting v1.4:
- Factory pattern: REDIS_URL present → RedisStore; absent → InMemoryStore (never both)
- Fail-hard on Redis unavailability: 503 returned, no silent InMemory fallback
- ioredis with rediss:// scheme for Azure Cache TLS (port 6380)
- ioredis-mock for unit tests (no external Redis required in CI)
- Store timestamps as ISO 8601 strings, validated through Zod on deserialization
- Arrow function defaults for Zod datetime (.default(() => new Date().toISOString())) — per-record timestamps
- sdkConversationRef as z.unknown() — never serialized to Redis, reconstructed in memory
- Secondary userId index in InMemoryStore — Map<userId, Set<externalId>> mirrors Redis sorted-set approach
- RedisStore fully implemented with ioredis: TLS validation, per-key TTL, sorted-set user index, pipeline batching
- /health endpoint reports redis: connected/disconnected/not_configured
- ioredis-mock for unit tests (14 tests, no external Redis needed)
- Test files excluded from tsc build (vitest handles compilation)
- Name-based Redis error detection (err.name) over instanceof: ioredis v5 does not export TimeoutError; redis-errors package hierarchy detectable via error name

### Pending Todos

None.

### Blockers/Concerns

- ESLint missing @react-eslint plugin — pre-existing tech debt, non-blocking
- 3 pre-existing lint errors in AdaptiveCardMessage.tsx and ChatInput.tsx — known debt, non-blocking
- sdkConversationRef serialization risk: store conversationId string only, never the SDK reference object (addressed in Phase 11 via z.unknown())

## Session Continuity

Last session: 2026-02-22
Stopped at: v1.4 milestone complete — all 14 phases shipped and verified
Resume file: None
Next step: /gsd:complete-milestone v1.4
