# Roadmap: Agentic Copilot Chat App

## Milestones

- ✅ **v1.0 MVP** — Phases 1–3 (shipped 2026-02-20)
- ✅ **v1.1 Polish** — Phase 4 (shipped 2026-02-20)
- 🚧 **v1.2 Entra External ID Authentication (MSAL)** — Phases 5–7 (in progress)
- ⬜ **v1.3b Copilot Studio SDK Orchestrator Readiness** — Phases 8–10 (planned) — `v1.3b CoPilot SDK.md`

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–3) — SHIPPED 2026-02-20</summary>

- [x] Phase 1: Scaffold + Schema + Server Foundation (4/4 plans) — completed 2026-02-20
- [x] Phase 2: Text Chat End-to-End (4/4 plans) — completed 2026-02-20
- [x] Phase 3: Adaptive Cards + Accessibility + Theming (5/5 plans) — completed 2026-02-20

Full phase details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Polish (Phase 4) — SHIPPED 2026-02-20</summary>

- [x] Phase 4: Polish, Metadata Drawer, CI, and Docs (3/3 plans) — completed 2026-02-20

Full phase details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

### 🚧 v1.2 Entra External ID Authentication (Phases 5–7)

**Milestone Goal:** Replace v1 auth stubs with real MSAL-based authentication — Entra External ID on the client, JWT validation + org allowlist on the server.

- [x] **Phase 5: Shared Schema + Config Foundation** - UserClaims Zod schema and environment variable wiring for both workspaces (completed 2026-02-21)
- [x] **Phase 6: Server JWT Validation + Org Allowlist** - JWT middleware validates tokens via JWKS; org allowlist enforces tenant restrictions (completed 2026-02-21)
- [ ] **Phase 7: Client MSAL Authentication** - MSAL React sign-in/sign-out gate with silent token refresh and Bearer header injection

## Phase Details

### Phase 5: Shared Schema + Config Foundation
**Goal**: The shared UserClaims type and all auth environment variables exist and are wired — both workspaces can reference auth config without any code being deployed yet
**Depends on**: Phase 4
**Requirements**: SCHEMA-01, SCHEMA-02, CFG-01, CFG-02, CFG-03, CFG-04, CFG-05
**Success Criteria** (what must be TRUE):
  1. `shared/src/schemas/auth.ts` exports a `UserClaims` Zod schema with fields sub, tid, email (optional), name (optional), oid — and the TypeScript type is exported alongside it
  2. `server/.env.example` contains `AZURE_TENANT_NAME`, `AZURE_CLIENT_ID`, and `ALLOWED_TENANT_IDS` entries with placeholder values
  3. `client/.env.example` contains `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_NAME`, and `VITE_AZURE_REDIRECT_URI` entries with placeholder values
  4. When `AUTH_REQUIRED=true` and `AZURE_CLIENT_ID` is not set, the server refuses all requests (fails closed) at startup or on first request
  5. When `AUTH_REQUIRED=false`, the server starts and accepts requests without any Azure AD configuration present
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md — UserClaims Zod schema in shared workspace (TDD)
- [x] 05-02-PLAN.md — Azure AD env vars in .env.examples + server config fail-closed logic

### Phase 6: Server JWT Validation + Org Allowlist
**Goal**: The server validates real Entra External ID JWT tokens and blocks requests from disallowed tenants — authenticated requests reach the Copilot proxy; unauthenticated or disallowed requests are rejected with appropriate HTTP errors
**Depends on**: Phase 5
**Requirements**: SAUTH-01, SAUTH-02, SAUTH-03, SAUTH-04, SAUTH-05, SAUTH-06, ORG-01, ORG-02, ORG-03, ORG-04, TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. A request with a valid JWT (correct signature, audience, issuer, unexpired) reaches the Copilot proxy with `req.user` populated from the decoded claims
  2. A request with an expired, wrong-audience, wrong-issuer, or unsigned token receives a 401 response with a `WWW-Authenticate` header
  3. A request from a tenant not listed in `ALLOWED_TENANT_IDS` receives a 403 response; the denial is logged with tenant ID and timestamp
  4. Unit tests pass for JWT middleware: valid token accepted, expired token rejected, bad audience rejected, missing token rejected
  5. Unit tests pass for Org Allowlist middleware: allowed tenant passes, disallowed tenant blocked, missing `tid` claim blocked
**Plans**: 2 plans

Plans:
- [ ] 06-01-PLAN.md — JWT validation middleware using jose (TDD): authMiddleware, Express type augmentation, Vitest tests
- [ ] 06-02-PLAN.md — Org allowlist middleware + app.ts wiring (TDD): orgAllowlist, Vitest tests, wire after authMiddleware

### Phase 7: Client MSAL Authentication
**Goal**: Unauthenticated users see a sign-in page and cannot reach the chat UI; authenticated users interact with the chat identically to v1.1 with tokens acquired and refreshed silently in the background
**Depends on**: Phase 6
**Requirements**: CAUTH-01, CAUTH-02, CAUTH-03, CAUTH-04, CAUTH-05, CAUTH-06, CAUTH-07, TEST-03
**Success Criteria** (what must be TRUE):
  1. Opening the app without an active session shows a sign-in page (not the chat UI); clicking sign-in redirects to the Entra External ID login page
  2. After completing sign-in, the chat UI loads and functions identically to v1.1 — text chat, Adaptive Cards, metadata pane, theme toggle all work
  3. Every API call (start, send, card-action) includes an `Authorization: Bearer {token}` header automatically; no manual token handling is visible to the user
  4. A user who has been in a conversation for an extended period is not logged out mid-conversation — token refresh happens silently without any UI disruption
  5. Clicking sign-out clears the MSAL token cache and returns the browser to the sign-in page
**Plans**: 3 plans

Plans:
- [ ] 07-01-PLAN.md — MSAL install + msalConfig.ts + AuthProvider wrapper component
- [ ] 07-02-PLAN.md — AuthGuard + SignInPage + App/main.tsx wiring (auth gate)
- [ ] 07-03-PLAN.md — Bearer token injection in chatApi.ts + sign-out in ChatShell + CI verification

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Scaffold + Schema + Server Foundation | v1.0 | 4/4 | Complete | 2026-02-20 |
| 2. Text Chat End-to-End | v1.0 | 4/4 | Complete | 2026-02-20 |
| 3. Adaptive Cards + Accessibility + Theming | v1.0 | 5/5 | Complete | 2026-02-20 |
| 4. Polish, Metadata Drawer, CI, and Docs | v1.1 | 3/3 | Complete | 2026-02-20 |
| 5. Shared Schema + Config Foundation | v1.2 | 2/2 | Complete | 2026-02-21 |
| 6. Server JWT Validation + Org Allowlist | v1.2 | 2/2 | Complete | 2026-02-21 |
| 7. Client MSAL Authentication | v1.2 | 0/3 | Not started | - |
