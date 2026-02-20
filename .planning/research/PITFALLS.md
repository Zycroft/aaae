# Pitfalls Research

**Domain:** React + Node chat app with Microsoft Copilot Studio SDK + Adaptive Cards (monorepo)
**Researched:** 2026-02-19
**Confidence:** MEDIUM — Microsoft SDK is actively evolving; most pitfalls verified via official docs + community issues. SDK-specific internals marked where confidence is lower.

---

## Critical Pitfalls

### Pitfall 1: DirectLine Secret Exposed in the Browser

**What goes wrong:**
Developers hardcode the Copilot Studio DirectLine secret (from the Web Channel Security page) into the React client bundle or load it via an unauthenticated API call to the frontend. Any user who opens DevTools or intercepts network traffic can extract the secret and use it to impersonate the bot channel indefinitely.

**Why it happens:**
The Copilot Studio "Get started" docs show the secret in a config block. Developers copy it into `.env` and then import it in Vite/React without realising Vite bundles VITE_* vars into the JS payload. The proxy architecture (client → Node server → Copilot Studio) is the documented mitigation but is skipped when developers want to move fast.

**How to avoid:**
- All SDK calls (`@microsoft/agents-copilotstudio-client`) must live in the Node server only. The secret / connection string must never be in any `VITE_*` env var.
- The browser never calls Copilot Studio directly; it only calls `/api/chat/*` on the Express server.
- The Node server uses the secret server-side to obtain short-lived DirectLine tokens (valid for one conversation, expiring in 1800 s) and those tokens should not be forwarded to the client either — the server holds them in memory mapped to a session/conversationId.
- Verify: `grep -r "COPILOT" client/` should return nothing; no Copilot credentials should be in any file under `client/`.

**Warning signs:**
- Any `VITE_COPILOT_*` variable in `.env` or `vite.config.ts`.
- The React app making a direct HTTPS call to `directline.botframework.com` or `powerva.microsoft.com`.
- Network tab showing Authorization headers with `Bearer` values that start with the DirectLine secret format.

**Phase to address:** Foundation / server scaffold phase — before any Copilot SDK integration is wired.

---

### Pitfall 2: Using `dangerouslySetInnerHTML` / `innerHTML` to Mount Adaptive Cards

**What goes wrong:**
The standard `adaptivecards` JS package renders a card into a DOM element via `card.render()`. Developers take that DOM element's `outerHTML` and inject it into React using `dangerouslySetInnerHTML`. This destroys all event listeners the SDK attached during rendering. Every `Action.Submit` and `Action.OpenUrl` button becomes a dead click that produces no response and no error — the card looks correct but does nothing.

**Why it happens:**
The non-React `adaptivecards` package is found first in tutorials. `dangerouslySetInnerHTML` is a known React escape hatch for server-rendered HTML, so developers assume it applies here.

**How to avoid:**
Use `adaptivecards-react` (the official React wrapper package) which integrates the SDK into React's component lifecycle and preserves event delegation. Never call `.render()` and inject the result. Verify that `Action.Submit` callbacks fire in a test card before writing production card templates.

Note: `adaptivecards-react` requires `swiper` as an undeclared peer dependency — install it explicitly or the bundle will fail: `npm install adaptivecards-react swiper`.

**Warning signs:**
- `dangerouslySetInnerHTML` anywhere in a component that renders card content.
- Card buttons are visible but clicking them does nothing and no console errors appear.
- Network tab shows no outgoing requests when a card button is clicked.

**Phase to address:** Adaptive Card rendering phase — first card prototype must include an action click test.

---

### Pitfall 3: Schema Version Mismatch Causing Silent Card Drops

**What goes wrong:**
The project targets Adaptive Cards schema 1.5. If the renderer's `maxVersion` is set lower, or the card JSON declares `"$schema": ".../1.6"`, the renderer silently drops the card and renders nothing, or renders `fallbackText`. There is no thrown error — the component just shows blank space. Worse, if the card uses 1.5-only elements (Tables, RichTextBlock with inline images) on a renderer configured for 1.3, those elements are silently dropped rather than causing a visible failure.

**Why it happens:**
The `adaptivecards` package ships with a default `maxVersion` that may not match the schema version in card templates returned by Copilot Studio. Copilot Studio can return cards with schema versions beyond what the renderer is configured to accept.

**How to avoid:**
- Explicitly configure `AdaptiveCard.onParseError` to log parse errors to console during development.
- Set `AdaptiveCard.onParseElement` to catch unknown element warnings.
- Configure the host's `adaptiveCard.allowCustomStyle` and `maxVersion` explicitly in HostConfig.
- Establish a card schema version policy: all card templates in Copilot Studio declare `"$schema": ".../1.5"`, and the renderer is configured with `maxVersion = "1.5"`.
- Add a test card in the dev environment that uses a 1.5-only element (e.g., a Table) to verify the renderer is configured correctly.

**Warning signs:**
- Card response arrives in the network tab but the chat UI shows blank space where the card should be.
- `fallbackText` appears instead of card content.
- No error logged to console despite expected card content.

**Phase to address:** Adaptive Card rendering phase, before any Copilot Studio card templates are authored.

---

### Pitfall 4: Card Action Allowlist Enforcement Missing or Bypassable Server-Side

**What goes wrong:**
The `Action.Submit` payload from an Adaptive Card is client-controlled. A malicious user can craft a POST body to `/api/chat/card-action` that contains arbitrary action types, overridden data fields, or injected keys that the server forwards directly to Copilot Studio. Without strict allowlist enforcement on the server, the server becomes a proxy for arbitrary Copilot Studio API calls.

**Why it happens:**
Client-side Adaptive Cards validation (the `isRequired`, `regex`, `min`/`max` properties) runs in the browser and can be bypassed entirely — any POST to `/api/chat/card-action` with a crafted body skips it. Developers trust client-side validation and do not duplicate it server-side.

**How to avoid:**
- The Express `/api/chat/card-action` handler must validate every submitted payload against a server-side schema before forwarding to Copilot Studio. Use the Zod schema in `shared/` for this.
- Maintain an explicit action-type allowlist. Reject any `action.type` not in the allowlist (e.g., only allow `Action.Submit` with known `verb` values).
- For `Action.OpenUrl`, enforce a domain allowlist — strip or reject URLs whose hostname is not in an approved list.
- Never forward the raw client payload to Copilot Studio; construct a new, validated payload from the parsed fields.
- The official Microsoft guidance states clearly: "Never rely solely on client-side data — always verify in the flow backend."

**Warning signs:**
- `/api/chat/card-action` accepts and forwards any JSON body without schema validation.
- No Zod parse step before the Copilot Studio forwarding call.
- `Action.OpenUrl` handlers forward the client-supplied URL without hostname checking.

**Phase to address:** API layer phase — must be designed into the endpoint, not bolted on later.

---

### Pitfall 5: Conversation State Stored Only in Express Process Memory

**What goes wrong:**
The Node server maps `conversationId` → `token` / SDK session in a JavaScript `Map` or module-level variable. This works in single-process dev but fails in production: process restarts (deploys, crashes, Azure scaling events) silently invalidate all active conversations. Users mid-conversation get opaque errors. Sticky sessions with load balancers can mask this in QA but not in production.

**Why it happens:**
Using a module-level Map is the fastest path to make the `/api/chat/start` → `/api/chat/send` flow work. It feels fine during development with one process.

**How to avoid:**
- Design the conversation state store as an interface from day one, even if the initial implementation is in-memory. This allows swapping to Redis, CosmosDB, or Azure Table Storage without changing endpoint logic.
- In v1, use the in-memory store but add a TODO comment at the store interface explaining the production replacement requirement.
- Document in `.env.example` which env vars are needed for the production store.
- The DirectLine token has a 30-minute expiry and can be refreshed. The refresh logic must also be in the store abstraction, not inline in route handlers.

**Warning signs:**
- `const conversations = new Map()` at the top of an Express route file with no abstraction.
- Restarting the server invalidates all conversations without error messages to the client.
- No token refresh path implemented alongside the store.

**Phase to address:** Server scaffold phase — stub the interface before implementing any Copilot SDK calls.

---

### Pitfall 6: MSAL OBO Token Placeholder Stubs That Silently Skip Auth

**What goes wrong:**
The project plan stubs MSAL On-Behalf-Of (OBO) token flow with TODO comments. If stubs always return a hardcoded success response or skip the token validation gate entirely, the API works in development but is completely unauthenticated. This is easy to miss in code review — the endpoint structure looks correct but the auth gate never rejects anything.

**Why it happens:**
Placeholder stubs are intentional for v1. The danger is when the stub implementation is `const token = req.headers.authorization; // TODO validate` and the rest of the handler continues regardless of what the token contains.

**How to avoid:**
- Stubs must actively fail-closed, not fail-open. Use a feature flag or environment variable (`AUTH_REQUIRED=false`) that disables auth checking; when `AUTH_REQUIRED=true` (the default), the stub must reject requests with a 401 if no Authorization header is present.
- The stub should log a warning on every request: `[AUTH STUB] Token validation skipped — not for production`.
- Document in README which env var enables bypass and that it must never be true in production.
- For actual OBO implementation later: the MSAL Node OBO flow requires passing an access token (not an ID token) to `acquireTokenOnBehalfOf`. Using the ID token is a common mistake that produces cryptic 400 errors from Entra ID. Target the specific tenant ID in the authority URL — using `/common` breaks OBO for guest users.

**Warning signs:**
- All requests succeed when no `Authorization` header is sent.
- `console.log` showing "Token validation skipped" appears in production logs.
- Unit tests for the auth middleware never test the rejection path.

**Phase to address:** Server scaffold phase — define the auth middleware contract before any route handler is written.

---

### Pitfall 7: Vite Dev Proxy Misconfiguration Causing Production CORS Failures

**What goes wrong:**
During development, Vite's `server.proxy` transparently forwards `/api/*` requests to the Express server, eliminating CORS issues in the browser. Developers validate the full flow and ship to production — where the Vite dev server does not exist. In production, the React bundle is served statically (e.g., from Azure Static Web Apps or an Express static middleware) and the browser makes direct cross-origin requests to the Express API. If the Express server does not have a proper `cors()` configuration with the production frontend origin, every API call fails with a CORS error that never appeared in dev.

**Why it happens:**
The Vite proxy works so seamlessly that developers never test CORS in a production-like setup. `cors({ origin: '*' })` is sometimes added as a "fix" in dev and committed, creating a security misconfiguration in production.

**How to avoid:**
- Add `cors` middleware to Express from day one, driven by an environment variable: `ALLOWED_ORIGINS=https://myapp.example.com`. Use `origin: '*'` only in development with a guard: `if (process.env.NODE_ENV === 'production') { assert ALLOWED_ORIGINS is set }`.
- Run a production build check as part of CI: serve the built React app via `express.static` and confirm API requests succeed without the Vite proxy.
- Never use `cors({ origin: '*' })` in the production code path.

**Warning signs:**
- `cors({ origin: '*' })` in the Express app without a `NODE_ENV` guard.
- No `ALLOWED_ORIGINS` variable in `.env.example`.
- Developers have never run `npm run build && npm start` and tested the API from the built client.

**Phase to address:** Server scaffold phase and CI phase.

---

### Pitfall 8: npm Workspaces Zod Version Split Causing `instanceof ZodError` Failures

**What goes wrong:**
The `shared/` package declares `zod` as a dependency. `client/` and `server/` also declare `zod` (even the same version). npm workspaces hoisting may install two separate copies of Zod in `node_modules`. A Zod schema instance created in `shared/` is not the same class as Zod imported in `server/`, so `error instanceof ZodError` returns `false` even when the error is structurally a `ZodError`. Error handling code silently falls through to a generic 500 handler.

**Why it happens:**
npm workspace hoisting is non-deterministic when versions are not pinned identically. Developers don't notice because the runtime behaviour is identical — only the `instanceof` check fails, and only in catch blocks.

**How to avoid:**
- Declare Zod as a dependency in `shared/` only. In `client/package.json` and `server/package.json`, reference `zod` as a peer dependency or omit it entirely, resolving via the workspace symlink.
- Alternatively, pin the exact same version string in all three `package.json` files and add a lockfile check to CI that fails if multiple Zod versions are detected: `npm ls zod 2>&1 | grep -c "zod@" | xargs -I{} test {} -eq 1`.
- Use `error.issues` existence check as a fallback instead of `instanceof ZodError` in catch blocks.

**Warning signs:**
- `npm ls zod` shows more than one version installed.
- Catch blocks that check `instanceof ZodError` never match in tests even when Zod throws.
- `shared/package.json` and `server/package.json` both list `zod` as a direct dependency.

**Phase to address:** Monorepo scaffold phase — verify with `npm ls zod` immediately after workspace setup.

---

### Pitfall 9: `agentIdentifier` Deprecation Breaking Upgrades

**What goes wrong:**
The `CopilotStudioConnectionSettings` interface marks `agentIdentifier` as deprecated in favour of `schemaName`. Early SDK samples (many still in the wild) use `agentIdentifier`. Projects built with the deprecated field will break silently on a future SDK minor version that drops it, with no TypeScript warning at build time until then.

**Why it happens:**
The deprecated field still works in the current SDK version. TypeScript's `@deprecated` JSDoc tag shows an IDE strikethrough warning but does not cause a build error. Copy-pasted samples use the old field name.

**How to avoid:**
- Use `schemaName` from the start — never use `agentIdentifier` in new code.
- Add an ESLint rule or a grep check in CI: `grep -r "agentIdentifier" server/` must return nothing.
- When reading Microsoft SDK samples, check the SDK version they target. The JS SDK is at v1.x with active breaking changes between minors.

**Warning signs:**
- `agentIdentifier` appears in any configuration object.
- IDE shows strikethrough on the property name but no build error.

**Phase to address:** SDK integration phase — first call to connect to Copilot Studio.

---

### Pitfall 10: Submitted Card State Not Disabled — Duplicate Action Submissions

**What goes wrong:**
A user submits an Adaptive Card form. The network request takes 2–3 seconds. The user clicks Submit again. The server receives two identical card action requests for the same `conversationId`. Copilot Studio processes both, producing duplicate side effects in downstream flows (e.g., two records created, two emails sent, two approvals triggered).

**Why it happens:**
The React component renders the card and attaches the submit handler. Without explicit "pending" state management, the card remains interactive during the inflight request. The `adaptivecards-react` package does not disable inputs automatically on action fire.

**How to avoid:**
- After an `Action.Submit` fires, immediately set the card to a "submitted" / "pending" state in React state. Pass the pending flag to the card renderer to show a loading indicator and disable the submit button.
- The project requirements already specify "submitted cards disabled with pending state after action" — implement this in the first card render, not as a polish pass.
- Server-side: implement idempotency — cache recent `(conversationId, actionId)` pairs for 60 seconds and reject duplicates with HTTP 409.

**Warning signs:**
- Double-clicking a card Submit button sends two network requests (visible in the Network tab).
- No loading/pending state visible in the UI between Submit click and response.
- No idempotency key in the `/api/chat/card-action` request body.

**Phase to address:** Adaptive Card + API layer phase — both UI state and server idempotency must land together.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Module-level `Map` for conversation state | Fastest to implement | Process restart kills all sessions; breaks horizontal scaling | MVP only — must have interface abstraction from day one |
| `cors({ origin: '*' })` | Eliminates CORS friction in dev | Security misconfiguration in production | Never in production; dev-only with explicit guard |
| Skip server-side card payload validation | Less code, faster iteration | Any user can POST arbitrary data to Copilot Studio | Never — validation must exist from first endpoint |
| Hardcode schema version in renderer | Simpler initial config | Cards fail silently when Copilot Studio returns a different version | Never — always configure `maxVersion` and parse error handlers explicitly |
| Fail-open auth stubs | Easier local development | Entire API is unauthenticated if deployed by mistake | Only with a feature-flag guard and `NODE_ENV !== 'production'` enforcement |
| Inline Copilot SDK calls in route handlers | Faster to write | No abstraction = cannot test without real Copilot Studio connection | Never — wrap SDK in a service class mockable in unit tests |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Copilot Studio SDK (`@microsoft/agents-copilotstudio-client`) | Passing `agentIdentifier` (deprecated) instead of `schemaName` | Always use `schemaName` from Settings > Advanced > Metadata |
| Copilot Studio SDK | Using `directConnectUrl` and also passing `environmentId`/`schemaName` — when `directConnectUrl` is provided, all other settings are ignored | Use one configuration approach; document which is active |
| Copilot Studio Web Channel Security | Leaving "Require secured access" disabled after enabling it — propagation takes up to 2 hours; old setting remains active during propagation window | Plan security enablement during low-traffic windows; test after full propagation |
| DirectLine token refresh | Token expires in 1800 s (30 min). If the server does not refresh it before expiry, mid-conversation sends return 401. Expired tokens cannot be refreshed — a new token (new conversation) is required | Implement token refresh on a 25-minute timer or before each send if `expires_at` is within 5 minutes |
| Adaptive Cards `adaptivecards-react` | Missing `swiper` peer dependency causes "Module not found" build error | `npm install adaptivecards-react swiper` — add both to `client/package.json` |
| Zod shared schema | Multiple Zod instances from workspace hoisting breaks `instanceof ZodError` | Single Zod source in `shared/`; verify with `npm ls zod` |
| MSAL OBO flow | Passing ID token instead of access token to `acquireTokenOnBehalfOf` | Validate that the token passed to OBO has `aud` matching the API's `clientId`, not the client app's `clientId` |
| MSAL OBO flow | Using `/common` authority breaks OBO for guest users | Always target the specific tenant: `https://login.microsoftonline.com/{tenantId}` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-rendering full card list on every new message | Chat stutters as conversation grows; old cards flicker | Memoize each card component with `React.memo`; key cards by a stable `activityId`, not array index | Noticeable at ~20 messages in the transcript |
| Polling or long-polling for Copilot responses instead of streaming | Response latency doubles; server load increases; user experience degrades | Use the SDK's async iterator / streaming activity model from the start | Immediately visible to users on slow agents (>2s response) |
| Loading the full Adaptive Cards JS bundle unconditionally | Initial page load is slow even before any card is shown | Lazy-import `adaptivecards-react` with `React.lazy` + `Suspense` — load only when first card arrives | Bundle size ~300KB gzipped; noticeable on mobile/slow connections |
| Storing full activity JSON in React state for every turn | Memory grows unbounded in long conversations | Store only the normalised message schema (not raw SDK activities); implement a transcript window limit | Becomes a memory issue at ~100 turns |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| DirectLine secret in any `VITE_*` env var | Secret exposed to all users via JS bundle; permanent channel access for attacker | Secret lives only in `server/.env`; never in `client/.env` |
| Forwarding raw card action payload from client to Copilot Studio | Arbitrary data injection into agent flows; potential to trigger unintended actions | Parse and validate against Zod schema in `shared/`; construct new payload from validated fields |
| `Action.OpenUrl` domain allowlist not enforced | Phishing / open redirect via card button | Validate URL hostname against an allowlist on the server before allowing card action |
| Auth stub set to fail-open in production | Entire API accessible without authentication | `AUTH_REQUIRED=true` default; fail-open only when explicitly disabled via env var; CI check |
| No CSRF protection on card action endpoint | Cross-site request forgery on authenticated card submissions | Validate `Origin` header matches allowed origins; use `SameSite=Strict` cookies if session cookies are in use |
| Trusting Adaptive Cards client-side `isRequired` / `regex` validation | Any crafted HTTP request bypasses browser validation entirely | Duplicate all validation server-side with Zod; treat card submissions as untrusted user input |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No optimistic user message bubble | Chat feels unresponsive; user does not know if Send was received | Show a user bubble immediately on send (optimistic); mark it pending; replace with confirmed message on response |
| Card remains interactive after Submit | Duplicate submissions; user confusion about whether form was submitted | Immediately disable all card inputs and show a spinner after first Submit click; re-enable on error |
| Generic error messages ("Something went wrong") | User cannot determine if they should retry, refresh, or report an issue | Map error types to actionable messages: network error → "Check your connection, try again"; 401 → "Session expired, refresh page"; 429 → "Too many requests, wait a moment" |
| `fallbackText` rendered as plain text for unsupported cards | User sees raw card description text, no understanding of why form is missing | Detect `fallbackText` rendering and show a contextual error: "This card requires a newer version of the app" |
| Reduced-motion not respected in loading skeleton / typing indicator | Violates accessibility standards; can cause discomfort for users with vestibular disorders | Check `prefers-reduced-motion` media query; replace animated skeletons with static placeholders when active |

---

## "Looks Done But Isn't" Checklist

- [ ] **Card action submit:** Buttons are visible and styled — verify they fire an actual network request by clicking and checking the Network tab. The `dangerouslySetInnerHTML` anti-pattern produces cards that look correct but do nothing.
- [ ] **Auth middleware:** All endpoints return 200 — verify the middleware rejects a request with no `Authorization` header (should return 401, not 200).
- [ ] **CORS in production:** API works in `npm run dev` — verify it also works after `npm run build` with the built client served statically (Vite proxy is gone in production).
- [ ] **Card pending state:** Card disables inputs after Submit — verify by opening DevTools Network throttling to "Slow 3G" and confirming the Submit button is non-interactive while the request is inflight.
- [ ] **Token refresh:** Conversation works immediately — verify that a conversation started and left idle for 31+ minutes continues to work (token must be refreshed before expiry).
- [ ] **Schema version:** Cards render with text content — verify that a card using a 1.5-only element (e.g., a Table) renders correctly, not as blank space or `fallbackText`.
- [ ] **Zod single instance:** Validation errors are caught correctly — run `npm ls zod` from monorepo root and confirm exactly one version at one path.
- [ ] **No credentials in client bundle:** React app build completed — run `grep -r "COPILOT\|directline\|botframework" dist/` and confirm no SDK secrets or endpoint URLs appear.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| DirectLine secret exposed in browser | HIGH | Immediately rotate both secrets in Copilot Studio Web Channel Security; update server env vars; redeploy; audit logs for unauthorized conversations |
| `dangerouslySetInnerHTML` card rendering | MEDIUM | Replace card render component with `adaptivecards-react`; regression-test all existing card templates for action firing |
| Schema version mismatch causing blank cards | LOW | Add explicit `maxVersion` to renderer HostConfig; add `onParseError` logging; update card templates to target the configured version |
| Module-level Map conversation state lost on restart | MEDIUM | Implement the store interface (was deferred); swap Map for Redis or a simple SQLite file for persistence; users must restart conversations |
| Zod dual-instance issue | LOW | Align Zod versions across all `package.json` files; `npm install`; verify with `npm ls zod`; update catch blocks to avoid `instanceof` where necessary |
| Cors `*` in production | LOW-MEDIUM | Update `ALLOWED_ORIGINS` env var to specific origins; redeploy; no user data is at risk but requests from unauthorised origins were permitted |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| DirectLine secret in browser | Phase 1: Server scaffold | `grep -r "COPILOT" client/` returns nothing; Network tab shows no direct Copilot Studio calls from browser |
| `dangerouslySetInnerHTML` card rendering | Phase 2: Adaptive Card renderer | Click test on first prototype card — Submit button fires a network request |
| Schema version mismatch | Phase 2: Adaptive Card renderer | Render a Table element (AC 1.5 only) and confirm it displays |
| Card action allowlist missing | Phase 2: `/api/chat/card-action` endpoint | Send a crafted POST with an unlisted action type — server must return 400 |
| Conversation state in process memory | Phase 1: Server scaffold | Stub the store interface; add TODO for production replacement |
| Fail-open auth stubs | Phase 1: Server scaffold | Unit test that all endpoints return 401 with no Authorization header |
| Vite proxy CORS gap | Phase 1: Server scaffold + Phase 4: CI | CI job builds and smoke-tests the production bundle with CORS headers |
| Zod dual-instance | Phase 1: Monorepo setup | `npm ls zod` check in CI; instanceof test in shared validation unit tests |
| `agentIdentifier` deprecation | Phase 1: SDK integration | ESLint grep rule or CI check; code review checklist item |
| Duplicate card submissions | Phase 2: Card UI + Phase 2: API layer | Double-submit test: rapid-click Submit and confirm only one request in Network tab |

---

## Sources

- [Top 10 actions to build agents securely with Microsoft Copilot Studio — Microsoft Security Blog, Feb 2026](https://www.microsoft.com/en-us/security/blog/2026/02/12/copilot-studio-agent-security-top-10-risks-detect-prevent/)
- [Configure web and Direct Line channel security — Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-copilot-studio/configure-web-security)
- [Integrate with web or native apps using Microsoft 365 Agents SDK — Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-copilot-studio/publication-integrate-web-or-native-app-m365-agents-sdk)
- [Input Validation — Adaptive Cards, Microsoft Learn](https://learn.microsoft.com/en-us/adaptive-cards/authoring-cards/input-validation)
- [Actions not working when renderer used via ReactJS — GitHub microsoft/AdaptiveCards Issue #6192](https://github.com/microsoft/AdaptiveCards/issues/6192)
- [Adaptive card render not showing using React app with Typescript — GitHub Issue #8678](https://github.com/microsoft/AdaptiveCards/issues/8678)
- [adaptivecards-react should list swiper as dependency — GitHub Issue #8505](https://github.com/microsoft/AdaptiveCards/issues/8505)
- [CopilotStudioConnectionSettings interface — Agents-for-js API docs v1.3.0-beta](https://microsoft.github.io/Agents-for-js/interfaces/_microsoft_agents-copilotstudio-client.CopilotStudioConnectionSettings.html)
- [Known Issues in Microsoft 365 Copilot Extensibility — Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/known-issues)
- [The Good, The Bad, and The Ugly of Copilot Studio — Ragnar Heil, 2025](https://ragnarheil.de/the-good-the-bad-and-the-ugly-of-copilot-studio-a-brutally-honest-review-going-into-late-2025/)
- [Microsoft identity platform and OAuth2.0 On-Behalf-Of flow — Microsoft Learn](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-on-behalf-of-flow)
- [OBO flow not using refresh tokens — GitHub AzureAD/microsoft-authentication-library-for-js Issue #5330](https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/5330)
- [Cannot import Zod schema from monorepo package — GitHub colinhacks/zod Issue #2617](https://github.com/colinhacks/zod/issues/2617)
- [Adaptive Cards version 1.5 Teams rendering issue — GitHub Issue #9801](https://github.com/MicrosoftDocs/msteams-docs/issues/9801)
- [Save user and conversation data — Bot Service, Microsoft Learn](https://learn.microsoft.com/en-us/azure/bot-service/bot-builder-howto-v4-state?view=azure-bot-service-4.0)
- [Managing TypeScript Packages in Monorepos — Nx Blog](https://nx.dev/blog/managing-ts-packages-in-monorepos)
- [401 Error in Custom Teams Tab to Copilot Studio Direct Line Integration — Microsoft Q&A](https://learn.microsoft.com/en-sg/answers/questions/2276885/401-error-in-custom-teams-tab-to-copilot-studio-di)

---
*Pitfalls research for: React + Node chat app with Microsoft Copilot Studio SDK + Adaptive Cards (monorepo)*
*Researched: 2026-02-19*
