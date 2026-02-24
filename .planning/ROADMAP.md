# Roadmap: Agentic Copilot Chat App

## Milestones

- ✅ **v1.0 MVP** — Phases 1–3 (shipped 2026-02-20)
- ✅ **v1.1 Polish** — Phase 4 (shipped 2026-02-20)
- ✅ **v1.2 Auth** — Phases 5–7 (shipped 2026-02-21)
- ✅ **v1.3b Copilot Studio SDK: Orchestrator Readiness** — Phases 8–10 (shipped 2026-02-21)
- ✅ **v1.4 Persistent State Store** — Phases 11–14 (shipped 2026-02-22)
- ✅ **v1.5 Workflow Orchestrator + Structured Output Parsing** — Phases 15–18 (shipped 2026-02-22)
- ✅ **v1.6 Dynamic Step-Driven UX** — Phases 19–22 (shipped 2026-02-23)
- 🔄 **v1.7 OpenAI Dev/Demo Backend** — Phases 23–28 (in progress)

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

<details>
<summary>✅ v1.5 Workflow Orchestrator + Structured Output Parsing (Phases 15–18) — SHIPPED 2026-02-22</summary>

- [x] Phase 15: Parser + Context Builder (3/3 plans) — completed 2026-02-22
- [x] Phase 16: Workflow Orchestrator Engine (3/3 plans) — completed 2026-02-22
- [x] Phase 17: Route Integration + Compatibility (3/3 plans) — completed 2026-02-22
- [x] Phase 18: Phase 16 Verification + Requirement Closure (2/2 plans) — completed 2026-02-22

Full phase details: `.planning/milestones/v1.5-ROADMAP.md`

</details>

<details>
<summary>✅ v1.6 Dynamic Step-Driven UX (Phases 19–22) — SHIPPED 2026-02-23</summary>

- [x] Phase 19: WorkflowState Schema + Client State Foundation (2/2 plans) — completed 2026-02-23
- [x] Phase 20: Shell Wiring + Progress Indicator + Transcript (3/3 plans) — completed 2026-02-23
- [x] Phase 21: Dynamic Input + Completion + MetadataPane (3/3 plans) — completed 2026-02-23
- [x] Phase 22: Integration Testing (1/1 plan) — completed 2026-02-23

Full phase details: `.planning/milestones/v1.6-ROADMAP.md`

</details>

### v1.7 OpenAI Dev/Demo Backend (Phases 23–28)

- [x] **Phase 23: LLM Provider Interface + Config** - Define provider contract and make config provider-aware (completed 2026-02-24)
- [ ] **Phase 24: CopilotProvider Extraction** - Wrap existing Copilot logic behind LlmProvider interface
- [ ] **Phase 25: Orchestrator Refactor to LlmProvider** - WorkflowOrchestrator depends on interface only
- [ ] **Phase 26: OpenAI Provider Implementation** - Create working OpenAI-backed LlmProvider
- [ ] **Phase 27: Provider Factory + Auth Polish** - Wire config-driven backend selection and health reporting
- [ ] **Phase 28: Testing + Verification** - Full test coverage for both providers and the factory

## Phase Details

### Phase 23: LLM Provider Interface + Config
**Goal**: The server defines the provider contract and enforces conditional config validation — Copilot vars only required for Copilot, OpenAI vars only required for OpenAI.
**Depends on**: Phase 22 (v1.6 complete)
**Requirements**: PROV-01, CONF-01, CONF-02, CONF-03
**Success Criteria** (what must be TRUE):
  1. Server starts with `LLM_PROVIDER=copilot` + existing Copilot vars — no error, no new warnings
  2. Server starts with `LLM_PROVIDER=openai` + `OPENAI_API_KEY` — without any Copilot env vars present
  3. Server fails with a fatal error when `LLM_PROVIDER=openai` is set but `OPENAI_API_KEY` is missing
  4. Server fails with a fatal error when `LLM_PROVIDER=copilot` is set but Copilot env vars are missing
  5. `LlmProvider` interface file exists with `startSession`, `sendMessage`, `sendCardAction` method signatures
**Plans**: 1 plan

Plans:
- [x] 23-01-PLAN.md — LlmProvider interface + conditional config validation

### Phase 24: CopilotProvider Extraction
**Goal**: All Copilot-specific SDK code lives inside `CopilotProvider` — the existing `copilot.ts`, `activityNormalizer.ts`, and `structuredOutputParser.ts` files are untouched.
**Depends on**: Phase 23
**Requirements**: PROV-02, COMPAT-03
**Success Criteria** (what must be TRUE):
  1. `CopilotProvider` class exists in `server/src/provider/` and implements `LlmProvider`
  2. All pre-existing server tests pass with zero changes to existing test files
  3. `copilot.ts`, `activityNormalizer.ts`, and `structuredOutputParser.ts` are byte-for-byte unchanged
**Plans**: 1 plan

Plans:
- [ ] 24-01-PLAN.md — CopilotProvider class + unit tests

### Phase 25: Orchestrator Refactor to LlmProvider
**Goal**: `WorkflowOrchestrator` has zero direct knowledge of Copilot Studio — it accepts any `LlmProvider` and the Copilot path continues to work identically.
**Depends on**: Phase 24
**Requirements**: PROV-03, COMPAT-01
**Success Criteria** (what must be TRUE):
  1. `WorkflowOrchestrator.ts` contains no imports from `@microsoft/agents-copilotstudio-client`
  2. All 147 existing server tests pass after the refactor
  3. A conversation started via `LLM_PROVIDER=copilot` produces identical responses to the pre-refactor baseline
**Plans**: TBD

### Phase 26: OpenAI Provider Implementation
**Goal**: A new `OpenAiProvider` delivers multi-turn conversations through the chat completions API, returning `NormalizedMessage[]` with structured `extractedPayload` that the existing orchestrator and parser already understand.
**Depends on**: Phase 25
**Requirements**: OAPI-01, OAPI-02, OAPI-03, OAPI-04, OAPI-05, OAPI-06
**Success Criteria** (what must be TRUE):
  1. `OpenAiProvider` implements `LlmProvider` and returns valid `NormalizedMessage[]` on every call
  2. Sending a second message in the same conversation includes the prior turn in the OpenAI request history
  3. The structured output from OpenAI includes an `extractedPayload` field matching the existing schema contract
  4. A card action submit is converted to a text description and processed through `sendMessage` without error
  5. The OpenAI model used is controlled by the `OPENAI_MODEL` env var and defaults to `gpt-4o-mini`
**Plans**: TBD

### Phase 27: Provider Factory + Auth Polish
**Goal**: Config alone determines which backend runs — switching providers requires no code changes, and the health endpoint surfaces the active provider for operator observability.
**Depends on**: Phase 26
**Requirements**: PROV-04, PROV-05, CONF-04, CONF-05, COMPAT-02
**Success Criteria** (what must be TRUE):
  1. Setting `LLM_PROVIDER=openai` + `OPENAI_API_KEY` + `AUTH_REQUIRED=false` is sufficient to start the server and handle requests — no other env vars needed
  2. Setting `LLM_PROVIDER=copilot` produces behavior identical to the v1.6 baseline
  3. `GET /health` response includes `provider` and `model` fields showing the active backend
  4. `shared/` and `client/` directories have zero modified files
  5. The factory imports only the selected provider's SDK at runtime (Copilot SDK not loaded when `LLM_PROVIDER=openai`)
**Plans**: TBD

### Phase 28: Testing + Verification
**Goal**: Both providers are covered by unit tests, the orchestrator integration test uses a mocked `LlmProvider`, and config validation is verified to fail loudly on bad inputs.
**Depends on**: Phase 27
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. `npm test` is green with all new and existing tests passing
  2. `OpenAiProvider` unit tests cover message history management, structured output parsing, and card action conversion using a mocked OpenAI SDK
  3. Orchestrator integration test drives a multi-turn workflow to completion using a mocked `LlmProvider`
  4. Config validation tests assert the correct fatal error for each bad-config scenario (wrong provider, missing key)
  5. Manual smoke test confirms: UI works with `LLM_PROVIDER=openai`, health endpoint shows `"provider": "openai"`, switching back to `LLM_PROVIDER=copilot` restores prior behavior
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
| 15. Parser + Context Builder | v1.5 | 3/3 | Complete | 2026-02-22 |
| 16. Workflow Orchestrator Engine | v1.5 | 3/3 | Complete | 2026-02-22 |
| 17. Route Integration + Compatibility | v1.5 | 3/3 | Complete | 2026-02-22 |
| 18. Phase 16 Verification + Requirement Closure | v1.5 | 2/2 | Complete | 2026-02-22 |
| 19. WorkflowState Schema + Client State Foundation | v1.6 | 2/2 | Complete | 2026-02-23 |
| 20. Shell Wiring + Progress Indicator + Transcript | v1.6 | 3/3 | Complete | 2026-02-23 |
| 21. Dynamic Input + Completion + MetadataPane | v1.6 | 3/3 | Complete | 2026-02-23 |
| 22. Integration Testing | v1.6 | 1/1 | Complete | 2026-02-23 |
| 23. LLM Provider Interface + Config | v1.7 | 1/1 | Complete | 2026-02-24 |
| 24. CopilotProvider Extraction | v1.7 | 0/1 | Planned | - |
| 25. Orchestrator Refactor to LlmProvider | v1.7 | 0/? | Not started | - |
| 26. OpenAI Provider Implementation | v1.7 | 0/? | Not started | - |
| 27. Provider Factory + Auth Polish | v1.7 | 0/? | Not started | - |
| 28. Testing + Verification | v1.7 | 0/? | Not started | - |
