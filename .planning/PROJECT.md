# Agentic Copilot Chat App

## What This Is

A production-ready monorepo (React + Node) that delivers a responsive chat experience powered by Microsoft Copilot Studio (Microsoft 365 Agents SDK) and Adaptive Cards. Users can have free-form text conversations and submit structured Adaptive Card forms, with all Copilot Studio calls proxied through the Node server so secrets never reach the browser.

v1.0 (MVP) shipped 2026-02-20: full text chat and interactive Adaptive Cards working end-to-end, WCAG 2.2 AA accessible, dark/light theme, responsive from 360px through 1280px. CI, documentation, and timeline sidebar are v1.1 work.

## Core Value

Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected.

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
- ✓ MSAL OBO token stubs (fail-closed, AUTH_REQUIRED=true default) — v1.0
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

### Active

- [ ] GitHub Actions workflow: lint + tests on push/PR, credential-leak check, Zod-instance check (INFRA-07)
- [ ] Timeline sidebar (desktop): completed card actions in chronological order (UI-11)
- [ ] Activity log download: export full conversation as JSON (UI-12)
- [ ] README: monorepo setup, env vars, npm run dev, npm test (DOCS-01)
- [ ] docs/adaptive-card-playbook.md: card registration pattern with cardId, inputs, userSummary formatter (DOCS-02)
- [ ] Sample Adaptive Card JSON asset in docs/cards/ used in tests (DOCS-03)

### Out of Scope

- Real MSAL/OBO token implementation — placeholder stubs only for v1; full implementation is AUTH-01 for v2
- Deployment infrastructure (Azure Functions, APIM) — documented but not wired
- OAuth/SSO for end users — CIAM bearer token assumed to be provided externally
- Direct browser → Copilot Studio calls — violates security requirement
- Mobile native app — web-first, mobile is a future milestone
- Real-time multi-user conversations — single-user sessions for v1
- `adaptivecards-react` package — incompatible with React 18; custom wrapper used instead
- Server-Sent Events (SSE) streaming — v2 (PERF-01)
- Markdown rendering in text messages — v2 (CARD-01)
- Quick-reply chips from suggestedActions — v2 (CARD-02)

## Context

**Shipped v1.0 (2026-02-20):** 3 phases, 13 plans, ~2,341 LOC TypeScript/JS, 91 files

**Tech stack:**
- Monorepo: npm workspaces (`client/`, `server/`, `shared/`)
- Client: Vite + React 18 + TypeScript
- Server: Express + Node 20+ + TypeScript
- Shared: Zod schemas as single source of truth for types
- Adaptive Cards: `adaptivecards` v3 JS SDK with custom React wrapper (not `adaptivecards-react`)

**Key findings from v1.0:**
- `adaptivecards-react` abandoned — React 18 incompatible; custom `useRef`/`useEffect` wrapper works well
- `CopilotStudioConnectionSettings` requires explicit fields (not `loadFromEnv()`); `externalId = uuidv4()` as client-facing conversationId
- Zod single-instance pattern (declared in `shared/` only) confirmed working; `npm ls zod` shows one instance
- MSAL OBO stubs are fail-closed by design; `AUTH_REQUIRED=true` is the safe default
- ESLint missing `@react-eslint` plugin for JSX type inference — non-blocking, no runtime impact (tech debt for v1.1)

**Tech debt carried into v1.1:**
- Missing VERIFICATION.md for Phases 1 & 3 (all code verified functionally; documentation gap only)
- Metadata drawer `aside.metadataPane` renders placeholder "Activity log (Phase 4)" text — UI-11/UI-12 are Phase 4
- ESLint JSX plugin missing — non-blocking

## Constraints

- **Tech Stack**: React 18 + Vite, Node 20+, Express, TypeScript throughout — no switching to Next.js SSR
- **Security**: Copilot Studio client must never be invoked from the browser; all calls server-side
- **Compatibility**: Adaptive Cards version 1.5 format; must support mobile (360px) through widescreen (1280px+)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Monorepo with npm workspaces | Shared types between client/server without a separate publish step | ✓ Good — single Zod instance confirmed, types shared cleanly |
| Zod for shared schema validation | Runtime validation + TypeScript types from one source | ✓ Good — hoisting prevented by declaring in shared/ only |
| Express over Fastify | Wider ecosystem familiarity; simpler middleware for auth stubs | ✓ Good — no friction during implementation |
| Card action allowlist enforcement | Security — prevent arbitrary actions from Adaptive Card payloads | ✓ Good — 403 on disallowed actions verified in UAT |
| Custom adaptivecards v3 wrapper (not adaptivecards-react) | adaptivecards-react is React 18 incompatible | ✓ Good — custom useRef/useEffect wrapper worked cleanly |
| MSAL OBO stubs fail-closed | Security baseline for v1; real OBO deferred to v2 | ✓ Good — AUTH_REQUIRED=true default enforced |
| CSS custom properties for theming | Runtime theme switching without JS overhead | ✓ Good — dark/light toggle + localStorage persistence works |

---
*Last updated: 2026-02-20 after v1.0 milestone*
