---
phase: 14-redis-error-differentiation
plan: 01
subsystem: api
tags: [ioredis, redis, error-handling, http-status, resilience]

requires:
  - phase: 12-redis-implementation
    provides: RedisStore with ioredis, route catch blocks returning 502
provides:
  - isRedisError() utility for Redis vs Copilot error differentiation
  - 503 Service Unavailable responses for Redis failures in all routes
affects: [monitoring, alerting, observability]

tech-stack:
  added: []
  patterns: [redis-error-name-detection, network-error-pattern-matching]

key-files:
  created:
    - server/src/utils/errorDetection.ts
    - server/src/utils/errorDetection.test.ts
  modified:
    - server/src/routes/chat.ts
    - server/src/routes/orchestrate.ts

key-decisions:
  - "Name-based error detection instead of instanceof: ioredis v5 does not export TimeoutError; redis-errors package provides named error classes (RedisError, ReplyError, AbortError, etc.) detectable via err.name"
  - "Seven redis-errors names covered: RedisError, ReplyError, AbortError, InterruptError, ParserError, MaxRetriesPerRequestError, ClusterAllFailedError"
  - "Network error codes via regex: ECONNREFUSED, ECONNRESET, ETIMEDOUT, EHOSTUNREACH, ENOTFOUND"

patterns-established:
  - "Error detection utility pattern: centralized isRedisError() for status code selection in route handlers"

requirements-completed: [RESIL-01]

duration: 4min
completed: 2026-02-22
---

# Phase 14 Plan 01: Redis Error Differentiation Summary

**isRedisError() utility distinguishes Redis backend failures (503) from Copilot Studio errors (502) across all 4 route catch blocks**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-22T04:43:02Z
- **Completed:** 2026-02-22T04:47:57Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `isRedisError()` utility detecting redis-errors hierarchy by name and network error codes by message pattern
- Updated all 4 route catch blocks (/start, /send, /card-action, /orchestrate) to return 503 for Redis errors
- 16 unit tests covering all detection paths (7 redis error names, 5 network codes, 4 non-Redis cases)
- Full test suite passes (91 tests, 0 regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create isRedisError utility with exhaustive unit tests** - `c5e2fbe` (feat)
2. **Task 2: Update 4 route catch blocks to return 503 for Redis errors** - `3fe7a9b` (feat)

## Files Created/Modified
- `server/src/utils/errorDetection.ts` - isRedisError() utility detecting Redis errors by name and network errors by message
- `server/src/utils/errorDetection.test.ts` - 16 unit tests covering all error types
- `server/src/routes/chat.ts` - 3 catch blocks updated: /start, /send, /card-action
- `server/src/routes/orchestrate.ts` - 1 catch block updated: /orchestrate

## Decisions Made
- **Name-based detection over instanceof:** Plan specified `import { TimeoutError } from 'ioredis'` but ioredis v5 does not export TimeoutError. Switched to name-based detection using the redis-errors package hierarchy (RedisError, ReplyError, AbortError, InterruptError, ParserError) plus ioredis-specific errors (MaxRetriesPerRequestError, ClusterAllFailedError). This is more robust as it covers the entire error hierarchy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ioredis TimeoutError not exported in v5**
- **Found during:** Task 1 (errorDetection utility creation)
- **Issue:** Plan specified `import { TimeoutError } from 'ioredis'` but ioredis v5 does not export TimeoutError as a constructor. The `instanceof TimeoutError` check caused "Right-hand side of instanceof is not an object" error.
- **Fix:** Replaced instanceof check with name-based detection using Set of known redis-errors names (RedisError, ReplyError, AbortError, InterruptError, ParserError, MaxRetriesPerRequestError, ClusterAllFailedError). This is more comprehensive than the original plan.
- **Files modified:** server/src/utils/errorDetection.ts, server/src/utils/errorDetection.test.ts
- **Verification:** All 16 tests pass
- **Committed in:** c5e2fbe

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The name-based approach is more robust than instanceof — covers more error types and works with ioredis-mock in tests. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase complete, ready for verification
- RESIL-01 requirement satisfied: server returns 503 when Redis is unreachable, 502 for Copilot errors

---
*Phase: 14-redis-error-differentiation*
*Completed: 2026-02-22*
