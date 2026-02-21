# Phase 1: Scaffold + Schema + Server Foundation - Research

**Researched:** 2026-02-19
**Domain:** npm workspaces monorepo, TypeScript, Zod schemas, Express, @microsoft/agents-copilotstudio-client
**Confidence:** HIGH (stack verified via official docs and npm registry)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Auth stub behavior**
- When `AUTH_REQUIRED=true` (the default when env var is unset), requests with no Authorization header receive an immediate `401 { error: 'Unauthorized' }` JSON response
- Dev bypass: set `AUTH_REQUIRED=false` in `.env` to disable auth entirely for local development
- `AUTH_REQUIRED` defaults to `true` when the env var is absent (fail-closed, never accidentally open)
- Log verbosity on auth failure: Claude's discretion — but must include a visible TODO comment pointing to where real MSAL validation plugs in

**Conversation state shape**
- Each stored conversation holds: server-generated UUID (the external conversationId), the Copilot SDK's internal conversation reference, and the full history of `NormalizedMessage[]`
- Store is behind a `ConversationStore` interface (`get`, `set`, `delete`) with an `InMemoryConversationStore` implementation — production swap (Redis, etc.) is a drop-in
- Eviction policy: LRU — cap at a reasonable number of active conversations (Claude decides the cap, e.g. 100)
- External conversationId is a server-generated UUID; internal SDK conversation ID is stored internally and never exposed to the client API

**Env var handling**
- Server validates all required env vars in `server/src/config.ts` at startup — before any routes register
- `.env.example` files must include inline comments on every variable explaining what it is and where to find it
- Client validates `VITE_*` env vars at build/runtime (fail if `VITE_API_URL` is missing)

### Claude's Discretion
- Auth stub log verbosity (beyond the required TODO comment)
- All workspace import style details (package ref style, enforcement mechanism, shared/ build vs raw TS)
- Server startup behavior when required env vars are missing (fail-fast crash vs warn-and-degrade)
- LRU eviction cap size

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Monorepo scaffold with npm workspaces: `client/`, `server/`, `shared/` directories | npm workspaces root package.json with `"workspaces": ["client", "server", "shared"]` |
| INFRA-02 | TypeScript configured across all three workspaces | Each workspace gets its own `tsconfig.json` extending a root base config; project references for shared/ |
| INFRA-03 | `npm run dev` starts client and server concurrently via a root-level script | `concurrently` v9.x with `--names` and `--kill-others-on-fail` |
| INFRA-04 | `npm test` runs Jest (client) and Vitest (server) across both packages | `npm run test --workspaces` or per-workspace scripts invoked from root |
| INFRA-05 | `.env.example` files for both `client/` and `server/` with all required placeholder variables | `dotenv` on server, Vite built-in `VITE_*` on client; file structure described below |
| INFRA-06 | ESLint and Prettier configured and passing across all workspaces | ESLint 9 flat config + eslint-config-prettier; single root `eslint.config.mjs` with per-package overrides |
| SCHEMA-01 | Shared Zod schema defines `NormalizedMessage` type | Zod `z.object()` with discriminated union on `kind`; exported from `shared/src/index.ts` |
| SCHEMA-02 | Shared Zod schemas for all three API endpoint request/response shapes | `/api/chat/start`, `/api/chat/send`, `/api/chat/card-action` schemas defined in `shared/` |
| SCHEMA-03 | Zod installed as dependency of `shared/` only (single instance, not hoisted separately) | Install Zod in `shared/` only; use root `overrides` in package.json to pin version; verified single instance via `npm ls zod` |
| SCHEMA-04 | TypeScript types inferred from Zod schemas and exported from `shared/` | `z.infer<typeof Schema>` pattern; types re-exported alongside schemas |
| SERV-01 | Express server with TypeScript running on Node 20+ | Express 4.x + `@types/express`; `tsx` or `ts-node` for dev, compiled for prod |
| SERV-02 | `POST /api/chat/start` calls `CopilotStudioClient.startConversationStreaming()` | AsyncGenerator — `for await...of` to collect activities; returns `{ conversationId }` (server-generated UUID) |
| SERV-05 | `CopilotStudioClient` instantiated as module-level singleton (server-side only) | Single instance in `server/src/copilot.ts`; never imported by client |
| SERV-09 | MSAL OBO token flow stubs with TODO comments; fail-closed, default `AUTH_REQUIRED=true` | Express middleware in `server/src/middleware/auth.ts`; checks `process.env.AUTH_REQUIRED !== 'false'` |
| SERV-10 | CORS configured for client origin only (not wildcard) | `cors` npm package; `origin: process.env.CORS_ORIGIN || 'http://localhost:5173'` |
</phase_requirements>

---

## Summary

Phase 1 establishes the monorepo foundation: npm workspaces wiring three packages together (`client/`, `server/`, `shared/`), TypeScript across all three, shared Zod schemas as the single source of truth for types, and an Express server with a fail-closed auth stub serving `POST /api/chat/start`.

The Microsoft Copilot Studio client SDK (`@microsoft/agents-copilotstudio-client` v1.1.1 stable) uses an async-generator streaming API — `startConversationStreaming()` and `sendActivityStreaming()` both return `AsyncGenerator<Activity>`, consumed with `for await...of`. The client requires a JWT token at construction time, making the auth stub pattern natural: stub returns the token slot empty with a TODO, real MSAL OBO fills it later.

The key complexity in this phase is ensuring Zod is installed exactly once (in `shared/`), workspace imports are clean, and the LRU-backed `ConversationStore` is properly abstracted. Everything else is standard Express + TypeScript boilerplate.

**Primary recommendation:** Use npm workspaces with TypeScript project references. Install Zod only in `shared/`. Build `shared/` to `dist/` so both `client/` (Vite) and `server/` (Node) consume compiled JS with type declarations, avoiding raw-TS cross-workspace complications. Use `concurrently` at root for `npm run dev`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| npm workspaces | npm 7+ (Node 20 built-in) | Monorepo package management | Native, no extra tool required |
| TypeScript | ^5.7 | Type safety across all three packages | Current stable, ships with Vite 6 |
| Zod | ^3.24 | Schema validation + type inference | Industry standard; v4 in beta, use v3 for stability |
| Express | ^4.21 | HTTP server | Most widely deployed Node server framework |
| @microsoft/agents-copilotstudio-client | ^1.1.1 | Copilot Studio proxy SDK | Official Microsoft SDK, only viable option |
| concurrently | ^9.1.2 | Run client + server dev in parallel | Standard for npm workspace dev scripts |
| uuid | ^11.x | Server-generated conversation UUIDs | Built-in types; crypto.randomUUID() also viable in Node 20+ |
| lru-cache | ^11.x | LRU eviction for InMemoryConversationStore | Actively maintained, native TypeScript support |
| cors | ^2.8.5 | Express CORS middleware | Standard Express companion |
| dotenv | ^16.x | Load `.env` files in server | Required for Node < 22; COPILOT creds must not reach client |
| tsx | ^4.x | Run TypeScript directly in Node dev | Faster than ts-node; no compilation step in dev |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vite | ^6.x | Client dev server + bundler | Used for `client/` only |
| Vitest | ^3.x | Server unit tests | Vite-native, fastest for TS server code |
| Jest + @types/jest | ^29.x | Client unit tests | Required per REQUIREMENTS.md INFRA-04 |
| eslint | ^9.x | Linting | Flat config (v9 mandatory — v8 EOL) |
| prettier | ^3.x | Formatting | Paired with eslint-config-prettier |
| @types/express | ^4.x | Express TypeScript types | Dev dependency on server |
| @types/cors | ^2.x | CORS types | Dev dependency on server |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| npm workspaces | pnpm/Yarn workspaces | npm is simpler, no extra tool; pnpm faster installs but adds tooling |
| tsx (dev runner) | ts-node | tsx faster startup; ts-node more mature but slower |
| lru-cache | Custom Map with counter | lru-cache handles edge cases, O(1) eviction; not worth hand-rolling |
| concurrently | npm-run-all2 | concurrently more actively maintained for 2025+ |
| Zod v3 | Zod v4 | Zod v4 in beta as of research date; v3 is stable production choice |

**Installation (root):**
```bash
npm install --save-dev concurrently
npm install --workspace=server cors dotenv express lru-cache uuid
npm install --workspace=server --save-dev @types/cors @types/express tsx typescript
npm install --workspace=shared zod
npm install --workspace=client --save-dev vite @vitejs/plugin-react typescript
```

---

## Architecture Patterns

### Recommended Project Structure

```
/                                    # Monorepo root
├── package.json                     # "private": true, workspaces, root scripts
├── tsconfig.base.json               # Shared TS base config
├── eslint.config.mjs                # Root ESLint 9 flat config
├── .prettierrc                      # Single Prettier config for all
├── client/
│   ├── package.json                 # name: "@copilot-chat/client"
│   ├── tsconfig.json                # Extends tsconfig.base.json, references shared
│   ├── vite.config.ts
│   └── src/
│       └── main.tsx
├── server/
│   ├── package.json                 # name: "@copilot-chat/server"
│   ├── tsconfig.json                # Extends tsconfig.base.json, references shared
│   ├── .env.example
│   └── src/
│       ├── index.ts                 # Entry point: loads config, registers middleware, starts
│       ├── config.ts                # Env var validation (MUST run before routes)
│       ├── app.ts                   # Express app factory (for testing without listen())
│       ├── copilot.ts               # Module-level CopilotStudioClient singleton
│       ├── middleware/
│       │   └── auth.ts              # Fail-closed auth stub middleware
│       ├── routes/
│       │   └── chat.ts              # POST /api/chat/start
│       └── store/
│           ├── ConversationStore.ts # Interface: get/set/delete
│           └── InMemoryStore.ts     # LRU-backed implementation
└── shared/
    ├── package.json                 # name: "@copilot-chat/shared"; main: "dist/index.js"
    ├── tsconfig.json                # Extends tsconfig.base.json; composite: true
    └── src/
        ├── index.ts                 # Re-exports all schemas + types
        └── schemas/
            ├── message.ts           # NormalizedMessage schema
            └── api.ts               # Request/response schemas for all 3 endpoints
```

### Pattern 1: Shared Package — Build to dist, Consume Compiled

**What:** `shared/` is compiled TypeScript (`tsc --build`) producing `dist/` with `.js` + `.d.ts` files. Both `client/` and `server/` import from the compiled output.

**Why:** Vite and Node both consume JS natively. Raw TS cross-workspace imports require each consumer to configure TypeScript path resolution specially, creating fragile builds. Compiled dist is universally portable.

**shared/package.json:**
```json
{
  "name": "@copilot-chat/shared",
  "version": "0.0.1",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc --build",
    "dev": "tsc --build --watch"
  }
}
```

**Consumer package.json** (server or client):
```json
{
  "dependencies": {
    "@copilot-chat/shared": "*"
  }
}
```

**tsconfig.json** (server):
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "composite": false },
  "references": [{ "path": "../shared" }]
}
```

### Pattern 2: Zod Single Instance — Install in shared/ only

**What:** Zod is a dependency of `shared/` only. `client/` and `server/` access Zod types only through `@copilot-chat/shared` re-exports. Root `overrides` in package.json pins the version.

**Root package.json:**
```json
{
  "private": true,
  "workspaces": ["client", "server", "shared"],
  "overrides": {
    "zod": "^3.24.0"
  }
}
```

**Verify after install:**
```bash
npm ls zod
# Must show exactly ONE instance
```

**Pitfall:** If `client/` or `server/` lists Zod as a direct dependency, npm may hoist a second instance causing `instanceof ZodError` checks to fail. The overrides field prevents version mismatches, but the best defense is not listing Zod in consumer packages at all.

### Pattern 3: CopilotStudioClient Singleton

**What:** Client instantiated once at module load in `server/src/copilot.ts`, using token from auth middleware (or stub). Exported as a module singleton.

**server/src/copilot.ts:**
```typescript
// Source: https://learn.microsoft.com/en-us/javascript/api/@microsoft/agents-copilotstudio-client/
import {
  CopilotStudioClient,
  loadCopilotStudioConnectionSettingsFromEnv,
} from '@microsoft/agents-copilotstudio-client';
import { config } from './config.js';

const settings = loadCopilotStudioConnectionSettingsFromEnv();

// TODO: Replace stub token with real MSAL OBO token flow.
// Real flow: acquire token via @azure/msal-node ConfidentialClientApplication.acquireTokenOnBehalfOf()
// Scope: CopilotStudioClient.scopeFromSettings(settings)
// tenantId: config.COPILOT_TENANT_ID, clientId: config.COPILOT_APP_ID, clientSecret: config.COPILOT_CLIENT_SECRET
const STUB_TOKEN = config.COPILOT_STUB_TOKEN ?? '';

export const copilotClient = new CopilotStudioClient(settings, STUB_TOKEN);
```

**server/src/routes/chat.ts (startConversationStreaming):**
```typescript
// Source: https://learn.microsoft.com/en-us/javascript/api/@microsoft/agents-copilotstudio-client/copilotstudioclient
import { v4 as uuidv4 } from 'uuid';
import { copilotClient } from '../copilot.js';
import { conversationStore } from '../store/index.js';

router.post('/api/chat/start', authMiddleware, async (req, res) => {
  const conversationId = uuidv4(); // external ID — never expose internal SDK ID
  const activities: Activity[] = [];

  for await (const activity of copilotClient.startConversationStreaming(true)) {
    activities.push(activity);
  }

  // Store internal SDK conversation reference alongside external UUID
  await conversationStore.set(conversationId, {
    externalId: conversationId,
    // internalRef stored opaquely — consumed by sendActivityStreaming
    activities,
    history: [],
  });

  res.json({ conversationId });
});
```

### Pattern 4: Fail-Closed Auth Middleware

**What:** Express middleware that reads `AUTH_REQUIRED` env var. When true (or absent), rejects requests missing `Authorization` header with 401.

```typescript
// server/src/middleware/auth.ts
import type { Request, Response, NextFunction } from 'express';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // TODO: Replace with real MSAL OBO token validation.
  // Real flow: validate JWT using @azure/msal-node or jsonwebtoken, verify audience = Copilot scope.
  // tenantId, clientId, clientSecret plug in here from config.ts.
  const authRequired = process.env.AUTH_REQUIRED !== 'false'; // fail-closed default

  if (authRequired && !req.headers.authorization) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
```

### Pattern 5: ConversationStore Interface + LRU Implementation

```typescript
// server/src/store/ConversationStore.ts
export interface StoredConversation {
  externalId: string;
  history: NormalizedMessage[];
  // internal SDK ref stored here (type from SDK)
}

export interface ConversationStore {
  get(id: string): Promise<StoredConversation | undefined>;
  set(id: string, conv: StoredConversation): Promise<void>;
  delete(id: string): Promise<void>;
}
```

```typescript
// server/src/store/InMemoryStore.ts
import { LRUCache } from 'lru-cache';
import type { ConversationStore, StoredConversation } from './ConversationStore.js';

const EVICTION_CAP = 100; // LRU cap: 100 active conversations

export class InMemoryConversationStore implements ConversationStore {
  private cache = new LRUCache<string, StoredConversation>({ max: EVICTION_CAP });

  async get(id: string) { return this.cache.get(id); }
  async set(id: string, conv: StoredConversation) { this.cache.set(id, conv); }
  async delete(id: string) { this.cache.delete(id); }
}
```

### Pattern 6: Server Config Validation (config.ts)

```typescript
// server/src/config.ts — validated BEFORE routes register
// Runs at import time; process.exit(1) on missing required vars

const required = ['COPILOT_ENVIRONMENT_ID', 'COPILOT_AGENT_SCHEMA_NAME'] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.error(`[config] Missing required env var: ${key}`);
    process.exit(1); // fail-fast
  }
}

export const config = {
  COPILOT_ENVIRONMENT_ID: process.env.COPILOT_ENVIRONMENT_ID!,
  COPILOT_AGENT_SCHEMA_NAME: process.env.COPILOT_AGENT_SCHEMA_NAME!,
  COPILOT_STUB_TOKEN: process.env.COPILOT_STUB_TOKEN,
  AUTH_REQUIRED: process.env.AUTH_REQUIRED !== 'false',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  PORT: Number(process.env.PORT ?? 3001),
} as const;
```

### Pattern 7: ESLint 9 Flat Config (Root)

Single `eslint.config.mjs` at repo root:
```javascript
// eslint.config.mjs
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tsParser },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { ...tsPlugin.configs.recommended.rules },
  },
  prettierConfig, // Must be last — disables ESLint formatting rules
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.planning/**'] },
];
```

### Anti-Patterns to Avoid

- **Wildcard CORS:** `origin: '*'` in production-bound code. Always use `CORS_ORIGIN` env var pointing to client origin.
- **Zod in consumer packages:** Never list `zod` as a dependency in `client/` or `server/` directly — all Zod use goes through `@copilot-chat/shared`.
- **Raw TS cross-workspace imports:** Don't import `../../shared/src/index.ts` with path aliases. Always import the workspace package by name: `import { ... } from '@copilot-chat/shared'`.
- **Secrets in client bundle:** Never import `@microsoft/agents-copilotstudio-client` in `client/`. No `COPILOT_*` vars in Vite config. VITE_ prefix vars are visible in browser.
- **Module-level async in singleton:** Don't use top-level await in `copilot.ts` — token acquisition happens per-request in Phase 1 stub; full MSAL is deferred.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LRU eviction | Custom linked list + Map | `lru-cache` | O(1) get/set/delete; edge cases around iterator invalidation are subtle |
| UUID generation | Custom random string | `uuid` v4 OR `crypto.randomUUID()` (Node 20+) | RFC 4122 compliance; collision resistance |
| CORS headers | Custom `res.setHeader` logic | `cors` npm package | Handles preflight, credentials, wildcard edge cases |
| Env var loading | Manual `fs.readFileSync('.env')` | `dotenv` | Handles quoting, multiline, UTF-8 edge cases |
| TypeScript compilation for shared | Custom webpack | `tsc --build` with `composite: true` | Project references give incremental builds and correct declaration emit |
| Concurrent process runner | Shell scripts with `&` | `concurrently` | Cross-platform (Windows), labeled output, kill-others-on-fail |

**Key insight:** This is pure infrastructure. Almost everything has a well-maintained library with significant edge case handling. The only novel code in this phase is the `ConversationStore` interface and the `NormalizedMessage` schema.

---

## Common Pitfalls

### Pitfall 1: Multiple Zod Instances

**What goes wrong:** `instanceof ZodError` fails, schema `.parse()` throws unexpected errors.
**Why it happens:** Both `server/` and `shared/` list `zod` as a dependency with slightly different versions. npm hoists both to their respective `node_modules`.
**How to avoid:** Install Zod ONLY in `shared/`. Add `overrides.zod` to root `package.json`. Run `npm ls zod` after install and confirm single entry.
**Warning signs:** `npm ls zod` shows more than one version/location.

### Pitfall 2: COPILOT_* Variables in Vite Bundle

**What goes wrong:** `grep -r "COPILOT" client/` finds matches in `dist/` or source — credentials in browser.
**Why it happens:** Developer imports server-side module in client code, or sets `VITE_COPILOT_*` env vars that Vite inlines.
**How to avoid:** ESLint rule or CI check: no import of `@microsoft/agents-copilotstudio-client` in `client/`. Only `VITE_*` vars defined in `client/.env.example`. COPILOT vars only in `server/.env.example`.
**Warning signs:** `grep -r "COPILOT" client/` returns any results.

### Pitfall 3: startConversationStreaming Yields Before conversationId is Set

**What goes wrong:** Trying to store the conversation before the stream completes — or mistaking the streaming nature for a single Promise.
**Why it happens:** Both streaming methods return `AsyncGenerator<Activity>`, not `Promise<Activity[]>`. Must collect with `for await...of`.
**How to avoid:** Always use `for await...of` to collect; only call `conversationStore.set()` after the loop.
**Warning signs:** `await copilotClient.startConversationStreaming()` — `await` on an AsyncGenerator returns the generator object, not activities.

### Pitfall 4: Auth Middleware `process.exit` vs return

**What goes wrong:** Auth middleware calls `next()` after sending 401, leading to "headers already sent" error.
**Why it happens:** Middleware function returns after `res.status(401).json(...)` but doesn't `return` — falls through to `next()`.
**How to avoid:** Always `return` after sending response in middleware: `res.status(401).json(...); return;`
**Warning signs:** Console logs "Cannot set headers after they are sent to the client".

### Pitfall 5: shared/ Not Built Before client/server Compile

**What goes wrong:** TypeScript can't find `@copilot-chat/shared` types; imports fail at build time.
**Why it happens:** `shared/dist/` doesn't exist yet when `npm test` runs in a fresh clone.
**How to avoid:** Add `"prebuild": "npm run build --workspace=shared"` in root scripts, or use TypeScript project references with `tsc -b` at root.
**Warning signs:** `Cannot find module '@copilot-chat/shared'` TypeScript errors.

### Pitfall 6: loadCopilotStudioConnectionSettingsFromEnv Env Var Names

**What goes wrong:** SDK can't find settings; client construction fails.
**Why it happens:** Env var names expected by `loadCopilotStudioConnectionSettingsFromEnv()` are not publicly documented in simple form — they map to `ConnectionSettings` fields.
**How to avoid:** Based on ConnectionSettings fields (`environmentId`, `schemaName`, `tenantId`), the expected env vars follow the pattern `COPILOT_ENVIRONMENT_ID`, `COPILOT_AGENT_SCHEMA_NAME`. Verify by reading SDK source or using the constructor directly with explicit values from `config.ts` as a fallback.
**Warning signs:** SDK throws on client construction despite `.env` file present.

---

## Code Examples

### NormalizedMessage Zod Schema (shared/)

```typescript
// shared/src/schemas/message.ts
import { z } from 'zod';

export const NormalizedMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  kind: z.enum(['text', 'adaptiveCard']),
  text: z.string().optional(),
  cardJson: z.record(z.unknown()).optional(),
  cardId: z.string().optional(),
});

export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>;
```

### API Endpoint Schemas (shared/)

```typescript
// shared/src/schemas/api.ts
import { z } from 'zod';
import { NormalizedMessageSchema } from './message.js';

// POST /api/chat/start
export const StartConversationResponseSchema = z.object({
  conversationId: z.string().uuid(),
});

// POST /api/chat/send
export const SendMessageRequestSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1),
});
export const SendMessageResponseSchema = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(NormalizedMessageSchema),
});

// POST /api/chat/card-action
export const CardActionRequestSchema = z.object({
  conversationId: z.string().uuid(),
  cardId: z.string(),
  userSummary: z.string(),
  submitData: z.record(z.unknown()),
});
export const CardActionResponseSchema = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(NormalizedMessageSchema),
});

export type StartConversationResponse = z.infer<typeof StartConversationResponseSchema>;
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;
export type CardActionRequest = z.infer<typeof CardActionRequestSchema>;
export type CardActionResponse = z.infer<typeof CardActionResponseSchema>;
```

### Root package.json Scripts

```json
{
  "private": true,
  "workspaces": ["client", "server", "shared"],
  "scripts": {
    "dev": "concurrently --names \"CLIENT,SERVER,SHARED\" --kill-others-on-fail \"npm run dev --workspace=client\" \"npm run dev --workspace=server\" \"npm run dev --workspace=shared\"",
    "build": "npm run build --workspace=shared && npm run build --workspace=client && npm run build --workspace=server",
    "test": "npm run test --workspace=client && npm run test --workspace=server",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "overrides": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "concurrently": "^9.1.2",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.x",
    "@typescript-eslint/parser": "^8.x",
    "eslint-config-prettier": "^10.x",
    "prettier": "^3.x",
    "typescript": "^5.7"
  }
}
```

### server/.env.example

```bash
# --- Copilot Studio Connection ---
# Your Power Platform environment ID — from Power Platform Admin Center > Environments
COPILOT_ENVIRONMENT_ID=your-environment-id-here

# The schema name of your Copilot Studio agent — from Copilot Studio > Agent Settings
COPILOT_AGENT_SCHEMA_NAME=your-agent-schema-name-here

# --- Auth (MSAL OBO — stub in Phase 1) ---
# Set to "false" to bypass auth for local dev. Default: "true" (fail-closed).
AUTH_REQUIRED=true

# Stub token for local dev when AUTH_REQUIRED=false. Leave blank in production.
COPILOT_STUB_TOKEN=

# Your Azure App Registration tenant ID — from Azure Portal > App Registrations
COPILOT_TENANT_ID=your-tenant-id-here

# Your Azure App Registration client ID — from Azure Portal > App Registrations > Overview
COPILOT_APP_ID=your-app-client-id-here

# --- Server Config ---
# The port the Express server listens on
PORT=3001

# The client origin for CORS — must match exactly (no trailing slash)
CORS_ORIGIN=http://localhost:5173
```

### client/.env.example

```bash
# The URL of the Express server (no trailing slash)
# Development: http://localhost:3001
VITE_API_URL=http://localhost:3001
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ts-node for dev server | tsx | 2023+ | ~4x faster startup, no tsconfig.json requirements |
| ESLint 8 `.eslintrc` | ESLint 9 flat config `eslint.config.mjs` | ESLint 9 (2024), v8 EOL 2025 | Breaking change — must use flat config |
| `askQuestionAsync` / `sendActivity` | `startConversationStreaming` / `sendActivityStreaming` | SDK v1.1+ | Old methods deprecated; new ones return AsyncGenerator |
| `agentIdentifier` field | `schemaName` field | SDK v1.1+ | `agentIdentifier` deprecated; use `schemaName` |
| Vitest workspace file | Vitest projects in root config | Vitest 3.2 (2025) | `vitest.workspace.ts` deprecated; use `projects` array |

---

## Open Questions

1. **What env vars does `loadCopilotStudioConnectionSettingsFromEnv()` expect exactly?**
   - What we know: Docs show `ConnectionSettings` fields: `environmentId`, `schemaName`, `tenantId`, `appClientId`. The function reads from env.
   - What's unclear: Exact env var names (e.g., `COPILOT_ENVIRONMENT_ID` vs `environmentId`).
   - Recommendation: Construct `ConnectionSettings` explicitly in `copilot.ts` using `config.ts` values rather than relying on `loadCopilotStudioConnectionSettingsFromEnv()`. This is more explicit, testable, and avoids undocumented env var name coupling.

2. **Does CopilotStudioClient maintain internal conversation state, or must we track the conversationId externally?**
   - What we know: `sendActivityStreaming(activity, conversationId?)` accepts an optional conversationId. The streaming methods yield activities.
   - What's unclear: Whether the SDK tracks the "active conversation" internally or requires explicit passing.
   - Recommendation: Pass `conversationId` explicitly to every call. Store the SDK's internal reference in `ConversationStore` alongside the external UUID.

---

## Sources

### Primary (HIGH confidence)

- Microsoft Learn — CopilotStudioClient class: https://learn.microsoft.com/en-us/javascript/api/@microsoft/agents-copilotstudio-client/copilotstudioclient?view=agents-sdk-js-latest
- Microsoft Learn — ConnectionSettings class: https://learn.microsoft.com/en-us/javascript/api/@microsoft/agents-copilotstudio-client/connectionsettings?view=agents-sdk-js-latest
- Microsoft Learn — @microsoft/agents-copilotstudio-client package: https://learn.microsoft.com/en-us/javascript/api/@microsoft/agents-copilotstudio-client/?view=agents-sdk-js-latest
- Microsoft Learn — Agents SDK JS overview (v1.2.2): https://learn.microsoft.com/en-us/javascript/api/overview/agents-overview?view=agents-sdk-js-latest
- Express CORS middleware docs: https://expressjs.com/en/resources/middleware/cors.html

### Secondary (MEDIUM confidence)

- npm: lru-cache v11 (Isaac Z. Schlueter, actively maintained): https://www.npmjs.com/package/lru-cache
- npm: concurrently v9.1.2: https://www.npmjs.com/package/concurrently
- npm: uuid (built-in TypeScript types): https://www.npmjs.com/package/uuid
- Speakeasy — single Zod instance in monorepos: https://www.speakeasy.com/guides/sdks/typescript-monorepo-tips
- Vitest 3 monorepo setup: https://www.thecandidstartup.org/2025/09/08/vitest-3-monorepo-setup.html
- ESLint 9 flat config in monorepo: https://medium.com/@felipeprodev/how-to-use-eslint-v9-in-a-monorepo-with-flat-config-file-format-8ef2e06ce296

### Tertiary (LOW confidence — flag for validation)

- `loadCopilotStudioConnectionSettingsFromEnv()` exact env var names: Not definitively documented. Inferred from field names. **Recommend explicit construction instead.**
- Microsoft Agents SDK GitHub sample for copilotstudio-client token flow: https://github.com/microsoft/Agents/tree/main/samples/nodejs/copilotstudio-client (file contents not accessible; pattern inferred from docs)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All packages verified on npm/official docs
- Architecture: HIGH — Patterns derived from official SDK docs and standard TypeScript monorepo practices
- CopilotStudioClient API: HIGH — Verified from Microsoft Learn official reference
- Pitfalls: HIGH — Derived from verified SDK behavior and known npm workspace mechanics
- loadCopilotStudioConnectionSettingsFromEnv env var names: LOW — Not explicitly documented

**Research date:** 2026-02-19
**Valid until:** 2026-04-19 (stable libraries; SDK beta versions move fast)

## RESEARCH COMPLETE

**Phase:** 1 - Scaffold + Schema + Server Foundation
**Confidence:** HIGH

### Key Findings

- `@microsoft/agents-copilotstudio-client` v1.1.1 is stable; `startConversationStreaming()` and `sendActivityStreaming()` return `AsyncGenerator<Activity>` — not Promises — consumed with `for await...of`
- Zod must be installed only in `shared/` with root `overrides.zod` to guarantee single instance; verify with `npm ls zod`
- Build `shared/` to `dist/` (TypeScript project references) so both Vite client and Node server consume compiled JS — avoids raw-TS cross-workspace complications
- ESLint 9 flat config is mandatory (ESLint 8 EOL); use single root `eslint.config.mjs`
- `loadCopilotStudioConnectionSettingsFromEnv()` env var names are undocumented — recommend explicit `ConnectionSettings` construction from `config.ts` instead
- `AUTH_REQUIRED` env var controls fail-closed behavior; check `!== 'false'` so missing var defaults to `true`

### File Created
`.planning/phases/01-scaffold-schema-server-foundation/01-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All packages verified on npm registry and official docs |
| CopilotStudioClient API | HIGH | Official Microsoft Learn reference docs, updated Jan 2026 |
| Architecture Patterns | HIGH | Derived from official SDK samples and TypeScript monorepo standards |
| Common Pitfalls | HIGH | Derived from verified SDK behavior and npm workspace mechanics |
| SDK env var names | LOW | `loadCopilotStudioConnectionSettingsFromEnv()` env names not publicly documented |

### Open Questions
1. Exact env var names for `loadCopilotStudioConnectionSettingsFromEnv()` — recommend bypassing with explicit construction
2. Whether CopilotStudioClient tracks conversation state internally or requires explicit ID passing per call

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
