# Stack Research

**Domain:** React + Node monorepo chat app — Microsoft Copilot Studio (M365 Agents SDK) + Adaptive Cards
**Researched:** 2026-02-19
**Confidence:** MEDIUM-HIGH (core stack HIGH; Copilot SDK versioning MEDIUM due to rapid beta churn; Adaptive Cards React strategy MEDIUM due to abandoned official React wrapper)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 18.x | Client UI framework | Stable LTS; React 19 exists but ecosystem (Adaptive Cards, MSAL) tested on 18. PROJECT.md explicitly requires 18. |
| Vite | ^6.x | Client build tool | Declared in PROJECT.md; v6 released Nov 2024, fully stable. Eliminates webpack config burden. `@tailwindcss/vite` plugin requires no PostCSS config. |
| Node.js | 20 LTS | Server runtime | `@microsoft/agents-copilotstudio-client` targets Node 20+. LTS until April 2026; Node 22 LTS also viable. |
| TypeScript | ^5.8 | Type system (both packages) | 5.8+ recommended for Node.js native type-strip compatibility; 5.9 is latest. Use `module: "node20"` in tsconfig. |
| Express | ^5.x (5.2.1) | HTTP server framework | PROJECT.md specifies Express over Fastify for "wider ecosystem familiarity." Express 5 is now stable (tagged `latest` on npm as of 2025). Full TypeScript support via `@types/express` ^5.0.6. |
| npm workspaces | Built-in (npm 7+) | Monorepo package management | PROJECT.md specifies this. No extra tooling needed; `packages: ["client","server","shared"]` in root `package.json`. |

### Microsoft / Copilot SDK Layer

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `@microsoft/agents-copilotstudio-client` | ^1.2.3 (GA as of Sep 2025; latest on npm Feb 2026 is 1.2.3) | Server-side Copilot Studio integration | The **only** official Microsoft 365 Agents SDK client for Node.js. GA since Sep 2025. Replaces legacy DirectLine for new integrations. Uses `CopilotStudioClient(settings, token)` constructor; must be called server-side only — token is never exposed to browser. |
| `@azure/msal-node` | ^3.8.7 | Server-side MSAL token acquisition | `ConfidentialClientApplication` covers both client-credentials (service identity) and On-Behalf-Of flows. Required to acquire the JWT passed to `CopilotStudioClient`. PROJECT.md scopes this to placeholder stubs for v1. |

### Adaptive Cards Layer

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `adaptivecards` | ^3.0.5 | Core Adaptive Cards JS SDK | The official Microsoft renderer. Renders AC JSON to DOM. Version 3.0.5 is current. Used server-side for schema validation and client-side for rendering. |
| `adaptivecards-templating` | ^2.3.1 | Data binding for AC templates | Allows `${variable}` substitution into card JSON before render. Use when server sends template + data separately. |
| Custom React wrapper (see note) | N/A | React component wrapping the JS SDK | **Do not use `adaptivecards-react`** (see "What NOT to Use"). Instead, write a ~30-line component using `useRef` + `useEffect` that calls `AdaptiveCard.render()` and appends to a div ref. |

**Adaptive Cards React pattern (use this):**
```tsx
// packages/client/src/components/AdaptiveCardRenderer.tsx
import { useRef, useEffect } from 'react';
import * as AC from 'adaptivecards';

interface Props { payload: object; onAction?: (action: AC.Action) => void; }

export function AdaptiveCardRenderer({ payload, onAction }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const card = new AC.AdaptiveCard();
    card.parse(payload);
    if (onAction) card.onExecuteAction = onAction;
    const rendered = card.render();
    containerRef.current.innerHTML = '';
    if (rendered) containerRef.current.appendChild(rendered);
  }, [payload, onAction]);

  return <div ref={containerRef} />;
}
```

### Shared Schema Layer

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| Zod | ^4.0.0 (stable, released mid-2025) | Runtime validation + TypeScript types from one source | PROJECT.md specifies Zod explicitly. v4 is now stable and production-ready. 14x faster parsing than v3. Breaking changes from v3 are real — start on v4 for a greenfield project. Validates request bodies on server AND is used to define the shared message schema in `packages/shared`. |

### Styling

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| Tailwind CSS | ^4.x | Utility-first styling | v4 released early 2025. `@tailwindcss/vite` plugin requires zero PostCSS config — just `npm install tailwindcss @tailwindcss/vite` + `@import "tailwindcss"` in CSS. Responsive breakpoints (360px → 1280px+) map cleanly to Tailwind's `sm`/`md`/`lg` prefix system. |

### Supporting Libraries (Client)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-router-dom` | ^7.x (7.13.0 latest) | Client-side routing | Use if app has multiple views (settings, history, etc.). Single-page chat apps may not need it at all for v1. |
| `@tanstack/react-query` | ^5.x | Server state / request caching | Use for the `/api/chat/*` fetch calls; handles loading, error, retry states cleanly. Alternative to manual `useState` + `useEffect` for async chat. |

### Supporting Libraries (Server)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cors` | ^2.8.5 | CORS headers | Always. Needed for browser-to-Node requests in dev and production. |
| `helmet` | ^8.x | Security headers | Always. Sets `Content-Security-Policy`, `X-Frame-Options`, etc. Minimal config for JSON API. |
| `morgan` | ^1.10.1 | HTTP request logging | Dev and staging. Use `tiny` format; disable or replace with structured logger (pino) in production. |
| `dotenv` | ^16.x | Environment variable loading | Server only. Client env vars go through Vite's `import.meta.env` mechanism. |
| `express-async-errors` | ^3.1.1 | Async error propagation to Express error handler | Use if you catch `async` route errors; eliminates try/catch boilerplate. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `vitest` | Unit testing (client + server) | ^4.x (4.0.18 latest). Powered by Vite; shares config with the client build. Run with `vitest --workspace` for monorepo coverage. |
| `@testing-library/react` | React component tests | Pair with Vitest. Tests the `AdaptiveCardRenderer`, chat transcript, etc. |
| ESLint | Linting | ESLint 9 with flat config (`eslint.config.js` at root). Use `typescript-eslint` v8+ with `projectService`. |
| Prettier | Formatting | Use `eslint-config-prettier` to disable conflicting ESLint format rules. |
| `tsx` | Run TypeScript files in Node | For server dev (`tsx watch src/index.ts`). No compile step during development. |
| GitHub Actions | CI | Lint + test both workspaces. See Installation section for script hooks. |

---

## Installation

```bash
# Root setup (npm workspaces)
npm install

# --- packages/shared ---
npm install zod@^4.0.0 --workspace=packages/shared

# --- packages/server ---
npm install \
  express@^5 \
  cors helmet morgan dotenv express-async-errors \
  @microsoft/agents-copilotstudio-client \
  @azure/msal-node \
  adaptivecards adaptivecards-templating \
  zod@^4.0.0 \
  --workspace=packages/server

npm install -D \
  typescript@^5.8 \
  @types/express @types/cors @types/morgan \
  tsx vitest \
  --workspace=packages/server

# --- packages/client ---
npm install \
  react@^18 react-dom@^18 \
  adaptivecards adaptivecards-templating \
  @tanstack/react-query \
  --workspace=packages/client

npm install -D \
  vite@^6 @vitejs/plugin-react \
  tailwindcss @tailwindcss/vite \
  typescript@^5.8 \
  vitest @testing-library/react @testing-library/jest-dom \
  --workspace=packages/client

# Root dev tools
npm install -D eslint prettier typescript-eslint eslint-config-prettier
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Express 5 | Fastify 5 | Choose Fastify if raw throughput is the primary concern and team has Fastify experience. For this project, Express was chosen per PROJECT.md for ecosystem familiarity and simpler MSAL middleware stubs. |
| npm workspaces | pnpm / Turborepo | Use pnpm + Turborepo when monorepo grows beyond 3–4 packages or CI build times become a bottleneck. npm workspaces is sufficient for a client/server/shared split. |
| Zod v4 | Zod v3 | Use v3 only if you have existing dependencies that pin to v3 schemas. For greenfield, v4 is faster, smaller, and forward-looking. |
| Custom AC React wrapper | `adaptivecards-react@1.1.1` | Never — see "What NOT to Use." |
| Tailwind CSS v4 | CSS Modules / Styled Components | Use CSS Modules if team has strong preference for scoped CSS without utility classes. Tailwind v4 was chosen for rapid responsive layout without context-switching. |
| `@azure/msal-node` | `@azure/identity` (DefaultAzureCredential) | Use `@azure/identity` when deploying to Azure with Managed Identity — no secrets required. For the v1 placeholder OBO stub, `msal-node` is more explicit and educational. |
| Vitest | Jest | Vitest shares Vite config (no separate babel setup), making it the obvious choice for Vite-based monorepos. Jest remains valid for non-Vite projects. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `adaptivecards-react@1.1.1` | Last published 3 years ago. No React 18 support — Microsoft confirmed in Sep 2023 they have no plans to support React 18+. Using it causes subtle rendering bugs and double-render issues under React 18's concurrent mode. | Custom 30-line `useRef`+`useEffect` wrapper over the `adaptivecards` JS SDK (pattern above). |
| `react-adaptivecards` (gatewayapps) | Last published 7 years ago. Abandoned. Peerage count is 0 on npm. | Same custom wrapper. |
| DirectLine (Bot Framework) | Legacy integration path for Copilot Studio. Microsoft explicitly marks it as the fallback for unsupported scenarios; `@microsoft/agents-copilotstudio-client` is the preferred path for new integrations. | `@microsoft/agents-copilotstudio-client` |
| `startConversationAsync` / `askQuestionAsync` / `sendActivity` (non-streaming) | These methods on `CopilotStudioClient` are **deprecated** as of the current SDK release. Will be removed in a future version. | `startConversationStreaming()` and `sendActivityStreaming()` — both return `AsyncGenerator<Activity>`. |
| Next.js | PROJECT.md explicitly rules it out: "no switching to Next.js SSR." The server-side Copilot proxy requirement is cleanly handled by an Express server; SSR adds complexity without benefit here. | Vite + React (SPA) + Express (API server) |
| CRA (Create React App) | Unmaintained since 2023. No Vite support, slow builds, poor TypeScript DX. | Vite |
| `botframework-webchat` | Heavy (~2MB) BotFramework chat widget. Designed for standalone embed, not for building a custom chat UI. Adaptive Cards rendering is bundled and can't be separated. | `adaptivecards` SDK + custom React chat components |
| `@microsoft/msal-browser` on the server | Browser-only MSAL; cannot be used in Node.js. Crashes with missing browser globals. | `@azure/msal-node` |
| Zod v3 on greenfield | v4 is stable, faster, and has a cleaner API. Mixing v3 and v4 in a monorepo causes type incompatibilities. | `zod@^4.0.0` |

---

## Stack Patterns by Variant

**If Copilot Studio agent uses "No Authentication" (public agent):**
- Token acquisition (`@azure/msal-node`) is not needed for the SDK call itself
- Still proxy through Express to avoid exposing the DirectConnectUrl to the browser
- The `CopilotStudioClient` constructor still requires a token string — pass empty string or use a service-level token

**If MSAL OBO is fully wired (post-v1):**
- Client sends a CIAM bearer token in `Authorization` header
- Server uses `ConfidentialClientApplication.acquireTokenOnBehalfOf()` to exchange it for a Copilot Studio-scoped token
- Pass that downstream token to `new CopilotStudioClient(settings, oboToken)`

**If Adaptive Cards use data binding (templates + data separately):**
- Add `adaptivecards-templating` on both client and server
- Server validates template schema; client applies data binding before render
- Prevents XSS via server-side allowlist on the template source

**If streaming responses are used (preferred path):**
- `startConversationStreaming()` and `sendActivityStreaming()` return `AsyncGenerator<Activity>`
- Use Server-Sent Events (SSE) from Express to stream activities to the browser incrementally
- Avoids long-held HTTP connections compared to waiting for the full `Promise<Activity[]>`

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@microsoft/agents-copilotstudio-client@^1.2.x` | Node 20, 22; TypeScript 5.x | Targets Node 20+. Will not run in the browser (Node-specific APIs). |
| `adaptivecards@^3.0.5` | React 18 (via custom wrapper); adaptivecards-templating ^2.x | No peer dependency on React — intentional. Works with any DOM host. |
| `zod@^4.0.0` | TypeScript 5.5+ | Zod v4 requires TS 5.5+. Not backward compatible with Zod v3 schema types. |
| `@azure/msal-node@^3.8.7` | Node 20+; TypeScript 5.x | Drop-in with Express middleware. Token cache is in-memory by default — add a distributed cache for multi-instance deployments. |
| `express@^5.2.x` | `@types/express@^5.0.6` | Express 5 types are in a separate `@types/express` release. Do not use `@types/express@4.x` with Express 5. |
| `vite@^6.x` | `@vitejs/plugin-react@^5.x`; `tailwindcss@^4.x` via `@tailwindcss/vite` | Vite 6 dropped Node 21 support; use Node 20 or 22 LTS. |
| `vitest@^4.x` | `vite@^6.x`; React 18 | Vitest 4 requires Vite 5 or 6. |

---

## Sources

- Microsoft Learn — CopilotStudioClient API Reference (updated 2025-12-18): https://learn.microsoft.com/en-us/javascript/api/@microsoft/agents-copilotstudio-client/copilotstudioclient?view=agents-sdk-js-latest — **HIGH confidence** (official Microsoft docs)
- Microsoft Learn — Integrate with web/native apps using M365 Agents SDK (updated 2025-12-12): https://learn.microsoft.com/en-us/microsoft-copilot-studio/publication-integrate-web-or-native-app-m365-agents-sdk — **HIGH confidence**
- Microsoft Agents for JS — v1.3.0-beta.40 API reference: https://microsoft.github.io/Agents-for-js/ — **MEDIUM confidence** (beta docs, package is GA but docs lag)
- npm `@microsoft/agents-copilotstudio-client` — version 1.2.3 (GA Sep 2025): https://www.npmjs.com/package/@microsoft/agents-copilotstudio-client — **HIGH confidence**
- MSAL Node v3.8.7 API reference: https://azuread.github.io/microsoft-authentication-library-for-js/ref/modules/_azure_msal_node.html — **HIGH confidence**
- Zod v4 release notes (stable mid-2025): https://zod.dev/v4 — **HIGH confidence**
- Adaptive Cards JavaScript SDK (MS Learn, updated 2025-07-03): https://learn.microsoft.com/en-us/adaptive-cards/sdk/rendering-cards/javascript/getting-started — **HIGH confidence**
- GitHub Discussion — adaptivecards-react React 18 compatibility (no plans to support, Sep 2023): https://github.com/microsoft/AdaptiveCards/discussions/8671 — **HIGH confidence** (official maintainer response)
- Express 5.1.0 / 5.2.1 stable release: https://expressjs.com/2025/03/31/v5-1-latest-release.html — **HIGH confidence**
- Vite 6 release blog: https://vite.dev/blog/announcing-vite6 — **HIGH confidence**
- Tailwind CSS v4 Vite integration: https://tailwindcss.com/docs — **HIGH confidence**
- WebSearch: React Router v7 (7.13.0), TanStack Router (1.161.1) — **MEDIUM confidence** (npm registry data via search)
- WebSearch: Express 5 + TypeScript setup 2025 — **MEDIUM confidence** (multiple corroborating sources)

---

*Stack research for: React + Node monorepo chat app — Copilot Studio + Adaptive Cards*
*Researched: 2026-02-19*
