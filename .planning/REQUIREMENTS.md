# Requirements: Agentic Copilot Chat App

**Defined:** 2026-02-21
**Core Value:** Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected, authenticated via Entra External ID.

## v1.3b Requirements

Requirements for Copilot Studio SDK: Orchestrator Readiness. Each maps to roadmap phases.

### Structured Output Extraction

- [ ] **SOUT-01**: Server can extract structured JSON from `activity.value` on Copilot responses
- [ ] **SOUT-02**: Server can extract structured JSON from `activity.entities` on Copilot responses
- [ ] **SOUT-03**: Server can parse embedded JSON from bot text responses (regex/JSON.parse fallback)
- [ ] **SOUT-04**: `ExtractedPayload` Zod schema validates all extraction surface types with confidence level (high/medium/low)
- [ ] **SOUT-05**: `activityNormalizer` populates `extractedPayload` on all NormalizedMessage instances
- [ ] **SOUT-06**: Existing normalizer unit tests continue to pass after extension

### Context Injection

- [ ] **CTX-01**: `SendMessageRequest` schema accepts optional `workflowContext` (step, constraints, collectedData)
- [ ] **CTX-02**: Server injects `workflowContext` as structured prefix into outbound Copilot messages
- [ ] **CTX-03**: Context injection tested with live Copilot agent (3+ turns) without breaking agent responses
- [ ] **CTX-04**: Context size limits documented with tested thresholds (500 chars, 1000 chars)

### Orchestrator Infrastructure

- [ ] **ORCH-01**: `WorkflowState` type defined in shared schema (step, collectedData, lastRecommendation, turnCount)
- [ ] **ORCH-02**: `WorkflowStateStore` interface defined extending `ConversationStore`
- [ ] **ORCH-03**: `POST /api/chat/orchestrate` endpoint accepts query + workflowContext, returns messages + extractedPayload + latencyMs
- [ ] **ORCH-04**: Conversation continuity verified across 3+ SDK turns (state not lost between turns)

### Performance Baseline

- [ ] **PERF-01**: `startConversation()` latency measured and documented (5+ samples, median reported)
- [ ] **PERF-02**: `sendMessage()` to first activity latency measured and documented (5+ samples, median reported)
- [ ] **PERF-03**: Full round-trip (request to normalized response) latency measured and documented

### Evaluation

- [ ] **EVAL-01**: `spike/SDK-EVALUATION.md` created with all criteria filled from real measurements
- [ ] **EVAL-02**: GO / CONDITIONAL GO recommendation documented with rationale for v1.5 Workflow Orchestrator
- [ ] **EVAL-03**: Any agent-side configuration requirements documented (what Copilot Studio must return for structured output to work)

## Future Requirements

Deferred to v1.5+ milestones. Tracked but not in current roadmap.

### Workflow Orchestrator (v1.5)

- **WORK-01**: Multi-step workflow engine that drives Copilot conversations programmatically
- **WORK-02**: Workflow definition DSL or configuration format
- **WORK-03**: Workflow state persistence (database-backed)
- **WORK-04**: Workflow error handling and retry logic

### Streaming (v2)

- **PERF-04**: Server-Sent Events for real-time response streaming

## Out of Scope

| Feature | Reason |
|---------|--------|
| Direct Line integration | SDK path selected over Direct Line per decision record |
| Multi-bot support | Not a current requirement; SDK supports single-agent |
| Full orchestrator implementation | v1.3b validates readiness; v1.5 implements |
| Database-backed state persistence | In-memory sufficient for validation; production persistence in v1.5 |
| Mocked Copilot responses for extraction tests | Must use real Copilot Studio agent per constraints |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SOUT-01 | Phase 8 | Pending |
| SOUT-02 | Phase 8 | Pending |
| SOUT-03 | Phase 8 | Pending |
| SOUT-04 | Phase 8 | Pending |
| SOUT-05 | Phase 8 | Pending |
| SOUT-06 | Phase 8 | Pending |
| PERF-01 | Phase 8 | Pending |
| PERF-02 | Phase 8 | Pending |
| PERF-03 | Phase 8 | Pending |
| CTX-01 | Phase 9 | Pending |
| CTX-02 | Phase 9 | Pending |
| CTX-03 | Phase 9 | Pending |
| CTX-04 | Phase 9 | Pending |
| ORCH-04 | Phase 9 | Pending |
| ORCH-01 | Phase 10 | Pending |
| ORCH-02 | Phase 10 | Pending |
| ORCH-03 | Phase 10 | Pending |
| EVAL-01 | Phase 10 | Pending |
| EVAL-02 | Phase 10 | Pending |
| EVAL-03 | Phase 10 | Pending |

**Coverage:**
- v1.3b requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-21*
*Last updated: 2026-02-21 — traceability confirmed after ROADMAP.md creation*
