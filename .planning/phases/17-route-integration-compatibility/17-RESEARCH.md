# Phase 17: Route Integration + Compatibility - Research

**Researched:** 2026-02-22
**Domain:** API route evolution, backward compatibility, orchestrator integration
**Confidence:** HIGH

## Summary

Phase 17 integrates the WorkflowOrchestrator service (completed in Phase 16) into the three primary chat routes (`/start`, `/send`, `/card-action`) while preserving 100% backward compatibility. The challenge is a dual-mode operation: clients that send no workflow context must receive identical v1.4 behavior with zero changes; clients that opt into orchestration receive the new optional `workflowState` field in responses.

The architecture is already established: Phase 16 completed the WorkflowOrchestrator service with full orchestration logic (lock acquisition, state persistence, context enrichment, parsing, data accumulation). Phase 15 delivered structured output parsing and context building. The routes now delegate to the orchestrator instead of direct Copilot calls, but the response contracts must extend rather than break.

Key insight: The orchestrator is designed to be a drop-in replacement. The three chat routes currently do direct Copilot calls with minimal context enrichment; Phase 17 replaces those calls with orchestrator delegations while keeping the response structure backward compatible.

**Primary recommendation:** Each route should instantiate or inject the WorkflowOrchestrator singleton, delegate to it (passing userId/tenantId from JWT), extract the `workflowState` from the WorkflowResponse, and add it as an optional field to existing responses. Existing clients ignore the field; new clients consume it. No breaking changes.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Express.js | 4.18+ | HTTP routing, middleware chain | Standard from v1.0; used for all routes |
| TypeScript | 5.3+ | Type safety across request/response | Type-driven architecture throughout codebase |
| Zod | 3.22+ | Request/response validation | Single source of truth in shared/; used in Phase 15 schemas |
| ioredis | 5.3+ | Redis client for state persistence | Established in Phase 12; WorkflowStateStore uses it |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uuid | 9.0+ | Generate conversationId UUIDs | Already used in chat routes |
| @microsoft/agents-copilotstudio-client | (SDK) | Copilot Studio streaming | Singleton from v1.0; orchestrator uses it |
| @microsoft/agents-activity | (SDK) | Activity type definitions | Imported in orchestrator; consistent usage |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Updating response schemas with optional field | Breaking change to remove workflowState | Would force all clients to update; incompatible with v1.4 |
| Adding separate `/api/chat/orchestrated/*` routes | New route pattern for orchestrated endpoints | Doubles endpoint count; confusing client API surface |
| In-memory state instead of Redis for Phase 17 | Simplifies testing, loses persistence | Conflicts with Phase 16 design (Red-is-backed); no multi-instance support |

**Installation:** No new dependencies required. WorkflowOrchestrator already imported from Phase 16; it uses existing Express, ioredis, and Zod.

## Architecture Patterns

### Recommended Project Structure

The orchestrator is already in place from Phase 16:
```
server/src/
├── orchestrator/
│   ├── WorkflowOrchestrator.ts      # Main service (phase 16)
│   ├── types.ts                     # WorkflowResponse, ProcessTurnParams, etc.
│   └── index.ts                     # Export singleton
├── routes/
│   ├── chat.ts                      # PHASE 17: /start, /send, /card-action delegate here
│   └── orchestrate.ts               # /api/chat/orchestrate (already Phase 16)
├── store/
│   ├── WorkflowStateStore.ts        # (Phase 16)
│   └── ConversationStore.ts         # (Phase 16, extended)
└── workflow/
    ├── contextBuilder.ts            # (Phase 15)
    ├── workflowDefinition.ts        # (Phase 16)
    └── types.ts
```

### Pattern 1: Route Delegating to Orchestrator
**What:** Each chat route receives a request, extracts userId/tenantId from JWT claims (via req.user), and delegates to the orchestrator service method. The orchestrator handles all stateful logic; the route just adapts the response contract.

**When to use:** Whenever a route needs orchestration (state management, data accumulation, context enrichment). For Phase 17: always, on all three routes.

**Example:**
```typescript
// POST /api/chat/send — Phase 17
chatRouter.post('/send', async (req, res) => {
  const parsed = SendMessageRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.format() });
    return;
  }
  const { conversationId, text } = parsed.data;

  try {
    // Delegate to orchestrator
    const workflowResponse = await orchestrator.processTurn({
      conversationId,
      text,
      userId: req.user?.oid ?? 'anonymous',
      tenantId: req.user?.tid ?? 'dev',
    });

    // Return legacy response shape + optional workflowState
    res.status(200).json({
      conversationId: workflowResponse.conversationId,
      messages: workflowResponse.messages,
      workflowState: workflowResponse.workflowState, // Optional — clients ignore if not present
    });
  } catch (err) {
    // Error handling (unchanged from current)
  }
});
```

### Pattern 2: Backward-Compatible Response Extension
**What:** The response schema includes an optional `workflowState` field. Existing clients never sent workflow context and never expect the field; they parse responses successfully without it. New clients opt-in by sending workflow context on the request and consume the optional response field.

**When to use:** Any API response that needs to support both legacy and new client behaviors without breaking changes.

**Example in shared schema:**
```typescript
// Phase 17: Extend SendMessageResponse to include optional workflowState
export const SendMessageResponseSchema = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(NormalizedMessageSchema),
  workflowState: WorkflowStateSchema.optional(), // NEW — Phase 17
});

export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;
```

Clients parse this:
```typescript
// Legacy client (v1.4) — ignores workflowState
const response = await chatApi.send(...); // { conversationId, messages }

// New client (v1.5) — consumes workflowState
const response = await chatApi.send(...); // { conversationId, messages, workflowState }
```

### Pattern 3: Card Action Allowlist → Orchestrator Flow
**What:** The allowlist validation (cardActionAllowlist.ts) runs BEFORE orchestrator delegation. If validation fails, return 403 immediately. If validation passes, delegate to orchestrator.processCardAction().

**When to use:** When a route must perform synchronous validation before async work.

**Example:**
```typescript
// POST /api/chat/card-action — Phase 17
chatRouter.post('/card-action', async (req, res) => {
  // ... validate request shape ...

  // Step 1: Allowlist validation (COMPAT-02: existing contract unchanged)
  const allowlistResult = validateCardAction(submitData);
  if (!allowlistResult.ok) {
    res.status(403).json({ error: allowlistResult.reason });
    return; // Return 403 before reaching orchestrator
  }

  try {
    // Step 2: Delegate to orchestrator (now includes state management)
    const workflowResponse = await orchestrator.processCardAction({
      conversationId,
      cardId,
      userSummary,
      submitData,
      userId: req.user?.oid ?? 'anonymous',
      tenantId: req.user?.tid ?? 'dev',
    });

    // Step 3: Return extended response
    res.status(200).json({
      conversationId: workflowResponse.conversationId,
      messages: workflowResponse.messages,
      workflowState: workflowResponse.workflowState, // Optional
    });
  } catch (err) {
    // Error handling
  }
});
```

### Anti-Patterns to Avoid
- **Direct Copilot calls from routes**: Phase 17 replaces all direct `copilotClient.sendActivityStreaming()` calls in `/start`, `/send`, `/card-action` with orchestrator methods. Don't bypass the orchestrator to call Copilot directly.
- **Modifying request/response contracts to be non-optional**: The `workflowState` field MUST be optional in response schemas. Existing v1.4 clients cannot know about it.
- **Allowlist validation after orchestrator**: Card action allowlist must validate BEFORE orchestrator delegation to maintain existing 403 behavior (COMPAT-02).
- **Dual response paths (conditional structure)**: Don't return different response shapes based on workflow context presence. Always return the same structure with optional fields.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Response schema evolution with optional fields | Custom response object construction | Zod schemas with `.optional()` | Type inference handles all client parsing; no manual serialization bugs |
| Backward compatibility validation | Manual version checks or feature flags in route logic | Rely on schema `.optional()` and type inference | Schema does the work; clients evolve naturally |
| State persistence coordination | Redis and in-memory dual stores with sync logic | WorkflowStateStore interface with factory pattern | Already established in Phase 16; single source of truth prevents race conditions |
| Orchestrator instantiation and dependency injection | Inline `new WorkflowOrchestrator(...)` in each route | Singleton export from orchestrator/index.ts | Shared instance, testable, consistent lock/store references |

**Key insight:** The hardest part of backward compatibility is not adding features, it's keeping existing clients working. Schema design (optional fields) + dependency injection (shared orchestrator instance) eliminates the need for manual feature detection or conditional logic in routes.

## Common Pitfalls

### Pitfall 1: Breaking Change in Response Schema
**What goes wrong:** Adding `workflowState` as a required field breaks v1.4 clients that don't expect it. Their JSON parsers may fail or throw errors if the field is missing.

**Why it happens:** Designer assumes all clients understand the new field, but v1.4 clients are frozen and never updated.

**How to avoid:** Make `workflowState` optional in the Zod schema using `.optional()`. This allows both v1.4 and v1.5 clients to parse the same response without errors.

**Warning signs:**
- Response schema has `workflowState: WorkflowStateSchema` without `.optional()`
- Tests assume `workflowState` is always present in responses
- Routes conditionally include/exclude `workflowState` based on request context

### Pitfall 2: Orphaned Orchestrator Calls
**What goes wrong:** Some routes delegate to orchestrator, others still call Copilot directly. Data is inconsistent: state updates from orchestrator routes but not from direct-call routes.

**Why it happens:** Routes are migrated incrementally; developer forgets to update one route and it's not caught in testing.

**How to avoid:** Phase 17 MUST update all three routes (`/start`, `/send`, `/card-action`) to use orchestrator. Don't leave any direct `copilotClient.sendActivityStreaming()` calls in chat routes. (The only exception is `/api/chat/orchestrate`, which already uses orchestrator.)

**Warning signs:**
- `copilotClient.sendActivityStreaming()` appears in chat.ts after Phase 17 is complete
- Unit tests for `/send` mock copilotClient directly instead of orchestrator
- Conversation history is empty for some turns (means state wasn't updated by orchestrator)

### Pitfall 3: Allowlist Validation After Orchestrator
**What goes wrong:** The route delegates to orchestrator, orchestrator calls Copilot with invalid card action data. Allowlist validation that should have rejected it runs after Copilot already consumed the bad data.

**Why it happens:** Trying to simplify: "Let orchestrator handle everything," but orchestrator assumes pre-validated input.

**How to avoid:** Card action allowlist validation is synchronous and cheap; run it BEFORE orchestrator delegation (in the route handler). This preserves the existing COMPAT-02 contract (403 errors for disallowed actions).

**Warning signs:**
- orchestrator.processCardAction() is called before validateCardAction() check
- Tests for allowlist rejection don't verify 403 status code
- Routes for card actions differ in validation order

### Pitfall 4: Forgetting to Pass userId/tenantId to Orchestrator
**What goes wrong:** Route delegates to orchestrator but doesn't extract userId/tenantId from JWT claims (req.user), so orchestrator can't associate state with the user.

**Why it happens:** Developer copies the delegation call from /send to /start but misses the parameter-passing.

**How to avoid:** Orchestrator methods require ProcessTurnParams or ProcessCardActionParams with userId and tenantId. TypeScript will fail to compile if they're missing. Tests must verify req.user claims are extracted and passed.

**Warning signs:**
- TypeScript compiler errors: "Property 'userId' is missing in type"
- Tests pass hardcoded userId values instead of extracting from mock req.user
- Workflow state is saved but not associated with any user (orphaned records)

### Pitfall 5: Modifying WorkflowState After Orchestrator Returns
**What goes wrong:** Route calls orchestrator, receives WorkflowResponse with workflowState, then mutates the state object before returning to client.

**Why it happens:** Assuming orchestrator state is a template; developer thinks they need to "finalize" it.

**How to avoid:** Orchestrator returns finalized WorkflowState. Return it as-is from the route. If modification is needed, that's a sign the orchestrator logic is incomplete, not that routes should post-process state.

**Warning signs:**
- Response includes `workflowState: { ...workflowResponse.workflowState, ...extraFields }`
- Tests check route code for mutations of workflowState properties
- Workflow state diverges between server and client (server truth is orchestrator state; don't mutate)

## Code Examples

Verified patterns from Phase 16 orchestrator + Phase 15 parser implementation:

### Delegating /api/chat/send to Orchestrator
```typescript
// Source: Phase 16 WorkflowOrchestrator.ts + Phase 17 route update
chatRouter.post('/send', async (req, res) => {
  // 1. Validate request
  const parsed = SendMessageRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.format() });
    return;
  }
  const { conversationId, text } = parsed.data;

  try {
    // 2. Delegate to orchestrator (Phase 16 service)
    const workflowResponse = await orchestrator.processTurn({
      conversationId,
      text,
      userId: req.user?.oid ?? 'anonymous',
      tenantId: req.user?.tid ?? 'dev',
    });

    // 3. Return extended response (workflowState is optional for backward compatibility)
    res.status(200).json({
      conversationId: workflowResponse.conversationId,
      messages: workflowResponse.messages,
      workflowState: workflowResponse.workflowState,
    });
  } catch (err) {
    console.error('[chat/send] Error:', err);
    if (isRedisError(err)) {
      res.status(503).json({ error: 'Service Unavailable' });
    } else {
      res.status(502).json({ error: 'Failed to send message' });
    }
  }
});
```

### Delegating /api/chat/card-action with Allowlist Check
```typescript
// Source: Phase 16 WorkflowOrchestrator + Phase 17 route update + existing allowlist
chatRouter.post('/card-action', async (req, res) => {
  // 1. Validate request shape
  const parsed = CardActionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.format() });
    return;
  }
  const { conversationId, cardId, userSummary, submitData } = parsed.data;

  // 2. SYNCHRONOUS: Validate action against allowlist BEFORE orchestrator
  const allowlistResult = validateCardAction(submitData);
  if (!allowlistResult.ok) {
    console.warn(`[card-action] Rejected: ${allowlistResult.reason}`);
    res.status(403).json({ error: allowlistResult.reason });
    return; // Preserve existing COMPAT-02 contract
  }

  try {
    // 3. Delegate to orchestrator (Phase 16 service)
    const workflowResponse = await orchestrator.processCardAction({
      conversationId,
      cardId,
      userSummary,
      submitData,
      userId: req.user?.oid ?? 'anonymous',
      tenantId: req.user?.tid ?? 'dev',
    });

    // 4. Return extended response
    res.status(200).json({
      conversationId: workflowResponse.conversationId,
      messages: workflowResponse.messages,
      workflowState: workflowResponse.workflowState,
    });
  } catch (err) {
    console.error('[card-action] Error:', err);
    if (isRedisError(err)) {
      res.status(503).json({ error: 'Service Unavailable' });
    } else {
      res.status(502).json({ error: 'Failed to forward card action' });
    }
  }
});
```

### Delegating /api/chat/start to Orchestrator
```typescript
// Source: Phase 16 WorkflowOrchestrator.startSession() + Phase 17 route update
chatRouter.post('/start', async (req, res) => {
  try {
    // 1. Delegate to orchestrator to start workflow session
    const workflowState = await orchestrator.startSession({
      conversationId: uuidv4(),
      userId: req.user?.oid ?? 'anonymous',
      tenantId: req.user?.tid ?? 'dev',
    });

    // 2. Return response with conversationId + optional workflowState
    res.status(200).json({
      conversationId: workflowState.userId, // Preserve UUID generation at orchestrator level
      workflowState, // Optional — clients ignore if not present
    });
  } catch (err) {
    console.error('[chat/start] Error:', err);
    if (isRedisError(err)) {
      res.status(503).json({ error: 'Service Unavailable' });
    } else {
      res.status(502).json({ error: 'Failed to start conversation' });
    }
  }
});
```

### Schema Update: Extend Responses with Optional workflowState
```typescript
// Source: shared/src/schemas/api.ts — Phase 17 updates
import { WorkflowStateSchema } from './workflowState.js';

// POST /api/chat/start — Phase 17: Add workflowState (optional)
export const StartConversationResponseSchema = z.object({
  conversationId: z.string().uuid(),
  workflowState: WorkflowStateSchema.optional(),
});

// POST /api/chat/send — Phase 17: Add workflowState (optional)
export const SendMessageResponseSchema = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(NormalizedMessageSchema),
  workflowState: WorkflowStateSchema.optional(),
});

// POST /api/chat/card-action — Phase 17: Add workflowState (optional)
export const CardActionResponseSchema = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(NormalizedMessageSchema),
  workflowState: WorkflowStateSchema.optional(),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct Copilot calls in routes | Orchestrator delegation with state management | Phase 17 | Routes become thin adapters; state is managed centrally |
| v1.4 responses: { conversationId, messages } | v1.5 responses: { conversationId, messages, workflowState? } | Phase 17 | Optional field allows both v1.4 and v1.5 clients to work |
| Single-turn conversation state | Multi-turn workflow state with data accumulation | Phase 16 | collectedData persists across turns; orchestrator queries include context |
| Optional workflowContext input | Orchestrator assumes structured state on every turn | Phase 17 | Routes always call orchestrator, even without workflowContext; passthrough mode (unstructured Copilot responses) is handled internally |

**Deprecated/outdated:**
- Direct `copilotClient.sendActivityStreaming()` calls in chat routes — replaced by orchestrator delegation
- Manual context prefix building in routes — now handled by orchestrator.buildContextualQuery()
- Manual history updates in routes — now handled by orchestrator (conversation store updates)

## Open Questions

1. **Orchestrator Instantiation Pattern**
   - What we know: WorkflowOrchestrator is already a class from Phase 16; it needs workflowStore, conversationStore, copilotClient, lock, config
   - What's unclear: Should we export a singleton from orchestrator/index.ts or instantiate per-request?
   - Recommendation: Export a singleton (matches Phase 16 CopilotStudioClient singleton pattern). Simplifies testing, shared state, and avoids repeated dependency construction.

2. **Error Handling Divergence Between Routes**
   - What we know: Current routes catch errors and return 502 (Copilot) or 503 (Redis)
   - What's unclear: Does orchestrator throw different error shapes that routes need to handle?
   - Recommendation: Orchestrator propagates errors cleanly (doesn't wrap them). Routes catch and handle identically to v1.4 — no changes needed.

3. **Backward Compatibility Validation**
   - What we know: Tests must verify v1.4 behavior unchanged, v1.5 gains new field
   - What's unclear: How to test v1.4 client behavior without real old clients?
   - Recommendation: Unit tests parse responses without workflowState field (optional contract); integration tests verify new field is present.

4. **Lock Timeout and Per-Conversation Concurrency**
   - What we know: Phase 16 WorkflowOrchestrator acquires locks per conversation
   - What's unclear: What happens if two requests for the same conversationId arrive simultaneously?
   - Recommendation: Orchestrator's per-conversation locking (Redis SET NX PX) ensures sequential processing. Routes don't need to coordinate; orchestrator handles it.

## Sources

### Primary (HIGH confidence)
- **Phase 16 WorkflowOrchestrator.ts** — Complete implementation of orchestrator service with processTurn(), processCardAction(), startSession() methods; delegation pattern established
- **Phase 16 types.ts** — WorkflowResponse, ProcessTurnParams, ProcessCardActionParams contracts defining what routes receive from orchestrator
- **Phase 15 structuredOutputParser.ts** — Parser produces ParsedTurn with kind discriminator; orchestrator consumes this
- **shared/schemas/api.ts (current)** — Existing SendMessageResponseSchema, CardActionResponseSchema, StartConversationResponseSchema; Phase 17 extends with optional workflowState
- **REQUIREMENTS.md** — ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, COMPAT-01, COMPAT-02, COMPAT-03 define Phase 17 contracts

### Secondary (MEDIUM confidence)
- **Phase 16 WorkflowOrchestrator.test.ts** — Tests demonstrate expected orchestrator behavior and mock patterns
- **Existing chat.ts routes (current)** — Show current error handling, store interactions, and response patterns to preserve

### Tertiary (validation needed)
- **Orchestrator singleton export pattern** — Phase 16 code suggests singleton, but explicit export location TBD
- **Lock timeout behavior on concurrent requests** — Tested in Phase 16 unit tests; route-level integration tests will verify

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — No new libraries; established Zod, Express, ioredis patterns from v1.0–v1.4
- Architecture: HIGH — Phase 16 WorkflowOrchestrator is complete; routes are thin adapters calling it
- Pitfalls: HIGH — Backward compatibility is well-understood (optional fields, version-agnostic schema design)

**Research date:** 2026-02-22
**Valid until:** 2026-02-28 — Phase 17 implementation expected to lock these findings

**Phase 17 is an integration phase:** The hard work (orchestrator service, parser, context builder) is done in Phase 15–16. Phase 17 wires three routes to use the orchestrator and extends response schemas. High confidence this research directly enables planning.
