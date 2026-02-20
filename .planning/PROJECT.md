# Agentic Copilot Chat App

## What This Is

A production-ready monorepo (React + Node) that delivers a responsive chat experience powered by Microsoft Copilot Studio (Microsoft 365 Agents SDK) and Adaptive Cards. Users can have free-form text conversations and submit structured Adaptive Card forms, with all Copilot Studio calls proxied through the Node server so secrets never reach the browser.

## Core Value

Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Responsive chat UI (360px → 1280px) with split-pane transcript + metadata drawer
- [ ] Adaptive Cards rendered client-side with submit/action handling
- [ ] Node server proxies all Copilot Studio SDK calls (secrets never in browser)
- [ ] Normalized message schema shared across client/server via Zod
- [ ] `/api/chat/start` → returns conversationId
- [ ] `/api/chat/send` → accepts text, returns normalized messages
- [ ] `/api/chat/card-action` → accepts card submission, validates allowlist, forwards to Copilot
- [ ] MSAL On-Behalf-Of token flow placeholder stubs (TODO comments)
- [ ] Adaptive Card action allowlist enforcement + Action.OpenUrl domain allowlist
- [ ] Loading skeletons, optimistic user bubbles, error toasts in chat transcript
- [ ] Submitted cards disabled with pending state after action
- [ ] Timeline sidebar (desktop) summarizing completed card actions
- [ ] Activity log download (JSON) for auditing hybrid turns
- [ ] Dark/light theme toggle with reduced-motion respect
- [ ] Unit tests for response normalizer and validators
- [ ] GitHub Actions CI (lint + test both packages)
- [ ] README covering environment setup, MSAL secrets, dev/test commands
- [ ] `.env.example` for client and server workspaces
- [ ] Adaptive Cards playbook doc with card registration pattern

### Out of Scope

- Real MSAL/OBO token implementation — placeholder stubs only for v1
- Deployment infrastructure (Azure Functions, APIM) — documented but not wired
- OAuth/SSO for end users — CIAM bearer token assumed to be provided externally

## Context

- Microsoft 365 Agents SDK (`@microsoft/agents-copilotstudio-client`) used server-side only
- Adaptive Cards JS SDK (`adaptivecards` + `adaptivecards-react`) used client-side
- Monorepo layout: `client/` (Vite + React 18), `server/` (Express + Node 20+), `shared/` (Zod schemas)
- All API endpoints live under `/api/chat` and expect a CIAM bearer token
- Card actions validated against an allowlist before forwarding to Copilot

## Constraints

- **Tech Stack**: React 18 + Vite, Node 20+, Express, TypeScript throughout — no switching to Next.js SSR
- **Security**: Copilot Studio client must never be invoked from the browser; all calls server-side
- **Compatibility**: Adaptive Cards version 1.5; must support mobile (360px) through widescreen (1280px+)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------| --------|
| Monorepo with npm workspaces | Shared types between client/server without a separate publish step | — Pending |
| Zod for shared schema validation | Runtime validation + TypeScript types from one source | — Pending |
| Express over Fastify | Wider ecosystem familiarity; simpler middleware for auth stubs | — Pending |
| Card action allowlist enforcement | Security — prevent arbitrary actions from Adaptive Card payloads | — Pending |

---
*Last updated: 2026-02-19 after initialization*
