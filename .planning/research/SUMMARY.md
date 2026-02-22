# Project Research Summary: v1.5 Workflow Orchestrator + Structured Output Parser

**Project:** Agentic Copilot Chat App (React + Express monorepo with Microsoft Copilot Studio)
**Milestone:** v1.5 Workflow Orchestrator + Structured Output Parsing
**Researched:** 2026-02-21
**Confidence:** HIGH

---

## Executive Summary

The v1.5 milestone adds deterministic workflow orchestration and structured output parsing to the existing chat application (which already has extraction infrastructure in v1.3b and Redis state store in v1.4). The recommended approach is to introduce **XState for workflow state machines** and **redlock-universal for distributed conversation locking**, combined with the existing Zod validation and Redis infrastructure. This enables multi-turn workflows where the system reliably tracks state across turns, enforces atomic updates to prevent race conditions, and validates extracted data before making workflow decisions.

The primary implementation risk is **race condition corruption in multi-worker deployments**—if two workers simultaneously process the same conversation without per-conversation locking, state updates from one worker will be silently lost. This must be designed in from day one. Secondary risks include context window overflow (if conversation history grows unbounded), parser brittleness (if extraction fails silently), and idempotency cache inconsistencies. All three risks are well-documented with prevention strategies in the research.

The stack is minimal and low-risk: XState (zero dependencies, battle-tested) and redlock-universal (actively maintained, Redlock algorithm proven). No changes to the core Copilot SDK integration or conversation store interfaces are needed. This is an additive change that preserves backward compatibility with v1.4.

---

## Key Findings

### Recommended Stack

The existing stack (Zod 3.25.76, Express, ioredis 5.9.3, TypeScript 5.7) is sufficient. Two new packages complete the v1.5 requirements:

**Install immediately:**
- **XState (v5.28.0)** — Deterministic workflow state machine with first-class TypeScript support. Handles multi-turn orchestration, guards on transitions, and context accumulation. Zero runtime dependencies; ~40KB minified. Replaces ad-hoc procedural orchestration with a testable, visual state graph.
- **redlock-universal (v0.8.2)** — Distributed locking across Redis instances using the Redlock algorithm. Prevents race conditions when multiple Node workers process the same conversation. 5-10ms overhead per operation (negligible vs. Copilot's 2000ms roundtrip).

**Defer to phase-specific research:**
- Ajv (JSON Schema validation) — Zod is sufficient for v1.5; defer if enterprise audit requirements emerge in Phase 15+.
- Token counting libraries — Not blocking v1.5; add in Phase 16+ if context window budgeting becomes necessary.

**Pattern-based (no new library):**
- Idempotency — Uses existing ioredis + Zod validation. Implement via Redis cache keyed by `idempotency:${userId}:${key}` (1h TTL).

See **WORKFLOW_STACK.md** for detailed rationale, peer dependencies, and installation commands.

### Expected Features

**Table stakes (users expect these):**
- Multi-turn state tracking across conversation restarts (WorkflowState in Redis, 24h TTL)
- Atomic updates preventing race condition data loss (Redlock per-conversation lock)
- Structured extraction with Zod validation + confidence scoring (extends v1.4 ExtractedPayload)
- Context injection for each Copilot query (existing `[WORKFLOW_CONTEXT]` prefix, reused)
- Idempotent orchestrate endpoint (x-idempotency-key header, Redis cache)
- Step-based flow control with XState transitions

**Should have (differentiators, v1.6+):**
- LLM-driven next-step determination (ask Copilot "what happens next?" instead of hardcoded transitions)
- Confidence scoring in observability logs (per-field confidence tracking)
- Partial state updates (merge deltas instead of full overwrites)
- Structured orchestrator decision logs (audit trail of all state mutations)

**Explicitly NOT building (v1.5):**
- Workflow state history / audit archive (defer to Phase 17)
- Context window optimization via artifact offloading (defer to Phase 17+)
- Human-in-the-loop escalation workflows (requires queue infrastructure, Phase 17+)
- Multi-user collaborative workflows (v2+)
- Machine versioning / schema migration (v2+)

See **WORKFLOW_FEATURES.md** for detailed feature dependencies and MVP definition.

### Architecture Approach

The Workflow Orchestrator integrates cleanly into the existing Express architecture by introducing four new components that layer on top of the existing store, normalizer, and Copilot SDK:

1. **StructuredOutputParser** — Wraps and extends the existing `extractStructuredPayload` logic from activityNormalizer with multi-strategy parsing (Activity.value > entities > text), Zod validation, and confidence signals. Keeps existing normalizer unchanged.

2. **WorkflowOrchestrator** — Stateful service that orchestrates the conversation flow: loads WorkflowState from Redis, creates an XState machine actor, routes extracted signals to the machine, accumulates state, and saves back to Redis. Calls both ConversationStore (for history) and WorkflowStateStore (for orchestration state).

3. **ContextBuilder** — Utility module that enriches outbound Copilot messages with workflow state (step, collectedData, constraints). Refactors existing inline `buildContextPrefix()` logic for testability.

4. **Redlock Lock Wrapper** — Utility for acquiring/releasing per-conversation locks before any read-modify-write operation on WorkflowState. Prevents race conditions in multi-worker deployments.

**Data flow (single orchestrate call):**
1. Validate request (Zod) → acquire Redlock (5s TTL) → load WorkflowState from Redis
2. Create XState actor with loaded context → inject context into Copilot query
3. Send to Copilot → receive Activity stream → normalize to NormalizedMessage[]
4. Extract structured payload (3-surface priority) → determine machine event
5. Send event to machine → machine transitions (guards applied, actions executed)
6. Update WorkflowState → save to Redis (under lock) → release lock
7. Cache response (idempotency) → return { conversationId, messages, workflowState }

**Backward compatibility:** Old v1.4 conversations load with default WorkflowState (via Zod `.default()` values). Existing `/api/chat/send` route continues to work unchanged if no workflowContext is provided. New `workflowState` field in response is optional (existing clients ignore).

See **WORKFLOW_ARCHITECTURE.md** for detailed build order, integration points, error handling, and anti-patterns to avoid.

### Critical Pitfalls

1. **Race Condition in Multi-Worker Deployments** — Two workers process same conversation simultaneously, both read old state, both write conflicting updates. Final state loses data from one worker. **Prevention:** Always wrap read-modify-write in `withConversationLock()`. Test with 10 concurrent requests to same conversationId; verify final collectedData complete.

2. **Lock Timeout Not Exceeding Copilot Latency** — Lock TTL (2s) is shorter than actual Copilot roundtrip (2-3s). Lock expires mid-operation. Another worker acquires lock, reads partially-updated state. **Prevention:** Measure actual Copilot latency in production context; set lock TTL to 1.5x P99 latency (e.g., 5s for typical 2-3s roundtrips). Log all lock acquisitions; alert if timeout rate >1%.

3. **Context Window Overflow → Silent Degradation** — Naively injecting full conversation history + collectedData + state into every Copilot message causes token bloat. After 10-20 turns, context exhaustion silently truncates Copilot responses. Parser receives incomplete JSON. Workflow decisions become stale. **Prevention:** Implement token budgeting before context injection. Three-tier strategy: Tier 1 (<40% budget) = full history; Tier 2 (40-70%) = last 20 turns + summary; Tier 3 (70%+) = last 5 turns + keys only. Monitor token usage per request.

4. **Parser Brittleness + Silent Fallback to Unstructured Mode** — Copilot's response format shifts slightly (field name change), parser fails silently, code treats as "no structured output," workflow continues in degraded passthrough mode. No alert. **Prevention:** Distinguish three parser states: `{ kind: 'structured', data }`, `{ kind: 'unstructured', text }`, `{ kind: 'parse_error', errors[] }`. Log all parse_error cases. Implement circuit breaker: >15% parse error rate over 100 requests → log CRITICAL and disable orchestrator.

5. **Idempotency Cache Returning Stale State** — User retries with same idempotency key, cache returns old response with outdated workflowState while server-side state has advanced further. Client UI rolls back. **Prevention:** Idempotency cache stores response data only, not state. Or: shorter TTL (300s instead of 3600s). Or: fetch latest workflowState from server on cache hit and return alongside cached messages.

See **WORKFLOW_PITFALLS.md** for 29 pitfalls total (5 critical, 8 moderate, 16 minor/phase-specific). Each includes example, prevention strategy, and detection/testing approach.

---

## Implications for Roadmap

The v1.5 milestone is decomposed into **four sequential phases** based on dependencies and risk. Each phase is independently testable and produceable.

### Suggested Phase Structure

#### Phase 15: Workflow Orchestrator Engine (2-3 weeks)

**Rationale:** Foundation phase. Must establish schemas, core services, and locking before route integration. This is where the race condition pitfall is prevented (by designing locks from day one).

**Delivers:**
- XState machine definitions (at least payment/onboarding flow template)
- Redlock wrapper (`withConversationLock()`) with proper TTL calculation
- WorkflowOrchestrator service with state read/write, event routing, and atomic updates
- WorkflowStateStore Redis persistence (24h TTL per conversation)
- ContextBuilder utility (context injection formatting)
- Schema definitions in `shared/` (CopilotStructuredOutputSchema, ParsedStructuredOutput, NextAction, WorkflowState)

**Addresses features:**
- Multi-turn state tracking ✓
- Atomic state updates ✓
- Step-based flow control ✓
- Context enrichment ✓

**Avoids pitfalls:**
- Race conditions (Redlock from day one) ✓
- Lock timeout issues (measure Copilot latency, set TTL conservatively) ✓
- State initialization bugs (load existing WorkflowState before creating machine actor) ✓
- Invalid machine events (handle NO_SIGNAL fallback) ✓

**Build order within phase:**
1. Schemas (shared/) — CopilotStructuredOutputSchema, ParsedStructuredOutput, NextAction, extended StoredConversation
2. StructuredOutputParser (server/src/parser/) — multi-strategy extraction + Zod validation + confidence scoring
3. ContextBuilder (server/src/workflow/) — refactor buildContextPrefix logic, add state injection
4. WorkflowOrchestrator (server/src/workflow/) — load state, route signals to machine, update state
5. Redlock wrapper (server/src/store/locks/) — acquire/release per-conversation locks
6. Unit tests for each component (machines, parser, orchestrator, locks)

**Research needed:** Schema design for CopilotStructuredOutputSchema (what Copilot response structure should we expect?). Actual measured Copilot latencies in production-like conditions (to set lock TTL correctly).

---

#### Phase 16: Structured Output Validation & Fallback (1-2 weeks)

**Rationale:** Once orchestrator engine is working, refine the parser for robustness. This phase handles the parser brittleness pitfall.

**Delivers:**
- Multi-strategy parser with exact/partial/fallback matching
- Confidence scoring system (high/medium/low per extraction)
- Fallback passthrough mode when extraction fails
- Retry mechanism for validation failures (max 2-3 attempts with corrective prompts)
- Parser observability: logs with confidence, strategy used, error details
- Test fixtures: real Copilot responses (50+ examples) for regression testing

**Addresses features:**
- Structured output extraction validation ✓
- Fallback passthrough mode ✓
- Retry mechanism ✓
- Confidence scoring (enables downstream filtering) ✓

**Avoids pitfalls:**
- Parser brittleness (distinguish parse_error from unstructured) ✓
- Inconsistent extraction strategies (normalize all sources to single pipeline) ✓
- Schema backward compatibility (validation against production data snapshot before ship) ✓
- Silent extraction failures (circuit breaker on >15% error rate) ✓

**Acceptance criteria:**
- 3 extraction strategies (value/entities/text) tested for consistency across test suite
- All 50+ production response fixtures parse without error regression
- Low confidence extractions don't trigger state machine transitions
- Parser distinguishes parse_error from unstructured_response in logs

**Research needed:** Actual Copilot response patterns (how often does it use each extraction surface? what are typical confidence distributions?). This requires analysis of test conversations with live Copilot SDK.

---

#### Phase 17: Route Integration & Backward Compatibility (1-2 weeks)

**Rationale:** Connect new orchestrator to existing routes. Ensure zero breaking changes to v1.4 API contracts. Test idempotency.

**Delivers:**
- Extended `/api/chat/orchestrate` endpoint (call new parser and orchestrator)
- Idempotency middleware (x-idempotency-key header, Redis cache)
- Minimal modifications to `/api/chat/send` and `/api/chat/card-action` (optional orchestrator calls)
- Updated API response schemas (add optional workflowState field)
- Backward compatibility tests (old v1.4 conversations work unchanged)
- End-to-end integration tests: 5-turn workflow, race conditions, idempotency, context injection

**Addresses features:**
- Idempotent requests ✓
- All table stakes features complete ✓

**Avoids pitfalls:**
- Idempotency cache inconsistencies (scope by userId, shorter TTL) ✓
- Backward compatibility breaks (extend schemas with optional fields, defaults) ✓
- Cross-user data leakage (cache key scoped: idempotency:${userId}:${key}) ✓
- State divergence (validate cached response before returning) ✓

**Acceptance criteria:**
- All v1.4 tests pass (100% backward compat)
- Duplicate orchestrate calls return cached response (verified via log correlation)
- 10 concurrent orchestrate calls to same conversation: final state correct
- Context injection visible in Copilot response (manual or SDK-based validation)

**Research needed:** None; integration is straightforward once core is built.

---

#### Phase 18: Observability & Production Hardening (1 week, overlaps testing)

**Rationale:** Prepare for production. Add monitoring, structured logging, error recovery strategies.

**Delivers:**
- Structured logging for all orchestrator decisions (timestamp, conversationId, userId, action, confidence, error)
- Metrics: lock acquisition time, lock timeouts, parse errors by strategy, extraction confidence distribution
- Health check endpoint: verify Redis connectivity, lock availability, idempotency cache health
- Alert rules: lock timeout rate >1%, parse error rate >15%, context truncation >5% of requests
- State validation endpoint: GET /api/chat/:conversationId/state (compare server vs. computed state)
- Runbook for common failure modes: "Lock timeouts spike" → increase TTL; "Parse errors increase" → update Copilot agent

**Avoids pitfalls:**
- Silent failures (context window truncation, state divergence) ✓
- Production incidents without visibility (comprehensive observability) ✓

**Acceptance criteria:**
- All orchestrator paths emit structured logs
- Metrics visible in dashboard (Grafana/Application Insights)
- Alert rules tested (simulate failure condition, verify alert fires)
- Runbook steps verified with team

---

### Phase Ordering Rationale

1. **Phase 15 first:** Builds the core orchestrator engine and establishes the locking pattern. All downstream phases depend on this working correctly. Starting here avoids the pitfall of retrofitting locks after building stateless routes.

2. **Phase 16 second:** Refines the parser once the orchestrator is integrated. Parser tests can use the orchestrator as the integration point. Discover real Copilot response patterns early (inform phase 16+).

3. **Phase 17 third:** Route integration happens last because routes are the thin glue. Once parser and orchestrator are proven, connecting them to routes is straightforward.

4. **Phase 18 last:** Observability is added after core is working (you know what to observe). Can be parallelized with phase 17 testing.

**Dependency graph:**
```
Phase 15 (Schemas, Parser, Orchestrator, Locking)
  ↓ (enables)
Phase 16 (Parser Refinement + Observability)
  ↓ (integrates into)
Phase 17 (Routes + End-to-End Tests)
  ↓ (adds metrics to)
Phase 18 (Production Hardening)
```

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 15:** CopilotStructuredOutputSchema design — exactly what structure should Copilot return? Should the schema be per-conversation, per-step, or global? How to handle schema evolution without breaking clients?
- **Phase 15:** Actual Copilot latency measurements — v1.3b research assumed 500ms; production measurements from load tests (Phase 14+) show 2-3s typical. Lock TTL depends on this.
- **Phase 16:** Real Copilot response patterns — are extraction surface distributions (value vs. entities vs. text) equal? What confidence distribution do we observe? Are parse errors predictable?

**Phases with standard patterns (can skip research-phase):**
- **Phase 17:** Route integration — standard Express middleware patterns, well-documented in ARCHITECTURE.md
- **Phase 18:** Observability — standard Node.js logging + metrics patterns, no novel domain risk

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | XState and redlock-universal verified against npm, official docs, production case studies. Zero dependencies, actively maintained. No version/compatibility conflicts. |
| **Features** | HIGH | Feature set clearly derived from workflow orchestration domain patterns (2026 research consensus). MVP definition aligns with expert practices. No controversial choices. |
| **Architecture** | HIGH | Integration points documented in detail. Data flow tested against existing code. Backward compatibility guaranteed by Zod schema design and optional response fields. No breaking changes required. |
| **Pitfalls** | HIGH | 29 pitfalls researched, each with prevention + detection strategy. Top 5 pitfalls have proven solutions (race condition → Redlock; context overflow → token budgeting; parser brittleness → multi-state distinction; idempotency → user-scoped cache; lock timeout → measured latency). |
| **Phase Structure** | HIGH | Four phases decompose cleanly by dependency. Each phase has clear inputs/outputs. Build order verified against data flow. No circular dependencies. |

**Overall confidence:** **HIGH** — Stack is proven, architecture is sound, pitfalls are identified with prevention strategies, and phase decomposition is unambiguous. The main execution risk is in the details (correct lock TTL calculation, parser confidence scoring rules) but these are researchable during Phase 15 and don't affect the overall approach.

### Gaps to Address

1. **CopilotStructuredOutputSchema Design** — Research identified that schema per-conversation is needed, but exact format unclear. Recommend Phase 15 spike (2-3 hours) to enumerate expected Copilot response types for 3-5 example workflows. Document as `shared/src/schemas/copilotResponses.examples.ts`.

2. **Actual Copilot Latency Distribution** — Lock TTL depends on P99 latency. If Phase 14 load test data shows 3s P99, set lock TTL to 5s. If 1s P99, set to 2s. Recommend baseline measurement in Phase 15 before finalizing lock config.

3. **Confidence Scoring Implementation** — Research specified "high/medium/low" but exact rules unclear (e.g., does exact match = "high", partial = "medium"?). Recommend Phase 16 spike to empirically evaluate parser accuracy on 50+ test responses.

4. **Client-Side Workflow UI Integration** — Research focused on server-side orchestrator. Client receives workflowState in response. How should client UI display progress, handle step transitions, show errors? Recommend design spike in Phase 17 (designer + frontend eng, ~4 hours).

5. **Copilot Agent Prompt for Context Injection** — Research assumes Copilot agent can parse [WORKFLOW_CONTEXT] prefix and understand constraints. This was validated in Phase 10 (Context Injection Validation, v1.3b) but current agent config not in codebase. Recommend Phase 15 to verify current agent still handles context correctly.

---

## Sources

### Primary (HIGH confidence)

- **WORKFLOW_STACK.md** — Technology Stack for v1.5: XState v5.28.0, redlock-universal v0.8.2, peer dependency analysis, installation commands
- **WORKFLOW_FEATURES.md** — Feature research: table stakes, differentiators, MVP definition, user workflow examples
- **WORKFLOW_ARCHITECTURE.md** — Architecture patterns, data flow, component boundaries, build order, backward compatibility
- **WORKFLOW_PITFALLS.md** — 29 pitfalls with prevention/detection strategies: race conditions, lock timeout, idempotency, parser brittleness, state divergence
- **FEATURES.md** — Feature landscape (existing v1.3b-v1.4 context, reused for v1.5 comparison)
- **ARCHITECTURE.md** — Integration architecture (existing v1.4 systems, how v1.5 connects)
- **PITFALLS.md** — Existing pitfalls research (v1.0-v1.3b foundation, v1.4 Redis additions, v1.5 workflow-specific extensions)

### Secondary (MEDIUM confidence)

- XState official docs (https://xstate.js.org/) — v5.28.0 stable, zero dependencies, TypeScript first-class support
- Redis Distributed Locks Guide (https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/) — Redlock algorithm proven in production
- Microsoft Copilot Studio docs (https://learn.microsoft.com/en-us/microsoft-copilot-studio/) — existing agent architecture, activity protocol, structured outputs
- Idempotency RFC (https://httptoolkit.com/blog/idempotency-keys/) — HTTP semantics for retry-safety
- Workflow Orchestration Patterns (2026 research consensus, multiple sources)

### Tertiary (LOW confidence, needs validation during implementation)

- Estimated Copilot latency (500ms → 2-3s). Requires Phase 14+ load test data.
- Confidence scoring rules (assumptions about parser accuracy per strategy). Requires Phase 16 empirical analysis.
- Copilot agent's ability to parse context format changes. Requires Phase 15 verification test.

---

## Recommendation

**Proceed with Phase 15 immediately.** The research is conclusive: stack is proven, architecture is sound, risks are identified and mitigatable, and phase decomposition is clear. The three main dependencies (Copilot latency measurement, schema design, confidence scoring rules) are all researchable during Phase 15 without blocking phase start.

**Estimated effort:** 8-10 weeks total for all four phases (Phase 15: 2-3w, Phase 16: 1-2w, Phase 17: 1-2w, Phase 18: 1w). Ready for production deployment after Phase 17 with Phase 18 hardening optional pre-GA.

---

*Research completed: 2026-02-21*
*Synthesized from: WORKFLOW_STACK.md, WORKFLOW_FEATURES.md, WORKFLOW_ARCHITECTURE.md, WORKFLOW_PITFALLS.md*
*Ready for roadmap planning: YES*
