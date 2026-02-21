# Feature Research: Redis Persistent State Store

**Domain:** Chat conversation persistence with Redis backend for v1.4 milestone
**Researched:** 2026-02-21
**Confidence:** HIGH

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = conversations lost on server restart, data not retrievable after deploy. **Critical for production chat systems.**

| Feature | Why Expected | Complexity | Dependencies on Existing Codebase |
|---------|--------------|------------|-----------------------------------|
| **Conversation persistence across restarts** | Users expect chat history survives server deployments and restarts. In-memory LRU only = data loss. | MEDIUM | Replaces `server/src/store/conversationStore.ts` (LRU implementation). Implements ConversationStore interface. |
| **Per-user conversation isolation** | Users expect to see only their own conversations, not other users' data. Foundational security requirement. | MEDIUM | Extends StoredConversation schema with userId field. JWT middleware (v1.2) already extracts userId from token (`sub` claim). Routes pass to store. |
| **Time-bound conversation expiry (TTL)** | Conversations should not live forever (storage costs, compliance). Users don't want stale conversations indefinitely. | LOW | Redis EXPIRE command on conversation key. Configurable via REDIS_TTL env var (default 30 days = 2592000 sec). |
| **Health endpoint reports Redis status** | Ops teams expect /health to indicate if critical dependencies (Redis) are available. Silent failures are dangerous. | LOW | Extend existing `server/src/routes/health.ts`. Add PING command, report Redis latency. Include `redisStatus: 'healthy' | 'unhealthy'`. |
| **Graceful failure when Redis unavailable** | System should not silently degrade to stale data. User expects clear error (503), not masked corruption. | MEDIUM | Return 503 Unavailable when Redis connection fails. Never silently fall back to in-memory (masked data consistency risk). Routes catch Redis errors, return 503. |
| **Retrieve conversation by ID** | Core operation: client sends conversationId, server retrieves state. Same interface as current ConversationStore.get(). | LOW | Redis HGETALL on `conversation:{conversationId}` key. Return StoredConversation object. No changes to API contract (post-store refactor). |
| **List conversations for a user** | Users expect to see all their past conversations in a UI list. New feature, powers conversation list UI. | MEDIUM | New endpoint: POST /api/chat/list-conversations with userId (from JWT). Uses Redis sorted set `user:{userId}:conversations` secondary index. Return paginated list with metadata. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable for v1.5 workflow orchestrator and multi-turn state tracking.

| Feature | Value Proposition | Complexity | Dependencies on Existing Codebase |
|---------|-------------------|------------|-----------------------------------|
| **Expanded state model (userId, tenantId, status, timestamps)** | Workflow orchestrator (v1.5) needs to track multi-turn state, user context, conversation lifecycle. Current StoredConversation omits this. | MEDIUM | Add to `shared/src/schema/conversation.ts` StoredConversation: userId (string), tenantId (string), status ('active'\|'completed'\|'archived'), createdAt (ISO8601), updatedAt (ISO8601). Routes populate from JWT claims + server timestamps. |
| **Conversation status tracking** | Mark conversations as active, completed, or archived. Enables workflow orchestrator to skip completed conversations, manage lifecycle. | MEDIUM | Add status field to StoredConversation. Initialize to 'active' on /api/chat/start. New endpoint /api/chat/conversation/:id/status (PATCH) to update. |
| **Activity timestamps (created, updated, last accessed)** | Enables sorting by recency, detecting stale conversations, compliance audits. Required for listByUser sorting. | LOW | Add createdAt (set at /start), updatedAt (refreshed on /send, /card-action), lastAccessedAt (refreshed on any operation). Set via server time (not client). |
| **Factory pattern: auto-select Redis vs in-memory** | Development without Redis credentials should work; production with Redis should enforce it. Single codebase for both. | MEDIUM | Export StoreFactory in `server/src/store/storeFactory.ts`: `getStore(redisUrl?: string): ConversationStore`. If REDIS_URL env var, instantiate RedisStore; else InMemoryStore (with deprecation warning for prod). |
| **Connection pooling and reconnection strategy** | High availability: ioredis handles connection pooling, auto-reconnect with exponential backoff, cluster failover. | LOW | Use ioredis defaults: `enableOfflineQueue: true`, `maxRetriesPerRequest: 3`, `enableReadyCheck: true`. Cluster mode for production (Azure Cache for Redis Premium). |
| **TLS connection to Azure Redis** | Production requirement. Azure Cache for Redis requires TLS on port 6380. ioredis must validate servername for SNI. | LOW | ioredis config: `{ port: 6380, tls: { servername: host } }`. Read REDIS_HOSTNAME and REDIS_PASSWORD from env vars. |
| **Batch operations and atomic updates** | Ensure message appends and status updates don't conflict. Redis pipelines guarantee atomic execution. | MEDIUM | Use ioredis `pipeline()` for multi-command sequences (e.g., HSET fields + ZADD sorted set in one transaction). Test race conditions between concurrent send requests. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Avoid scope creep.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Silent fallback to in-memory when Redis unavailable** | "Don't break the chat if Redis is down." Sounds good for uptime. | Hidden data corruption: in-memory store loses data on restart, user sees conversations disappear later when Redis comes back. Violates fail-closed principle (v1.2 auth). Harder to debug. | Return 503 with clear error. Ops must fix Redis. If Redis is truly optional, document explicitly (not production-ready). |
| **Unlimited conversation history per user** | "Store all messages forever for compliance audits." | Unbounded memory growth, exponential slowdown on listByUser queries, expensive to retrieve. Redis memory finite. | Combine TTL (default 30 days) + configurable archival to cold storage (Azure Blob Storage, not Redis). Use conversation count limits per user if compliance requires older data. |
| **Real-time multi-user conversations** | "Multiple users in same conversation like Slack." | Out of scope for v1.4 (v1.5 orchestrator is single-user per conversationId). Requires pub/sub, conflict resolution, concurrent writes. Architecture change. | Defer to v2 (real-time milestone). Keep v1.4 single-user per conversationId. |
| **Automatic compression/summarization of old messages** | "Save space by summarizing early messages in conversation." | Requires LLM inference on every conversation, significant token cost, loss of original data, hard to undo. Not proven to save cost vs. TTL. | Use TTL instead. If compliance requires archival, compress at archive time (cold storage pipeline). |
| **Full-text search on conversation content** | "Search all past conversations for keywords." | Redis has no full-text search (Redis Search is premium add-on, not in Azure). Requires additional infrastructure (Elasticsearch, Milvus). | Defer to v2 or use cloud search service (Azure Cognitive Search). For v1.4, list by metadata only (user, status, timestamp). |
| **Sharding conversations across multiple Redis instances** | "Scale horizontally when one Redis hits limits." | Adds operational complexity, requires key distribution logic, makes testing harder. Azure Cache for Redis handles sharding internally (Premium tier cluster mode). | Use Azure Cache for Redis Premium (cluster mode) instead. Let managed service handle sharding. One connection endpoint from app perspective. |
| **Secondary cache (fallback to in-memory on Redis latency)** | "Reduce latency by checking in-memory cache first." | Adds complexity (cache coherence, invalidation), risk of stale data if in-memory diverges from Redis. Redis is already fast (sub-millisecond). | Optimize Redis latency first (Azure Cache Premium, connection pooling). If latency is a problem, measure before adding complexity. |

---

## Feature Dependencies

```
Graceful Failure When Redis Unavailable
    └──requires──> Health Endpoint Reports Redis Status
    └──requires──> Connection Pooling & Reconnection Strategy

Per-User Conversation Isolation
    └──requires──> Expanded State Model (userId field)
    └──requires──> JWT middleware (v1.2) provides userId extraction

List Conversations for a User
    └──requires──> Per-User Conversation Isolation
    └──requires──> Activity Timestamps (for sorting by recency)
    └──enhances──> Conversation Status Tracking

Factory Pattern (Redis vs In-Memory)
    └──requires──> Conversation Persistence Across Restarts
    └──requires──> Graceful Failure When Redis Unavailable
    └──enhances──> Retrieve Conversation by ID

Conversation Status Tracking
    └──requires──> Expanded State Model (status field)
    └──requires──> Activity Timestamps
    └──enhances──> Workflow Orchestrator (v1.5) lifecycle management

Batch Operations & Atomic Updates
    └──enhances──> Conversation Persistence Across Restarts
    └──prevents──> Race conditions in concurrent /send requests

TLS Connection to Azure Redis
    └──required by──> Production deployment
    └──dependency──> ioredis with servername config
```

### Dependency Notes

- **Graceful Failure requires Health Endpoint:** /health must report Redis status so ops know when to fail requests. Without it, 503 responses seem random.
- **Per-User Isolation requires userId field:** Current StoredConversation (v1.3b) has no userId. Must add to schema in `shared/`. Existing JWT middleware (v1.2) already extracts userId (sub claim) and tenantId (tid claim).
- **List Conversations requires Activity Timestamps:** Can't sort by recency without updatedAt/lastAccessedAt. Redis sorted sets use score (timestamp) for ordering.
- **Factory Pattern enables testing:** Developers run tests with in-memory store (no Redis credentials), production uses Redis. Prevents local dev friction.
- **Status Tracking feeds v1.5:** Workflow orchestrator needs to track conversation state across multi-turn interactions. v1.4 adds the schema; v1.5 consumes it.
- **TLS Connection is mandatory for Azure:** Azure Cache for Redis requires TLS on port 6380. Standard Redis port 6379 will not work on Azure managed service.

---

## MVP Definition

### Launch With (v1.4)

Minimum viable product for Redis persistence. What's needed to:
1. Replace in-memory LRU store for production
2. Support v1.5 workflow orchestrator (expanded state model)
3. Pass operational readiness (health checks, graceful failure)

- [x] **Conversation persistence across restarts** — Core requirement. Server restarts no longer lose data. Replaces existing LRU ConversationStore implementation.
- [x] **Per-user conversation isolation** — Security requirement. userId from JWT scopes all queries. JWT middleware (v1.2) provides extraction.
- [x] **Time-bound conversation expiry (TTL)** — Compliance/storage cost. Default 30 days (configurable via REDIS_TTL env var).
- [x] **Health endpoint reports Redis status** — Operational requirement. Extend /health to PING Redis, report status + latency.
- [x] **Graceful failure when Redis unavailable** — Fail-closed principle. Return 503, never silently degrade to in-memory.
- [x] **Retrieve conversation by ID** — Existing API (start, send, card-action routes use this). Store implementation swap.
- [x] **List conversations for a user** — New endpoint POST /api/chat/list-conversations. Enables conversation list UI.
- [x] **Expanded state model (userId, tenantId, status, timestamps)** — Required for v1.5 orchestrator. New fields in StoredConversation schema.
- [x] **Activity timestamps (created, updated)** — Needed for listByUser sorting, compliance, orchestrator context.
- [x] **Factory pattern: auto-select Redis vs in-memory** — Dev/prod consistency. StoreFactory.getStore() based on REDIS_URL env var.
- [x] **Connection pooling and reconnection strategy** — ioredis defaults handle (enableOfflineQueue, maxRetriesPerRequest, enableReadyCheck).
- [x] **TLS connection to Azure Redis** — Production requirement. ioredis config with servername for SNI on port 6380.

### Add After Validation (v1.4.x)

Features to add once core persistence is working and v1.5 orchestrator needs them.

- [ ] **Conversation status tracking** — Orchestrator marks conversations completed/archived. Endpoint PATCH /api/chat/conversation/:id/status.
- [ ] **Batch operations and atomic updates** — High concurrency testing. ioredis pipelines for atomic multi-command sequences.

### Future Consideration (v2+)

Features to defer until after workflow orchestrator ships and scaling/search becomes business priority.

- [ ] **Conversation search/filtering by workflow state** — Requires secondary indices, complex queries. v1.5 uses status field, v2 adds full search.
- [ ] **Real-time multi-user conversations** — Out of scope for single-user v1.
- [ ] **Full-text search on conversation content** — Requires external search service (Elasticsearch, Azure Cognitive Search).
- [ ] **Automatic compression/summarization** — High cost/complexity. Use TTL instead.
- [ ] **Secondary cache (fallback to in-memory on latency)** — Optimize Redis latency first, add caching only if needed.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Notes |
|---------|------------|---------------------|----------|-------|
| Conversation persistence | HIGH | MEDIUM | P1 | Core requirement. Replaces in-memory LRU. Needed for production. |
| Per-user isolation | HIGH | MEDIUM | P1 | Security requirement. userId from JWT (v1.2). |
| TTL (conversation expiry) | HIGH | LOW | P1 | Compliance, storage cost control. Redis EXPIRE command. |
| Health endpoint Redis status | HIGH | LOW | P1 | Operational requirement. /health → PING Redis. |
| Graceful failure on Redis down | HIGH | MEDIUM | P1 | Fail-closed principle. Return 503, never silent degrade. |
| Retrieve conversation by ID | HIGH | LOW | P1 | Existing API, just swap storage backend. |
| List conversations for user | MEDIUM | MEDIUM | P1 | New endpoint, enables conversation list UI. POST /api/chat/list-conversations. |
| Expanded state model | HIGH | MEDIUM | P1 | Required for v1.5 orchestrator. New fields in StoredConversation schema. |
| Activity timestamps | MEDIUM | LOW | P1 | Needed for sorting, compliance, orchestrator context. |
| Factory pattern (Redis vs in-memory) | MEDIUM | MEDIUM | P1 | Dev/prod consistency. Single codebase, env-var switch via StoreFactory. |
| Connection pooling | MEDIUM | LOW | P1 | ioredis handles automatically. Use defaults. |
| TLS connection (Azure) | HIGH | LOW | P1 | Production requirement. Port 6380, servername for SNI. |
| Conversation status tracking | MEDIUM | MEDIUM | P2 | Orchestrator feature, not core persistence. v1.4.x. |
| Batch operations/atomicity | MEDIUM | MEDIUM | P2 | High concurrency edge case. Add after core working. ioredis pipelines. |
| Conversation search/filtering | LOW | HIGH | P3 | v2+. Complex queries, secondary indices. |
| Real-time multi-user | LOW | HIGH | P3 | Out of scope. Single-user v1. |
| Full-text search | LOW | HIGH | P3 | Requires external service. Defer. |
| Auto-compression | LOW | HIGH | P3 | High cost. TTL is better approach. |
| Secondary cache | LOW | MEDIUM | P3 | Optimize Redis latency first. Add only if needed. |

**Priority key:**
- **P1 (MVP):** Must have for v1.4 launch. Enables core persistence and v1.5 readiness.
- **P2 (v1.4.x):** Add after core is working. Orchestrator needs these features.
- **P3 (v2+):** Future consideration. Search, real-time, multi-user.

---

## Ecosystem Context: Why Redis for Chat Apps

### Redis Strengths for This Use Case

- **Fast:** In-memory, sub-millisecond retrieval. Chat latency-sensitive. No disk I/O during normal operations.
- **Atomic operations:** SET, HSET, LPUSH, ZRANGE are atomic. No transaction boilerplate. Prevents race conditions on concurrent writes.
- **TTL built-in:** EXPIRE command on any key. Conversation auto-cleanup after configurable duration. No manual cleanup jobs.
- **Sorted sets:** ZRANGE/ZREVRANGE for "list by recency" queries. One command vs. SELECT queries. Scales to millions of conversations.
- **Pub/sub ready:** v2 real-time requires pub/sub. Redis is designed for it. Avoid architectural mismatch later.

### Data Structure Choice: Hash

**Why hash (HSET/HGETALL) vs. String (SET/GET)?**

- **Hash:** Multiple fields per key (conversation ID → userId, tenantId, history, status, timestamps). Better organization, field-level operations (HSET to update one field). Atomic field updates.
- **String:** Entire conversation as JSON string. Simpler, but must deserialize JSON on every read. Can't update single fields without read-modify-write. Risk of race conditions on concurrent updates.

**Recommendation:** Use hash. Storage schema:
```
conversation:{conversationId}
  ├─ userId: string (required, from JWT sub claim)
  ├─ tenantId: string (required, from JWT tid claim)
  ├─ status: 'active' | 'completed' | 'archived' (default: 'active')
  ├─ externalId: string (Copilot Studio conversation ID)
  ├─ sdkConversationRef: string (SDK-internal reference)
  ├─ history: JSON string (NormalizedMessage[] from v1.0)
  ├─ createdAt: ISO8601 string (server timestamp at /start)
  ├─ updatedAt: ISO8601 string (refreshed on /send, /card-action)
  └─ lastAccessedAt: ISO8601 string (refreshed on any operation)

Secondary index (sorted set):
user:{userId}:conversations
  ├─ member: conversation:{conversationId}
  └─ score: updatedAt timestamp (for ZREVRANGE to sort by recency)
```

### Failover & High Availability

**Development:** In-memory store (no Redis, no credentials).
**Production (Azure):** Azure Cache for Redis.
- **Standard tier:** 99.9% SLA, single node. Good for dev/test.
- **Premium tier:** Cluster mode, 99.95% SLA, automatic failover. Recommended for production.

**ioredis handles:**
- Connection pooling (reuse TCP connections).
- Auto-reconnect with exponential backoff (prevents thundering herd).
- Cluster failover (if cluster mode enabled).
- Offline queue (buffer commands while reconnecting, flush on reconnect).

**App side (v1.4):**
- Factory pattern selects Redis or in-memory based on REDIS_URL env var.
- /health endpoint PING Redis to detect issues early.
- Return 503 if Redis unavailable (no silent fallback).

### Anti-Pattern Traps to Avoid

**1. Keys without TTL**
- **Trap:** `HSET conversation:123 ... userId alice` with no EXPIRE = unbounded memory growth.
- **Fix:** Set EXPIRE at creation time. Default 30 days (2592000 sec). Refresh on activity if desired (sliding window).

**2. Insufficient Memory Provisioning**
- **Trap:** Azure Cache 1GB when data grows to 2GB = eviction, data loss.
- **Fix:** Monitor memory usage. Set Azure Cache max memory policy to `allkeys-lru` as fallback (but this is not ideal—better to provision enough).

**3. N+1 Queries**
- **Trap:** For each user, `KEYS conversation:*:{userId}` = slow on large datasets, blocks Redis single thread.
- **Fix:** Use sorted set secondary index. `ZREVRANGE user:{userId}:conversations 0 -1`. One command, O(log N) + O(M) complexity.

**4. Unbounded Conversation History**
- **Trap:** history field stores all messages ever, grows without bound.
- **Fix:** With TTL, conversation auto-expires after 30 days. No manual pruning needed. History never exceeds storage budget.

**5. Silent Redis Failure**
- **Trap:** If Redis connection fails, silently fall back to in-memory = user sees old data later when Redis comes back.
- **Fix:** Fail-closed. Return 503. Ops must fix Redis before chat works again. Prevents data consistency bugs.

**6. Concurrent Updates Without Atomicity**
- **Trap:** Read conversation, update history, write back = race condition if two requests concurrent.
- **Fix:** Use ioredis pipeline() for atomic multi-command sequences. Or use Redis LPUSH (atomic) for appending messages.

---

## Implementation Patterns

### Connection & Factory Pattern

```typescript
// server/src/store/storeFactory.ts
import Redis from 'ioredis';
import { ConversationStore } from '../types';
import { RedisConversationStore } from './redisConversationStore';
import { InMemoryConversationStore } from './inMemoryConversationStore';

export function getStore(redisUrl?: string): ConversationStore {
  const url = redisUrl || process.env.REDIS_URL;

  if (!url) {
    console.warn('⚠️  REDIS_URL not set. Using in-memory store. Data will be lost on restart.');
    return new InMemoryConversationStore();
  }

  const redis = new Redis(url, {
    enableOfflineQueue: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    tls: process.env.REDIS_HOSTNAME ? { servername: process.env.REDIS_HOSTNAME } : undefined,
  });

  redis.on('error', (err) => {
    console.error('Redis error:', err);
  });

  return new RedisConversationStore(redis);
}
```

### Health Check Integration

```typescript
// server/src/routes/health.ts (extend existing)
import { getStore } from '../store/storeFactory';

app.post('/health', async (req, res) => {
  const store = getStore();

  let redisStatus = 'healthy';
  let redisLatency = -1;

  if (store instanceof RedisConversationStore) {
    try {
      const start = Date.now();
      await store.ping(); // Redis PING command
      redisLatency = Date.now() - start;
    } catch (err) {
      redisStatus = 'unhealthy';
      return res.status(503).json({
        status: 'unhealthy',
        reason: 'Redis unavailable',
        redisStatus,
      });
    }
  }

  res.json({
    status: 'healthy',
    redisStatus,
    redisLatencyMs: redisLatency,
  });
});
```

### TTL Configuration

```typescript
// server/src/config.ts
const REDIS_TTL_SECONDS = parseInt(process.env.REDIS_TTL || '2592000'); // 30 days default

// On /api/chat/start
async function startConversation(userId: string, tenantId: string) {
  const conversationId = generateId();

  await store.set(conversationId, {
    id: conversationId,
    userId,
    tenantId,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // ...
  });

  // Set TTL
  await redis.expire(`conversation:${conversationId}`, REDIS_TTL_SECONDS);

  return { conversationId };
}
```

---

## Sources

**Core Redis persistence and patterns:**
- [Redis Blog: LangGraph & Redis — Build smarter AI agents with memory & persistence](https://redis.io/blog/langgraph-redis-build-smarter-ai-agents-with-memory-persistence/)
- [Redis: Use Azure Managed Redis to store LLM chat history](https://redis.io/learn/howtos/use-amr-store-llm-chat-history)
- [Redis Tutorials: Building a Real-Time Chat Application with Redis](https://redis.io/tutorials/howtos/chatapp/)

**TTL and expiration:**
- [DZone: Tutorial: Working with Node.js and Redis (Expire and TTL)](https://dzone.com/articles/tutorial-working-nodejs-and)
- [Redis Docs: TTL Command](https://redis.io/commands/ttl/)

**Data structures:**
- [Redis Docs: Data Structures](https://redis.io/technology/data-structures/)
- [Redis Docs: Hashes](https://redis.io/docs/latest/develop/data-types/hashes/)
- [Redis Docs: Sorted Sets](https://redis.io/docs/latest/develop/data-types/sorted-sets/)

**ioredis and Node.js:**
- [GitHub: redis/ioredis — A robust, performance-focused Redis client for Node.js](https://github.com/redis/ioredis)
- [OneUptime: Redis Connection Pooling (2026-01-25)](https://oneuptime.com/blog/post/2026-01-25-redis-connection-pooling/view)
- [Medium: Scaling Node.js with Redis — Singleton vs Factory Pattern](https://medium.com/@youssefsalah_74660/scaling-node-js-with-redis-in-cluster-mode-singleton-vs-factory-pattern-d7c8906fbdf5)
- [Medium: Reliable Redis Connections in Node.js — Lazy Loading, Retry Logic & Circuit Breakers](https://medium.com/@backendwithali/reliable-redis-connections-in-node-js-lazy-loading-retry-logic-circuit-breakers-5d8597bbc62c)

**Health checks and graceful degradation:**
- [OneUptime: How to Implement Health Checks in Node.js for Kubernetes (2026-01-06)](https://oneuptime.com/blog/post/2026-01-06-nodejs-health-checks-kubernetes/view)
- [LogRocket: How to implement a health check in Node.js](https://blog.logrocket.com/how-to-implement-a-health-check-in-node-js/)

**Anti-patterns and best practices:**
- [Redis: Anti-Patterns Every Developer Should Avoid](https://redis.io/learn/howtos/antipatterns)
- [Redis Blog: 7 Redis Worst Practices](https://redis.io/blog/7-redis-worst-practices/)
- [C# Corner: Redis Anti-Patterns — Common Mistakes That Break Performance, Reliability, and Trust](https://www.c-sharpcorner.com/article/redis-anti-patterns-common-mistakes-that-break-performance-reliability-and-tr/)
- [Reintech: Redis in Microservices Architecture — Patterns and Anti-Patterns](https://reintech.io/blog/redis-microservices-patterns-antipatterns)

**Azure Redis integration:**
- [Microsoft Learn: Connect to Azure Managed Redis with TypeScript in a Node.js app](https://learn.microsoft.com/en-us/azure/redis/nodejs-get-started)
- [GitHub: ioredis Issue #1149 — Connecting to an Azure Redis Cluster with TLS](https://github.com/redis/ioredis/issues/1149)

---

*Feature research for: Redis persistent state store (v1.4 milestone)*
*Researched: 2026-02-21*
