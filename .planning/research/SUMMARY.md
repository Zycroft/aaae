# Project Research Summary

**Project:** aaae — Custom Copilot Studio Chat Canvas
**Domain:** React + Node monorepo chat app — Microsoft Copilot Studio (M365 Agents SDK) + Adaptive Cards
**Researched:** 2026-02-19
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project is a custom enterprise chat canvas that wraps Microsoft Copilot Studio via the M365 Agents SDK, rendering both plain text and Adaptive Cards in a bespoke React UI. The canonical implementation pattern — verified across official Microsoft docs, official SDK samples, and the Agents GitHub repo — is a mandatory server-side proxy: the `CopilotStudioClient` from `@microsoft/agents-copilotstudio-client` runs exclusively on a Node/Express server, and the React client communicates only with that Express API over a thin, Zod-typed REST contract. This two-tier architecture is non-negotiable: Copilot Studio credentials must never reach the browser, and all card action submissions must be validated server-side before they reach the agent.

The recommended technology set is well-established for greenfield projects as of early 2026. React 18 (not 19) is required because the Adaptive Cards JS SDK has no React 18+ wrapper — the official `adaptivecards-react` package is effectively abandoned, and the correct pattern is a 30-line custom `useRef`/`useEffect` wrapper over the `adaptivecards` v3 JS SDK. The rest of the stack (Vite 6, Express 5, TypeScript 5.8, Tailwind CSS v4, Zod v4, npm workspaces, Vitest) is stable and consistently recommended. The M365 Agents SDK itself (`@microsoft/agents-copilotstudio-client` v1.2.3) reached GA in September 2025 and the deprecated non-streaming methods (`askQuestionAsync`, `sendActivity`) must not be used — the streaming async-generator API is the only supported path.

The highest risks are security-related and must be designed in from day one: DirectLine credentials leaking into Vite env vars, card action payloads being forwarded to Copilot without server-side allowlist validation, and auth middleware stubs configured to fail-open. A secondary cluster of risks is functional: Adaptive Card rendering produces visually correct but non-interactive cards when mounted via `dangerouslySetInnerHTML`, cards silently drop elements when the renderer's `maxVersion` does not match the card schema version, and submitted cards must be immediately disabled to prevent duplicate action submissions. These are not edge cases — they are the most common failure modes reported in official GitHub issues and the Microsoft Security Blog.

## Key Findings

### Recommended Stack

The core stack is a React 18 SPA (Vite 6 build) communicating with an Express 5 API server, organized as an npm workspaces monorepo with three packages: `shared/` (Zod schemas, no external runtime deps), `server/` (Express proxy, MSAL, Copilot SDK), and `client/` (React, Tailwind, Adaptive Cards renderer). TypeScript 5.8+ is required throughout. Zod v4 (stable since mid-2025) is the schema layer — start on v4 for a greenfield project and declare it as a dep in `shared/` only to prevent dual-instance hoisting bugs.

The two Microsoft-specific constraints that shape the stack most significantly are: (1) `@microsoft/agents-copilotstudio-client` targets Node 20+ and must never run in a browser, and (2) there is no usable React wrapper for Adaptive Cards — `adaptivecards-react` has not been maintained for React 18 (confirmed by Microsoft in Sep 2023) and `adaptivecards-react@1.1.1` causes rendering bugs under React 18 concurrent mode. The replacement is a ~30-line custom component using `useRef` + `useEffect` wrapping the `adaptivecards` v3 JS SDK directly.

**Core technologies:**
- React 18.x: Client UI framework — React 19 explicitly excluded; ecosystem (Adaptive Cards, MSAL) tested on 18
- Vite 6: Client build tool — `@tailwindcss/vite` plugin; zero PostCSS config; Vite 6 = Node 20/22 only
- Node.js 20 LTS: Server runtime — required by `@microsoft/agents-copilotstudio-client`
- TypeScript 5.8+: Type system — `module: "node20"` in tsconfig; required for Zod v4 compatibility
- Express 5.2.x: HTTP server — now stable (`latest` tag on npm); use `@types/express@^5.0.6`
- `@microsoft/agents-copilotstudio-client` v1.2.3: Copilot SDK — GA Sep 2025; server-side only; use streaming API exclusively
- `@azure/msal-node` v3.8.7: MSAL token acquisition — `ConfidentialClientApplication` for client-credentials and OBO flows
- `adaptivecards` v3.0.5: Adaptive Cards renderer — official JS SDK; use custom React wrapper, not `adaptivecards-react`
- Zod v4: Shared schema/validation — 14x faster than v3; declare in `shared/` only
- Tailwind CSS v4: Styling — no PostCSS config; `@import "tailwindcss"` in CSS file
- Vitest 4: Testing — shares Vite config; use `--workspace` flag for monorepo

**What NOT to use:**
- `adaptivecards-react@1.1.1` — abandoned, breaks React 18 concurrent mode
- `startConversationAsync` / `askQuestionAsync` / `sendActivity` — deprecated SDK methods
- Next.js — explicitly excluded by PROJECT.md; SSR adds complexity without benefit for a proxied API
- `@microsoft/msal-browser` on the server — browser-only, crashes in Node
- Zod v3 — use v4 for all greenfield code

### Expected Features

The product must deliver a full enterprise chat experience with Adaptive Cards as the primary interaction modality. All table-stakes features are required for v1; the differentiators are what separate this from the default Copilot Studio canvas. Several commonly-requested features are explicitly anti-features for v1 — most importantly, token-by-token streaming (the SDK does not support it natively) and multi-session conversation history (requires a DB + session identity model not in scope).

The feature dependencies drive the build order: Zod shared schemas must exist before any API layer, `conversationId` lifecycle must exist before card actions, and Adaptive Card rendering must be working before the card disable/pending state or the timeline sidebar can be implemented.

**Must have (table stakes — required for v1 launch):**
- Message bubble transcript with user/bot visual distinction
- Optimistic user bubble + loading skeleton (perceived responsiveness)
- Typing/thinking indicator while awaiting Copilot response
- Error toasts with inline bubble error state and retry affordance
- Adaptive Card rendering inline in transcript (custom `useRef`/`useEffect` wrapper)
- Card disabled + pending state immediately after submit (prevents double-submission — Copilot Studio explicitly warns this is the default failure mode)
- Hybrid turn rendering (text preamble + card in a single bot activity)
- Conversation start / new conversation trigger
- Responsive layout 360px to 1280px+ (PROJECT.md hard requirement)
- Dark/light mode toggle with `prefers-color-scheme` default
- Reduced-motion respect (`prefers-reduced-motion`) — WCAG 2.2 + EAA June 2025
- Keyboard navigation + ARIA live regions — WCAG 2.2 Level AA (legally required in EU since June 2025)
- Card action allowlist enforcement on both client and server
- Normalized Zod message schema in `shared/` package
- Activity log download (JSON serialization of normalized messages)
- MSAL OBO token flow as a fail-closed stub (not functionally active, but correctly structured)

**Should have (differentiators — add after core is stable):**
- Timeline sidebar summarizing completed card actions (desktop, P2)
- MSAL OBO token flow — real implementation (trigger: production deployment with real user identities)
- Suggested replies rendering (trigger: Copilot Studio topics actually emit `suggestedActions`)
- Markdown rendering in bot bubbles with sanitization (trigger: bot responses actually use markdown)

**Defer (v2+):**
- Multi-session conversation history — requires DB + session identity model
- Voice input — out of scope per PROJECT.md; significant permission/audio complexity
- Token-by-token streaming responses — SDK does not support natively; revisit when it does
- Collaborative/shared sessions — architecture change; validate demand first

### Architecture Approach

The architecture is a strict two-tier proxy: React SPA (Vite dev server or static build) calls a thin Express REST API (`/api/chat/start`, `/api/chat/send`, `/api/chat/card-action`), which holds the `CopilotStudioClient` instance and the Copilot Studio credentials. Raw Bot Framework `Activity` objects from the SDK are never exposed to the client — they are normalized by a server-side `activityNormalizer.ts` into `NormalizedMessage[]` typed by the Zod schema in `shared/`. Client state is managed with Zustand: append-only message array, pending/completed card ID sets, loading flag, and error string. The `CopilotStudioClient` is stateless from the server's perspective — `conversationId` is returned on `/start` and supplied by the client on every subsequent call, so the server requires no sticky sessions.

**Major components:**
1. `shared/src/schemas.ts` — Zod schemas for `NormalizedMessage`, `CardActionRequest`, API request/response types; source of truth for both sides
2. `server/middleware/auth.ts` — CIAM bearer token validation; fail-closed stub in v1; real MSAL OBO plug-in point
3. `server/normalizer/activityNormalizer.ts` — `Activity` → `NormalizedMessage | null`; the schema firewall between SDK internals and the public API surface
4. `server/services/copilotClient.ts` — `CopilotStudioClient` factory; isolates JWT acquisition and token refresh from route handlers
5. `server/routes/` (`start.ts`, `send.ts`, `cardAction.ts`) — thin route handlers; Zod parse + allowlist check + SDK call + normalize + respond
6. `client/store/chatStore.ts` — Zustand store; `messages[]`, `pendingCardIds`, `completedCardIds`, `isLoading`, `error`
7. `client/api/chatApi.ts` — fetch wrappers for `/api/chat/*`; injects `Authorization` header; components never call fetch directly
8. `client/components/CardRenderer.tsx` — custom `useRef`/`useEffect` wrapper over `adaptivecards` SDK; `onExecuteAction` → `chatStore.submitCardAction`
9. `client/components/ChatTranscript.tsx` + `MessageBubble.tsx` — scrollable transcript; ARIA live region; optimistic bubbles
10. `client/components/MetadataDrawer.tsx` — desktop sidebar; reads completed card actions from store; activity log download

**Key patterns:**
- Server-side SDK proxy: `CopilotStudioClient` server-only, `conversationId` client-owned, server stateless
- Zod shared contract: single schema in `shared/`; `z.infer` generates types used by both packages
- Streaming activity consumption: `for await` over `AsyncGenerator<Activity>` with collect-then-respond for v1 (SSE streaming is a v2 enhancement)
- Action allowlist: `ACTION_ALLOWLIST.has(body.actionType)` enforced before any SDK call; `Action.OpenUrl` domain allowlist for phishing prevention
- Store-driven card state: `pendingCardIds` set on submit, `completedCardIds` set on response — card stays disabled permanently after submit

### Critical Pitfalls

1. **DirectLine secret in the browser** — Any `VITE_COPILOT_*` env var or direct browser call to `directline.botframework.com` exposes credentials permanently. All SDK calls must live in `server/`; verify with `grep -r "COPILOT" client/` returning nothing.

2. **`dangerouslySetInnerHTML` mounting of Adaptive Cards** — Produces cards that look correct but all action buttons are dead (event listeners destroyed). Use the custom `useRef`/`useEffect` wrapper that calls `card.render()` and `appendChild()` on the ref; verify the first prototype card fires a network request on Submit click before writing any card templates.

3. **Card not disabled after submit** — Card remains interactive during the 2-3 second inflight request; rapid double-click sends duplicate actions to Copilot Studio, triggering duplicate side effects downstream. Mark `pendingCardIds` immediately on `onExecuteAction` callback; server should also implement idempotency for `(conversationId, actionId)` pairs.

4. **Card action allowlist missing or client-only** — Client-side Adaptive Cards `isRequired`/`regex` validation is entirely bypassable with a crafted POST. The server `/api/chat/card-action` handler must parse with Zod and check an explicit allowlist before forwarding anything to Copilot Studio.

5. **Fail-open auth stubs** — A stub that returns `const token = req.headers.authorization; // TODO validate` and continues makes the entire API unauthenticated. Stubs must reject with 401 when no `Authorization` header is present; bypass only via explicit `AUTH_REQUIRED=false` env var with a `NODE_ENV !== 'production'` guard.

6. **Adaptive Card schema version mismatch** — If the renderer's `maxVersion` is set lower than the card's `$schema` version, elements are silently dropped — no error, just blank space or `fallbackText`. Configure `maxVersion` and `onParseError` explicitly; verify with a Table element (AC 1.5 only) before writing any card templates.

7. **Zod dual-instance from workspace hoisting** — If `zod` is declared as a direct dep in both `shared/` and `server/`, npm may install two copies, breaking `instanceof ZodError` in catch blocks. Declare Zod in `shared/` only; verify with `npm ls zod` returning exactly one path.

## Implications for Roadmap

The architecture research prescribes a clear build order: everything depends on `shared/` schemas, server auth middleware must gate routes before any route is tested end-to-end, the normalizer must be isolated and unit-testable before route handlers are written, and Adaptive Card rendering is a standalone vertical that builds on a working text transcript. The pitfalls research reinforces this order — the security and correctness pitfalls all cluster in Phase 1 (scaffold) and Phase 2 (Adaptive Cards + card actions).

### Phase 1: Monorepo Scaffold + Server Foundation

**Rationale:** Everything else imports from `shared/` and routes through the Express middleware stack. Foundational decisions made here (Zod instance location, auth middleware contract, conversation store interface, CORS config) are expensive to retrofit later. All critical security pitfalls are addressed in this phase.

**Delivers:** Working monorepo; shared Zod schemas; Express server with auth middleware (fail-closed stub); `/api/chat/start` returning a `conversationId`; CORS configured from env var; `npm ls zod` returns one instance; `grep -r "COPILOT" client/` returns nothing.

**Features addressed:** Normalized Zod message schema; MSAL OBO stub; Conversation start; Card action allowlist scaffolded.

**Pitfalls avoided:** DirectLine secret exposure; fail-open auth stubs; Zod dual-instance; `agentIdentifier` deprecation; CORS production gap (stub CI check); conversation state store interface (in-memory Map with abstraction layer).

**Research flag:** Standard patterns — Vite/Express monorepo setup is well-documented; npm workspaces + Zod is established.

### Phase 2: Text Chat End-to-End

**Rationale:** Get a working chat loop (text in, text response out, displayed in transcript) before adding Adaptive Cards complexity. This validates the full proxy chain — client → Express → `CopilotStudioClient` → Copilot Studio → normalizer → Zustand store → React — with the simplest possible payload. Text messages expose the streaming activity consumption pattern and the normalizer without card-specific edge cases.

**Delivers:** Working text chat end-to-end; `ChatTranscript` + `MessageBubble` rendering normalized text messages; optimistic user bubble; loading skeleton; typing indicator; error toast with inline error state; `/api/chat/send` route complete; `activityNormalizer.ts` unit-tested.

**Features addressed:** Message bubble transcript; optimistic user bubble; typing indicator; loading skeleton; error toast; `/api/chat/send`.

**Pitfalls avoided:** Forwarding raw Activity to browser (normalizer enforced before this phase ends); polling anti-pattern (streaming async iterator established here).

**Research flag:** Standard patterns — React state management, fetch with optimistic updates, and Express route handlers are well-documented.

### Phase 3: Adaptive Cards Rendering + Card Actions

**Rationale:** Adaptive Cards are the core differentiator and the highest-risk rendering layer. Isolate this work from the text chat foundation so failures are contained. The `dangerouslySetInnerHTML` pitfall, schema version mismatch, duplicate submission, and card allowlist pitfalls all manifest here — address each with an explicit verification test before moving on.

**Delivers:** `CardRenderer.tsx` (custom `useRef`/`useEffect` wrapper); card rendered inline in transcript; `onExecuteAction` → `chatStore.submitCardAction`; card immediately disabled + pending spinner on submit; card permanently disabled after response; `/api/chat/card-action` route with Zod parse + `ACTION_ALLOWLIST` check + `Action.OpenUrl` domain allowlist; `pendingCardIds`/`completedCardIds` in Zustand store; hybrid turn rendering (text + card in one activity); schema `maxVersion` and `onParseError` configured.

**Features addressed:** Adaptive Card rendering; card disabled/pending state; hybrid turn rendering; card action allowlist (client + server); duplicate submission prevention.

**Pitfalls avoided:** `dangerouslySetInnerHTML` (explicitly forbidden; test: Submit fires network request); schema version mismatch (test: Table element renders correctly); card not disabled after submit (test: double-click produces one request); allowlist missing (test: crafted POST with unlisted action type returns 403).

**Research flag:** Needs care — Adaptive Cards React integration is the most underdocumented area; the `adaptivecards-react` abandonment means community examples are outdated. The custom wrapper pattern is verified against the official JS SDK docs and GitHub issue threads, but implementation details should be verified against `adaptivecards` v3 API at implementation time.

### Phase 4: Accessibility, Theming, and Responsive Layout

**Rationale:** Accessibility and theming are cross-cutting concerns that touch every component. Doing them after the core rendering is complete allows systematic application across the full component tree rather than retrofitting piecemeal. WCAG 2.2 Level AA is a hard legal requirement (EAA in force June 2025) — this is not optional polish.

**Delivers:** ARIA live region on `ChatTranscript` (`aria-live="polite"`); new bot messages and card submit confirmations announced; error toasts announced; full keyboard navigation with correct focus management on send box and card action buttons; dark/light mode toggle with `prefers-color-scheme` default and localStorage persistence; CSS custom properties for all color tokens; `prefers-reduced-motion` suppressing typing indicator animation and skeleton shimmer; responsive layout from 360px to 1280px+; avatar/sender identity; timestamps.

**Features addressed:** ARIA live regions; keyboard navigation; dark/light mode; reduced-motion; responsive layout; avatar; timestamps.

**Pitfalls avoided:** Reduced-motion not respected; no ARIA live regions; keyboard trap in send box.

**Research flag:** Standard patterns — WCAG 2.2 and Tailwind responsive utilities are well-documented. CSS custom properties + Adaptive Cards host theme injection is slightly custom but low risk.

### Phase 5: Activity Log, Metadata Drawer, and v1 Polish

**Rationale:** The metadata drawer and activity log are downstream of stable card action tracking (established in Phase 3) and the normalized message schema. These features are now low-risk additions that read from existing store state without new API surface.

**Delivers:** `MetadataDrawer.tsx` desktop sidebar with card action timeline; `ActivityLog` download button (JSON serialization of `messages[]`); v1 polish (error message specificity per error type; `fallbackText` detection with contextual error display; `React.memo` on `MessageBubble`/`CardRenderer` to prevent full-list re-renders; lazy-import of `adaptivecards` bundle via `React.lazy` + `Suspense`).

**Features addressed:** Timeline sidebar; activity log download; performance optimization; error message specificity.

**Pitfalls avoided:** Full card list re-render on every message; loading full AC bundle unconditionally; generic error messages.

**Research flag:** Standard patterns — Zustand selectors, React.memo, and React.lazy are well-documented.

### Phase 6: CI, Documentation, and v1 Hardening

**Rationale:** CI and documentation belong last so they reflect the final v1 architecture rather than earlier scaffolding. The production CORS check must run in CI against the built client. The Adaptive Cards playbook is written once the card patterns are stable.

**Delivers:** GitHub Actions CI (lint + test both workspaces); production build smoke test (built client served via `express.static`, API called without Vite proxy, CORS headers verified); `npm ls zod` check in CI; `grep -r "COPILOT" client/` check in CI; `.env.example` with all required and optional vars documented; README with setup and dev instructions; Adaptive Cards Playbook (schema validation, allowlist registration, test patterns for future card authors).

**Features addressed:** Adaptive Cards playbook documentation; CI automation; production hardening.

**Pitfalls avoided:** Vite proxy CORS gap (production build test in CI); credential leak check automated; Zod dual-instance check automated.

**Research flag:** Standard patterns — GitHub Actions, ESLint flat config, and Vitest workspace mode are well-documented.

### Phase Ordering Rationale

- Phases 1 → 2 → 3 follow the dependency chain from ARCHITECTURE.md's build order table: schemas first, auth + routes second, normalizer third, client store fourth, text transcript fifth, card rendering sixth.
- Security pitfalls (credential exposure, fail-open auth, action allowlist) are all addressed in Phases 1 and 3 — before any code touches real Copilot Studio or real card submissions.
- Accessibility is a separate phase (4) rather than inline in each component because the ARIA live region, keyboard focus management, and CSS token decisions interact across the full component tree; applying them systematically to the complete tree is more reliable than retrofitting.
- The metadata drawer and activity log (Phase 5) are explicitly downstream of card action tracking (Phase 3) — the feature dependency graph from FEATURES.md confirms this.
- CI and docs (Phase 6) are last because the production CORS check and the Adaptive Cards Playbook can only be written accurately once the implementation is stable.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Adaptive Cards):** The `adaptivecards` v3 `render()` API, `HostConfig` schema, and `onExecuteAction` callback signature should be verified against the current npm package at implementation time. Community examples predate v3 and reference the abandoned React wrapper. The `adaptivecards-templating` v2 data-binding API should also be checked if Copilot Studio returns template + data separately.
- **Phase 1 (MSAL OBO stub):** The specific `CopilotStudioConnectionSettings` fields (`schemaName`, `environmentId`, `tenantId` vs `directConnectUrl`) should be verified against the actual Copilot Studio environment configuration before implementation. The `directConnectUrl` vs named-settings branching is a gotcha documented in PITFALLS.md.

Phases with standard patterns (skip research-phase):
- **Phase 2 (text chat):** React state management, fetch patterns, Express route handlers, and Zustand are extremely well-documented.
- **Phase 4 (accessibility/theming):** WCAG 2.2 techniques, Tailwind responsive utilities, and CSS custom properties are stable, well-documented standards.
- **Phase 5 (metadata drawer / activity log):** Pure React + Zustand selector work; no new integrations.
- **Phase 6 (CI/docs):** GitHub Actions, ESLint flat config, and npm workspace CI patterns are standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack (React 18, Vite 6, Express 5, TypeScript 5.8, Tailwind v4, Zod v4) verified against official release notes and npm registry. `@microsoft/agents-copilotstudio-client` v1.2.3 GA status verified against official Microsoft Learn docs and npm. The Adaptive Cards React wrapper abandonment verified against official maintainer statement in GitHub Discussions. |
| Features | MEDIUM-HIGH | Table-stakes feature set consistent across official Copilot Studio docs, BotFramework-WebChat issues, and WCAG standards. Differentiator features (timeline sidebar, activity log) are low-complexity additions with no external dependencies. Anti-feature decisions (streaming, multi-session) are well-justified by SDK limitations. |
| Architecture | HIGH | Proxy pattern, Zod shared contract, allowlist enforcement, and streaming activity consumption all verified against official Microsoft SDK samples and Microsoft Learn docs. Build order derived from explicit component dependency graph — low risk of being wrong. |
| Pitfalls | MEDIUM-HIGH | Security pitfalls (credential exposure, fail-open auth, action allowlist) verified against the Microsoft Security Blog and official docs. Adaptive Cards pitfalls (`dangerouslySetInnerHTML`, schema version) verified against official GitHub issues with maintainer responses. Zod dual-instance verified against official Zod GitHub issues. Token refresh timing (1800s expiry) is SDK-internal and marked MEDIUM. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **DirectLine token refresh implementation:** The 30-minute token expiry is documented but the exact API for refresh (whether `CopilotStudioClient` handles it internally or requires an explicit refresh call) was not verified in the GA v1.2.3 SDK. Verify at Phase 1 implementation time by checking the `CopilotStudioClient` API reference for a refresh method.
- **MSAL OBO scope for Copilot Studio:** The exact OAuth scope string required for `acquireTokenOnBehalfOf` targeting Copilot Studio (`CopilotStudio.Copilots.Invoke` referenced in ARCHITECTURE.md) should be verified against the current Microsoft Entra app registration requirements before implementing even the stub — the wrong scope produces cryptic 400 errors.
- **`adaptivecards-react` peer dep (`swiper`):** PITFALLS.md notes that `adaptivecards-react` has an undeclared `swiper` peer dependency. Since the project is using the custom `useRef`/`useEffect` wrapper (not `adaptivecards-react`), this is not relevant — but if any future dependency re-introduces `adaptivecards-react`, this will cause build failures.
- **Copilot Studio Web Channel "Require secured access" propagation window:** The 2-hour propagation delay for security setting changes means CI environment setup must account for this. Plan the Copilot Studio environment configuration well before Phase 1 integration testing begins.

## Sources

### Primary (HIGH confidence)
- Microsoft Learn — CopilotStudioClient API Reference (updated 2025-12-18): https://learn.microsoft.com/en-us/javascript/api/@microsoft/agents-copilotstudio-client/copilotstudioclient
- Microsoft Learn — Integrate with web/native apps using M365 Agents SDK (updated 2025-12-12): https://learn.microsoft.com/en-us/microsoft-copilot-studio/publication-integrate-web-or-native-app-m365-agents-sdk
- microsoft/Agents GitHub — official Node.js samples (copilotstudio-webchat-react, copilotstudio-client): https://github.com/microsoft/Agents/tree/main/samples/nodejs
- npm `@microsoft/agents-copilotstudio-client` v1.2.3 (GA Sep 2025): https://www.npmjs.com/package/@microsoft/agents-copilotstudio-client
- GitHub Discussion — adaptivecards-react React 18 no-support statement (Sep 2023): https://github.com/microsoft/AdaptiveCards/discussions/8671
- BotFramework-WebChat Issue #1427 — card disable after submit: https://github.com/Microsoft/BotFramework-WebChat/issues/1427
- Microsoft Security Blog — Top 10 actions to build agents securely with Copilot Studio (Feb 2026): https://www.microsoft.com/en-us/security/blog/2026/02/12/copilot-studio-agent-security-top-10-risks-detect-prevent/
- GitHub — adaptivecards Actions not working with React (issue #6192): https://github.com/microsoft/AdaptiveCards/issues/6192
- Express 5.2.1 stable release: https://expressjs.com/2025/03/31/v5-1-latest-release.html
- Zod v4 stable release notes: https://zod.dev/v4
- WCAG 2.2 (European Accessibility Act, in force June 28, 2025): https://www.w3.org/WAI/standards-guidelines/wcag/new-in-21/
- Adaptive Cards JavaScript SDK — Microsoft Learn (updated 2025-07-03): https://learn.microsoft.com/en-us/adaptive-cards/sdk/rendering-cards/javascript/getting-started

### Secondary (MEDIUM confidence)
- Microsoft Agents-for-js API docs v1.3.0-beta: https://microsoft.github.io/Agents-for-js/ — SDK internals; docs lag GA release
- Ragnar Heil — "The Good, The Bad, and The Ugly of Copilot Studio" (2025): https://ragnarheil.de/the-good-the-bad-and-the-ugly-of-copilot-studio — community practitioner review
- GitHub colinhacks/zod Issue #2617 — Zod monorepo dual-instance: https://github.com/colinhacks/zod/issues/2617
- GitHub adaptivecards-react swiper peer dep issue #8505: https://github.com/microsoft/AdaptiveCards/issues/8505
- GitHub AzureAD/microsoft-authentication-library-for-js issue #5330 — OBO refresh tokens: https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/5330

---
*Research completed: 2026-02-19*
*Ready for roadmap: yes*
