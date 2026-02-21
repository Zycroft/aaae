# Roadmap: Agentic Copilot Chat App

## Overview

Four phases deliver a production-ready React + Node monorepo that proxies Microsoft Copilot Studio through a secure Express server and renders both plain text and interactive Adaptive Cards in a polished chat UI. The dependency chain is strict: shared Zod schemas and the server foundation must exist before any API route is tested, the text chat loop must be validated before Adaptive Cards complexity is introduced, and accessibility/theming applies systematically across the complete component tree before final polish and CI complete the build.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Scaffold + Schema + Server Foundation** - Monorepo wired, shared Zod schemas published, Express server with fail-closed auth stub and `/api/chat/start` returning a conversationId
- [x] **Phase 2: Text Chat End-to-End** - Full proxy chain working for plain-text conversations: client sends a message, server calls Copilot, normalizer converts activities, transcript renders user/bot bubbles with optimistic updates and error handling
- [ ] **Phase 3: Adaptive Cards + Accessibility + Theming** - Adaptive Cards rendered inline and interactive; card actions validated and proxied; full WCAG 2.2 AA accessibility; dark/light theme; responsive layout 360px to 1280px
- [ ] **Phase 4: Polish, Metadata Drawer, CI, and Docs** - Timeline sidebar, activity log download, GitHub Actions CI with security checks, README, and Adaptive Cards playbook

## Phase Details

### Phase 1: Scaffold + Schema + Server Foundation
**Goal**: The monorepo compiles, shared types are the single source of truth for both client and server, and the Express server is running with a fail-closed auth stub and a working `/api/chat/start` endpoint
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, SERV-01, SERV-02, SERV-05, SERV-09, SERV-10
**Success Criteria** (what must be TRUE):
  1. Running `npm run dev` from the repo root starts both the Vite client dev server and the Express server without errors
  2. Running `npm test` executes test suites in both `client/` and `server/` workspaces and exits cleanly
  3. `npm ls zod` returns exactly one instance of Zod (no duplicate hoisting across workspaces)
  4. `POST /api/chat/start` returns a `{ conversationId }` JSON response; without a valid `Authorization` header the server returns 401 (not a 200)
  5. `grep -r "COPILOT" client/` returns no matches (no secrets in browser code)
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold: root config, TypeScript, ESLint/Prettier, workspace package.json files, .env.example files
- [x] 01-02-PLAN.md — Shared schemas (TDD): NormalizedMessage + API endpoint Zod schemas, types exported from shared/
- [x] 01-03-PLAN.md — Express server foundation: config validation, fail-closed auth middleware, CORS, ConversationStore + LRU impl
- [x] 01-04-PLAN.md — POST /api/chat/start: CopilotStudioClient singleton + route returning { conversationId }

### Phase 2: Text Chat End-to-End
**Goal**: A user can open the app, start a conversation, type a message, and see a real Copilot Studio response rendered as a text bubble — with optimistic updates, loading state, and error handling working throughout
**Depends on**: Phase 1
**Requirements**: SERV-03, SERV-06, SERV-11, UI-02, UI-03, UI-04, UI-05, UI-09
**Success Criteria** (what must be TRUE):
  1. Typing a message and pressing Send immediately shows the user's bubble in the transcript (before the server responds)
  2. A loading skeleton is visible in the transcript while the server is processing the Copilot request
  3. The bot's text response appears as an assistant bubble with correct role styling after the server responds
  4. When the server returns a 5xx error or network timeout, an error toast appears with an actionable message and the failed request is retried automatically
  5. Unit tests for the response normalizer pass for text-only, card-only, and hybrid turn inputs
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — Activity normalizer (TDD): normalizeActivities() pure function + Vitest tests covering text, card, hybrid turns
- [x] 02-02-PLAN.md — POST /api/chat/send route: validate body, call sendActivityStreaming, normalize, return NormalizedMessage[]
- [x] 02-03-PLAN.md — useChatApi hook + chatApi fetch layer: useReducer state, optimistic updates, 300ms skeleton delay, 3-attempt retry
- [x] 02-04-PLAN.md — React chat UI: ChatShell, TranscriptView, MessageBubble, SkeletonBubble, ChatInput, App.tsx updated

### Phase 3: Adaptive Cards + Accessibility + Theming
**Goal**: Adaptive Cards render inline in the transcript and submit card actions through the validated server proxy; the full UI meets WCAG 2.2 Level AA; dark/light theme and responsive layout work from 360px through 1280px
**Depends on**: Phase 2
**Requirements**: SERV-04, SERV-07, SERV-08, SERV-12, UI-01, UI-06, UI-07, UI-08, UI-10, UI-13, UI-14, UI-15, UI-16, UI-17
**Success Criteria** (what must be TRUE):
  1. An Adaptive Card appears inline in the chat transcript, all interactive elements (buttons, inputs) are functional, and clicking Submit fires exactly one network request to `/api/chat/card-action` — the card is immediately disabled and shows a pending state after the first click
  2. A crafted POST to `/api/chat/card-action` with an action type not on the server allowlist returns 403 without forwarding anything to Copilot Studio
  3. The layout is usable and unbroken at viewport widths of 360px, 768px, and 1280px — split-pane on desktop, single-column on mobile
  4. Toggling dark/light mode switches the theme and the preference persists across page reloads; `prefers-reduced-motion` disables all transitions when set
  5. All interactive elements are reachable and operable via keyboard alone; screen reader announces new messages via the ARIA live region on the transcript
**Plans**: 5 plans

Plans:
- [ ] 03-01-PLAN.md — POST /api/chat/card-action route + allowlist validator TDD (SERV-04, SERV-07, SERV-08, SERV-12)
- [ ] 03-02-PLAN.md — CSS design tokens, dark/light theme, fluid typography, reduced-motion (UI-13, UI-14, UI-15)
- [ ] 03-03-PLAN.md — Responsive split-pane layout: single-column mobile, split-pane desktop ≥768px (UI-01)
- [ ] 03-04-PLAN.md — AdaptiveCardMessage component, cardAction hook, MessageBubble wired (UI-06, UI-07, UI-08, UI-10)
- [ ] 03-05-PLAN.md — Accessibility hardening: ARIA live region, focus rings, keyboard navigation (UI-16, UI-17)

### Phase 4: Polish, Metadata Drawer, CI, and Docs
**Goal**: The timeline sidebar and activity log download are functional; GitHub Actions runs lint and tests with credential-leak and Zod-instance checks; README and Adaptive Cards playbook give a new developer everything needed to run and extend the app
**Depends on**: Phase 3
**Requirements**: UI-11, UI-12, INFRA-07, DOCS-01, DOCS-02, DOCS-03
**Success Criteria** (what must be TRUE):
  1. On desktop, the metadata drawer sidebar lists all completed card actions in chronological order; clicking the activity log download button produces a valid JSON file containing the full conversation history
  2. Pushing to the repo triggers a GitHub Actions workflow that lints and tests both workspaces; the workflow fails if `grep -r "COPILOT" client/` returns any matches or `npm ls zod` shows more than one Zod instance
  3. A developer with no prior project knowledge can follow README.md to configure `.env` files, run `npm run dev`, and have a working local instance
  4. A card author can follow `docs/adaptive-card-playbook.md` to register a new card ID, write the card JSON, and wire it through the system without reading source code
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scaffold + Schema + Server Foundation | 4/4 | Complete | 2026-02-20 |
| 2. Text Chat End-to-End | 4/4 | Complete | 2026-02-20 |
| 3. Adaptive Cards + Accessibility + Theming | 0/5 | Planned | - |
| 4. Polish, Metadata Drawer, CI, and Docs | 0/TBD | Not started | - |
