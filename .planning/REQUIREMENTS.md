# Requirements: Agentic Copilot Chat App

**Defined:** 2026-02-21
**Core Value:** Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected, authenticated via Entra External ID.

## v1.4 Requirements

Requirements for Persistent State Store (Azure Cache for Redis). Each maps to roadmap phases.

### Storage Layer

- [ ] **STORE-01**: Server persists conversations in Redis when REDIS_URL is set
- [ ] **STORE-02**: Server uses InMemoryStore when REDIS_URL is not set (no regression)
- [ ] **STORE-03**: Store factory selects Redis or InMemory based on REDIS_URL env var
- [ ] **STORE-04**: Server logs which store backend is active on startup
- [ ] **STORE-05**: Redis connection uses TLS for Azure Cache (rediss:// protocol, port 6380)
- [ ] **STORE-06**: Conversations auto-expire after configurable TTL (default 24 hours)
- [ ] **STORE-07**: All Redis operations enforce configurable timeout (default 5 seconds)

### State Model

- [ ] **STATE-01**: StoredConversation includes userId and tenantId fields
- [ ] **STATE-02**: StoredConversation includes createdAt and updatedAt ISO 8601 timestamps
- [ ] **STATE-03**: StoredConversation includes status field (active/completed/abandoned)
- [ ] **STATE-04**: StoredConversation includes optional workflow fields (workflowId, currentStep, stepData, metadata)
- [ ] **STATE-05**: Zod schema for StoredConversation lives in shared/src/schemas/
- [ ] **STATE-06**: Existing conversations without new fields still load (backward compatible defaults)

### Querying

- [ ] **QUERY-01**: ConversationStore interface has listByUser(userId) method
- [ ] **QUERY-02**: listByUser returns conversations sorted by most recent, limited to 50
- [ ] **QUERY-03**: Redis implementation uses sorted set secondary index for user lookup

### Resilience

- [ ] **RESIL-01**: Server returns 503 Service Unavailable when Redis is unreachable
- [ ] **RESIL-02**: /health endpoint reports Redis connectivity status (connected/disconnected)
- [ ] **RESIL-03**: Redis connection retries on transient errors with logging

### Route Integration

- [ ] **ROUTE-01**: /api/chat/start sets userId and tenantId from req.user JWT claims
- [ ] **ROUTE-02**: /api/chat/start sets createdAt timestamp and status to 'active'
- [ ] **ROUTE-03**: /api/chat/send and /card-action update updatedAt timestamp
- [ ] **ROUTE-04**: Routes use placeholder values (userId: 'anonymous', tenantId: 'dev') when auth not deployed

### Testing

- [ ] **TEST-01**: Unit tests for RedisStore using ioredis-mock
- [ ] **TEST-02**: Unit tests for store factory pattern (Redis selected when REDIS_URL set, InMemory otherwise)
- [ ] **TEST-03**: Updated .env.example with Redis configuration variables

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Workflow Orchestrator (v1.5)

- **WFLOW-01**: Orchestrator uses workflowId/currentStep/stepData from StoredConversation
- **WFLOW-02**: Multi-step workflow progression tracked in conversation state
- **WFLOW-03**: Workflow state transitions validated via state machine

### Scaling (v2+)

- **SCALE-01**: Redis Cluster support for multi-node deployment
- **SCALE-02**: Conversation archival to cold storage after TTL
- **SCALE-03**: Tenant-scoped queries (listByTenant)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Redis Cluster support | Single-node Azure Cache sufficient for v1.4 scale |
| Data migration from InMemory to Redis | Greenfield — no existing persistent data to migrate |
| Conversation archival to cold storage | Defer to v2+ based on retention requirements |
| Real-time pub/sub notifications | Not needed for state store; future feature |
| Redis Sentinel failover | Azure Cache handles HA internally |
| Silent fallback to InMemory on Redis failure | Explicitly rejected — causes hidden data loss |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STORE-01 | — | Pending |
| STORE-02 | — | Pending |
| STORE-03 | — | Pending |
| STORE-04 | — | Pending |
| STORE-05 | — | Pending |
| STORE-06 | — | Pending |
| STORE-07 | — | Pending |
| STATE-01 | — | Pending |
| STATE-02 | — | Pending |
| STATE-03 | — | Pending |
| STATE-04 | — | Pending |
| STATE-05 | — | Pending |
| STATE-06 | — | Pending |
| QUERY-01 | — | Pending |
| QUERY-02 | — | Pending |
| QUERY-03 | — | Pending |
| RESIL-01 | — | Pending |
| RESIL-02 | — | Pending |
| RESIL-03 | — | Pending |
| ROUTE-01 | — | Pending |
| ROUTE-02 | — | Pending |
| ROUTE-03 | — | Pending |
| ROUTE-04 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |

**Coverage:**
- v1.4 requirements: 26 total
- Mapped to phases: 0
- Unmapped: 26

---
*Requirements defined: 2026-02-21*
*Last updated: 2026-02-21 after initial definition*
