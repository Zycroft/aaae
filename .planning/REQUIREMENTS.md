# Requirements: Agentic Copilot Chat App

**Defined:** 2026-02-23
**Core Value:** Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected, authenticated via Entra External ID.

## v1.7 Requirements

Requirements for v1.7: OpenAI Dev/Demo Backend. Each maps to roadmap phases.

### Provider Abstraction

- [x] **PROV-01**: Server defines `LlmProvider` interface with `startSession`, `sendMessage`, `sendCardAction` methods returning `NormalizedMessage[]`
- [x] **PROV-02**: `CopilotProvider` wraps existing `CopilotStudioClient` behind `LlmProvider` interface
<<<<<<< HEAD
- [ ] **PROV-03**: `WorkflowOrchestrator` depends on `LlmProvider` interface, not `CopilotStudioClient` directly
=======
- [x] **PROV-03**: `WorkflowOrchestrator` depends on `LlmProvider` interface, not `CopilotStudioClient` directly
>>>>>>> gsd/phase-25-orchestrator-refactor-to-llmprovider
- [ ] **PROV-04**: Provider factory selects backend based on `LLM_PROVIDER` config value
- [ ] **PROV-05**: Provider factory lazy-loads only the selected backend's SDK

### OpenAI Backend

- [ ] **OAPI-01**: `OpenAiProvider` implements `LlmProvider` using OpenAI chat completions API
- [ ] **OAPI-02**: OpenAI provider uses structured output (`response_format: json_schema`) matching `extractedPayload` contract
- [ ] **OAPI-03**: System prompt injects workflow state (step, collectedData, turnCount) per-call
- [ ] **OAPI-04**: Conversation history accumulates across turns per conversation
- [ ] **OAPI-05**: Card actions converted to text descriptions and processed through `sendMessage` logic
- [ ] **OAPI-06**: OpenAI model configurable via `OPENAI_MODEL` env var (default: `gpt-4o-mini`)

### Configuration

- [x] **CONF-01**: `LLM_PROVIDER` env var selects backend (`copilot` default, `openai` alternative)
- [x] **CONF-02**: `COPILOT_*` env vars required only when `LLM_PROVIDER=copilot`
- [x] **CONF-03**: `OPENAI_API_KEY` required only when `LLM_PROVIDER=openai`
- [ ] **CONF-04**: Server starts with `LLM_PROVIDER=openai` + `OPENAI_API_KEY` + `AUTH_REQUIRED=false` (3 env vars)
- [ ] **CONF-05**: Health endpoint reports active provider name and model

### Compatibility

- [x] **COMPAT-01**: `LLM_PROVIDER=copilot` behavior identical to pre-refactor (zero regression)
- [ ] **COMPAT-02**: `shared/` and `client/` require no changes
- [x] **COMPAT-03**: Existing `copilot.ts`, `activityNormalizer.ts`, `structuredOutputParser.ts` unchanged

### Testing

- [ ] **TEST-01**: Unit tests for `OpenAiProvider` with mocked OpenAI SDK
- [ ] **TEST-02**: Unit tests for `CopilotProvider` with mocked `CopilotStudioClient`
- [ ] **TEST-03**: Unit tests for provider factory (correct provider per config)
- [ ] **TEST-04**: Integration test: multi-turn conversation through orchestrator with mocked `LlmProvider`
- [ ] **TEST-05**: Config validation tests (correct env vars required per provider)

## Future Requirements

### Streaming

- **STRM-01**: OpenAI provider streams responses via SSE
- **STRM-02**: Client renders streaming tokens in real-time

### Multi-Provider

- **MPROV-01**: Client-side provider selection UI
- **MPROV-02**: Multiple providers active simultaneously

## Out of Scope

| Feature | Reason |
|---------|--------|
| Streaming responses | High complexity, v1.7 returns complete responses only |
| Multi-model orchestration | One provider per server instance for simplicity |
| Client-side provider selection | Server-only config; client is backend-agnostic |
| Adaptive Card generation from OpenAI | Cards are Copilot-specific; OpenAI returns text only |
| Token usage tracking / cost management | Not needed for dev/demo use case |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROV-01 | Phase 23 | Complete |
| CONF-01 | Phase 23 | Complete |
| CONF-02 | Phase 23 | Complete |
| CONF-03 | Phase 23 | Complete |
| PROV-02 | Phase 24 | Complete |
| COMPAT-03 | Phase 24 | Complete |
<<<<<<< HEAD
| PROV-03 | Phase 25 | Pending |
| COMPAT-01 | Phase 25 | Pending |
=======
| PROV-03 | Phase 25 | Complete |
| COMPAT-01 | Phase 25 | Complete |
>>>>>>> gsd/phase-25-orchestrator-refactor-to-llmprovider
| OAPI-01 | Phase 26 | Pending |
| OAPI-02 | Phase 26 | Pending |
| OAPI-03 | Phase 26 | Pending |
| OAPI-04 | Phase 26 | Pending |
| OAPI-05 | Phase 26 | Pending |
| OAPI-06 | Phase 26 | Pending |
| PROV-04 | Phase 27 | Pending |
| PROV-05 | Phase 27 | Pending |
| CONF-04 | Phase 27 | Pending |
| CONF-05 | Phase 27 | Pending |
| COMPAT-02 | Phase 27 | Pending |
| TEST-01 | Phase 28 | Pending |
| TEST-02 | Phase 28 | Pending |
| TEST-03 | Phase 28 | Pending |
| TEST-04 | Phase 28 | Pending |
| TEST-05 | Phase 28 | Pending |

**Coverage:**
- v1.7 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 — traceability confirmed against ROADMAP.md (Phases 23–28)*
