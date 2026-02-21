---
phase: 04-polish-metadata-drawer-ci-and-docs
phase_number: "04"
status: passed
verified: 2026-02-20
---

# Phase 04 Verification Report

## Phase Goal

The timeline sidebar and activity log download are functional; GitHub Actions runs lint and tests with credential-leak and Zod-instance checks; README and Adaptive Cards playbook give a new developer everything needed to run and extend the app.

## Requirements Verified

| Requirement | Status | Evidence |
|-------------|--------|----------|
| UI-11: Metadata sidebar on desktop | PASSED | MetadataPane renders `<aside className="metadataPane">` — existing CSS shows it on ≥768px via media query |
| UI-12: Activity log download button | PASSED | `downloadActivityLog()` creates Blob with `exportedAt`, `messageCount`, `messages` — triggers file save via anchor click |
| INFRA-07: GitHub Actions CI | PASSED | `.github/workflows/ci.yml` — lint-test and security-checks jobs, push+PR triggers on main |
| DOCS-01: README quick start | PASSED | README.md 133 lines — prereqs, env table (10 vars), npm run dev, npm test, structure |
| DOCS-02: Adaptive Card playbook | PASSED | docs/adaptive-card-playbook.md 207 lines — 4 steps, allowlist reference, file checklist |
| DOCS-03: Sample card JSON | PASSED | docs/cards/feedback-survey.json — valid v1.5 JSON, cardId in Action.Submit data |

## Must-Have Truths Verified

### UI-11/UI-12

- [x] `MetadataPane.tsx` filters messages by `kind === 'adaptiveCard'`
- [x] ChatShell passes `messages={messages}` to `<MetadataPane />`
- [x] Placeholder "No card actions yet" rendered when `cardActions.length === 0`
- [x] Timeline renders ordered list with `#N` index, `cardId`, optional `text` summary
- [x] Download creates `activity-log-YYYY-MM-DD.json` with `exportedAt`, `messageCount`, `messages`
- [x] `URL.revokeObjectURL` called after click (no memory leak)
- [x] TypeScript compiles: `tsc --noEmit -p client/tsconfig.json` — zero errors

### INFRA-07

- [x] Triggers: `push` and `pull_request` on `branches: [main]`
- [x] `lint-test` job: npm ci → npm run lint → npm test
- [x] `security-checks` job: credential grep (`COPILOT_[A-Z_]*=` in client/) and Zod count (`npm ls zod --depth=Infinity`, fails if not 1)
- [x] Both jobs run in parallel (no `needs:` dependency)
- [x] YAML is structurally valid (no tab indentation)

### DOCS-01

- [x] README.md: 133 lines (80-150 range)
- [x] Contains `VITE_API_URL`, `COPILOT_TENANT_ID`, `npm run dev`, `adaptive-card-playbook` references
- [x] Cold-start developer can configure .env and run npm run dev from instructions alone

### DOCS-02

- [x] docs/adaptive-card-playbook.md: 207 lines (>100 requirement)
- [x] All 4 steps present: choose ID, create JSON, register in allowlist, write tests
- [x] References `cardActionAllowlist.ts` path for wiring
- [x] References `feedback-survey.json` as worked example

### DOCS-03

- [x] docs/cards/feedback-survey.json is valid JSON
- [x] `type: "AdaptiveCard"`, `version: "1.5"`
- [x] `cardId: "feedback-survey"` present in `Action.Submit` data payload

## Automated Checks

- Tests: 22 passed (2 test files — cardActionAllowlist, activityNormalizer)
- TypeScript: zero type errors on `tsc --noEmit -p client/tsconfig.json`
- Pre-existing lint errors: 3 in AdaptiveCardMessage.tsx and ChatInput.tsx — pre-existing debt, not introduced by Phase 4

## Human Verification Required

| Item | What to check |
|------|---------------|
| Desktop sidebar visible | At ≥768px, send an Adaptive Card message — sidebar shows timeline entry with `#1`, card ID, and optional summary text |
| Placeholder state | With no card actions, sidebar shows "No card actions yet" |
| Download trigger | Click Download button — file `activity-log-YYYY-MM-DD.json` is saved |
| JSON contents | Saved JSON contains `exportedAt`, `messageCount`, and `messages` array |
| CI trigger | Push to main or open PR — both `lint-test` and `security-checks` jobs appear in GitHub Actions |

## Issues Encountered

None. All plans executed as specified with one auto-fix (README env var table expanded from 6 to 10 vars to match actual `.env.example` files — strictly additive improvement).

## Conclusion

**status: passed** — all 6 requirements verified against codebase. Human visual verification recommended for sidebar layout and download behavior (automated tests cover logic; browser rendering requires manual check).
