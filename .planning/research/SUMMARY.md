# Project Research Summary

**Project:** Agentic Copilot Chat App — React + Node monorepo with Microsoft Copilot Studio & Adaptive Cards
**Domain:** Enterprise chat UI with conversational AI, persistent state store (v1.4), and workflow orchestration prep (v1.5)
**Researched:** 2026-02-19 (core); 2026-02-21 (Redis v1.4 extension)
**Confidence:** HIGH (stack, features, architecture); MEDIUM-HIGH (pitfalls + Redis integration)

---

## Executive Summary

This is a full-stack chat application that bridges custom React UIs with Microsoft Copilot Studio agents through an Express proxy server. The architecture is well-defined: a React 18 + Vite client sends messages to an Express server, which translates them to the Copilot Studio SDK and normalizes responses through Zod schemas back to the client. The v1.4 milestone adds Redis persistence (Azure Cache for Redis) to replace the in-memory conversation store, enabling multi-instance scaling and preparing for the v1.5 Workflow Orchestrator.

**Recommended approach:** Build in phases that respect architectural dependencies. Foundation first (server scaffold with auth + store interface abstraction), then client UI (chat transcript + Adaptive Card rendering), then enhanced features (metadata sidebar, card action validation). The v1.4 Redis extension is a drop-in replacement via a factory pattern — preserve the ConversationStore interface to minimize route changes.

**Key risks:** (1) DirectLine secrets exposed in the browser — prevent via server-only SDK calls and CI credential scanning. (2) Adaptive Card events destroyed by dangerouslySetInnerHTML — use adaptivecards-react with proper event delegation. (3) Redis silent fallback masking persistence failures — fail loudly with 503, never silently degrade. (4) Card submissions duplicated without pending state or idempotency. (5) Serialization bugs with opaque SDK references and date objects in Redis. All are avoidable with explicit test cases during implementation.

---

## Key Findings

### Recommended Stack

**Node.js 20 LTS** (targets Microsoft SDK v1.2.3+) → **Express 5.x** (stable since 2025, TypeScript support via @types/express ^5.0.6) → **React 18** (ecosystem tested; v19 not yet matched by Copilot integrations) → **Vite 6** (Nov 2024 stable, @tailwindcss/vite plugin eliminates PostCSS config) → **TypeScript 5.8+** (for Node.js type stripping) → **Tailwind CSS 4** (released early 2025).

**Microsoft Integration:** `@microsoft/agents-copilotstudio-client@^1.2.3` (GA Sep 2025, server-side only), `@azure/msal-node@^3.8.7` (MSAL OBO token stubs for v1), `adaptivecards@^3.0.5` + custom React wrapper (avoid abandoned `adaptivecards-react` — use 30-line useRef+useEffect pattern documented in STACK.md).

**State & Validation:** Zod ^3.25.76 pinned in `shared/` (single instance enforced in CI), npm workspaces (built-in monorepo tool per PROJECT.md).

**v1.4 Redis:** `ioredis@^5.9.0` (handles Azure Cache TLS automatically with rediss:// scheme) + `ioredis-mock@^5.11.0` (unit testing without external Redis). Never use legacy `redis` npm package or `redis-mock`.

**Why this stack:** Each technology has HIGH-confidence sources from official Microsoft docs, npm registry, or long-term project sponsorship (e.g., ioredis used at scale by Alibaba). No experimental dependencies. Version pinning and workspace isolation prevent runtime surprises.

### Expected Features

**Table stakes (v1.0 launch):**
- Message bubble transcript (user/bot distinction, required for any chat UI)
- Optimistic user message display + loading skeleton (eliminates perceived broken state)
- Typing indicator + error toasts with inline bubble errors
- Adaptive Card rendering with disabled+pending state after submit (prevents double-submission bug Copilot Studio docs explicitly warn about)
- Hybrid turn rendering (text + card in same bot activity)
- Conversation start / new conversation trigger
- Responsive layout 360px–1280px (PROJECT.md hard requirement)
- Dark/light mode toggle + prefers-color-scheme default (table stakes in 2026)
- Keyboard navigation + ARIA live regions (WCAG 2.2 Level AA, EU legal requirement since June 2025)
- Card action allowlist (client + server validation)
- Normalized Zod message schema (shared/)
- Activity log download (JSON serialization)

**Competitive differentiators (v1.x):**
- Split-pane desktop layout (transcript + metadata drawer) — not available in Copilot Studio default canvas
- Timeline sidebar summarizing card actions (audit trail unique to this product)
- MSAL OBO token flow stubs (architecturally correct placeholder, signals production-readiness)

**Defer to v2+:**
- Conversation history / multi-session persistence (requires DB + identity model; validate demand first)
- Streaming token-by-token responses (Copilot SDK doesn't natively stream; v2 if SDK adds it)
- Suggested replies rendering (depends on Copilot Studio topics producing them reliably)
- Voice input (significant scope increase; browser permissions + audio processing)

**MVP priority:** All P1 items above ship together in v1. v1.x adds P2 items (timeline sidebar, markdown rendering). P3 deferred.

### Architecture Approach

Express singleton receives authenticated requests → ConversationStore abstraction (interface with two implementations: InMemoryStore for dev, RedisStore for v1.4+) → Copilot SDK isolation (server-only, no browser calls) → Activity Normalizer (translates SDK Activities to NormalizedMessage[]) → Zod validation on serialization/deserialization.

**Major components:**

1. **Server scaffold (Express):** CORS + auth middleware (MSAL stubs in v1) → health check → chat routes (/start, /send, /card-action) → store interface (factory pattern selects Redis or InMemory) → Copilot SDK client (singleton, maintains conversation state server-side). No credentials exposed to client.

2. **Client UI (React + Vite):** useChatApi hook (useReducer state machine with optimistic updates, 300ms skeleton delay, 3-attempt retry) → chat transcript → AdaptiveCardRenderer component (useRef+useEffect pattern, not dangerouslySetInnerHTML) → send box. All API calls proxied through server.

3. **Shared schemas (Zod):** NormalizedMessage (id, role, kind, text, cardJson), StoredConversation (v1.4: adds userId, tenantId, createdAt, updatedAt, status), CardActionPayload (validated before forwarding to Copilot).

4. **Redis persistence (v1.4 only):** RedisStore implements ConversationStore interface, primary keys `conversation:{externalId}`, sorted set indexes `user:{userId}:conversations` (for v1.5 feature "list user's conversations"), TTL 30 days on primary key.

**Data flow:** Client chatApi.ts → useChatApi → /api/chat/start|send|card-action → [auth + orgAllowlist middleware] → [conversationStore.get/set] → [Copilot SDK call] → [Activity normalizer] → [JSON response] → client reducer updates transcript.

**Why this architecture:** ConversationStore interface abstraction allows swapping implementations without changing routes (v1 InMemory → v1.4 Redis is a drop-in swap). Singleton Copilot SDK avoids re-initialization per request. Zod at boundary ensures runtime type safety. Optimistic UI + skeleton delays make perceived latency acceptable.

### Critical Pitfalls

1. **DirectLine secret exposed in browser** — Prevention: All SDK calls server-side only. CI scan for `COPILOT_*` vars in client/. Verify no unauthenticated API calls from browser to Copilot Studio. Address in Phase 1 (server scaffold). If exposed: rotate secrets immediately in Copilot Studio Web Channel Security.

2. **Card actions destroyed via dangerouslySetInnerHTML** — Prevention: Use `adaptivecards-react` (or documented custom wrapper) with proper event delegation. Never call `.render()` and inject outerHTML. Address in Phase 2 (card renderer). Verification: click test on first prototype card; confirm Submit button fires network request.

3. **Card double-submission without pending state** — Prevention: After Action.Submit fires, set React state to "submitted" and disable card inputs. Show loading indicator. Server-side idempotency cache recent (conversationId, actionId) pairs. Address in Phase 2 (card UI + API). Verification: double-click Submit, confirm only one network request.

4. **Redis silent fallback masking failures** — Prevention (v1.4): Return 503 Service Unavailable when Redis down, not 200 with stale in-memory data. Implement health check that fails when Redis unavailable. Log every connection error. Never silently retry. Address in Phase 1 (store factory). Impact: prevents data loss and divergence in multi-instance deployments.

5. **Azure Redis TLS misconfiguration** — Prevention (v1.4): Use `rediss://` protocol + port 6380 (not redis:// + 6379). ioredis auto-detects TLS from rediss:// scheme. Add startup validation that rejects azure URLs without rediss://. Test against real Azure Cache. Address in Phase 1 (store factory). Symptoms: connection hangs, "Protocol error: expected '$', got 'H'" (wrong port), intermittent WRONGTYPE errors.

6. **Zod dual-instance from workspace hoisting** — Prevention: Zod declared in shared/ only. CI check: `npm ls zod` must show exactly one version at one path. Add instanceof fallback: check `error.issues` existence instead of instanceof ZodError. Address in Phase 1 (monorepo setup). Verification: run `npm ls zod` immediately after workspace setup.

7. **Serializing opaque sdkConversationRef to Redis** — Prevention (v1.4): Never serialize sdkConversationRef directly (JSON.stringify strips functions and prototypes; deserialized object fails SDK type checks). Store only conversationId string. Reconstruct ref by calling Copilot SDK if needed. Address in Phase 1 (serialization layer). Test: store ref, deserialize, pass to sendMessage() — must not produce "Invalid reference" error.

8. **Date serialization becomes ISO string, not Date object** — Prevention (v1.4): Run all deserialized Redis values through Zod schemas. Use `.pipe(z.coerce.date())` to convert ISO strings back to Date. OR store timestamps as Unix milliseconds (number, never ambiguous). Address in Phase 1 (serialization layer). Verification: store date, retrieve, verify `timestamp instanceof Date` or `typeof timestamp === 'number'`.

---

## Implications for Roadmap

Research suggests a **4-phase structure** that respects both architectural dependencies and feature priority:

### Phase 1: Foundation — Server Scaffold & Store Abstraction
**Rationale:** Everything downstream depends on server-side SDK integration and conversation persistence. Must establish auth middleware (fail-closed, not open), store interface (allows v1→v1.4 swap), and health check. Locks in DirectLine secret isolation. Prevents most critical pitfalls (1, 4, 5, 6, 7, 8).

**Delivers:**
- Express app with CORS + helmet + auth middleware (MSAL token stubs for v1)
- ConversationStore interface + InMemoryStore implementation
- Store factory (`createStore()`) that selects Redis or InMemory based on env
- Copilot SDK singleton + activity normalizer
- /health endpoint (reports auth requirement, v1.4: Redis connectivity)
- Config vars (COPILOT_CLIENT_ID, AUTH_REQUIRED, REDIS_URL for v1.4, REDIS_TTL_DAYS)
- .env.example with credential placeholders

**Addresses features:**
- Conversation start (foundation for all others)
- Error handling infrastructure

**Avoids pitfalls:**
- DirectLine secret exposure (server-only calls)
- Process memory conversation loss (interface from day one)
- MSAL token fail-open (explicit AUTH_REQUIRED guard)
- Zod dual-instance (single source in shared/)
- Redis silent fallback (health check + 503 on unavailable)
- Azure Redis TLS (createStore factory validates rediss:// + port 6380)
- Serialization bugs (schema layer ready)

**Research flags:**
- Copilot SDK token refresh timing (30-minute expiry — must refresh before each send or on timer)
- MSAL OBO flow details (v1 stub; v1.2+ real implementation needs tenant authority URL)

**Standard patterns:**
- Express middleware setup (well-documented)
- npm workspaces monorepo structure (established, no research needed)

---

### Phase 2: Client UI — Chat Transcript & Adaptive Card Rendering
**Rationale:** Once server is running, build the UI. Depends on /health and /api/chat/start|send endpoints from Phase 1. Locking in card rendering prevents pitfall #2 early (dangerouslySetInnerHTML). Must include disabled+pending state per Copilot Studio docs (pitfall #3).

**Delivers:**
- React component: ChatTranscript (message bubbles, user/bot distinction, avatars)
- useChatApi hook (useReducer state machine, optimistic user message, 3-attempt retry with exponential backoff, abort signal cleanup)
- AdaptiveCardRenderer component (useRef+useEffect pattern, event delegation working)
- Send box with text input (Enter to send, Shift+Enter for newline)
- Loading skeleton (300ms delay to avoid flicker on fast responses)
- Typing indicator (animated)
- Error toast + inline bubble error state with retry affordance
- Dark/light mode toggle + prefers-color-scheme default (CSS custom properties)
- Reduced-motion respect (skeleton/typing indicator animations suppressed)

**Addresses features (P1 table stakes):**
- Message bubble transcript
- Optimistic user message display + loading skeleton
- Typing indicator
- Error toasts
- Adaptive Card rendering
- Card disabled+pending state after submit
- Hybrid turn rendering (text + card in same message)
- Dark/light mode
- Reduced-motion
- Keyboard navigation (focus management in send box, tab through cards)
- ARIA live regions (transcript container as polite region, announcements for new messages)

**Implements architecture:**
- useChatApi state machine (useReducer) — central state, all async logic
- Component tree (ChatTranscript, AdaptiveCardRenderer, SendBox)

**Avoids pitfalls:**
- dangerouslySetInnerHTML destroying card events (use proper wrapper)
- Card double-submit (pending state + disable inputs)
- Responsive mobile layout (Tailwind breakpoints sm/md/lg map to 360px–1280px)

**Research flags:**
- Adaptive Cards schema version compatibility (1.5 vs 1.3, renderer maxVersion configuration)
- React 18 vs React 19 useOptimistic hook (v1 uses React 18 per PROJECT.md; useOptimistic is React 19 feature, use local state pattern instead)

**Standard patterns:**
- React hooks (well-documented)
- Tailwind responsive design (established)
- Zod runtime validation (used in Phase 1, reuse here)

---

### Phase 3: Enhanced Features — Card Actions, Metadata Sidebar, Audit Trail
**Rationale:** Layers on top of Phase 2. Requires stable card rendering (Phase 2) and server-side card validation (new Phase 3 work). Adds security layer (allowlist) and audit/debugging capability. Split-pane layout is a differentiator vs. Copilot Studio default canvas.

**Delivers:**
- /api/chat/card-action endpoint (server-side Zod validation, card action allowlist enforcement, domain allowlist for Action.OpenUrl)
- Card action allowlist (shared/ schema, server middleware)
- Client-side action validation before submission (defense-in-depth, not sole protection)
- Timeline sidebar (desktop only, ≥768px breakpoint) — lists submitted cards with timestamp, action type, value summary
- Activity log download (JSON serialization of normalized message array)
- Split-pane layout (desktop: transcript left, metadata drawer right; mobile: single column)
- Reduced-motion + accessibility polish (keyboard trap in drawer, focus management)

**Addresses features (competitive differentiators):**
- Split-pane desktop layout + metadata drawer
- Timeline sidebar (audit trail of structured interactions)
- Activity log download (enterprise auditability)
- Card action allowlist (security)

**Implements architecture:**
- Card action routing (client → server validation → Copilot SDK)
- Secondary indexing prep (v1 not needed; v1.4 uses sorted sets for user-scoped queries)

**Avoids pitfalls:**
- Card action allowlist missing or bypassable (server-side Zod validation, explicit action type allowlist)
- Phishing via Action.OpenUrl (domain allowlist)

**Research flags:**
- Card action payload schema (Copilot SDK Activity.channelData structure, what fields can be submitted)
- Timeline sidebar UI patterns (no reference in Copilot Studio; invent a clean design)

**Standard patterns:**
- React drawer/modal patterns (well-documented)
- JSON serialization (built-in)
- Zod array schemas (established)

---

### Phase 4: v1.4 Redis Persistence (Optional Concurrent or Sequential)
**Rationale:** *Can run concurrently with Phases 2–3 or sequentially after Phase 3.* Enabled by Phase 1 ConversationStore abstraction. Adds multi-instance scaling, horizontal deployment support, and v1.5 workflow prep. Drop-in factory-pattern swap: no route changes, ConversationStore interface unchanged.

**Delivers:**
- RedisStore implementation (ioredis client, JSON serialization, sorted set indexes)
- Store factory selection (REDIS_URL env var: set → RedisStore, unset → InMemoryStore)
- Expanded StoredConversation schema (userId, tenantId, createdAt, updatedAt, status)
- Chat route updates (populate new fields from req.user JWT claims)
- Health check enhancement (Redis ping, returns 503 if unavailable)
- ioredis-mock setup (unit testing without external Redis)
- Integration tests (real Azure Cache, or skip if REDIS_URL not set)
- Config vars (REDIS_TIMEOUT_MS, REDIS_TTL_DAYS)
- Migration helper (if needed, cleanse old in-memory data)

**Addresses features:**
- Conversation persistence across process restarts (implicit, not user-visible)
- Foundation for v1.5 "list user's conversations" feature (sorted set indexes)

**Avoids pitfalls (critical for v1.4):**
- Silent fallback masking failures (return 503, never degrade)
- Serializing sdkConversationRef (store conversationId only)
- Date serialization bugs (Zod coercion at deserialization)
- TTL edge cases (GETEX atomic get+extend, expiresAt check in document)
- Connection pool exhaustion (configure poolSize = expected_concurrency * 1.5)
- Dual-write consistency (factory pattern: one store, never both)

**Research flags:**
- Azure Cache for Redis capacity planning (1GB, 10GB, cluster options)
- ioredis pool tuning for expected load (concurrency estimation)
- TTL jitter strategy (avoid thundering herd)

**Standard patterns:**
- ioredis usage (well-documented, Alibaba-sponsored)
- Redis sorted sets (O(log N) queries)
- JSON serialization (built-in)

---

### Phase 5: v1.5 Workflow Orchestrator (Future)
**Rationale:** Depends on v1.4 Redis persistence. Adds structured conversation workflows (e.g., "approval chain", "data extraction pipeline"). Requires workflowId/workflowStep fields already prepared in v1.4 StoredConversation schema.

**Roadmap note:** Not in scope for v1/v1.4. Mentioned for schema planning only.

---

## Phase Ordering Rationale

1. **Phase 1 first (Foundation):** All other phases depend on working server, auth, and ConversationStore abstraction. Locking in the interface allows v1.4 Redis to be a drop-in swap without touching route logic.

2. **Phase 2 follows Phase 1 (UI):** Cannot render messages until server is running and /api endpoints respond. Card rendering must land early to catch pitfall #2 (dangerouslySetInnerHTML).

3. **Phase 3 parallel or after Phase 2 (Enhanced):** Depends on card rendering (Phase 2) and server endpoint work (Phase 1). Can start before Phase 2 ships if /api/chat/card-action is stubbed early.

4. **Phase 4 optional during or after Phase 3 (v1.4 Redis):** Drop-in replacement via factory pattern. Can be introduced mid-development (hot-swap test: start with InMemory, switch to Redis, verify no route changes needed). Recommended to land before production deployment to achieve horizontal scaling.

5. **Phase 5 deferred (v1.5 Workflow):** Schema prepared in v1.4, feature implementation deferred to v1.5 roadmap.

**Why this structure avoids pitfalls:**

- Pitfall #1 (DirectLine exposed): Phase 1 locks in server-only SDK calls + CI credential scan
- Pitfall #2 (card events destroyed): Phase 2 implements proper card renderer
- Pitfall #3 (double-submit): Phase 2 includes disabled+pending state
- Pitfall #4 (Redis fallback): Phase 1 establishes health check; Phase 4 enforces 503, never silent fallback
- Pitfall #5 (Azure TLS): Phase 1 store factory validates rediss:// + port 6380
- Pitfall #6 (Zod dual-instance): Phase 1 monorepo setup + CI check
- Pitfall #7 (sdkConversationRef serialization): Phase 4 schema validation prevents this
- Pitfall #8 (date serialization): Phase 1 Zod setup; Phase 4 coercion on deserialize

---

## Research Flags

### Phases Needing Deeper Research During Planning

**Phase 1 (Foundation):**
- Copilot Studio SDK token acquisition & refresh flow (v1 uses placeholder stubs; v1.2+ needs real MSAL OBO implementation)
- MSAL OBO flow details: authority URL target (specific tenant, not /common), token type validation (access token, not ID token)
- DirectLine token lifecycle (30-minute expiry, refresh mechanism, server-side caching strategy)

**Phase 2 (Client UI):**
- Adaptive Cards schema version compatibility with Copilot Studio responses (maxVersion configuration, parse error handling)
- React 18 optimistic UI patterns (v1 uses local state + reducer, not React 19 useOptimistic)
- Keyboard focus management in card actions (Tab order through dynamic content)

**Phase 3 (Enhanced):**
- Card action payload schema (Copilot SDK Activity.channelData structure — what fields are mutable vs. read-only?)
- Timeline sidebar UI patterns (no reference implementation; design needed)

**Phase 4 (v1.4 Redis):**
- Azure Cache for Redis capacity planning (SKU selection: Basic 1GB, Standard 10GB, Premium with clustering)
- ioredis pool size tuning for expected load (concurrency = concurrent users * request rate)
- Conversation TTL strategy (30 days hardcoded vs. configurable per tenant)

### Phases with Standard Patterns (Skip Detailed Research)

**Phase 1:** Express middleware setup, npm workspaces monorepo structure, Zod schema definitions, TypeScript config — all have abundant documentation and established patterns.

**Phase 2:** React hooks (useState, useReducer, useEffect), Tailwind CSS responsive design, CSS custom properties for theming — well-documented, no research needed.

**Phase 3:** React component composition, JSON serialization, Zod array validation — standard patterns.

**Phase 4:** ioredis documentation is comprehensive; no novel research needed. Focus on testing against real Azure Cache, which is better done in implementation than research phase.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | All recommendations sourced from official Microsoft Learn, npm registry, actively maintained projects (ioredis, Vite, React, Express 5 GA). No experimental dependencies. |
| **Features** | HIGH | Table stakes verified against Microsoft Copilot Studio docs + WCAG 2.2 standards. Differentiators (timeline sidebar, metadata drawer) aligned with PROJECT.md vision. Defer list justified by complexity/demand tradeoff. |
| **Architecture** | HIGH | ConversationStore interface pattern standard (Factory Method, established in TypeScript/Node.js). Redis sorted set indexing (O(log N) lookups) documented. Copilot SDK singleton pattern per Microsoft samples. |
| **Pitfalls** | MEDIUM-HIGH | Core pitfalls (#1–6) sourced from official Microsoft security blog + GitHub issue discussions with maintainers. Redis pitfalls (#11–17) from recent Oneuptime blog (2026) + ioredis docs. Some pitfalls inferred from common patterns (e.g., #3 card double-submit from React async patterns), confidence medium. |
| **v1.4 Redis** | HIGH | ioredis package actively maintained, TLS configuration well-documented (Azure Cache requires rediss:// + 6380). ioredis-mock matches ioredis API, no surprises. |

**Overall confidence:** HIGH for Phase 1–3; HIGH for Phase 4 (if research flags are addressed during planning).

### Gaps to Address

1. **Copilot SDK token refresh timing:** v1 uses placeholder; v1.2+ needs real implementation. Placeholder must log `[AUTH STUB] Token refresh skipped` on every request to avoid silent unauthenticated API. **Mitigation:** Phase 1 planning must validate MSAL OBO docs; consider reaching out to Microsoft for clarification on token cache strategy.

2. **Adaptive Cards schema version mismatch:** Research shows Copilot Studio may return cards with different schema versions than renderer is configured for. **Mitigation:** Phase 2 planning must test with live Copilot Studio agent, verify renderer maxVersion matches.

3. **Card action allowlist registration:** Which action types and fields are security-critical? Phase 3 planning must define allowlist explicitly (e.g., only allow Action.Submit with known `verb` values, only allow Action.OpenUrl with domain in allowlist). **Mitigation:** Collaborative session with Copilot Studio expert to catalog card types in use.

4. **v1.4 capacity planning:** How many conversations per user? What TTL is appropriate? Phase 4 planning must estimate load (concurrent users, message frequency) to size Redis instance (1GB, 10GB, cluster). **Mitigation:** Load testing in Phase 4 planning; start with 1GB (standard tier), monitor, upgrade if needed.

5. **Testing against real Azure Cache:** Unit tests use ioredis-mock (in-memory, no TLS). Phase 4 planning must include integration test against real Azure Cache to validate TLS + port 6380 configuration. **Mitigation:** CI/CD step that runs optional integration tests if REDIS_URL is set (skip if not).

---

## Sources

### Primary Sources (HIGH Confidence)

**Stack Research:**
- Microsoft Learn — CopilotStudioClient API Reference (updated 2025-12-18): Official SDK documentation, API signatures
- Microsoft Learn — Integrate with web/native apps using M365 Agents SDK (updated 2025-12-12): Architecture patterns, recommended practices
- npm `@microsoft/agents-copilotstudio-client` (v1.2.3 GA Sep 2025): Official package, versioning strategy
- npm `ioredis` (v5.9.3 Feb 2026): Actively maintained, TLS + Azure Cache documentation
- Express.js (v5.2.1 stable 2025): Framework stability, TypeScript support
- Vite 6 release blog (Nov 2024): Build tooling stability
- Zod v3 documentation: Runtime validation patterns

**Features Research:**
- Microsoft Copilot Studio — Adaptive Cards overview (official docs, 2025-12-22): Card capabilities
- Microsoft Copilot Studio — Customize default canvas (official docs, 2025-12-19): UI patterns
- Microsoft Teams — Designing Adaptive Cards (official docs, 2025-04-04): Card design best practices
- WCAG 2.2 compliance (W3C, 2024): Accessibility standards, EAA requirements (EU, June 2025)
- BotFramework-WebChat GitHub issue #1427: Card disabled-after-submit pattern

**Architecture Research:**
- Express.js Tutorial — Practical, Scalable Patterns (2026): Pattern recommendations
- Redis Secondary Indexing Patterns (official redis.io docs): Sorted set query patterns
- Factory Method Pattern in TypeScript (Medium, 2025): Design pattern documentation
- ioredis GitHub Repository: Connection pooling, TLS configuration, Azure integration

**Pitfalls Research:**
- Microsoft Security Blog — Top 10 actions to build agents securely with Copilot Studio (Feb 2026): Official security guidance
- Microsoft Learn — Configure web and Direct Line channel security: Token lifecycle, credential management
- GitHub microsoft/AdaptiveCards issues (#6192, #8678, #8505): Card rendering pitfalls
- GitHub AzureAD/microsoft-authentication-library-for-js: MSAL OBO flow gotchas
- GitHub redis/ioredis: Connection handling, TLS + Azure configuration
- Oneuptime blog (2026-02-02, 2026-01-25, 2026-02-25): Redis best practices, caching patterns

### Secondary Sources (MEDIUM Confidence)

- WebSearch consensus on React 18 vs React 19 ecosystem readiness
- npm registry package update histories and community discussions
- Community blog posts on Copilot Studio integration patterns (corroborated with official docs)
- GitHub discussions with maintainers on deprecated features (e.g., adaptivecards-react React 18 support)

### Tertiary Sources (LOWER Confidence, Validation Needed)

- Specific Copilot Studio agent configuration examples (vary by use case; validate during Phase 1 planning)
- Load testing benchmarks for Azure Cache for Redis (highly dependent on SKU and workload; validate during Phase 4)

---

## Integration with Roadmap

This summary informs the roadmap creation as follows:

- **Phase sequence** (Phases 1–5 suggested above) becomes starting point for roadmap planning; roadmapper may adjust based on team capacity and stakeholder priorities.
- **Research flags** identify which phases need deeper `/gsd:research-phase` calls during planning (Phases 1, 2, 3, 4 all have gaps to explore).
- **Confidence assessment** calibrates risk: HIGH confidence areas (stack, core features, architecture) can proceed quickly to requirements; MEDIUM areas (pitfalls, v1.4 details) warrant explicit testing checkpoints.
- **Pitfall-to-phase mapping** (from PITFALLS.md) ensures each phase's plan includes specific test cases to prevent known issues.

---

*Research completed: 2026-02-21*
*Status: Ready for roadmap creation*
