---
phase: 23-llm-provider-interface-config
verified: 2026-02-24T19:35:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 23: LLM Provider Interface + Config Verification Report

**Phase Goal:** The server defines the provider contract and enforces conditional config validation — Copilot vars only required for Copilot, OpenAI vars only required for OpenAI.

**Verified:** 2026-02-24T19:35:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                        | Status     | Evidence                                                                                     |
| --- | -------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| 1   | Server starts cleanly with LLM_PROVIDER=copilot and existing Copilot env vars                | ✓ VERIFIED | config.ts lines 13-21: Copilot conditional check with required vars validation              |
| 2   | Server starts cleanly with LLM_PROVIDER=openai and OPENAI_API_KEY without Copilot vars       | ✓ VERIFIED | config.ts lines 24-30: OpenAI conditional check, Copilot vars not required when openai mode |
| 3   | Server exits with fatal error when LLM_PROVIDER=openai but OPENAI_API_KEY is missing         | ✓ VERIFIED | config.ts lines 25-28: process.exit(1) if OPENAI_API_KEY missing in openai mode             |
| 4   | Server exits with fatal error when LLM_PROVIDER=copilot but Copilot env vars are missing     | ✓ VERIFIED | config.ts lines 15-20: process.exit(1) for each missing Copilot required var                |
| 5   | LlmProvider interface file exists with startSession, sendMessage, sendCardAction signatures  | ✓ VERIFIED | LlmProvider.ts lines 11-18: Interface with all three method signatures returning Promise[]   |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                            | Expected                                    | Status        | Details                                                                          |
| ----------------------------------- | ------------------------------------------- | ------------- | -------------------------------------------------------------------------------- |
| `server/src/provider/LlmProvider.ts` | LlmProvider interface with three methods    | ✓ VERIFIED    | Exists, exports interface, imports NormalizedMessage from shared, no stubs       |
| `server/src/config.ts`              | Conditional provider-aware env validation   | ✓ VERIFIED    | Conditional branches for copilot/openai, exports LLM_PROVIDER/OPENAI_API_KEY    |
| `server/.env.example`               | Documents LLM_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL | ✓ VERIFIED | New section at top with all three vars documented with explanations              |

### Key Link Verification

| From                 | To                          | Via                      | Status        | Details                                                                                          |
| -------------------- | --------------------------- | ------------------------ | ------------- | ------------------------------------------------------------------------------------------------ |
| config.ts            | LLM_PROVIDER env var        | process.env.LLM_PROVIDER | ✓ WIRED       | Line 4: reads env var, line 6-11: validates it's copilot or openai                             |
| config.ts            | Conditional provider logic  | if/else branching        | ✓ WIRED       | Lines 13-30: separate validation paths for copilot vs openai with appropriate error messages   |
| LlmProvider.ts       | NormalizedMessage type      | import from @copilot-chat/shared | ✓ WIRED | Line 1: imports type from shared, used in method signatures lines 12-17                        |
| config object        | LLM_PROVIDER export         | as 'copilot' \| 'openai' | ✓ WIRED       | Line 43: exports validated LLM_PROVIDER as typed union, imported by app.ts and other modules  |
| config object        | OPENAI_API_KEY export       | process.env.OPENAI_API_KEY | ✓ WIRED      | Line 44: exports optional OPENAI_API_KEY for Phase 26 to use                                   |
| config object        | OPENAI_MODEL export         | process.env.OPENAI_MODEL ?? 'gpt-4o-mini' | ✓ WIRED | Line 45: exports OPENAI_MODEL with sensible default                                           |

### Requirements Coverage

| Requirement | Phase | Description | Status | Evidence |
| ----------- | ----- | ----------- | ------ | -------- |
| PROV-01 | 23 | Server defines `LlmProvider` interface with `startSession`, `sendMessage`, `sendCardAction` | ✓ SATISFIED | LlmProvider.ts exports interface with all three methods returning Promise<NormalizedMessage[]> |
| CONF-01 | 23 | `LLM_PROVIDER` env var selects backend (copilot default, openai alternative) | ✓ SATISFIED | config.ts lines 4-11: reads LLM_PROVIDER with copilot default, validates as copilot or openai |
| CONF-02 | 23 | `COPILOT_*` env vars required only when `LLM_PROVIDER=copilot` | ✓ SATISFIED | config.ts lines 13-21: COPILOT_* validation only runs when LLM_PROVIDER === 'copilot'        |
| CONF-03 | 23 | `OPENAI_API_KEY` required only when `LLM_PROVIDER=openai` | ✓ SATISFIED | config.ts lines 24-30: OPENAI_API_KEY validation only runs when LLM_PROVIDER === 'openai'    |

### Anti-Patterns Found

None. Files are clean, no TODOs, FIXMEs, placeholders, or stub implementations.

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | — | — | — |

### Testing Results

All tests pass — 173 total (147 server + 26 client):
- Client: 4 test suites, 26 tests ✓
- Server: 13 test suites, 147 tests ✓

Changes to config.ts are backward-compatible with all existing server tests. No test modifications needed.

### TypeScript Compilation

✓ Clean compilation: `cd server && npx tsc --noEmit` returns no errors or warnings

### ESLint

✓ Clean linting for phase 23 files: no errors in LlmProvider.ts or config.ts

### Wiring Verification Details

**config.ts exports:**
- Line 43: `LLM_PROVIDER: LLM_PROVIDER as 'copilot' | 'openai'` — imported by app.ts, copilot.ts, and other modules
- Line 44: `OPENAI_API_KEY: process.env.OPENAI_API_KEY` — ready for Phase 26 OpenAiProvider
- Line 45: `OPENAI_MODEL: process.env.OPENAI_MODEL ?? 'gpt-4o-mini'` — ready for Phase 26 OpenAiProvider

**config.ts conditional logic:**
- Line 4: Reads LLM_PROVIDER from environment with copilot as default
- Lines 6-11: Validates LLM_PROVIDER is either 'copilot' or 'openai', exits with FATAL if invalid
- Lines 13-21: Conditional block for copilot — requires COPILOT_ENVIRONMENT_ID and COPILOT_AGENT_SCHEMA_NAME
- Lines 24-30: Conditional block for openai — requires OPENAI_API_KEY
- Lines 32-39: Auth validation unchanged (still required when AUTH_REQUIRED !== 'false')

**LlmProvider.ts:**
- Line 1: Imports NormalizedMessage type from @copilot-chat/shared
- Lines 11-18: Exports interface with three async methods, all returning Promise<NormalizedMessage[]>
- Clean interface definition — no implementation, ready for Phase 24 (CopilotProvider) and Phase 26 (OpenAiProvider)

**Backward Compatibility:**
- LLM_PROVIDER defaults to 'copilot' — existing deployments without this env var continue to work unchanged
- COPILOT_ENVIRONMENT_ID and COPILOT_AGENT_SCHEMA_NAME use `?? ''` fallback since they're only validated when LLM_PROVIDER=copilot
- All existing Copilot validation paths remain intact
- Auth validation unchanged

## Summary

**Status: PASSED**

All 5 must-have truths verified. All artifacts exist and are properly substantive (not stubs). All key links are wired correctly. Requirements PROV-01, CONF-01, CONF-02, CONF-03 fully satisfied.

Phase 23 establishes the LlmProvider interface contract and implements provider-conditional config validation. The server can now be configured for either Copilot Studio (default) or OpenAI (new) with appropriate environment variables validated per provider.

Implementation is clean, backward-compatible, and ready for Phase 24 (CopilotProvider extraction) and Phase 26 (OpenAI Provider implementation).

---

_Verified: 2026-02-24T19:35:00Z_
_Verifier: Claude (gsd-verifier)_
