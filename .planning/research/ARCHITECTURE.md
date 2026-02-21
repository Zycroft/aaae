# Architecture: Redis Persistent State Store Integration

**Domain:** Agentic Copilot Chat App (Express + React monorepo)
**Researched:** 2026-02-21
**Mode:** Ecosystem + Architecture Integration
**Confidence:** HIGH

---

## Executive Summary

This research maps the Redis persistent state store integration into the existing Express server architecture. The goal is to replace the in-memory LRU conversation store with a Redis-backed implementation while maintaining backward compatibility and enabling multi-instance scaling for the v1.5 Workflow Orchestrator.

**Key Finding:** Redis integration follows a **factory pattern** for store selection (Redis vs InMemory), which cleanly isolates Redis complexity behind the existing `ConversationStore` interface. This requires:

1. **Minimal chat route changes** — routes use the abstract interface, never know about Redis
2. **Expanded StoredConversation schema** — adds userId, tenantId, timestamps, status (in shared/)
3. **Secondary index via sorted sets** — for user-scoped queries (sorted set on userId+timestamp)
4. **Health check enhancement** — reports Redis connectivity status
5. **Graceful failure handling** — returns 503 when Redis unavailable (no silent fallback)

The architecture preserves all existing Express middleware patterns (auth, orgAllowlist) and maintains the singleton pattern for the store instance, making this a **drop-in replacement** at the integration layer.

---

## Component Architecture

```
┌─ Express Server (app.ts) ─────────────────────────────────────────────────┐
│                                                                             │
│  CORS → JSON Parser → Health Check (unauthenticated)                       │
│       ↓                                                                     │
│  [Auth Middleware] → [Org Allowlist Middleware]                            │
│       ↓                                                                     │
│  ┌─ Chat Routes (chat.ts) ──────────────────────────────────────────┐     │
│  │                                                                   │     │
│  │  /start    → [Copilot] → StoredConversation → Store.set()        │     │
│  │  /send     → [Lookup] → [Copilot] → [Normalize] → Store.set()    │     │
│  │  /card-action → [Validate] → [Copilot] → [Normalize] → Store.set()   │     │
│  │                                  ↓                                │     │
│  │                         Store Interface                           │     │
│  │                              ↓                                    │     │
│  │         ┌─────────────────────┴────────────────────┐             │     │
│  │         ↓                                          ↓             │     │
│  │   RedisStore (new)                       InMemoryStore (legacy)  │     │
│  │   ├─ ioredis client                       ├─ LRUCache            │     │
│  │   ├─ JSON serialization                   └─ Synchronous         │     │
│  │   ├─ Sorted set indexes                                          │     │
│  │   ├─ TTL management                       Factory Pattern:        │     │
│  │   └─ Async/await throughout              createStore() → pick    │     │
│  │                                           one based on env vars   │     │
│  └─ [Health Check] → Redis.ping() + client.status ────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Data Flow Detail:
  1. Request enters auth middleware (req.user populated)
  2. Route handler calls Store.get(conversationId)
  3. Store returns StoredConversation (userId, tenantId, history, etc.)
  4. Route logic proceeds (lookup complete, always in O(1))
  5. After Copilot response: Store.set() with updated conversation
  6. Redis path: async client.json.set() + ZADD (sorted set index)
  7. Health check probes redis.ping() on-demand
```

---

## New Components

### 1. **RedisStore Implementation** (`server/src/store/RedisStore.ts`)

**Responsibility:** Implement ConversationStore interface on top of ioredis, managing conversation state with secondary indexes.

**Key Details:**

- **Constructor:** Accepts ioredis client instance (injected, not created internally)
- **Data serialization:** `JSON.stringify(StoredConversation)` on write, `JSON.parse()` on read
- **Keys:** `conversation:{externalId}` (primary), `user:{userId}:{timestamp}:{externalId}` (sorted set index)
- **Sorted set score:** Timestamp (milliseconds), allows range queries like "all conversations for user in last 7 days"
- **TTL:** Applied to primary key only (e.g., 30 days expiration), sorted set entries clean up when primary expires
- **Error handling:** Throws with descriptive messages; app.ts health check catches and returns 503

```typescript
// Pseudocode structure
export class RedisStore implements ConversationStore {
  constructor(private client: Redis) {}

  async get(id: string): Promise<StoredConversation | undefined> {
    const json = await this.client.get(`conversation:${id}`);
    if (!json) return undefined;
    return JSON.parse(json);
  }

  async set(id: string, conv: StoredConversation): Promise<void> {
    const json = JSON.stringify(conv);
    await this.client.set(
      `conversation:${id}`,
      json,
      'EX', // EX = expiry in seconds
      30 * 24 * 60 * 60, // 30 days
    );
    // Secondary index: sorted set on userId
    if (conv.userId) {
      const score = conv.createdAt ?? Date.now(); // Timestamp as score
      const member = `${conv.externalId}`;
      await this.client.zadd(
        `user:${conv.userId}:conversations`,
        score,
        member,
      );
    }
  }

  async listByUser(userId: string): Promise<StoredConversation[]> {
    // ZRANGE with BYSCORE for range queries (e.g., last 7 days)
    const members = await this.client.zrange(
      `user:${userId}:conversations`,
      0, -1,
    );
    const conversations = await Promise.all(
      members.map((id) => this.get(id as string)),
    );
    return conversations.filter((c) => c !== undefined);
  }

  async delete(id: string): Promise<void> {
    const conv = await this.get(id);
    if (conv?.userId) {
      await this.client.zrem(`user:${conv.userId}:conversations`, id);
    }
    await this.client.del(`conversation:${id}`);
  }
}
```

**Why this design:**
- Sorted sets enable O(log N) user-scoped lookups (Phase 1.5 feature)
- JSON string storage avoids Redis JSON module dependency (keep stack simple)
- TTL on primary key only (Redis TTL deletes key, sorted set entry becomes orphaned)
- Async/await throughout (matches Express async route patterns)

---

### 2. **Store Factory** (`server/src/store/createStore.ts`)

**Responsibility:** Single-point decision for which store implementation to use, based on environment variables.

**Logic:**

```typescript
// server/src/store/createStore.ts
import { config } from '../config.js';
import { Redis } from 'ioredis';
import { InMemoryConversationStore } from './InMemoryStore.js';
import { RedisStore } from './RedisStore.js';

export function createStore(): ConversationStore {
  if (config.REDIS_URL) {
    const redisClient = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      // For Azure Cache for Redis (Premium tier with TLS required)
      tls: true, // Auto-enabled if REDIS_URL starts with rediss://
    });

    redisClient.on('error', (err) => {
      console.error('[store] Redis client error:', err);
    });

    return new RedisStore(redisClient);
  }

  console.log('[store] REDIS_URL not set, using InMemoryStore');
  return new InMemoryConversationStore();
}
```

**Deployment patterns:**

```
Development:     REDIS_URL not set → InMemoryStore (no dependencies)
Local Redis:     REDIS_URL=redis://localhost:6379 → RedisStore
Azure Redis:     REDIS_URL=rediss://myapp.redis.cache.windows.net:6380 → RedisStore (auto TLS)
```

**Integration into store/index.ts:**

```typescript
import { createStore } from './createStore.js';

export const conversationStore: ConversationStore = createStore();
```

---

### 3. **Expanded StoredConversation Schema** (shared/src/schemas/)

**Add to schema definition:**

```typescript
// Add to ConversationStore.ts interface
export interface StoredConversation {
  // Existing fields
  externalId: string;
  sdkConversationRef: unknown;
  history: NormalizedMessage[];

  // New fields (v1.4+)
  userId: string;           // From req.user.oid (Entra OID, stable user identifier)
  tenantId: string;         // From req.user.tid (org tenant ID)
  createdAt: number;        // Timestamp (ms) — used as sorted set score
  updatedAt: number;        // Timestamp (ms) — updated on each message
  status: 'active' | 'archived' | 'deleted'; // Conversation lifecycle

  // Workflow fields (v1.5 prep)
  workflowState?: WorkflowState;
  extractedPayload?: ExtractedPayload;
}
```

**Why these fields:**

- `userId, tenantId` — enable row-level security queries (future auth enhancement)
- `createdAt, updatedAt` — enable chronological sorted set indexes and TTL policies
- `status` — soft-delete support, archiving without data loss
- Workflow fields — prepared for v1.5 orchestrator (already defined in existing schemas)

---

### 4. **Secondary Index Pattern via Sorted Sets**

**Use case:** Phase 1.5 feature "List user's conversations"

**Example route (future):**

```typescript
// GET /api/chat/conversations?limit=20&days=7
chatRouter.get('/conversations', async (req, res) => {
  const { limit = 20, days = 7 } = req.query;
  const user = req.user; // From auth middleware

  // Timestamp range: last 7 days
  const now = Date.now();
  const sevenDaysAgo = now - (days as number) * 24 * 60 * 60 * 1000;

  // Using store interface (works with both InMemory and Redis)
  const conversations = await (conversationStore as RedisStore)
    .listByUserRange(user.oid, sevenDaysAgo, now);

  res.json({
    count: conversations.length,
    conversations: conversations.slice(0, limit as number),
  });
});
```

**Sorted set implementation in RedisStore:**

```typescript
async listByUserRange(
  userId: string,
  minScore: number,
  maxScore: number,
): Promise<StoredConversation[]> {
  // ZRANGE key min max BYSCORE LIMIT offset count
  const members = await this.client.zrange(
    `user:${userId}:conversations`,
    minScore,
    maxScore,
    'BYSCORE',
    'LIMIT',
    0,
    100,
  );

  return Promise.all(
    members.map((id) => this.get(id as string)),
  ).then((convs) => convs.filter((c) => c !== undefined));
}
```

**Why sorted sets:**

- O(log N + M) where M is result count (vs. O(N) scan)
- Enables range queries (createdAt range, status filtering via key naming)
- No explicit index maintenance needed (ZADD on every write)
- Scales to millions of conversations per user

---

## Integration Points

### 1. **Chat Routes (chat.ts) — MINIMAL CHANGES**

**Current behavior (works with Redis too):**

```typescript
// /start endpoint
const conversation = {
  externalId,
  sdkConversationRef: collectedActivities,
  history: [],
};
await conversationStore.set(externalId, conversation);

// /send endpoint
const conversation = await conversationStore.get(conversationId);
// ... Copilot call ...
await conversationStore.set(conversationId, {
  ...conversation,
  history: [...conversation.history, ...messages],
});
```

**Required changes:** Populate new fields from JWT claims

```typescript
// In /start handler, after Copilot call
const conversation: StoredConversation = {
  externalId,
  sdkConversationRef: collectedActivities,
  history: [],
  userId: req.user.oid,        // From auth middleware
  tenantId: req.user.tid,      // From auth middleware
  createdAt: Date.now(),
  updatedAt: Date.now(),
  status: 'active',
};
await conversationStore.set(externalId, conversation);

// In /send handler
await conversationStore.set(conversationId, {
  ...conversation,
  history: [...conversation.history, ...messages],
  updatedAt: Date.now(),  // Update timestamp
});
```

**Impact:** Routes stay simple, auth middleware provides user context, store handles persistence complexity.

---

### 2. **Health Check Endpoint (app.ts) — ENHANCED**

**Current behavior:**

```typescript
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', authRequired: config.AUTH_REQUIRED });
});
```

**Required enhancement:**

```typescript
app.get('/health', async (_req, res) => {
  try {
    // If Redis is configured, check its connectivity
    if (conversationStore instanceof RedisStore) {
      await conversationStore.ping(); // New method
      res.json({
        status: 'ok',
        redis: 'connected',
        authRequired: config.AUTH_REQUIRED,
      });
    } else {
      res.json({
        status: 'ok',
        store: 'memory',
        authRequired: config.AUTH_REQUIRED,
      });
    }
  } catch (err) {
    console.error('[health] Redis check failed:', err);
    res.status(503).json({
      status: 'unavailable',
      redis: 'disconnected',
      error: (err as Error).message,
    });
  }
});
```

**Graceful failure:** Returns 503 when Redis unavailable (no silent fallback to InMemory). Deployment orchestrators detect 503 and trigger alerts/remediation.

---

### 3. **Configuration (config.ts) — NEW VARS**

**Add to config.ts:**

```typescript
export const config = {
  // ... existing vars ...

  // Redis configuration (v1.4)
  REDIS_URL: process.env.REDIS_URL, // e.g., "rediss://myapp.redis.cache.windows.net:6380"
  REDIS_TIMEOUT_MS: Number(process.env.REDIS_TIMEOUT_MS ?? 5000),
  REDIS_TTL_DAYS: Number(process.env.REDIS_TTL_DAYS ?? 30),
} as const;
```

**Environment examples:**

```bash
# Local development (no Redis needed)
# Leave REDIS_URL unset

# Azure Cache for Redis (Premium tier with TLS)
REDIS_URL=rediss://myapp.redis.cache.windows.net:6380
REDIS_PASSWORD=<access-key>
REDIS_TIMEOUT_MS=5000
REDIS_TTL_DAYS=30

# Or with connection string from Azure portal
REDIS_URL=rediss://:defaultkey@myapp.redis.cache.windows.net:6380
```

---

### 4. **Middleware Chain — NO CHANGES NEEDED**

The auth middleware and orgAllowlist middleware run before routes, populate `req.user` with UserClaims. Routes then use `req.user.oid` and `req.user.tid` to populate store fields.

**Data flow:**

```
Request → CORS → JSON → [/health: skip auth] or [/api: auth → orgAllowlist] → Route
                                                                                  ↓
                                                             Route accesses req.user
                                                                    ↓
                                                      Populates StoredConversation
                                                                    ↓
                                                             Store.set() (any backend)
```

---

## New vs Modified Components

| Component | Status | Scope |
|-----------|--------|-------|
| `server/src/store/RedisStore.ts` | NEW | Redis implementation of ConversationStore interface |
| `server/src/store/createStore.ts` | NEW | Factory function for store selection |
| `shared/src/schemas/storedConversation.ts` | MODIFIED | Add userId, tenantId, createdAt, updatedAt, status |
| `server/src/routes/chat.ts` | MODIFIED | Populate new StoredConversation fields in /start, /send, /card-action |
| `server/src/app.ts` | MODIFIED | Enhance /health with Redis ping check |
| `server/src/config.ts` | MODIFIED | Add REDIS_URL, REDIS_TIMEOUT_MS, REDIS_TTL_DAYS |
| `server/src/store/index.ts` | MODIFIED | Use createStore() factory instead of hardcoded InMemoryStore |
| `server/.env.example` | MODIFIED | Add REDIS_URL (optional) |
| Tests (new) | NEW | RedisStore unit tests, health check integration tests |

---

## Build Order & Dependency Chain

**Phase 1 (Foundation — 1-2 days)**
1. Expand StoredConversation schema in shared/
   - Add userId, tenantId, createdAt, updatedAt, status fields
   - Rebuild shared/ (`npm run build`)
2. Create ConversationStore interface additions (listByUser, delete, ping)
3. Create RedisStore.ts implementation
   - Imports: ioredis, ConversationStore interface
   - Implements all interface methods

**Phase 2 (Integration — 1-2 days)**
4. Create createStore.ts factory
   - Depends on: RedisStore, InMemoryStore
   - Returns ConversationStore (works with both)
5. Update store/index.ts to use createStore()
   - No route changes yet
6. Add config vars (REDIS_URL, REDIS_TIMEOUT_MS, REDIS_TTL_DAYS)
7. Update .env.example with Redis vars

**Phase 3 (Routes & Health — 1 day)**
8. Modify chat.ts routes to populate new fields from req.user
   - userId: req.user.oid
   - tenantId: req.user.tid
   - createdAt, updatedAt: Date.now()
   - status: 'active'
9. Enhance /health endpoint with Redis ping
10. Update app.ts to handle 503 from health check

**Phase 4 (Testing — 1 day)**
11. Unit tests for RedisStore
    - get/set/delete with JSON serialization
    - Sorted set operations (listByUser, listByUserRange)
    - TTL expiry edge cases
12. Integration tests for store factory
    - Verify InMemoryStore used when REDIS_URL unset
    - Verify RedisStore used when REDIS_URL set
13. Health check tests
    - 200 when Redis connected
    - 503 when Redis unavailable
14. End-to-end test with live Redis (or mock via testcontainers)

**Dependency graph:**

```
shared schema expansion
        ↓
   RedisStore ─┐
        ↓      ├─→ createStore factory
   InMemoryStore─┘
        ↓
   store/index.ts update
        ↓
   chat.ts route updates + config updates
        ↓
   app.ts health check update
        ↓
   Tests
```

---

## Failure Modes & Resilience

### Scenario 1: Redis Unavailable on Startup

**Current behavior:** `createStore()` returns InMemoryStore, app boots successfully.
**Desired behavior (v1.4):** If REDIS_URL is set but unreachable, fail fast.

**Solution:** Test connection in createStore() or health check:

```typescript
export async function createStore(): Promise<ConversationStore> {
  if (config.REDIS_URL) {
    const redisClient = new Redis(config.REDIS_URL, { /* ... */ });

    // Fail fast if Redis unavailable
    try {
      await redisClient.ping();
    } catch (err) {
      console.error('[store] FATAL: Redis unavailable but REDIS_URL is set');
      process.exit(1);
    }

    return new RedisStore(redisClient);
  }
  return new InMemoryConversationStore();
}
```

**Rationale:** Prevents silent data loss (InMemory fallback would lose all conversations on restart).

---

### Scenario 2: Redis Network Timeout During Request

**Current behavior:** Route handler hangs, client sees timeout.
**Desired behavior:** Fast-fail with 503 Service Unavailable.

**Solution:** Set timeouts on ioredis client:

```typescript
const redisClient = new Redis(config.REDIS_URL, {
  connectTimeout: 5000,       // 5 second connection timeout
  commandTimeout: 5000,       // 5 second command timeout
  retryStrategy: () => null,  // Don't retry, fail fast
  maxRetriesPerRequest: 0,    // 0 retries
});

redisClient.on('error', (err) => {
  console.error('[store] Redis command failed:', err);
  // Application continues but /health check returns 503
});
```

**Impact:** Routes receive immediate error from RedisStore.get/set, catch block sends 502. Observability tools see pattern and alert.

---

### Scenario 3: Conversation Key Expires in Redis

**Current behavior:** Store.get(id) returns undefined, route sends 404.
**Desired behavior:** Same — expected behavior for TTL.

**TTL strategy:**

- Primary key (conversation:{externalId}): 30 days
- Sorted set index: no explicit TTL, cleaned up when primary expires
- Soft-delete via status field: archive without TTL override

**For longer-lived sessions:** Implement "touch on read" to extend TTL:

```typescript
async get(id: string): Promise<StoredConversation | undefined> {
  const json = await this.client.get(`conversation:${id}`);
  if (json) {
    // Extend TTL on each read (e.g., sliding window)
    await this.client.expire(`conversation:${id}`, 30 * 24 * 60 * 60);
  }
  return json ? JSON.parse(json) : undefined;
}
```

---

## Scalability Considerations

### Single Instance

- InMemoryStore: LRU evicts after 100 conversations
- RedisStore: Limited by Redis memory, typically 1-10GB per instance

### Multiple Instances Behind Load Balancer

**InMemoryStore:** Each instance has separate LRU cache, conversations not shared.
- User A starts conversation on Instance 1
- Load balancer routes User A to Instance 2
- Instance 2 has no conversation (404)
- Broken experience

**RedisStore:** All instances read/write same Redis:
- User A starts conversation on Instance 1 → written to Redis
- Load balancer routes User A to Instance 2
- Instance 2 reads from Redis (same store) → found
- Seamless experience, rolling deploys work

### At 10K+ Active Conversations

- **InMemoryStore:** Single instance max ~100 (LRU limit)
- **RedisStore:** ~10K on single 1GB Redis, ~100K on 10GB, ~1M+ on cluster

**Sorted set queries (listByUser):**
- 10 instances, 1000 convs/user: ZRANGE in O(log 10000 + 1000) milliseconds
- 100 instances, 10K convs/user: Same O(log 100000 + 10000) 10-20ms
- Redis Cluster: Sharding spreads load across nodes

---

## Architecture Decision Record

| Decision | Rationale | Implication |
|----------|-----------|------------|
| Use ConversationStore interface (no change for Redis) | Minimizes route impact, leverages existing abstraction | Routes never import Redis types |
| Factory pattern (createStore) | Single decision point, testable, extensible | Easy to add other stores later |
| JSON.stringify/parse (not Redis JSON module) | Keeps stack simple, no module dependency | Slightly more CPU on serialization, negligible vs network latency |
| Sorted sets for secondary index | Enables efficient range queries, O(log N) lookups | Need to maintain both primary key + sorted set |
| TTL on primary key only | Consistent expiry logic, no orphaned indexes | Sorted set entries stale after primary expires (not a problem) |
| Graceful failure (503, not fallback) | Honest about dependencies, prevents silent data loss | Deployments must address Redis availability |
| Config vars (REDIS_URL, TTL_DAYS) | Deployment flexibility, different TTLs per environment | More env vars, but documented in .env.example |

---

## Known Limitations & Future Work

### v1.4 Scope Limitations

- No Redis Cluster support yet — single Redis instance only
- No conversation archival UI — status field added but no endpoints
- No encryption at rest — Redis data unencrypted
- No pub/sub for real-time updates — InMemory also lacks this

### Potential v1.5+ Enhancements

- Distributed locks (via Redis) — prevent concurrent writes to same conversation
- Lua scripting — atomic multi-operation updates
- Keyspace notifications — emit events when conversations expire
- Persistence strategy — AOF (every second) for crash recovery, RDB dumps for backups

---

## Sources

### Core Research

- [Express.js Tutorial (2026): Practical, Scalable Patterns](https://thelinuxcode.com/expressjs-tutorial-2026-practical-scalable-patterns-for-real-projects/)
- [ioredis GitHub Repository](https://github.com/redis/ioredis)
- [Redis Secondary Indexing Patterns](https://redis.io/docs/latest/develop/clients/patterns/indexes/)
- [Redis Sorted Sets Documentation](https://redis.io/docs/latest/develop/data-types/sorted-sets/)
- [Factory Method Pattern in TypeScript and Node.js](https://medium.com/@diegomottadev/factory-method-pattern-implementation-using-typescript-and-node-js-6ac075967f22)

### Persistence & TTL

- [Redis TTL Management](https://redis.io/docs/latest/commands/expire/)
- [Redis Persistence Options (RDB vs AOF)](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Managing Key Expiration in Redis with JavaScript](https://codesignal.com/learn/courses/mastering-redis-for-high-performance-applications-with-nodejs/lessons/managing-key-expiration-in-redis-with-javascript)

### Health Checks & Monitoring

- [ioredis Connection Pooling Guide](https://www.w3tutorials.net/blog/ioredis-connection-pool-nodejs-example/)
- [redis-healthcheck npm Package](https://www.npmjs.com/package/redis-healthcheck)
- [How to Configure Connection Pooling for Redis](https://oneuptime.com/blog/post/2026-01-25-redis-connection-pooling/view)

### Multi-Instance Scaling

- [Redis for Multi-Tenant Applications](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/service/cache-redis)
- [Scaling Stateful Services with Redis](https://medium.com/@jayanthpawar18/redis-beyond-caching-deploying-stateful-services-to-scale-backend-systems-b6f07dc0e9a9)
- [Horizontal Scaling with Redis Pub/Sub](https://medium.com/walkme-engineering/horizontal-scaling-of-a-stateful-server-with-redis-pub-sub-fc56c875b1aa)

### JSON Serialization

- [Caching JSON Data in Redis with Node.js](https://www.geeksforgeeks.org/node-js/how-to-cache-json-data-in-nodejs/)
- [Redis JSON Data Type Documentation](https://redis.io/docs/latest/develop/data-types/json/)
- [RedisOM for Node.js](https://redis.io/docs/latest/integrate/redisom-for-node-js/)

---

**Last Updated:** 2026-02-21
**Status:** Research Complete — Ready for Phase Planning
