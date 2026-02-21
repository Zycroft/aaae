# Phase 10: Orchestrate Endpoint + Evaluation - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the POST /api/chat/orchestrate endpoint with WorkflowState types in shared schema and produce SDK-EVALUATION.md with a GO/CONDITIONAL GO recommendation backed by real measurements. This phase does NOT add workflow orchestration logic (v1.5 scope) -- it provides the infrastructure endpoint and the evaluation document that decides whether v1.5 proceeds.

</domain>

<decisions>
## Implementation Decisions

### Orchestrate endpoint response shape
- Response includes: `{ conversationId, messages, extractedPayload, latencyMs, workflowState }`
- `latencyMs` is the wall-clock time from request receipt to response send (measured server-side)
- `extractedPayload` comes from the normalizer (reuses Phase 8 extraction pipeline)
- Endpoint creates its own conversation if none exists (single-request convenience for orchestrator use cases)

### WorkflowState schema design
- WorkflowState tracks: `step` (current), `collectedData` (accumulated KV), `lastRecommendation` (extracted from agent response), `turnCount` (incremented per orchestrate call)
- WorkflowStateStore extends ConversationStore pattern -- in-memory Map, same interface
- WorkflowState is per-conversation, managed server-side (client sends workflowContext, server manages state evolution)

### Evaluation document structure
- SDK-EVALUATION.md follows a criteria-based format: each criterion gets a measurement, a threshold, and a PASS/FAIL assessment
- Final recommendation is GO, CONDITIONAL GO, or NO GO -- with written rationale
- Criteria include: latency (from Phase 8 spike), structured output reliability (from Phase 8 normalizer), context injection coherence (from Phase 9 spike), conversation continuity (from Phase 9)
- Agent-side configuration requirements section documents what the Copilot Studio agent must return for structured output to work reliably

### Route coexistence
- /api/chat/orchestrate is a NEW route -- does NOT replace or modify /start, /send, or /card-action
- Shares the same copilotClient singleton and normalizer pipeline
- Uses the same auth middleware as existing routes

### Claude's Discretion
- Exact WorkflowStateStore implementation details (in-memory Map is fine for v1.3b)
- How latencyMs is measured (performance.now() or Date.now())
- SDK-EVALUATION.md formatting and section ordering
- Whether orchestrate creates a conversation implicitly or requires a prior /start call
- Error response format for orchestrate endpoint

</decisions>

<specifics>
## Specific Ideas

- The orchestrate endpoint should feel like a "batteries-included" single call -- send a query with optional context, get back everything the orchestrator needs (messages, structured data, timing)
- SDK-EVALUATION.md should be readable by a product manager, not just an engineer -- clear recommendation with evidence
- Reuse all existing infrastructure (normalizer, buildContextPrefix, copilotClient) rather than building new

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope (auto-mode context generation)

</deferred>

---

*Phase: 10-orchestrate-endpoint-evaluation*
*Context gathered: 2026-02-21*
