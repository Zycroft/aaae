---
phase: 15-parser-context-builder
status: passed
verified: 2026-02-22
verifier: Claude (gsd-verifier)
---

# Phase 15: Parser + Context Builder — Verification

## Phase Goal

**Goal**: Structured output can be reliably extracted from any Copilot response format, and outbound queries can be enriched with a configurable workflow context preamble.

**Result: PASSED**

## Success Criteria Verification

### 1. Structured JSON produces ParsedTurn with populated data and nextAction

**Status: PASSED**

- `parseTurn()` receives NormalizedMessage with `extractedPayload.data = { action: 'ask', prompt: 'What is your name?' }`
- Returns `{ kind: 'structured', data: { action: 'ask', ... }, nextAction: 'ask', confidence: 'high' }`
- Verified by test: "returns structured for assistant message with valid extractedPayload from activity.value"
- Covers all three extraction surfaces: activity.value (high), entities (medium), text (low)

### 2. Plain text produces ParsedTurn in passthrough mode

**Status: PASSED**

- `parseTurn()` with plain text assistant message (no extractedPayload) returns `{ kind: 'passthrough', parseErrors: [], data: null }`
- Empty message arrays also return passthrough
- User-only messages return passthrough
- Verified by 3 tests: empty array, plain text, user-only messages

### 3. Malformed response produces ParsedTurn with parseErrors

**Status: PASSED**

- Invalid action enum (`'INVALID_ACTION'`) returns `{ kind: 'parse_error', parseErrors: ['...'] }`
- Out-of-range confidence (`5.0` where max is `1.0`) returns parse_error
- Parser does NOT throw — verified by poison Proxy test and malformed input test
- Verified by 4 tests: invalid action, out-of-range confidence, malformed input, poisoned Proxy

### 4. Context builder prepends preamble with step, data, turn count and truncates

**Status: PASSED**

- Default preamble contains `[CONTEXT]`, `Phase:`, `Collected data:`, `Turn number:`, `[/CONTEXT]`
- Custom preamble template replaces default entirely
- MaxLength truncation: `query.length <= maxLength`, ends with `...`, returns `truncated: true`
- Default maxLength is 2000 (verified by large collectedData test triggering truncation)
- Verified by 10 tests covering all CTX requirements

### 5. Types defined in shared/src/schemas/workflow.ts and importable

**Status: PASSED**

- `CopilotStructuredOutputSchema`, `ParsedTurnSchema`, `NextActionSchema` all exported from `@copilot-chat/shared`
- Runtime verification: `typeof s.ParsedTurnSchema === 'object'`, `typeof s.CopilotStructuredOutputSchema === 'object'`
- `.passthrough()` confirmed: unknown fields pass validation and are preserved in output
- `shared/` builds cleanly with zero TypeScript errors

## Requirement Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| PARSE-01 | Complete | parseTurn() validates extractedPayload from value/entities/text sources |
| PARSE-02 | Complete | CopilotStructuredOutputSchema uses `.passthrough()`, validated via Zod safeParse |
| PARSE-03 | Complete | ParsedTurn contains data, nextAction, nextPrompt, displayMessages, confidence, citations, parseErrors |
| PARSE-04 | Complete | Parser never throws — try/catch wraps all logic, 2 tests verify non-throwing contract |
| PARSE-05 | Complete | shared/src/schemas/workflow.ts exports all schemas, barrel re-exports in index.ts |
| CTX-01 | Complete | Default preamble includes step, collectedData, turnCount |
| CTX-02 | Complete | Custom preambleTemplate replaces default format |
| CTX-03 | Complete | MaxLength truncation (default 2000) with '...' suffix |

**8/8 requirements verified.**

## Test Results

- **Server tests:** 116/116 passing (9 test files)
- **Parser tests:** 15/15 passing
- **Context builder tests:** 10/10 passing
- **Shared build:** Zero TypeScript errors
- **No regressions:** All pre-existing tests continue to pass

## must_haves Verification (from PLANs)

### Plan 15-01 must_haves
- [x] CopilotStructuredOutputSchema is importable from @copilot-chat/shared
- [x] ParsedTurn discriminated union type (three kinds) exported from shared
- [x] NextAction enum type exported from shared
- [x] Zod schema uses .passthrough() allowing unknown fields
- [x] shared/src/schemas/workflow.ts exists with all schemas
- [x] shared/src/index.ts barrel exports all workflow types

### Plan 15-02 must_haves
- [x] parseTurn() with NormalizedMessage containing activity.value JSON returns kind='structured'
- [x] parseTurn() with plain text message returns kind='passthrough' with empty parseErrors
- [x] parseTurn() with malformed JSON returns kind='parse_error' with non-empty parseErrors
- [x] parseTurn() never throws — all error paths return ParsedTurn variants
- [x] Extracted JSON validated against CopilotStructuredOutputSchema using Zod safeParse
- [x] Parser tries extraction from extractedPayload (mirrors priority order: value > entities > text)

### Plan 15-03 must_haves
- [x] buildContextualQuery() prepends structured preamble with step, collectedData, turnCount
- [x] Preamble format configurable via preambleTemplate option
- [x] Query exceeding maxLength truncated with truncated=true
- [x] Within maxLength returns truncated=false
- [x] buildContextualQuery() is pure synchronous function

## Artifacts Created

| File | Purpose |
|------|---------|
| shared/src/schemas/workflow.ts | CopilotStructuredOutputSchema, ParsedTurnSchema, NextActionSchema |
| shared/src/index.ts | Barrel re-export of workflow types (modified) |
| server/src/parser/structuredOutputParser.ts | parseTurn() function |
| server/src/parser/structuredOutputParser.test.ts | 15-test TDD suite |
| server/src/workflow/contextBuilder.ts | buildContextualQuery() function |
| server/src/workflow/contextBuilder.test.ts | 10-test TDD suite |

---
*Verified: 2026-02-22*
*Verifier: Claude (gsd-verifier)*
