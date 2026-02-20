# Phase 1: Scaffold + Schema + Server Foundation - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Monorepo scaffold compiles cleanly, shared Zod schemas are published and importable, Express server runs with fail-closed auth middleware, and `POST /api/chat/start` returns a conversationId. Text chat, Adaptive Cards, and UI are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Auth stub behavior
- When `AUTH_REQUIRED=true` (the default when env var is unset), requests with no Authorization header receive an immediate `401 { error: 'Unauthorized' }` JSON response
- Dev bypass: set `AUTH_REQUIRED=false` in `.env` to disable auth entirely for local development
- `AUTH_REQUIRED` defaults to `true` when the env var is absent (fail-closed, never accidentally open)
- Log verbosity on auth failure: Claude's discretion — but must include a visible TODO comment pointing to where real MSAL validation plugs in

### Workspace import style
- Claude's discretion on all aspects: package reference style (@copilot-chat/shared vs path aliases), cross-workspace enforcement, what shared/ exports, and whether shared/ is built or consumed as raw TypeScript — pick whatever is cleanest for a Node 20 + Vite 6 monorepo at quick depth

### Env var handling
- Server validates all required env vars in `server/src/config.ts` at startup — before any routes register
- On missing required vars: Claude's discretion on fail-fast vs warn behavior, but `config.ts` is the single source of truth
- `.env.example` files must include inline comments on every variable explaining what it is and where to find it (e.g. `# Your Azure tenant ID — from Azure Portal > App Registrations`)
- Client validates `VITE_*` env vars at build/runtime (fail if VITE_API_URL is missing, for example)

### Conversation state shape
- Each stored conversation holds: server-generated UUID (the external conversationId), the Copilot SDK's internal conversation reference, and the full history of `NormalizedMessage[]`
- Store is behind a `ConversationStore` interface (`get`, `set`, `delete`) with an `InMemoryConversationStore` implementation — production swap (Redis, etc.) is a drop-in
- Eviction policy: LRU — cap at a reasonable number of active conversations (Claude decides the cap, e.g. 100)
- External conversationId is a server-generated UUID; internal SDK conversation ID is stored internally and never exposed to the client API

### Claude's Discretion
- Auth stub log verbosity (beyond the required TODO comment)
- All workspace import style details (package ref style, enforcement mechanism, shared/ build vs raw TS)
- Server startup behavior when required env vars are missing (fail-fast crash vs warn-and-degrade)
- LRU eviction cap size

</decisions>

<specifics>
## Specific Ideas

- No specific UI/UX references for this phase (pure infrastructure)
- The `ConversationStore` interface pattern is explicitly requested — even though this is a quick-depth project, the abstraction is worth it for production replaceability

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-scaffold-schema-server-foundation*
*Context gathered: 2026-02-19*
