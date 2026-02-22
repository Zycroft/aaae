# Pitfalls Research

**Domain:** React + Node chat app with Microsoft Copilot Studio SDK + Adaptive Cards (monorepo)
**Researched:** 2026-02-19 (expanded 2026-02-21 for v1.4 Redis persistence; expanded 2026-02-21 for v1.5 Workflow Orchestration)
**Confidence:** MEDIUM (original); HIGH (Redis additions); HIGH (Workflow orchestration from current research)

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

## Workflow Orchestration and Structured Output Parsing Pitfalls (v1.5 Milestone)

### Pitfall 18: Sequential Processing Violation → Race Condition State Corruption

**What goes wrong:**
Multiple concurrent requests for the same conversation bypass workflow state machine, causing:
- Two simultaneous `POST /api/chat/send` calls both read stale `WorkflowState`, both execute the same step, both attempt context injection, both write conflicting state
- Redis sorted-set user index becomes inconsistent with conversation key state (SET succeeds, ZADD fails mid-pipeline)
- Workflow step counter increments twice for a single user message
- Parser processes the same Copilot response twice, extracting data twice, collectedData object has duplicate entries

**Why it happens:**
- No per-conversation lock enforcement in new routes — existing ConversationStore operations are atomic (pipeline) but orchestrator doesn't acquire locks before read-modify-write on WorkflowState
- Node.js is single-threaded but Express handles concurrent requests in event loop — multiple requests for conversationId='abc' execute concurrently, both call `store.get(conversationId)` before either calls `store.set()`
- Redis pipeline batches SET + ZADD + EXPIRE but doesn't guarantee ordering across multiple clients
- Existing v1.4 pipeline handles conversation persistence only; new orchestrator adds 3-4 read-modify-write operations (read state → inject context → send to Copilot → parse response → update state)

**Consequences:**
- Silent workflow advancement (user sees step N+2 responses instead of N) — hard to detect without logs
- Duplicate data in collectedData causes schema validation errors downstream
- User index (ZADD) becomes orphaned, `listByUser()` misses conversations after race condition
- Parser output gets corrupted (two parseErrors arrays merged, two timestamps on same extraction)

**Prevention:**
1. Implement Redis SET NX + GET pattern (or Lua script) for per-conversation lock:
   ```
   LOCK_KEY = `workflow:lock:${conversationId}`
   SET lock_key unique_token NX EX 5 seconds
   [execute orchestrator steps]
   DEL lock_key only if token still matches
   ```
2. Acquire lock BEFORE reading WorkflowState from store
3. If lock acquisition fails after 3 retries, return 503 (let client retry)
4. Set lock timeout to max expected orchestrator latency (from v1.3b measurements: 300-500ms for full round-trip) + 2s safety margin
5. Use idempotency key pattern: client provides `X-Idempotency-Key` header, store result keyed by (conversationId, idempotencyKey) for 60s
6. Log all lock acquisitions and contentions — early warning sign of traffic spikes or slow Copilot responses

**Detection:**
- Alert on repeated calls to `/health` that show diverging ConversationStore counts vs. user index size
- Monitor for step counter jumps > 1 in single request
- Track collectedData sizes — sudden duplication shows in logs
- Enable request-level tracing: correlate concurrent requests for same conversationId in logs

**Phase:** Phase 15 (Orchestrator Engine). Must address BEFORE shipping first version — race conditions are easier to fix upfront than retrofit.

---

### Pitfall 19: Context Window Overflow → Silent Failures or Truncated State

**What goes wrong:**
- Context builder naively includes full conversation history + full collectedData + full WorkflowState + system prompt → token count = 4K-12K tokens depending on conversation length
- Copilot Studio SDK has token limits per request (varies by model, but ~95K token context window typical for modern LLMs)
- First 10 messages fit, message 11 causes truncation, Copilot returns incomplete response due to context rot
- Parser tries to extract from truncated response, gets partial data or malformed JSON
- Workflow state shows stale "last 10 turns" instead of full history — user asks follow-up about turn #3, orchestrator has no record

**Why it happens:**
- Milestone doc specifies "context builder format must be configurable" but doesn't include token budgeting strategy
- Activity normalization (v1.3b) extracts structured payloads efficiently, but conversational context (each text message = 50-200 tokens) accumulates without bounds
- `[WORKFLOW_CONTEXT]` prefix format from v1.3b is compact, but still adds ~500 tokens per injection
- Copilot Studio SDK doesn't expose token counting to client code — can't predict overflow until request fails
- No early warning: request goes to Copilot, comes back truncated, parser interprets truncation as valid "no structured output" response, workflow continues in degraded state

**Consequences:**
- Conversation hallucination: user asks "like I said earlier, I'm in Seattle" (turn #4), Copilot has no context, invents answer or asks again
- Workflow step recommendations become stale or contradictory (recommender had full context, next step executor doesn't)
- Parser misses critical structured signals because source text was truncated mid-JSON-block
- Silent data loss: collectedData accumulates, but later workflow steps don't see earlier entries because Copilot never had context to recall them
- Cost explosion: retries on failures cause repeated Copilot calls with similar overlimit contexts

**Prevention:**
1. Implement token budgeting BEFORE context injection:
   ```typescript
   const TOKEN_BUDGET = 60_000; // Leave 35K for Copilot's response + reasoning
   const SYSTEM_PROMPT_TOKENS = 1_000; // Estimate
   const WORKFLOW_CONTEXT_TOKENS = estimateTokens(workflowContext); // ~500-1000
   const AVAILABLE_FOR_HISTORY = TOKEN_BUDGET - SYSTEM_PROMPT_TOKENS - WORKFLOW_CONTEXT_TOKENS;

   // Apply drop-oldest-first strategy if needed
   let messages = conversation.messages;
   while (estimateTokens(messages) > AVAILABLE_FOR_HISTORY) {
     messages.shift(); // Drop oldest
     logWarning(`Dropping turn ${messages.length} due to token budget`);
   }
   ```
2. Use rough token estimation (1 token ≈ 4 chars for English) initially; switch to official Copilot SDK token counter if available
3. Implement 3-tier context strategy:
   - **Tier 1 (< 40% budget):** Full conversation history + full collectedData
   - **Tier 2 (40-70% budget):** Last 20 turns + summary of earlier context + collectedData keys only (not full values)
   - **Tier 3 (70%+ budget):** Last 5 turns + collectedData keys only + step name + constraints
4. Add `contextTruncated` boolean to WorkflowContext — downstream steps know context is degraded
5. Track token usage in logs: `contextTokens: 2543, budgetAvailable: 60000, utilizationPercent: 4.2`
6. Create monitoring alert: if `contextTruncated: true` appears in > 5% of orchestrate requests, trigger incident

**Detection:**
- Monitor mean response time on `/api/chat/orchestrate` — spike indicates context overflow (Copilot taking longer to parse incomplete context)
- Track `parsedStructuredOutput.isPartial` flag — true means response was likely truncated
- Check ConversationStore message counts — if same conversation hits message 500+ with slow responses, likely context overflow
- Implement request-scoped logging: log token budget vs. actual usage on every request

**Phase:** Phase 15 (Orchestrator Engine). Must be designed into context builder from day 1 — refactoring after shipping is complex.

---

### Pitfall 20: Parser Brittleness + Silent Fallback to Unstructured Mode

**What goes wrong:**
- Parser is designed to "never throw — return parseErrors array" (per milestone constraints)
- Copilot changes response format slightly: field name shifts from `recommendation` to `next_recommendation`, parser doesn't find field, sets parseErrors: ["field 'recommendation' not found"]
- Code checks `if (parseErrors.length === 0)` to determine success, treats any error as "no structured output"
- Workflow continues in passthrough mode — user gets text-only response, orchestrator learns nothing about next step
- v1.4's backward-compat pattern (StoredConversation defaults) masks the issue — old recordings still work, new failures silent
- After 5 such failures, collectedData is incomplete, workflow state is stale, system escalates to human agent

**Why it happens:**
- Milestone specifies "passthrough mode when no structured output detected" for backward compat, but doesn't distinguish between "Copilot returned unstructured text" vs. "Copilot returned malformed structured output"
- Multi-strategy parsing (Activity.value > Activity.entities > text-embedded) was designed for flexibility, creates ambiguity on format drift
- No strict schema validation at Copilot Studio agent configuration level (agent can change response format without client knowing)
- Parser tests likely use mock Copilot responses (controlled format), don't test real drift scenarios
- ExtractedPayload Zod schema uses `z.refine()` to reject empty objects, but doesn't validate that key fields present — schema can pass with `{ confidence: 0.5, data: { something_unexpected: true } }`

**Consequences:**
- Silent workflow degradation: system functions but at reduced intelligence
- Data pipeline becomes unreliable: 70% of responses successfully parse, 30% silently fail, downstream analytics can't trust the data
- Hard to debug: logs show "passthrough mode" but don't explain why (was Copilot unstructured or parser failed?)
- Leads to over-engineering compensation: developers add more fallback logic, more edge cases, more test mocks, complexity explodes
- Breaking changes to Copilot agent configuration (which the milestone says is out of scope) silently break the client without warnings

**Prevention:**
1. Distinguish three states in parser output:
   ```typescript
   type ParserResult =
     | { kind: 'structured', data: ExtractedPayload }
     | { kind: 'unstructured', text: string } // Copilot explicitly returned text only
     | { kind: 'parse_error', text: string, errors: string[] }; // Copilot returned structured-like format that failed validation
   ```
2. Log mismatches between expected and actual format:
   ```typescript
   if (result.kind === 'parse_error') {
     logger.warn(`Parser error for conversationId=${id}`, {
       expectedSchema: 'ExtractedPayload.v1',
       actualKeys: Object.keys(extractedData),
       missingKeys: ['recommendation', 'confidence'],
       errors: result.errors,
     });
   }
   ```
3. Implement parser version tracking: tag each ExtractedPayload with `parserVersion: '1.0'`, allow schema evolution with migrations
4. Add schema-level strictness: `ExtractedPayload` requires specific fields (`recommendation`, `confidence`, `nextStep`) — don't allow extras
5. Create "parser test suite" of real Copilot responses (don't use mocks):
   - Store 50+ production responses in test/fixtures/copilot-responses/
   - Re-run parser against them on every release
   - Fail CI if any response previously parsed now fails
6. Implement circuit breaker: if parser error rate > 15% over last 100 requests, log CRITICAL and disable orchestrator (return passthrough mode explicitly)

**Detection:**
- Count successful parse rate by response strategy: `parse.success.by_strategy.activity_value`, `parse.success.by_strategy.text_embedded`, etc.
- If any strategy drops below 80%, trigger alert
- Monitor `parseErrors` array length — spike indicates format drift
- Add metric: `orchestrator.fallback_to_passthrough_reason` tagged with reason (unstructured vs. parse_error)

**Phase:** Phase 16 (Structured Output Parser). Parser architecture must be designed to distinguish failure modes.

---

### Pitfall 21: Idempotency + State Mutation Race Condition

**What goes wrong:**
- Client retries `/api/chat/send` due to network timeout (doesn't know server received the request)
- Server received first request, advanced workflow state, stored conversation, updated user index
- Server receives duplicate request 500ms later, reads same conversation, applies same orchestrator step, advances state again (state = N+1 twice)
- collectedData now has duplicate entries (same form submission extracted twice)
- Redis doesn't detect the duplicate — each call to `store.set()` with new timestamp overwrites previous
- Workflow state shows wrong turn count: `turnCount: 15` instead of `14`

**Why it happens:**
- v1.4 ConversationStore interface and implementations don't include idempotency key tracking
- Orchestrator performs multi-step write sequence (read, inject, send to Copilot, parse, write state) — not atomic like v1.4's SET + ZADD + EXPIRE pipeline
- No idempotency key validation in existing `/api/chat/send` route (was stateless, so retries were safe)
- Copilot SDK call itself is idempotent (same message → same response), but extracting from response twice corrupts collectedData

**Consequences:**
- Workflow state diverges from reality: logs show step 14 but UI thinks step 15
- User duplicates form submissions: collectedData has { email: 'user@example.com' } twice
- Step counter becomes unreliable for routing logic ("if turnCount < 20, ask for more info" fails)
- Subtle bugs downstream: reports aggregate collectedData, see 200% completion rates

**Prevention:**
1. Extend StoredConversation schema to track idempotency:
   ```typescript
   const StoredConversation = z.object({
     // ... existing fields
     idempotencyKeys: z.record(z.string(), z.object({ // key -> response
       result: NormalizedMessage.array(),
       orchestratorState: WorkflowState,
       timestamp: z.string().datetime(),
     })).optional().default({}),
   });
   ```
2. On orchestrator entry, check: `if (idempotencyKeys[idempotencyKey]) return idempotencyKeys[idempotencyKey].result`
3. After orchestrator completes, store result: `idempotencyKeys[idempotencyKey] = { result, orchestratorState, timestamp }`
4. Implement TTL on stored idempotency results: clean up keys older than 60s on next write
5. Include idempotency key in request required headers: `X-Idempotency-Key: ${uuid()}` (client generates, required in schema)
6. Return 200 + original response if duplicate detected, with header: `X-Idempotency-Replay: true`

**Detection:**
- Monitor idempotency key replay rate: `orchestrator.idempotency_key_replays` — spike indicates network issues or aggressive retries
- If collectedData array has exact duplicates (same keys, values, timestamps), log WARNING
- Check turn count vs. message count — should be equal (one user message per turn)

**Phase:** Phase 15 (Orchestrator Engine). Must be part of initial route design.

---

### Pitfall 22: Context Injection Format Drift + Agent Configuration Mismatch

**What goes wrong:**
- v1.3b specified `[WORKFLOW_CONTEXT] {...}` delimited format for context injection into Copilot messages
- Copilot Studio agent was trained on that format in Phase 10 (Context Injection Validation)
- v1.5 context builder refactors format to `{workflow_context: {...}}` JSON block (cleaner parsing)
- Agent still parses old format, ignores new format, loses workflow context
- Workflow execution degrades: agent can't see step constraints, recommends actions that violate earlier constraints

**Why it happens:**
- Milestone says "do NOT modify Copilot Studio agent configuration" but client-side format changes aren't coordinated
- Context builder is configurable per milestone spec, but format changes aren't tracked in version control
- No test coverage for agent parsing of injected context (v1.3b tests covered "does injection break responses", not "does agent parse it correctly")
- Agent instructions are external to this codebase — difficult to version-sync

**Consequences:**
- Copilot Studio agent becomes unreliable (sometimes sees context, sometimes doesn't)
- Workflow constraints aren't enforced (agent might attempt actions marked as forbidden in constraints)
- Debugging is nightmarish: logs show context was injected, but agent doesn't act on it

**Prevention:**
1. Lock context format at schema definition time:
   ```typescript
   const WORKFLOW_CONTEXT_FORMAT_VERSION = '1.0';
   const CONTEXT_DELIMITER = '[WORKFLOW_CONTEXT_v1.0]'; // Include version
   ```
2. Require explicit opt-in for format changes:
   - Phase plan must include "Copilot Studio agent re-validation" step
   - Spike phase to test new format with agent before shipping
3. Create versioned test suite: `test/fixtures/agent-parsing-tests/format-v1.0.json` with agent responses
4. Add schema change log: `shared/CONTEXT_FORMAT_CHANGELOG.md` documenting format versions, migration guide
5. In orchestrator, include format version in context: `{"format_version": "1.0", "context": {...}}`
6. Return 400 if format version in ConversationStore's `workflow.contextFormatVersion` doesn't match server's format version

**Detection:**
- Monitor Copilot response mention of context signals: if "I'll enforce the constraint" mentions drop, likely format drift
- Add telemetry: agent explicitly acknowledges context parsing: `{ context_acknowledged: true/false }` in response
- Compare workflow decisions before/after format change: similar user input should yield similar agent behavior

**Phase:** Phase 15-16 (Orchestrator). Document format version at schema definition time.

---

### Pitfall 23: Over-Engineered State Machine Complexity

**What goes wrong:**
- Developer designs 15-state FSM: `idle → collect_email → validate_email → collect_phone → validate_phone → collect_preferences → ... → complete`
- Each state has entry/exit handlers, error transitions, retry logic, compensation logic
- After 3 months, business asks for conditional workflows: "if user selects Option A, skip phone collection"
- Adding one conditional branch requires rebuilding half the state machine
- Code becomes unmaintainable: 500 lines to add a new state, 30-40 transition cases to consider
- Debugging requires tracing through all entry/exit handlers to understand control flow

**Why it happens:**
- FSM pattern is powerful for small, deterministic workflows but scales poorly
- Milestone says workflow flow is "AI-driven" (not hardcoded) but developer default-implements FSM first
- Existing ConversationStore patterns encourage storing discrete `status` field (idle/active/completed), feels like FSM
- No guidance on complexity thresholds: "when should I stop adding states and refactor?"

**Consequences:**
- Team velocity slows: developers spend more time maintaining state machine than adding features
- Bug surface area explodes: n states × m transitions = O(n×m) edge cases
- Testing becomes brittle: mock all state transitions, test count explodes without catching actual issues
- Workflow flexibility decreases: system can't adapt easily to new business requirements

**Prevention:**
1. Design orchestrator as **step executor** not state machine:
   ```typescript
   type WorkflowStep = {
     name: string;
     execute: (context: WorkflowContext) => Promise<StepResult>;
     nextSteps: (result: StepResult) => string[]; // Returns names of possible next steps
   };
   ```
2. Implement **single-responsibility steps**: each step does ONE thing (collect data, validate, recommend, etc.)
3. Use step registry: `const steps = new Map<string, WorkflowStep>()` — dynamic step lookup, no hardcoded transitions
4. Delegate transition logic to AI (per milestone): Copilot decides next step based on available steps, results, constraints
5. Keep state minimal: only store `currentStep`, `collectedData`, `lastResult` — not full state machine graph
6. Limit nesting: if you have substeps within substeps, refactor to separate top-level steps
7. Cap step count: > 20 steps in a single workflow likely over-engineered

**Detection:**
- Code metric: count conditional branches in state transition logic. If > 50, refactor.
- Test metric: number of unit tests for orchestrator. If > 200 tests for < 100 lines of code, likely over-engineered.
- Review metric: average PR size for orchestrator changes. If > 500 lines, likely touching too many transitions.

**Phase:** Phase 15 (Orchestrator Engine). Design step executor early to prevent FSM creep.

---

### Pitfall 24: Backward Compatibility Break in NormalizedMessage or ExtractedPayload Schema

**What goes wrong:**
- v1.4 ConversationStore deserialization adds new optional field to StoredConversation: `contextFormatVersion?: string`
- v1.5 parser expects `ExtractedPayload` to always have `confidence` field (was optional in v1.3b)
- Existing conversations loaded from Redis have `extractedPayload: { data: { ... } }` without `confidence`
- Zod schema parse fails: `confidence is required` error on 1000s of existing conversations
- `/api/chat/send` fails with 500 for every existing conversation

**Why it happens:**
- v1.4's `StoredConversation` successfully uses backward-compat defaults (new fields get defaults, old records deserialize)
- Expectation carries to v1.5: "we can add new fields without breaking old data"
- But Parser changes from _extracting_ data (v1.3b) to _validating_ extracted data (v1.5) with stricter schema
- No validation of schema changes against production data before shipping
- Rolling back is risky: already changed Copilot Studio agent to expect new format

**Consequences:**
- All chat routes return 500 for existing users
- Data migration required BEFORE code deploy: scan all Redis conversations, update records
- Rollback nearly impossible: downgrade app, but data already migrated
- Customer-facing outage: existing conversations broken

**Prevention:**
1. Create schema versioning utility in shared/:
   ```typescript
   const ExtractedPayloadV1 = z.object({...}); // Old schema, may be incomplete
   const ExtractedPayloadV2 = z.object({...}); // New schema, stricter

   const parseExtractedPayload = (data: unknown, version: number = 1) => {
     if (version === 1) return ExtractedPayloadV1.parseAsync(data);
     if (version === 2) return ExtractedPayloadV2.parseAsync(data);
   };
   ```
2. Add `schemaVersion` to every schema record:
   ```typescript
   const StoredConversation = z.object({
     schemaVersion: z.literal(2).default(2),
     messages: NormalizedMessage.array(),
     // ...
   });
   ```
3. Implement migration on read:
   ```typescript
   const stored = rawData as Record<string, unknown>;
   const schemaVersion = stored.schemaVersion ?? 1; // Default old records to v1
   if (schemaVersion < 2) {
     stored.extractedPayload = migrateExtractedPayload(stored.extractedPayload, 1, 2);
     stored.schemaVersion = 2;
   }
   ```
4. Test schema changes against real production data snapshot:
   - Export sample of 100 conversations from production Redis (or ioredis-mock)
   - Run new Zod schema against them
   - Ensure zero parse errors before shipping
5. Never remove required fields — only add optional fields or create new schema versions

**Detection:**
- On boot, parse a sample of stored conversations: `Promise.all(sampleIds.map(id => store.get(id)))`
- If any fail, log ERROR and don't start server
- Include schema validation in health check: `GET /health` returns `schemaValidationErrors: number`

**Phase:** Phase 15 (Orchestrator Engine). Schema validation must be part of definition process.

---

### Pitfall 25: Redis Lock Timeout Too Short → Partial State Writes

**What goes wrong:**
- Orchestrator acquires lock with 2-second timeout
- Copilot SDK request takes 1.5 seconds, parsing takes 400ms, state write takes 200ms = 2.1 seconds total
- Lock expires at 2s mark while step 4 (state write) is in progress
- Concurrent request acquires lock, reads stale state
- Both requests complete successfully but state is inconsistent

**Why it happens:**
- v1.3b measurements showed latencies: 200ms startConversation, 300-400ms sendMessage, 500-800ms round-trip
- But measurements were under controlled conditions (low concurrency, no network jitter)
- Production has variable latencies: occasionally 2-3 second SDK calls
- Developer picks "safe" 2s timeout without accounting for tail latencies

**Consequences:**
- Intermittent state corruption (only happens under high load or network latency)
- Nearly impossible to reproduce locally (timing-sensitive)
- Workflow state becomes unreliable
- Data corruption silent (not a hard error, just wrong state)

**Prevention:**
1. Set lock timeout dynamically based on observed latencies:
   ```typescript
   const p99LockDuration = observeOrchestratorDuration('p99'); // Track in metrics
   const lockTimeoutMs = p99LockDuration + 3000; // P99 + 3s safety margin
   ```
2. Measure Copilot latency in production: tag each request with `sdkLatencyMs`, `parseLatencyMs`, `stateWriteLatencyMs`
3. Implement _lease-based_ lock instead of time-based:
   ```typescript
   const leaseToken = uuid();
   await redis.set(`lock:${conversationId}`, leaseToken, 'NX', 'EX', 10);

   // Periodically extend lease if still needed:
   setInterval(() => {
     redis.getdel(`lock:${conversationId}`).then((current) => {
       if (current === leaseToken) redis.set(`lock:${conversationId}`, leaseToken, 'EX', 10);
     });
   }, 5000);

   // Before write, verify lock still held:
   const stillHeld = await redis.get(`lock:${conversationId}`) === leaseToken;
   if (!stillHeld) throw new Error('Lost lock, cannot write state');
   ```
4. Always verify lock ownership before writes:
   ```typescript
   const ownsLock = (token: string) => redis.call('GET', `lock:${conversationId}`) === token;
   if (!ownsLock(leaseToken)) throw new Error('Lock lost during execution');
   ```
5. Use Lua script for atomic lock-and-write:
   ```lua
   if redis.call('GET', KEYS[1]) == ARGV[1] then
     return redis.call('SET', KEYS[2], ARGV[2])
   else
     return nil
   end
   ```

**Detection:**
- Monitor lock contention: `redis.lock_acquisitions_count`, `redis.lock_timeouts_count`
- If timeout rate > 1%, increase timeout
- Add assertion to state writes: verify lock token before commit, abort with error if lost
- Log all lock acquisitions and releases with timestamps to correlate failures

**Phase:** Phase 15 (Orchestrator Engine). Must be designed in at locking layer.

---

### Pitfall 26: Parser Handles Different Copilot Response Strategies Inconsistently

**What goes wrong:**
- Copilot returns structured output in three ways (v1.3b): Activity.value (highest priority), Activity.entities, text-embedded JSON
- Parser extracts from value successfully (finds recommendation)
- Next request, Copilot returns same data in entities field instead (agent refactored)
- Parser code path for entities has a bug: doesn't extract the same fields as value path
- One request succeeds, next fails, data inconsistency

**Why it happens:**
- v1.3b priority-chain extraction was pragmatic for live agent validation, but creates multiple code paths
- Each code path (value vs entities vs text) likely has slightly different parsing logic
- Testing covers each path independently but not consistency across paths
- Copilot agent can change which field it populates without client knowing

**Consequences:**
- Same user input yields inconsistent parsing results
- collectedData becomes unreliable: some fields extracted from value, some from entities
- Workflow decisions based on collectedData become inconsistent
- Data quality issues hard to debug: need to compare Copilot responses across different extraction paths

**Prevention:**
1. Normalize all extraction paths to a single structure early:
   ```typescript
   // Extract from ANY source, normalize to canonical structure
   const extractRaw = (activity: Activity): unknown => {
     if (activity.value !== undefined) return activity.value;
     if (activity.entities && activity.entities.length > 0) {
       return Object.fromEntries(activity.entities.map(e => [e.name, e.value]));
     }
     // Try text embedding last
     const match = activity.text?.match(/\{.*\}/); // Very naive
     return match ? JSON.parse(match[0]) : null;
   };

   const canonicalData = extractRaw(activity);
   // Now all three paths feed same data into single validation pipeline
   ```
2. Create unified Zod schema for extracted payload (regardless of source):
   ```typescript
   const ExtractedData = z.object({
     recommendation: z.string().optional(),
     nextStep: z.string().optional(),
     confidence: z.number().default(0.5),
   });
   ```
3. Test consistency: for each test case, mock Copilot response in all three formats, verify same parse result
4. Log which strategy succeeded: `{ extraction_strategy: 'activity_value' | 'entities' | 'text_embedded', extracted_fields: [...] }`
5. Monitor success rate by strategy: if one path drops < 80%, trigger alert

**Detection:**
- Track extraction path success rates: `parser.extract_by_strategy.activity_value = 95%`, `parser.extract_by_strategy.entities = 75%`
- If variance > 20%, likely inconsistent logic
- Compare collectedData across different extraction paths for same user input (in tests)

**Phase:** Phase 16 (Structured Output Parser). Design unified extraction pipeline early.

---

### Pitfall 27: Workflow Context Injection Bloats Message Token Count

**What goes wrong:**
- Context builder creates `[WORKFLOW_CONTEXT] { step: 'collect_email', constraints: [...], collectedData: {...} }` prefix
- Prefix is ~500-1000 tokens
- User asks 20-turn conversation, each turn gets prefix injected, context is bloated
- Message count in Redis grows but token efficiency drops
- Copilot sees more tokens dedicated to housekeeping than user intent

**Why it happens:**
- v1.3b format is optimized for human readability ([WORKFLOW_CONTEXT] delimiter), not compression
- Milestone allows configurable context builder, but doesn't provide compression option
- No token counting at build time — developer doesn't see the cost

**Consequences:**
- Slower Copilot responses (more tokens to process)
- Higher latency and cost
- Less room for user message history (if context window fills faster)

**Prevention:**
1. Implement token budgeting in context builder:
   ```typescript
   type ContextBuilderConfig = {
     format: 'verbose' | 'compact' | 'minimal';
     includeFullCollectedData: boolean; // vs. keys only
     includeFullHistory: boolean; // vs. last N turns
   };
   ```
2. Compact format: `[WC] step:email constraints:... data:email,...` (abbreviate field names)
3. Measure: log token count before/after context injection
4. Test: benchmark Copilot response time with verbose vs. compact context
5. Default to compact format for production, verbose for debug mode

**Detection:**
- Log context token count on every orchestrator call
- Alert if mean context size > 1500 tokens

**Phase:** Phase 15 (Orchestrator Engine). Consider during context builder design.

---

### Pitfall 28: Conversions Between WorkflowState and NormalizedMessage lose data

**What goes wrong:**
- NormalizedMessage stores `extractedPayload?: ExtractedPayload`
- WorkflowState stores `collectedData: Record<string, unknown>`
- Conversion between them (to update state after extraction) loses metadata
- extractedPayload.confidence is not reflected in collectedData
- extractedPayload.source (which field it came from) is lost
- Downstream step can't tell if data is high-confidence or low-confidence

**Why it happens:**
- v1.4 NormalizedMessage was designed for conversation history (text messages + cards)
- v1.5 WorkflowState is designed for step execution and data accumulation
- No unified schema for extracted data across message boundary — both store "extracted data" but with different fields

**Consequences:**
- Workflow decisions degrade: step handler can't distinguish high-confidence from low-confidence data
- Debugging is confusing: collectedData doesn't match extractedPayload in source conversation

**Prevention:**
1. Create unified schema:
   ```typescript
   const CollectedDataEntry = z.object({
     key: z.string(),
     value: z.unknown(),
     source: z.enum(['activity_value', 'entities', 'text_embedded']),
     confidence: z.number().default(0.5),
     extractedAt: z.string().datetime(),
     messageId: z.string(), // Link back to source message
   });

   const WorkflowState = z.object({
     collectedData: CollectedDataEntry.array(),
     // ...
   });
   ```
2. Always convert through schema: extractedPayload → CollectedDataEntry[] → WorkflowState.collectedData
3. Update NormalizedMessage to include source reference for traced extraction

**Detection:**
- Compare extractedPayload.confidence vs. collectedData[same_key].confidence — should match
- Track message IDs through collectedData entries — verify traceability

**Phase:** Phase 15-16. Define schema boundaries clearly upfront.

---

### Pitfall 29: No Monitoring for Workflow State Divergence

**What goes wrong:**
- Two systems with different views of workflow state:
  1. ConversationStore in Redis (source of truth): `{ currentStep: 'collect_phone', turnCount: 8 }`
  2. Client-side state from last response: `{ currentStep: 'collect_phone', turnCount: 7 }`
- Requests continue, but state is silently out of sync
- No alerting, no warning, just degraded behavior

**Why it happens:**
- Milestone doesn't mandate periodic state validation checks
- No endpoint to compare client state vs. server state
- Logs don't highlight state divergence (would require computing expected vs. actual)

**Consequences:**
- Hard to detect in production (only visible through user confusion reports)
- Accumulates over time (more requests = more chance of divergence)
- Debugging requires comparing logs and Redis snapshots manually

**Prevention:**
1. Add state validation endpoint:
   ```typescript
   GET /api/chat/:conversationId/state
   {
     storedState: WorkflowState,
     computedState: WorkflowState, // Computed from message history + step handlers
     divergence: { field: 'turnCount', stored: 8, computed: 9 },
   }
   ```
2. Log state on every orchestrator write:
   ```typescript
   logger.info('Workflow state update', {
     conversationId,
     previousState: oldState,
     newState: newState,
     delta: { turnCount: oldState.turnCount - newState.turnCount },
   });
   ```
3. Implement periodic validation: every 100 requests, verify stored state matches computed state
4. Return state in response: `/api/chat/send` includes current `workflowState` so client can validate next request

**Detection:**
- Implement state hash: hash the workflowState object, include in response
- Client must include hash of last known state in next request
- Server recomputes hash of stored state, compares — mismatch indicates divergence
- Log all divergences with full context

**Phase:** Phase 16 (Orchestrator). Add validation early to detect bugs quickly.

---

## Phase-Specific Warnings for v1.5

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---|---|
| **Phase 15: Orchestrator Engine** | Race conditions (Pitfall 18) | Implement per-conversation Redis lock BEFORE coding orchestrator steps |
| **Phase 15: Orchestrator Engine** | Over-engineered state machine (Pitfall 23) | Design step executor pattern, cap states at 20 |
| **Phase 15: Orchestrator Engine** | Idempotency failures (Pitfall 21) | Add idempotency key tracking to StoredConversation upfront |
| **Phase 15: Orchestrator Engine** | Lock timeout issues (Pitfall 25) | Use dynamic timeout based on observed latencies + lease pattern |
| **Phase 15: Orchestrator Engine** | Token bloat (Pitfall 27) | Add context token logging, implement compact format option |
| **Phase 16: Context Builder** | Context window overflow (Pitfall 19) | Implement token budgeting before context injection, test with real Copilot SDK |
| **Phase 16: Context Builder** | Format drift (Pitfall 22) | Lock format version in schema, require explicit Copilot agent re-validation on changes |
| **Phase 16: Structured Output Parser** | Parser brittleness (Pitfall 20) | Distinguish parse_error from unstructured, store real Copilot responses in test fixtures |
| **Phase 16: Structured Output Parser** | Inconsistent extraction paths (Pitfall 26) | Normalize all extraction sources to single pipeline, test all paths for consistency |
| **Phase 16: Structured Output Parser** | Schema compatibility (Pitfall 24) | Validate schema changes against production data snapshot before shipping |
| **Phase 17: API Route Updates** | NormalizedMessage/WorkflowState boundary (Pitfall 28) | Define unified CollectedDataEntry schema crossing boundary |
| **Phase 17: API Route Updates** | Backward compatibility (Pitfall 24) | Add schemaVersion to all records, implement read-time migration |
| **Throughout** | State divergence (Pitfall 29) | Add state validation endpoint, return state in responses, periodic verification |

---

## Integration Pitfalls with Existing v1.4 Components

### Parser ↔ ActivityNormalizer

**Issue:** activityNormalizer (v1.3b) extracts to ExtractedPayload, v1.5 parser may re-parse the same data
- **Prevention:** Parser should reuse extracted data from NormalizedMessage.extractedPayload when available, avoid re-parsing
- **Detection:** Log when parser processes same message twice; metrics for extraction cache hit rate

### Orchestrator ↔ ConversationStore

**Issue:** ConversationStore operations (SET + ZADD + EXPIRE pipeline) are atomic, but orchestrator performs 5+ operations (read, context build, send, parse, write state)
- **Prevention:** Wrap orchestrator operations in per-conversation lock, treat as single unit
- **Detection:** Monitor lock contention metrics, alert on > 5% timeout rate

### Orchestrator ↔ CopilotStudioClient Singleton

**Issue:** CopilotStudioClient maintains internal conversation state; orchestrator also tracks state in Redis
- **Prevention:** CopilotStudioClient is owned by Copilot SDK; don't duplicate state tracking in Redis. Redis stores user-visible state only.
- **Detection:** If CopilotStudioClient internal state diverges from Redis, SDK calls will fail; monitor SDK error rates

### WorkflowContext Injection ↔ Existing Message Normalization

**Issue:** workflowContext is injected as prefix to each sendMessage call, but normalizer doesn't extract it back out
- **Prevention:** Injection is transparent to user (not stored, not shown). Normalizer can ignore it.
- **Detection:** If normalizer sees [WORKFLOW_CONTEXT] in messages, log WARNING (injection leaking to user)

---

## Backward Compatibility Considerations

**Existing records before v1.5:**
- ConversationStore from v1.4 may lack `workflowState` field
- NormalizedMessages may lack `extractedPayload` field
- No `idempotencyKeys` tracking in old conversations

**Migration strategy:**
1. Add `workflowState?: WorkflowState` optional to StoredConversation (defaults to null)
2. On first orchestrator call for old conversation, initialize workflowState to initial state
3. Don't try to retroactively extract from old messages — start extraction on v1.5 onwards
4. Accept that old conversations won't have rich workflow history; new conversations will

**Testing:**
- Load sample v1.4 conversations from backup, verify they deserialize and work with v1.5 orchestrator
- Verify no 500 errors on old conversations

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
| Simple orchestrator without per-conversation locks | Faster initial implementation | Race conditions under load | Never — locking must be part of day 1 design |
| Naive context builder without token budgeting | Simpler initial code | Context overflow + degraded workflow intelligence | Never — token budgeting must be part of day 1 design |
| Single parser code path (no fallback) | Simpler logic | No passthrough mode if parser fails; entire workflow breaks | Never — must distinguish parse_error from unstructured |

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

### Workflow Orchestration and Structured Output Parsing Research (v1.5)

- [Mastering Workflow Orchestration: A Deep Dive into Steps, State Management, and Conditional Logic](https://medium.com/@juanc.olamendy/mastering-workflow-orchestration-a-deep-dive-into-steps-state-management-and-conditional-logic-04b5400398d1)
- [Mastering Node.js Concurrency: Race Condition Detection and Prevention](https://medium.com/@zuyufmanna/mastering-node-js-concurrency-race-condition-detection-and-prevention-3e0cfb3ccb07)
- [LLM Output Parsing and Structured Generation Guide](https://tetrate.io/learn/ai/llm-output-parsing-structured-generation)
- [How To Ensure LLM Output Adheres to a JSON Schema](https://modelmetry.com/blog/how-to-ensure-llm-output-adheres-to-a-json-schema)
- [The guide to structured outputs and function calling with LLMs](https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms)
- [What is idempotency in Redis? Cost-saving patterns for LLM apps](https://redis.io/blog/what-is-idempotency-in-redis/)
- [Distributed Locks with Redis](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)
- [The Twelve Redis Locking Patterns Every Distributed Systems Engineer Should Know](https://medium.com/@navidbarsalari/the-twelve-redis-locking-patterns-every-distributed-systems-engineer-should-know-06f16dfe7375)
- [Build an Idempotent API in Node.js with Redis](https://blog.appsignal.com/2024/02/14/build-an-idempotent-api-in-nodejs.html)
- [Context Window Overflow in 2026: Fix LLM Errors Fast](https://redis.io/blog/context-window-overflow/)
- [LLM Context Window Limitations: Impacts, Risks, and Fixes](https://atlan.com/know/llm-context-window-limitations/)
- [Top techniques to Manage Context Lengths in LLMs](https://agenta.ai/blog/top-6-techniques-to-manage-context-length-in-llms/)
- [The Art of API Evolution: How to Version Your APIs without Breaking Client Code](https://medium.com/@rao-harsh/the-art-of-api-evolution-how-to-version-your-apis-without-breaking-client-code-916e74068322)
- [Workflow Engine vs. State Machine](https://workflowengine.io/blog/workflow-engine-vs-state-machine/)
- [Why Developers Never Use State Machines](https://workflowengine.io/blog/why-developers-never-use-state-machines/)
- [Simplifying Complex Workflows: The Power of State Machines in Backend Development](https://medium.com/@raultotocayo/simplifying-complex-workflows-the-power-of-state-machines-in-backend-development-8c09ef877aab)
- [Explore multi-agent orchestration patterns - Microsoft Copilot Studio](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/multi-agent-patterns)
- [FAQ for generative orchestration - Microsoft Copilot Studio](https://learn.microsoft.com/en-us/microsoft-copilot-studio/faqs-generative-orchestration)
- [Multi-Agent Orchestration and more: Copilot Studio announcements — Microsoft Copilot Blog](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/multi-agent-orchestration-maker-controls-and-more-microsoft-copilot-studio-announcements-at-microsoft-build-2025/)

---

*Pitfalls research for: React + Node chat app with Microsoft Copilot Studio SDK + Adaptive Cards (monorepo)*
*Extended for: v1.4 Redis-backed persistent state store (Azure Cache for Redis)*
*Extended for: v1.5 Workflow Orchestrator + Structured Output Parser*
*Researched: 2026-02-19 (original); 2026-02-21 (Redis additions); 2026-02-21 (Workflow orchestration)*
