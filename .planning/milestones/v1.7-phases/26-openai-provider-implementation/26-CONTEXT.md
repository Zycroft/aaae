# Phase 26: OpenAI Provider Implementation - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Create `OpenAiProvider` implementing `LlmProvider` using the OpenAI chat completions API. Must support multi-turn conversations with history accumulation, return `NormalizedMessage[]` with structured `extractedPayload` compatible with the existing orchestrator and parser pipeline, and convert card action submits to text-based processing. This is the core new functionality that enables the app to run without Copilot Studio credentials.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation decisions are delegated — Claude designs the provider to match existing orchestrator expectations:

- **System prompt design** — What instructions the OpenAI model receives, how it learns about workflow steps, data collection, and structured response format. Claude designs this to produce outputs compatible with the existing `CopilotStructuredOutputSchema` and orchestrator pipeline.
- **Conversation personality** — Tone and persona for the dev/demo assistant. Claude decides based on what makes sense for a developer onboarding/demo use case.
- **Card action handling** — How Adaptive Card submit actions (which are Copilot-specific) get converted to text descriptions and processed through `sendMessage`. Claude designs the conversion approach.
- **History management** — How per-conversation message history is stored and managed in server memory (`Map<string, ChatMessage[]>` as noted in architecture decisions).
- **Structured output format** — How to use OpenAI's `response_format: json_schema` to produce `extractedPayload` matching the existing contract.

**Hard constraints (from ROADMAP.md — non-negotiable):**
1. `OpenAiProvider` implements `LlmProvider` and returns valid `NormalizedMessage[]` on every call
2. Second message in same conversation includes prior turn in OpenAI request history
3. Structured output includes `extractedPayload` matching existing schema contract
4. Card action submit converted to text description and processed through `sendMessage` without error
5. OpenAI model controlled by `OPENAI_MODEL` env var, defaults to `gpt-4o-mini`

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The provider should produce outputs that work seamlessly with the existing orchestrator pipeline and workflow UX.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 26-openai-provider-implementation*
*Context gathered: 2026-02-24*
