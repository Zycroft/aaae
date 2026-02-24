# Phase 25: Orchestrator Refactor to LlmProvider - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor `WorkflowOrchestrator` to depend on the `LlmProvider` interface instead of `CopilotStudioClient` directly. After this phase, the orchestrator has zero knowledge of Copilot Studio — it accepts any LlmProvider implementation. The Copilot path must continue to work identically (zero behavioral change).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation decisions are delegated — this is a straightforward dependency inversion refactor with clear constraints:

- **DI approach** — How WorkflowOrchestrator receives its LlmProvider (constructor injection, factory, or module-level wiring). Claude decides based on existing orchestrator construction patterns and testability needs.
- **Route wiring** — How Express routes create/access the orchestrator with the correct provider (singleton, per-request, middleware). Claude decides based on current route handler patterns.
- **SDK removal scope** — Which SDK-specific concepts (streaming, activities, raw SDK types) get removed from the orchestrator vs abstracted behind the provider interface. Claude decides based on reading current imports and call sites.

**Hard constraints (from ROADMAP.md — non-negotiable):**
1. `WorkflowOrchestrator.ts` contains no imports from `@microsoft/agents-copilotstudio-client`
2. All existing server tests pass after the refactor (currently 151+)
3. A conversation started via `LLM_PROVIDER=copilot` produces identical responses to the pre-refactor baseline

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The success criteria are the spec.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 25-orchestrator-refactor-to-llmprovider*
*Context gathered: 2026-02-24*
