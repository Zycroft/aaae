---
phase: 16-workflow-orchestrator-engine
plan: 01
subsystem: server
tags: [redis, store, lock, tdd, ioredis, distributed-lock]

requires:
  - phase: 12
    provides: RedisConversationStore pattern, ioredis, factory pattern
provides:
  - RedisWorkflowStateStore with 24h sliding TTL
  - ConversationLock interface with Redis SET NX PX and Lua release
  - InMemoryConversationLock for local dev/CI
  - Factory functions createWorkflowStateStore and createConversationLock
affects: [16-03-orchestrator]

tech-stack:
  added: []
  patterns: [redis-set-nx-px-lock, lua-script-release, sliding-ttl]

key-files:
  created:
    - server/src/store/RedisWorkflowStateStore.ts
    - server/src/store/RedisWorkflowStateStore.test.ts
    - server/src/lock/ConversationLock.ts
    - server/src/lock/ConversationLock.test.ts
  modified:
    - server/src/store/factory.ts
    - server/src/store/index.ts

key-decisions:
  - "Used wf: key prefix for workflow state (distinct from conv: for conversations)"
  - "SET PX ttl NX argument order for ioredis TypeScript overload compatibility"
  - "Lua script for lock release — atomically checks token before DEL"
  - "10s default lock TTL — 2x conservative Copilot P99 latency estimate"

patterns-established:
  - "Redis SET NX PX for per-conversation distributed locks"
  - "Lua script for safe lock release with token verification"
  - "Factory pattern extended for both WorkflowStateStore and ConversationLock"

requirements-completed: [ORCH-05, ORCH-07]

duration: 3min
completed: 2026-02-22
---

# Phase 16 Plan 01: RedisWorkflowStateStore + ConversationLock Summary

**Redis-backed workflow state persistence with sliding TTL and per-conversation locking via SET NX PX + Lua release**

## Performance

- **Duration:** 3 min
- **Tasks:** 3 (TDD x2 + factory update)
- **Files modified:** 6

## Accomplishments
- RedisWorkflowStateStore with 24h sliding TTL (EX resets on every write)
- ConversationLock with Redis SET NX PX for atomic acquisition and Lua script for safe release
- InMemoryConversationLock for local dev and CI
- Factory functions selecting Redis or InMemory based on REDIS_URL
- 16 new tests (7 store + 9 lock), 132 total passing

## Task Commits

1. **Task 1: RedisWorkflowStateStore** - `7cbfbac` (feat)
2. **Task 2: ConversationLock** - `2536323` (feat)
3. **Task 3: Factory update** - `02c6195` (feat)

## Decisions Made
- Used `wf:` key prefix for workflow state keys (distinct from `conv:` for conversations)
- SET argument order `PX, ttl, NX` for ioredis TypeScript overload compatibility
- 10s default lock TTL (2x conservative Copilot P99 latency estimate)

## Deviations from Plan
- None

## Issues Encountered
- ioredis TypeScript overload for SET required `PX, ttl, NX` argument order instead of `NX, PX, ttl`

---
*Phase: 16-workflow-orchestrator-engine*
*Completed: 2026-02-22*
