# Pitfalls Research

**Domain:** React + Node chat app with Microsoft Copilot Studio SDK + Adaptive Cards (monorepo)
**Researched:** 2026-02-19 (expanded 2026-02-21 for v1.4 Redis persistence)
**Confidence:** MEDIUM (original); HIGH (Redis additions from current research)

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

## Redis Persistence Pitfalls (v1.4 Milestone)

### Pitfall 11: Silent Fallback Masking Redis Failures

**What goes wrong:**
When Redis becomes unavailable, the application falls back to in-memory store without surfacing the error. Users get stale data or lose recent messages; production continues silently returning degraded state, and the team doesn't know persistence is broken until data loss is discovered.

**Why it happens:**
"Silent fallback seems safe" — if Redis is down, just return from in-memory, right? This avoids error pages in development. However, after v1.4, Redis is the source of truth. A silent fallback means:
- You're serving wrong (stale) data to users
- The application appears healthy while persistence is broken
- Restarted instances lose all conversation state
- Multi-instance deployments diverge (instance A has message X, instance B doesn't)

**How to avoid:**
1. **Return 503 Service Unavailable when Redis is down** (not 200 with stale data)
2. **Implement circuit breaker**: after N consecutive Redis failures, fail loudly rather than silently
3. **Separate concerns**: distinguish between "Redis read failed" (could try in-memory fallback for reads only) vs. "Redis write failed" (must fail the request)
4. **Log every Redis connection error** with unique request ID; surface in monitoring
5. **Add explicit health check endpoint** that reports Redis connectivity; fail it when Redis is unavailable
6. **Never retry silently** — log, increment metrics, surface to client
7. **Define SLA**: at what percentage failure rate should you blow a circuit?

**Warning signs:**
- Production mysteriously loses messages after restarts (but no error logs)
- Different deployment instances show different conversation history
- Redis is down but health check passes
- Monitoring shows no errors but users report missing messages

**Phase to address:**
Phase 1 (Store factory + health check). Add explicit failure mode tests: stop Redis mid-test, verify 503 response, verify error is logged.

---

### Pitfall 12: Serializing Opaque SDK References (sdkConversationRef)

**What goes wrong:**
The Copilot SDK returns an opaque `sdkConversationRef` object (type: `unknown`). You serialize it with `JSON.stringify()`, persist to Redis, retrieve it, and later try to use it in an SDK call. The Copilot SDK client rejects the deserialized object because:
- Internal SDK pointers are lost (functions become null)
- Socket/stream references are severed
- Closure state is missing
- The object is no longer the same reference type the SDK expects

Result: "Invalid conversation reference" error when resuming a conversation from Redis.

**Why it happens:**
`JSON.stringify()` strips prototypes, functions, and non-serializable properties. When you `JSON.parse()` it back, you have a plain object, not the original SDK-constructed reference. The SDK API signature requires a specific type; a plain object fails type-checking at runtime.

**How to avoid:**
1. **Never serialize `sdkConversationRef` directly**. Instead:
   - Store only the **conversation ID string** in Redis
   - Reconstruct a fresh `sdkConversationRef` by calling Copilot SDK (e.g., `startConversation()` again or fetch via conversation history)
   - **Document this assumption**: "sdkConversationRef is not persistent; it is session-scoped"

2. **If you must store the ref** (because re-fetching is expensive):
   - Ask Microsoft Copilot SDK team: "Can you serialize/deserialize a sdkConversationRef?"
   - Use v8 module `serialize()` / `deserialize()` only as last resort (performance cost, security risk)
   - **Test thoroughly**: deserialize and call `sendMessage()` end-to-end with live Copilot Studio

3. **Create a StoredConversation schema** that holds:
   ```typescript
   {
     conversationId: string,        // The actual conversation ID you can use
     userId: string,
     startedAt: number,
     messages: NormalizedMessage[], // Serializable, already tested
     // DO NOT STORE:
     // sdkConversationRef: unknown  // ← Never here
   }
   ```

4. **Add migration helper**: if any old Redis keys contain `sdkConversationRef`, delete them and force re-start

**Warning signs:**
- SDK returns "invalid reference" or type errors during `sendMessage()`
- Conversation works first time, fails on resumed session
- Deserializing `sdkConversationRef` from Redis changes its type signature

**Phase to address:**
Phase 1 (Serialization layer). Before writing any conversation to Redis, test: store `sdkConversationRef`, retrieve it, pass to SDK. If it fails, redesign to not serialize refs.

---

### Pitfall 13: Azure Redis TLS Misconfiguration (rediss://, Port 6380)

**What goes wrong:**
You configure ioredis with `redis://` protocol and port 6379, but Azure Cache for Redis requires `rediss://` and port 6380. Connection hangs or fails with misleading errors like "connection timeout" or "WRONG_TYPE" (because you're hitting the wrong port). If you force port 6380 without TLS, it silently resets the connection mid-request, corrupting your data integrity.

**Why it happens:**
- Default Redis examples show `redis://` + 6379
- Azure's documentation is clear, but developers often miss or ignore it
- The port number doesn't immediately fail; it tries to connect to the wrong service
- TLS is optional locally but **mandatory on Azure** — missing TLS is silently rejected

**How to avoid:**
1. **Use `rediss://` protocol** when REDIS_URL contains "azure" or includes `tls: true`:
   ```typescript
   const url = process.env.REDIS_URL || '';
   const tlsEnabled = url.includes('rediss://') || process.env.REDIS_TLS === 'true';
   const port = tlsEnabled ? 6380 : 6379;

   const client = new Redis({
     host: process.env.REDIS_HOST,
     port: port,
     password: process.env.REDIS_PASSWORD,
     tls: tlsEnabled ? { rejectUnauthorized: false } : undefined,
     // For Azure specifically:
     servername: process.env.REDIS_HOST, // Required for TLS cert validation
   });
   ```

2. **Document in `.env.example`**:
   ```bash
   # Local Redis (non-TLS)
   REDIS_URL=redis://localhost:6379

   # Azure Cache for Redis (TLS required)
   REDIS_URL=rediss://<name>.redis.cache.windows.net:6380
   REDIS_PASSWORD=<access-key>
   ```

3. **Test both paths**:
   - Unit test with ioredis-mock (local, no TLS needed)
   - Integration test against real Azure Redis (with rediss://, port 6380)

4. **Add startup validation**:
   ```typescript
   const redisUrl = process.env.REDIS_URL || '';
   if (redisUrl.includes('azure') && !redisUrl.includes('rediss://')) {
     console.error('REDIS_URL contains "azure" but uses redis:// instead of rediss://');
     process.exit(1);
   }
   ```

5. **Handle `rejectUnauthorized`**:
   - Default `true` (safe, validates cert)
   - Set `false` only in dev/test; document why
   - Azure-provided certs should work with default `true` — if not, investigate cert chain

**Warning signs:**
- Connection timeout (hangs for 30+ seconds before failing)
- "ERR Protocol error: expected '$', got 'H'" (indicating wrong port, hitting HTTP server)
- Intermittent "WRONGTYPE" errors (different operations hit different services)
- ioredis reconnection loop with no clear error

**Phase to address:**
Phase 1 (Store factory). Add explicit Azure Redis test (with real credentials in CI/CD or manual smoke test).

---

### Pitfall 14: Date Serialization in Messages (Becomes String, Not Date Object)

**What goes wrong:**
You store `NormalizedMessage` with `timestamp: new Date()` or `createdAt: Date.now()`. When you `JSON.stringify()` and persist to Redis, the Date becomes an ISO string like `"2026-02-21T14:30:00.000Z"`. When you deserialize, it's a **string**, not a Date object. Downstream code that does `message.createdAt.getTime()` crashes with "getTime is not a function". Comparisons like `createdAt > someDate` silently behave wrong (string comparison, not date comparison).

**Why it happens:**
`JSON.stringify()` automatically converts Date to ISO string. `JSON.parse()` doesn't reverse this — it has no way to know `"2026-02-21T14:30:00.000Z"` should be a Date. The Zod schema in `shared/` might have `z.date()`, but you're loading raw JSON from Redis before Zod parsing, so the schema doesn't catch it.

**How to avoid:**
1. **Always run deserialized data through Zod schemas**:
   ```typescript
   // In RedisStore.getConversation(conversationId):
   const raw = await redis.get(key);
   const parsed = JSON.parse(raw); // ← Still has string timestamps

   // ✓ CORRECT: Pass through Zod
   const validated = NormalizedMessageSchema.parse(parsed);
   return validated; // Now timestamps are real Date objects (if Zod coerces)
   ```

2. **Use Zod `.pipe(z.coerce.date())`** or custom refine to convert ISO strings back to Date:
   ```typescript
   // In shared/src/schemas/conversation.ts:
   const NormalizedMessageSchema = z.object({
     // ...
     timestamp: z.union([
       z.date(),
       z.string().pipe(z.coerce.date()), // Accept ISO string, convert to Date
     ]),
   });
   ```

3. **Store timestamps as Unix milliseconds (numbers)** instead of Date objects:
   ```typescript
   {
     conversationId: string,
     messages: Array<{
       text: string,
       timestamp: number, // Unix ms, never ambiguous
     }>
   }
   ```
   This is safer and more Redis-friendly.

4. **Add deserialization helper**:
   ```typescript
   function deserializeMessage(raw: unknown): NormalizedMessage {
     // Zod does the heavy lifting; it will coerce timestamps
     return NormalizedMessageSchema.parse(raw);
   }
   ```

**Warning signs:**
- `createdAt.getTime()` error in production
- Message sort order changes unexpectedly (string sort ≠ date sort)
- Filtering by date doesn't work ("2026-01-01" > "2026-02-01" is true in string comparison)

**Phase to address:**
Phase 1 (Serialization layer). Add Zod parsing of all Redis values before returning to callers. Test: store date, retrieve, verify `typeof timestamp === 'object'` and `timestamp instanceof Date`.

---

### Pitfall 15: TTL Edge Cases — Stale Data Persists After Expiry

**What goes wrong:**
You set a conversation TTL of 24 hours. A user returns after 23.5 hours, sends a message, and you extend the TTL. But due to Redis' expiration algorithm, the key might still be in memory even though it's logically expired; or the TTL extension doesn't happen atomically, leaving a window where the key is deleted while you're writing to it. Or a bulk operation (e.g., "list all conversations for user") returns both expired and non-expired keys in one request, confusing your UI.

**Why it happens:**
Redis uses **lazy (passive) expiration**: a key is only deleted when accessed. In the worst case, ~25% of expired keys still occupy memory until the next background eviction run. If a conversation is accessed just before expiry, the client sees it's still there and may cache it; then 1 second later it's gone.

TTL updates aren't atomic with writes:
```typescript
// ✗ WRONG: Race condition
await redis.get(`conv:${id}`);     // Key exists
if (key) {
  // Between here and next line, key could be deleted by TTL
  await redis.set(`conv:${id}`, data);
  await redis.expire(`conv:${id}`, TTL); // TTL set on potentially-deleted key
}
```

**How to avoid:**
1. **Check existence explicitly before use**:
   ```typescript
   const exists = await redis.exists(`conv:${id}`);
   if (!exists) {
     // Don't assume it still exists; it could have expired
     throw new NotFoundError(`Conversation ${id} expired or not found`);
   }
   ```

2. **Use Redis GETEX command** (atomic get + extend TTL):
   ```typescript
   // Atomically fetch and extend TTL in one command
   const data = await redis.getex(`conv:${id}`, 'EX', TTL_SECONDS);
   if (!data) {
     // Key was expired (or never existed)
     throw new NotFoundError(`Conversation ${id} not found`);
   }
   ```

3. **Use SET with EX together** (atomic):
   ```typescript
   // ✓ CORRECT: One command, no race
   await redis.setex(`conv:${id}`, TTL_SECONDS, JSON.stringify(conversation));
   ```

4. **Add jitter to TTLs** to avoid thundering herd (all sessions expiring at once):
   ```typescript
   const baseTTL = 24 * 60 * 60; // 24 hours
   const jitter = Math.random() * 60 * 60; // ± 1 hour
   const ttl = baseTTL + jitter;
   ```

5. **Don't rely on TTL alone for consistency**:
   - Store `expiresAt` timestamp in the document
   - Check `expiresAt < Date.now()` on retrieval
   - For list queries, filter out logically-expired items
   ```typescript
   const conversations = await redis.lrange(...);
   const now = Date.now();
   const active = conversations.filter(c => c.expiresAt > now);
   ```

6. **Test TTL edge cases**:
   - Set TTL to 1 second, wait 2 seconds, try to read (should fail cleanly)
   - Set TTL, update it immediately, verify no race condition
   - Simulate Redis time skew (if possible) to catch logical expiry bugs

**Warning signs:**
- "Key not found" errors after user inactivity (but client expected it)
- Stale conversation data visible in one tab but not another
- List operations return inconsistent counts (some expired, some not)
- Memory usage doesn't drop after conversations "expire"

**Phase to address:**
Phase 1 (Store factory). Add unit tests with forced TTL (set to 1s, wait, verify retrieval fails). Add check for `expiresAt` field in every retrieve operation.

---

### Pitfall 16: Connection Pool Exhaustion Under Load

**What goes wrong:**
ioredis creates a connection pool (default ~10 connections). Under heavy chat load (e.g., 100 concurrent users each sending 1 message/sec), the pool fills up. New requests queue and eventually timeout after the default 30s. The app responds slowly or with 5xx errors. You don't notice until production load hits; local dev never triggers it.

**Why it happens:**
Each request acquires a connection from the pool. If responses are slow (e.g., Copilot SDK takes 3s, user retries after 2s), connections pile up. The pool size is fixed; no new connections are created once the max is reached. Requests wait in a queue; if they wait too long, they timeout.

**How to avoid:**
1. **Configure ioredis pool size based on expected concurrency**:
   ```typescript
   // Calculate: (expected_concurrent_users * requests_per_sec) + buffer
   const poolSize = process.env.NODE_ENV === 'production'
     ? 50  // For 100 users, ~50 connections is safe
     : 10; // Local dev: smaller

   const redis = new Redis({
     // ...
     maxRetriesPerRequest: 3,
     enableReadyCheck: true,
     enableOfflineQueue: true,
     retryStrategy: (times) => Math.min(times * 50, 2000),
     connectionPool: {
       max: poolSize,
     },
   });
   ```

2. **Add explicit timeout configuration**:
   ```typescript
   const redis = new Redis({
     // ...
     connectTimeout: 10000,     // 10s to establish connection
     commandTimeout: 5000,      // 5s per command
     keepAlive: 30000,          // Keep idle connections alive
     maxRetriesPerRequest: 3,
   });
   ```

3. **Monitor pool health**:
   ```typescript
   setInterval(() => {
     const stats = redis.status;
     console.log(`Redis connections: ${stats.connectedClients || 'unknown'}`);
     if (redis.getStatus?.() === 'connect') {
       // Emit to metrics: pool_connections_active
     }
   }, 60000);
   ```

4. **Implement request queuing with timeout**:
   ```typescript
   async function withRedisTimeout<T>(fn: () => Promise<T>, timeoutMs = 5000): Promise<T> {
     const timeoutPromise = new Promise<T>((_, reject) =>
       setTimeout(() => reject(new Error('Redis request timeout')), timeoutMs)
     );
     return Promise.race([fn(), timeoutPromise]);
   }
   ```

5. **Load test before shipping**:
   - Use artillery or k6: simulate 100 concurrent users, each sending messages
   - Monitor Redis connection count; it should plateau below max
   - Verify 99th percentile latency is acceptable

**Warning signs:**
- Response latency spikes to 30+ seconds under load
- "Redis command timeout" errors in logs
- Connection count = pool size (pool is saturated)
- Errors spike when load > pool size

**Phase to address:**
Phase 1 (Store factory). Add load test in CI: simulate concurrent requests, verify pool doesn't exhaust. Document pool size configuration and how to tune it.

---

### Pitfall 17: Dual-Write Consistency (In-Memory + Redis)

**What goes wrong:**
You implement the factory pattern: try Redis first, fallback to in-memory. But you also write to both (for safety during transition). A write succeeds in in-memory but fails in Redis (network error, quota exceeded). Later reads get inconsistent data: one instance has the message (from memory), another doesn't (Redis was never updated). Users see different conversations across sessions.

**Why it happens:**
Dual-writes are inherently racy. You need *transactions* to guarantee atomicity across two stores. Without them, partial failures are inevitable. In-memory writes are fast and almost never fail; Redis writes can timeout, reject, or be rate-limited. If you don't wait for both to succeed, you diverge.

**How to avoid:**
1. **Don't dual-write.** Pick one store as primary:
   - **Migration phase**: Redis-primary with in-memory fallback (reads only, on Redis miss)
   - **After migration complete**: Redis-only, delete in-memory store code
   - **Local dev**: in-memory only (no Redis required)

2. **If you must transition gradually**:
   - **Phase 1**: Write to Redis only; use in-memory cache as fallback (read-through)
   - **Phase 2**: Monitor Redis success rate for 2+ weeks
   - **Phase 3**: Remove in-memory code
   - Never write to both simultaneously

3. **Use store factory to select primary**:
   ```typescript
   const store = process.env.REDIS_URL
     ? new RedisStore(redis)
     : new InMemoryStore();

   // Single source of truth; never call both
   ```

4. **Add migration test**:
   - Start with in-memory
   - Add a message
   - Switch to Redis
   - Verify message is still there

**Warning signs:**
- Same conversation ID returns different message counts from different instances
- "Message disappeared after restart" (it was in-memory, not persisted to Redis)
- In-memory store has data that Redis doesn't have

**Phase to address:**
Phase 1 (Store factory). Explicitly document: "Primary store is [Redis|InMemory]. Fallback is [Redis|InMemory|None]." Do not write to both.

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
| Silent fallback when Redis unavailable | Simplifies error handling in dev | Production loses data; users see stale conversations | Never — fail loud with 503 |

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
| Azure Redis TLS | Use `redis://` + port 6379 instead of `rediss://` + 6380 | Always use `rediss://` and port 6380; set `tls: { servername: host }` in ioredis config |
| Conversation State | Store `sdkConversationRef` directly in Redis | Store only `conversationId` string; reconstruct ref from ID if needed |
| Message Timestamps | Serialize Date objects (become ISO strings) | Store as Unix milliseconds (number) or use Zod coercion to re-parse |
| User-Scoped Queries | Create sorted set index for every query | Add index only if you measure a query bottleneck; start with key scans |
| Fallback Strategy | Silently return in-memory data when Redis fails | Return 503 explicitly; log error; never hide Redis failures |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-rendering full card list on every new message | Chat stutters as conversation grows; old cards flicker | Memoize each card component with `React.memo`; key cards by a stable `activityId`, not array index | Noticeable at ~20 messages in the transcript |
| Polling or long-polling for Copilot responses instead of streaming | Response latency doubles; server load increases; user experience degrades | Use the SDK's async iterator / streaming activity model from the start | Immediately visible to users on slow agents (>2s response) |
| Loading the full Adaptive Cards JS bundle unconditionally | Initial page load is slow even before any card is shown | Lazy-import `adaptivecards-react` with `React.lazy` + `Suspense` — load only when first card arrives | Bundle size ~300KB gzipped; noticeable on mobile/slow connections |
| Storing full activity JSON in React state for every turn | Memory grows unbounded in long conversations | Store only the normalised message schema (not raw SDK activities); implement a transcript window limit | Becomes a memory issue at ~100 turns |
| Connection pool exhaustion | Latency spikes to 30s+, "timeout" errors | Configure pool size = expected concurrent users * 2; load test | >100 concurrent users or slow upstream |
| TTL-only consistency | Stale data persists until expiry; "key not found" surprises | Extend TTL atomically with GETEX; store expiresAt timestamp in doc | Heavy load or long TTLs (24h+) |
| Index scan is O(N) | Listing all conversations for user gets slow | Don't scan thousands of keys in-memory; use sorted set index with ZRANGE | User with >100 conversations |
| Serialization overhead | Every message write is 2x slower | Use efficient serialization (JSON is fine; avoid pickling); consider MessagePack for large payloads | Conversations with 1000+ messages |
| Memory fragmentation | Redis memory usage stays high even after deletes | Set appropriate eviction policy (allkeys-lru) and TTL; monitor memory growth | Long-lived conversations without TTL |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|-----------|
| DirectLine secret in any `VITE_*` env var | Secret exposed to all users via JS bundle; permanent channel access for attacker | Secret lives only in `server/.env`; never in `client/.env` |
| Forwarding raw card action payload from client to Copilot Studio | Arbitrary data injection into agent flows; potential to trigger unintended actions | Parse and validate against Zod schema in `shared/`; construct new payload from validated fields |
| `Action.OpenUrl` domain allowlist not enforced | Phishing / open redirect via card button | Validate URL hostname against an allowlist on the server before allowing card action |
| Auth stub set to fail-open in production | Entire API accessible without authentication | `AUTH_REQUIRED=true` default; fail-open only when explicitly disabled via env var; CI check |
| No CSRF protection on card action endpoint | Cross-site request forgery on authenticated card submissions | Validate `Origin` header matches allowed origins; use `SameSite=Strict` cookies if session cookies are in use |
| Trusting Adaptive Cards client-side `isRequired` / `regex` validation | Any crafted HTTP request bypasses browser validation entirely | Duplicate all validation server-side with Zod; treat card submissions as untrusted user input |
| Storing credentials in Redis | If Redis is breached, secrets are exposed | Never store COPILOT_CLIENT_ID or JWT secrets in Redis; only cache user tokens briefly (TTL 5min) with key prefix like `cache:jwt:{userId}` |
| Skipping TLS on Azure | Network traffic is unencrypted (man-in-the-middle possible) | Always use `rediss://` on Azure; set `tls: true` in ioredis |
| No authentication on Redis | Unauthenticated access from network | Always set `password` in Redis config; use `AUTH <password>` command |
| Persisting user PII | Privacy risk; GDPR/CCPA violation | Don't store email, phone, SSN in Redis; only store conversationId, userId (opaque), timestamp |
| Accepting arbitrary JSON from user | Code injection, prototype pollution | Validate all deserialized data with Zod; never `eval()` or `Function()` on Redis data |

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
- [ ] **Redis Store Initialized:** Store is created but `connect()` is never called; application proceeds without actual Redis connection.
- [ ] **Health Check Added:** Endpoint exists but never checked; returns 200 even if Redis is down.
- [ ] **Fallback Implemented:** In-memory fallback exists but is **silent** (no error, no logging).
- [ ] **Serialization Tested:** Unit tests exist but don't test round-trip (serialize → deserialize → use).
- [ ] **TTL Configured:** TTL set to 24h but never tested; edge case of expiry during active session not covered.
- [ ] **Azure Redis Tested:** Code works with local Redis but never tested against actual Azure Cache.
- [ ] **Pool Size Documented:** Config exists but no load test to verify pool is sized correctly.
- [ ] **Conversation Resume Works:** Conversation starts but resuming from Redis after restart is never tested.
- [ ] **User-Scoped Queries Work:** `listConversationsByUser` works but includes expired conversations.
- [ ] **Error Handling Explicit:** Store returns errors but routes catch them in a blanket `.catch(err => {...})` that hides the issue.

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
| Silent fallback masked Redis failure; data loss | HIGH | 1. Restore Redis backup. 2. Audit which conversations are missing. 3. Notify affected users. 4. Change strategy to 503 (fail loud). |
| sdkConversationRef not serializable | HIGH | 1. Delete all stored refs from Redis. 2. Force re-start conversations. 3. Redesign to store only conversationId. 4. Test deserialize → use end-to-end. |
| Azure Redis TLS misconfigured; connections fail | MEDIUM | 1. Update REDIS_URL to use `rediss://` 2. Restart app. 3. Verify `tls: { servername: ... }` in config. 4. Test against Azure Redis. |
| Date serialization bug; wrong timestamp sort | MEDIUM | 1. Add Zod coercion for timestamp deserialization. 2. Rebuild Redis keys (export, update, re-import). 3. Test round-trip serialization. |
| TTL race condition; conversation deleted mid-write | MEDIUM | 1. Use `GETEX` (atomic get + extend TTL). 2. Add expiresAt timestamp in document. 3. Test with 1-second TTL to force race condition. |
| Pool exhaustion; app becomes unresponsive | MEDIUM | 1. Increase pool size in config. 2. Add request queuing with timeout. 3. Implement circuit breaker. 4. Load test. |
| Stale data from in-memory fallback | MEDIUM | 1. Flip to Redis-primary (remove dual writes). 2. Monitor Redis success rate. 3. Add test to verify no divergence between stores. |
| Complex types lost in JSON (Map, Buffer) | LOW | 1. Add Zod coercion for Map (fromEntries) and Buffer (base64). 2. Test round-trip. 3. Update schema in shared/. |
| ioredis optional dependency missing | LOW | 1. Install ioredis explicitly. 2. Add check in code for missing module with clear error. 3. Update CI/CD to test without ioredis. |
| Index gets too large; query is slow | LOW | 1. Implement archival (move old conversations to PostgreSQL). 2. Trim Redis index to last 100 conversations per user. 3. Profile query latency. |

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
| Silent fallback masking failures | Phase 1 (v1.4): Store factory | Return 503 on Redis unavailable; health check endpoint fails when Redis is down; error is logged |
| Serializing sdkConversationRef | Phase 1 (v1.4): Serialization layer | Deserialize ref, pass to sendMessage(); no type error; end-to-end test with live Copilot |
| Azure Redis TLS misconfiguration | Phase 1 (v1.4): Store factory | Test against real Azure Cache with rediss://, port 6380; verify connection succeeds |
| Date serialization becomes string | Phase 1 (v1.4): Serialization layer | Store timestamp, retrieve, verify `instanceof Date` or run through Zod coercion |
| TTL edge cases (race, stale data) | Phase 1 (v1.4): Store factory | Unit test with 1-second TTL; test GETEX atomicity; verify expiresAt < now check |
| Connection pool exhaustion | Phase 1 (v1.4): Store factory + Phase 2: Load testing | Simulate 100+ concurrent users; monitor pool size; verify 99th percentile latency <2s |
| Dual-write consistency (in-memory + Redis) | Phase 1 (v1.4): Store factory | Remove dual writes; pick one store; test failover behavior with Redis unavailable |
| Complex type serialization (Map, Buffer) | Phase 1 (v1.4): Serialization layer | Test round-trip for any non-primitive types; add Zod coercion |
| ioredis optional dependency missing | Phase 1 (v1.4): Store factory | Test both paths: with ioredis, without ioredis; clear error message if Redis required but missing |
| Index write overhead | Phase 3 (v1.4): Optimization (after stable reads) | Add index only if query benchmark shows slowness; profile before and after |

---

## Sources

### Original Pitfalls Research (v1.0–v1.3b)

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

### Redis Persistence Pitfalls Research (v1.4)

- [How to Implement Caching with Redis in Express](https://oneuptime.com/blog/post/2026-02-02-express-redis-caching/view)
- [Redis Best Practices - Expert Tips for High Performance](https://www.dragonflydb.io/guides/redis-best-practices)
- [TLS configuration settings - Azure Cache for Redis | Microsoft Learn](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-tls-configuration)
- [Error handling | Redis Docs](https://redis.io/docs/latest/develop/clients/error-handling/)
- [Reliable Redis Connections in Node.js: Lazy Loading, Retry Logic & Circuit Breakers](https://medium.com/@backendwithali/reliable-redis-connections-in-node-js-lazy-loading-retry-logic-circuit-breakers-5d8597bbc62c)
- [What Are the Impacts of the Redis Expiration Algorithm?](https://redis.io/faq/doc/1fqjridk8w/what-are-the-impacts-of-the-redis-expiration-algorithm)
- [How to Implement Cache Invalidation with Redis](https://oneuptime.com/blog/post/2026-01-25-redis-cache-invalidation/view)
- [Considering a Redis Migration? Key Challenges and Solutions | Aerospike](https://aerospike.com/blog/redis-migration/)
- [Understanding the Activity Protocol | Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/activity-protocol)
- [Serialization and deserialization in Node.js - Honeybadger Developer Blog](https://www.honeybadger.io/blog/serialization-deserialization-nodejs/)
- [Connection pools and multiplexing | Redis Docs](https://redis.io/docs/latest/develop/clients/pools-and-muxing/)
- [How to Scale OpenAI Agents SDK: Redis Session Management for Production](https://llmshowto.com/scaling-openai-agents-sdk)

---

*Pitfalls research for: React + Node chat app with Microsoft Copilot Studio SDK + Adaptive Cards (monorepo)*
*Extended for: v1.4 Redis-backed persistent state store (Azure Cache for Redis)*
*Researched: 2026-02-19 (original); 2026-02-21 (Redis additions)*
