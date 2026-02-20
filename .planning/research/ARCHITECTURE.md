# Architecture Research

**Domain:** React + Node proxy chat app for Microsoft Copilot Studio with Adaptive Cards
**Researched:** 2026-02-19
**Confidence:** HIGH (CopilotStudioClient API verified against official Microsoft Learn docs; patterns verified against official SDK samples and established Node/Express patterns)

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                           │
│                                                                   │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ ChatTranscript│  │  CardRenderer    │  │  MetadataDrawer  │   │
│  │ (scroll view) │  │ (adaptive cards) │  │  (timeline/log)  │   │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬─────────┘   │
│         │                   │                      │              │
│  ┌──────┴───────────────────┴──────────────────────┴──────────┐  │
│  │               Chat State (React context / Zustand)          │  │
│  └─────────────────────────────┬───────────────────────────────┘  │
│                                │ fetch (Bearer token header)       │
└────────────────────────────────┼──────────────────────────────────┘
                                 │ HTTPS /api/chat/*
┌────────────────────────────────┼──────────────────────────────────┐
│                     Node / Express Server                          │
│                                │                                   │
│  ┌─────────────────────────────┼───────────────────────────────┐  │
│  │              Auth Middleware (CIAM Bearer Validation)        │  │
│  └─────────────────────────────┬───────────────────────────────┘  │
│                                │                                   │
│  ┌──────────────┐  ┌───────────┴──────────┐  ┌────────────────┐  │
│  │ POST /start  │  │  POST /send          │  │ POST /card-     │  │
│  │ (new convo)  │  │  (text message)      │  │ action          │  │
│  └──────┬───────┘  └──────────┬───────────┘  └───────┬────────┘  │
│         │                     │                       │            │
│  ┌──────┴─────────────────────┴───────────────────────┴────────┐  │
│  │            Response Normalizer (Activity → NormalizedMsg)    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                │                                   │
│  ┌─────────────────────────────┼───────────────────────────────┐  │
│  │     CopilotStudioClient (server-side only, holds JWT)       │  │
│  │     @microsoft/agents-copilotstudio-client                  │  │
│  └─────────────────────────────┬───────────────────────────────┘  │
└────────────────────────────────┼──────────────────────────────────┘
                                 │ HTTPS (Power Platform API)
                    ┌────────────┴────────────┐
                    │   Microsoft Copilot      │
                    │   Studio (cloud service) │
                    └─────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| ChatTranscript | Render ordered list of messages; auto-scroll; optimistic bubbles; loading skeletons | React component with useEffect scroll, message array from state store |
| CardRenderer | Render Adaptive Card JSON payloads; fire submit events; disable card after submission | `adaptivecards` SDK + `adaptivecards-react` wrapper; `onExecuteAction` callback |
| MetadataDrawer | Desktop sidebar: timeline of card actions, activity log download | React panel; reads completed-actions slice of state |
| Chat State | Client-side truth of conversation: messages, conversationId, loading flags, error state | React context or Zustand store |
| Auth Middleware | Validate incoming CIAM Bearer token on every `/api/chat/*` request | Express middleware; `express-oauth2-jwt-bearer` or manual JWT verify |
| `/api/chat/start` | Create a new Copilot Studio conversation; return `conversationId` | Route handler; calls `client.startConversationStreaming(true)` |
| `/api/chat/send` | Accept user text + conversationId; forward to Copilot; return normalized messages | Route handler; calls `client.sendActivityStreaming(activity, conversationId)` |
| `/api/chat/card-action` | Accept card submission payload; validate against action allowlist; forward to Copilot | Route handler; Zod validation + allowlist check before forwarding |
| Response Normalizer | Convert raw Bot Framework `Activity[]` from Copilot into `NormalizedMessage[]` | Pure function; shared Zod schema as target type |
| CopilotStudioClient | Server-side singleton (or per-user instance) holding JWT and connection settings; wraps the M365 Agents SDK | `new CopilotStudioClient(settings, token)` — never instantiated in browser |
| Shared Zod Schemas (`shared/`) | Single source of truth for `NormalizedMessage`, API request/response shapes; generates TypeScript types | `z.object(...)` in `shared/src/schemas.ts`; imported by both `client/` and `server/` |

---

## Recommended Project Structure

```
aaae/                             # monorepo root
├── package.json                  # npm workspaces: ["client","server","shared"]
├── tsconfig.base.json            # shared TS config extended by all packages
│
├── shared/                       # shared schemas + types (no browser/Node deps)
│   ├── package.json              # name: "@aaae/shared"; no external deps except zod
│   └── src/
│       ├── schemas.ts            # NormalizedMessage, StartResponse, SendRequest, CardActionRequest
│       └── index.ts              # barrel export
│
├── server/                       # Express proxy
│   ├── package.json              # depends on @aaae/shared, @microsoft/agents-copilotstudio-client
│   ├── src/
│   │   ├── index.ts              # Express app entry; registers middleware + routes
│   │   ├── middleware/
│   │   │   └── auth.ts           # CIAM bearer token validation middleware
│   │   ├── routes/
│   │   │   ├── start.ts          # POST /api/chat/start
│   │   │   ├── send.ts           # POST /api/chat/send
│   │   │   └── cardAction.ts     # POST /api/chat/card-action
│   │   ├── services/
│   │   │   └── copilotClient.ts  # CopilotStudioClient factory / singleton
│   │   └── normalizer/
│   │       └── activityNormalizer.ts  # Activity[] → NormalizedMessage[]
│   └── .env.example
│
└── client/                       # Vite + React 18
    ├── package.json              # depends on @aaae/shared, adaptivecards, adaptivecards-react
    ├── vite.config.ts            # proxy: { "/api": "http://localhost:3001" }
    └── src/
        ├── main.tsx
        ├── store/
        │   └── chatStore.ts      # Zustand store: messages[], conversationId, loading, error
        ├── api/
        │   └── chatApi.ts        # fetch wrappers for /api/chat/* with Bearer header injection
        ├── components/
        │   ├── ChatTranscript.tsx     # scrollable message list
        │   ├── MessageBubble.tsx      # text message rendering
        │   ├── CardRenderer.tsx       # Adaptive Card host with onExecuteAction
        │   ├── MetadataDrawer.tsx     # desktop sidebar / timeline
        │   ├── InputBar.tsx           # text input + send button
        │   └── ThemeToggle.tsx        # dark/light
        └── types/                # re-exports from @aaae/shared for convenience
```

### Structure Rationale

- **shared/:** Zero runtime dependencies except Zod. Both `client/` and `server/` import from `@aaae/shared`. Changing a schema immediately surfaces TypeScript errors in both packages. This is the standard monorepo shared-contract pattern.
- **server/middleware/:** Auth extracted from routes so every `/api/chat/*` route is protected identically without repetition. Swap or extend authentication (e.g., real MSAL OBO) without touching route logic.
- **server/normalizer/:** Isolated from routes so it is unit-testable without HTTP context. The normalizer is the riskiest translation layer — card payloads, typing indicators, end-of-conversation signals all need handling.
- **server/services/copilotClient.ts:** The `CopilotStudioClient` requires a JWT that may be per-user (OBO flow) or service-principal. Keeping construction in a factory isolates the token acquisition concern.
- **client/store/:** Centralizes optimistic updates, error state, and message ordering. Components read from store; never call API directly — all API calls go through `chatApi.ts`.

---

## Architectural Patterns

### Pattern 1: Server-Side SDK Proxy (Primary Pattern)

**What:** The `CopilotStudioClient` from `@microsoft/agents-copilotstudio-client` runs exclusively on the Node server. The browser never sees Copilot Studio credentials, environment IDs, or the SDK. The server exposes a thin REST API that the React client calls.

**When to use:** Always — this is a hard requirement for this project (secrets never in browser).

**Trade-offs:** Adds a network hop vs. client-direct; server must manage `conversationId` lifecycle and client association. Gain: secrets protected, single audit point.

**Example (server/src/routes/send.ts):**
```typescript
import { CopilotStudioClient } from '@microsoft/agents-copilotstudio-client';
import { NormalizedMessageSchema } from '@aaae/shared';

router.post('/send', authMiddleware, async (req, res) => {
  const { conversationId, text } = req.body; // validated by Zod before this
  const client = getCopilotClient();          // singleton or per-user factory
  const activity = { type: 'message', text };

  const messages: NormalizedMessage[] = [];
  for await (const act of client.sendActivityStreaming(activity, conversationId)) {
    const msg = normalizeActivity(act);
    if (msg) messages.push(msg);
  }
  res.json({ messages });
});
```

### Pattern 2: Zod Shared Contract

**What:** All data crossing the client/server boundary is defined once in `shared/src/schemas.ts` as Zod schemas. `z.infer<typeof Schema>` generates TypeScript types. Both sides validate with `Schema.parse(...)` at their respective boundaries.

**When to use:** Always for API request/response shapes and the normalized message type.

**Trade-offs:** Slightly more setup than manual types; significant safety gain because runtime validation matches static types.

**Example (shared/src/schemas.ts):**
```typescript
import { z } from 'zod';

export const NormalizedMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'agent']),
  type: z.enum(['text', 'adaptiveCard', 'typing', 'error']),
  text: z.string().optional(),
  cardPayload: z.record(z.unknown()).optional(), // raw Adaptive Card JSON
  timestamp: z.string().datetime(),
});
export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>;

export const CardActionRequestSchema = z.object({
  conversationId: z.string(),
  actionType: z.string(),    // validated against allowlist on server
  data: z.record(z.unknown()),
});
export type CardActionRequest = z.infer<typeof CardActionRequestSchema>;
```

### Pattern 3: Adaptive Card Action Allowlist

**What:** The server maintains an explicit set of permitted `actionType` strings. When `/api/chat/card-action` receives a submission, it validates `actionType` against the allowlist before forwarding anything to Copilot Studio. `Action.OpenUrl` targets are similarly allowlisted by domain.

**When to use:** Always — prevents arbitrary actions from malicious or malformed card payloads reaching Copilot.

**Trade-offs:** Allowlist needs maintenance as new card types are added. Use a Playbook doc (Adaptive Cards playbook) to document the registration pattern.

**Example (server/src/routes/cardAction.ts):**
```typescript
const ACTION_ALLOWLIST = new Set(['submitForm', 'confirmOrder', 'cancelRequest']);
const URL_DOMAIN_ALLOWLIST = ['contoso.com', 'learn.microsoft.com'];

router.post('/card-action', authMiddleware, async (req, res) => {
  const body = CardActionRequestSchema.parse(req.body);
  if (!ACTION_ALLOWLIST.has(body.actionType)) {
    return res.status(403).json({ error: 'Action not permitted' });
  }
  // forward to Copilot via sendActivityStreaming...
});
```

### Pattern 4: Streaming Activity Consumption

**What:** `CopilotStudioClient.startConversationStreaming()` and `sendActivityStreaming()` return `AsyncGenerator<Activity>`. The server collects all yielded activities synchronously (for a simple HTTP response) or can SSE-stream them to the client for low-latency display.

**When to use:** Collect-then-respond is simpler for v1. SSE streaming is a future enhancement.

**Trade-offs:** Collect-then-respond has higher perceived latency; SSE streaming adds complexity (client EventSource, partial JSON, connection management).

```typescript
// v1: collect all activities, then respond
const messages: NormalizedMessage[] = [];
for await (const act of client.startConversationStreaming(true)) {
  const msg = normalizeActivity(act);
  if (msg) messages.push(msg);
}
res.json({ conversationId: client.conversationId, messages });
```

---

## Data Flow

### Request Flow: Text Message

```
User types text, presses Send
    │
    ↓
chatApi.ts: POST /api/chat/send
  { conversationId, text, Authorization: "Bearer <CIAM token>" }
    │
    ↓
Express: authMiddleware
  → validates CIAM Bearer token
  → attaches decoded claims to req.user
    │
    ↓
Express: /send route handler
  → Zod validates request body (SendRequestSchema.parse)
  → calls client.sendActivityStreaming(activity, conversationId)
    │
    ↓ (iterates AsyncGenerator)
CopilotStudioClient → Power Platform API (HTTPS)
  ← stream of Activity objects
    │
    ↓
normalizeActivity(act): Activity → NormalizedMessage
  → filters typing indicators, maps card attachments, handles EndOfConversation
    │
    ↓
res.json({ messages: NormalizedMessage[] })
    │
    ↓
chatApi.ts receives response
    │
    ↓
chatStore.ts: append messages to state
    │
    ↓
ChatTranscript re-renders: new MessageBubble or CardRenderer per message
```

### Request Flow: Adaptive Card Submission

```
User fills card fields, clicks Submit
    │
    ↓
CardRenderer.tsx: onExecuteAction callback fires
  → action.type === "Action.Submit"
  → collect action.data (merged inputs + card data)
  → mark card as disabled / pending in local state
    │
    ↓
chatApi.ts: POST /api/chat/card-action
  { conversationId, actionType, data, Authorization: "Bearer <CIAM token>" }
    │
    ↓
Express: authMiddleware → validates token
    │
    ↓
Express: /card-action route handler
  → CardActionRequestSchema.parse(req.body)
  → ACTION_ALLOWLIST check on actionType
  → if fail → 403 (card stays disabled, error toast shown)
    │
    ↓ (if allowed)
CopilotStudioClient.sendActivityStreaming(
  { type: 'message', value: data, channelData: { actionType } },
  conversationId
)
    │ ← stream of Activity objects from Copilot
    ↓
normalizeActivity → NormalizedMessage[]
    │
    ↓
res.json({ messages })
    │
    ↓
chatStore: append agent response messages
  + mark submitted card as "completed" (not re-enabled)
    │
    ↓
ChatTranscript re-renders; MetadataDrawer timeline appends card action entry
```

### Conversation Start Flow

```
App mounts / user opens chat
    │
    ↓
useEffect in ChatTranscript (or App init)
    │
    ↓
chatApi.ts: POST /api/chat/start  { Authorization: "Bearer <CIAM token>" }
    │
    ↓
Express: authMiddleware
    │
    ↓
/start route: client.startConversationStreaming(true)
  → consume greeting activities from Copilot
  → normalizeActivity on each
    │
    ↓
res.json({ conversationId: string, messages: NormalizedMessage[] })
    │
    ↓
chatStore: set conversationId, set initial messages
    │
    ↓
ChatTranscript renders greeting (text or card)
```

### State Management

```
chatStore (Zustand)
    │
    ├── conversationId: string | null
    ├── messages: NormalizedMessage[]        ← append-only; source of truth for transcript
    ├── pendingCardIds: Set<string>          ← cards waiting for server response
    ├── completedCardIds: Set<string>        ← submitted cards to keep disabled
    ├── isLoading: boolean                   ← global spinner / skeleton state
    └── error: string | null                 ← toast source

Components subscribe selectively:
  ChatTranscript    → messages
  CardRenderer      → pendingCardIds, completedCardIds
  MetadataDrawer    → messages (filter type === 'adaptiveCard' and completed)
  InputBar          → isLoading (disable during in-flight request)
```

---

## Build Order (Dependencies Between Components)

Build in this order to avoid blocking work:

| Phase | Components | Why This Order |
|-------|-----------|----------------|
| 1 | `shared/` Zod schemas (`NormalizedMessage`, request/response types) | Everything else imports from here; no deps |
| 2 | Server auth middleware | Required before any route can be tested end-to-end |
| 3 | Server `/api/chat/start` + `normalizer` | Establishes conversation lifecycle; normalizer unit-testable in isolation |
| 4 | Server `/api/chat/send` | Depends on normalizer and client factory from step 3 |
| 5 | Server `/api/chat/card-action` + allowlist | Depends on normalizer; allowlist can be configured independently |
| 6 | Client `chatStore` + `chatApi.ts` | Pure TypeScript; testable without rendering |
| 7 | Client `ChatTranscript` + `MessageBubble` | Text-only chat working end-to-end |
| 8 | Client `CardRenderer` + submit flow | Builds on working transcript; adds Adaptive Card dependency |
| 9 | Client `MetadataDrawer` + timeline | Reads from existing store; no new API surface |
| 10 | Theming, loading skeletons, error toasts | UI polish; no architectural risk |
| 11 | CI, `.env.example`, README, Adaptive Cards Playbook doc | Documentation and automation last |

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–100 concurrent users | Single Express process; `CopilotStudioClient` as module-level singleton is fine; no session store needed (conversationId passed by client) |
| 100–1k concurrent | Add process clustering (`cluster` module or PM2); conversationId stateless pass-through means no sticky sessions needed |
| 1k+ concurrent | Horizontal scaling behind load balancer; consider rate-limiting per-user on card-action endpoint; evaluate SSE streaming for lower perceived latency |

### Scaling Priorities

1. **First bottleneck:** CopilotStudioClient token refresh — JWT expires; implement token caching with refresh before expiry.
2. **Second bottleneck:** Synchronous activity collection per request — long Copilot response times block Node event loop; SSE streaming offloads this.

---

## Anti-Patterns

### Anti-Pattern 1: CopilotStudioClient in the Browser

**What people do:** Import `@microsoft/agents-copilotstudio-client` directly into the React app to avoid building a server.

**Why it's wrong:** Exposes `clientSecret`, environment ID, and the Power Platform API token to anyone who inspects network requests. The official Microsoft sample that does run client-side uses interactive user login (MSAL popup) — not suitable for a production app with CIAM-authenticated users who shouldn't re-authenticate.

**Do this instead:** Always instantiate `CopilotStudioClient` in the Node server only. Pass only the `conversationId` and normalized messages to the client.

### Anti-Pattern 2: Parallel Type Definitions (Manual TS Interfaces in Client + Server)

**What people do:** Define `Message` interface separately in `client/src/types/` and `server/src/types/` and keep them "in sync" manually.

**Why it's wrong:** They drift. A field added to the server normalizer won't be reflected client-side until someone remembers to update the interface. Runtime errors manifest as undefined fields.

**Do this instead:** Single Zod schema in `shared/`; `z.infer` generates the TypeScript type used everywhere.

### Anti-Pattern 3: Forwarding Raw Copilot Activity to the Browser

**What people do:** `res.json(rawActivities)` — send the full `Activity[]` from Copilot directly to the client.

**Why it's wrong:** `Activity` objects contain Bot Framework metadata, channel-specific fields, and potentially sensitive watermark data. The client now depends on Bot Framework schema details and can break on SDK updates.

**Do this instead:** Always run activities through `normalizeActivity()` and return only `NormalizedMessage[]`. The normalizer is the schema firewall between internal SDK and the public API surface.

### Anti-Pattern 4: Card Submission Directly to Copilot Without Allowlist

**What people do:** Accept any `actionType` from the card payload and forward it verbatim to Copilot.

**Why it's wrong:** A crafted card payload can trigger unintended Copilot actions, invoke plugins, or access data the user shouldn't reach.

**Do this instead:** `ACTION_ALLOWLIST.has(body.actionType)` check before forwarding. Treat Adaptive Card submissions as untrusted user input, not trusted application data.

### Anti-Pattern 5: Storing conversationId Server-Side Only (Session Map)

**What people do:** Server assigns and stores `conversationId` in a server-side session; client sends a session cookie.

**Why it's wrong:** Introduces sticky sessions or a shared session store (Redis) as a scaling requirement from day one. Adds state management complexity.

**Do this instead:** `conversationId` is returned from `/start` and included by the client in every subsequent request. Server is stateless; `conversationId` is the client's responsibility to persist (sessionStorage or React state).

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Microsoft Copilot Studio | `CopilotStudioClient.startConversationStreaming` / `sendActivityStreaming` — server-side only | Requires JWT with `CopilotStudio.Copilots.Invoke` scope; acquired via MSAL client credentials or OBO |
| CIAM / Entra ID (auth provider) | Bearer token validated in Express middleware on every request | v1: stub placeholder that logs claims; real validation plugs in without changing routes |
| MSAL OBO flow | Server exchanges incoming CIAM user token for Copilot Studio-scoped token | v1: TODO comment stub; real OBO uses `@azure/msal-node` `ConfidentialClientApplication.acquireTokenOnBehalfOf` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| client/ ↔ server/ | HTTPS REST; JSON bodies; `Authorization: Bearer` header | Defined by shared Zod schemas; Vite proxy in dev |
| server/ ↔ shared/ | TypeScript import; `@aaae/shared` workspace package | Server calls `Schema.parse()` to validate; normalizer returns `NormalizedMessage` |
| client/ ↔ shared/ | TypeScript import; `@aaae/shared` workspace package | Client uses `NormalizedMessage` type to render; never validates (server already did) |
| CardRenderer ↔ chatStore | React callback → Zustand action | `onExecuteAction` triggers `submitCardAction` store action which calls `chatApi.ts` |
| normalizer ↔ CopilotStudioClient | Function call; receives `Activity`, returns `NormalizedMessage \| null` | `null` when activity type is `typing` or `endOfConversation` (filtered out of response) |

---

## Sources

- [CopilotStudioClient class — Microsoft Learn (JS API Reference)](https://learn.microsoft.com/en-us/javascript/api/@microsoft/agents-copilotstudio-client/copilotstudioclient?view=agents-sdk-js-latest) — HIGH confidence; official docs updated 2025-12-18
- [Integrate with web or native apps using M365 Agents SDK — Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-copilot-studio/publication-integrate-web-or-native-app-m365-agents-sdk) — HIGH confidence; official docs updated 2025-12-12
- [Integrate with Copilot Studio — Microsoft 365 Agents SDK docs](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/integrate-with-mcs) — HIGH confidence; official docs updated 2025-11-26
- [microsoft/Agents GitHub — copilotstudio-webchat-react sample](https://github.com/microsoft/Agents/tree/main/samples/nodejs/copilotstudio-webchat-react) — HIGH confidence; official Microsoft sample repo
- [microsoft/Agents GitHub — copilotstudio-client Node sample](https://github.com/microsoft/Agents/tree/main/samples/nodejs/copilotstudio-client) — HIGH confidence; official Microsoft sample repo
- [@microsoft/agents-copilotstudio-client API docs](https://microsoft.github.io/Agents-for-js/modules/_microsoft_agents-copilotstudio-client.html) — HIGH confidence; official generated API docs
- [Adaptive Cards Action.Submit schema](https://adaptivecards.io/explorer/Action.Submit.html) — HIGH confidence; official Adaptive Cards site
- [Adaptive Cards JavaScript SDK — Microsoft Learn](https://learn.microsoft.com/en-us/adaptive-cards/sdk/rendering-cards/javascript/getting-started) — HIGH confidence; official docs
- [Sharing Types and Validations with Zod Across a Monorepo — Leapcell](https://leapcell.io/blog/sharing-types-and-validations-with-zod-across-a-monorepo) — MEDIUM confidence; community article, consistent with official Zod docs and npm workspaces docs

---

*Architecture research for: React + Node proxy chat app — Microsoft Copilot Studio + Adaptive Cards*
*Researched: 2026-02-19*
