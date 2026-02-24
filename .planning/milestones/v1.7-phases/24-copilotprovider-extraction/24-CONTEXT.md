# Phase 24: CopilotProvider Extraction - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Wrap existing Copilot Studio SDK code behind the `LlmProvider` interface from Phase 23. This is a pure refactor — zero behavioral change. The existing `copilot.ts`, `activityNormalizer.ts`, and `structuredOutputParser.ts` files must remain byte-for-byte unchanged. All pre-existing tests must pass with zero changes to test files.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation decisions are delegated — this is a straightforward extraction refactor with clear constraints from ROADMAP.md success criteria:

- **Singleton wiring** — How CopilotProvider consumes the existing CopilotStudioClient singleton from copilot.ts (wrapping, injection, or reference). Claude decides based on current codebase patterns.
- **Method mapping** — How startSession/sendMessage/sendCardAction map to the current route logic and which normalizer/parser code gets called inside vs outside the provider. Claude decides based on reading the existing route handlers.
- **Error passthrough** — Whether CopilotProvider translates SDK-specific errors to generic ones or passes them through unchanged. Claude decides based on how errors are currently handled in routes.

**Hard constraints (from ROADMAP.md — non-negotiable):**
1. `CopilotProvider` class in `server/src/provider/` implements `LlmProvider`
2. All pre-existing server tests pass with zero changes to existing test files
3. `copilot.ts`, `activityNormalizer.ts`, and `structuredOutputParser.ts` are byte-for-byte unchanged

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

*Phase: 24-copilotprovider-extraction*
*Context gathered: 2026-02-24*
