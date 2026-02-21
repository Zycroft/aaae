# Agentic Copilot Chat App

A production-ready monorepo delivering a responsive chat experience powered by Microsoft Copilot Studio and Adaptive Cards.

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### Steps

1. **Clone and install**

   ```bash
   git clone <repo-url>
   cd <repo-name>
   npm ci
   ```

2. **Configure environment**

   Copy the example env files for both workspaces:

   ```bash
   cp client/.env.example client/.env
   cp server/.env.example server/.env
   ```

   Then fill in values using the reference table below.

   | Variable | Workspace | Description | Example |
   |----------|-----------|-------------|---------|
   | `VITE_API_URL` | client | Express server URL (no trailing slash) | `http://localhost:3001` |
   | `COPILOT_TENANT_ID` | server | Azure AD tenant ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
   | `COPILOT_APP_ID` | server | Azure app registration client ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
   | `COPILOT_CLIENT_SECRET` | server | Azure app registration client secret | `your-client-secret` |
   | `COPILOT_ENVIRONMENT_ID` | server | Power Platform environment ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
   | `COPILOT_AGENT_SCHEMA_NAME` | server | Copilot Studio agent schema name | `your-agent-schema-name` |
   | `AUTH_REQUIRED` | server | Fail-closed auth stub; set `false` to disable (dev only) | `true` |
   | `COPILOT_STUB_TOKEN` | server | Stub bearer token for local dev when AUTH_REQUIRED=false | _(blank in prod)_ |
   | `PORT` | server | Express listen port | `3001` |
   | `CORS_ORIGIN` | server | Exact client origin for CORS (no trailing slash) | `http://localhost:5173` |

3. **Run in development**

   ```bash
   npm run dev
   ```

   Opens client at http://localhost:5173, server at http://localhost:3001.

4. **Run tests**

   ```bash
   npm test
   ```

   Runs Vitest across `server/` and `shared/`.

5. **Lint**

   ```bash
   npm run lint
   ```

   Checks all workspaces with ESLint.

---

## Project Structure

```
.
├── client/              # React 18 + Vite chat UI
├── server/              # Express.js Copilot Studio proxy
├── shared/              # Zod schemas and TypeScript types (single source of truth)
├── .github/workflows/   # GitHub Actions CI
├── docs/                # Documentation and Adaptive Card assets
│   ├── adaptive-card-playbook.md
│   └── cards/           # Sample Adaptive Card JSON files
└── README.md
```

---

## Workspaces

**client/**: React + TypeScript chat interface. Vite dev server. Renders messages and
Adaptive Cards. Connects to `server/` via the `VITE_API_URL` environment variable.

**server/**: Express.js proxy for Copilot Studio. All secrets (tenant ID, app ID,
client secret) live here only. Never directly accessible from the browser. Validates
card actions against an allowlist before forwarding to Copilot Studio.

**shared/**: Zod schemas used by both client and server. Generates TypeScript types.
Zod is installed here only — a single Zod instance is enforced to avoid schema
mismatch issues. CI validates instance count on every push.

---

## Adaptive Cards

See `docs/adaptive-card-playbook.md` for step-by-step instructions on registering a
new card ID, writing card JSON, and wiring it through the server allowlist.

Sample Adaptive Card JSON files live in `docs/cards/`. Use `docs/cards/feedback-survey.json`
as a worked example.

---

## Security

- All Copilot Studio calls are server-side only; no credentials in client code
- Card actions validated against a server-side allowlist before forwarding
- CI enforces no `COPILOT_*` credential assignments in client source on every push

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) lints, tests, and runs security checks on
every push and PR to `main`. Two parallel jobs run: `lint-test` (npm ci → lint → test)
and `security-checks` (credential leak scan + Zod instance count validation).

---

## License

Proprietary.
