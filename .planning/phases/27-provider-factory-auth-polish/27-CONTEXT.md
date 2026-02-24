# Phase 27: Provider Factory + Auth Polish - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire config-driven backend selection: `LLM_PROVIDER` determines which provider runs at startup. Factory lazy-loads only the selected provider's SDK (Copilot SDK not loaded when using OpenAI). Health endpoint reports active provider and model. The minimal dev setup is 3 env vars: `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, `AUTH_REQUIRED=false`. `shared/` and `client/` have zero changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation decisions are delegated:

- **Health endpoint format** — What fields `GET /health` reports for the active provider (name, model, connection status, etc.). Claude decides based on existing health endpoint patterns and operator observability needs.
- **Startup logging** — What the server logs at startup about the active provider. Claude decides based on existing logging patterns (`[config]`, `[STORE]` prefixes, etc.).
- **Factory pattern** — How the provider factory creates the right provider based on config (dynamic import for lazy-loading, singleton pattern, etc.). Claude decides based on architecture decisions already documented (dynamic imports for lazy-loading).
- **3-env-var dev setup** — Making sure `LLM_PROVIDER=openai` + `OPENAI_API_KEY` + `AUTH_REQUIRED=false` is truly sufficient to start the server and handle requests with no other env vars needed.

**Hard constraints (from ROADMAP.md — non-negotiable):**
1. `LLM_PROVIDER=openai` + `OPENAI_API_KEY` + `AUTH_REQUIRED=false` is sufficient to start the server and handle requests
2. `LLM_PROVIDER=copilot` produces behavior identical to v1.6 baseline
3. `GET /health` response includes `provider` and `model` fields showing active backend
4. `shared/` and `client/` directories have zero modified files
5. Factory imports only the selected provider's SDK at runtime

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 27-provider-factory-auth-polish*
*Context gathered: 2026-02-24*
