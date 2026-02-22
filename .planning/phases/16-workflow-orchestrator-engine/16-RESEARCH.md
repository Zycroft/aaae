# Phase 16: Workflow Orchestrator Engine - Research

**Researched:** 2026-02-22
**Domain:** Server-side workflow orchestration with Redis state persistence, per-conversation locking, and structured output integration
**Confidence:** HIGH

## Summary

Phase 16 transforms the existing inline orchestration logic in `server/src/routes/orchestrate.ts` into a proper `WorkflowOrchestrator` service class. The orchestrator encapsulates the full per-turn loop: load state from Redis, enrich the outbound query with accumulated context (using `buildContextualQuery` from Phase 15), call Copilot Studio, normalize activities, parse structured output (using `parseTurn` from Phase 15), update workflow state with newly collected data, save state atomically to Redis, and return a `WorkflowResponse`.

The project already has all the building blocks: `WorkflowStateStore` interface, `InMemoryWorkflowStateStore`, `RedisConversationStore` (pattern to follow for `RedisWorkflowStateStore`), `parseTurn()`, `buildContextualQuery()`, `normalizeActivities()`, `isRedisError()`, and the factory pattern from `store/factory.ts`. The primary new work is: (1) a `RedisWorkflowStateStore` implementation with 24h sliding TTL, (2) the `WorkflowOrchestrator` service class itself, (3) Redis-based per-conversation locking to prevent race conditions, and (4) an expanded `WorkflowResponse` shape with progress and turn metadata.

**Primary recommendation:** Build the orchestrator as a service class with constructor-injected dependencies (stores, copilot client, parser, context builder) for testability. Use Redis `SET NX PX` for single-instance per-conversation locks with Lua-script-guarded release. Follow the existing `RedisConversationStore` pattern for `RedisWorkflowStateStore`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- 24-hour TTL on workflow state in Redis
- Sliding window: every interaction resets the 24h clock -- actively-used workflows never expire
- Each conversation has its own independent workflow state -- users can have multiple active workflows simultaneously (keyed by conversationId, scoped to userId+tenantId)
- Explicit end/complete behavior is Claude's discretion (TTL as the safety net either way)
- Expand WorkflowResponse beyond existing shape to include progress indicator (currentStep, totalSteps, percentComplete) and turn metadata (turn number, whether state changed, what data was collected this specific turn)
- Progress tracking based on predefined steps -- a workflow definition file (JSON or TS config) lists steps in order, orchestrator tracks position against it
- Workflow step definitions live in a config/definition file loaded at init, not embedded in WorkflowState
- Rollback on failure: if the Copilot call fails mid-turn, do NOT save state changes -- the turn never happened, client can retry cleanly
- Redis required: if Redis is down, fail the request with 503 -- no in-memory fallback, state consistency is non-negotiable

### Claude's Discretion
- Lock strategy: queue-with-timeout vs fail-fast, and timeout duration
- Orphan lock protection mechanism
- Lock contention logging/observability
- Explicit workflow end/complete action vs TTL-only cleanup
- Error response detail level
- Structured error events vs HTTP-only errors

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ORCH-01 | WorkflowOrchestrator can start a new workflow session tied to userId and tenantId | RedisWorkflowStateStore with userId+tenantId scoped key prefix; WorkflowOrchestrator.startSession() method |
| ORCH-02 | WorkflowOrchestrator processes user text input through the full loop | Service class processTurn() method: load state -> buildContextualQuery -> Copilot call -> normalizeActivities -> parseTurn -> merge collectedData -> save state -> return WorkflowResponse |
| ORCH-03 | WorkflowOrchestrator processes card action submissions through the workflow | processCardAction() method: same loop but with card action Activity instead of text message |
| ORCH-04 | WorkflowResponse includes messages and workflowState (status, currentPhase, collectedData, progress) | Expanded WorkflowResponse type with progress indicator and turn metadata |
| ORCH-05 | Workflow state persists in Redis store -- orchestration survives server restart | RedisWorkflowStateStore with JSON serialization, 24h sliding TTL, factory pattern selection |
| ORCH-06 | Subsequent turns include previously collected data in the Copilot query | buildContextualQuery (Phase 15) receives loaded WorkflowState.collectedData; orchestrator merges ParsedTurn.data into collectedData on each turn |
| ORCH-07 | Orchestrator processes requests sequentially per conversation (Redis-based locking) | Redis SET NX PX lock with Lua-script release; per-conversation lock key; orphan protection via lock TTL |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ioredis | ^5.9.3 | Redis client for state persistence and locking | Already in project; used by RedisConversationStore |
| uuid | ^11.0.0 | Lock token generation for safe lock release | Already in project; standard for unique identifiers |
| vitest | ^3.0.0 | Testing framework | Already the project's test runner |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis-mock | ^8.13.1 | Mock Redis for unit tests | Already in project devDependencies; used by RedisStore.test.ts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw SET NX PX lock | redlock npm package | Redlock is for multi-instance Redis clusters; this project uses single Azure Cache instance -- SET NX PX is simpler and sufficient |
| Manual Lua script | ioredis-lock npm | Extra dependency for a single Lua script; hand-rolling is clearer for one lock pattern |

**Installation:**
No new packages needed. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
server/src/
├── orchestrator/
│   ├── WorkflowOrchestrator.ts       # Service class (ORCH-02, ORCH-03)
│   ├── WorkflowOrchestrator.test.ts  # Unit tests with mocked deps
│   └── types.ts                       # WorkflowResponse, OrchestratorConfig
├── store/
│   ├── RedisWorkflowStateStore.ts    # Redis implementation (ORCH-05)
│   ├── RedisWorkflowStateStore.test.ts
│   ├── WorkflowStateStore.ts         # Interface (exists)
│   ├── InMemoryWorkflowStateStore.ts # In-memory impl (exists)
│   ├── factory.ts                    # Updated: createWorkflowStateStore()
│   └── index.ts                      # Updated: export workflowStateStore singleton
├── lock/
│   ├── ConversationLock.ts           # Redis lock interface + implementation (ORCH-07)
│   └── ConversationLock.test.ts
└── workflow/
    ├── contextBuilder.ts              # (exists, Phase 15)
    └── workflowDefinition.ts          # Step definitions config loader
```

### Pattern 1: Service Class with Dependency Injection
**What:** WorkflowOrchestrator receives all dependencies through its constructor -- stores, copilot client, lock, parser function, context builder function. This enables full unit testing with mocks.
**When to use:** Always for the orchestrator -- it touches Redis, Copilot SDK, parser, and context builder.
**Example:**
```typescript
export class WorkflowOrchestrator {
  constructor(
    private readonly workflowStore: WorkflowStateStore,
    private readonly conversationStore: ConversationStore,
    private readonly copilotClient: CopilotStudioClient,
    private readonly lock: ConversationLock,
    private readonly config?: OrchestratorConfig
  ) {}

  async processTurn(params: ProcessTurnParams): Promise<WorkflowResponse> {
    // Acquire per-conversation lock
    const release = await this.lock.acquire(params.conversationId);
    try {
      // 1. Load state (or create initial)
      // 2. Enrich query with buildContextualQuery
      // 3. Call Copilot
      // 4. Normalize activities
      // 5. Parse turn
      // 6. Merge collectedData
      // 7. Save state (sliding TTL)
      // 8. Return WorkflowResponse
    } catch (err) {
      // Rollback: do NOT save state on failure
      throw err;
    } finally {
      await release();
    }
  }
}
```

### Pattern 2: Redis SET NX PX Lock with Lua Release
**What:** Per-conversation mutex using Redis `SET lockKey token NX PX timeout`. Release uses a Lua script that atomically checks the token before DEL to prevent releasing a lock held by another request.
**When to use:** Every orchestrator call that modifies workflow state.
**Example:**
```typescript
// Acquire
const token = uuidv4();
const result = await redis.set(
  `lock:conv:${conversationId}`,
  token,
  'NX',          // Only set if not exists
  'PX', 10000    // Auto-expire after 10s (orphan protection)
);
if (result !== 'OK') throw new LockContention(conversationId);

// Release (Lua for atomicity)
const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;
await redis.eval(RELEASE_SCRIPT, 1, lockKey, token);
```

### Pattern 3: Factory Pattern Extension
**What:** Extend the existing `store/factory.ts` to also create a `WorkflowStateStore`, selecting Redis or InMemory based on `REDIS_URL` -- same pattern as `createConversationStore()`.
**When to use:** At module initialization in `store/index.ts`.
**Example:**
```typescript
// In factory.ts
export function createWorkflowStateStore(): WorkflowStateStore {
  if (config.REDIS_URL) {
    return new RedisWorkflowStateStore(getRedisClient()!, config.REDIS_TTL);
  }
  return new InMemoryWorkflowStateStore();
}

// In index.ts
export const workflowStateStore = createWorkflowStateStore();
```

### Pattern 4: Rollback-on-Failure (No Partial State)
**What:** The orchestrator loads state at the beginning of a turn and only saves it at the end, AFTER all operations succeed. If any step fails (Copilot call, parsing, etc.), the loaded state is discarded and never saved -- the turn is as if it never happened.
**When to use:** Every turn processing path.
**Example:**
```typescript
async processTurn(params) {
  const state = await this.workflowStore.get(params.conversationId);
  // state is read-only until the very end

  try {
    // ... all operations ...
    const updatedState = { ...state, collectedData: merged, turnCount: state.turnCount + 1 };
    await this.workflowStore.set(params.conversationId, updatedState);
    return response;
  } catch (err) {
    // state was never saved -- clean rollback
    throw err;
  }
}
```

### Anti-Patterns to Avoid
- **Saving state incrementally during the turn:** Save once at the end, not after each sub-step. Partial state on failure creates inconsistency.
- **In-memory fallback when Redis is down:** User decision: fail with 503, never fallback. State consistency is non-negotiable.
- **Embedding step definitions in WorkflowState:** User decision: step definitions live in config, not in state. State only tracks position.
- **Re-instantiating CopilotStudioClient per request:** The client is a singleton per CLAUDE.md. Pass it to the orchestrator constructor.
- **Catching lock contention and silently proceeding:** Lock contention means another request is processing the same conversation. Fail-fast with 409 or queue -- never skip the lock.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Redis atomic check-and-delete | Manual GET + conditional DEL | Lua script via `redis.eval()` | Two-command sequence is not atomic; another client could acquire between GET and DEL |
| Lock token uniqueness | Timestamp or counter | uuid v4 | UUIDs are globally unique; timestamps can collide under concurrent load |
| JSON serialization with validation | Manual JSON.parse | Zod schema `.parse()` on deserialization | Same pattern as RedisConversationStore -- catches schema drift |
| State TTL management | Manual expiration check | Redis `SETEX` / `SET EX` with TTL | Redis handles expiration atomically; no background cleanup needed |

**Key insight:** The project already has a proven pattern for Redis-backed stores (RedisConversationStore). Follow it exactly for RedisWorkflowStateStore -- same serialization, validation, TTL, pipeline patterns.

## Common Pitfalls

### Pitfall 1: Lock Released After Expiry (Lock Safety)
**What goes wrong:** A request acquires a lock, takes longer than the lock TTL (e.g., slow Copilot call), the lock expires, another request acquires it. The first request finishes and releases the SECOND request's lock.
**Why it happens:** Lock TTL set too low relative to operation duration, or release doesn't verify token ownership.
**How to avoid:** (1) Use Lua script for release that checks the token matches. (2) Set lock TTL conservatively above Copilot P99 latency (STATE.md notes 2-3s observed, 5s conservative, so 10s lock TTL is safe). (3) Log when a lock release returns 0 (token mismatch -- indicates lock expired).
**Warning signs:** Intermittent state corruption under concurrent load; lock release Lua returning 0.

### Pitfall 2: Stale State Overwrites (Read-Modify-Write Race)
**What goes wrong:** Two requests read the same state, both modify it, both write back -- second write overwrites first's changes.
**Why it happens:** No per-conversation locking, or lock acquired too late (after state read).
**How to avoid:** Acquire lock BEFORE reading state. Lock scope must cover the entire read-modify-write cycle.
**Warning signs:** collectedData fields disappearing or reverting between turns.

### Pitfall 3: Redis Down = Silent Data Loss
**What goes wrong:** Redis goes down, requests succeed with in-memory store, user continues workflow. Redis comes back, all in-memory state is gone.
**Why it happens:** Automatic fallback to in-memory on Redis failure.
**How to avoid:** User decision: fail with 503 when Redis is down. The factory selects ONE backend; no dual-storage. Same pattern as existing ConversationStore.
**Warning signs:** Tests that catch Redis errors and silently proceed instead of propagating.

### Pitfall 4: Sliding TTL Not Applied on Every Write
**What goes wrong:** State TTL counts down from first creation, not last access. Active workflows expire mid-use.
**Why it happens:** Using `SET` without re-applying `EX` on updates.
**How to avoid:** Every `workflowStore.set()` call must use `SET key value EX ttlSeconds` -- the EX resets the TTL on every write.
**Warning signs:** Long-running workflows suddenly losing state after 24 hours regardless of activity.

### Pitfall 5: Overwriting CollectedData Instead of Merging
**What goes wrong:** New ParsedTurn.data replaces all previous collectedData instead of merging into it.
**Why it happens:** Using `collectedData = parsedTurn.data` instead of `collectedData = { ...existing, ...newData }`.
**How to avoid:** Shallow-merge new data into existing collectedData. Keys with the same name from later turns overwrite earlier values (intentional -- latest answer wins).
**Warning signs:** Multi-turn workflows losing data from earlier turns.

## Code Examples

### Redis Workflow State Store (SET EX with Sliding TTL)
```typescript
// Pattern from existing RedisConversationStore, adapted for WorkflowState
const WF_PREFIX = 'wf:';

export class RedisWorkflowStateStore implements WorkflowStateStore {
  constructor(private readonly redis: Redis, private readonly ttlSeconds: number) {}

  async get(conversationId: string): Promise<WorkflowState | undefined> {
    const json = await this.redis.get(`${WF_PREFIX}${conversationId}`);
    if (!json) return undefined;
    return WorkflowStateSchema.parse(JSON.parse(json));
  }

  async set(conversationId: string, state: WorkflowState): Promise<void> {
    // EX resets TTL on every write (sliding window)
    await this.redis.set(
      `${WF_PREFIX}${conversationId}`,
      JSON.stringify(state),
      'EX', this.ttlSeconds
    );
  }

  async delete(conversationId: string): Promise<void> {
    await this.redis.del(`${WF_PREFIX}${conversationId}`);
  }
}
```

### Per-Conversation Lock
```typescript
const LOCK_PREFIX = 'lock:conv:';
const LOCK_TTL_MS = 10000; // 10 seconds

const RELEASE_LUA = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

export class RedisConversationLock implements ConversationLock {
  constructor(private readonly redis: Redis) {}

  async acquire(conversationId: string): Promise<() => Promise<void>> {
    const token = uuidv4();
    const key = `${LOCK_PREFIX}${conversationId}`;

    const result = await this.redis.set(key, token, 'NX', 'PX', LOCK_TTL_MS);
    if (result !== 'OK') {
      throw new ConversationLockError(conversationId);
    }

    // Return release function
    return async () => {
      const released = await this.redis.eval(RELEASE_LUA, 1, key, token);
      if (released === 0) {
        console.warn(`[lock] Token mismatch on release for ${conversationId} — lock may have expired`);
      }
    };
  }
}
```

### WorkflowResponse Shape
```typescript
export interface WorkflowResponse {
  conversationId: string;
  messages: NormalizedMessage[];
  parsedTurn: ParsedTurn;
  workflowState: WorkflowState;
  progress: {
    currentStep: string;
    totalSteps: number;
    percentComplete: number;
  };
  turnMeta: {
    turnNumber: number;
    stateChanged: boolean;
    collectedThisTurn: Record<string, unknown>;
  };
  latencyMs: number;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SETNX + EXPIRE (two commands) | SET key value NX PX ms (atomic) | Redis 2.6.12+ | Eliminates race between set and expire |
| Redlock for all Redis locks | SET NX PX for single-instance | Always valid for single-instance | Redlock adds complexity unnecessary for single Redis instance |
| In-memory state with Redis sync | Factory pattern: ONE backend | This project v1.4 | Eliminates dual-storage race conditions |

**Deprecated/outdated:**
- `SETNX` command alone: Use `SET ... NX` with `PX`/`EX` in a single command instead
- `redlock` for single-instance Redis: Overkill; SET NX PX is sufficient and simpler

## Open Questions

1. **Workflow step definitions format**
   - What we know: User decided step definitions live in a config file, not in WorkflowState. Steps are predefined.
   - What's unclear: The specific step names/structure depend on the Copilot agent's actual workflow (which steps exist, in what order).
   - Recommendation: Define a `WorkflowDefinition` type with an ordered array of step descriptors. Ship with a default definition; make it configurable. The orchestrator uses definition length for totalSteps and step index for percentComplete.

2. **Lock contention strategy: queue vs fail-fast**
   - What we know: User left this to Claude's discretion. Either approach is valid.
   - What's unclear: Expected concurrency level per conversation.
   - Recommendation: Fail-fast with 409 Conflict. Queuing adds complexity (retry loops, backoff) and masks problems. In a chat UI, concurrent requests on the same conversation typically indicate a bug (double-click) or rapid polling, not legitimate parallel work. Log contention events for observability.

3. **Lock TTL value**
   - What we know: STATE.md says Copilot P99 latency is 2-3s, suggests 5s conservative lock TTL.
   - What's unclear: Whether slow network or cold starts could push latency higher.
   - Recommendation: 10s lock TTL (2x the conservative estimate). If Copilot takes >10s, the operation would likely timeout anyway.

## Sources

### Primary (HIGH confidence)
- Project codebase: `server/src/store/RedisStore.ts` — proven Redis store pattern with ioredis, pipeline, TTL
- Project codebase: `server/src/store/factory.ts` — factory pattern for store backend selection
- Project codebase: `server/src/routes/orchestrate.ts` — existing inline orchestration logic to be refactored
- Project codebase: `server/src/parser/structuredOutputParser.ts` — parseTurn function (Phase 15)
- Project codebase: `server/src/workflow/contextBuilder.ts` — buildContextualQuery function (Phase 15)
- [Redis SET documentation](https://redis.io/docs/latest/commands/set/) — SET NX PX atomic lock pattern
- [Redis distributed locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/) — official Redis lock recommendations

### Secondary (MEDIUM confidence)
- [ioredis GitHub](https://github.com/redis/ioredis) — eval() for Lua scripts, SET NX PX support
- [Distributed locks in Node.js](https://bpaulino.com/entries/distributed-lock-in-node-js) — SET NX PX pattern with Lua release

### Tertiary (LOW confidence)
- None — all findings verified against official Redis docs or project codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in the project, patterns proven
- Architecture: HIGH — follows existing codebase patterns (factory, Redis store, DI)
- Pitfalls: HIGH — derived from project-specific patterns and official Redis lock documentation

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days — stable domain, no fast-moving dependencies)
