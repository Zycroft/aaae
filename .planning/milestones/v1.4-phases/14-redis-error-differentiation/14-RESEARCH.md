# Phase 14: Redis Error Differentiation - Research

**Researched:** 2026-02-22
**Domain:** Error type detection and HTTP status code routing
**Confidence:** HIGH

## Summary

Phase 14 closes a critical gap identified in v1.4 milestone audit: route error handlers currently return 502 Bad Gateway for ALL errors (Copilot Studio failures AND Redis failures), but the specification requires 503 Service Unavailable for Redis unavailability so operators can distinguish backend failures in monitoring/alerting.

The core issue is architectural: routes in `chat.ts` and `orchestrate.ts` have catch blocks that trap errors from both Copilot Studio calls (which should return 502) and ConversationStore calls (which should return 503 when Redis fails). Without distinguishing error origin, all failures return the same status code.

ioredis throws typed errors that can be identified by class/message inspection. Three route handlers need error differentiation logic (approximately 10 lines of code total), plus unit tests to verify 503 is returned for Redis-specific errors.

**Primary recommendation:** Add a helper function to detect Redis-originated errors (ioredis `TimeoutError` or connection failures), check error type in all four route catch blocks before selecting status code, and add unit tests that mock Redis failures and verify 503 response.

<user_constraints>
## User Constraints (from Phase 12 CONTEXT.md)

### Locked Decisions
- ioredis error detection must distinguish between Redis errors and other errors
- Hard-fail on Redis unavailability: return 503, never silent fallback to InMemory
- Error logging with `[STORE]` prefix for Redis operations
- Store operations throw errors naturally (not caught); routes must catch and differentiate

### Claude's Discretion
- Specific error detection strategy (error instanceof check vs. message pattern vs. custom error class)
- Whether to extract error detection to a utility function or inline in catch blocks
- Test structure for verifying 503 responses

### Deferred Ideas (OUT OF SCOPE)
- Global error middleware (routes have first catch, error middleware runs after)
- Custom error classes wrapping ioredis errors
- Retryable error detection (ioredis handles retries; routes should not retry)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RESIL-01 | Server returns 503 Service Unavailable when Redis is unreachable | ioredis throws `TimeoutError` and connection errors with identifiable names; routes can check `error instanceof` or error.name to detect Redis origin |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ioredis | ^5.9.3 | Redis client (already in use) | Throws typed errors with identifiable names/constructors |
| TypeScript | ^5.3 | Type safety | Already in use; error instanceof checks are type-safe |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | ^1.0+ | Unit testing (already in use) | Mock Redis errors in tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| instanceof error checking | Error.name string matching | instanceof is type-safe; string matching is runtime-fragile |
| Catch-differentiate inline | Extract to utility function | Inline duplicates code across 4 routes; utility centralizes logic |

## Architecture Patterns

### Recommended Project Structure
No new files needed. Error differentiation logic goes into existing routes:

```
server/src/
├── routes/
│   ├── chat.ts         # UPDATE: Add error type checking in 3 catch blocks
│   └── orchestrate.ts  # UPDATE: Add error type checking in 1 catch block
├── store/
│   └── RedisStore.ts   # No changes (errors thrown naturally per Phase 12)
└── __tests__/
    ├── chat.test.ts    # UPDATE: Add tests for 503 on Redis errors
    └── orchestrate.test.ts  # UPDATE: Add tests for 503 on Redis errors
```

### Pattern 1: Detecting ioredis Errors

**What:** Identify Redis-originated errors in catch blocks
**When to use:** In route handlers when catching errors from store operations

**ioredis error types (from npm ioredis v5.9.3 docs):**

- `TimeoutError` — Command exceeded `commandTimeout` (default 5s). Indicates Redis unresponsive.
- `ConnectionError` — Cannot establish/maintain connection to Redis (network failure, auth failure).
- `RedisError` — Base class for Redis protocol errors (`READONLY`, `MOVED`, etc.).
- `MaxRedirectsError` — Cluster redirection loop (not relevant for Azure Cache single-node).

**Detection pattern:**

```typescript
import { TimeoutError } from 'ioredis';

function isRedisError(err: unknown): boolean {
  // Check if error is a ioredis-specific error
  if (err instanceof TimeoutError) return true;
  if (err instanceof Error && err.name === 'ConnectionError') return true;
  if (err instanceof Error && err.name === 'RedisError') return true;
  // Fallback: check message patterns for connection issues
  if (err instanceof Error && err.message.includes('ECONNREFUSED')) return true;
  return false;
}
```

**Why this works:**
- ioredis exports `TimeoutError` as a named class
- ioredis wraps connection errors with `name: 'ConnectionError'`
- Copilot SDK errors will have different error types/messages (e.g., `ServiceError`, `AuthenticationError`)
- This is future-proof: if ioredis adds new error types, checking by name is resilient

### Pattern 2: HTTP Status Code Selection in Routes

**What:** Use error detection to select 502 vs 503
**When to use:** In all route catch blocks

```typescript
catch (err) {
  console.error('[chat/send] Error:', err);

  if (isRedisError(err)) {
    // Redis unavailable — return 503 Service Unavailable
    res.status(503).json({ error: 'Service Unavailable: Redis backend offline' });
  } else {
    // Copilot Studio or other error — return 502 Bad Gateway
    res.status(502).json({ error: 'Failed to send message to Copilot Studio' });
  }
}
```

**Note:** This applies to 4 catch blocks:
1. `POST /api/chat/start` (line 71 in chat.ts)
2. `POST /api/chat/send` (line 133 in chat.ts)
3. `POST /api/chat/card-action` (line 201 in chat.ts)
4. `POST /api/chat/orchestrate` (line 127 in orchestrate.ts)

### Pattern 3: Shared Error Detection Utility

**What:** Extract error detection to a reusable helper to avoid duplication
**When to use:** Optional refactor after initial implementation

```typescript
// server/src/utils/errorDetection.ts
import { TimeoutError } from 'ioredis';

/**
 * Determine if an error originated from Redis (store layer)
 * vs. Copilot Studio (SDK layer) or application logic.
 *
 * Redis errors should return 503; others should return 502.
 */
export function isRedisError(err: unknown): boolean {
  // ioredis TimeoutError — command timeout
  if (err instanceof TimeoutError) return true;

  // ioredis ConnectionError — connection failure
  if (err instanceof Error) {
    if (err.name === 'ConnectionError') return true;

    // ioredis RedisError subclass
    if (err.name === 'RedisError') return true;

    // Network-level connection failures (ECONNREFUSED, ECONNRESET, etc.)
    if (err.message.match(/ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH/)) {
      return true;
    }
  }

  return false;
}
```

Then in routes:

```typescript
import { isRedisError } from '../utils/errorDetection.js';

catch (err) {
  console.error('[chat/send] Error:', err);
  const statusCode = isRedisError(err) ? 503 : 502;
  const message = isRedisError(err)
    ? 'Service Unavailable: Redis backend offline'
    : 'Failed to send message to Copilot Studio';
  res.status(statusCode).json({ error: message });
}
```

### Anti-Patterns to Avoid

- **Overly broad error detection:** Don't return 503 for ALL errors. Only Redis-specific errors (ioredis classes + connection issues).
- **Silent fallback on 503:** Return 503 and let client handle retry. Never automatically switch to InMemoryStore.
- **No error differentiation:** All errors as 502 defeats monitoring purpose.
- **Catching errors in store methods:** RedisStore methods should throw errors naturally (Phase 12 design). Routes have first catch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error type detection | Custom error wrapping class | ioredis instanceof/error.name checks | ioredis errors are already typed; instanceof is reliable and typed |
| HTTP status logic | Multiple if-then chains | Extracted helper function | Reduces duplication across 4 routes, easier to test |
| Redis error list | Hardcoded string list | instanceof check (class-based) | Classes are resilient to error message changes; strings break on wording updates |

**Key insight:** Error detection is simple (ioredis errors are well-typed); the complexity is in applying it consistently across 4 routes. A shared utility function solves this.

## Common Pitfalls

### Pitfall 1: Confusing ioredis Error Names

**What goes wrong:** Different ioredis error types have similar names; detection logic catches the wrong ones.

**Why it happens:** ioredis has `TimeoutError`, `ConnectionError`, `RedisError`, and `MaxRedirectsError`. Easy to confuse scope.

**How to avoid:**
- Use `instanceof TimeoutError` (class-based, type-safe)
- Use `error.name === 'ConnectionError'` (fallback for all connection errors)
- Test error detection with actual ioredis-mock throwing each error type

**Warning signs:** Tests pass locally but fail in CI with different error type.

### Pitfall 2: Not Distinguishing Between Operation Timeouts and Connection Timeouts

**What goes wrong:** A command times out (within commandTimeout) vs. initial connection fails (connectTimeout). Both should be 503, but different ioredis code paths.

**Why it happens:** ioredis has separate timeout options. Error details differ.

**How to avoid:** Test both scenarios:
- Command timeout: `redis.set('key', 'value')` with Redis down → TimeoutError
- Connection timeout: `new Redis('rediss://down-host:6380')` on startup → connection errors during factory creation (already handled by hard-fail in Phase 12 factory.ts)

**Warning signs:** Some Redis failures return 502 instead of 503.

### Pitfall 3: Catching Errors from Copilot SDK Incorrectly as Redis Errors

**What goes wrong:** Copilot SDK throws an error with a message containing "timeout" or "connection", and error detection logic misidentifies it as Redis.

**Why it happens:** Error message pattern matching is fragile (e.g., checking for "ECONNREFUSED" in message).

**How to avoid:**
- Prefer `instanceof` checks (class-based) over string matching
- If using string matching, be specific: check for ioredis-specific messages like "Command timeout" or "ECONNREFUSED"
- Test with actual Copilot errors (mock SDK exceptions)

**Warning signs:** Adding Copilot error handling breaks 503 detection.

### Pitfall 4: Changing 502 to 503 for All Errors

**What goes wrong:** Over-correcting: changing route catch blocks to return 503 for everything.

**Why it happens:** Misunderstanding the requirement (503 only for Redis, 502 for Copilot failures).

**How to avoid:**
- Keep Copilot errors as 502 Bad Gateway
- Only Redis errors → 503 Service Unavailable
- Unit tests verify both: test 503 on mocked Redis failure, test 502 on mocked Copilot failure

**Warning signs:** Success criteria says "no regression" on 502 responses.

### Pitfall 5: Testing with Real Redis Instead of ioredis-mock

**What goes wrong:** Tests create network dependencies; CI fails on network flakes; can't easily simulate Redis down.

**Why it happens:** Testing convenience over isolation.

**How to avoid:** Use ioredis-mock (already in devDependencies from Phase 12). Mock Redis client failures by making the mock throw errors.

**Warning signs:** Tests timeout, CI is flaky.

## Code Examples

### Utility Function for Error Detection

```typescript
// server/src/utils/errorDetection.ts
import { TimeoutError } from 'ioredis';

/**
 * Determine if an error originated from the Redis store backend.
 * Used to select HTTP status code: 503 for Redis failures, 502 for other failures.
 *
 * Checks:
 * 1. ioredis TimeoutError — command timed out
 * 2. ioredis ConnectionError — cannot reach Redis
 * 3. System-level connection errors (ECONNREFUSED, etc.)
 */
export function isRedisError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // ioredis TimeoutError class
  if (err instanceof TimeoutError) {
    return true;
  }

  // ioredis named errors
  const name = err.name;
  if (name === 'ConnectionError' || name === 'RedisError') {
    return true;
  }

  // System connection failures (network-level)
  const message = err.message;
  if (message.match(/ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND/)) {
    return true;
  }

  return false;
}
```

### Updated Route Catch Block

```typescript
// server/src/routes/chat.ts
import { isRedisError } from '../utils/errorDetection.js';

chatRouter.post('/send', async (req, res) => {
  // ... existing validation and logic ...

  try {
    // ... existing implementation ...
  } catch (err) {
    console.error('[chat/send] Error:', err);

    if (isRedisError(err)) {
      res.status(503).json({
        error: 'Service Unavailable: Redis backend offline',
      });
    } else {
      res.status(502).json({
        error: 'Failed to send message to Copilot Studio',
      });
    }
  }
});
```

### Unit Test Example (Vitest)

```typescript
// server/src/__tests__/chat.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import * as storeModule from '../store/index.js';
import { TimeoutError } from 'ioredis';

describe('POST /api/chat/send', () => {
  let app: any;

  beforeEach(() => {
    app = createApp();
  });

  it('returns 503 when RedisStore throws TimeoutError', async () => {
    // Mock store to throw ioredis TimeoutError
    const mockStore = {
      get: vi.fn().mockResolvedValue({ /* mock conversation */ }),
      set: vi.fn().mockRejectedValue(new TimeoutError('Command timeout')),
      delete: vi.fn(),
      listByUser: vi.fn(),
    };
    vi.spyOn(storeModule, 'conversationStore', 'get').mockReturnValue(mockStore);

    const response = await request(app)
      .post('/api/chat/send')
      .set('Authorization', 'Bearer fake-token')
      .send({
        conversationId: 'test-conv',
        text: 'Hello',
      });

    expect(response.status).toBe(503);
    expect(response.body.error).toContain('Service Unavailable');
  });

  it('returns 502 when Copilot SDK throws error', async () => {
    // Mock Copilot SDK to throw non-Redis error
    const copilotError = new Error('Copilot authentication failed');
    vi.spyOn(copilotModule, 'copilotClient', 'get').mockRejectedValue(copilotError);

    const response = await request(app)
      .post('/api/chat/send')
      .set('Authorization', 'Bearer fake-token')
      .send({
        conversationId: 'test-conv',
        text: 'Hello',
      });

    expect(response.status).toBe(502);
    expect(response.body.error).toContain('Copilot Studio');
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All errors → 502 | Differentiated 502/503 | Phase 14 (2026-02-22) | Operators can now distinguish backend failures in monitoring; alerting can target Redis health separately |

**Deprecated/outdated:**
- Catching all errors as 502 — hides Redis failures from operators

## Open Questions

1. **Extract error detection to utility or inline in catch blocks?**
   - What we know: 4 routes with identical catch logic
   - What's unclear: code style preference (DRY vs. explicit)
   - Recommendation: Extract to `errorDetection.ts` utility function to avoid duplication and enable shared unit tests

2. **Should we add retry logic for transient Redis errors?**
   - What we know: ioredis has built-in retry with exponential backoff (Phase 12 factory.ts)
   - What's unclear: whether routes should retry on transient failures or immediately return 503
   - Recommendation: Do NOT retry in routes. ioredis retries at the client level. Routes should fail fast (503) — client can retry.

3. **Should 503 response message expose Redis status details?**
   - What we know: Generic 503 message hides implementation details (security best practice)
   - What's unclear: ops benefit from detailed error info (e.g., "Redis timeout", "Redis connection refused")
   - Recommendation: Return generic "Service Unavailable" in API response. Log detailed error to console (with [STORE] prefix) for operator investigation.

## Sources

### Primary (HIGH confidence)
- ioredis npm v5.9.3 (github.com/lonelyplanet/ioredis) — error types documentation
- Project codebase Phase 12 — factory.ts and RedisStore.ts already implement ioredis error handling
- v1.4 Milestone Audit (2026-02-22) — detailed gap analysis with line numbers (RESIL-01 not satisfied)
- RFC 7231 HTTP/1.1 Status Codes — 502 Bad Gateway vs 503 Service Unavailable semantics

### Secondary (MEDIUM confidence)
- ioredis GitHub issue discussions on error handling
- Node.js Error class documentation for instanceof and error.name property

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — ioredis already in use (Phase 12); error types documented
- Architecture: HIGH — error detection pattern is straightforward (instanceof checks); proven in existing codebase
- Pitfalls: HIGH — common error detection mistakes well-documented in ioredis issues

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (ioredis v5.x stable API, unlikely breaking changes)

