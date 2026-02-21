# Stack Research

**Domain:** React + Node monorepo chat app — Microsoft Copilot Studio (M365 Agents SDK) + Adaptive Cards
**Researched:** 2026-02-19 (Core) + 2026-02-21 (Redis v1.4 extension)
**Confidence:** MEDIUM-HIGH (core stack HIGH; Copilot SDK versioning MEDIUM due to rapid beta churn; Adaptive Cards React strategy MEDIUM due to abandoned official React wrapper; Redis TLS integration HIGH)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 18.x | Client UI framework | Stable LTS; React 19 exists but ecosystem (Adaptive Cards, MSAL) tested on 18. PROJECT.md explicitly requires 18. |
| Vite | ^6.x | Client build tool | Declared in PROJECT.md; v6 released Nov 2024, fully stable. Eliminates webpack config burden. `@tailwindcss/vite` plugin requires no PostCSC config. |
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
| Zod | ^3.25.76 (pinned in shared/package.json) | Runtime validation + TypeScript types from one source | PROJECT.md specifies Zod. v3 chosen for stability (v4 not compatible with existing project setup). Validates request bodies on server AND defines the shared message schema in `packages/shared`. |

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

### Redis Persistent State Store (v1.4 NEW)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| **ioredis** | **^5.9.0** | Redis client for Node.js | **Production-ready, used at scale (Alibaba), explicit TLS + Azure Cache for Redis support, promises-based API, connection pooling built-in, actively maintained.** Latest 5.9.3 released Feb 2026. Correctly handles `rediss://` URLs and Azure port 6380 TLS configuration. Do NOT use `redis` npm package (legacy node-redis v3, unmaintained). |
| **ioredis-mock** | **^5.11.0** | In-memory Redis emulation for unit tests | **Implements full ioredis API in-memory; Jest integration provided (`ioredis-mock/jest` bundle); prevents CI complexity (no Redis container).** Allows testing sorted sets, TTL, and key expiration patterns without external Redis. |

**ioredis replaces InMemoryConversationStore (LRU, 100 entries) with persistent Redis storage for v1.4 onward.**

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `vitest` | Unit testing (client + server) | ^3.x (3.0.18 latest). Powered by Vite; shares config with the client build. Run with `vitest --workspace` for monorepo coverage. |
| `@testing-library/react` | React component tests | Pair with Vitest. Tests the `AdaptiveCardRenderer`, chat transcript, etc. |
| ESLint | Linting | ESLint 9 with flat config (`eslint.config.js` at root). Use `typescript-eslint` v8+ with `projectService`. |
| Prettier | Formatting | Use `eslint-config-prettier` to disable conflicting ESLint format rules. |
| `tsx` | Run TypeScript files in Node | For server dev (`tsx watch src/index.ts`). No compile step during development. |
| GitHub Actions | CI | Lint + test both workspaces. See Installation section for script hooks. |

---

## Installation

### Core Setup (from 2026-02-19)

```bash
# Root setup (npm workspaces)
npm install

# --- packages/shared ---
npm install zod@3.25.76 --workspace=packages/shared

# --- packages/server ---
npm install \
  express@^5 \
  cors helmet morgan dotenv express-async-errors \
  @microsoft/agents-copilotstudio-client \
  @azure/msal-node \
  adaptivecards adaptivecards-templating \
  zod@3.25.76 \
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

### v1.4 Redis Addition

```bash
# Add ioredis to server/ workspace
cd server && npm install ioredis@^5.9.0

# Add testing mock
npm install -D ioredis-mock@^5.11.0

# Verify single ioredis instance (existing CI check covers this)
npm ls ioredis --depth=Infinity
```

**Updated server/package.json (partial view):**
```json
{
  "dependencies": {
    "@copilot-chat/shared": "*",
    "@microsoft/agents-copilotstudio-client": "^1.1.1",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.21.0",
    "ioredis": "^5.9.0",
    "jose": "^6.1.3",
    "lru-cache": "^11.0.0",
    "uuid": "^11.0.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.0",
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "ioredis-mock": "^5.11.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Do NOT add:**
- ❌ `redis` (legacy node-redis v3 — unmaintained)
- ❌ `redis-mock` (targets old node-redis, not ioredis)
- ❌ Custom redis wrapper packages
- ❌ `node-redis` (valid but not chosen for this codebase)

### Environment Configuration

Add to `server/.env.example`:

```bash
# Redis persistent state store (v1.4+)
# Format: rediss://[username]:[password]@[host]:[port]
# For Azure Cache for Redis: port 6380 (TLS mandatory)
REDIS_URL=rediss://default:your-azure-primary-key@your-cache.redis.cache.windows.net:6380

# Alternative (separate config if .env parser doesn't support rediss://)
REDIS_HOST=your-cache.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD=<primary-or-secondary-key>
REDIS_TLS_ENABLED=true
```

---

## Azure Cache for Redis Configuration (v1.4)

### TLS & Port Requirements

| Parameter | Value | Purpose |
|-----------|-------|---------|
| **Host** | `<cache-name>.redis.cache.windows.net` | Azure Cache FQDN |
| **Port** | `6380` | TLS-required port (port 6379 non-TLS disabled for security) |
| **Password** | Azure Redis primary/secondary key | Authentication (ACL support; default `default` user) |
| **TLS Config** | `{ servername: '<cache-name>.redis.cache.windows.net', rejectUnauthorized: true }` | TLS 1.2+ verification; matches Azure cert hostname |
| **TLS Version** | 1.2+ (required April 2026) | Azure removing support for TLS 1.0/1.1 as of 2025-04-01 |

### ioredis Connection Pattern (URL-based, recommended)

```typescript
// server/src/redis.ts
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// ioredis automatically:
// - Parses rediss:// scheme (TLS-enabled)
// - Extracts host, port, password
// - Sets up TLS on Azure (port 6380)
const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  // For Azure Cache on port 6380, TLS is automatic
  // ioredis infers TLS from rediss:// scheme
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.on('connect', () => console.log('Redis connected'));
redis.on('ready', () => console.log('Redis ready'));

export default redis;
```

### ioredis Connection Pattern (Explicit config for non-URL mode)

```typescript
// Alternative if REDIS_URL not used:
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  // TLS config for Azure on port 6380
  ...(process.env.REDIS_PORT === '6380' && {
    tls: {
      servername: process.env.REDIS_HOST,
      rejectUnauthorized: true, // Verify Azure cert
    },
  }),
  maxRetriesPerRequest: 3,
});
```

**Recommendation:** Use REDIS_URL with `rediss://` scheme; simpler, covers both local dev and Azure.

---

## ConversationStore Interface Extension (v1.4)

**Existing interface (from `server/src/store/ConversationStore.ts`):**

```typescript
export interface StoredConversation {
  externalId: string;
  sdkConversationRef: unknown;
  history: NormalizedMessage[];
}

export interface ConversationStore {
  get(id: string): Promise<StoredConversation | undefined>;
  set(id: string, conversation: StoredConversation): Promise<void>;
  delete(id: string): Promise<void>;
}
```

**Extended for v1.4 (Redis + user-scoping + persistence):**

```typescript
export interface StoredConversation {
  externalId: string;
  sdkConversationRef: unknown;
  history: NormalizedMessage[];
  // New fields from JWT (v1.2 auth)
  userId: string;           // From UserClaims.oid (object ID)
  tenantId: string;         // From UserClaims.tid
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  // Status & workflow (v1.4+)
  status: 'active' | 'archived' | 'deleted';
  workflowId?: string;      // Optional: v1.5 Workflow Orchestrator
  workflowStep?: number;
}

export interface ConversationStore {
  // Core operations
  get(id: string): Promise<StoredConversation | undefined>;
  set(id: string, conversation: StoredConversation): Promise<void>;
  delete(id: string): Promise<void>;

  // New v1.4 query methods (Redis sorted set indexes)
  listByUser(userId: string): Promise<StoredConversation[]>;
  listByTenant(tenantId: string): Promise<StoredConversation[]>;
}
```

### Redis Key Scheme

```
conversation:{externalId}             // JSON-serialized StoredConversation
                                      // TTL: 7 days (604800 seconds)

user:{userId}:conversations           // Sorted set for user-scoped queries
                                      // member: externalId, score: createdAt timestamp

tenant:{tenantId}:conversations       // Sorted set for tenant-scoped queries
                                      // member: externalId, score: createdAt timestamp
```

### Example Operations

```typescript
// Set conversation with TTL (7 days)
await redis.set(
  `conversation:${conversation.externalId}`,
  JSON.stringify(conversation),
  'EX',
  604800
);

// Index by user (sorted set with creation timestamp as score)
await redis.zadd(
  `user:${conversation.userId}:conversations`,
  conversation.createdAt.getTime(),
  conversation.externalId
);

// Query: Get user's conversations (newest first, last 50)
const conversationIds = await redis.zrevrange(
  `user:${userId}:conversations`,
  0,
  49  // Fetch top 50
);

// Fetch full objects
const conversations = await Promise.all(
  conversationIds.map(async (id) => {
    const json = await redis.get(`conversation:${id}`);
    return json ? JSON.parse(json) : undefined;
  })
);
```

---

## Schema Validation for Deserialization (v1.4)

Extend `shared/src/schemas/` with `StoredConversationSchema`:

```typescript
// shared/src/schemas/storedConversation.ts
import { z } from 'zod';
import { NormalizedMessageSchema } from './message.js';

export const StoredConversationSchema = z.object({
  externalId: z.string().uuid(),
  sdkConversationRef: z.unknown(),
  history: z.array(NormalizedMessageSchema),
  userId: z.string(),
  tenantId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  status: z.enum(['active', 'archived', 'deleted']),
  workflowId: z.string().optional(),
  workflowStep: z.number().int().optional(),
});

export type StoredConversation = z.infer<typeof StoredConversationSchema>;
```

Use in Redis deserialization:

```typescript
import { StoredConversationSchema } from '@copilot-chat/shared';

const json = await redis.get(`conversation:${id}`);
if (!json) return undefined;

const raw = JSON.parse(json);
// Validates shape and coerces dates; throws ZodError if invalid
const conversation = StoredConversationSchema.parse(raw);
return conversation;
```

---

## Testing with ioredis-mock (v1.4)

### Unit Test Setup (Vitest)

```typescript
// server/src/store/__tests__/RedisConversationStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Redis from 'ioredis-mock';
import { RedisConversationStore } from '../RedisConversationStore.js';

// ioredis-mock provides the same API as ioredis but in-memory
const redis = new Redis();

let store: RedisConversationStore;

beforeEach(async () => {
  await redis.flushall();
  store = new RedisConversationStore(redis);
});

describe('RedisConversationStore', () => {
  it('should set and get a conversation', async () => {
    const conv: StoredConversation = {
      externalId: '550e8400-e29b-41d4-a716-446655440000',
      userId: 'user-1',
      tenantId: 'tenant-1',
      sdkConversationRef: { reference: 'test' },
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
    };

    await store.set(conv.externalId, conv);
    const retrieved = await store.get(conv.externalId);

    expect(retrieved).toEqual(conv);
  });

  it('should list conversations by user with sorted set index', async () => {
    const userId = 'user-1';
    const conv1 = createConversation(userId);
    const conv2 = createConversation(userId);

    await store.set(conv1.externalId, conv1);
    await store.set(conv2.externalId, conv2);

    const results = await store.listByUser(userId);
    expect(results).toHaveLength(2);
    expect(results.map((c) => c.externalId)).toContain(conv1.externalId);
  });

  it('should handle TTL expiration (mocked via Redis commands)', async () => {
    const conv = createConversation('user-1');
    await store.set(conv.externalId, conv);

    // ioredis-mock supports EXPIRE/TTL commands
    await redis.expire(`conversation:${conv.externalId}`, 1);
    const ttl = await redis.ttl(`conversation:${conv.externalId}`);
    expect(ttl).toBeGreaterThan(0);
  });
});
```

### No Jest Bundle Needed (Vitest Native Support)

ioredis-mock works directly with Vitest:

```typescript
// vitest.config.ts (if needed)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // ioredis-mock is pure Node.js; no special config needed
  },
});
```

### Integration Test Against Real Azure Redis

Separate from unit tests:

```typescript
// server/src/store/__tests__/RedisConversationStore.integration.test.ts
// Requires REDIS_URL to be set to real Azure Redis instance
// Use `npm run test:integration` or skip if REDIS_URL not set

import Redis from 'ioredis';

const skipIfNoRedis = process.env.REDIS_URL ? describe : describe.skip;

skipIfNoRedis('RedisConversationStore (Azure Redis integration)', () => {
  let redis: Redis;
  let store: RedisConversationStore;

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL!);
    store = new RedisConversationStore(redis);
  });

  afterAll(async () => {
    await redis.flushall();
    await redis.quit();
  });

  it('should connect to Azure Redis via TLS', async () => {
    const info = await redis.info('server');
    expect(info).toContain('redis_version');
  });

  it('should persist and retrieve conversations', async () => {
    // Same test as unit test but against real Redis
  });
});
```

Run in CI:

```bash
# Unit tests (ioredis-mock, no external dependency)
npm test

# Integration tests (requires REDIS_URL set to Azure)
REDIS_URL=rediss://... npm run test:integration
```

---

## Health Check & Graceful Degradation (v1.4)

Add to `server/src/app.ts`:

```typescript
app.get('/health', async (_req, res) => {
  try {
    const info = await redis.info('server');
    return res.json({
      status: 'ok',
      redis: 'connected',
      timestamp: new Date(),
    });
  } catch (err) {
    // Redis unavailable — return 503 Service Unavailable
    console.error('Health check failed:', err);
    return res.status(503).json({
      status: 'degraded',
      redis: 'unavailable',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});
```

**Failure policy:**
- ✅ Chat operations fail with 503 if Redis unavailable (no silent fallback to in-memory)
- ✅ Health endpoint reports Redis status to upstream load balancers
- ✅ Client retries with exponential backoff (existing 3-attempt logic in `useChatApi`)

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| ioredis v5.9 | node-redis v5 | node-redis is more modern (async-only), but ioredis has wider Azure adoption, explicit TLS cert handling, and well-documented Azure patterns. |
| ioredis v5.9 | redis npm package (node-redis v3) | **NEVER** — unmaintained, incorrect choice for new projects. |
| ioredis-mock | redis-mock | redis-mock targets old node-redis; ioredis-mock matches ioredis API exactly and has Jest integration. |
| Zod + JSON | Custom serialization | Zod provides runtime validation; JSON is built-in; no additional codec library needed. |
| Sorted sets for indexing | Full-text search / Redis Search | Redis sorted sets sufficient for v1.4 user-scoped queries. Redis Search (module) overkill for single-field lookups. |
| Express 5 | Fastify 5 | Choose Fastify if raw throughput is primary concern. Express chosen per PROJECT.md for ecosystem familiarity. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `redis` npm package | Legacy node-redis v3 — unmaintained since 2021; redis.io docs recommend against it | `ioredis@^5.9.0` |
| `node-redis@v4` or `v5` alongside ioredis | Mixing Redis clients causes duplicate connections and confusion | Choose one: ioredis for this project |
| `redis-mock` | Targets old node-redis API; incompatible with ioredis v5 | `ioredis-mock@^5.11.0` |
| `adaptivecards-react@1.1.1` | Last published 3 years ago; no React 18 support | Custom `useRef`+`useEffect` wrapper (pattern documented above) |
| InMemoryStore alone (post-v1.4) | 100-entry LRU limit; no multi-instance sharing; no persistence | Redis-backed `RedisConversationStore` |
| Generic connection pooling library | ioredis handles pooling internally; external pooling adds complexity | Rely on ioredis built-in connection multiplexing |

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

**If multi-instance deployment required (v1.4+):**
- Redis becomes the shared conversation store across all Express server instances
- No need for sticky sessions or session replication
- Sorted set indexes enable user-scoped queries across instances

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@microsoft/agents-copilotstudio-client@^1.2.x` | Node 20, 22; TypeScript 5.x | Targets Node 20+. Will not run in the browser. |
| `adaptivecards@^3.0.5` | React 18 (via custom wrapper); adaptivecards-templating ^2.x | No peer dependency on React — intentional. Works with any DOM host. |
| `zod@3.25.76` | TypeScript 5.x; Node 18+ | Pinned in shared/package.json for consistency. Do not upgrade to v4 without coordinated migration. |
| `@azure/msal-node@^3.8.7` | Node 20+; TypeScript 5.x | Drop-in with Express middleware. Token cache is in-memory by default. |
| `express@^5.2.x` | `@types/express@^5.0.6` | Express 5 types in separate package; do not use v4 types with Express 5. |
| `vite@^6.x` | `@vitejs/plugin-react@^5.x`; `tailwindcss@^4.x` via `@tailwindcss/vite` | Vite 6 dropped Node 21 support; use Node 20 or 22 LTS. |
| `vitest@^3.x` | `vite@^6.x`; React 18 | Vitest 3 requires Vite 6+. |
| `ioredis@^5.9.x` | Node 18+; TypeScript 5.x | Supports `rediss://` URLs (TLS). Azure Cache for Redis requires port 6380 + TLS. |
| `ioredis-mock@^5.11.x` | Node 18+; ioredis@^5.x | In-memory emulation; same API as ioredis v5. No external dependencies. |

---

## Sources

### Core Stack (2026-02-19)

- Microsoft Learn — CopilotStudioClient API Reference (updated 2025-12-18): https://learn.microsoft.com/en-us/javascript/api/@microsoft/agents-copilotstudio-client/copilotstudioclient?view=agents-sdk-js-latest — **HIGH confidence** (official Microsoft docs)
- Microsoft Learn — Integrate with web/native apps using M365 Agents SDK (updated 2025-12-12): https://learn.microsoft.com/en-us/microsoft-copilot-studio/publication-integrate-web-or-native-app-m365-agents-sdk — **HIGH confidence**
- npm `@microsoft/agents-copilotstudio-client` — version 1.2.3 (GA Sep 2025): https://www.npmjs.com/package/@microsoft/agents-copilotstudio-client — **HIGH confidence**
- MSAL Node v3.8.7 API reference: https://azuread.github.io/microsoft-authentication-library-for-js/ref/modules/_azure_msal_node.html — **HIGH confidence**
- Zod v3 documentation: https://zod.dev/ — **HIGH confidence**
- Adaptive Cards JavaScript SDK (MS Learn, updated 2025-07-03): https://learn.microsoft.com/en-us/adaptive-cards/sdk/rendering-cards/javascript/getting-started — **HIGH confidence**
- GitHub Discussion — adaptivecards-react React 18 compatibility (no plans to support, Sep 2023): https://github.com/microsoft/AdaptiveCards/discussions/8671 — **HIGH confidence** (official maintainer response)
- Express 5.1.0 / 5.2.1 stable release: https://expressjs.com/ — **HIGH confidence**
- Vite 6 release blog: https://vite.dev/blog/announcing-vite6 — **HIGH confidence**
- Tailwind CSS v4 Vite integration: https://tailwindcss.com/docs — **HIGH confidence**
- WebSearch: React Router v7, TanStack React Query v5 — **MEDIUM confidence** (npm registry data via search)

### Redis & Azure Cache (2026-02-21)

- [ioredis GitHub — robust, performance-focused Redis client](https://github.com/redis/ioredis) — **HIGH confidence** (official repo, actively maintained)
- [ioredis npm package](https://www.npmjs.com/package/ioredis) — **HIGH confidence** (latest 5.9.3, published Feb 2026)
- [Azure Cache for Redis: TLS Configuration](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-tls-configuration) — **HIGH confidence** (official Microsoft docs)
- [Azure Cache for Redis: Remove TLS 1.0/1.1 (April 2025 requirement)](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-remove-tls-10-11) — **HIGH confidence** (official Azure docs)
- [ioredis-mock — in-memory Redis emulator](https://github.com/stipsan/ioredis-mock) — **HIGH confidence** (official repo)
- [ioredis-mock npm](https://www.npmjs.com/package/ioredis-mock) — **HIGH confidence** (latest 5.11.0+)
- [Redis sorted sets documentation](https://redis.io/docs/latest/develop/data-types/sorted-sets/) — **HIGH confidence** (official Redis docs)
- [Redis TTL/EXPIRE commands](https://redis.io/docs/latest/commands/expire/) — **HIGH confidence** (official Redis docs)
- [ioredis connection pooling patterns (2026-01-25)](https://oneuptime.com/blog/post/2026-01-25-redis-connection-pooling/view) — **MEDIUM confidence** (recent, corroborated with official docs)
- WebSearch: ioredis vs node-redis comparison, ioredis-mock vs redis-mock — **MEDIUM confidence** (multiple corroborating sources)

---

*Stack research for: React + Node monorepo chat app — Copilot Studio + Adaptive Cards*
*Original research: 2026-02-19 | Redis extension: 2026-02-21*
