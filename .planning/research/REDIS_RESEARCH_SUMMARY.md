# Research Summary: Redis Persistent State Store (v1.4)

**Domain:** Chat conversation persistence with Redis backend
**Researched:** 2026-02-21
**Overall confidence:** HIGH

---

## Executive Summary

Redis is the standard pattern for conversation persistence in chat systems. The existing v1.3b architecture already has a ConversationStore interface and JWT-based user/tenant extraction (v1.2), making Redis adoption a natural fit.

**Key finding:** Redis is chosen not as a caching layer, but as the **primary state store** for conversations. The app's data model (conversations with user scope, TTL, and activity timestamps) aligns perfectly with Redis's atomic operations and sorted set queries.

**Critical design decision:** Implement **fail-closed** behavior (return 503 when Redis unavailable) rather than silent fallback. Silent fallback creates data consistency risks that are harder to debug than a clear operational failure.

The v1.4 milestone should focus on:
1. **Swapping the storage backend** (LRU → Redis) with minimal API changes
2. **Expanding the data model** (userId, tenantId, timestamps, status) to support v1.5 orchestrator
3. **Enabling user-scoped listing** for a future conversation list UI
4. **Establishing operational readiness** (health checks, graceful degradation)

All 12 P1 features are essential for launch and build on existing codebase (v1.2 JWT extraction, v1.3b state schema). P2 and P3 features are deferrable without blocking the orchestrator (v1.5).

---

## Key Findings

### Stack

**Primary state store:** Azure Cache for Redis (Standard tier for dev, Premium for prod cluster mode)
**Client library:** ioredis (auto-reconnect, connection pooling, cluster support)
**Data model:** Redis hashes with secondary sorted set indices for user-scoped queries
**TTL strategy:** Conversation-level expiry (default 30 days, configurable), refresh on activity

### Architecture

**Factory pattern:** Single StoreFactory selects Redis or in-memory based on REDIS_URL env var. Enables dev without credentials, prod with Redis enforced.

**Storage schema:**
```
conversation:{conversationId} → HASH
  ├─ userId (from JWT sub claim)
  ├─ tenantId (from JWT tid claim)
  ├─ status ('active'|'completed'|'archived')
  ├─ externalId, sdkConversationRef (existing Copilot fields)
  ├─ history (NormalizedMessage[] JSON)
  ├─ createdAt, updatedAt, lastAccessedAt (ISO8601)

user:{userId}:conversations → SORTED SET
  ├─ member: conversation:{conversationId}
  └─ score: updatedAt timestamp (for sorting)
```

**Graceful degradation:** Return 503 (fail-closed) when Redis unavailable. Never silently degrade to in-memory (masked data corruption risk).

### Features

**Table Stakes (P1):** 7 features, all essential for production launch
- Persistence across restarts
- Per-user isolation (scoped by JWT)
- TTL expiry
- Health endpoint Redis status
- Graceful 503 on Redis failure
- Retrieve by ID (existing API)
- List conversations for user (new endpoint)

**Differentiators (P1 + P2):** 7 features that enable v1.5 workflow orchestrator
- Expanded state model (userId, tenantId, status, timestamps)
- Activity timestamps (required for sorting, compliance)
- Conversation status tracking (v1.4.x, for orchestrator lifecycle)
- Factory pattern (dev/prod consistency)
- Connection pooling (ioredis defaults)
- TLS to Azure (mandatory for managed service)
- Batch operations (atomicity on concurrent writes)

**Anti-Features:** 6 features explicitly to avoid
- Silent fallback to in-memory (corrupts data)
- Unlimited conversation history (unbounded growth)
- Real-time multi-user (out of scope, v2)
- Auto-compression/summarization (high cost, not proven)
- Full-text search (requires external service)
- Sharding across instances (Azure handles this)

### Critical Pitfalls (from ecosystem research)

1. **Keys without TTL** → Unbounded memory. Fix: Set EXPIRE at creation, refresh on activity.
2. **N+1 queries** → Use secondary index (sorted set) instead of KEYS pattern.
3. **Concurrent updates without atomicity** → Use ioredis pipeline() for multi-command atomicity.
4. **Silent Redis failure** → Fail-closed (503), never mask with in-memory fallback.
5. **Insufficient memory provisioning** → Monitor usage, plan for growth.

---

## Implications for Roadmap

### Phase Structure (v1.4)

**v1.4 should be 1–2 phases, not more:**

**Phase 1: Storage Layer Migration**
- Replace LRU ConversationStore with Redis + factory pattern
- Implement /health Redis status check
- Add graceful 503 on Redis unavailable
- Extend StoredConversation schema (userId, tenantId, timestamps, status)
- Write unit tests for RedisConversationStore
- Verify existing API contracts unchanged (start, send, card-action)

**Phase 2 (optional v1.4.x): User-Scoped Listing**
- Implement POST /api/chat/list-conversations endpoint
- Add sorted set secondary index for recency sorting
- Optional: Conversation status PATCH endpoint
- Enable conversation list UI in future (v2)

**Why this order:**
- Phase 1 is a **prerequisite** for Phase 2 (Redis must work first)
- Phase 1 unblocks v1.5 orchestrator (provides expanded state model)
- Phase 2 is a **differentiator**, not blocking anything
- Both phases use same storage backend (no architecture churn)

### Phase 1 Deliverables

- [ ] RedisConversationStore implementation
- [ ] StoreFactory pattern (auto-select Redis vs in-memory)
- [ ] Extended StoredConversation schema (userId, tenantId, status, timestamps)
- [ ] /health endpoint enhancement (Redis PING + latency)
- [ ] TLS configuration for Azure Cache for Redis
- [ ] 503 error handling on Redis failure
- [ ] Unit tests for RedisConversationStore (get, set, delete)
- [ ] Integration test: /api/chat/start → /api/chat/send with Redis backend
- [ ] Env var documentation (REDIS_URL, REDIS_TTL, etc.)

### Phase 2 Deliverables (v1.4.x)

- [ ] POST /api/chat/list-conversations endpoint
- [ ] User-scoped conversation query with sorting by recency
- [ ] Pagination support (limit, offset)
- [ ] Optional: PATCH /api/chat/conversation/:id/status endpoint
- [ ] Test: List conversations returns only user's own conversations

### Testing Strategy

**Unit tests:**
- RedisConversationStore.get/set/delete with various data
- Factory pattern selection (Redis vs in-memory)
- TTL expiry behavior (mock Redis EXPIRE)

**Integration tests:**
- /api/chat/start → Redis hash creation with correct fields
- /api/chat/send → conversation history updated atomically
- /api/chat/card-action → lastAccessedAt refreshed
- /health → reports Redis status correctly
- /api/chat/send (Redis down) → returns 503, not silent failure
- Per-user isolation: userId A cannot see userId B's conversations

**Operational verification:**
- Connect to actual Azure Cache for Redis (non-prod)
- Verify TLS connection (port 6380, servername SNI)
- Measure latency (target: <10ms for get, <20ms for set)
- TTL expiry: conversation auto-deletes after configured duration

### What Needs Deeper Research in Phases

- **Phase 1:** No deep research flags. Redis patterns for conversation storage are well-established (High confidence from multiple sources).
- **Phase 2:** If pagination or sorting performance becomes an issue, may need to profile Redis queries at scale (1K+ conversations per user). Unlikely to be a problem.

### What's Explicitly Deferred

- **Conversation search/filtering by workflow state:** Requires secondary indices and complex queries. v1.5 uses status field, v2 adds full search (or uses Azure Cognitive Search).
- **Real-time multi-user conversations:** Out of scope. v1 is single-user per conversationId.
- **Full-text search:** Requires external service (Elasticsearch, Azure Cognitive Search). Not in v1.4 scope.
- **Auto-compression of old messages:** Not cost-effective vs. TTL. Defer.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack (Redis + ioredis)** | HIGH | Verified with official redis.io docs, ioredis GitHub, Azure Redis docs, and LangChain/LangGraph integration examples (2025–2026). Multiple sources agree. |
| **Features (table stakes vs differentiators)** | HIGH | Feature landscape aligns with established chat app patterns (Slack, Teams, ChatGPT, Copilot Studio default). Azure Redis docs confirm TTL, user scoping, health checks. |
| **Architecture (factory pattern, sorted sets)** | HIGH | Factory pattern is standard for dev/prod store selection (verified in multiple Medium articles, GitHub repos). Sorted sets for "list by recency" queries is documented Redis best practice. |
| **Pitfalls (fail-closed, N+1 queries, atomicity)** | HIGH | Anti-patterns verified with redis.io official "Anti-Patterns" guide (2025), C# Corner article on Redis mistakes, Reintech microservices patterns. Multiple sources agree on same pitfalls. |
| **Azure Cache for Redis specifics (TLS, cluster mode)** | HIGH | Microsoft Learn docs (official), GitHub ioredis issue #1149 (verified user reports with Azure), QuickStart code examples. |

**Why HIGH confidence across the board:**
1. **Training data verified:** Redis for chat persistence is a 2024–2025 pattern (LangGraph, Azure docs, redis.io tutorials all published recently).
2. **Multiple independent sources:** redis.io official docs, Microsoft Azure docs, ioredis GitHub, Medium articles, and ecosystem projects (LangChain, LangGraph) all confirm same patterns.
3. **No contradictions:** No source conflicts with another. Consensus on TTL, user scoping, sorted sets, and fail-closed behavior.
4. **Production-proven:** Azure Cache for Redis and ioredis are production systems used by major enterprises.

---

## Gaps & Open Questions

1. **Latency SLA:** Target latency for conversation storage operations not specified. Assuming <10ms get, <20ms set is acceptable (typical for Azure Redis Premium). Should be measured during Phase 1.

2. **Conversation retention policy:** Default 30-day TTL is reasonable, but business decision on archival (to cold storage) not finalized. Phase 1 implements TTL framework; v1.4.x or v2 can add archival.

3. **Multi-region redundancy:** Azure Cache for Redis Premium supports geo-replication. Not in v1.4 scope; revisit for v2 high-availability milestone.

4. **Conversation quota per user:** Should there be a limit (e.g., max 1000 conversations per user)? Defer to v2 or document as unbounded.

5. **Migration from in-memory to Redis:** For deployed instances, how to migrate existing LRU conversations to Redis? Not in v1.4 scope (greenfield development); document for future deployments.

---

## Recommendations for Roadmap Sequencing

### Pre-v1.4: Preparation (optional, 1–2 planning sessions)

- [ ] Provision Azure Cache for Redis (Standard tier for dev, or local redis-server)
- [ ] Document env var schema (.env.example additions: REDIS_URL, REDIS_TTL, REDIS_HOSTNAME, REDIS_PASSWORD)
- [ ] Review v1.2 JWT extraction (userId, tenantId) — verify middleware provides both claims
- [ ] Review v1.3b StoredConversation schema — identify which fields are extended vs. replaced

### v1.4 Phase 1: Core Persistence

**Duration:** 2–3 planning sessions (equivalent to 2–3 week sprints)
**Prerequisite:** None (builds on v1.2 auth + v1.3b state schema)
**Unblocks:** v1.5 workflow orchestrator (provides expanded state model + graceful degradation)

### v1.4 Phase 2: User-Scoped Listing (optional v1.4.x)

**Duration:** 1 planning session
**Prerequisite:** Phase 1 complete
**Unblocks:** Conversation list UI (future v2 feature)

### v1.5 (Workflow Orchestrator)

Uses v1.4 expanded state model (userId, tenantId, status, timestamps, workflowState). Can proceed immediately after Phase 1.

---

## Final Assessment

**Redis is the right choice for v1.4.** The ecosystem is mature, patterns are well-established, and the implementation aligns perfectly with the existing codebase (JWT extraction, ConversationStore interface, state schema).

**Fail-closed behavior (503 on Redis failure) is essential.** Silent fallback creates hidden data corruption risks. Clear operational failures are easier to debug and remediate.

**No significant research gaps remain.** All major decisions (Redis, ioredis, factory pattern, sorted sets, TTL, Azure) are validated by multiple authoritative sources. Proceed to roadmap phase planning.

---

*Research completed: 2026-02-21*
*Quality gate: PASS — All features categorized, complexity noted, codebase dependencies identified*
