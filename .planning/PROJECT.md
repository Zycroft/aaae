# Agentic Copilot Chat App

## What This Is

A production-ready monorepo (React + Node) that delivers a responsive, authenticated chat experience powered by Microsoft Copilot Studio (Microsoft 365 Agents SDK) and Adaptive Cards. Users sign in via Entra External ID, then have free-form text conversations and submit structured Adaptive Card forms, with all Copilot Studio calls proxied through the Node server so secrets never reach the browser.

v1.0 (MVP) shipped 2026-02-20: full text chat and interactive Adaptive Cards working end-to-end, WCAG 2.2 AA accessible, dark/light theme, responsive from 360px through 1280px.

v1.1 (Polish) shipped 2026-02-20: metadata sidebar with activity timeline and JSON download, GitHub Actions CI with credential-leak and Zod-instance checks, README quick start, and Adaptive Cards authoring playbook.

v1.2 (Auth) shipped 2026-02-21: Entra External ID (CIAM) authentication via MSAL React on the client and JWT validation + org allowlist on the server. UserClaims Zod schema in shared/, fail-closed config, AUTH_REQUIRED=false dev bypass preserved.

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

### Active

#### v1.3b — Copilot Studio SDK: Orchestrator Readiness

**Structured Output Extraction:**
- [ ] Server can extract structured JSON from activity.value, activity.entities, and text-embedded responses
- [ ] ExtractedPayload Zod schema validates all extraction surfaces with confidence level
- [ ] activityNormalizer populates extractedPayload on NormalizedMessage

**Context Injection:**
- [ ] SendMessageRequest accepts optional workflowContext (step, constraints, collectedData)
- [ ] Server injects workflowContext as structured prefix into outbound Copilot messages
- [ ] Context injection tested with live Copilot agent without breaking responses

**Orchestrator Infrastructure:**
- [ ] WorkflowState type defined in shared schema
- [ ] POST /api/chat/orchestrate endpoint accepts query + workflowContext, returns messages + extractedPayload + latencyMs
- [ ] Conversation continuity verified across 3+ SDK turns

**Performance & Evaluation:**
- [ ] Latency baselines measured (startConversation, sendMessage, full round-trip)
- [ ] SDK-EVALUATION.md with GO/CONDITIONAL GO recommendation for v1.5

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

**Current state (v1.2):** 7 phases, 23 plans shipped across 3 milestones. ~50 files changed in v1.2 alone. Full MSAL auth flow working end-to-end: sign-in → token acquisition → Bearer header injection → JWT validation → org allowlist → Copilot proxy.

**Tech stack:**
- Monorepo: npm workspaces (`client/`, `server/`, `shared/`)
- Client: Vite + React 18 + TypeScript + MSAL React v3.x
- Server: Express + Node 20+ + TypeScript + jose (JWT validation)
- Shared: Zod schemas as single source of truth for types (including UserClaims)
- Auth: Entra External ID (CIAM) via @azure/msal-browser + @azure/msal-react
- Adaptive Cards: `adaptivecards` v3 JS SDK with custom React wrapper (not `adaptivecards-react`)

**Tech debt carried into next milestone:**
- Missing VERIFICATION.md for Phases 1 & 3 (all code verified functionally; documentation gap only)
- ESLint JSX plugin missing — non-blocking, 3 pre-existing errors in AdaptiveCardMessage.tsx and ChatInput.tsx

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

## Current Milestone: v1.3b Copilot Studio SDK: Orchestrator Readiness

**Goal:** Validate and formalize the Copilot Studio SDK path for structured output extraction, context injection, and orchestrator-ready infrastructure — closing all gaps between the current SDK integration and what the v1.5 Workflow Orchestrator requires.

**Target features:**
- Structured JSON extraction from Copilot responses (activity.value, activity.entities, text-embedded)
- Context injection into outbound Copilot messages for workflow-driven queries
- Orchestrator-ready endpoint (POST /api/chat/orchestrate) with latency measurement
- Multi-turn workflow state management
- SDK evaluation document with GO/CONDITIONAL GO recommendation for v1.5

---
*Last updated: 2026-02-21 after v1.3b milestone started*
