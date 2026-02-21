# Copilot Studio SDK Latency Baseline

**Date:** 2026-02-21
**Agent:** [TBD — requires real COPILOT_AGENT_SCHEMA_NAME]
**Environment:** [TBD — requires real COPILOT_ENVIRONMENT_ID]
**Status:** PENDING — awaiting execution with real Copilot Studio credentials

## startConversation() -- PERF-01

| Sample | Latency (ms) |
|--------|-------------|
| 1 | [TBD] |
| 2 | [TBD] |
| 3 | [TBD] |
| 4 | [TBD] |
| 5 | [TBD] |
| **Median** | **[TBD]** |

## sendMessage() to First Activity -- PERF-02

| Sample | Latency (ms) |
|--------|-------------|
| 1 | [TBD] |
| 2 | [TBD] |
| 3 | [TBD] |
| 4 | [TBD] |
| 5 | [TBD] |
| **Median** | **[TBD]** |

## Full Round-Trip -- PERF-03

(Request received -> normalizeActivities() complete)

| Sample | Latency (ms) |
|--------|-------------|
| 1 | [TBD] |
| 2 | [TBD] |
| 3 | [TBD] |
| 4 | [TBD] |
| 5 | [TBD] |
| **Median** | **[TBD]** |

## Notes

Placeholder document. To populate with real data:
1. Set real Copilot Studio credentials in `server/.env`
2. Run: `npx tsx spike/latency-baseline.ts`
3. Copy the output into this file
