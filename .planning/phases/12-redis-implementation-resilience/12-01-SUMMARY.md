# Plan 12-01 Summary: Install ioredis + Implement RedisStore + Update Factory

**Completed:** 2026-02-22
**Status:** Done

## What Changed

### Files Modified
- **server/package.json** — Added `ioredis` ^5.9.3 as production dependency
- **package-lock.json** — Updated with ioredis and its 9 sub-dependencies
- **server/src/config.ts** — Added `REDIS_URL`, `REDIS_TTL` (default 86400), `REDIS_TIMEOUT` (default 5000)
- **server/src/store/RedisStore.ts** — Replaced Phase 11 stub with full ioredis implementation
- **server/src/store/factory.ts** — Updated with TLS validation, ioredis client creation, `getRedisClient()` export
- **server/src/store/index.ts** — Added `getRedisClient` re-export for health check

### Key Decisions
- **Named import**: Used `import { Redis } from 'ioredis'` (not default import) for TypeScript NodeNext compatibility
- **Pipeline for atomic operations**: set() uses `redis.pipeline()` for SET + ZADD + EXPIRE in a single round-trip
- **User index TTL buffer**: Sorted-set TTL = conversation TTL + 1 hour to prevent orphaned index entries
- **Error propagation**: Redis errors propagate naturally (no try/catch in store methods) — Express error handler returns 503
- **sdkConversationRef exclusion**: Destructured out before JSON.stringify; Zod `.parse()` on deserialization restores defaults

### Requirements Fulfilled
- STORE-05: TLS via rediss:// URL (rejected at startup if non-TLS)
- STORE-06: Per-key TTL via SET EX (configurable, default 24h)
- STORE-07: commandTimeout at client level (configurable, default 5s)
- QUERY-02: listByUser with ZREVRANGEBYSCORE, LIMIT 0 50
- QUERY-03: Sorted-set secondary index (zadd on set, zrem on delete)
- RESIL-01: Errors propagate to 503 path (no silent fallback)
- RESIL-03: retryStrategy with exponential backoff, [STORE] log prefix

### Deviations
- **TypeScript import style**: Plan specified `import Redis from 'ioredis'` but NodeNext requires `import { Redis } from 'ioredis'` to avoid namespace-as-type error (TS2709)
- **Explicit type annotations on pipeline results**: Added `[Error | null, unknown]` type annotation to pipeline.exec() result destructuring to satisfy strict TypeScript

---
*Plan: 12-01 | Phase: 12-redis-implementation-resilience*
