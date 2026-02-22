---
phase: 17-route-integration-compatibility
verified: 2026-02-22T21:50:00Z
status: passed
score: 10/10 must-haves verified
---

# Phase 17: Route Integration + Compatibility Verification Report

**Phase Goal:** All three chat routes (/start, /send, /card-action) delegate to the orchestrator and return workflowState in their responses, while existing chat behavior is fully preserved when no structured output is present

**Verified:** 2026-02-22T21:50:00Z
**Status:** PASSED
**All 10 must-haves verified.**

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | StartConversationResponseSchema has optional workflowState field | ✓ VERIFIED | shared/src/schemas/api.ts line 20: `workflowState: WorkflowStateSchema.optional()` |
| 2 | SendMessageResponseSchema has optional workflowState field | ✓ VERIFIED | shared/src/schemas/api.ts line 40: `workflowState: WorkflowStateSchema.optional()` |
| 3 | CardActionResponseSchema has optional workflowState field | ✓ VERIFIED | shared/src/schemas/api.ts line 63: `workflowState: WorkflowStateSchema.optional()` |
| 4 | v1.4 clients parsing { conversationId, messages } continue to work | ✓ VERIFIED | All three response schemas include optional workflowState; Zod schema validation accepts responses without the field |
| 5 | TypeScript types include workflowState?: WorkflowState | ✓ VERIFIED | shared/dist/schemas/api.d.ts shows `workflowState?:` for all three response types (z.infer auto-generated) |
| 6 | POST /api/chat/start delegates to orchestrator.startSession() | ✓ VERIFIED | server/src/routes/chat.ts lines 26-30: calls `orchestrator.startSession()` with conversationId, userId, tenantId |
| 7 | POST /api/chat/send delegates to orchestrator.processTurn() | ✓ VERIFIED | server/src/routes/chat.ts lines 62-67: calls `orchestrator.processTurn()` with conversationId, text, userId, tenantId |
| 8 | POST /api/chat/card-action validates allowlist BEFORE orchestrator | ✓ VERIFIED | server/src/routes/chat.ts lines 104-109: `validateCardAction()` called first, returns 403 on violation before reaching orchestrator |
| 9 | Plain text Copilot response returns identical messages with optional workflowState | ✓ VERIFIED | WorkflowOrchestrator.integration.test.ts: passthrough mode test confirms plain text produces kind='passthrough', workflowState.collectedData remains empty, messages contain plain text |
| 10 | Multi-turn integration test demonstrates collectedData accumulation across 3+ turns | ✓ VERIFIED | WorkflowOrchestrator.integration.test.ts lines 143-229: 3-turn test shows collectedData grows each turn and prior data appears in successive Copilot query preambles |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `shared/src/schemas/api.ts` | Extended response schemas with optional workflowState | ✓ VERIFIED | All three schemas updated; OrchestrateResponseSchema intentionally unchanged (has required workflowState from Phase 16) |
| `server/src/routes/chat.ts` | Orchestrator-delegating chat routes | ✓ VERIFIED | All three routes delegate to orchestrator; no direct copilotClient calls remain; buildContextPrefix removed |
| `server/src/orchestrator/index.ts` | Orchestrator singleton exported | ✓ VERIFIED | WorkflowOrchestrator instantiated with store, lock, and copilotClient; exported for route consumption |
| `server/src/orchestrator/WorkflowOrchestrator.integration.test.ts` | Multi-turn integration test with data accumulation | ✓ VERIFIED | 5 integration tests cover 3-turn data accumulation, passthrough mode, parse_error handling, all-three-kinds coverage |

### Key Links Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `shared/src/schemas/api.ts` → `shared/src/schemas/workflowState.ts` | `import WorkflowStateSchema` | Pattern: `WorkflowStateSchema.optional()` | ✓ WIRED | Import present, .optional() applied to all three chat response schemas |
| `server/src/routes/chat.ts` → `server/src/orchestrator/index.ts` | `import { orchestrator } from '../orchestrator/index.js'` | Pattern: `orchestrator.(startSession\|processTurn\|processCardAction)` | ✓ WIRED | All three orchestrator methods called; no direct Copilot calls remain |
| `server/src/routes/chat.ts` → `server/src/allowlist/cardActionAllowlist.ts` | `validateCardAction before orchestrator` | Pattern: `validateCardAction.*allowlistResult.*orchestrator` | ✓ WIRED | Allowlist validation returns 403 on failure before orchestrator is called |
| `server/src/orchestrator/WorkflowOrchestrator.integration.test.ts` → `server/src/orchestrator/WorkflowOrchestrator.ts` | `new WorkflowOrchestrator with mocked DI` | Pattern: instantiated with mocked store, lock, copilotClient | ✓ WIRED | Tests instantiate orchestrator with fully mocked dependencies; mock stores use real Maps for state persistence |
| `server/src/orchestrator/WorkflowOrchestrator.integration.test.ts` → context preamble assertion | `successive processTurn calls` | Pattern: `sendActivityStreaming.mock.calls[N][0].text contains '[CONTEXT]' and prior data` | ✓ WIRED | Tests capture and assert query preambles contain accumulated data from previous turns |

### Requirements Coverage

| Requirement | Plan | Description | Status | Evidence |
|-------------|------|-------------|--------|----------|
| ROUTE-01 | 17-02 | POST /api/chat/start delegates to orchestrator and returns workflowState | ✓ SATISFIED | server/src/routes/chat.ts lines 23-40: delegates to orchestrator.startSession(), returns { conversationId, workflowState } |
| ROUTE-02 | 17-02 | POST /api/chat/send delegates to orchestrator and returns workflowState | ✓ SATISFIED | server/src/routes/chat.ts lines 53-81: delegates to orchestrator.processTurn(), returns { conversationId, messages, workflowState } |
| ROUTE-03 | 17-02 | POST /api/chat/card-action validates allowlist then delegates to orchestrator and returns workflowState | ✓ SATISFIED | server/src/routes/chat.ts lines 95-133: validateCardAction() before orchestrator.processCardAction(), returns { conversationId, messages, workflowState } |
| ROUTE-04 | 17-01 | Shared API response schemas updated to include optional workflowState field | ✓ SATISFIED | shared/src/schemas/api.ts lines 20, 40, 63: all three response schemas have `workflowState: WorkflowStateSchema.optional()` |
| COMPAT-01 | 17-02 | When Copilot returns unstructured text (no parseable data), behavior is identical to v1.4 (passthrough mode) | ✓ SATISFIED | WorkflowOrchestrator.integration.test.ts lines 271-300: plain text response produces kind='passthrough', collectedData empty, messages contain text; route returns response with workflowState |
| COMPAT-02 | 17-02 | Existing card action allowlist validation runs before orchestrator processing | ✓ SATISFIED | server/src/routes/chat.ts lines 103-109: validateCardAction() called, 403 returned on failure, orchestrator not reached |
| COMPAT-03 | 17-02 | No regression in existing chat functionality (text chat, Adaptive Cards, authentication) | ✓ SATISFIED | 147 tests pass (5 new integration tests + 142 existing tests); TypeScript 0 errors; routes preserve auth, error handling, message normalization |
| TEST-01 | 17-03 | Unit tests for structured output parser covering JSON code blocks, text-only, hybrid, and malformed response formats | ✓ SATISFIED | server/src/parser/structuredOutputParser.test.ts has 15 test cases: passthrough (plain text, empty, user-only), structured (value, entities, text), parse_error (invalid action, malformed), non-throwing contract |
| TEST-02 | 17-03 | Unit tests for context builder verifying preamble format with various state shapes and max-length truncation | ✓ SATISFIED | server/src/workflow/contextBuilder.test.ts has 10 test cases: default preamble (step, data, turn), custom template, {dataJson} substitution, truncation with maxLength, data serialization, pure function contract |
| TEST-03 | 17-03 | Integration test for multi-turn workflow demonstrating data accumulation across turns | ✓ SATISFIED | WorkflowOrchestrator.integration.test.ts lines 143-229: 3-turn test with collectedData accumulation, turn 2 query preamble contains turn 1 data (name), turn 3 preamble contains turns 1+2 data (name+age) |

**All 10 requirements satisfied.**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | No blocker anti-patterns found; codebase is clean |

### Code Quality Checklist

| Check | Result | Details |
|-------|--------|---------|
| TypeScript compilation | ✓ 0 errors | `npx tsc -p server/tsconfig.json --noEmit` passes |
| Test suite | ✓ 147 passed | 5 new integration tests + 142 existing tests; no regressions |
| No direct Copilot calls in chat.ts | ✓ Verified | grep for `sendActivityStreaming\|startConversationStreaming\|copilotClient` returns only import, no calls |
| Orchestrator import present | ✓ Verified | `import { orchestrator } from '../orchestrator/index.js'` at line 9 |
| All three orchestrator methods called | ✓ Verified | startSession, processTurn, processCardAction all called in respective routes |
| Allowlist before orchestrator | ✓ Verified | validateCardAction() called before orchestrator.processCardAction() |
| Error handling preserved | ✓ Verified | All routes have isRedisError() checks returning 503 for Redis failures, 502 for other failures |
| Shared package rebuilt | ✓ Verified | shared/dist/schemas/api.d.ts updated with optional workflowState types |
| buildContextPrefix removed from chat.ts | ✓ Verified | No occurrence in chat.ts; properly inlined into orchestrate.ts |
| All response shapes include workflowState | ✓ Verified | All three routes return workflowState in 200 responses |

## Summary

**Phase 17 Goal: ACHIEVED**

All three chat routes successfully delegate to the WorkflowOrchestrator and return workflowState in their responses. Backward compatibility is fully preserved:

1. **Schema Extensions (Plan 17-01):** Optional workflowState field added to all three response schemas, allowing v1.4 clients to continue parsing responses without the field.

2. **Route Integration (Plan 17-02):**
   - POST /start calls orchestrator.startSession() → returns workflowState
   - POST /send calls orchestrator.processTurn() → returns workflowState
   - POST /card-action validates allowlist (403 preserved), then calls orchestrator.processCardAction() → returns workflowState
   - No direct Copilot calls remain; all infrastructure code removed (buildContextPrefix, conversationStore.set, etc.)

3. **Testing & Verification (Plan 17-03):**
   - Multi-turn integration test proves collectedData accumulates across turns
   - Query preambles contain prior data on successive turns (TEST-03)
   - Parser and context builder tests fully cover required scenarios (TEST-01, TEST-02)
   - All 147 tests pass with 0 regressions

4. **Backward Compatibility:**
   - Plain text responses (passthrough mode) return identical message content with optional workflowState
   - v1.4 clients that don't expect workflowState continue to function
   - Allowlist violations on /card-action still return 403 as before
   - Authentication, error handling, and message normalization unchanged

**Verification Status:** PASSED
**Score:** 10/10 must-haves verified
**All requirements satisfied:** ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, COMPAT-01, COMPAT-02, COMPAT-03, TEST-01, TEST-02, TEST-03

---

*Verified: 2026-02-22T21:50:00Z*
*Verifier: Claude Code (gsd-verifier)*
