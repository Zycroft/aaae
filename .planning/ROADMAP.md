# Roadmap: Agentic Copilot Chat App

## Milestones

- ✅ **v1.0 MVP** — Phases 1–3 (shipped 2026-02-20)
- ✅ **v1.1 Polish** — Phase 4 (shipped 2026-02-20)
- ✅ **v1.2 Auth** — Phases 5–7 (shipped 2026-02-21)
- ✅ **v1.3b Copilot Studio SDK: Orchestrator Readiness** — Phases 8–10 (shipped 2026-02-21)
- ✅ **v1.4 Persistent State Store** — Phases 11–14 (shipped 2026-02-22)
- 🚧 **v1.5 Workflow Orchestrator + Structured Output Parsing** — Phases 15–17 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–3) — SHIPPED 2026-02-20</summary>

- [x] Phase 1: Scaffold + Schema + Server Foundation (4/4 plans) — completed 2026-02-20
- [x] Phase 2: Text Chat End-to-End (4/4 plans) — completed 2026-02-20
- [x] Phase 3: Adaptive Cards + Accessibility + Theming (5/5 plans) — completed 2026-02-20

Full phase details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Polish (Phase 4) — SHIPPED 2026-02-20</summary>

- [x] Phase 4: Polish, Metadata Drawer, CI, and Docs (3/3 plans) — completed 2026-02-20

Full phase details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Entra External ID Authentication (Phases 5–7) — SHIPPED 2026-02-21</summary>

- [x] Phase 5: Shared Schema + Config Foundation (2/2 plans) — completed 2026-02-21
- [x] Phase 6: Server JWT Validation + Org Allowlist (2/2 plans) — completed 2026-02-21
- [x] Phase 7: Client MSAL Authentication (3/3 plans) — completed 2026-02-21

Full phase details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3b Copilot Studio SDK: Orchestrator Readiness (Phases 8–10) — SHIPPED 2026-02-21</summary>

- [x] Phase 8: SDK Capability Audit + Structured Extraction (3/3 plans) — completed 2026-02-21
- [x] Phase 9: Context Injection + Multi-Turn Validation (3/3 plans) — completed 2026-02-21
- [x] Phase 10: Orchestrate Endpoint + Evaluation (3/3 plans) — completed 2026-02-21

Full phase details: `.planning/milestones/v1.3b-ROADMAP.md`

</details>

<details>
<summary>✅ v1.4 Persistent State Store (Phases 11–14) — SHIPPED 2026-02-22</summary>

- [x] Phase 11: StoredConversation Schema + Store Abstraction (2/2 plans) — completed 2026-02-22
- [x] Phase 12: Redis Implementation + Resilience (2/2 plans) — completed 2026-02-22
- [x] Phase 13: Route Integration + Tests (1/1 plan) — completed 2026-02-22
- [x] Phase 14: Redis Error Differentiation (1/1 plan) — completed 2026-02-22

Full phase details: `.planning/milestones/v1.4-ROADMAP.md`

</details>

### 🚧 v1.5 Workflow Orchestrator + Structured Output Parsing (In Progress)

**Milestone Goal:** Transform the Node server from a stateless proxy into a Workflow Orchestrator that parses structured output from Copilot responses, maintains per-conversation workflow state in Redis, enriches outbound queries with accumulated context, and routes all existing endpoints through the orchestrator — while preserving passthrough behavior when Copilot returns unstructured text.

- [ ] **Phase 15: Parser + Context Builder** - Shared schemas, multi-strategy structured output parser, and configurable context builder
- [ ] **Phase 16: Workflow Orchestrator Engine** - Stateful orchestration service with Redis persistence, per-conversation locking, and context accumulation
- [ ] **Phase 17: Route Integration + Compatibility** - Wire orchestrator into all chat routes, update API schemas, validate backward compatibility, and ship integration tests

## Phase Details

### Phase 15: Parser + Context Builder
**Goal**: Structured output can be reliably extracted from any Copilot response format, and outbound queries can be enriched with a configurable workflow context preamble
**Depends on**: Phase 14 (Redis store, error handling, JWT claim integration all complete)
**Requirements**: PARSE-01, PARSE-02, PARSE-03, PARSE-04, PARSE-05, CTX-01, CTX-02, CTX-03
**Success Criteria** (what must be TRUE):
  1. A Copilot response containing structured JSON (in activity.value, activity.entities, or a JSON code block in text) produces a ParsedTurn with populated data and nextAction fields
  2. A Copilot response containing only plain text produces a ParsedTurn in passthrough mode with parseErrors empty and no data fields set
  3. A malformed or unparseable Copilot response produces a ParsedTurn where parseErrors contains the failure reason and the parser does not throw
  4. The context builder prepends a preamble to Copilot queries that includes current step, collected data summary, and turn number — and the preamble is truncated to the configured max length when it exceeds the limit
  5. CopilotStructuredOutputSchema and ParsedTurn types are defined in shared/src/schemas/workflow.ts and importable from both server and (type-only) client
**Plans**: 3 plans

Plans:
- [ ] 15-01-PLAN.md — Shared workflow schemas (CopilotStructuredOutputSchema, ParsedTurn, NextAction) in shared/src/schemas/workflow.ts
- [ ] 15-02-PLAN.md — TDD: Structured output parser (parseTurn, multi-strategy extraction + Zod validation)
- [ ] 15-03-PLAN.md — TDD: Context builder (buildContextualQuery, configurable preamble + max-length truncation)

### Phase 16: Workflow Orchestrator Engine
**Goal**: A WorkflowOrchestrator service manages the full per-turn loop (load state, enrich query, call Copilot, normalize, parse, update state, save) with atomic Redis state persistence and per-conversation sequential processing
**Depends on**: Phase 15 (parser and context builder complete)
**Requirements**: ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05, ORCH-06, ORCH-07
**Success Criteria** (what must be TRUE):
  1. Starting a new workflow session creates a WorkflowState in Redis scoped to the conversation's userId and tenantId
  2. After a second turn in the same conversation, the collected data from the first turn appears in the Copilot query context preamble
  3. A card action submission flows through the orchestrator and produces a WorkflowResponse containing both the assistant messages and the updated workflowState
  4. Killing and restarting the server mid-workflow and then sending another message resumes correctly from the persisted Redis state
  5. Sending ten concurrent requests for the same conversationId results in all requests completing with a consistent final state (no data lost due to race conditions)
**Plans**: TBD

### Phase 17: Route Integration + Compatibility
**Goal**: All three chat routes (/start, /send, /card-action) delegate to the orchestrator and return workflowState in their responses, while existing chat behavior is fully preserved when no structured output is present
**Depends on**: Phase 16 (orchestrator service complete)
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, COMPAT-01, COMPAT-02, COMPAT-03, TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Sending a plain text message through /api/chat/send returns the same messages content as v1.4 with an additional optional workflowState field that existing clients can safely ignore
  2. Submitting an Adaptive Card action through /api/chat/card-action still passes through the allowlist validator before reaching the orchestrator, and allowlist violations still return 403
  3. A client that sends no workflowContext and receives unstructured Copilot responses observes zero behavior change from v1.4 (identical message content, status codes, and error shapes)
  4. The parser unit test suite covers JSON code block extraction, text-only passthrough, hybrid responses, and malformed input without any test throwing
  5. A multi-turn integration test demonstrates that collectedData accumulates across three or more turns and appears in successive Copilot query preambles
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Scaffold + Schema + Server Foundation | v1.0 | 4/4 | Complete | 2026-02-20 |
| 2. Text Chat End-to-End | v1.0 | 4/4 | Complete | 2026-02-20 |
| 3. Adaptive Cards + Accessibility + Theming | v1.0 | 5/5 | Complete | 2026-02-20 |
| 4. Polish, Metadata Drawer, CI, and Docs | v1.1 | 3/3 | Complete | 2026-02-20 |
| 5. Shared Schema + Config Foundation | v1.2 | 2/2 | Complete | 2026-02-21 |
| 6. Server JWT Validation + Org Allowlist | v1.2 | 2/2 | Complete | 2026-02-21 |
| 7. Client MSAL Authentication | v1.2 | 3/3 | Complete | 2026-02-21 |
| 8. SDK Capability Audit + Structured Extraction | v1.3b | 3/3 | Complete | 2026-02-21 |
| 9. Context Injection + Multi-Turn Validation | v1.3b | 3/3 | Complete | 2026-02-21 |
| 10. Orchestrate Endpoint + Evaluation | v1.3b | 3/3 | Complete | 2026-02-21 |
| 11. StoredConversation Schema + Store Abstraction | v1.4 | 2/2 | Complete | 2026-02-22 |
| 12. Redis Implementation + Resilience | v1.4 | 2/2 | Complete | 2026-02-22 |
| 13. Route Integration + Tests | v1.4 | 1/1 | Complete | 2026-02-22 |
| 14. Redis Error Differentiation | v1.4 | 1/1 | Complete | 2026-02-22 |
| 15. Parser + Context Builder | v1.5 | 0/? | Not started | - |
| 16. Workflow Orchestrator Engine | v1.5 | 0/? | Not started | - |
| 17. Route Integration + Compatibility | v1.5 | 0/? | Not started | - |
