# Phase 16: Workflow Orchestrator Engine - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

A WorkflowOrchestrator service manages the full per-turn loop (load state, enrich query, call Copilot, normalize, parse, update state, save) with atomic Redis state persistence and per-conversation sequential processing. This phase refactors the existing `/api/chat/orchestrate` route into a proper service layer with Redis-backed state, locking, and expanded response shape. Parser (Phase 15) and context builder are inputs; route integration (Phase 17) is downstream.

</domain>

<decisions>
## Implementation Decisions

### State lifecycle & expiration
- 24-hour TTL on workflow state in Redis
- Sliding window: every interaction resets the 24h clock — actively-used workflows never expire
- Each conversation has its own independent workflow state — users can have multiple active workflows simultaneously (keyed by conversationId, scoped to userId+tenantId)
- Explicit end/complete behavior is Claude's discretion (TTL as the safety net either way)

### Lock contention behavior
- Claude's discretion on whether to queue-with-timeout or fail-fast (409) for concurrent requests on the same conversation
- Claude's discretion on turn budget (lock timeout duration) based on observed Copilot latency patterns
- Claude's discretion on orphan lock protection strategy (Redis lock TTL recommended)
- Claude's discretion on whether to log lock contention events

### WorkflowResponse shape
- Expand beyond existing `{ conversationId, messages, extractedPayload, latencyMs, workflowState }` shape
- Include **progress indicator**: currentStep, totalSteps, percentComplete — so clients can show progress
- Include **turn metadata**: turn number, whether state changed, what data was collected this specific turn
- Progress tracking is based on **predefined steps** — a workflow definition file (JSON or TS config) lists steps in order, and the orchestrator tracks position against it
- Workflow step definitions live in a **config/definition file** loaded at init, not embedded in WorkflowState

### Error & recovery surface
- **Rollback on failure**: if the Copilot call fails mid-turn, do NOT save state changes — the turn never happened, client can retry cleanly
- **Redis required**: if Redis is down, fail the request with 503 — no in-memory fallback, state consistency is non-negotiable
- Claude's discretion on error verbosity (dev-detailed vs prod-opaque or always-detailed)
- Claude's discretion on whether to emit structured error events or keep to HTTP errors only

### Claude's Discretion
- Lock strategy: queue-with-timeout vs fail-fast, and timeout duration
- Orphan lock protection mechanism
- Lock contention logging/observability
- Explicit workflow end/complete action vs TTL-only cleanup
- Error response detail level
- Structured error events vs HTTP-only errors

</decisions>

<specifics>
## Specific Ideas

- Existing `server/src/routes/orchestrate.ts` already implements a simplified orchestrate loop — the new service should encapsulate and replace this inline logic
- `WorkflowStateStore` interface already exists (`server/src/store/WorkflowStateStore.ts`) — needs a Redis implementation alongside the existing InMemory one
- `buildContextualQuery()` from Phase 15 is the context enrichment function the orchestrator should use
- `parseTurn()` from Phase 15 is the structured output parser the orchestrator should use
- Current store singleton (`server/src/store/index.ts`) comments say "no Redis backing needed for v1.4" — this phase upgrades that

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-workflow-orchestrator-engine*
*Context gathered: 2026-02-22*
