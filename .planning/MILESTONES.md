# Milestones

## v1.0 MVP (Shipped: 2026-02-20)

**Phases completed:** 3 phases (1–3), 13 plans
**Timeline:** 2026-02-19 → 2026-02-20 (1 day)
**Git range:** 3fde7ea → 190b712
**Files changed:** 91 files, 20,063 insertions
**Lines of code:** ~2,341 TypeScript/JS

**Key accomplishments:**
1. Monorepo wired with npm workspaces — single Zod instance as shared type source across client, server, and shared packages
2. Secure Express server with fail-closed MSAL auth stub; all Copilot Studio SDK calls proxied server-side (secrets never in browser)
3. Full text chat proxy chain — activity normalizer (Activity[] → NormalizedMessage[]), optimistic user bubbles, 300ms skeleton delay, 3-attempt retry, error toasts
4. Interactive Adaptive Cards rendered via custom adaptivecards v3 React wrapper — submit fires `/api/chat/card-action`, card immediately disabled with pending state
5. WCAG 2.2 AA accessibility — ARIA live region (role='log'), keyboard navigation throughout, visible focus rings, prefers-reduced-motion support
6. Dark/light theme with CSS custom properties + fluid typography (clamp) + responsive split-pane layout from 360px through 1280px

**Requirements:** 37/37 Phase 1–3 requirements complete; 6 Phase 4 requirements deferred (INFRA-07, UI-11, UI-12, DOCS-01, DOCS-02, DOCS-03)

### Known Gaps

Proceeding with known documentation gaps (functional code is complete, all E2E flows pass):

- Phase 1 (01-scaffold-schema-server-foundation): Missing VERIFICATION.md. Phase outputs proven functional through Phase 2 VERIFICATION.md (normalizer runs, schemas validate, server starts, TypeScript clean). 15 requirements marked partial due to absent formal verification artifact.
- Phase 3 (03-adaptive-cards-accessibility-theming): Missing VERIFICATION.md. UAT.md present with 8/8 tests passing, covering all 5 success criteria. 14 requirements marked partial due to absent formal VERIFICATION.md.

---


## v1.1 Polish (Shipped: 2026-02-20)

**Phases completed:** Phase 4 (1 phase, 3 plans, 5 tasks)
**Timeline:** 2026-02-20 (1 day)
**Requirements:** UI-11, UI-12, INFRA-07, DOCS-01, DOCS-02, DOCS-03 (6/6 complete)

**Key accomplishments:**
1. MetadataPane React component — activity timeline sidebar filtering adaptiveCard messages into numbered `<ol>`, plus dated JSON download button with memory-safe `URL.revokeObjectURL`
2. GitHub Actions CI — two parallel jobs: `lint-test` (npm ci → lint → test) and `security-checks` (COPILOT credential leak grep + single Zod instance validation via `--depth=Infinity`)
3. README.md (133 lines) — numbered quick start, complete 10-variable env table covering both workspaces, project structure, security notes
4. docs/adaptive-card-playbook.md (207 lines) — 4-step card registration guide (choose ID → create JSON → register allowlist → write test), enabling card authors to add cards without reading source
5. docs/cards/feedback-survey.json — working Adaptive Card v1.5 sample with `Input.ChoiceSet` and `Action.Submit` with `cardId` in data payload

---


## v1.2 Entra External ID Authentication (Shipped: 2026-02-21)

**Phases completed:** 3 phases (5–7), 7 plans
**Timeline:** 2026-02-20 → 2026-02-21
**Git range:** 30c5918 → c14184e
**Files changed:** 50 files, 4,886 insertions, 97 deletions
**Requirements:** 24/24 complete

**Key accomplishments:**
1. UserClaims Zod schema in shared/ with sub/tid/oid (required) and email/name (optional) — single source of truth for decoded JWT claims across workspaces
2. Fail-closed AZURE_CLIENT_ID guard — server exits at startup if AUTH_REQUIRED=true but credentials are missing; AUTH_REQUIRED=false bypass preserved for local dev
3. JWT validation middleware using jose with JWKS caching — typed error handling for expired, wrong-audience, wrong-issuer, and unsigned tokens (401 + WWW-Authenticate)
4. Synchronous org allowlist middleware — checks tenant ID against ALLOWED_TENANT_IDS with fail-closed behavior (empty allowlist denies all), 403 on disallowed tenants
5. MSAL React sign-in gate with AuthGuard 3-phase state machine (skeleton → sign-in → chat), sessionStorage token cache, pinned to @azure/msal-react v3.x for React 18 compatibility
6. Bearer token injection on all chat API endpoints with silent token acquisition (acquireTokenSilent + loginRedirect fallback) and sign-out button clearing MSAL cache

---


## v1.3b Copilot Studio SDK: Orchestrator Readiness (Shipped: 2026-02-21)

**Phases completed:** 3 phases (8–10), 9 plans
**Timeline:** 2026-02-21 (1 day)
**Git range:** b36a8cb → 50192db
**Files changed:** 21 files, 1,667 insertions, 8 deletions
**Requirements:** 19/19 fulfilled

**Key accomplishments:**
1. ExtractedPayload Zod schema with 3-surface priority extraction engine (activity.value > entities > text-embedded JSON) — 20 new extraction tests, all 14 pre-existing normalizer tests pass
2. WorkflowContext schema + server context injection — structured [WORKFLOW_CONTEXT] prefix injected into outbound Copilot messages via /send route, backwards-compatible (optional field)
3. 3-turn context injection spike script validating multi-turn conversation continuity at 500-char and 1000-char context sizes
4. Latency baseline spike script measuring startConversation, sendMessage, and full round-trip (5 samples each, ready for real credentials)
5. WorkflowState schema + LRU-backed InMemoryWorkflowStateStore for per-conversation orchestrator state tracking
6. POST /api/chat/orchestrate endpoint — batteries-included single call starting conversation, sending query with optional context, returning messages + extractedPayload + latencyMs + workflowState
7. SDK-EVALUATION.md with CONDITIONAL GO recommendation for v1.5 Workflow Orchestrator — all code infrastructure complete, pending live credential validation

---


## v1.4 Persistent State Store (Shipped: 2026-02-22)

**Phases completed:** 4 phases (11–14), 6 plans
**Timeline:** 2026-02-21 → 2026-02-22 (1 day)
**Git range:** 939a6d9 → 3c59adc
**Files changed:** 51 files, 7,558 insertions, 619 deletions
**Requirements:** 26/26 complete (RESIL-01 gap closed by Phase 14)

**Key accomplishments:**
1. StoredConversation Zod schema in shared/ with userId, tenantId, ISO timestamps, lifecycle status, and optional workflow fields — backward-compatible defaults for existing records via Zod .default() chains
2. ConversationStore factory pattern — REDIS_URL drives Redis/InMemory selection with startup logging, no silent fallback, fail-hard on Redis unavailability
3. RedisConversationStore with ioredis: TLS (rediss://), per-key TTL (24h default), commandTimeout (5s default), pipeline batching (atomic SET + ZADD + EXPIRE), sorted-set secondary index for user-scoped queries
4. Health endpoint reports Redis status (connected/disconnected/not_configured) — three-state observability for operators; 14 unit tests via ioredis-mock
5. Chat routes extract userId (oid) and tenantId (tid) from JWT claims; AUTH_REQUIRED=false uses STUB_USER fallback; /send and /card-action preserve fields via spread
6. Redis error differentiation — isRedisError() utility detects redis-errors hierarchy by name + network error codes, route handlers return 503 for Redis failures vs 502 for Copilot Studio errors

---

