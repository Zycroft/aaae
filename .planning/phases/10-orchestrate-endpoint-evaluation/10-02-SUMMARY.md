---
phase: 10-orchestrate-endpoint-evaluation
plan: 02
status: complete
---

# Plan 10-02 Summary: Orchestrate Endpoint

## What was built

- **OrchestrateRequestSchema** (`shared/src/schemas/api.ts`) — Validates `query` (required string) + optional `workflowContext`
- **OrchestrateResponseSchema** (`shared/src/schemas/api.ts`) — Validates `conversationId`, `messages`, `extractedPayload` (nullable), `latencyMs`, `workflowState`
- **orchestrateRouter** (`server/src/routes/orchestrate.ts`) — POST / handler that:
  1. Validates request with OrchestrateRequestSchema
  2. Starts a NEW Copilot conversation
  3. Sends query with optional context prefix via buildContextPrefix
  4. Measures latency with performance.now()
  5. Normalizes activities to NormalizedMessage[]
  6. Extracts first extractedPayload from messages
  7. Builds and persists WorkflowState
  8. Returns everything in one response
- **App mounting** (`server/src/app.ts`) — orchestrateRouter mounted at `/api/chat/orchestrate`

## Verification

- Full monorepo build passes (shared + client + server)
- All 54 existing tests pass
- `git diff HEAD server/src/routes/chat.ts` shows no changes to existing routes

## Requirements fulfilled

- **ORCH-03**: POST /api/chat/orchestrate accepts query + optional workflowContext, returns messages + extractedPayload + latencyMs + workflowState

## Files changed

| File | Change |
|------|--------|
| shared/src/schemas/api.ts | Modified — added OrchestrateRequest/Response schemas |
| shared/src/index.ts | Modified — barrel exports for new schemas |
| server/src/routes/orchestrate.ts | Created — orchestrateRouter |
| server/src/app.ts | Modified — mounted orchestrateRouter |

---
*Plan 10-02 completed: 2026-02-21*
