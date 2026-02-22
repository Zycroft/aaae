# Domain Pitfalls — Workflow Orchestrator & Structured Output Parser (v1.5)

**Project:** Agentic Copilot Chat App
**Milestone:** v1.5 Workflow Orchestrator + Structured Output Parsing
**Researched:** 2026-02-21
**Scope:** Common mistakes when building multi-turn workflows with state machines and distributed locking

---

## Critical Pitfalls

These cause rewrites or production outages if not caught early.

### Pitfall 1: Race Condition in Multi-Worker Deployments

**What goes wrong:**
Two workers process the same conversation simultaneously. Worker A reads old state, Worker B reads old state, both update independently. Final state has data from only one worker; other worker's updates lost.

**Example:**
```
Time 1: Worker A reads WorkflowState { collectedData: { email: 'a@ex.com' } }
Time 2: Worker B reads WorkflowState { collectedData: { email: 'a@ex.com' } }
Time 3: Worker A updates to { collectedData: { email: 'a@ex.com', phone: '123-4567' } }
Time 4: Worker B updates to { collectedData: { email: 'a@ex.com', company: 'ACME' } }
Result: Final state is only { email, company }; phone lost
```

**Why it happens:**
- Orchestrate endpoint does: read → modify → write without locking
- Local testing with single worker masks the issue
- Bug appears only under load (hard to debug)

**Prevention:**
- Always wrap read-modify-write in Redlock: `await withConversationLock(conversationId, async () => { ... })`
- Test with concurrent requests to same conversation (async/await.all)
- Use ioredis-mock for unit tests; include race condition scenarios

**Detection:**
- Unit test fails: 10 concurrent updates, final collectedData missing some fields
- Production alert: Redis memory grows but conversation count doesn't (orphaned keys)
- Debug: Logs show different worker IDs updating same conversation

---

### Pitfall 2: Lock Timeout Not Exceeding Copilot Latency

**What goes wrong:**
Lock TTL is 2 seconds, but Copilot roundtrip takes 3 seconds. Lock expires mid-operation. Another worker acquires lock and reads partially-updated state.

**Example:**
```
Time 0: Worker A acquires lock: lock:conversation:xyz (TTL 2s)
Time 1: Worker A sends to Copilot
Time 2: Lock expires (Redis auto-releases)
Time 2.5: Worker B acquires lock (mistake!)
Time 3: Worker A's Copilot response arrives, Worker A tries to write (lock conflict)
```

**Why it happens:**
- Estimated Copilot latency wrong (~500ms estimated, actual ~2000ms under load)
- Lock TTL set to match happy-path case, not worst-case
- No monitoring of actual Copilot latency before deployment

**Prevention:**
- Measure actual Copilot latency: `performance.now()` on sendActivityStreaming
- Set lock TTL to 1.5x worst-case measured latency (e.g., 3s)
- Log lock acquisition/release with timestamps
- Alert if lock TTL exceeded (means operation is too slow)

**Detection:**
- Error logs: "Lock unlock failed" (lock already expired)
- State corruption: Machine in invalid state (from concurrent workers)
- Latency metric: orchestrate endpoint tail latency >5s occasionally

---

### Pitfall 3: Idempotency Cache Returning Stale WorkflowState

**What goes wrong:**
User calls orchestrate twice with same idempotency key. First call: state advances from 'gathering' → 'confirming'. Second call: idempotency cache returns old response with state='gathering'. Client rolls back UI.

**Example:**
```
Call 1: { query: "credit card 4111..." }
  → Copilot response: { extractedPayload: { payment_method: '...' }, workflowState: { step: 'confirming' } }
  → Cache: idempotency:user:key → response
  → Client: Display "Enter confirmation"

User navigates away, comes back, accidentally retries with same key:

Call 2: { query: "credit card 4111..." } (same idempotency key)
  → Cache HIT: Return cached response from Call 1
  → workflowState: { step: 'confirming' }
  → BUT server-side state is already 'success' (after Call 1 completed)
  → Client UI out of sync
```

**Why it happens:**
- Idempotency cache stores full OrchestrateResponse (including workflowState)
- Assume workflowState is always up-to-date on cache hit (wrong assumption)
- No validation that cached state matches current server state

**Prevention:**
- Idempotency cache stores ONLY response data, not state
- OR: Always fetch latest workflowState from server even on cache hit
- OR: Include state version/ETag in response; client detects mismatch
- Shorter TTL for idempotency cache: 300s (5min) instead of 3600s

**Detection:**
- Unit test: Advance state from 'gathering' → 'confirming' → 'success', replay first call's idempotency key, verify state is 'success' not 'gathering'
- Browser console: UI shows step from response but workflowState on next call is different
- Metric: Mismatch between Response.workflowState.step and latest WorkflowState.step

---

### Pitfall 4: XState Machine Not Handling Invalid Events

**What goes wrong:**
Orchestrate endpoint sends machine event that machine doesn't handle in current state. Machine silently ignores event (no error). State doesn't transition. User sees progress bar stuck.

**Example:**
```
Machine in 'gathering' state, handles: PAYMENT_EXTRACTED, USER_DECLINED, TIMEOUT
Copilot responds with unexpected: { extractedPayload: { something_else: '...' } }
Endpoint sends event: { type: 'UNKNOWN_SIGNAL' }
Machine ignores (not in state handler)
State stays 'gathering'
Client UI: Waiting for next prompt (forever)
```

**Why it happens:**
- Not all Copilot responses produce recognized events
- Machine definition incomplete (doesn't list all possible extraction types)
- Event determination logic too specific; doesn't fallback to NO_SIGNAL

**Prevention:**
- Always have fallback: if no extracted.data matches, send { type: 'NO_SIGNAL' } (machine handles silently or re-prompts)
- Explicit error state in machine: unhandled event → 'error' state
- Log all events sent to machine; alert if NO_SIGNAL sent >3x in a row
- Type-safe event union: XState v5 catches missing handlers at compile time

**Detection:**
- Unit test: Enumerate all possible Copilot response types; verify machine has event for each
- Smoke test: 20 random orchestrate calls; none should get stuck
- Logs: Filter for NO_SIGNAL events; investigate if frequent

---

### Pitfall 5: Extraction Confidence Not Validated Before Transition

**What goes wrong:**
Copilot returns extracted data with low confidence (parsed from noisy text). Machine transitions on low-confidence signal. Workflow proceeds with wrong data.

**Example:**
```
Text response: "I found your account balance is $500 in your savings. Cool!"
Text regex extraction: Finds "500" and "savings"
Extracts: { balance: '500', account: 'savings', confidence: 'low' }
Machine sends BALANCE_EXTRACTED event without checking confidence
State: 'gathering' → 'confirming'
User sees: "Confirming: Transfer $500 from savings"
User said: "What's my balance?" NOT "I want to transfer money"
Bug: Workflow proceeded on garbage extraction
```

**Why it happens:**
- ExtractedPayload includes confidence field but code doesn't check it
- Low confidence extraction treated same as high confidence
- No validation rule: "require high confidence to trigger transition"

**Prevention:**
- Guard in machine: Only trigger transition if confidence == 'high'
- Or: Re-prompt if confidence < 'high': "Did you mean $500 in savings? [yes/no]"
- Metrics: Log extraction confidence per event type; alert if >50% of extractions are low confidence

**Detection:**
- Unit test: Send low-confidence extraction, verify NO_SIGNAL sent (not transition)
- Smoke test: Check all extracted signals have confidence='high' or 'medium'
- Logs: Filter extractedPayload.confidence; count by type

---

### Pitfall 6: Lock Acquisition Failure Not Handled

**What goes wrong:**
Orchestrate endpoint fails to acquire lock (Redis down, cluster overloaded). Code doesn't handle exception. Either crashes or proceeds without lock (race condition risk).

**Example:**
```typescript
// BAD (no error handling):
const lock = await redlock.lock(`lock:conversation:${conversationId}`, 5000);
// If Redis down or quorum lost:
// - lock = undefined (if error silently caught somewhere)
// - State update proceeds without lock
// - Race condition possible

// Or: exception thrown, endpoint crashes with 500 instead of 503
```

**Why it happens:**
- Assume Redis is always available
- Exception handling in redlock not tested (happy path testing)
- No fallback strategy when lock unavailable

**Prevention:**
- Wrap lock acquisition in try-catch; catch RedlockError or timeout
- Return 503 (Service Unavailable) if lock fails
- Log lock failures; alert if >1% of requests fail to acquire lock
- Test: Simulate Redis cluster quorum loss; verify 503 response

**Detection:**
- Unit test: Mock redlock to throw LockError; verify 503 response
- Integration test: Kill Redis connection mid-orchestrate; check lock acquisition fails
- Metric: Count lock timeouts; alert if >5% of requests

---

## Moderate Pitfalls

Bugs that cause incorrect behavior but rarely cause outages.

### Pitfall 7: Machine Context Not Initialized from Existing State

**What goes wrong:**
New conversation loads WorkflowState from Redis. Machine created with default context (ignores loaded state). Collecteddata resets.

**Example:**
```typescript
// BAD:
const machine = createMachine({ /* ... */ context: { step: 'gathering', collectedData: {} } });
const actor = interpret(machine).start(); // Context reset to defaults!

// GOOD:
const existingState = await workflowStateStore.get(conversationId) || { /* defaults */ };
const actor = interpret(machine.provide({ context: existingState })).start();
```

**Why it happens:**
- Forgot to load existing state before creating actor
- Or: Loaded state but machine definition has hardcoded defaults that override it

**Prevention:**
- Always load WorkflowState before creating machine actor
- Use `.provide({ context: loadedState })` to inject loaded state
- Unit test: Create machine with loaded state; verify actor.getSnapshot().context matches loaded state

**Detection:**
- Unit test fails: Load state with collectedData, create machine, verify data present
- Smoke test: Send 3 orchestrate calls; verify collectedData grows
- Manual test: Restart server, verify conversation state intact

---

### Pitfall 8: Idempotency Key Not Scoped by User

**What goes wrong:**
Idempotency key stored globally without user scope. User A's request cached, User B with same key gets User A's cached response (data leak).

**Example:**
```typescript
// BAD:
const cacheKey = `idempotency:${idempotencyKey}`; // No userId!

// User A (oid=123) with key=abc:
await redis.set('idempotency:abc', response_A);

// User B (oid=456) with key=abc:
const cached = await redis.get('idempotency:abc');
// Returns response_A!!! Data leak
```

**Why it happens:**
- Assumed idempotency key is globally unique (not necessarily)
- Client can control idempotency key header; can spoof others' keys
- Cross-user data leak possible

**Prevention:**
- Always scope by userId: `idempotency:${userId}:${idempotencyKey}`
- Or: Use UUID-based idempotency key (client can't choose)
- Test: 2 users with same idempotency key; verify isolated responses

**Detection:**
- Unit test: 2 users submit with same idempotency key; verify different cached responses
- Security test: Manual attempt to spoof another user's idempotency key
- Metric: Correlation between identical idempotency keys and user count (should be 1:1)

---

### Pitfall 9: Context Injection String Format Breaks Copilot Parsing

**What goes wrong:**
Server injects workflow context as string prefix to Copilot query. Format is slightly off. Copilot agent can't parse it. Context is ignored. Workflow logic breaks.

**Example:**
```
Query with context (v1.4 working):
"[WORKFLOW_CONTEXT] step=gathering constraints=[payment_method,amount] collectedData={} How much?"

Query with context (v1.5 broken):
"[WORKFLOW_CONTEXT]step=gathering constraints=[payment_method,amount]collectedData={}How much?"
   ↑ missing space                                                          ↑ missing space
```

**Why it happens:**
- Format change in `buildContextPrefix()` not coordinated with Copilot agent
- Copilot agent expects specific format; typo breaks parsing
- No test: Verify context is visible in actual Copilot response

**Prevention:**
- Document context format in SDK-EVALUATION.md (or equivalent)
- Copilot agent should log context received (verify in response)
- Test: Live Copilot call; inspect response; verify agent acknowledges context
- Regex-based parsing validation: Machine processes response, verifies expected signals present

**Detection:**
- Manual test: Send orchestrate with context; inspect Copilot response; verify context acknowledged
- Metric: Extraction success rate; alert if drops (might indicate context parsing broke)
- Logs: Log injected context prefix; Copilot can log parsed context

---

### Pitfall 10: Lock TTL Not Aligned with Redis Expiry

**What goes wrong:**
Lock TTL is 5s but conversation key expires after 30s. Worker crashes mid-operation. Lock expires, another worker acquires lock, reads new conversation key (absent). Orphaned conversation state.

**Example:**
```
Time 0: Worker A acquires lock:conversation:xyz (5s TTL)
Time 1: Worker A writes conversation:xyz with 24h TTL
Time 2: Worker A crashes (process killed)
Time 2.5: Lock expires (auto-released)
Time 3: Worker B acquires lock, reads conversation:xyz (still present, not expired yet)
Time 4: Worker C acquires lock... (infinite race conditions)
```

**Why it happens:**
- Lock TTL separate from key TTL
- No documentation of relationship
- Assumption: if lock expires, key should also be stale (wrong)

**Prevention:**
- Lock TTL >= Key TTL (conservative approach)
- Or: Lock TTL + buffer >= expected operation time (e.g., 5s lock, 2000ms Copilot latency + 500ms overhead)
- Document: "Lock expires in 5s; if operation exceeds 5s, next worker might corrupt state"
- Test: Simulate slow Copilot (3000ms), verify lock isn't released prematurely

**Detection:**
- Unit test: Set lock TTL lower than operation time; simulate delay; verify lock released too early
- Metric: Log lock duration per request; alert if any > TTL - 1000ms

---

## Minor Pitfalls

Annoyances that slow development or test coverage.

### Pitfall 11: Machine Definition Not Testable Without Copilot Call

**What goes wrong:**
Unit test XState machine, but test requires mocking entire orchestrate endpoint flow (Copilot call, extraction, etc). Tests are slow and brittle.

**Prevention:**
- Test machine in isolation: `actor.send(event); assert actor.getSnapshot().value`
- Test event routing separately: `extractedPayload → event type` (no machine)
- Test Copilot integration separately: `normalizeActivities() → messages` (no machine)
- Compose in integration tests

---

### Pitfall 12: No Logging of Machine Transitions

**What goes wrong:**
User says: "The workflow is stuck on step X." No logs to debug. Black box.

**Prevention:**
- Log every transition: `console.log('[MACHINE] gathering → confirming via PAYMENT_EXTRACTED')`
- Log skipped events: `console.log('[MACHINE] Ignoring CONFIRM in gathering state')`
- Include conversationId, userId for correlation
- Monitor: Alert if same conversation gets NO_SIGNAL >3x

---

### Pitfall 13: Idempotency Cache Doesn't Account for Workflow Evolution

**What goes wrong:**
Workflow definition changes (new state, new transition). Old cached responses become invalid. Users stuck on old workflow.

**Prevention:**
- Version idempotency cache: `idempotency:${userId}:${machineId}:${key}`
- Or: Shorter TTL (300s); evolution is fast
- Or: Cache expires on machine definition change (future: v1.5.x feature)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Phase 15: Machine Definitions** | Incomplete state coverage; unmapped events | Enumerate all Copilot response types; test all signals |
| **Phase 15: Redlock Integration** | Lock timeout misconfigured | Measure actual Copilot latency; set TTL to 1.5x |
| **Phase 15: Idempotency** | Cache key collision or scope leakage | Always scope by userId; test cross-user isolation |
| **Phase 16: Timeout Handling** | Fallback transitions never trigger | Set guard on turnCount; test 3-attempt timeout |
| **Phase 17: State History** | Bloat from storing every transition | Implement LRU eviction; archive old states to S3 |
| **Phase 18: Multi-Tenancy** | State leakage across tenants | Scope lock keys by tenantId; test isolation |

---

## Testing Checklist

| Category | Test | Priority |
|----------|------|----------|
| **Race Conditions** | 10 concurrent orchestrate calls to same conversationId; verify final collectedData complete | CRITICAL |
| **Lock Timeout** | Simulate 3000ms Copilot latency with 2000ms lock TTL; verify consistency | CRITICAL |
| **Idempotency** | Send same request 2x; verify cached response returned, single Copilot call | HIGH |
| **Idempotency Scope** | 2 users with same idempotency key; verify isolated responses | CRITICAL |
| **Machine Coverage** | All possible extracted signals have corresponding events | HIGH |
| **Low Confidence Extraction** | Low-confidence signal doesn't trigger transition | MEDIUM |
| **Lock Failure** | Redis down during lock acquisition; verify 503 response | HIGH |
| **Context Injection** | Live Copilot call with context; verify agent acknowledges | MEDIUM |
| **State Initialization** | Load existing WorkflowState; create machine; verify state present | HIGH |
| **Machine Transitions** | Enumerate all valid transitions; test each with guard conditions | HIGH |

---

## Prevention Strategies

### 1. Load Testing Before Deployment

Simulate 100 concurrent conversations with varying Copilot latencies (500ms-3000ms). Monitor:
- Lock acquisition time (should be <10ms typical)
- Lock timeout rate (should be <1%)
- State consistency (final collectedData complete)

### 2. Observability

Log events:
- Lock acquisition/release with duration
- Machine transitions with state before/after
- Extraction confidence and source
- Idempotency cache hits/misses per user

Alert on:
- Lock timeouts (>1% of requests)
- NO_SIGNAL events (>30% of requests)
- Low-confidence extractions (>50% of requests)
- Machine state mismatch (client state ≠ server state)

### 3. Code Review Checklist

- [ ] All read-modify-write wrapped in `withConversationLock()`
- [ ] Lock TTL >= max Copilot latency + 1000ms
- [ ] Idempotency key scoped by userId
- [ ] Machine context initialized from loaded WorkflowState
- [ ] Event routing has NO_SIGNAL fallback
- [ ] All transitions have explicit guards (no silent ignores)
- [ ] Extraction confidence checked before transition
- [ ] Lock acquisition failures handled (try-catch, return 503)
- [ ] Machines tested in isolation (no Copilot mock)

---

## Recovery Strategies

If pitfall detected in production:

1. **Race Condition:** Restart with single worker; scale back to multiple workers after fix
2. **Lock Timeout:** Increase TTL, verify Copilot SLA; might need fallback Copilot endpoint
3. **Idempotency Leak:** Flush Redis idempotency namespace; users re-submit
4. **Invalid Machine State:** Rollback to last known good state in Redis; replay from there
5. **Context Format Breaking:** Update Copilot agent prompt; migrate in-flight conversations to v2 format

---

## Sources

- [Distributed Locking Pitfalls (Redis Docs)](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)
- [XState Limitations and Edge Cases](https://stately.ai/docs/guards)
- [Idempotency Pitfalls (RFC)](https://httptoolkit.com/blog/idempotency-keys/)
- [Race Condition Testing Strategies](https://www.microsoft.com/en-us/research/publication/race-condition-testing/)

---

*Last updated: 2026-02-21 — v1.5 Workflow Orchestrator Research*
