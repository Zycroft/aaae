# Phase 12: Redis Implementation + Resilience - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the RedisConversationStore that was stubbed in Phase 11. The store connects to Azure Cache for Redis via ioredis with TLS, enforces per-key TTL and operation timeouts, uses a sorted-set secondary index for user-scoped queries, and hard-fails with 503 when Redis is unreachable. Health endpoint reports Redis connectivity. All decisions below were locked during v1.4 roadmap creation and research.

</domain>

<decisions>
## Implementation Decisions

### Redis Client Library
- ioredis (not node-redis) -- chosen for built-in TLS support, Sentinel/Cluster awareness, and TypeScript types
- ioredis-mock for unit tests -- no external Redis required in CI
- Single ioredis client instance, created once at factory call time

### Connection & TLS
- Azure Cache for Redis uses `rediss://` scheme (TLS) on port 6380
- Reject connection at startup if URL scheme is not `rediss://` (fail-fast validation)
- ioredis handles TLS natively with `rediss://` scheme -- no manual TLS config needed

### TTL & Expiry
- Per-key TTL on conversation records, configurable via environment variable
- Default TTL: 24 hours (86400 seconds)
- Use Redis `SETEX` or `SET ... EX` to apply TTL on every write (both create and update)
- TTL resets on each update (conversation stays alive while active)

### Operation Timeouts
- All Redis operations enforce configurable timeout (default 5 seconds)
- Use ioredis `commandTimeout` option at client level
- Timeout triggers same 503 path as connection failure

### Sorted Set User Index
- Secondary index: Redis sorted set per user, keyed as `user:{userId}:conversations`
- Score: updatedAt timestamp (epoch milliseconds) for natural most-recent-first ordering
- Member: conversation externalId
- listByUser uses ZREVRANGEBYSCORE with LIMIT 0 50 for paginated top-50
- Index entries must be cleaned up on conversation delete (ZREM)
- Index TTL matches conversation TTL (or slightly longer to avoid orphaned index entries)

### Serialization
- StoredConversation serialized as JSON string via JSON.stringify/JSON.parse
- sdkConversationRef excluded from serialization (always null in Redis; reconstructed in memory)
- Zod validation on deserialization (StoredConversationSchema.parse) to catch schema drift

### Resilience & Failure
- Hard-fail on Redis unavailability: return 503 Service Unavailable
- NEVER silently fall back to InMemoryStore -- fail loud
- ioredis built-in retry with exponential backoff for transient errors
- Log all Redis errors with [STORE] prefix for consistency with factory logging

### Health Endpoint
- GET /health reports Redis as "connected" or "disconnected"
- Uses ioredis connection status (client.status) -- no separate PING per health check
- Health check is unauthenticated (no Bearer token required) -- existing behavior

### Claude's Discretion
- Exact retry count and backoff parameters for ioredis reconnection
- Whether to use Redis pipeline for multi-command operations (set + zadd)
- Error message formatting for 503 responses
- Test structure and grouping for ioredis-mock tests

</decisions>

<specifics>
## Specific Ideas

- RedisStore must satisfy the exact same ConversationStore interface from Phase 11 -- drop-in replacement for InMemoryStore
- Factory pattern already selects backend from REDIS_URL (Phase 11 complete) -- Phase 12 only needs to implement the RedisConversationStore methods
- sdkConversationRef is never persisted to Redis -- the server stores only serializable fields. When a conversation is loaded from Redis, sdkConversationRef will be null/undefined; the SDK reference is reconstructed when the conversation is resumed (out of scope for Phase 12)
- The Phase 11 route changes already supply userId, tenantId, timestamps, and status to new conversations -- Phase 12 does not need to touch routes

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope. All decisions were pre-locked during v1.4 research and roadmap creation.

</deferred>

---

*Phase: 12-redis-implementation-resilience*
*Context gathered: 2026-02-22*
