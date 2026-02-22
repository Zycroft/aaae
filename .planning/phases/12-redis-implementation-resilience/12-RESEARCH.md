# Phase 12: Redis Implementation + Resilience - Research

**Researched:** 2026-02-22
**Domain:** Redis-backed persistence with ioredis
**Confidence:** HIGH

## Summary

Phase 12 replaces the RedisConversationStore stub (Phase 11) with a full ioredis implementation. The existing ConversationStore interface, factory pattern, and store index are already in place -- Phase 12 only needs to implement the four methods (get, set, delete, listByUser) plus update the factory constructor and health endpoint.

ioredis v5.9.3 (latest, Feb 2026) provides native TLS via `rediss://` URLs, built-in `commandTimeout`, auto-reconnect with exponential backoff, and full TypeScript types. ioredis-mock v8.13.1 provides in-memory emulation for unit tests without a Redis server.

**Primary recommendation:** Implement RedisStore with ioredis client-level `commandTimeout`, per-key TTL via `SET EX`, sorted-set secondary index for listByUser, and Redis pipeline for atomic set+zadd operations.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- ioredis (not node-redis) -- built-in TLS, Sentinel/Cluster awareness, TypeScript types
- ioredis-mock for unit tests -- no external Redis in CI
- Single ioredis client instance, created once at factory call time
- Azure Cache for Redis uses `rediss://` scheme (TLS) on port 6380
- Reject connection at startup if URL scheme is not `rediss://`
- Per-key TTL, configurable, default 24 hours (86400 seconds)
- TTL resets on each update
- `commandTimeout` at client level, default 5 seconds
- Sorted set per user: `user:{userId}:conversations`, score = updatedAt epoch ms
- listByUser uses ZREVRANGEBYSCORE with LIMIT 0 50
- Index entries cleaned on delete (ZREM)
- StoredConversation serialized as JSON string, sdkConversationRef excluded
- Zod validation on deserialization
- Hard-fail 503 on Redis unavailability, never silent fallback
- ioredis built-in retry with exponential backoff
- Log errors with [STORE] prefix
- GET /health reports "connected"/"disconnected" via ioredis status property
- Health check unauthenticated

### Claude's Discretion
- Exact retry count and backoff parameters for ioredis reconnection
- Whether to use Redis pipeline for multi-command operations (set + zadd)
- Error message formatting for 503 responses
- Test structure and grouping for ioredis-mock tests

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STORE-05 | Redis connection uses TLS (rediss://, port 6380) | ioredis natively supports `rediss://` URLs -- `new Redis("rediss://...")` enables TLS automatically |
| STORE-06 | Conversations auto-expire after configurable TTL (default 24h) | Use `redis.set(key, value, 'EX', ttlSeconds)` -- ioredis supports SET with EX flag |
| STORE-07 | All Redis operations enforce configurable timeout (default 5s) | ioredis `commandTimeout` option at client level -- throws on timeout |
| QUERY-02 | listByUser returns sorted by most recent, limited to 50 | `redis.zrevrangebyscore(key, '+inf', '-inf', 'LIMIT', 0, 50)` with epoch ms scores |
| QUERY-03 | Redis uses sorted set secondary index for user lookup | `zadd` on set, `zrem` on delete, `zrevrangebyscore` on query |
| RESIL-01 | Server returns 503 when Redis unreachable | Catch ioredis errors in store methods, let Express error handler return 503 |
| RESIL-02 | /health reports Redis connectivity status | `redis.status` property: 'ready' means connected, anything else means disconnected |
| RESIL-03 | Redis connection retries on transient errors with logging | ioredis `retryStrategy` option with exponential backoff, `[STORE]` log prefix |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ioredis | ^5.9.3 | Redis client | Native TLS, TypeScript, auto-reconnect, 98% of Node Redis users on v5 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis-mock | ^8.13.1 | In-memory Redis emulation | Unit tests only (devDependency) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ioredis | node-redis (redis) | node-redis is official but ioredis has better TLS URL support and TypeScript types |

**Installation:**
```bash
cd server && npm install ioredis && npm install -D ioredis-mock
```

## Architecture Patterns

### Recommended Changes to Existing Files
```
server/src/store/
├── ConversationStore.ts  # No changes (Phase 11)
├── InMemoryStore.ts      # No changes (Phase 11)
├── RedisStore.ts         # REPLACE stub with full implementation
├── factory.ts            # UPDATE: pass ioredis client to RedisStore, add URL validation
├── index.ts              # UPDATE: export Redis client for health check
└── __tests__/
    └── RedisStore.test.ts  # NEW: ioredis-mock tests

server/src/
├── config.ts             # UPDATE: add REDIS_TTL, REDIS_TIMEOUT env vars
├── app.ts                # UPDATE: /health endpoint reports Redis status
└── server/.env.example   # UPDATE: add Redis env vars
```

### Pattern 1: ioredis Client Construction with TLS
**What:** Create a single ioredis client from REDIS_URL with TLS validation
**When to use:** Factory function when REDIS_URL is set

```typescript
import Redis from 'ioredis';

// Validate URL scheme before constructing client
function createRedisClient(redisUrl: string): Redis {
  const url = new URL(redisUrl);
  if (url.protocol !== 'rediss:') {
    throw new Error(
      `[STORE] Invalid REDIS_URL scheme: ${url.protocol}. Azure Cache requires rediss:// (TLS).`
    );
  }

  return new Redis(redisUrl, {
    commandTimeout: 5000, // 5 seconds per command
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 2000); // 200ms, 400ms, 600ms... max 2s
      console.log(`[STORE] Redis reconnecting (attempt ${times}), delay ${delay}ms`);
      return delay;
    },
    reconnectOnError(err: Error) {
      // Reconnect on READONLY errors (Azure failover)
      return err.message.includes('READONLY');
    },
  });
}
```

### Pattern 2: Serialization with sdkConversationRef Exclusion
**What:** Serialize StoredConversation to JSON, excluding sdkConversationRef
**When to use:** Every set() operation

```typescript
import { StoredConversationSchema } from '@copilot-chat/shared';

// Serialize: exclude sdkConversationRef (non-serializable SDK object)
function serialize(conversation: StoredConversation): string {
  const { sdkConversationRef, ...serializable } = conversation;
  return JSON.stringify(serializable);
}

// Deserialize: parse JSON, validate with Zod, sdkConversationRef defaults to undefined
function deserialize(json: string): StoredConversation {
  const raw = JSON.parse(json);
  return StoredConversationSchema.parse(raw); // Zod validates + applies defaults
}
```

### Pattern 3: Pipeline for Atomic set + zadd
**What:** Use ioredis pipeline to execute SET and ZADD atomically
**When to use:** Every set() operation (update conversation + update user index)

```typescript
async set(id: string, conversation: StoredConversation): Promise<void> {
  const pipeline = this.redis.pipeline();
  const key = `conv:${id}`;
  const userKey = `user:${conversation.userId}:conversations`;
  const score = new Date(conversation.updatedAt).getTime();

  pipeline.set(key, serialize(conversation), 'EX', this.ttlSeconds);
  pipeline.zadd(userKey, score.toString(), id);
  pipeline.expire(userKey, this.ttlSeconds + 3600); // user index TTL = conv TTL + 1hr buffer

  await pipeline.exec();
}
```

### Pattern 4: ZREVRANGEBYSCORE for listByUser
**What:** Query sorted set for user's conversations in reverse chronological order
**When to use:** listByUser() implementation

```typescript
async listByUser(userId: string): Promise<StoredConversation[]> {
  const userKey = `user:${userId}:conversations`;
  const ids = await this.redis.zrevrangebyscore(userKey, '+inf', '-inf', 'LIMIT', 0, 50);
  if (ids.length === 0) return [];

  // Multi-get all conversations
  const pipeline = this.redis.pipeline();
  for (const id of ids) {
    pipeline.get(`conv:${id}`);
  }
  const results = await pipeline.exec();

  return results!
    .map(([err, json]) => (err || !json ? null : deserialize(json as string)))
    .filter((c): c is StoredConversation => c !== null);
}
```

### Pattern 5: Health Check via status Property
**What:** Report Redis connectivity via ioredis `status` property
**When to use:** GET /health endpoint

```typescript
// ioredis status values: 'wait', 'reconnecting', 'connecting', 'connect', 'ready', 'close', 'end'
// 'ready' = connected and accepting commands
const isConnected = redisClient.status === 'ready';
```

### Anti-Patterns to Avoid
- **NEVER use KEYS command** — O(N) full scan, blocks Redis
- **NEVER create a new Redis client per request** — connection pooling happens inside ioredis
- **NEVER catch Redis errors silently** — always 503, never fallback to InMemory
- **NEVER use SETEX** — deprecated in favor of `SET key value EX ttl`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Connection retry | Custom retry loop | ioredis `retryStrategy` | Handles edge cases (backoff, max retries, reconnect events) |
| Command timeout | setTimeout wrapper | ioredis `commandTimeout` | Built-in, properly cancels pending commands |
| TLS setup | Manual TLS config | `rediss://` URL scheme | ioredis parses rediss:// and enables TLS automatically |
| Pipeline batching | Sequential commands | `redis.pipeline()` | Reduces round trips, atomic execution |
| Sorted set queries | Manual sorting in JS | ZREVRANGEBYSCORE | O(log(N)+M) in Redis, not O(N) in application |

## Common Pitfalls

### Pitfall 1: SETEX is Deprecated
**What goes wrong:** Using `redis.setex(key, ttl, value)` — still works but deprecated
**Why it happens:** Old Redis tutorials use SETEX
**How to avoid:** Use `redis.set(key, value, 'EX', ttlSeconds)` instead
**Warning signs:** TypeScript deprecation warning on setex

### Pitfall 2: sdkConversationRef Serialization Failure
**What goes wrong:** JSON.stringify fails or produces `{}` for SDK class instances
**Why it happens:** sdkConversationRef is a live SDK object with methods, not a plain object
**How to avoid:** Destructure out sdkConversationRef before serialization, restore as undefined on deserialization
**Warning signs:** `TypeError: Converting circular structure to JSON`

### Pitfall 3: Sorted Set TTL Orphaning
**What goes wrong:** Conversation key expires but sorted set entry remains, causing listByUser to return IDs for non-existent conversations
**Why it happens:** Redis TTL is per-key, sorted sets don't auto-expire members
**How to avoid:** Set user index key TTL slightly longer than conversation TTL. Filter null results in listByUser.
**Warning signs:** listByUser returns fewer results than expected despite having IDs

### Pitfall 4: commandTimeout vs connectTimeout
**What goes wrong:** Confusing `commandTimeout` (per-command) with `connectTimeout` (initial connection)
**Why it happens:** Both are timeout options on the ioredis constructor
**How to avoid:** Set both: `commandTimeout: 5000` for operations, `connectTimeout: 10000` for initial connection
**Warning signs:** Startup failures with "Connection timed out" that should have longer timeout

### Pitfall 5: ioredis-mock Does Not Support All Commands
**What goes wrong:** Some Redis commands (like OBJECT, DEBUG) are not implemented in ioredis-mock
**Why it happens:** ioredis-mock is a subset implementation
**How to avoid:** Test only the commands you actually use (GET, SET, DEL, ZADD, ZREM, ZREVRANGEBYSCORE, EXPIRE, PIPELINE). All of these are supported.
**Warning signs:** `Error: Command not implemented` in test runs

## Code Examples

### ioredis Client with Full Configuration
```typescript
import Redis from 'ioredis';

const redis = new Redis('rediss://redis.example.com:6380', {
  commandTimeout: 5000,
  connectTimeout: 10000,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 10) return null; // Stop retrying after 10 attempts
    return Math.min(times * 200, 2000);
  },
});

redis.on('error', (err) => console.error('[STORE] Redis error:', err.message));
redis.on('connect', () => console.log('[STORE] Redis connected'));
redis.on('ready', () => console.log('[STORE] Redis ready'));
redis.on('close', () => console.warn('[STORE] Redis connection closed'));
```

### Pipeline for Atomic Operations
```typescript
const pipe = redis.pipeline();
pipe.set('conv:abc', JSON.stringify(data), 'EX', 86400);
pipe.zadd('user:alice:conversations', Date.now().toString(), 'abc');
pipe.expire('user:alice:conversations', 86400 + 3600);
const results = await pipe.exec();
// results: [[null, 'OK'], [null, 1], [null, 1]]
```

### ZREVRANGEBYSCORE with LIMIT
```typescript
// Get top 50 most recent conversation IDs for a user
const ids = await redis.zrevrangebyscore(
  'user:alice:conversations',
  '+inf', '-inf',
  'LIMIT', 0, 50
);
```

## Open Questions

1. **ioredis-mock pipeline exec() return type**
   - What we know: ioredis returns `[error, result][]` from pipeline.exec()
   - What's unclear: Whether ioredis-mock matches this exactly
   - Recommendation: Test in first test case, adjust type assertions if needed

## Sources

### Primary (HIGH confidence)
- [ioredis npm](https://www.npmjs.com/package/ioredis) - v5.9.3, TypeScript built-in
- [ioredis GitHub](https://github.com/redis/ioredis) - TLS, commandTimeout, retryStrategy docs
- [ioredis API docs](https://redis.github.io/ioredis/interfaces/CommonRedisOptions.html) - CommonRedisOptions (commandTimeout confirmed)
- [ioredis-mock npm](https://www.npmjs.com/package/ioredis-mock) - v8.13.1
- [Redis ZRANGEBYSCORE docs](https://redis.io/docs/latest/commands/zrangebyscore/) - sorted set command reference

### Secondary (MEDIUM confidence)
- [ioredis-mock GitHub](https://github.com/stipsan/ioredis-mock) - supported command list

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - ioredis v5.9.3 verified on npm, well-documented
- Architecture: HIGH - patterns from ioredis official docs and Redis command reference
- Pitfalls: HIGH - well-known issues documented in ioredis issues and Redis best practices

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable library, slow-moving API)
