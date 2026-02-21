# Milestones

## v1.0 MVP (Shipped: 2026-02-20)

**Phases completed:** 3 phases (1–3), 13 plans
**Timeline:** 2026-02-19 → 2026-02-20 (1 day)
**Git range:** 3fde7ea → 190b712
**Files changed:** 91 files, 20,063 insertions
**Lines of code:** ~2,341 TypeScript/JS

**Key accomplishments:**
1. Monorepo wired with npm workspaces — single Zod instance as shared type source across client, server, and shared packages
2. Secure Express server with fail-closed MSAL auth stub; all Copilot Studio SDK calls proxied server-side (secrets never in browser)
3. Full text chat proxy chain — activity normalizer (Activity[] → NormalizedMessage[]), optimistic user bubbles, 300ms skeleton delay, 3-attempt retry, error toasts
4. Interactive Adaptive Cards rendered via custom adaptivecards v3 React wrapper — submit fires `/api/chat/card-action`, card immediately disabled with pending state
5. WCAG 2.2 AA accessibility — ARIA live region (role='log'), keyboard navigation throughout, visible focus rings, prefers-reduced-motion support
6. Dark/light theme with CSS custom properties + fluid typography (clamp) + responsive split-pane layout from 360px through 1280px

**Requirements:** 37/37 Phase 1–3 requirements complete; 6 Phase 4 requirements deferred (INFRA-07, UI-11, UI-12, DOCS-01, DOCS-02, DOCS-03)

### Known Gaps

Proceeding with known documentation gaps (functional code is complete, all E2E flows pass):

- Phase 1 (01-scaffold-schema-server-foundation): Missing VERIFICATION.md. Phase outputs proven functional through Phase 2 VERIFICATION.md (normalizer runs, schemas validate, server starts, TypeScript clean). 15 requirements marked partial due to absent formal verification artifact.
- Phase 3 (03-adaptive-cards-accessibility-theming): Missing VERIFICATION.md. UAT.md present with 8/8 tests passing, covering all 5 success criteria. 14 requirements marked partial due to absent formal VERIFICATION.md.

---


## v1.1 Polish (Shipped: 2026-02-20)

**Phases completed:** Phase 4 (1 phase, 3 plans, 5 tasks)
**Timeline:** 2026-02-20 (1 day)
**Requirements:** UI-11, UI-12, INFRA-07, DOCS-01, DOCS-02, DOCS-03 (6/6 complete)

**Key accomplishments:**
1. MetadataPane React component — activity timeline sidebar filtering adaptiveCard messages into numbered `<ol>`, plus dated JSON download button with memory-safe `URL.revokeObjectURL`
2. GitHub Actions CI — two parallel jobs: `lint-test` (npm ci → lint → test) and `security-checks` (COPILOT credential leak grep + single Zod instance validation via `--depth=Infinity`)
3. README.md (133 lines) — numbered quick start, complete 10-variable env table covering both workspaces, project structure, security notes
4. docs/adaptive-card-playbook.md (207 lines) — 4-step card registration guide (choose ID → create JSON → register allowlist → write test), enabling card authors to add cards without reading source
5. docs/cards/feedback-survey.json — working Adaptive Card v1.5 sample with `Input.ChoiceSet` and `Action.Submit` with `cardId` in data payload

---


## v1.2 Entra External ID Authentication (Shipped: 2026-02-21)

**Phases completed:** 3 phases (5–7), 7 plans
**Timeline:** 2026-02-20 → 2026-02-21
**Git range:** 30c5918 → c14184e
**Files changed:** 50 files, 4,886 insertions, 97 deletions
**Requirements:** 24/24 complete

**Key accomplishments:**
1. UserClaims Zod schema in shared/ with sub/tid/oid (required) and email/name (optional) — single source of truth for decoded JWT claims across workspaces
2. Fail-closed AZURE_CLIENT_ID guard — server exits at startup if AUTH_REQUIRED=true but credentials are missing; AUTH_REQUIRED=false bypass preserved for local dev
3. JWT validation middleware using jose with JWKS caching — typed error handling for expired, wrong-audience, wrong-issuer, and unsigned tokens (401 + WWW-Authenticate)
4. Synchronous org allowlist middleware — checks tenant ID against ALLOWED_TENANT_IDS with fail-closed behavior (empty allowlist denies all), 403 on disallowed tenants
5. MSAL React sign-in gate with AuthGuard 3-phase state machine (skeleton → sign-in → chat), sessionStorage token cache, pinned to @azure/msal-react v3.x for React 18 compatibility
6. Bearer token injection on all chat API endpoints with silent token acquisition (acquireTokenSilent + loginRedirect fallback) and sign-out button clearing MSAL cache

---

