# Requirements: Agentic Copilot Chat App

**Defined:** 2026-02-19
**Core Value:** Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected.

## v1 Requirements

### Monorepo & Infrastructure

- [x] **INFRA-01**: Monorepo scaffold with npm workspaces: `client/`, `server/`, `shared/` directories
- [x] **INFRA-02**: TypeScript configured across all three workspaces
- [x] **INFRA-03**: `npm run dev` starts client and server concurrently via a root-level script
- [x] **INFRA-04**: `npm test` runs Jest (client) and Vitest (server) across both packages
- [x] **INFRA-05**: `.env.example` files exist for both `client/` and `server/` with all required placeholder variables (`COPILOT_TENANT_ID`, `COPILOT_APP_ID`, `COPILOT_AGENT_IDENTIFIER`, etc.)
- [x] **INFRA-06**: ESLint and Prettier configured and passing across all workspaces
- [ ] **INFRA-07**: GitHub Actions workflow runs lint + tests on push/PR for both packages

### Shared Schema

- [ ] **SCHEMA-01**: Shared Zod schema defines `NormalizedMessage` type (`id`, `role`, `kind: "text" | "adaptiveCard"`, `text?`, `cardJson?`, `cardId?`)
- [ ] **SCHEMA-02**: Shared Zod schema defines request/response shapes for all three API endpoints
- [ ] **SCHEMA-03**: Zod installed as a dependency of `shared/` only (single instance, not hoisted to client/server separately)
- [ ] **SCHEMA-04**: TypeScript types inferred from Zod schemas and exported from `shared/` for use in client and server

### Server — Copilot Proxy

- [ ] **SERV-01**: Express server with TypeScript running on Node 20+
- [ ] **SERV-02**: `POST /api/chat/start` calls `CopilotStudioClient.startConversationStreaming()`, collects activities, returns `{ conversationId }`
- [ ] **SERV-03**: `POST /api/chat/send` accepts `{ conversationId, text }`, calls `sendActivityStreaming()`, normalizes response, returns `{ conversationId, messages: NormalizedMessage[] }`
- [ ] **SERV-04**: `POST /api/chat/card-action` accepts `{ conversationId, cardId, userSummary, submitData }`, validates `submitData.action` against allowlist, forwards to Copilot, returns normalized messages
- [ ] **SERV-05**: `CopilotStudioClient` instantiated as a module-level singleton (server-side only, never in browser)
- [ ] **SERV-06**: Response normalizer converts raw Copilot `Activity` objects to `NormalizedMessage[]`, stripping proprietary fields; handles hybrid turns (text + attachment in one activity)
- [ ] **SERV-07**: Card action allowlist enforced server-side — rejects requests with disallowed `action` values before forwarding to Copilot
- [ ] **SERV-08**: `Action.OpenUrl` domain allowlist enforced server-side
- [ ] **SERV-09**: MSAL OBO token flow stubs with `TODO` comments showing where `tenantId`, `clientId`, `clientSecret`, and `scope` plug in; stubs must fail-closed (reject requests with a visible warning log, default `AUTH_REQUIRED=true`)
- [ ] **SERV-10**: CORS configured for the client origin only (not wildcard)
- [ ] **SERV-11**: Unit tests for the response normalizer (text-only, card-only, hybrid turn cases)
- [ ] **SERV-12**: Unit tests for the card action allowlist validator

### Client — Chat UI

- [ ] **UI-01**: Responsive layout using CSS grid/flex: split-pane (transcript + metadata drawer) on desktop ≥768px, stacked single column on mobile ≤767px; verified at 360px, 768px, 1280px
- [ ] **UI-02**: Chat transcript renders text messages as user/assistant bubbles with role indicator
- [ ] **UI-03**: Optimistic user message bubble appears immediately on send (before server response)
- [ ] **UI-04**: Loading skeleton displayed while awaiting server response
- [ ] **UI-05**: Error toast displayed on network or server error with actionable message
- [ ] **UI-06**: Adaptive Cards rendered via custom `useRef`/`useEffect` wrapper around the `adaptivecards` v3 JS SDK (not `adaptivecards-react`)
- [ ] **UI-07**: `AdaptiveCardMessage` component hooks `onExecuteAction`, extracts `action.data`, and calls `/api/chat/card-action` with `userSummary` derived from `cardId`
- [ ] **UI-08**: Submitted Adaptive Card is immediately disabled and shows a pending state; cannot be resubmitted
- [ ] **UI-09**: `useChatApi` hook centralizes all fetch logic (start, send, cardAction) with retry on transient errors (network timeout, 5xx)
- [ ] **UI-10**: Transcript chip distinguishes user-typed messages from card-submit summaries
- [ ] **UI-11**: Timeline sidebar (desktop only) lists completed card actions in chronological order
- [ ] **UI-12**: Activity log download button exports the full conversation as a JSON file
- [ ] **UI-13**: Dark/light theme toggle; theme persisted to localStorage
- [ ] **UI-14**: Fluid typography using CSS `clamp()`; spacing scale tokens in CSS custom properties
- [ ] **UI-15**: `prefers-reduced-motion` respected — transitions/animations disabled when set
- [ ] **UI-16**: ARIA live region on transcript (`aria-live="polite"`) so screen readers announce new messages
- [ ] **UI-17**: All interactive elements keyboard-navigable with visible focus states

### Documentation

- [ ] **DOCS-01**: `README.md` covers monorepo setup, environment variable configuration, `npm run dev`, and `npm test`
- [ ] **DOCS-02**: `docs/adaptive-card-playbook.md` documents card registration pattern: `cardId`, purpose, required inputs, validation rules, `userSummary` formatter snippet
- [ ] **DOCS-03**: At least one sample Adaptive Card JSON asset in `docs/cards/` used in tests

## v2 Requirements

### Streaming & Performance

- **PERF-01**: Server-Sent Events (SSE) for streaming Copilot responses token-by-token
- **PERF-02**: `React.memo` and `React.lazy` applied to transcript message components
- **PERF-03**: Virtual scroll for long transcripts

### Auth & Multi-tenant

- **AUTH-01**: Real MSAL OBO token implementation (replacing v1 stubs)
- **AUTH-02**: Per-user `CopilotStudioClient` instance when OBO flow requires per-user JWT

### Extended Adaptive Cards

- **CARD-01**: Markdown rendering in text messages (`react-markdown` + `rehype-sanitize`)
- **CARD-02**: "Next best action" quick-reply chips from `suggestedActions` in bot responses
- **CARD-03**: `adaptivecards-templating` for server-side data binding pattern

### Deployment

- **DEPLOY-01**: Guidance/config for deploying Node API behind Azure API Management or Azure Functions
- **DEPLOY-02**: Static hosting config for React client (Azure Static Web Apps or similar)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real MSAL/OBO token implementation | Placeholder stubs only for v1; full implementation is complex and depends on tenant setup |
| Direct browser → Copilot Studio calls | Violates security requirement; all calls must be server-proxied |
| Mobile native app | Web-first; mobile app is a future milestone |
| Real-time multi-user conversations | Single-user sessions only for v1 |
| OAuth/SSO for end users | CIAM bearer token assumed to be provided externally |
| `adaptivecards-react` package | Incompatible with React 18; using custom wrapper instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Complete |
| INFRA-05 | Phase 1 | Complete |
| INFRA-06 | Phase 1 | Complete |
| INFRA-07 | Phase 4 | Pending |
| SCHEMA-01 | Phase 1 | Pending |
| SCHEMA-02 | Phase 1 | Pending |
| SCHEMA-03 | Phase 1 | Pending |
| SCHEMA-04 | Phase 1 | Pending |
| SERV-01 | Phase 1 | Pending |
| SERV-02 | Phase 1 | Pending |
| SERV-03 | Phase 2 | Pending |
| SERV-04 | Phase 3 | Pending |
| SERV-05 | Phase 1 | Pending |
| SERV-06 | Phase 2 | Pending |
| SERV-07 | Phase 3 | Pending |
| SERV-08 | Phase 3 | Pending |
| SERV-09 | Phase 1 | Pending |
| SERV-10 | Phase 1 | Pending |
| SERV-11 | Phase 2 | Pending |
| SERV-12 | Phase 3 | Pending |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 2 | Pending |
| UI-03 | Phase 2 | Pending |
| UI-04 | Phase 2 | Pending |
| UI-05 | Phase 2 | Pending |
| UI-06 | Phase 3 | Pending |
| UI-07 | Phase 3 | Pending |
| UI-08 | Phase 3 | Pending |
| UI-09 | Phase 2 | Pending |
| UI-10 | Phase 3 | Pending |
| UI-11 | Phase 4 | Pending |
| UI-12 | Phase 4 | Pending |
| UI-13 | Phase 3 | Pending |
| UI-14 | Phase 3 | Pending |
| UI-15 | Phase 3 | Pending |
| UI-16 | Phase 3 | Pending |
| UI-17 | Phase 3 | Pending |
| DOCS-01 | Phase 4 | Pending |
| DOCS-02 | Phase 4 | Pending |
| DOCS-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 43 total
- Mapped to phases: 43
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-20 after plan 01-01 completion (INFRA-01 through INFRA-06 complete)*
