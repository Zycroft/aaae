# Features — Workflow Orchestrator & Structured Output Parser (v1.5)

**Project:** Agentic Copilot Chat App
**Milestone:** v1.5 Workflow Orchestrator + Structured Output Parsing
**Researched:** 2026-02-21

---

## Table Stakes

Features required for orchestration to feel complete. Missing = broken workflow loops.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Multi-turn state tracking** | Workflows span 3+ Copilot turns; must remember what was collected | Medium | WorkflowState in Redis; survives server restart |
| **Step-based flow control** | User should move forward/backward through defined steps | Medium | XState machine with state nodes; guards on transitions |
| **Data accumulation across turns** | Workflow collects data from multiple user inputs; must persist | Low | collectedData map in WorkflowState |
| **Structured output extraction** | Copilot response contains JSON/form data; must parse reliably | Low | ExtractedPayload with 3-surface priority already in v1.4 |
| **Atomic state updates** | Multiple workers shouldn't corrupt conversation state | Medium | redlock-universal prevents race conditions |
| **Context enrichment on queries** | Server injects workflow context (constraints, collected data) into Copilot prompts | Low | buildContextPrefix() already in v1.4; machine uses it |
| **Idempotent requests** | Duplicate orchestrate calls return same response (no duplicate Copilot calls) | Low | Redis cache + x-idempotency-key header |
| **Workflow state history** | Audit trail of state transitions for debugging | High | Deferred to Phase 17 (not blocking v1.5) |

---

## Differentiators

Features setting this apart from naive stateless chat. Not expected by users but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Visual state machine representation** | Operators understand flow; easier to debug, extend, test | Low | XState has @stately/studio integration (future) |
| **Conditional branching based on extraction** | If Copilot extracts payment_method='credit_card', ask different follow-up | Medium | XState guards + extracted signal events |
| **Timeout-based fallback transitions** | If Copilot doesn't respond with required data after 3 turns, prompt user directly | Medium | XState delayed transitions + turnCount tracking |
| **Rollback on extraction failure** | If extracted data is invalid, revert to previous step | Medium | XState history state nodes + validation re-check |
| **Parallel data collection** | Ask for email AND phone simultaneously, proceed when both present | High | Deferred to Phase 17 (not blocking v1.5) |
| **Machine version migration** | Update workflow logic without losing in-flight conversations | High | Deferred to Phase 18 (schema versioning needed) |

---

## Anti-Features

Explicitly NOT building for v1.5.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Human-in-the-loop approvals** | Adds async escalation logic; complicates timeout handling | Defer to Phase 17 (requires queue + notification infrastructure) |
| **Browser-side state machine** | Violates security model (secrets could leak to client) | Keep server-side only; send state summaries to client |
| **Real-time multi-user workflows** | Requires WebSocket + distributed state locking beyond Redlock | Single-user sessions for v1; multi-user deferred to v2 |
| **Automatic workflow retry** | Might cause duplicate Copilot calls if Redlock lock expires | Idempotency keys + manual retry for now |
| **Machine persistence to database** | Adds migration complexity; in-memory machines sufficient for 24h TTL | Store serializable state in Redis; machine is ephemeral |

---

## Feature Dependencies

```
Multi-turn state tracking
  ↓ (requires)
Atomic state updates (redlock-universal)
  ↓ (requires)
Structured output extraction (ExtractedPayload already in v1.4)

Step-based flow control
  ↓ (requires)
XState machine definition
  ↓ (requires)
Multi-turn state tracking

Idempotent requests
  ↓ (requires)
Idempotency cache (Redis)
  ↓ (optional) improves
Multi-turn state tracking (avoid duplicate state updates)

Workflow state history
  ↓ (depends on)
All of the above
  ↓ (can wait until)
Phase 17 (audit logging)
```

---

## MVP Feature Set (Phase 15: Workflow Orchestration)

### Core Features (Go/No-Go for v1.5)

1. **Multi-turn state tracking** ✓ SHIP
   - WorkflowState in Redis: step, collectedData, lastRecommendation, turnCount
   - Survives across server restarts (24h TTL)
   - Test: Send 5 orchestrate calls, verify state accumulates

2. **Step-based flow control** ✓ SHIP
   - XState machine with 3+ state nodes (gathering, confirming, success, error)
   - Transitions triggered by extracted signals (PAYMENT_EXTRACTED, USER_DECLINED, CONFIRM)
   - Test: Machine diagram visually correct, state transitions deterministic

3. **Data accumulation** ✓ SHIP
   - collectedData map merges new extracted data on each turn
   - Persists in WorkflowState
   - Test: 3-turn workflow collects email, phone, address; all present in final state

4. **Structured output extraction** ✓ SHIP (already in v1.4, reuse)
   - ExtractedPayload with 3-surface priority
   - Zod validation on each message
   - Test: Extract JSON from activity.value, activity.entities, text (all three sources)

5. **Atomic state updates** ✓ SHIP
   - redlock-universal lock before reading/updating per-conversation state
   - 5s TTL (exceeds max Copilot roundtrip)
   - Test: 10 concurrent orchestrate calls to same conversation; final state is consistent

6. **Context enrichment** ✓ SHIP (already in v1.4, reuse)
   - buildContextPrefix() injects step, constraints, collectedData into Copilot prompt
   - [WORKFLOW_CONTEXT] delimited format
   - Test: Context visible in Copilot response (agent acknowledges collected data)

7. **Idempotent requests** ✓ SHIP
   - x-idempotency-key header on orchestrate endpoint
   - Redis cache: idempotency:{userId}:{key} → response (TTL 3600s)
   - Zod re-validation on cache hit (safety)
   - Test: Send same request twice, verify same response, single Copilot call

### Nice-to-Have (Defer to Phase 16+)

- [ ] Workflow state history (audit trail)
- [ ] Visual machine representation in admin UI
- [ ] Timeout-based fallback transitions
- [ ] Parallel data collection
- [ ] Machine versioning for schema evolution

---

## Feature Scope Notes

### What Copilot Provides (Out of Scope)

Copilot Studio handles:
- Natural language understanding of user input
- Response generation
- Session token management
- Activity streaming

We don't build these; we orchestrate around them.

### What We Add in v1.5

- Deterministic workflow structure (via XState)
- State accumulation (via Redis + WorkflowState)
- Atomic updates (via redlock-universal)
- Extraction routing (via Zod + ExtractedPayload)
- Idempotency (via Redis cache)

### Not in Scope (Future Milestones)

- Streaming responses (v2, PERF-01)
- Human escalation workflows (v2, requires queue infrastructure)
- Multi-user collaborative workflows (v2)
- Machine versioning / migration (v2+)

---

## User Workflows (Examples)

### Example 1: Payment Collection Flow

**Setup:**
- Workflow machine with states: gathering_payment → confirming → success → cancelled

**Flow:**
1. User: "I want to upgrade to premium"
2. Copilot (with context): "I see you want premium. What payment method? (credit/debit/ACH)"
   - Orchestrator injects: step=gathering_payment, constraints=["payment_method"]
3. User: "Credit card, number 4111111111111111, exp 12/26"
4. Copilot response includes: `{ "payment_method": "credit_card", "last_4": "1111", "exp": "12/26" }`
5. Orchestrator: Extracts payload, transitions machine: gathering_payment → confirming
   - collectedData = { payment_method: "credit_card", last_4: "1111", exp: "12/26" }
6. Copilot (with context): "Confirm $9.99/mo with ending in 1111? (yes/no)"
7. User: "Yes"
8. Copilot response includes: `{ "confirmed": true }`
9. Orchestrator: Transitions machine: confirming → success
10. Response to client: workflowState = { step: "success", collectedData: {...}, turnCount: 3 }

**What v1.5 enables:**
- State doesn't get lost if server restarts
- Multiple concurrent payment workflows don't interfere (Redlock)
- If user refreshes and retries, same idempotency key returns same response
- Workflow logic is testable (XState machine unit tests)

### Example 2: Onboarding Flow

**Setup:**
- Machine with states: gathering_email → gathering_company → gathering_role → success

**Flow:**
1. User: "Let's set up my account"
2. Orchestrator: Sends orchestrate with step=gathering_email
3. ... (3-turn loop: extract email → move to next step)
4. ... (3-turn loop: extract company)
5. ... (3-turn loop: extract role)
6. Final state: step=success, collectedData={email, company, role}, turnCount=9

**What v1.5 enables:**
- Client can display progress: "Step 2 of 3" by reading workflowState.step
- Each step is isolated (no cross-talk in Copilot prompt)
- Rollback possible if validation fails (future: XState history states)

---

## API Enhancements (v1.5)

### Orchestrate Endpoint Request (unchanged)

```json
POST /api/chat/orchestrate
{
  "query": "I want to upgrade",
  "workflowContext": {
    "step": "gathering_payment",
    "constraints": ["payment_method"],
    "collectedData": {}
  }
}
```

### Orchestrate Endpoint Response (NEW: workflowState)

```json
{
  "conversationId": "uuid",
  "messages": [...],
  "extractedPayload": {
    "source": "value",
    "confidence": "high",
    "data": { "payment_method": "credit_card", ... }
  },
  "latencyMs": 1950,
  "workflowState": {
    "step": "confirming",
    "collectedData": { "payment_method": "credit_card", ... },
    "lastRecommendation": "...",
    "turnCount": 2
  }
}
```

### Chat Endpoint Evolution (Phase 16+)

Current /api/chat/send returns messages. Future: also return workflowState (when machine is active).

---

## Testing Strategy

| Scenario | Test Type | Where |
|----------|-----------|-------|
| Machine state transitions | Unit | `server/src/orchestrator/workflows/*.test.ts` |
| Data accumulation over 5 turns | Integration | `server/src/routes/orchestrate.test.ts` |
| Race condition with 10 concurrent updates | Integration (mock Redis) | `server/src/store/locks/*.test.ts` |
| Idempotent duplicate request | Integration | `server/src/routes/orchestrate.test.ts` |
| Context injection visible in Copilot prompt | Live (Copilot SDK validation) | Manual UAT or CI (if credentials available) |
| State survives Redis disconnect | Integration (ioredis-mock flushall) | `server/src/routes/orchestrate.test.ts` |

---

## Acceptance Criteria (Definition of Done)

1. XState machine defined for at least one workflow type (e.g., payment flow)
2. 5 orchestrate calls in sequence accumulate state correctly
3. redlock prevents race conditions (concurrent update test passes)
4. Idempotency: duplicate request returns cached response
5. Context injection works (Copilot acknowledges collected data)
6. All 3 extraction surfaces validated (value, entities, text)
7. Unit tests pass; integration tests with ioredis-mock pass
8. No breaking changes to existing API contracts
9. TypeScript strict mode satisfied; no console.error in tests

---

## Sources

- [Workflow Orchestration Patterns (2026)](https://oneuptime.com/blog/post/2026-01-30-microservices-orchestration-pattern/view)
- [XState State Nodes and Transitions](https://stately.ai/docs/states)
- [Distributed Locking Best Practices](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)
- [Idempotency Patterns RFC](https://httptoolkit.com/blog/idempotency-keys/)

---

*Last updated: 2026-02-21 — v1.5 Workflow Orchestrator Research*
