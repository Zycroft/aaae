# Roadmap: Agentic Copilot Chat App

## Milestones

- ✅ **v1.0 MVP** — Phases 1–3 (shipped 2026-02-20)
- 📋 **v1.1 Polish** — Phase 4 (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–3) — SHIPPED 2026-02-20</summary>

- [x] Phase 1: Scaffold + Schema + Server Foundation (4/4 plans) — completed 2026-02-20
- [x] Phase 2: Text Chat End-to-End (4/4 plans) — completed 2026-02-20
- [x] Phase 3: Adaptive Cards + Accessibility + Theming (5/5 plans) — completed 2026-02-20

Full phase details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 📋 v1.1 Polish (Planned)

### Phase 4: Polish, Metadata Drawer, CI, and Docs

**Goal:** The timeline sidebar and activity log download are functional; GitHub Actions runs lint and tests with credential-leak and Zod-instance checks; README and Adaptive Cards playbook give a new developer everything needed to run and extend the app

**Requirements:** UI-11, UI-12, INFRA-07, DOCS-01, DOCS-02, DOCS-03

**Plans:** 3 plans

Plans:
- [x] 04-01-PLAN.md — MetadataPane component: timeline sidebar (UI-11) and activity log download button (UI-12)
- [x] 04-02-PLAN.md — GitHub Actions CI workflow: lint, test, credential-leak check, Zod-instance check (INFRA-07)
- [x] 04-03-PLAN.md — README.md, adaptive-card-playbook.md, and sample card JSON (DOCS-01, DOCS-02, DOCS-03)

**Success Criteria:**
1. On desktop, the metadata drawer sidebar lists all completed card actions in chronological order; clicking the activity log download button produces a valid JSON file containing the full conversation history
2. Pushing to the repo triggers a GitHub Actions workflow that lints and tests both workspaces; the workflow fails if `grep -r "COPILOT" client/` returns any matches or `npm ls zod` shows more than one Zod instance
3. A developer with no prior project knowledge can follow README.md to configure `.env` files, run `npm run dev`, and have a working local instance
4. A card author can follow `docs/adaptive-card-playbook.md` to register a new card ID, write the card JSON, and wire it through the system without reading source code

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Scaffold + Schema + Server Foundation | v1.0 | 4/4 | Complete | 2026-02-20 |
| 2. Text Chat End-to-End | v1.0 | 4/4 | Complete | 2026-02-20 |
| 3. Adaptive Cards + Accessibility + Theming | v1.0 | 5/5 | Complete | 2026-02-20 |
| 4. Polish, Metadata Drawer, CI, and Docs | v1.1 | 3/3 | Complete | 2026-02-20 |
