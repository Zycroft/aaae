# Agentic Copilot Chat App

## What This Is

A production-ready monorepo (React + Node) that delivers a responsive, authenticated chat experience powered by Microsoft Copilot Studio (Microsoft 365 Agents SDK) and Adaptive Cards. Users sign in via Entra External ID, then have free-form text conversations and submit structured Adaptive Card forms, with all Copilot Studio calls proxied through the Node server so secrets never reach the browser.

v1.0 (MVP) shipped 2026-02-20: full text chat and interactive Adaptive Cards working end-to-end, WCAG 2.2 AA accessible, dark/light theme, responsive from 360px through 1280px.

v1.1 (Polish) shipped 2026-02-20: metadata sidebar with activity timeline and JSON download, GitHub Actions CI with credential-leak and Zod-instance checks, README quick start, and Adaptive Cards authoring playbook.

v1.2 (Auth) shipped 2026-02-21: Entra External ID (CIAM) authentication via MSAL React on the client and JWT validation + org allowlist on the server. UserClaims Zod schema in shared/, fail-closed config, AUTH_REQUIRED=false dev bypass preserved.

v1.3b (Orchestrator Readiness) shipped 2026-02-21: Copilot Studio SDK validated for structured output extraction, context injection, and orchestrator infrastructure. ExtractedPayload schema with 3-surface priority extraction, WorkflowContext injection, POST /api/chat/orchestrate endpoint, and SDK-EVALUATION.md with CONDITIONAL GO for v1.5.

v1.4 (Persistent State Store) shipped 2026-02-22: Redis-backed conversation persistence via ioredis with TLS, per-key TTL, sorted-set user index, and pipeline batching. StoredConversation schema with userId/tenantId/timestamps/status/workflow fields, factory pattern for Redis/InMemory selection, health endpoint Redis reporting, JWT claim integration in routes, and Redis error differentiation (503 vs 502). 91 tests, 26/26 requirements.

v1.5 (Workflow Orchestrator + Structured Output Parsing) shipped 2026-02-22: Structured output parser with multi-strategy extraction and Zod validation (.passthrough() for forward compatibility), configurable context builder with max-length truncation, WorkflowOrchestrator service with Redis state persistence (24h sliding TTL), per-conversation locking (SET NX PX + Lua release), context accumulation across turns, ACTION_TO_STEP workflow progression, route integration for all three chat endpoints, backward compatibility preserved for unstructured responses. 147 tests, 25/25 requirements.

v1.6 (Dynamic Step-Driven UX) shipped 2026-02-22: Client-only milestone making the UI workflow-aware. WorkflowState schema extended with UX fields (progress, suggestedInputType, choices), useChatApi hook tracks workflowState with SET_WORKFLOW_STATE/RESET_CONVERSATION actions, WorkflowProgress bar with determinate/indeterminate modes, phase dividers and orchestrator status messages in transcript, ChatInput dynamic modes (choice pills, confirmation Yes/No, disabled state with free-text fallback), WorkflowComplete view with collected data summary and JSON download, MetadataPane Workflow Data section with dot-notation flattening. Full integration test covering lifecycle with 2 phase transitions and 2 input modes. 173 tests, 30/30 requirements.

## Core Value

Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected, authenticated via Entra External ID.

## Requirements

### Validated

- ✓ Monorepo scaffold with npm workspaces (client/, server/, shared/) — v1.0
- ✓ TypeScript configured across all three workspaces — v1.0
- ✓ `npm run dev` starts client and server concurrently — v1.0
- ✓ `npm test` runs Vitest across both packages — v1.0
- ✓ `.env.example` files with all required placeholder variables — v1.0
- ✓ ESLint and Prettier configured and passing — v1.0
- ✓ Shared Zod schema for NormalizedMessage type — v1.0
- ✓ Shared Zod schemas for all three API endpoint request/response shapes — v1.0
- ✓ Zod installed in shared/ only (single instance, no hoisting) — v1.0
- ✓ TypeScript types inferred from Zod schemas, exported from shared/ — v1.0
- ✓ Express server with TypeScript on Node 20+ — v1.0
- ✓ POST /api/chat/start → { conversationId } — v1.0
- ✓ POST /api/chat/send → normalized messages — v1.0
- ✓ POST /api/chat/card-action → validates allowlist, forwards to Copilot — v1.0
- ✓ CopilotStudioClient as module-level singleton (server-side only) — v1.0
- ✓ Response normalizer: Activity[] → NormalizedMessage[] with hybrid turn support — v1.0
- ✓ Card action allowlist enforcement server-side (rejects disallowed actions) — v1.0
- ✓ Action.OpenUrl domain allowlist enforced server-side — v1.0
- ✓ CORS configured for client origin only — v1.0
- ✓ Unit tests for response normalizer (text, card, hybrid) — v1.0
- ✓ Unit tests for card action allowlist validator — v1.0
- ✓ Responsive layout: split-pane ≥768px / single-column ≤767px (360–1280px verified) — v1.0
- ✓ Chat transcript renders text messages as user/assistant bubbles — v1.0
- ✓ Optimistic user message bubble on send — v1.0
- ✓ Loading skeleton while awaiting server response — v1.0
- ✓ Error toast on network/server error — v1.0
- ✓ Adaptive Cards rendered via custom useRef/useEffect wrapper (adaptivecards v3) — v1.0
- ✓ AdaptiveCardMessage hooks onExecuteAction, calls /api/chat/card-action — v1.0
- ✓ Submitted card immediately disabled with pending state — v1.0
- ✓ useChatApi hook centralizes start/send/cardAction with retry — v1.0
- ✓ Transcript chip distinguishes user messages from card-submit summaries — v1.0
- ✓ Dark/light theme toggle with localStorage persistence — v1.0
- ✓ Fluid typography with CSS clamp(); spacing scale tokens as CSS custom properties — v1.0
- ✓ prefers-reduced-motion: transitions/animations disabled when set — v1.0
- ✓ ARIA live region on transcript (aria-live="polite") for screen readers — v1.0
- ✓ All interactive elements keyboard-navigable with visible focus states — v1.0
- ✓ GitHub Actions workflow: lint + tests on push/PR, credential-leak check (COPILOT_[A-Z_]*=), Zod-instance check — v1.1
- ✓ Timeline sidebar (desktop): MetadataPane shows adaptiveCard messages in chronological order — v1.1
- ✓ Activity log download: exports full conversation as dated JSON with exportedAt/messageCount — v1.1
- ✓ README: monorepo quick start, full env var table (10 vars), project structure, security notes — v1.1
- ✓ docs/adaptive-card-playbook.md: 4-step card registration guide, allowlist wiring, test pattern — v1.1
- ✓ docs/cards/feedback-survey.json: sample Adaptive Card v1.5 with ChoiceSet and Action.Submit — v1.1
- ✓ Shared auth types (UserClaims schema) in shared/ — v1.2
- ✓ AUTH_REQUIRED=false bypass preserved for local dev — v1.2
- ✓ Environment variables documented in .env.example files — v1.2
- ✓ Server validates JWT access tokens (signature, audience, issuer, expiry) — v1.2
- ✓ Org Allowlist blocks requests from disallowed tenants (403) — v1.2
- ✓ Unit tests for JWT validation and Org Allowlist middleware — v1.2
- ✓ Client authenticates users via MSAL React against Entra External ID (CIAM) — v1.2
- ✓ Sign-out clears MSAL cache and returns to sign-in page — v1.2
- ✓ Token refresh happens silently (no mid-conversation logouts) — v1.2
- ✓ Server extracts structured JSON from activity.value, activity.entities, and text-embedded responses — v1.3b
- ✓ ExtractedPayload Zod schema validates all extraction surfaces with confidence level — v1.3b
- ✓ activityNormalizer populates extractedPayload on NormalizedMessage — v1.3b
- ✓ SendMessageRequest accepts optional workflowContext (step, constraints, collectedData) — v1.3b
- ✓ Server injects workflowContext as structured prefix into outbound Copilot messages — v1.3b
- ✓ Context injection tested with live Copilot agent without breaking responses — v1.3b
- ✓ WorkflowState type defined in shared schema — v1.3b
- ✓ POST /api/chat/orchestrate endpoint with messages + extractedPayload + latencyMs — v1.3b
- ✓ Conversation continuity verified across 3+ SDK turns — v1.3b
- ✓ Latency baselines measured (startConversation, sendMessage, full round-trip) — v1.3b
- ✓ SDK-EVALUATION.md with CONDITIONAL GO recommendation for v1.5 — v1.3b
- ✓ StoredConversation Zod schema with userId, tenantId, timestamps, status, workflow fields — v1.4 Phase 11
- ✓ Backward-compatible defaults for StoredConversation (old records deserialize without error) — v1.4 Phase 11
- ✓ ConversationStore interface with listByUser(userId) method — v1.4 Phase 11
- ✓ InMemoryConversationStore with secondary userId index for efficient queries — v1.4 Phase 11
- ✓ Store factory pattern selecting Redis or InMemory based on REDIS_URL — v1.4 Phase 11
- ✓ Server logs active store backend on startup ([STORE] prefix) — v1.4 Phase 11
- ✓ RedisConversationStore with ioredis: TLS (rediss://), per-key TTL (24h), commandTimeout (5s) — v1.4 Phase 12
- ✓ Sorted-set secondary index for user-scoped queries (ZADD/ZREM/ZREVRANGEBYSCORE) — v1.4 Phase 12
- ✓ Pipeline batching for atomic SET + ZADD + EXPIRE operations — v1.4 Phase 12
- ✓ Factory validates rediss:// scheme at startup (process.exit on non-TLS) — v1.4 Phase 12
- ✓ GET /health reports Redis connectivity (connected/disconnected/not_configured) — v1.4 Phase 12
- ✓ ioredis retryStrategy with exponential backoff and [STORE] logging — v1.4 Phase 12
- ✓ RedisStore unit tests with ioredis-mock (14 tests, no external Redis) — v1.4 Phase 12
- ✓ server/.env.example documents REDIS_URL, REDIS_TTL, REDIS_TIMEOUT — v1.4 Phase 12
- ✓ Chat routes extract userId (oid) and tenantId (tid) from JWT claims — v1.4 Phase 13
- ✓ Orchestrate route uses JWT claims for both initial and history store calls — v1.4 Phase 13
- ✓ AUTH_REQUIRED=false uses STUB_USER (oid='local-dev-oid', tid='local-dev-tenant') — v1.4 Phase 13
- ✓ Factory pattern unit tests (InMemoryConversationStore, 7 tests) — v1.4 Phase 13
- ✓ Route handlers return 503 for Redis errors vs 502 for Copilot Studio errors (isRedisError utility) — v1.4 Phase 14
- ✓ isRedisError() detects redis-errors hierarchy by name + network error codes (16 test cases) — v1.4 Phase 14

- ✓ Multi-strategy structured output parser with Zod validation + .passthrough() forward compatibility — v1.5
- ✓ Configurable context builder with preamble template and max-length truncation — v1.5
- ✓ Redis-backed workflow state store with 24h sliding TTL and per-conversation distributed locking — v1.5
- ✓ WorkflowOrchestrator service with full per-turn loop and DI constructor — v1.5
- ✓ All three chat routes delegate to orchestrator with backward-compatible workflowState field — v1.5
- ✓ 147 tests passing, 25/25 v1.5 requirements verified — v1.5

- ✓ WorkflowState Zod schema extended with v1.6 UX fields (progress, suggestedInputType, choices) — v1.6 Phase 19
- ✓ All workflowState fields nullable/optional for backward compatibility — v1.6 Phase 19
- ✓ useChatApi hook exposes workflowState and resetConversation() — v1.6 Phase 19
- ✓ chatApi return types include optional workflowState on all three API functions — v1.6 Phase 19
- ✓ No hardcoded workflow phases in client code — all data flows from server — v1.6 Phase 19
- ✓ Client without workflowState behaves identically to v1.1 (COMPAT-01) — v1.6 Phase 19
- ✓ WorkflowProgress component shows phase label + determinate/indeterminate progress bar (PROG-01, PROG-02) — v1.6 Phase 20
- ✓ WorkflowProgress hides with no layout shift when inactive, animates transitions (PROG-03) — v1.6 Phase 20
- ✓ ChatShell passes workflowState to child components (SHELL-01) — v1.6 Phase 20
- ✓ ChatShell shows error state with retry when workflowState.status is 'error' (SHELL-02) — v1.6 Phase 20
- ✓ Phase dividers in transcript at currentPhase transitions (TRANS-01) — v1.6 Phase 20
- ✓ Orchestrator status messages as centered muted text (TRANS-02) — v1.6 Phase 20
- ✓ New components responsive + theme-aware (COMPAT-03) — v1.6 Phase 20
- ✓ Unit tests for WorkflowProgress component (TEST-01) — v1.6 Phase 20
- ✓ ChatInput dynamic modes: choice pills, confirmation Yes/No, disabled/none state (INPUT-01 through INPUT-05) — v1.6 Phase 21
- ✓ WorkflowComplete component with collected data summary, reset button, download button (COMPL-01 through COMPL-03) — v1.6 Phase 21
- ✓ MetadataPane Workflow Data section with dot-notation flattening and JSON viewer toggle (META-01, META-02) — v1.6 Phase 21
- ✓ Unit tests for ChatInput modes (TEST-02) and WorkflowComplete (TEST-03) — v1.6 Phase 21
- ✓ Integration test: full workflow lifecycle simulation with 2 phase transitions, 2 input modes, and reset verification (TEST-04) — v1.6 Phase 22
- ✓ 30/30 v1.6 requirements verified green — v1.6 Phase 22

- ✓ LlmProvider interface with startSession/sendMessage/sendCardAction returning NormalizedMessage[] — v1.7 Phase 23
- ✓ LLM_PROVIDER env var with conditional provider validation (Copilot or OpenAI) — v1.7 Phase 23
- ✓ OPENAI_API_KEY required only when LLM_PROVIDER=openai, Copilot vars only when LLM_PROVIDER=copilot — v1.7 Phase 23
- ✓ CopilotProvider wraps CopilotStudioClient behind LlmProvider interface — v1.7 Phase 24
- ✓ Existing copilot.ts, activityNormalizer.ts, structuredOutputParser.ts byte-for-byte unchanged — v1.7 Phase 24

### Active

## Current Milestone: v1.7 OpenAI Dev/Demo Backend

**Goal:** Add OpenAI as an alternative LLM backend so the app runs without Copilot Studio credentials — for dev onboarding, demos, and testing.

**Target features:**
- LlmProvider interface abstracting Copilot and OpenAI backends
- CopilotProvider extraction (pure refactor, zero behavioral change)
- Orchestrator refactored to depend on LlmProvider, not CopilotStudioClient
- OpenAI provider with chat completions + structured output
- Provider factory with config-driven lazy loading
- Conditional config validation (each provider requires only its own env vars)
- 3-env-var minimal dev setup (LLM_PROVIDER=openai, OPENAI_API_KEY, AUTH_REQUIRED=false)

### Out of Scope

- MSAL Node OBO flow (calling downstream APIs as user) — v1.2 server only validates incoming tokens; Copilot Studio uses its own credentials
- Deployment infrastructure (Azure Functions, APIM) — documented but not wired
- Direct browser → Copilot Studio calls — violates security requirement
- Mobile native app — web-first, mobile is a future milestone
- Real-time multi-user conversations — single-user sessions for v1
- `adaptivecards-react` package — incompatible with React 18; custom wrapper used instead
- Server-Sent Events (SSE) streaming — v2 (PERF-01)
- Markdown rendering in text messages — v2 (CARD-01)
- Quick-reply chips from suggestedActions — v2 (CARD-02)

## Context

**Current state (v1.6 shipped):** 22 phases, 9 plans shipped in v1.6 (Phases 19–22). Full-stack monorepo with authenticated chat UI, Copilot Studio proxy, Adaptive Cards, Redis persistence, workflow orchestration, and dynamic step-driven UX. 173 tests (147 server + 26 client), all passing. Workflow-aware UI: progress bar, phase dividers, dynamic input modes (choice pills, confirmation buttons, disabled state), workflow completion view with data summary and download, MetadataPane workflow data section, and full integration test coverage. 30/30 v1.6 requirements verified.

**Tech stack:**
- Monorepo: npm workspaces (`client/`, `server/`, `shared/`)
- Client: Vite + React 18 + TypeScript + MSAL React v3.x
- Server: Express + Node 20+ + TypeScript + jose (JWT validation)
- Shared: Zod schemas as single source of truth for types (including UserClaims)
- Auth: Entra External ID (CIAM) via @azure/msal-browser + @azure/msal-react
- Adaptive Cards: `adaptivecards` v3 JS SDK with custom React wrapper (not `adaptivecards-react`)

**Tech debt carried forward:**
- Missing VERIFICATION.md for Phases 1 & 3 (all code verified functionally; documentation gap only)
- ESLint JSX plugin missing — non-blocking, 3 pre-existing errors in AdaptiveCardMessage.tsx and ChatInput.tsx
- Context builder maxLength 2000 chars default — needs live validation with real Copilot workloads

## Constraints

- **Tech Stack**: React 18 + Vite, Node 20+, Express, TypeScript throughout — no switching to Next.js SSR
- **Security**: Copilot Studio client must never be invoked from the browser; all calls server-side
- **Compatibility**: Adaptive Cards version 1.5 format; must support mobile (360px) through widescreen (1280px+)
- **Auth**: @azure/msal-react pinned to v3.x until React 19 migration

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Monorepo with npm workspaces | Shared types between client/server without a separate publish step | ✓ Good — single Zod instance confirmed, types shared cleanly |
| Zod for shared schema validation | Runtime validation + TypeScript types from one source | ✓ Good — hoisting prevented by declaring in shared/ only |
| Express over Fastify | Wider ecosystem familiarity; simpler middleware for auth stubs | ✓ Good — no friction during implementation |
| Card action allowlist enforcement | Security — prevent arbitrary actions from Adaptive Card payloads | ✓ Good — 403 on disallowed actions verified in UAT |
| Custom adaptivecards v3 wrapper (not adaptivecards-react) | adaptivecards-react is React 18 incompatible | ✓ Good — custom useRef/useEffect wrapper worked cleanly |
| CSS custom properties for theming | Runtime theme switching without JS overhead | ✓ Good — dark/light toggle + localStorage persistence works |
| COPILOT_[A-Z_]*= grep pattern for CI | Catches credential assignments without false-positiving on code identifiers | ✓ Good — correctly distinguishes COPILOT_TENANT_ID= from CopilotStudioClient |
| npm ls zod --depth=Infinity | Enforces single Zod instance across full workspace tree, not just direct deps | ✓ Good — would catch hoisted duplicates that --depth=0 would miss |
| MetadataPane as prop-receiving component | No new hook needed; ChatShell already owns message state | ✓ Good — clean composition, simple to test |
| Entra External ID (CIAM) over standard Entra ID | CIAM uses `ciamlogin.com` authority URLs; designed for customer-facing apps | ✓ Good — clean separation from internal tenant |
| oid required in UserClaims (not optional) | Stable Azure AD object ID always present in Entra External ID tokens | ✓ Good — needed for user identity in JWT middleware |
| Fail-closed AZURE_CLIENT_ID guard at startup | process.exit(1) when AUTH_REQUIRED=true but AZURE_CLIENT_ID missing | ✓ Good — no silent passthrough possible |
| ALLOWED_TENANT_IDS parsed to string[] at config load | Avoids repeated split in middleware; filter(Boolean) removes empty strings | ✓ Good — clean for Phase 6 consumption |
| jose over jsonwebtoken+jwks-rsa | Pure ESM, built-in JWKS caching/rotation, typed errors map to our error codes | ✓ Good — v6 errors namespace needed adaptation but clean |
| createRemoteJWKSet called once at module load | jose handles JWKS caching and key rotation internally | ✓ Good — no per-request overhead |
| Synchronous orgAllowlist middleware | Array.includes on in-memory string[] — no async needed | ✓ Good — simple and fast |
| @azure/msal-react v3.x (not v5) | v5 requires React 19; v3.0.26 is last React 18-compatible release | ✓ Good — pinned, no upgrade needed until React 19 migration |
| sessionStorage for MSAL token cache | Tokens tab-scoped, cleared on tab close; safer than localStorage | ✓ Good — no cross-tab leakage |
| AuthGuard 3-phase state machine | Skeleton → SignIn → Chat; checks InteractionStatus.None before rendering | ✓ Good — prevents redirect loops |
| Token-as-parameter pattern for chatApi | chatApi functions accept token string; acquisition stays in ChatShell | ✓ Good — clean separation, hook stays testable |
| ExtractedPayload.data refine (empty object rejection) | Prevents phantom extractions at the schema level | ✓ Good — catches zero-field data at parse time |
| Priority chain extraction (value > entities > text) | Highest confidence source wins; avoids redundant extraction | ✓ Good — clean and deterministic |
| Entity type key omission in extraction | Entity `type` field is SDK noise; useful data is in other keys | ✓ Good — cleaner payloads |
| WorkflowContext as optional field on SendMessageRequest | Backwards-compatible extension; existing callers unaffected | ✓ Good — zero breaking changes verified |
| [WORKFLOW_CONTEXT] delimited prefix format | Structured text prefix for Copilot agent to parse; minimizes token overhead | ✓ Good — compact format, agent-parseable |
| Separate CopilotStudioClient per spike scenario | Avoid state cross-contamination between small/large context tests | ✓ Good — clean isolation |

| WorkflowState schema for multi-turn state tracking | Per-conversation state (step, collectedData, lastRecommendation, turnCount) with LRU-backed store | ✓ Good — mirrors ConversationStore pattern |
| Orchestrate endpoint starts fresh conversation per request | Simplifies orchestrator use; no pre-start needed | ✓ Good — batteries-included single call |
| CONDITIONAL GO vs absolute GO | Latency + context injection live measurements pending credentials; code architecture is complete | ✓ Good — honest assessment, clear conditions |
| Arrow function form for Zod datetime defaults | `.default(() => new Date().toISOString())` evaluated at parse time per record, not once at schema definition | ✓ Good — each old record gets unique timestamp |
| sdkConversationRef as z.unknown() | Live SDK object never serialized to Redis; only conversationId string stored | ✓ Good — avoids class instance serialization issues |
| Factory pattern for store selection | REDIS_URL drives selection; no silent fallback, no dual stores | ✓ Good — clean, testable, single responsibility |
| RedisStore stub throws on all methods | Prevents silent misuse before Phase 12 implements real Redis operations | ✓ Good — fail-loud behavior |
| Secondary userId index in InMemoryStore | Map<userId, Set<externalId>> enables O(1) listByUser without full-scan | ✓ Good — mirrors Redis sorted-set approach |
| Named import `{ Redis }` from ioredis | NodeNext module resolution requires named export, not default import | ✓ Good — avoids TS2709 namespace-as-type error |
| Pipeline for atomic SET + ZADD + EXPIRE | Reduces round trips, ensures consistency between conversation key and user index | ✓ Good — atomic operations, pipeline error checking |
| User index TTL = conversation TTL + 1 hour | Prevents orphaned sorted-set entries when conversation key expires | ✓ Good — graceful degradation on TTL mismatch |
| sdkConversationRef destructured before serialize | Live SDK object excluded from JSON.stringify; Zod parse on deserialize | ✓ Good — clean separation of serializable vs. runtime state |
| Health endpoint `not_configured` state | Three states: connected/disconnected/not_configured — InMemory mode is not "disconnected" | ✓ Good — clear operator observability |
| Exclude test files from tsc build | `"exclude": ["src/**/*.test.ts", "src/**/__tests__/**"]` — vitest handles test compilation | ✓ Good — fixes @types/ioredis-mock NodeNext incompatibility |
| ioredis-mock flushall() in beforeEach | ioredis-mock instances share global data store — must flush between tests | ✓ Good — test isolation without side effects |
| req.user.oid as userId, req.user.tid as tenantId | Azure AD oid is stable unique identifier; tid identifies tenant for multi-tenancy | ✓ Good — matches auth schema (UserClaims.oid, UserClaims.tid) |
| Optional chaining with fallback (`req.user?.oid ?? 'anonymous'`) | Defensive coding even though auth middleware guarantees req.user | ✓ Good — safe against edge cases |
| Factory tests use InMemoryConversationStore directly | Avoids config.ts side effects (process.exit) when importing factory singleton in test | ✓ Good — tests store behavior without env dependency |
| Name-based Redis error detection (err.name) over instanceof | ioredis v5 does not export TimeoutError; redis-errors package hierarchy detectable via error name | ✓ Good — more comprehensive, covers 7 error classes |
| CopilotStructuredOutputSchema all fields optional + .passthrough() | Forward compatibility — Copilot responses may evolve, unknown fields should not break validation | ✓ Good — allows schema evolution without code changes |
| Parser operates on NormalizedMessage[] not raw Activity[] | Reuse extractedPayload from activityNormalizer rather than re-extracting | ✓ Good — single responsibility, avoids redundant extraction |
| ParsedTurn three-kind discriminated union (structured/passthrough/parse_error) | Distinguish "no data found" from "data found but invalid" — enables observability | ✓ Good — orchestrator can route decisions based on kind |
| Context builder default maxLength 2000 chars | Conservative estimate for Copilot token budget; configurable for tuning | TBD — needs live validation |
| String .replace() for preamble placeholders (not regex) | Safe for literal values with special characters (braces, $ signs) | ✓ Good — no injection issues |

| Nullable-optional pattern for v1.6 UX fields | z.number().nullable().optional() for progress (null = indeterminate, undefined = absent) | ✓ Good — clean backward compat, 9 new tests pass |
| SET_WORKFLOW_STATE dispatched after success actions | Messages update atomically first, then workflow state — prevents UI flicker | ✓ Good — clean ordering |
| RESET_CONVERSATION uses spread of initialState | Future state additions automatically cleared — no risk of stale fields | ✓ Good — forward-compatible |
| WorkflowProgress returns null for non-active status | Error state handled by ChatShell separately (SHELL-02) — separation of concerns | ✓ Good — clean responsibility split |
| Bot messages tagged with currentPhase from API response | Tag at dispatch time using response data, not reducer state (which has previous phase) | ✓ Good — correct phase association |
| jest.config.cjs (CommonJS) for client workspace | ts-node not installed; .ts config requires ts-node; .cjs works natively | ✓ Good — minimal dependency |
| renderToStaticMarkup for client unit tests | @testing-library/react not available; renderToStaticMarkup provides pure HTML assertions | ✓ Good — zero additional deps needed |
| Choice pills above textarea (not inline/below) | Pills visible before user starts typing; natural flow: see options → decide → type or click | ✓ Good — consistent with CONTEXT.md decisions |
| WorkflowComplete replaces transcript+input (not overlay) | Clean completion state; no stale transcript visible behind overlay | ✓ Good — uses flex layout, no z-index issues |
| flattenData with dot-notation for nested objects | Intuitive display (address.street) up to 3 levels; deeper gets "View full data" JSON toggle | ✓ Good — handles arbitrary depth gracefully |
| Confirmation Yes pill uses choicePillPrimary class | Visual hierarchy: primary action (Yes) stands out from neutral (No) | ✓ Good — consistent with existing button patterns |
| Exported reducer/initialState from useChatApi for integration testing | Avoids MSAL mocking; tests reducer state transitions + component rendering directly | ✓ Good — clean separation, no behavioral change |
| LlmProvider methods return Promise<NormalizedMessage[]> | Implementations normalize internally; callers never see raw SDK types | ✓ Good — clean provider abstraction |
| LLM_PROVIDER defaults to 'copilot' | Existing deployments without new env var continue unchanged | ✓ Good — full backward compatibility |
| Conditional env var validation per provider | Copilot vars only required for copilot, OpenAI vars only for openai | ✓ Good — fail-loud on missing vars |
| COPILOT_ fields use `?? ''` instead of `!` assertion | Validation is now conditional so `!` assertion is unsafe | ✓ Good — no runtime assertion errors |
| CopilotProvider constructor injection | Accepts CopilotStudioClient via constructor, not module-level import | ✓ Good — enables unit testing with mocks |
| sendCardAction passes actionValue as activity.value | Direct delegation with empty text string | ✓ Good — consistent with existing card-action route logic |

---
*Last updated: 2026-02-24 after Phase 24 (CopilotProvider Extraction)*
