# Redis v1.4 → Roadmap Bridge

**Purpose:** Translate research findings into roadmap phase structure and decisions

---

## Quality Gate: PASS

All downstream consumer requirements met:

- [x] **Table stakes vs differentiators clearly categorized** — REDIS_FEATURES.md, Feature Landscape section
- [x] **Complexity noted per feature** — LOW/MEDIUM/HIGH in prioritization matrix
- [x] **Dependencies on existing codebase identified** — Dependency Notes + "Dependencies on Existing Codebase" column in feature tables

---

## Feature Categorization (for Phase Planning)

### Must Launch With (v1.4 P1)

These 12 features are non-negotiable for production Redis adoption and v1.5 orchestrator readiness.

**Grouped by implementation area:**

#### Storage Backend (Phase 1)
1. **Conversation persistence across restarts** — Redis hash backend (replaces LRU)
2. **Per-user conversation isolation** — userId field, JWT-scoped queries
3. **Retrieve conversation by ID** — Redis HGETALL
4. **Expanded state model** — StoredConversation schema extended (userId, tenantId, status, timestamps)
5. **Activity timestamps** — createdAt, updatedAt, lastAccessedAt on every mutation

#### Reliability & Operations (Phase 1)
6. **Time-bound conversation expiry (TTL)** — Redis EXPIRE command, configurable duration
7. **Health endpoint reports Redis status** — /health PING + latency reporting
8. **Graceful failure when Redis unavailable** — Return 503, never silent degrade
9. **Connection pooling & reconnection** — ioredis defaults (enableOfflineQueue, maxRetriesPerRequest)
10. **TLS connection to Azure** — Port 6380, servername SNI

#### New API Surface (Phase 2)
11. **List conversations for a user** — POST /api/chat/list-conversations with pagination
12. **Factory pattern (Redis vs in-memory)** — StoreFactory based on REDIS_URL env var

**Complexity:**
- Phase 1 (storage): 10 features, MEDIUM-HIGH complexity (requires ConversationStore refactor, schema extension, new unit tests)
- Phase 2 (listing): 2 features, MEDIUM complexity (new endpoint, secondary index queries)

**Implementation assumption:** Phase 1 is 2–3 planning sessions; Phase 2 is 1 planning session.

---

### Nice to Have After Launch (v1.4.x P2)

These 2 features add value after core Redis persistence is proven. Not required for v1.4 launch.

**Grouped by impact:**

#### Orchestrator Readiness (Phase 2.x, deferred)
1. **Conversation status tracking** — PATCH endpoint to mark active/completed/archived
2. **Batch operations & atomic updates** — ioredis pipeline() for concurrent write safety

**When to add:** After v1.5 orchestrator is in development and needs status field mutations. Likely v1.4.x patch release.

---

### Explicitly Out of Scope (Defer to v2+)

These 6 features are anti-patterns or out of current scope. Document why, don't implement.

| Feature | Why Deferred |
|---------|--------------|
| Silent fallback to in-memory | Masks data corruption. Fail-closed is safer. |
| Unlimited conversation history | Unbounded memory growth. TTL + archival are better. |
| Real-time multi-user conversations | Architecture change. v1 is single-user. Revisit v2. |
| Auto-compression/summarization | High cost, unproven ROI. TTL is simpler. |
| Full-text search | Requires external service (Elasticsearch, etc.). v2 feature. |
| Sharding across instances | Azure Cache handles this in Premium tier. No app-side work. |

---

## Codebase Dependencies (Critical for Planning)

### v1.2 Dependencies (Auth)

**v1.4 requires and depends on v1.2 JWT extraction:**

```typescript
// Existing in v1.2, used by v1.4 Redis store
const userId = token.sub;      // Required for user:userId:conversations index
const tenantId = token.tid;    // Required for StoredConversation.tenantId field
```

**Action for roadmap:** No changes needed. v1.2 is already shipped. Phase 1 simply consumes userId/tenantId from existing middleware.

### v1.3b Dependencies (State Schema)

**v1.4 extends StoredConversation schema (currently in shared/):**

Current (v1.3b):
```typescript
{
  id: string
  externalId: string
  sdkConversationRef: string
  history: NormalizedMessage[]
}
```

Extended (v1.4):
```typescript
{
  // Existing fields
  id: string
  externalId: string
  sdkConversationRef: string
  history: NormalizedMessage[]

  // New fields for Redis + orchestrator
  userId: string              // From JWT sub
  tenantId: string            // From JWT tid
  status: 'active' | 'completed' | 'archived'
  createdAt: string           // ISO8601
  updatedAt: string           // ISO8601
  lastAccessedAt: string      // ISO8601
}
```

**Action for roadmap:** Phase 1 updates `shared/src/schema/conversation.ts`. Client and server both receive new fields. Non-breaking change (all new fields have defaults).

### ConversationStore Interface

**v1.4 keeps existing interface, swaps implementation:**

```typescript
// server/src/types/store.ts (unchanged interface)
interface ConversationStore {
  get(id: string): Promise<StoredConversation | null>;
  set(id: string, conversation: StoredConversation): Promise<void>;
  delete(id: string): Promise<void>;
}
```

**Action for roadmap:** No API contract changes. Phase 1 implements RedisConversationStore and InMemoryConversationStore (both satisfy interface).

---

## Feature Complexity Mapping (for Estimation)

### Phase 1: Storage Layer (10 features)

| Feature | Complexity | Dev Tasks | Test Tasks |
|---------|------------|-----------|-----------|
| Conversation persistence + Per-user isolation | MEDIUM | Redis hash ops, factory pattern, schema extension | Unit: get/set/delete; Integration: start/send |
| TTL + Graceful failure | LOW-MEDIUM | EXPIRE command, error handlers | Unit: TTL mock; Integration: Redis unavailable |
| Health endpoint | LOW | PING command, status reporting | Unit: Redis health check |
| Connection pooling + TLS | LOW | ioredis config | Unit: connection lifecycle |
| **Total Phase 1** | **MEDIUM** | **~40–60 hrs dev** | **~20–30 hrs test** |

### Phase 2: Listing (2 features)

| Feature | Complexity | Dev Tasks | Test Tasks |
|---------|------------|-----------|-----------|
| List conversations + Factory pattern | MEDIUM | Sorted set index, pagination, StoreFactory | Unit: list query; Integration: user isolation |
| **Total Phase 2** | **MEDIUM** | **~20–30 hrs dev** | **~10–15 hrs test** |

**Total v1.4 (Phases 1 + 2):** ~80–100 dev hrs + ~35–45 test hrs (2–3 week sprint for 1–2 FTE engineers).

---

## Anti-Pattern Trap Prevention Checklist

Use this during Phase 1 code review to prevent ecosystem pitfalls:

- [ ] **Every conversation key has TTL set** — Verify EXPIRE is called after HSET in create/update paths
- [ ] **No KEYS pattern queries** — All user-scoped listing uses sorted set `user:{userId}:conversations`, not KEYS scan
- [ ] **Concurrent writes use pipeline()** — Message appends on /send use atomic LPUSH or pipeline, not read-modify-write
- [ ] **503 on Redis failure, no silent fallback** — Catch Redis.ClientClosedError, return 503, don't catch-and-use-in-memory
- [ ] **Connection pool configured** — ioredis defaults (enableOfflineQueue, maxRetriesPerRequest, enableReadyCheck) in use
- [ ] **Memory usage monitored** — Dev environment memo: watch redis-cli INFO memory during testing

---

## Assumptions & Rollout Strategy

### Assumptions Embedded in Features

1. **User-scoped data:** Each conversation belongs to exactly one user (userId). No multi-user shared conversations in v1.
2. **Fail-closed is acceptable:** 503 on Redis failure is preferable to silent data inconsistency. Ops will prioritize Redis reliability.
3. **Azure Cache for Redis available:** Development with either local redis-server or Azure Standard tier. No other Redis flavor.
4. **Existing ConversationStore interface sufficient:** No new methods (search, filter, etc.) needed for v1.4. Defer to v2.

### Rollout: In-Memory → Redis

**Phase 1 (v1.4 MVP):**
- Launch with Redis backend in production
- In-memory backend available for local dev (via StoreFactory, REDIS_URL not set)
- Warning logged: "⚠️ REDIS_URL not set. Using in-memory store. Data will be lost on restart."

**Phase 2 (v1.4.x, after validation):**
- Optional: Conversation list UI (requires POST /api/chat/list-conversations)
- Optional: Status tracking for orchestrator

**Pre-production data migration:** Not in scope for v1.4. Greenfield deployment assumed. If migrating from production LRU, implement archival pipeline separately.

---

## Risk Register (Inform Phase Planning)

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| Redis memory bloat (no TTL) | LOW | HIGH | Checkpoint: All keys have EXPIRE. Code review gate. | Dev |
| Latency regression (Redis slower than memory) | MEDIUM | MEDIUM | Measure: target <10ms get, <20ms set. Azure Premium if slow. | Ops |
| Concurrent write race condition | LOW | HIGH | Atomicity: Use pipeline() or LPUSH (atomic). Test concurrent sends. | Dev |
| Azure Cache connection issues (TLS, SNI) | MEDIUM | MEDIUM | Azure quickstart example. Test in non-prod first. Debug: check ioredis logs. | Ops |
| Silent in-memory fallback on Redis down | HIGH | CRITICAL | Design: No fallback code. Return 503. Ops alert. | Dev + Ops |
| Data loss on TTL expiry (business concern) | LOW | MEDIUM | Default 30 days. Configurable. Document data retention policy. | PM |

---

## Quality Assurance Checklist (Phase Planning)

### Functional Testing
- [ ] Redis HGETALL returns complete StoredConversation with all new fields
- [ ] userId isolation: Queries for userId A return only A's conversations
- [ ] TTL expiry: Conversation auto-deleted after TTL seconds
- [ ] /api/chat/list-conversations returns paginated list sorted by recency
- [ ] /health reports Redis latency and status correctly
- [ ] 503 returned when Redis unavailable (not 5xx on in-memory fallback)

### Non-Functional Testing
- [ ] Latency: get <10ms, set <20ms on Azure Redis
- [ ] Concurrency: 10 simultaneous /send requests don't corrupt conversation
- [ ] Connection pool: No connection leaks after 1000+ requests
- [ ] TTL refresh: Conversation TTL reset on activity (sliding window or fixed)

### Security Testing
- [ ] userId A cannot GET conversations of userId B
- [ ] StoredConversation.history (NormalizedMessage[]) cannot be modified by user
- [ ] No PII leakage in /health endpoint response

### Operational Readiness
- [ ] Env var documentation (.env.example) includes REDIS_URL, REDIS_TTL, REDIS_HOSTNAME, REDIS_PASSWORD
- [ ] /health check works with Azure Cache TLS connection
- [ ] Error logs clear when Redis unavailable (not cryptic connection errors)
- [ ] Graceful shutdown: Redis connection closed properly on process termination

---

## Downstream Handoff: For Roadmap Orchestrator

**Phase structure recommended:**

```
v1.4: Redis Persistent State Store

├─ Phase 1: Storage Layer (2–3 weeks)
│  ├─ Subtask: Redis backend + factory pattern
│  ├─ Subtask: Schema extension (userId, tenantId, status, timestamps)
│  ├─ Subtask: Health endpoint + graceful failure
│  └─ Subtask: TLS + ioredis configuration
│
└─ Phase 2: User-Scoped Listing (1 week, optional)
   ├─ Subtask: POST /api/chat/list-conversations
   └─ Subtask: Sorted set secondary index
```

**Quality gate before roadmap approval:**
- All 12 P1 features mapped to subtasks
- Codebase dependencies (v1.2 JWT, v1.3b schema) acknowledged
- Anti-pattern traps documented in dev guidelines
- Risk register reviewed with team

**Estimated effort:** 80–100 dev hrs + 35–45 test hrs (2–3 FTE weeks)

**Unblocks:** v1.5 Workflow Orchestrator (requires expanded state model from Phase 1)

---

*Roadmap bridge document: 2026-02-21*
*For use by orchestrator in Phase 1–2 planning*
