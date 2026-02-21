# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agentic Copilot Chat App — a full-stack monorepo chat UI powered by Microsoft Copilot Studio with Adaptive Cards support. Three npm workspaces: `client` (React 18 + Vite), `server` (Express.js proxy), and `shared` (Zod schemas + TypeScript types).

## Commands

### Root (runs all workspaces)
```bash
npm run dev          # Start client (port 5173) + server (port 3001) concurrently
npm run build        # Build all: shared → client → server
npm test             # Run tests across all workspaces
npm run lint         # ESLint all workspaces
npm run format       # Prettier format all files
npm run format:check # Prettier check without writing
```

### Per-workspace
```bash
# Server
cd server && npm run dev    # tsx watch (hot reload)
cd server && npm test       # Vitest

# Client
cd client && npm run dev    # Vite dev server
cd client && npm test       # Jest

# Shared
cd shared && npm run build  # Must rebuild after schema changes
```

### Environment setup
Copy `server/.env.example` to `server/.env` and fill in Copilot Studio credentials. Client only needs `VITE_API_URL` (defaults to `http://localhost:3001`).

## Architecture

### Monorepo layout
- **`shared/`** — Zod schemas + TypeScript types; the single source of truth for API contracts. Client and server both depend on this. **Always rebuild after changes:** `cd shared && npm run build`.
- **`server/`** — Express proxy. Holds all Copilot Studio credentials (never exposed to client). Normalizes SDK Activities → `NormalizedMessage[]`.
- **`client/`** — React UI. All API calls go through `useChatApi` hook (central state machine using `useReducer`).

### Data flow
```
Client chatApi.ts → useChatApi (useReducer state) → Express routes → cardActionAllowlist → CopilotStudioClient → Copilot Studio
```

### Server API endpoints
```
POST /health                 # Health check (no auth)
POST /api/chat/start         # Create conversation → { conversationId }
POST /api/chat/send          # Send message → { conversationId, messages: NormalizedMessage[] }
POST /api/chat/card-action   # Forward Adaptive Card action → { conversationId, messages }
```

All `/api/*` routes require a Bearer token (`AUTH_REQUIRED=true` by default, validated in `server/src/middleware/auth.ts`).

### Key design decisions
- **Single Zod instance**: `shared/` owns the only Zod install. CI enforces exactly one `node_modules/zod` across the repo. Never add Zod as a direct dependency in `client/` or `server/`.
- **Credential isolation**: All Copilot secrets live in `server/.env` only. CI scans for `COPILOT_*` in `client/` and fails if found.
- **`CopilotStudioClient` is a singleton** in `server/src/copilot.ts` — it retains conversation state internally; do not re-instantiate per request.
- **Card action allowlisting** (`server/src/allowlist/cardActionAllowlist.ts`): validates action type and URL domain before forwarding to Copilot.
- **Activity normalization** (`server/src/normalizer/activityNormalizer.ts`): converts raw Copilot SDK `Activity` objects to `NormalizedMessage` (typed as `text` or `adaptiveCard`).

### Client state machine (`client/src/hooks/useChatApi.ts`)
Manages: optimistic user messages, 300ms skeleton delay (avoids flicker on fast responses), 3-attempt retry with exponential backoff on 5xx/network errors, abort signals for cleanup.

### `NormalizedMessage` schema (from `shared/`)
```typescript
{
  id: string        // UUID
  role: 'user' | 'assistant'
  kind: 'text' | 'adaptiveCard'
  text?: string
  cardJson?: Record<string, unknown>
  cardId?: string   // Server-assigned, used for card-action routing
}
```

## CI checks (`.github/workflows/ci.yml`)
Two parallel jobs on push/PR to `main`:
1. `lint-test`: `npm ci` → `npm run lint` → `npm test`
2. `security-checks`: credential leak scan (`COPILOT_*` in client/) + Zod instance count (must be exactly 1)

## TypeScript config
Root `tsconfig.base.json`: ES2022, NodeNext modules, strict. Client overrides to ES2020 + JSX (no emit; Vite handles compilation). `shared/` uses `composite: true` for project references.

## ESLint
Flat config (`eslint.config.mjs`, ESLint v9). Separate rule sets for Node (server/shared) vs. browser (client). Prettier integrated via `eslint-config-prettier`.
