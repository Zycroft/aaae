# Roadmap: Agentic Copilot Chat App

## Milestones

- ✅ **v1.0 MVP** — Phases 1–3 (shipped 2026-02-20)
- ✅ **v1.1 Polish** — Phase 4 (shipped 2026-02-20)
- ✅ **v1.2 Auth** — Phases 5–7 (shipped 2026-02-21)
- ⬜ **v1.3b Copilot Studio SDK Orchestrator Readiness** — Phases 8–10 (planned)

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

### v1.3b — Copilot Studio SDK: Orchestrator Readiness (Phases 8–10)

- [x] **Phase 8: SDK Capability Audit + Structured Extraction** - Measure SDK latency baselines and extend the normalizer to extract structured JSON from all Copilot activity surfaces (completed 2026-02-21)
  Plans:
  - [ ] 08-01-PLAN.md — ExtractedPayload schema in shared/ + NormalizedMessage extension
  - [ ] 08-02-PLAN.md — TDD: normalizer extraction from activity.value, entities, bot text
  - [ ] 08-03-PLAN.md — Latency baseline spike script + LATENCY-RESULTS.md
- [ ] **Phase 9: Context Injection + Multi-Turn Validation** - Inject workflow context into outbound Copilot messages and verify conversation continuity across 3+ turns with a live agent
  Plans:
  - [ ] 09-01-PLAN.md — TDD: WorkflowContext schema + SendMessageRequest extension (Wave 1)
  - [ ] 09-02-PLAN.md — Server context injection in /send route (Wave 2)
  - [ ] 09-03-PLAN.md — Live 3-turn spike + CONTEXT-INJECTION-RESULTS.md (Wave 3, has checkpoint)
- [ ] **Phase 10: Orchestrate Endpoint + Evaluation** - Deliver the /api/chat/orchestrate endpoint with WorkflowState types and produce the SDK-EVALUATION.md with GO/CONDITIONAL GO recommendation

## Phase Details

### Phase 8: SDK Capability Audit + Structured Extraction
**Goal**: The SDK's performance characteristics are measured against real baselines and the normalizer can extract structured JSON from every Copilot activity surface — without breaking any existing normalizer behavior
**Depends on**: Phase 7
**Requirements**: SOUT-01, SOUT-02, SOUT-03, SOUT-04, SOUT-05, SOUT-06, PERF-01, PERF-02, PERF-03
**Success Criteria** (what must be TRUE):
  1. A developer can read documented latency medians (5+ samples each) for startConversation, sendMessage, and full round-trip from a file in spike/
  2. When Copilot returns a response with data in activity.value, the NormalizedMessage carries a populated extractedPayload with confidence "high"
  3. When Copilot embeds JSON in bot text, the normalizer parses it out and populates extractedPayload with confidence "low" or "medium"
  4. The ExtractedPayload Zod schema in shared/ validates all three extraction surfaces and rejects payloads missing required fields at runtime
  5. All pre-existing normalizer unit tests (text, card, hybrid) continue to pass after the extension
**Plans**: 3 plans

Plans:
- [ ] 08-01-PLAN.md — ExtractedPayload schema in shared/ + NormalizedMessage extension (Wave 1)
- [ ] 08-02-PLAN.md — TDD: normalizer extraction from activity.value, entities, bot text (Wave 2)
- [ ] 08-03-PLAN.md — Latency baseline spike script + LATENCY-RESULTS.md (Wave 1, has checkpoint)

### Phase 9: Context Injection + Multi-Turn Validation
**Goal**: The server injects structured workflow context into outbound Copilot messages and a 3-turn live conversation confirms the agent reads context correctly and conversation state is not lost between turns
**Depends on**: Phase 8
**Requirements**: CTX-01, CTX-02, CTX-03, CTX-04, ORCH-04
**Success Criteria** (what must be TRUE):
  1. The SendMessageRequest schema accepts an optional workflowContext field (step, constraints, collectedData) and Zod validates it at the server boundary
  2. When a caller supplies workflowContext, the server prepends it as a structured prefix to the outbound Copilot message without altering the user query
  3. A 3-turn live conversation with the real Copilot agent succeeds — the agent responds correctly to each turn and does not produce errors or garbled output caused by the injected context
  4. A spike document records the tested context size thresholds (500 chars, 1000 chars) and notes which sizes caused degraded agent responses
**Plans**: 3 plans

### Phase 10: Orchestrate Endpoint + Evaluation
**Goal**: POST /api/chat/orchestrate is live and returning structured payloads, the WorkflowState type is in shared schema, and SDK-EVALUATION.md gives a clear GO/CONDITIONAL GO recommendation backed by real measurements
**Depends on**: Phase 9
**Requirements**: ORCH-01, ORCH-02, ORCH-03, EVAL-01, EVAL-02, EVAL-03
**Success Criteria** (what must be TRUE):
  1. POST /api/chat/orchestrate accepts a query and optional workflowContext, calls the Copilot SDK, and returns messages + extractedPayload + latencyMs in a single response
  2. The WorkflowState and WorkflowStateStore types are exported from shared/ and are usable by both server routes and future orchestrator code
  3. A developer can call /api/chat/orchestrate end-to-end without modifying any existing /api/chat/start, /api/chat/send, or /api/chat/card-action routes — v1.1 behavior is intact
  4. spike/SDK-EVALUATION.md exists, contains all measured criteria filled with real numbers, and states a GO or CONDITIONAL GO recommendation with written rationale for the v1.5 Workflow Orchestrator
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
| 8. SDK Capability Audit + Structured Extraction | v1.3b | Complete    | 2026-02-21 | - |
| 9. Context Injection + Multi-Turn Validation | v1.3b | 0/TBD | Not started | - |
| 10. Orchestrate Endpoint + Evaluation | v1.3b | 0/TBD | Not started | - |
