# Phase 18: Phase 16 Verification + Requirement Closure - Research

**Researched:** 2026-02-22
**Domain:** Verification and requirement documentation (process-level closure)
**Confidence:** HIGH

## Summary

Phase 18 is a **process-level closure phase**, not a coding phase. Phase 16 (Workflow Orchestrator Engine) was fully implemented, tested, and integrated into Phase 17, but the verification step was never performed. The v1.5 milestone audit discovered this gap: Phase 16 has no VERIFICATION.md, and the seven ORCH requirements (ORCH-01 through ORCH-07) remain unchecked in REQUIREMENTS.md despite code completion.

This phase exists to:
1. **Run verification** against Phase 16 artifacts (code, tests, integration) and produce the missing VERIFICATION.md
2. **Update traceability** by checking the seven ORCH requirement boxes and marking them Complete
3. **Close the milestone audit** by converting 7 partial requirements to satisfied

**Primary recommendation:** Treat this as a verification audit (not new feature development). Follow the gsd-verifier pattern established by Phase 15 and 17 VERIFICATION.md documents. Confirm the 7 ORCH requirements are satisfied by examining code + tests + multi-turn integration evidence.

## Phase Requirements (7 Orchestration Requirements)

| ID | Description | Plan(s) Completed By | Status |
|----|-------------|-------------------|--------|
| ORCH-01 | WorkflowOrchestrator can start a new workflow session tied to userId and tenantId | 16-03 | Requires verification |
| ORCH-02 | WorkflowOrchestrator processes user text input through the full loop | 16-03 | Requires verification |
| ORCH-03 | WorkflowOrchestrator processes card action submissions | 16-03 | Requires verification |
| ORCH-04 | WorkflowResponse includes messages and workflowState | 16-02 | Requires verification |
| ORCH-05 | Workflow state persists in Redis with 24h sliding TTL | 16-01 | Requires verification |
| ORCH-06 | Subsequent turns include previously collected data in Copilot query | 16-03 | Requires verification |
| ORCH-07 | Orchestrator processes requests sequentially per conversation (per-conversation locking) | 16-01 | Requires verification |

## What Was Delivered in Phase 16

### Plan 16-01: RedisWorkflowStateStore + ConversationLock
- `server/src/store/RedisWorkflowStateStore.ts` — Redis-backed state persistence with 24h sliding TTL
- `server/src/lock/ConversationLock.ts` — Per-conversation distributed lock via Redis SET NX PX + Lua release
- `server/src/store/factory.ts` — Factory pattern selecting Redis or InMemory based on REDIS_URL
- 16 new tests covering store operations and lock semantics
- **Requirements satisfied:** ORCH-05 (Redis persistence), ORCH-07 (per-conversation locking)

### Plan 16-02: Orchestrator Types + Workflow Definitions
- `shared/src/schemas/workflowState.ts` — Extended WorkflowState schema with status, currentPhase, userId, tenantId
- `server/src/orchestrator/types.ts` — WorkflowResponse, ProcessTurnParams, ProcessCardActionParams
- `server/src/workflow/workflowDefinition.ts` — WorkflowDefinition type with 5-step default workflow + getStepProgress helper
- **Requirement satisfied:** ORCH-04 (WorkflowResponse with workflowState)

### Plan 16-03: WorkflowOrchestrator Service Class
- `server/src/orchestrator/WorkflowOrchestrator.ts` — Service class with:
  - `startSession(conversationId, userId, tenantId)` — creates initial WorkflowState in Redis
  - `processTurn(conversationId, text, userId, tenantId)` — full per-turn loop with context enrichment and data accumulation
  - `processCardAction(conversationId, cardAction, userId, tenantId)` — card submission handling
  - Lock-protected read-modify-write with rollback-on-failure semantics
  - ACTION_TO_STEP mapping for workflow progression
  - Context enrichment via buildContextualQuery (injects accumulated data into Copilot queries)
  - Data accumulation: structured output data merged into collectedData across turns
- `server/src/orchestrator/index.ts` — Orchestrator singleton pre-wired for Phase 17 routes
- 10 unit tests covering all methods with mocked dependencies
- **Requirements satisfied:** ORCH-01 (start session), ORCH-02 (full per-turn loop), ORCH-03 (card actions), ORCH-06 (context accumulation)

### Integration Test Evidence (Phase 17 Plan 03)
- `server/src/orchestrator/WorkflowOrchestrator.integration.test.ts` — Multi-turn integration test demonstrating:
  - 3-turn conversation with data accumulation
  - Context preambles containing prior turns' collected data
  - Passthrough mode (unstructured Copilot responses)
  - Parse error handling
  - All requirement categories covered (structured, passthrough, parse_error)

### Test Coverage
- Phase 16 unit tests: 16 tests (7 store + 9 lock)
- Phase 16 unit tests: 10 tests (orchestrator)
- Phase 17 integration tests: 5 tests (covering orchestrator end-to-end)
- **Total Phase 16 tests:** 26 new tests + 142 existing tests = 168 passing

### Code Quality
- All Phase 16-17 code compiles with **zero TypeScript errors**
- 147 tests passing (Phase 17 final count) across all phases
- No regressions in pre-existing functionality
- Per-conversation locking prevents race conditions
- Redis persistence survives server restarts
- Backward compatibility: optional workflowState fields allow v1.4 clients to continue working

## Standard Verification Pattern (from Phase 15 & 17)

Both completed phases (Phase 15 and Phase 17) produced VERIFICATION.md documents following this structure:

1. **Phase Goal** — restate what the phase was supposed to achieve
2. **Success Criteria Verification** — 1-2 paragraph per requirement, with evidence
3. **Requirement Coverage** — table mapping each requirement to status
4. **Test Results** — test suite output and counts
5. **Must-haves Verification** — from the plans, check each item
6. **Code Quality Checklist** — TypeScript compilation, no regressions, expected artifacts present
7. **Summary** — achievement statement

## Key Verification Questions for Phase 16

### ORCH-01: WorkflowOrchestrator can start a new workflow session tied to userId and tenantId

**Evidence to confirm:**
- startSession method exists in WorkflowOrchestrator.ts
- Takes conversationId, userId, tenantId as parameters
- Creates initial WorkflowState in Redis store with these fields
- Returns { conversationId, workflowState }
- Test: "startSession creates new workflow state with userId and tenantId"

### ORCH-02: WorkflowOrchestrator processes user text input through the full loop

**Evidence to confirm:**
- processTurn method exists
- Full loop: acquire lock → load state → buildContextualQuery → Copilot call → normalizeActivities → parseTurn → merge data → save state → unlock
- Context enrichment happens (prior data injected into query)
- Data accumulation happens (structured output data merged into collectedData)
- Rollback-on-failure: if any step fails, state not saved
- Integration test: 3-turn test shows each turn processes through full loop

### ORCH-03: WorkflowOrchestrator processes card action submissions

**Evidence to confirm:**
- processCardAction method exists
- Takes conversationId, cardAction parameters
- Submits card action to Copilot (submitData in activity.value)
- Returns messages and updated workflowState
- No context enrichment on card actions (self-contained)

### ORCH-04: WorkflowResponse includes messages and workflowState

**Evidence to confirm:**
- WorkflowResponse type defined in server/src/orchestrator/types.ts
- Contains messages: NormalizedMessage[]
- Contains workflowState: WorkflowState
- Also contains parsedTurn, progress, turnMeta, latencyMs
- Shared API response schemas extended with optional workflowState (Phase 17)

### ORCH-05: Workflow state persists in Redis store with 24h sliding TTL

**Evidence to confirm:**
- RedisWorkflowStateStore.ts exists
- Stores workflow state in Redis with key `wf:{conversationId}`
- TTL is 24 hours (86400 seconds)
- TTL resets on every write (sliding window — EX option resets on SET)
- Tests verify: save, load, update, delete operations
- Falls back to InMemoryWorkflowStateStore if REDIS_URL not set

### ORCH-06: Subsequent turns include previously collected data in Copilot query

**Evidence to confirm:**
- buildContextualQuery prepends context preamble to user query
- Preamble includes Collected data: section with collectedData from prior turns
- Integration test (3-turn) shows:
  - Turn 1: user provides name, Copilot extracts to data.name
  - Turn 2: preamble includes "Collected data: {name: 'X'}"
  - Turn 3: preamble includes "Collected data: {name: 'X', age: 'Y'}"
- Proves data accumulation and context injection work across turns

### ORCH-07: Orchestrator processes requests sequentially per conversation (per-conversation locking)

**Evidence to confirm:**
- ConversationLock interface exists with acquire/release methods
- Redis implementation uses SET NX PX with Lua script for safe release
- Lock key: `lock:{conversationId}`
- 10-second TTL (2x conservative Copilot P99 latency)
- processTurn acquires lock at start, releases in finally block
- Race condition prevention: multiple requests to same conversation wait for lock
- Tests verify: successful acquire/release, timeout handling, TTL expiration

## Verification Approach

Phase 18 has two plans:

### Plan 18-01: Run Phase 16 Verification (produce VERIFICATION.md)

**Input:** Phase 16 code artifacts, tests, summaries
**Process:**
1. Read Phase 16 code (store, lock, orchestrator, types)
2. Read Phase 16 tests and verify test results
3. Read Phase 17 integration tests (provide end-to-end confirmation)
4. Check each ORCH requirement against code + tests
5. Compile findings in VERIFICATION.md following Phase 15/17 pattern

**Output:** `.planning/phases/16-workflow-orchestrator-engine/16-VERIFICATION.md`

**Success Criteria:**
- All 7 ORCH requirements have "PASSED" status
- Test results documented (26+ Phase 16 tests, 5 integration tests)
- Code quality checklist confirms no TypeScript errors
- Must-haves from all three 16-* plans verified
- No blocker anti-patterns found

### Plan 18-02: Update REQUIREMENTS.md Traceability

**Input:** VERIFICATION.md confirmation
**Process:**
1. After 18-01 passes, update REQUIREMENTS.md
2. Change ORCH-01 through ORCH-07 from `[ ]` to `[x]`
3. Change Status from "Pending" to "Complete"
4. Update traceability table (Phase column stays "Phase 16 → 18", status changes to "Complete")

**Output:** Updated `.planning/REQUIREMENTS.md`

**Success Criteria:**
- All 7 ORCH checkboxes checked
- v1.5 requirement summary shows 25/25 Complete
- Re-audit of v1.5 milestone shows all requirements satisfied

## Architecture Context for Verification

### Data Flow Confirmed by Phase 17
```
User input (POST /api/chat/send)
  → Route delegates to orchestrator.processTurn()
    → Acquire per-conversation lock
      → Load WorkflowState from Redis
        → buildContextualQuery injects prior collectedData into preamble
          → Copilot call with enriched query
            → normalizeActivities() converts raw Activities to NormalizedMessage[]
              → parseTurn() extracts structured output (if present)
                → Merge extracted data into collectedData
                  → Save updated WorkflowState to Redis (only on success)
                    → Release lock
                      → Return { conversationId, messages, workflowState }
```

All links confirmed by Phase 17 route integration tests and integration test (TEST-03).

### Requirements Dependency Chain
```
ORCH-05 (Redis persistence) ← enabled by RedisWorkflowStateStore (16-01)
ORCH-07 (locking) ← enabled by ConversationLock (16-01)
ORCH-04 (WorkflowResponse type) ← defined by Plan 16-02
ORCH-01 (startSession) ← implemented by Plan 16-03
ORCH-02 (full loop) ← implemented by Plan 16-03
ORCH-03 (card actions) ← implemented by Plan 16-03
ORCH-06 (context accumulation) ← enabled by buildContextualQuery in Plan 16-03
```

All dependencies satisfied by delivered code.

## Don't Hand-Roll

This is a verification phase, not a development phase. Do NOT:
- Rewrite Phase 16 code
- Add new tests to Phase 16
- Modify orchestrator behavior
- Create new store/lock implementations

DO verify and document what already exists.

## Common Pitfalls in Verification

### Pitfall 1: Confusing "Plan Complete" with "Requirement Satisfied"
**What goes wrong:** Treating SUMMARY frontmatter completion as proof of requirement satisfaction
**Why it happens:** Plans claim completion, but code-level verification is missing
**How to avoid:** Always verify code + tests + integration, not just plan status
**In this context:** Phase 16 SUMMARY files claim all requirements complete, but VERIFICATION.md is the formal confirmation

### Pitfall 2: Missing Integration Test Context
**What goes wrong:** Testing requirements in isolation without end-to-end confirmation
**Why it happens:** Unit tests can pass while integration fails
**How to avoid:** Always cross-reference with multi-turn integration test (Phase 17 TEST-03)
**In this context:** 3-turn integration test proves ORCH-02 and ORCH-06 work together

### Pitfall 3: Overlooking Backward Compatibility
**What goes wrong:** Adding breaking changes to shared schemas, forgetting optional fields
**Why it happens:** Thinking only about Phase 16 requirements, not broader milestone constraints
**How to avoid:** Verify all new fields in WorkflowState are optional or have defaults
**In this context:** Phase 16 extended WorkflowState with optional fields — backward compat confirmed

### Pitfall 4: Forgetting Lock Semantics
**What goes wrong:** Assuming SET NX PX works without understanding TTL reset behavior
**Why it happens:** Distributed locking is subtle — hard to reason about without deep read
**How to avoid:** Trace through lock acquire/release logic, read Lua script release
**In this context:** 10s lock TTL prevents deadlock, Lua script prevents orphaned locks

## Code Examples

The verification will reference code from Phase 16:

### Example 1: RedisWorkflowStateStore (ORCH-05)
```typescript
// server/src/store/RedisWorkflowStateStore.ts
class RedisWorkflowStateStore implements IWorkflowStateStore {
  async save(conversationId: string, state: WorkflowState): Promise<void> {
    const key = `wf:${conversationId}`;
    // SET with EX (24h sliding TTL) — TTL resets on every write
    await this.redis.set(key, JSON.stringify(state), 'EX', 86400);
  }

  async load(conversationId: string): Promise<WorkflowState | null> {
    const key = `wf:${conversationId}`;
    const json = await this.redis.get(key);
    return json ? JSON.parse(json) : null;
  }
}
```

### Example 2: ConversationLock (ORCH-07)
```typescript
// server/src/lock/ConversationLock.ts
class RedisConversationLock implements ConversationLock {
  async acquire(conversationId: string, ttlMs: number = 10000): Promise<string> {
    const token = randomUUID();
    // SET NX PX — atomic: only succeeds if key doesn't exist
    const result = await this.redis.set(
      `lock:${conversationId}`,
      token,
      'PX', ttlMs,
      'NX'
    );
    if (!result) throw new LockAcquisitionError();
    return token;
  }

  async release(conversationId: string, token: string): Promise<void> {
    // Lua script: only deletes if token matches (safe release)
    await this.redis.eval(
      `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end`,
      1,
      `lock:${conversationId}`,
      token
    );
  }
}
```

### Example 3: WorkflowOrchestrator processTurn (ORCH-02, ORCH-06)
```typescript
// server/src/orchestrator/WorkflowOrchestrator.ts
async processTurn(
  conversationId: string,
  text: string,
  userId: string,
  tenantId: string
): Promise<WorkflowResponse> {
  const token = await this.lock.acquire(conversationId);
  try {
    // Load state
    const state = await this.store.load(conversationId)
      ?? this.createInitialState(userId, tenantId);

    // Enrich query with prior context (ORCH-06)
    const enrichedQuery = await this.contextBuilder.buildContextualQuery(
      text,
      state.collectedData,
      state.turnCount,
      state.currentPhase
    );

    // Call Copilot with accumulated data
    const activities = await this.copilotClient.sendActivityStreaming(...);
    const messages = normalizeActivities(activities);

    // Parse structured output
    const parsedTurn = parseTurn(messages);

    // Merge extracted data into state
    if (parsedTurn.kind === 'structured' && parsedTurn.data) {
      state.collectedData = { ...state.collectedData, ...parsedTurn.data.data };
    }

    // Save updated state (only on success)
    await this.store.save(conversationId, state);

    return { conversationId, messages, workflowState: state };
  } finally {
    await this.lock.release(conversationId, token);
  }
}
```

## Sources

### Primary (HIGH confidence)
- **Phase 16 code:** server/src/{store,lock,orchestrator}/
- **Phase 16 tests:** server/src/{store,lock,orchestrator}/*.test.ts (26 tests)
- **Phase 17 integration test:** server/src/orchestrator/WorkflowOrchestrator.integration.test.ts (5 tests)
- **Phase 15 & 17 VERIFICATION.md:** Established verification pattern to follow

### Secondary (MEDIUM confidence)
- **Milestone audit:** v1.5-MILESTONE-AUDIT.md identifies gap and confirms integration checker passed
- **REQUIREMENTS.md:** Maps requirements to phases and status

### Verification Artifacts (will be created)
- `.planning/phases/16-workflow-orchestrator-engine/16-VERIFICATION.md` (output of 18-01)

## Metadata

**Confidence breakdown:**
- **Requirement mapping:** HIGH — all 7 ORCH requirements clearly traced to Phase 16 plans
- **Code quality:** HIGH — Phase 17 integration tests confirmed all wiring works end-to-end
- **Verification template:** HIGH — Phase 15 and 17 provide clear pattern to follow
- **Test coverage:** HIGH — 26 Phase 16 + 5 Phase 17 integration tests documented
- **Risk of failure:** LOW — all code already written and tested; verification is confirmation, not development

**Research date:** 2026-02-22
**Valid until:** 2026-03-01 (process-level research, stable domain)

## What Might I Have Missed?

1. **Redis key namespace conflicts** — If real production uses `wf:` prefix differently, verification should check namespace safety. (Check: phase doc says used `wf:` vs `conv:` distinction intentional)

2. **Lock timeout edge cases** — 10s default TTL may be too short or too long depending on real Copilot latency. Verification should confirm this was measured. (Check: phase doc says "2x conservative Copilot P99 latency estimate")

3. **Data structure compatibility** — collectedData merged on each turn; if nested data structures exist, merge logic needs careful checking. (Check: phase 16-03 plan confirms extracting from `parsedTurn.data.data`, shallow merge via spread operator)

4. **Backward compatibility with v1.4 clients** — Verification should confirm optional workflowState fields allow old clients to work. (Check: Phase 17 VERIFICATION confirms this, schema extensions all `.optional()`)

5. **Test isolation** — Multi-turn integration test uses real Map-backed mock stores; ensure isolation doesn't affect other tests. (Check: Phase 17 notes "mock stores use real Maps — genuine state persistence in multi-turn tests")

---

## Next: Planning Phase 18

Once this research is complete, planner will create two PLAN.md files:

1. **18-01-PLAN.md** — Tasks to produce Phase 16 VERIFICATION.md (1-2 tasks, ~10 min)
2. **18-02-PLAN.md** — Task to update REQUIREMENTS.md checkboxes (1 task, ~5 min)

**Estimated total:** 15 min execution time, verification-level effort only.
