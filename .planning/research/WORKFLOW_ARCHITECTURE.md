# Architecture — Workflow Orchestrator & Structured Output Parser (v1.5)

**Project:** Agentic Copilot Chat App
**Milestone:** v1.5 Workflow Orchestrator + Structured Output Parsing
**Researched:** 2026-02-21

---

## Recommended Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Client (React 18 + Vite)                                    │
├─────────────────────────────────────────────────────────────┤
│  ChatShell                                                  │
│    useChatApi() [token acquisition]                        │
│      → orchestrateApi(query, workflowContext, token)       │
│                           ↓                                 │
└────────────────────────────┼────────────────────────────────┘
                             │ HTTPS + Bearer token
                             ↓
┌─────────────────────────────────────────────────────────────┐
│ Server (Express + Node 20)                                  │
├─────────────────────────────────────────────────────────────┤
│ Middleware:                                                 │
│  1. JwtAuthMiddleware (validate token)                     │
│  2. OrgAllowlistMiddleware (check tenant)                  │
│  3. IdempotencyMiddleware (check cache)                    │
│                           ↓                                 │
│ POST /api/chat/orchestrate                                 │
│  ├─ Validate request (Zod)                                │
│  ├─ Create Redlock lock (conversation-scoped)             │
│  ├─ Load WorkflowState from Redis                         │
│  ├─ Load/Create XState machine instance                   │
│  ├─ Send query to Copilot (with context injection)        │
│  ├─ Normalize response → NormalizedMessage[]               │
│  ├─ Extract structured payload (Zod)                      │
│  ├─ Send extracted signal to XState machine               │
│  ├─ Save updated WorkflowState to Redis (under lock)      │
│  ├─ Save updated StoredConversation to Redis              │
│  ├─ Cache response (idempotency)                          │
│  └─ Release lock, return response                         │
│                           ↓                                 │
│ Response: { conversationId, messages, extractedPayload,    │
│            latencyMs, workflowState }                      │
│                           ↓                                 │
└────────────────────────────┼────────────────────────────────┘
                             │ HTTPS + JSON
                             ↓
┌─────────────────────────────────────────────────────────────┐
│ Client UI Update                                            │
├─────────────────────────────────────────────────────────────┤
│  State: { messages, workflowState.step, collectedData }   │
│  Render: Chat transcript + Adaptive Cards + Progress bar   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow (Single Orchestrate Call)

```
User query
    ↓
Client: POST /orchestrate { query, workflowContext, token }
    ↓ (server validates token + org)
Check idempotency cache (Redis GET idempotency:${userId}:${key})
    ├─ HIT: Return cached response (end)
    └─ MISS: Continue
    ↓
Acquire Redlock: lock:conversation:${conversationId} (5s TTL)
    ├─ SUCCESS: Continue
    └─ TIMEOUT: Return 503 (service unavailable)
    ↓
Load WorkflowState from Redis (get workflow:${conversationId})
    ├─ EXISTS: Use existing state
    └─ NOT FOUND: Initialize new state
    ↓
Create XState machine actor (paymentMachine / onboardingMachine / etc)
    ↓
Inject workflowContext into Copilot prompt
    Format: [WORKFLOW_CONTEXT] step=gathering_payment constraints=[...] collectedData={...}
    ↓
Send to Copilot: CopilotStudioClient.sendActivityStreaming(userActivity)
    ↓
Receive Activity stream
    ├─ Message activity (type=Message)
    ├─ Card activity (type=Message + attachmentLayout=adaptiveCard)
    └─ Handoff activity (type=Handoff)
    ↓
Normalize: Activity[] → NormalizedMessage[] (v1.4 logic, unchanged)
    ├─ Extract from activity.value (high confidence)
    ├─ Extract from activity.entities (medium confidence)
    ├─ Extract from activity.text via regex (low confidence)
    └─ Each message has optional ExtractedPayload
    ↓
Get first extracted signal from messages
    ↓
Determine machine event:
    IF extracted.data.payment_method THEN event = 'PAYMENT_EXTRACTED'
    ELIF extracted.data.user_declined THEN event = 'USER_DECLINED'
    ELSE event = 'NO_SIGNAL' (pass through, no transition)
    ↓
Send event to machine: actor.send({ type: 'PAYMENT_EXTRACTED', payload: {...} })
    ↓
Machine transitions: gathering_payment → confirming
    (XState guards checked, actions executed)
    ↓
Update WorkflowState:
    - step = 'confirming' (from machine state)
    - collectedData = {...}  (merged from event payload)
    - turnCount = turnCount + 1
    - lastRecommendation = JSON.stringify(extracted.data)
    ↓
Save to Redis:
    - workflow:${conversationId} = WorkflowState (24h TTL)
    - conversation:${conversationId} = StoredConversation (24h TTL)
    ↓
Cache response:
    - idempotency:${userId}:${idempotencyKey} = OrchestrateResponse (1h TTL)
    ↓
Release Redlock
    ↓
Return response to client:
{
  conversationId,
  messages,
  extractedPayload,
  latencyMs,
  workflowState: { step: 'confirming', collectedData: {...}, ... }
}
    ↓
Client: Update UI, display progress bar, show next prompt
```

---

## Component Boundaries

| Component | Responsibility | Input | Output | Persists | Tests |
|-----------|---------------|-------|--------|----------|-------|
| **JwtAuthMiddleware** | Validate Bearer token, extract claims | req.headers.authorization | req.user (UserClaims) | — | auth.test.ts |
| **OrgAllowlistMiddleware** | Block disallowed tenants (403) | req.user.tid, ALLOWED_TENANT_IDS | Pass or block | — | orgAllowlist.test.ts |
| **IdempotencyMiddleware** | Check/store request cache | req.headers['x-idempotency-key'] | Cached response or null | Redis (1h TTL) | (new) |
| **orchestrateRouter** | Main orchestration endpoint | OrchestrateRequest (Zod) | OrchestrateResponse | — | orchestrate.test.ts |
| **Redlock** | Acquire/release conversation locks | conversationId | lock (with unlock method) | — | locks.test.ts (new) |
| **CopilotStudioClient** | SDK integration; singleton | Activity (user input) | Activity stream (generator) | SDK-internal | (live test only) |
| **activityNormalizer** | Convert Activity[] → NormalizedMessage[] | Activity[] | NormalizedMessage[] | — | activityNormalizer.test.ts |
| **XState machines** | Define workflow transitions | WorkflowState + event | Updated WorkflowState | — | workflows/*.test.ts (new) |
| **WorkflowStateStore** | Persist workflow state in Redis | conversationId | WorkflowState (or null) | Redis (24h TTL) | (factory.test.ts) |
| **ConversationStore** | Persist conversation + history | conversationId | StoredConversation | Redis (24h TTL) | (factory.test.ts, RedisStore.test.ts) |

---

## Data Structures

### WorkflowState (Zod schema in shared/)

```typescript
{
  step: string;                           // State node ID from machine (e.g., 'gathering_payment')
  collectedData?: Record<string, unknown>; // Accumulated extracted data across turns
  lastRecommendation?: string;            // JSON-stringified last extracted payload
  turnCount: number;                      // Orchestrate call count for this conversation
}
```

### ExtractedPayload (Zod schema, v1.4 — unchanged)

```typescript
{
  source: 'value' | 'entities' | 'text';
  confidence: 'high' | 'medium' | 'low';
  data: Record<string, unknown>;          // Must have ≥1 key
}
```

### StoredConversation (Zod schema, v1.4 — unchanged but extended)

```typescript
{
  externalId: string;
  sdkConversationRef: unknown;            // Activity[] (non-serializable; stored in-memory)
  history: NormalizedMessage[];
  userId: string;                         // From JWT claim (oid)
  tenantId: string;                       // From JWT claim (tid)
  createdAt: string;                      // ISO timestamp
  updatedAt: string;                      // ISO timestamp
  status: 'active' | 'completed' | 'error';
  // Future (v1.5.x): workflow?: { machineId: string; definition: unknown; }
}
```

### WorkflowContext (Zod schema, v1.3b — unchanged)

```typescript
{
  step: string;
  constraints?: string[];                 // E.g., ['payment_method', 'amount']
  collectedData?: Record<string, unknown>;
}
```

---

## XState Machine Pattern

### Machine Definition Structure

```typescript
// server/src/orchestrator/workflows/paymentMachine.ts
import { createMachine, assign } from 'xstate';
import type { WorkflowState } from '@copilot-chat/shared';

export const paymentMachine = createMachine({
  types: {} as {
    context: WorkflowState;
    events:
      | { type: 'PAYMENT_EXTRACTED'; payload: Record<string, unknown> }
      | { type: 'CONFIRM' }
      | { type: 'USER_DECLINED' }
      | { type: 'TIMEOUT' };
  },
  id: 'paymentFlow',
  initial: 'gathering',
  context: {
    step: 'gathering',
    collectedData: {},
    lastRecommendation: undefined,
    turnCount: 0,
  },
  states: {
    gathering: {
      description: 'Waiting for payment details',
      on: {
        PAYMENT_EXTRACTED: {
          target: 'confirming',
          guard: ({ context, event }) => {
            // Validate extraction has required fields
            return 'payment_method' in event.payload && 'amount' in event.payload;
          },
          actions: assign({
            collectedData: ({ context, event }) => ({
              ...context.collectedData,
              ...event.payload,
            }),
            step: 'confirming',
            lastRecommendation: ({ event }) => JSON.stringify(event.payload),
          }),
        },
        USER_DECLINED: 'cancelled',
        TIMEOUT: {
          target: 'retry',
          guard: ({ context }) => context.turnCount < 3,
        },
      },
    },
    confirming: {
      description: 'Waiting for user confirmation',
      on: {
        CONFIRM: 'success',
        USER_DECLINED: 'cancelled',
      },
    },
    retry: {
      description: 'Ask user again (timeout handling)',
      on: {
        PAYMENT_EXTRACTED: 'confirming',
        USER_DECLINED: 'cancelled',
      },
    },
    success: {
      type: 'final',
      output: ({ context }) => context,
    },
    cancelled: {
      type: 'final',
      output: ({ context }) => ({
        ...context,
        step: 'cancelled',
      }),
    },
  },
});
```

### Machine Usage in Orchestrate Endpoint

```typescript
import { interpret } from 'xstate';
import { paymentMachine } from '../orchestrator/workflows/paymentMachine.js';

// Load existing state (or initialize fresh)
const existingState = await workflowStateStore.get(conversationId) || {
  step: 'gathering',
  collectedData: {},
  turnCount: 0,
};

// Create actor with loaded state
const actor = interpret(paymentMachine.provide({
  context: existingState,
})).start();

// Determine event from extracted payload
let event: { type: string; payload?: unknown } = { type: 'NO_SIGNAL' };
if (extractedPayload?.data) {
  if ('payment_method' in extractedPayload.data) {
    event = { type: 'PAYMENT_EXTRACTED', payload: extractedPayload.data };
  } else if ('user_declined' in extractedPayload.data) {
    event = { type: 'USER_DECLINED' };
  }
}

// Send event to machine (triggers transition if matching)
actor.send(event);

// Read updated state
const updatedState = actor.getSnapshot().context;
await workflowStateStore.set(conversationId, updatedState);
```

---

## Lock Acquisition Pattern

### Redlock Wrapper

```typescript
// server/src/store/locks/conversationLock.ts
import Redlock from 'redlock-universal';
import { redisClient } from '../index.js';

export const redlock = new Redlock([redisClient], {
  driftFactor: 0.01,
  retryCount: 10,
  retryDelay: 200,
  retryJitter: 100,
});

export async function withConversationLock<T>(
  conversationId: string,
  fn: () => Promise<T>,
  ttlMs: number = 5000
): Promise<T> {
  const lockKey = `lock:conversation:${conversationId}`;
  const lock = await redlock.lock(lockKey, ttlMs);
  try {
    return await fn();
  } finally {
    await lock.unlock();
  }
}
```

### Usage in Orchestrate

```typescript
// Ensure state read → update → write is atomic
await withConversationLock(conversationId, async () => {
  const existingState = await workflowStateStore.get(conversationId);
  const updatedState = { ...existingState, ...newValues };
  await workflowStateStore.set(conversationId, updatedState);
});
```

---

## Idempotency Middleware

```typescript
// server/src/middleware/idempotency.ts
import { redisClient } from '../store/index.js';
import { OrchestrateResponseSchema } from '@copilot-chat/shared';

export async function idempotencyMiddleware(req, res, next) {
  const idempotencyKey = req.headers['x-idempotency-key'] as string;
  const userId = req.user?.oid;

  if (!idempotencyKey || !userId) {
    // No idempotency key; proceed normally
    return next();
  }

  const cacheKey = `idempotency:${userId}:${idempotencyKey}`;
  const cached = await redisClient.get(cacheKey);

  if (cached) {
    // Validate cached response (Zod safety check)
    const parsed = OrchestrateResponseSchema.safeParse(JSON.parse(cached));
    if (parsed.success) {
      res.set('X-Idempotency-Cache-Hit', 'true');
      return res.status(200).json(parsed.data);
    }
    // Cache corrupted; delete and continue
    await redisClient.del(cacheKey);
  }

  // Wrap res.json to cache successful responses
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 200) {
      redisClient.setex(cacheKey, 3600, JSON.stringify(body)).catch(console.error);
    }
    return originalJson(body);
  };

  next();
}
```

---

## Error Handling

### Decision Tree

```
Orchestrate request
    ↓
[1] Zod validation error?
    → 400 Bad Request (invalid schema)
    ↓
[2] JWT invalid/missing?
    → 401 Unauthorized (auth middleware catches)
    ↓
[3] Tenant not in allowlist?
    → 403 Forbidden (auth middleware catches)
    ↓
[4] Redlock timeout (can't acquire lock after 100ms)?
    → 503 Service Unavailable (distributed system overloaded)
    ↓
[5] Redis error (not lock timeout)?
    → 503 Service Unavailable (isRedisError detection)
    ↓
[6] Copilot Studio error (sendActivityStreaming fails)?
    → 502 Bad Gateway (external service unavailable)
    ↓
[7] XState machine error (guard fails, action throws)?
    → 500 Internal Server Error (workflow logic bug)
    ↓
[8] Success
    → 200 OK { conversationId, messages, workflowState, ... }
```

---

## State Diagram (Example: Payment Workflow)

```
        ┌─────────────────┐
        │   gathering     │ (waiting for payment_method)
        └────────┬────────┘
                 │
          PAYMENT_EXTRACTED (if valid)
                 ↓
        ┌─────────────────┐
        │  confirming     │ (ask for confirmation)
        └────────┬────────┘
                 │
           CONFIRM (yes)
                 ↓
        ┌─────────────────┐
        │    success      │ (final; store payment)
        └─────────────────┘

        From any state:
        USER_DECLINED → cancelled (final)
        TIMEOUT (if turnCount<3) → retry (ask again)
```

---

## Testing Strategy by Layer

### Unit Tests

| Layer | What | How |
|-------|------|-----|
| XState machines | Transitions, guards, context updates | Call `actor.send()`, assert `state.value` and `state.context` |
| Zod schemas | Extraction validation | Parse valid/invalid JSON, assert errors |
| Redlock wrapper | Lock/unlock contract | Mock ioredis-mock, verify lock key created/deleted |

### Integration Tests (ioredis-mock)

| Scenario | How |
|----------|-----|
| Multi-turn state accumulation | 5 orchestrate calls, verify collectedData grows |
| Race condition prevention | 10 concurrent calls to same conversation, verify final state consistent |
| Idempotency | Send same request twice, verify cached response returned |
| Lock timeout | Simulate long operation, verify 503 on lock timeout |

### Live Tests (Copilot SDK)

| Scenario | How |
|----------|-----|
| Context injection visible | Send query with workflowContext, inspect Copilot response (manual or SDK-based) |
| Extraction accuracy | Send known JSON/form data, verify extracted correctly |

---

## Deployment Topology

```
┌──────────────────────────────────────────┐
│ Azure Container Instance (or local)      │
├──────────────────────────────────────────┤
│ Server (Node 20 + Express)               │
│  ├─ Orchestrate endpoint                 │
│  ├─ Chat routes (existing)               │
│  └─ Health endpoint                      │
└──────┬────────────────────────────────────┘
       │ (network calls)
       ├─→ Redis (ioredis) [TLS]
       │   ├─ ConversationStore (24h TTL)
       │   ├─ WorkflowStateStore (24h TTL)
       │   └─ IdempotencyCache (1h TTL)
       │
       └─→ Copilot Studio [HTTPS]
           └─ CopilotStudioClient (singleton)

Multi-worker deployment:
┌─────────────┐         ┌──────────────────┐
│ Worker A    │         │ Worker B         │
├─────────────┤         ├──────────────────┤
│ Express     │─ lock ─→│ (waits on lock)  │
│ Orchestrate │ (5s)    │                  │
└────┬────────┘         └──────────────────┘
     └────────────┬─────────────┬──────────┐
                  ↓             ↓          ↓
             Redis [1 instance, all workers share]
```

---

## Backward Compatibility

### v1.4 → v1.5 Transition

- ✓ StoredConversation schema: Backward-compatible (new `workflow` field would be optional)
- ✓ Orchestrate response: New `workflowState` field added (existing clients ignore)
- ✓ Context injection: Same format, no breaking changes
- ✓ Extraction: Zod validation unchanged
- ✓ Routes: `/api/chat/start`, `/api/chat/send`, `/api/chat/card-action` unaffected

---

## Patterns to Follow

### 1. Zod-First Validation

All request/response bodies validated with Zod BEFORE processing.

```typescript
const parsed = OrchestrateRequestSchema.safeParse(req.body);
if (!parsed.success) return res.status(400).json({ error: 'Invalid request' });
```

### 2. Atomic Operations Under Lock

Any read-modify-write on conversation state wrapped in Redlock.

```typescript
await withConversationLock(conversationId, async () => {
  const state = await workflowStateStore.get(conversationId);
  state.collectedData = { ...state.collectedData, ...newData };
  await workflowStateStore.set(conversationId, state);
});
```

### 3. Deterministic Event Routing

Extract signal → determine machine event → send event (no hidden side effects).

```typescript
let event = { type: 'NO_SIGNAL' };
if (extractedPayload?.data?.payment_method) {
  event = { type: 'PAYMENT_EXTRACTED', payload: extractedPayload.data };
}
actor.send(event);
```

### 4. TTL-Based Expiry

All Redis keys have explicit TTL; no manual cleanup needed.

```typescript
await redisClient.setex(`conversation:${id}`, 86400, JSON.stringify(data));
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why Bad | What to Do Instead |
|--------------|---------|-------------------|
| Update WorkflowState without lock | Race conditions if 2 workers process same conversation | Always wrap in `withConversationLock()` |
| Inline Copilot calls in route handler | Hard to test; high latency + failures | Extract to service layer (future refactoring) |
| Mutate XState machine context directly | Breaks determinism; transitions won't detect changes | Use `assign()` actions in event handlers |
| Store entire machine definition in Redis | Machines not serializable; definition changes break resume | Store WorkflowState only (machine is ephemeral) |
| Trust extracted data without re-validation | Extraction might be wrong or malicious | Always Zod-validate extracted.data |
| Idempotency key collision | Different users with same key return others' responses | Use `${userId}:${key}` composite key |

---

## Scalability Considerations

| Metric | At 100 users | At 10K users | At 1M users |
|--------|--------------|--------------|-------------|
| Redis key count | ~500 (5 keys per conversation) | ~50K | ~5M |
| Redis memory (1KB keys) | ~500KB | ~50MB | ~5GB |
| Lock contention | <1% (low) | <5% (low) | ~20% (monitor) |
| Idempotency cache hit rate | ~10% (most calls fresh) | ~30% (more retries) | ~50% (mobile users) |
| Copilot API rate limit | Not reached (<1 call/sec) | Not reached (<100 calls/sec) | Monitor (1000+/sec possible) |

---

## Sources

- [XState Official Documentation](https://xstate.js.org/) — State machines, actors, services
- [Redis Distributed Locks Guide](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/) — Redlock algorithm
- [Idempotency RFC](https://httptoolkit.com/blog/idempotency-keys/) — HTTP semantics
- [Workflow Orchestration Patterns](https://oneuptime.com/blog/post/2026-01-30-microservices-orchestration-pattern/view) — Architecture patterns

---

*Last updated: 2026-02-21 — v1.5 Workflow Orchestrator Research*
