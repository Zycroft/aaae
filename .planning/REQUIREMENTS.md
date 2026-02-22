# Requirements: Agentic Copilot Chat App

**Defined:** 2026-02-21
**Core Value:** Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected, authenticated via Entra External ID.

## v1.5 Requirements

Requirements for v1.5 Workflow Orchestrator + Structured Output Parsing.

### Parsing

- [x] **PARSE-01**: Server parses structured output from Copilot responses using multi-strategy extraction (activity.value, activity.entities, JSON code blocks in text, Adaptive Card data fields)
- [x] **PARSE-02**: Extracted JSON is validated against CopilotStructuredOutputSchema using Zod with .passthrough() for forward compatibility
- [x] **PARSE-03**: Parser produces ParsedTurn containing data, nextAction, nextPrompt, displayMessages, confidence, citations, and parseErrors
- [x] **PARSE-04**: Parser never throws on parse failure — returns parseErrors array and falls through to passthrough mode
- [x] **PARSE-05**: Shared workflow schemas (CopilotStructuredOutputSchema, ParsedTurn types) defined in shared/src/schemas/workflow.ts

### Orchestration

- [ ] **ORCH-01**: WorkflowOrchestrator can start a new workflow session tied to userId and tenantId
- [ ] **ORCH-02**: WorkflowOrchestrator processes user text input through the full loop (load state, enrich query, Copilot call, normalize, parse, update state, save, return)
- [ ] **ORCH-03**: WorkflowOrchestrator processes card action submissions through the workflow
- [ ] **ORCH-04**: WorkflowResponse includes messages and workflowState (status, currentPhase, collectedData, progress)
- [ ] **ORCH-05**: Workflow state persists in Redis store — orchestration survives server restart mid-workflow
- [ ] **ORCH-06**: Subsequent turns include previously collected data in the Copilot query (context accumulation across turns)
- [ ] **ORCH-07**: Orchestrator processes requests sequentially per conversation to prevent race conditions (Redis-based per-conversation locking)

### Context Building

- [x] **CTX-01**: Context builder prepends structured preamble to Copilot queries containing current step, collected data summary, and turn number
- [x] **CTX-02**: Context preamble format is configurable (not hardcoded) to accommodate different Copilot agent prompt formats
- [x] **CTX-03**: Context preamble respects a configurable max length (default 2000 chars) to prevent context window overflow

### Route Updates

- [x] **ROUTE-01**: POST /api/chat/start delegates to orchestrator and returns workflowState in response
- [x] **ROUTE-02**: POST /api/chat/send delegates to orchestrator and returns workflowState in response
- [x] **ROUTE-03**: POST /api/chat/card-action validates allowlist then delegates to orchestrator and returns workflowState in response
- [x] **ROUTE-04**: Shared API response schemas updated to include optional workflowState field

### Backward Compatibility

- [x] **COMPAT-01**: When Copilot returns unstructured text (no parseable data), behavior is identical to v1.1 (passthrough mode)
- [x] **COMPAT-02**: Existing card action allowlist validation runs before orchestrator processing
- [x] **COMPAT-03**: No regression in existing chat functionality (text chat, Adaptive Cards, authentication)

### Testing

- [x] **TEST-01**: Unit tests for structured output parser covering JSON code blocks, text-only, hybrid, and malformed response formats
- [x] **TEST-02**: Unit tests for context builder verifying preamble format with various state shapes and max-length truncation
- [x] **TEST-03**: Integration test for multi-turn workflow demonstrating data accumulation across turns

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Observability

- **OBS-01**: Confidence scoring per extracted field exposed in API response and logs
- **OBS-02**: Structured observability logs of all workflow state transitions, extraction decisions, and fallback events
- **OBS-03**: State validation endpoint for debugging client-server state divergence

### Advanced Orchestration

- **ADVORCH-01**: LLM-driven next-step determination via meta-query after extraction
- **ADVORCH-02**: Partial/incremental state updates with atomic merge (delta-based data collection)
- **ADVORCH-03**: Context window optimization via artifact offloading to Redis

### Optimization

- **OPT-01**: Intent classification pre-routing for early exit on simple queries
- **OPT-02**: Idempotency middleware with x-idempotency-key header and Redis-backed response cache

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Hardcoded workflow steps | AI-driven flow — Copilot determines next step, orchestrator manages state |
| Copilot Studio agent configuration changes | Orchestrator must work with agent as-is; structured parsing is best-effort |
| Regex/grammar-based token constraints for structured output | Reduces model quality, adds latency; use Zod validation + fallback instead |
| Context accumulation without bounds | Token explosion at ~50 turns; implement budgeted context window instead |
| Dual storage (in-memory + Redis sync) | Race conditions; factory pattern selects ONE backend |
| XState or formal state machine library | Over-engineering for v1.5; hand-rolled orchestrator with AI-driven flow signals |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PARSE-01 | Phase 15 | Complete |
| PARSE-02 | Phase 15 | Complete |
| PARSE-03 | Phase 15 | Complete |
| PARSE-04 | Phase 15 | Complete |
| PARSE-05 | Phase 15 | Complete |
| CTX-01 | Phase 15 | Complete |
| CTX-02 | Phase 15 | Complete |
| CTX-03 | Phase 15 | Complete |
<<<<<<< HEAD
| ORCH-01 | Phase 16 | Pending |
| ORCH-02 | Phase 16 | Pending |
| ORCH-03 | Phase 16 | Pending |
| ORCH-04 | Phase 16 | Pending |
| ORCH-05 | Phase 16 | Pending |
| ORCH-06 | Phase 16 | Pending |
| ORCH-07 | Phase 16 | Pending |
| ROUTE-01 | Phase 17 | Pending |
| ROUTE-02 | Phase 17 | Pending |
| ROUTE-03 | Phase 17 | Pending |
| ROUTE-04 | Phase 17 | Pending |
| COMPAT-01 | Phase 17 | Pending |
| COMPAT-02 | Phase 17 | Pending |
| COMPAT-03 | Phase 17 | Pending |
| TEST-01 | Phase 17 | Pending |
| TEST-02 | Phase 17 | Pending |
| TEST-03 | Phase 17 | Pending |
=======
| ORCH-01 | Phase 16 → 18 | Pending |
| ORCH-02 | Phase 16 → 18 | Pending |
| ORCH-03 | Phase 16 → 18 | Pending |
| ORCH-04 | Phase 16 → 18 | Pending |
| ORCH-05 | Phase 16 → 18 | Pending |
| ORCH-06 | Phase 16 → 18 | Pending |
| ORCH-07 | Phase 16 → 18 | Pending |
| ROUTE-01 | Phase 17 | Complete |
| ROUTE-02 | Phase 17 | Complete |
| ROUTE-03 | Phase 17 | Complete |
| ROUTE-04 | Phase 17 | Complete |
| COMPAT-01 | Phase 17 | Complete |
| COMPAT-02 | Phase 17 | Complete |
| COMPAT-03 | Phase 17 | Complete |
| TEST-01 | Phase 17 | Complete |
| TEST-02 | Phase 17 | Complete |
| TEST-03 | Phase 17 | Complete |
>>>>>>> gsd/phase-17-route-integration-compatibility

**Coverage:**
- v1.5 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-21*
*Last updated: 2026-02-22 — ORCH-01–07 reassigned to Phase 18 (gap closure) per milestone audit*
