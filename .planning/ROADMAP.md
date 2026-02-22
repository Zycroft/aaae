# Roadmap: Agentic Copilot Chat App

## Milestones

- ✅ **v1.0 MVP** — Phases 1–3 (shipped 2026-02-20)
- ✅ **v1.1 Polish** — Phase 4 (shipped 2026-02-20)
- ✅ **v1.2 Auth** — Phases 5–7 (shipped 2026-02-21)
- ✅ **v1.3b Copilot Studio SDK: Orchestrator Readiness** — Phases 8–10 (shipped 2026-02-21)
- **v1.4 Persistent State Store (Azure Cache for Redis)** — Phases 11–14 (13 shipped, 1 gap closure remaining)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–3) — SHIPPED 2026-02-20</summary>

- [x] Phase 1: Scaffold + Schema + Server Foundation (4/4 plans) — completed 2026-02-20
- [x] Phase 2: Text Chat End-to-End (4/4 plans) — completed 2026-02-20
- [x] Phase 3: Adaptive Cards + Accessibility + Theming (5/5 plans) — completed 2026-02-20

Full phase details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Polish (Phase 4) — SHIPPED 2026-02-20</summary>

- [x] Phase 4: Polish, Metadata Drawer, CI, and Docs (3/3 plans) — completed 2026-02-20

Full phase details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Entra External ID Authentication (Phases 5–7) — SHIPPED 2026-02-21</summary>

- [x] Phase 5: Shared Schema + Config Foundation (2/2 plans) — completed 2026-02-21
- [x] Phase 6: Server JWT Validation + Org Allowlist (2/2 plans) — completed 2026-02-21
- [x] Phase 7: Client MSAL Authentication (3/3 plans) — completed 2026-02-21

Full phase details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3b Copilot Studio SDK: Orchestrator Readiness (Phases 8–10) — SHIPPED 2026-02-21</summary>

- [x] Phase 8: SDK Capability Audit + Structured Extraction (3/3 plans) — completed 2026-02-21
- [x] Phase 9: Context Injection + Multi-Turn Validation (3/3 plans) — completed 2026-02-21
- [x] Phase 10: Orchestrate Endpoint + Evaluation (3/3 plans) — completed 2026-02-21

Full phase details: `.planning/milestones/v1.3b-ROADMAP.md`

</details>

### v1.4 Persistent State Store (Azure Cache for Redis)

**Milestone Goal:** Replace in-memory conversation store with Redis-backed persistent state, preparing the expanded data model for the Workflow Orchestrator (v1.5).

- [x] **Phase 11: StoredConversation Schema + Store Abstraction** — Expanded schema in shared/, ConversationStore interface extended with listByUser, InMemoryStore updated, factory wired (completed 2026-02-22)
- [x] **Phase 12: Redis Implementation + Resilience** (2 plans) — RedisStore with TLS, TTL, timeout, sorted-set user index, 503 on unavailability, connection retry, /health Redis reporting (completed 2026-02-22)
- [x] **Phase 13: Route Integration + Tests** (1 plan) — Chat routes populate userId/tenantId from JWT claims, factory unit tests (completed 2026-02-22)
- [x] **Phase 14: Redis Error Differentiation** (1 plan) — Gap closure: route handlers return 503 for Redis errors vs 502 for Copilot Studio errors (completed 2026-02-22)

## Phase Details

### Phase 11: StoredConversation Schema + Store Abstraction

**Goal**: The shared StoredConversation schema is the single source of truth for conversation state, and the ConversationStore abstraction supports user-scoped queries and factory-based store selection.

**Depends on**: Phase 10 (v1.3b complete)

**Requirements**: STATE-01, STATE-02, STATE-03, STATE-04, STATE-05, STATE-06, STORE-01, STORE-02, STORE-03, STORE-04, QUERY-01

**Success Criteria** (what must be TRUE):
  1. StoredConversation Zod schema in shared/ includes userId, tenantId, createdAt, updatedAt, status, and optional workflow fields — and TypeScript types are inferred from it
  2. Existing conversation records without new fields deserialize without error using backward-compatible defaults
  3. Server startup logs which store backend is active (Redis or InMemory) so an operator knows the data path at a glance
  4. ConversationStore interface exposes a listByUser(userId) method that both InMemory and Redis implementations satisfy
  5. REDIS_URL absent at startup selects InMemoryStore; REDIS_URL present selects RedisStore (verified by the factory's own logic, not yet by a live Redis)

**Plans**: 2 plans

Plans:
- [ ] 11-01-PLAN.md — StoredConversation Zod schema in shared/ with backward-compatible defaults (STATE-01 through STATE-06)
- [ ] 11-02-PLAN.md — Server store abstraction: ConversationStore interface + InMemoryStore update + RedisStore stub + factory + index singleton (STORE-01 through STORE-04, QUERY-01)

### Phase 12: Redis Implementation + Resilience

**Goal**: RedisStore fully implements ConversationStore using ioredis with TLS, per-key TTL, operation timeouts, sorted-set user indexing, and hard-fail behavior when Redis is unavailable.

**Depends on**: Phase 11

**Requirements**: STORE-05, STORE-06, STORE-07, QUERY-02, QUERY-03, RESIL-01, RESIL-02, RESIL-03

**Success Criteria** (what must be TRUE):
  1. Server connects to Azure Cache for Redis using the rediss:// protocol on port 6380 (TLS), and the connection is rejected at startup if the URL scheme is wrong
  2. Conversations auto-expire from Redis after a configurable TTL (default 24 hours) — a key that should have expired is gone after its TTL elapses
  3. All Redis operations time out after a configurable limit (default 5 seconds) — a hanging Redis call does not block the request indefinitely
  4. listByUser returns up to 50 conversations sorted most-recent-first, backed by a Redis sorted set secondary index
  5. GET /health reports Redis as "connected" or "disconnected" so an operator can verify Redis availability without reading server logs
  6. When Redis is unreachable, the server returns 503 Service Unavailable — it never silently serves stale in-memory data

**Plans**: 2 plans

Plans:
- [x] 12-01-PLAN.md — Install ioredis, implement RedisConversationStore with TLS/TTL/timeout/sorted-set/pipeline, update factory with TLS validation (STORE-05, STORE-06, STORE-07, QUERY-02, QUERY-03, RESIL-01, RESIL-03)
- [x] 12-02-PLAN.md — Health endpoint Redis status, ioredis-mock unit tests, .env.example Redis docs (RESIL-02)

### Phase 13: Route Integration + Tests

**Goal**: All chat routes populate the expanded conversation fields from authenticated JWT claims, the auth-bypass fallback preserves dev usability, and the new store behavior is covered by unit tests.

**Depends on**: Phase 12

**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, TEST-01, TEST-02, TEST-03

**Success Criteria** (what must be TRUE):
  1. POST /api/chat/start stores userId and tenantId extracted from the JWT claims on the request, so conversations are owned by the authenticated user
  2. POST /api/chat/start sets createdAt to the current timestamp and status to 'active' — confirming the expanded model is written on conversation creation
  3. POST /api/chat/send and POST /api/chat/card-action update the conversation's updatedAt timestamp on every turn
  4. When AUTH_REQUIRED=false, routes store userId as 'anonymous' and tenantId as 'dev' so local development works without credentials
  5. `npm test` passes with unit tests covering RedisStore (via ioredis-mock) and the factory pattern, and server/.env.example documents all new Redis configuration variables

**Plans**: 1 plan

Plans:
- [x] 13-01-PLAN.md — Wire JWT claims into route userId/tenantId, factory unit tests (ROUTE-01, TEST-02)

### Phase 14: Redis Error Differentiation

**Goal**: Route error handlers distinguish Redis errors from Copilot Studio errors and return 503 Service Unavailable for Redis unavailability, so operators can differentiate backend failures in monitoring.

**Depends on**: Phase 13

**Requirements**: RESIL-01

**Gap Closure**: Closes RESIL-01 gap and Phase 12→13 integration gap identified in v1.4-MILESTONE-AUDIT.md

**Success Criteria** (what must be TRUE):
  1. When Redis is unreachable, POST /api/chat/start, /send, /card-action, and /orchestrate all return 503 (not 502)
  2. When Copilot Studio fails, routes still return 502 Bad Gateway (no regression)
  3. Unit tests verify 503 is returned for Redis-originated errors

**Plans**: 1 plan

Plans:
- [x] 14-01-PLAN.md — Add Redis error detection to route catch blocks, return 503 for store errors + unit tests (RESIL-01)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Scaffold + Schema + Server Foundation | v1.0 | 4/4 | Complete | 2026-02-20 |
| 2. Text Chat End-to-End | v1.0 | 4/4 | Complete | 2026-02-20 |
| 3. Adaptive Cards + Accessibility + Theming | v1.0 | 5/5 | Complete | 2026-02-20 |
| 4. Polish, Metadata Drawer, CI, and Docs | v1.1 | 3/3 | Complete | 2026-02-20 |
| 5. Shared Schema + Config Foundation | v1.2 | 2/2 | Complete | 2026-02-21 |
| 6. Server JWT Validation + Org Allowlist | v1.2 | 2/2 | Complete | 2026-02-21 |
| 7. Client MSAL Authentication | v1.2 | 3/3 | Complete | 2026-02-21 |
| 8. SDK Capability Audit + Structured Extraction | v1.3b | 3/3 | Complete | 2026-02-21 |
| 9. Context Injection + Multi-Turn Validation | v1.3b | 3/3 | Complete | 2026-02-21 |
| 10. Orchestrate Endpoint + Evaluation | v1.3b | 3/3 | Complete | 2026-02-21 |
| 11. StoredConversation Schema + Store Abstraction | 2/2 | Complete    | 2026-02-22 | - |
| 12. Redis Implementation + Resilience | v1.4 | 2/2 | Complete | 2026-02-22 |
| 13. Route Integration + Tests | v1.4 | 1/1 | Complete | 2026-02-22 |
| 14. Redis Error Differentiation | 1/1 | Complete    | 2026-02-22 | - |
