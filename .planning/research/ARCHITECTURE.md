# Architecture: Workflow Orchestrator & Structured Output Parser Integration

**Domain:** Agentic Copilot Chat App – v1.5 Orchestrator & Structured Output Parsing
**Researched:** 2026-02-21
**Overall Confidence:** HIGH

---

## Executive Summary

The Workflow Orchestrator and Structured Output Parser integrate cleanly into the existing Express architecture by:

1. **Structured Output Parser** — a new component in `server/src/parser/structuredOutputParser.ts` that wraps and extends the existing `extractStructuredPayload` logic from `activityNormalizer.ts` with multi-strategy parsing, Zod validation, and parsing confidence signals.

2. **Workflow Orchestrator** — a stateful service in `server/src/workflow/WorkflowOrchestrator.ts` that orchestrates the conversation flow: enriching queries via context building, sending to Copilot, parsing responses, updating state, and determining next steps.

3. **Context Builder** — a utility module in `server/src/workflow/contextBuilder.ts` that enriches outbound messages with workflow state and collectedData, replacing the current inline `buildContextPrefix` in routes.

4. **Minimal Route Changes** — existing `/start`, `/send`, and `/card-action` routes are *minimally modified* (not replaced); they add `workflowState` to responses when orchestrator integration is enabled. The `/orchestrate` route remains the primary entry point for stateful workflows.

5. **Store Integration** — both `ConversationStore` (Redis/InMemory) and `WorkflowStateStore` (in-memory for v1.5) are called unchanged. The schema additions in `StoredConversation` (workflowId, currentStep, stepData, metadata) provide optional workflow metadata; old records deserialize without error via Zod `.default()` values.

6. **Backward Compatibility** — passthrough mode is automatic. When no structured output is detected, responses are identical to v1.4 behavior. When workflow context is omitted from request, routes work as before (no context injection).

---

## Data Flow: Request → Parser → Orchestrator → Store

### Current (v1.4) Flow – `/api/chat/send`

```
Client POST /api/chat/send
  ↓
Auth Middleware (validates JWT, populates req.user)
  ↓
Org Allowlist Middleware (filters by tenantId)
  ↓
Route Handler (/send in chat.ts):
  1. Parse request (conversationId, text, optional workflowContext)
  2. Look up conversation in ConversationStore
  3. Build outbound message (inline buildContextPrefix if workflowContext present)
  4. Call copilotClient.sendActivityStreaming(userActivity)
  5. Normalize activities → NormalizedMessage[] (via activityNormalizer.normalizeActivities)
     - Inline extractStructuredPayload runs (3-surface priority: value > entities > text)
  6. Store conversation history + metadata in ConversationStore
  7. Return { conversationId, messages }
```

**No structured output parsing beyond extraction.** The `ExtractedPayload` (if present) is bundled into `NormalizedMessage`, but no JSON schema validation, no parsing rules, no workflow state mutations.

### New (v1.5) Flow – `/api/chat/send` + Orchestrator Integration

```
Client POST /api/chat/send (or POST /api/chat/orchestrate for stateful workflows)
  ↓
Auth Middleware → Org Allowlist Middleware
  ↓
Route Handler:
  1. Parse request
  2. Look up conversation (or start new conversation for /orchestrate)
  3. [NEW] Load workflowState from WorkflowStateStore (if exists)
  4. [NEW] Context Builder enriches message with workflowState + collectedData
  5. Call copilotClient.sendActivityStreaming(enrichedMessage)
  6. normalizeActivities → NormalizedMessage[] with extractedPayload
  7. [NEW] Structured Output Parser:
     - Input: NormalizedMessage[] + extractedPayload surfaces
     - Strategy 1: Multi-layer JSON parsing (exact, partial, lossy)
     - Strategy 2: Zod schema validation (if CopilotStructuredOutputSchema provided)
     - Strategy 3: Confidence scoring (high/medium/low)
     - Output: ParsedStructuredOutput { schema, validated, confidence, raw, fallback }
  8. [NEW] Workflow Orchestrator:
     - Updates workflowState (step, collectedData, turnCount)
     - Stores in WorkflowStateStore + StoredConversation.stepData
     - Determines next action (continue, collect_more, error, complete)
  9. Return response with { conversationId, messages, workflowState, nextAction, ...}
  10. Store everything in ConversationStore + WorkflowStateStore
```

---

## Component Boundaries

### Existing Components (No Changes to Core Logic)

| Component | File | Responsibility | Inputs | Outputs |
|-----------|------|-----------------|--------|---------|
| **normalizeActivities** | `server/src/normalizer/activityNormalizer.ts` | Convert Copilot SDK Activities → NormalizedMessage[] with extractedPayload | `Activity[]` | `NormalizedMessage[]` (each with optional `extractedPayload: ExtractedPayload`) |
| **extractStructuredPayload** | (internal to normalizer) | Extract JSON from 3 surfaces (value, entities, text) | `Activity, role` | `ExtractedPayload \| undefined` |
| **ConversationStore** | `server/src/store/ConversationStore.ts` (interface) | Persistence abstraction | conversation ID, StoredConversation | saved/retrieved record |
| **WorkflowStateStore** | `server/src/store/WorkflowStateStore.ts` (interface) | Workflow state persistence | conversationId, WorkflowState | saved/retrieved state |
| **buildContextPrefix** | `server/src/routes/chat.ts` (current) | Format [WORKFLOW_CONTEXT] delimited prefix | `WorkflowContext` | `string` prefix |
| **CopilotStudioClient** | `server/src/copilot.ts` | Singleton proxy to Copilot SDK | message Activity | streaming Activities |

### New Components (v1.5 Additions)

| Component | File | Responsibility | Inputs | Outputs |
|-----------|------|-----------------|--------|---------|
| **StructuredOutputParser** | `server/src/parser/structuredOutputParser.ts` | Multi-strategy JSON parsing + Zod validation | `NormalizedMessage[], CopilotStructuredOutputSchema?` | `ParsedStructuredOutput` { schema, validated, confidence, raw, fallback } |
| **WorkflowOrchestrator** | `server/src/workflow/WorkflowOrchestrator.ts` | Stateful orchestration: context enrichment, state accumulation, next-step determination | `conversationId, messages, extractedPayload, existingState, schema?` | Updated `WorkflowState`, next action signal (continue/collect/error/complete) |
| **contextBuilder** | `server/src/workflow/contextBuilder.ts` | Enrich queries with workflow state; replace inline `buildContextPrefix` | `WorkflowState, collectedData, step, constraints` | Enriched message text with [WORKFLOW_CONTEXT] prefix |

### Schema Additions (shared/)

| Schema | File | Purpose |
|--------|------|---------|
| **CopilotStructuredOutputSchema** | `shared/src/schemas/workflow.ts` | (NEW) Zod schema describing expected Copilot response structure (e.g., { "recommendation": string, "confidence": number }) |
| **ParsedStructuredOutput** | `shared/src/schemas/workflow.ts` | (NEW) Result shape from parser: { schema, validated, confidence, raw, fallback } |
| **StoredConversation** | `shared/src/schemas/storedConversation.ts` | (EXTENDED) Added optional workflowId, currentStep, stepData, metadata; backward compatible |
| **WorkflowState** | `shared/src/schemas/workflowState.ts` | (EXISTING, used) Multi-turn state: step, collectedData, lastRecommendation, turnCount |
| **WorkflowContext** | `shared/src/schemas/workflowContext.ts` | (EXISTING, used) Context injection payload: step, constraints, collectedData |

---

## New vs. Modified Components Explicit

### STAYS UNCHANGED ✓

- `server/src/copilot.ts` — CopilotStudioClient singleton
- `server/src/normalizer/activityNormalizer.ts` — normalizeActivities, extractStructuredPayload (logic reused, not modified)
- `server/src/store/ConversationStore.ts` — interface unchanged; implementations (InMemory, Redis) work as-is
- `server/src/store/factory.ts` — factory logic unchanged
- `server/src/middleware/auth.ts` — authentication unchanged
- `server/src/middleware/orgAllowlist.ts` — authorization unchanged
- `server/src/allowlist/cardActionAllowlist.ts` — action validation unchanged
- Existing schemas: `WorkflowContext`, `WorkflowState` (already present)

### MINIMALLY MODIFIED (Backward Compatible)

**`server/src/routes/chat.ts`**
- `/start`: Add optional `workflowState` to response (only if orchestrator flag enabled)
- `/send`: Add optional `workflowState` to response
- `/card-action`: Add optional `workflowState` to response
- Move `buildContextPrefix` → `contextBuilder` module (internal refactor, same logic)
- Call orchestrator for state mutation (optional, backward-compatible)

**`server/src/routes/orchestrate.ts`**
- Already exists; extend to call new parser and orchestrator
- Keep batteries-included single-call design (start → send → parse → orchestrate)

**`shared/src/schemas/api.ts`**
- Extend `SendMessageResponse`, `CardActionResponse`, `OrchestrateResponse` to include optional `workflowState`
- Add new response shape for parser results (if exposed via API)

**`shared/src/schemas/storedConversation.ts`**
- Already extended (v1.4) with optional `workflowId, currentStep, stepData, metadata`
- Already backward compatible via Zod `.default()` values

### NEWLY CREATED

1. **`server/src/parser/structuredOutputParser.ts`**
   - Class: `StructuredOutputParser`
   - Method: `parse(messages: NormalizedMessage[], schema?: ZodSchema): Promise<ParsedStructuredOutput>`
   - Strategies:
     - Exact match: JSON must fully conform to schema
     - Partial match: Extract subset of fields from loose JSON
     - Lossy fallback: Use raw JSON as-is with low confidence
   - Returns: `ParsedStructuredOutput` with validated, raw, confidence, fallback metadata

2. **`server/src/workflow/WorkflowOrchestrator.ts`**
   - Class: `WorkflowOrchestrator`
   - Constructor: Takes `conversationStore`, `workflowStateStore`, `parser`
   - Methods:
     - `orchestrate(conversationId, messages, extractedPayload, existingState, schema)`: Updates state, determines next action
     - `updateState(state, extractedPayload)`: Mutations (collectedData, lastRecommendation, turnCount)
     - `determineNextAction(state, parsed, rules)`: YES/NO/MAYBE on continue, collect_more, error, complete
   - Returns: `{ updatedState, nextAction, reason, confidence }`

3. **`server/src/workflow/contextBuilder.ts`**
   - Function: `enrichContextForMessage(baseMessage, workflowState, collectedData, step, constraints): string`
   - Replaces inline `buildContextPrefix` logic
   - Returns formatted [WORKFLOW_CONTEXT] prefix
   - Testable in isolation

4. **`shared/src/schemas/workflow.ts`** (NEW)
   - `CopilotStructuredOutputSchema` — user-defined schema for Copilot's expected response
   - `ParsedStructuredOutput` — parser output shape
   - `NextAction` — enum: 'continue' | 'collect_more' | 'error' | 'complete'

---

## Data Flow: End-to-End Trace

### Scenario: Multi-turn Workflow (3-step form)

**Turn 1: `/api/chat/orchestrate`**

```
Request:
{
  "query": "I need help with my account",
  "workflowContext": { "step": "identify_issue", "constraints": ["no_financial_data"], "collectedData": {} }
}

Route Handler (orchestrate.ts):
1. Parse request → { query, workflowContext }
2. startConversationStreaming() → collect initial greeting
3. Load workflowState from store (first time: undefined) → use defaults
4. ContextBuilder.enrichContextForMessage(query, state, collectedData) → prepend [WORKFLOW_CONTEXT]
5. sendActivityStreaming(enriched) → collect Copilot response
6. normalizeActivities() → NormalizedMessage[] with extractedPayload
7. StructuredOutputParser.parse(messages, schema?) → ParsedStructuredOutput
   - Input: [ { kind: 'text', text: '{"issue": "login_problem", "severity": "high"}' } ]
   - Strategy: Exact match against { issue: string, severity: string }
   - Output: { schema: matched, validated: {...}, confidence: 'high', raw: {...} }
8. WorkflowOrchestrator.orchestrate(...):
   - Update state.collectedData["issue"] = "login_problem"
   - Set state.lastRecommendation = "identify_issue complete"
   - Increment state.turnCount = 1
   - nextAction = 'continue' (move to next step)
9. Store conversation + state
10. Response:
{
  "conversationId": "abc-123",
  "messages": [...],
  "extractedPayload": { "source": "text", "confidence": "high", "data": {...} },
  "latencyMs": 450,
  "workflowState": { "step": "collect_recovery_email", "collectedData": {...}, "turnCount": 1 },
  "nextAction": "continue"
}

Turn 2: Client sees nextAction='continue', UI moves to recovery email collection step
POST /api/chat/send:
{
  "conversationId": "abc-123",
  "text": "My recovery email is user@example.com",
  "workflowContext": {
    "step": "collect_recovery_email",
    "constraints": ["email_format_only"],
    "collectedData": { "issue": "login_problem", "severity": "high" }
  }
}

Route Handler (/send in chat.ts):
1. Parse request
2. conversationStore.get("abc-123") → { userId, tenantId, history, ... }
3. Load workflowState from store → { step: "collect_recovery_email", collectedData: {...}, turnCount: 1 }
4. ContextBuilder.enrichContextForMessage(text, state) → prepend context
5. sendActivityStreaming(enriched) → Copilot response
6. normalizeActivities() → messages[]
7. StructuredOutputParser.parse(messages) → ParsedStructuredOutput
8. WorkflowOrchestrator.orchestrate():
   - collectedData["recovery_email"] = "user@example.com"
   - turnCount = 2
   - nextAction = 'continue'
9. conversationStore.set() + workflowStateStore.set()
10. Response: { conversationId, messages, workflowState, nextAction }
```

**Impact on Existing Code:**

- **Backward compat**: If client doesn't send `workflowContext`, routes work exactly as v1.4 (no context prefix, no state updates).
- **Store calls unchanged**: `conversationStore.get/set` still used identically.
- **Normalizer unchanged**: `normalizeActivities` still called identically, still extracts payload.
- **CopilotStudioClient unchanged**: Still singleton, still used same way.
- **Error handling unchanged**: Redis/Copilot error differentiation still via `isRedisError`.

---

## Build Order & Dependencies

### Phase Dependencies (What Must Be Built First)

```
shared/src/schemas/workflow.ts (CopilotStructuredOutputSchema, ParsedStructuredOutput, NextAction)
  ↓ (depends on schema definitions)
server/src/parser/structuredOutputParser.ts (uses ParsedStructuredOutput)
  ↓ (depends on parser)
server/src/workflow/contextBuilder.ts (independent, no dependencies on parser/orchestrator)
  ↓
server/src/workflow/WorkflowOrchestrator.ts (depends on parser, contextBuilder, WorkflowStateStore)
  ↓ (depends on orchestrator)
server/src/routes/chat.ts (refactor: extract buildContextPrefix → contextBuilder, call orchestrator)
server/src/routes/orchestrate.ts (extend: call new orchestrator + parser)
```

### Recommended Build Order

**Phase A: Schema Definitions (Foundational)**

1. **`shared/src/schemas/workflow.ts`** (NEW)
   - Define `CopilotStructuredOutputSchema` (Zod)
   - Define `ParsedStructuredOutput` (Zod)
   - Define `NextAction` enum
   - Extend `OrchestrateResponseSchema` to include `workflowState, nextAction`
   - Export types for use in server modules

**Phase B: Parser (Parsing Strategy)**

2. **`server/src/parser/structuredOutputParser.ts`** (NEW)
   - `StructuredOutputParser` class
   - `parse()` method with 3 strategies (exact, partial, fallback)
   - Zod schema validation
   - Confidence scoring
   - Unit tests (9-12 test cases: exact match, partial, fallback, invalid, empty, etc.)

**Phase C: Orchestration Infrastructure**

3. **`server/src/workflow/contextBuilder.ts`** (NEW)
   - Extract `buildContextPrefix` from `chat.ts` → standalone function
   - Add `buildWorkflowContextPrefix(state, collectedData, step, constraints): string`
   - Testable in isolation

4. **`server/src/workflow/WorkflowOrchestrator.ts`** (NEW)
   - `WorkflowOrchestrator` class
   - Constructor: DI for `conversationStore, workflowStateStore, parser`
   - `orchestrate(conversationId, messages, extractedPayload, existingState, schema?)` → updated state + nextAction
   - `updateState()` mutation helper
   - `determineNextAction()` decision tree
   - Unit tests (10-15 cases: state accumulation, decision trees, schema validation, errors)

**Phase D: Route Integration**

5. **`server/src/routes/orchestrate.ts`** (EXTEND)
   - Add call to `WorkflowOrchestrator.orchestrate()` after normalizeActivities
   - Pass `ParsedStructuredOutput` to orchestrator
   - Return `workflowState + nextAction` in response
   - Backward compatible: if orchestrator disabled, omit from response

6. **`server/src/routes/chat.ts`** (REFACTOR, MINIMAL)
   - Remove inline `buildContextPrefix`, import from `contextBuilder`
   - Add optional call to `WorkflowOrchestrator.orchestrate()` for /send and /card-action
   - Add `workflowState` to response (optional field)
   - No logic changes, only minor integration points

7. **`shared/src/schemas/api.ts`** (EXTEND)
   - Extend `SendMessageResponse`, `CardActionResponse` to include optional `workflowState`
   - No breaking changes (new fields optional)

**Phase E: Verification & Testing**

8. **Integration tests**
   - End-to-end orchestrate → parser → orchestrator flow
   - Backward compat: requests without workflowContext still work
   - Store integration: verify state persisted correctly

---

## Integration Points: New ↔ Existing

### Parser ↔ Activity Normalizer

**Current:** `normalizeActivities()` calls `extractStructuredPayload()` inline, returns `NormalizedMessage[]` with optional `extractedPayload`.

**New:** Parser receives `NormalizedMessage[]` output from normalizer; re-examines `extractedPayload` surfaces plus raw text for multi-strategy validation.

**Flow:**
```
normalizeActivities(activities: Activity[]) → NormalizedMessage[] (with extractedPayload)
  ↓ (passed to parser)
StructuredOutputParser.parse(messages: NormalizedMessage[], schema?) → ParsedStructuredOutput
```

**Implication:** Parser can re-validate or reparse failed extractions; normalizer logic untouched.

### Orchestrator ↔ Conversation Store

**Current:** Routes call `conversationStore.get/set` directly; store holds full conversation history in `StoredConversation`.

**New:** Orchestrator updates `WorkflowState` via `workflowStateStore.set(conversationId, state)` AND updates `StoredConversation.stepData, metadata` via `conversationStore.set()`.

**Flow:**
```
Route loads: conversationStore.get(conversationId) → StoredConversation
  ↓ (history used for context)
Orchestrator updates:
  - workflowStateStore.set(conversationId, WorkflowState)
  - conversationStore.set(conversationId, { ...old, stepData, metadata })
```

**Implication:** Dual-write pattern; WorkflowStateStore is source-of-truth for orchestration state, StoredConversation.stepData is audit trail. No migration needed; old records work via Zod `.default()`.

### Orchestrator ↔ Context Builder

**Current:** `buildContextPrefix()` called inline in route, returns string prefix.

**New:** `contextBuilder.enrichContextForMessage()` called by orchestrator, same interface.

**Flow:**
```
Route has workflowContext
  ↓
contextBuilder.enrichContextForMessage(text, state, collectedData)
  ↓
Prepend [WORKFLOW_CONTEXT] to message
```

**Implication:** testable in isolation; same behavior, better organization.

### Routes ↔ Parser & Orchestrator

**Current Routes:**
1. Parse request
2. Look up conversation
3. Build message (with context prefix if provided)
4. Send to Copilot
5. Normalize response
6. Store history
7. Return

**New Routes (additions only):**
1. Steps 1-5 (unchanged)
2. [NEW] Call `parser.parse(messages)`
3. [NEW] Call `orchestrator.orchestrate(conversationId, messages, parsed, state)`
4. Steps 6-7 (store now includes workflowState)
5. Return response + workflowState

**Implication:** Routes delegate parsing/orchestration to services; routes remain thin.

---

## Backward Compatibility Guarantees

### Scenario 1: Client Doesn't Send `workflowContext`

**v1.4 behavior (preserved):**
```
POST /api/chat/send
{
  "conversationId": "...",
  "text": "Hello"
}

Response:
{
  "conversationId": "...",
  "messages": [...]
}
```

**v1.5 behavior (identical):**
- ContextBuilder not called (no context to inject)
- WorkflowOrchestrator not called (no state to manage)
- Response adds optional `workflowState` field (not sent if null/absent)
- Message history stored identically

### Scenario 2: Copilot Returns Plain Text (No Structured Output)

**v1.4:**
```
NormalizedMessage: { kind: 'text', text: 'Hello!' }
No extractedPayload
```

**v1.5:**
```
NormalizedMessage: { kind: 'text', text: 'Hello!' }
Parser.parse() → ParsedStructuredOutput { validated: null, confidence: 'none', fallback: true }
Orchestrator sees fallback → treats as unstructured passthrough
Response includes workflowState (unmodified from previous turn)
```

### Scenario 3: Old Records in Redis

**v1.4 record:**
```json
{
  "externalId": "...",
  "sdkConversationRef": [...],
  "history": [...],
  "userId": "...",
  "tenantId": "...",
  "createdAt": "...",
  "updatedAt": "...",
  "status": "active"
}
```

**v1.5 deserialization (Zod parse):**
```typescript
StoredConversationSchema.parse(record)
// Missing fields use .default() values:
// - workflowId: undefined (optional)
// - currentStep: undefined (optional)
// - stepData: undefined (optional)
// - metadata: undefined (optional)
// Result: { ...record, workflowId: undefined, currentStep: undefined, ... }
```

**Implication:** Zero migration script needed; Zod handles it.

---

## Suggested Implementation Checklist

### Phase A: Schema (No Breaking Changes)

- [ ] Create `shared/src/schemas/workflow.ts` with:
  - `CopilotStructuredOutputSchema` (user-provided Zod schema)
  - `ParsedStructuredOutput` (result of parser)
  - `NextAction` enum
- [ ] Extend `shared/src/schemas/api.ts`:
  - Add `workflowState?: WorkflowState` to `SendMessageResponse`
  - Add `workflowState?: WorkflowState` to `CardActionResponse`
  - Add `nextAction?: NextAction` to `OrchestrateResponse`
- [ ] Run `npm run lint`, `npm test` — all existing tests pass

### Phase B: Parser (Isolated, Testable)

- [ ] Create `server/src/parser/structuredOutputParser.ts`:
  - Class `StructuredOutputParser`
  - `parse(messages, schema?)` method
  - 3 strategies: exact, partial, fallback
  - Confidence scoring
- [ ] Unit tests (9-12 cases):
  - Exact match against schema
  - Partial field extraction
  - Fallback on invalid JSON
  - Empty response
  - No extractedPayload
- [ ] Run `npm run lint`, `npm test` — parser tests pass

### Phase C: Orchestration (Thin Integration)

- [ ] Create `server/src/workflow/contextBuilder.ts`:
  - Move `buildContextPrefix` logic from `chat.ts`
  - Add `buildWorkflowContextPrefix()` variant
  - Unit tests (4-6 cases)
- [ ] Create `server/src/workflow/WorkflowOrchestrator.ts`:
  - Class with DI for stores + parser
  - `orchestrate()` method
  - `updateState()` helper
  - `determineNextAction()` decision tree
  - Unit tests (10-15 cases)
- [ ] Run `npm run lint`, `npm test` — orchestrator tests pass

### Phase D: Route Integration (Minimal Changes)

- [ ] Modify `server/src/routes/chat.ts`:
  - Import `contextBuilder` (replace inline buildContextPrefix)
  - Optional call to `orchestrator.orchestrate()` after normalizeActivities
  - Add `workflowState` to response shape
  - No breaking logic changes
- [ ] Modify `server/src/routes/orchestrate.ts`:
  - Call orchestrator after parser
  - Return `workflowState` and `nextAction` in response
- [ ] Modify `server/src/routes/index.ts` (or app.ts):
  - Register orchestrator singleton at module load (no changes to routing)
- [ ] Run `npm run lint`, `npm test` — all existing tests still pass

### Phase E: Verification

- [ ] Integration test: `/api/chat/orchestrate` full flow
- [ ] Integration test: `/api/chat/send` with workflowContext
- [ ] Backward compat test: `/api/chat/send` without workflowContext (identical to v1.4)
- [ ] E2E: Multi-turn workflow via UI
- [ ] Run full test suite: `npm test` passes 100%

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Integration Points | HIGH | All existing components (normalizer, stores, routes) remain untouched; new components integrate via clear interfaces (parser output → orchestrator input). |
| Data Flow | HIGH | End-to-end trace (request → normalizer → parser → orchestrator → store) is linear and testable at each boundary. |
| Build Order | HIGH | Dependencies are explicit and acyclic; schemas first, then parser, then orchestrator, then routes. |
| Backward Compatibility | HIGH | Zod schema defaults, optional response fields, and passthrough logic ensure v1.4 behavior preserved exactly. |
| Route Changes | MEDIUM | Changes are additions (new fields, optional service calls), not replacements; risk is low but requires careful integration testing. |
| Parser Strategy Correctness | MEDIUM | Multi-strategy parsing (exact, partial, fallback) is sound, but confidence scoring rules are heuristic and may need tuning based on real Copilot output patterns. |
| Orchestrator State Machine | MEDIUM | Decision tree (continue/collect_more/error/complete) is deterministic, but rule-based next-action determination may require domain-specific refinement per workflow. |

---

## Gaps & Follow-Up Research

### For Phase Implementation

1. **CopilotStructuredOutputSchema Design**
   - What does the expected Copilot response schema look like? (Form: `{ "field1": string, "field2": number }` or domain-specific?)
   - Should schema be per-conversation or per-step?
   - How to handle schema evolution (backward compat for schema changes)?

2. **Parser Confidence Thresholds**
   - When is 'medium' confidence acceptable vs. requiring manual review?
   - When to reject and fallback vs. accept partial extraction?
   - Any domain-specific rules for Copilot's typical output patterns?

3. **Orchestrator Rule Engine**
   - How to express `determineNextAction` rules declaratively? (Rule object, DSL, hardcoded?).
   - What conditions trigger 'error' state vs. 'complete'?
   - Should orchestrator support branching workflows (not just linear steps)?

4. **State Persistence Edge Cases**
   - How to handle state if Redis goes down mid-workflow? (Fallback to in-memory?)
   - Should old states be cleaned up (TTL on workflowStateStore)?
   - How to handle concurrent requests for same conversationId?

5. **Client Integration**
   - How does client know to show "more data needed" vs. "step complete" vs. "error"?
   - Should `nextAction` be part of response or determined client-side from messages?
   - How to handle user going "backwards" in a workflow?

### For Future Milestones

- **SSE Streaming:** Return parsed chunks as they arrive (not wait for full response).
- **Workflow Templates:** Pre-defined workflows with schema definitions + rule engines.
- **Audit Trail:** Log all state mutations for compliance/debugging.
- **Retry & Recovery:** If parsing fails, should we retry with Copilot or offer manual fallback?

---

## Summary

The Workflow Orchestrator and Structured Output Parser slot cleanly into the existing architecture:

1. **New parser** extracts and validates structured JSON from normalizer output.
2. **New orchestrator** uses parser output to manage workflow state and determine next actions.
3. **Context builder** enriches queries with workflow state (extracted from current implementation).
4. **Routes change minimally**: add state loading, call parser+orchestrator, return state in response.
5. **Stores are called unchanged**: orchestrator updates state separately, backward-compatible schema additions.
6. **Backward compatibility is automatic**: clients not using workflows get v1.4 behavior exactly.

**Build order:** Schemas → Parser → Orchestrator → Routes. Each phase is testable in isolation; integration tests verify the full flow.

---

## Sources & References

- **PROJECT.md** — v1.4 current state, tech stack, existing decisions
- **CLAUDE.md** — Monorepo architecture, data flow, key design decisions
- **Existing Code:**
  - `server/src/routes/chat.ts` — current route implementations
  - `server/src/normalizer/activityNormalizer.ts` — extraction logic
  - `shared/src/schemas/*` — Zod schema patterns
  - `server/src/store/ConversationStore.ts` — persistence interface
