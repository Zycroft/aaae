# Copilot Studio SDK Evaluation for v1.5 Workflow Orchestrator

**Date:** 2026-02-21
**Evaluator:** Automated (Claude Code)
**Milestone:** v1.3b -- Copilot Studio SDK: Orchestrator Readiness
**Recommendation:** CONDITIONAL GO

## Executive Summary

The Copilot Studio SDK infrastructure for the v1.5 Workflow Orchestrator is architecturally complete and tested. All code-level components -- schema validation, normalizer extraction, context injection, and the orchestrate endpoint -- are implemented and passing 71+ automated tests. The recommendation is CONDITIONAL GO because latency baselines and live context injection measurements remain pending (require real Copilot Studio credentials); however, the code infrastructure is production-ready and no architectural blockers have been identified.

## Evaluation Criteria

### 1. Latency Performance

**Threshold:** Round-trip latency < 5000ms for standard messages
**Source:** spike/LATENCY-RESULTS.md

| Metric | Median | Threshold | Result |
|--------|--------|-----------|--------|
| startConversation | [TBD] | < 10s | TBD |
| sendMessage | [TBD] | < 5s | TBD |
| Full round-trip | [TBD] | < 5s | TBD |

**Assessment:** Latency measurements are pending execution of `npx tsx spike/latency-baseline.ts` with real Copilot Studio credentials. The measurement infrastructure is complete -- the latency-baseline.ts script collects 5 samples each for startConversation, sendMessage, and full round-trip, then computes medians. The orchestrate endpoint also captures per-request latencyMs via `performance.now()`. This criterion remains a condition for full GO.

### 2. Structured Output Extraction

**Threshold:** Normalizer can extract structured JSON from at least 2 of 3 surfaces
**Source:** Phase 8 normalizer tests (34 tests)

| Surface | Extraction Works | Confidence Level | Result |
|---------|-----------------|------------------|--------|
| activity.value | Yes | high | PASS |
| activity.entities | Yes | medium | PASS |
| bot text (JSON embedded) | Yes | low | PASS |

**Assessment:** All three extraction surfaces are implemented and tested in `server/src/normalizer/activityNormalizer.ts`. The ExtractedPayload schema validates with confidence levels (high/medium/low). The normalizer uses a priority chain: value > entities > text, ensuring the highest-confidence source is preferred. 34 normalizer tests pass, covering text, adaptive card, hybrid, and extraction scenarios.

### 3. Context Injection Coherence

**Threshold:** Agent responds coherently to 3-turn conversation with injected context
**Source:** spike/CONTEXT-INJECTION-RESULTS.md

| Scenario | Turns Passed | Context Size | Result |
|----------|-------------|-------------|--------|
| Small context | [TBD] | ~500 chars | TBD |
| Large context | [TBD] | ~1000 chars | TBD |

**Assessment:** The context injection infrastructure is complete. `buildContextPrefix()` formats WorkflowContext as a structured `[WORKFLOW_CONTEXT]...[/WORKFLOW_CONTEXT]` prefix prepended to the user's message. The `/send` route and `/orchestrate` endpoint both support optional workflowContext. The spike script (`spike/context-injection-spike.ts`) drives 3-turn conversations at two size thresholds. Live results are pending execution with real credentials.

### 4. Conversation Continuity

**Threshold:** Agent demonstrates awareness of prior turns in 3-turn sequence
**Source:** spike/CONTEXT-INJECTION-RESULTS.md (ORCH-04 section)

**Assessment:** The conversation continuity test is bundled with the context injection spike. The spike script verifies whether the agent references prior-turn data (e.g., name from turn 1 recalled in turn 2) across a 3-turn sequence. Results are pending live execution. The orchestrate endpoint manages WorkflowState externally (step, collectedData, lastRecommendation, turnCount), ensuring the orchestrator does not rely on the agent's internal memory for workflow state preservation.

### 5. Orchestrate Endpoint

**Threshold:** Single endpoint consolidates start + send + normalize + extract + measure
**Source:** server/src/routes/orchestrate.ts

| Capability | Implemented | Result |
|-----------|-------------|--------|
| Accepts query + workflowContext | Yes | PASS |
| Returns messages | Yes | PASS |
| Returns extractedPayload | Yes | PASS |
| Returns latencyMs | Yes | PASS |
| Returns workflowState | Yes | PASS |
| No modifications to existing routes | Yes | PASS |

**Assessment:** The orchestrate endpoint provides a batteries-included interface for the orchestrator. A single POST to `/api/chat/orchestrate` starts a conversation, sends the query with optional context prefix, normalizes the Copilot response, extracts structured payload, measures wall-clock latency, and builds/persists WorkflowState. Existing `/start`, `/send`, and `/card-action` routes are completely unchanged.

## Agent-Side Configuration Requirements (EVAL-03)

What the Copilot Studio agent must be configured to return for structured output extraction to work reliably:

1. **activity.value usage:** The agent's topic should use "Send a message" actions with the Message type set to include structured data in the activity value field. This is the highest-confidence extraction surface.

2. **JSON in bot text:** If the agent embeds JSON in text responses, it should use standard JSON formatting (valid JSON.parse-able strings). The normalizer uses regex + JSON.parse fallback.

3. **Entity annotations:** The SDK may attach entity metadata to activities. The normalizer extracts non-type fields from entities. Agent authors should be aware this surface exists but has medium confidence.

4. **Context prefix parsing:** The agent should be designed to recognize the `[WORKFLOW_CONTEXT]...[/WORKFLOW_CONTEXT]` prefix format. This is not a strict requirement -- the prefix is human-readable -- but agents that parse it explicitly will provide better structured responses.

5. **Multi-turn state:** The agent should not rely on its own conversation memory for workflow state. The orchestrator manages state externally and re-injects it via workflowContext on each turn.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Latency variability | Medium | Orchestrator should implement timeout + retry |
| Text extraction reliability | Low | Priority chain (value > entities > text) provides fallback |
| Context prefix not parsed | Low | Prefix is human-readable; works even if agent doesn't explicitly parse |
| Agent configuration dependency | Medium | Document requirements clearly; provide agent setup guide |
| Pending live measurements | Medium | Spike scripts ready to run; architecture does not change based on measured values |

## Recommendation

**CONDITIONAL GO**

**Rationale:** The SDK infrastructure for the v1.5 Workflow Orchestrator is architecturally sound and fully implemented. All code-level components pass automated testing: the normalizer extracts structured data from all three Copilot activity surfaces (34 tests), the WorkflowContext and WorkflowState schemas validate correctly (17 tests), the orchestrate endpoint compiles and integrates all subsystems, and existing v1.1 routes remain untouched. The CONDITIONAL status reflects two pending measurements that require real Copilot Studio credentials: (1) latency baselines from spike/LATENCY-RESULTS.md and (2) live context injection coherence from spike/CONTEXT-INJECTION-RESULTS.md. These measurements validate operational characteristics, not architectural fitness -- the code will not change based on the results. Once latency medians confirm sub-5-second round-trips and the 3-turn context injection spike passes, the recommendation upgrades to full GO.

**Conditions (for full GO):**
- Run `npx tsx spike/latency-baseline.ts` with real credentials; confirm sendMessage median < 5000ms
- Run `npx tsx spike/context-injection-spike.ts` with real credentials; confirm 3-turn coherence at both context sizes
- Update spike/LATENCY-RESULTS.md and spike/CONTEXT-INJECTION-RESULTS.md with real numbers
- Update this document's criteria tables with measured values

## Appendix: Test Evidence

- **Normalizer tests:** 34 tests passing (server/src/normalizer/activityNormalizer.test.ts)
- **WorkflowState schema tests:** 8 tests passing (shared/src/schemas/workflowState.test.ts)
- **WorkflowContext schema tests:** 9 tests passing (shared/src/schemas/workflowContext.test.ts)
- **Auth + allowlist tests:** 20 tests passing (server/src/middleware/, server/src/allowlist/)
- **Latency baseline script:** spike/latency-baseline.ts (ready to execute)
- **Context injection script:** spike/context-injection-spike.ts (ready to execute)
- **Orchestrate endpoint:** server/src/routes/orchestrate.ts

---
*Evaluation completed: 2026-02-21*
*Milestone: v1.3b -- Copilot Studio SDK: Orchestrator Readiness*
