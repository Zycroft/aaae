# Feature Research

**Domain:** Workflow Orchestrator + Structured Output Parsing for AI Agent Chat Systems
**Researched:** 2026-02-21
**Confidence:** HIGH

*Note: This document supersedes the v1.0–v1.4 UI features research (2026-02-19). This research focuses exclusively on v1.5 workflow orchestration and structured output parsing, building on completed extraction (v1.3b) and state store (v1.4) infrastructure.*

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or untrustworthy for workflow automation.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Structured output extraction from LLM/agent responses** | Workflow decisions require reliable JSON/data parsing from unstructured agent text; cannot make data-driven decisions without extractable signals | HIGH | Multi-surface extraction (activity.value > entities > text) already in v1.3b; v1.5 adds parse-time validation + retry. Use Zod refine() for schema enforcement. |
| **Fallback to passthrough mode on extraction failure** | Agent conversations must remain usable when structured parsing fails; breaking text chat when JSON is unparseable makes product broken | MEDIUM | When extraction validation fails, render agent response as plain text (identical to v1.0 behavior). Add kind flag to NormalizedMessage to signal parsing failure. |
| **Validation of extracted data against JSON schema** | Malformed JSON or missing required fields must be caught before workflow consumes data; silent failures cause downstream cascading errors and wasted work | HIGH | Extend v1.3b ExtractedPayload with Zod refine() to reject empty payloads and invalid field types. Confidence levels per field ('high'\|'medium'\|'low'). |
| **Workflow state tracking across conversation turns** | Multi-step workflows require agent to remember step, collected data, constraints across multiple user messages; stateless design cannot execute workflows | HIGH | v1.4 ConversationStore exists; v1.5 wires WorkflowState accumulation in /orchestrate endpoint. Store step, collectedData, lastRecommendation, turnCount. |
| **Context enrichment for outbound Copilot queries** | Agent performance degrades when unaware of workflow context; naked queries lose signal that helps agent stay on track and avoid hallucinations | MEDIUM | Extend v1.3b [WORKFLOW_CONTEXT] prefix injection to include state summary (step, constraints, priorActions). Already partially wired; v1.5 formalizes in ContextBuilder module. |
| **Retry mechanism for failed extraction attempts** | LLM output is non-deterministic; structured output fails ~5–15% of time in production; retry with corrective prompt recovers most failures without user intervention | MEDIUM | On Zod validation failure, auto-retry with corrective prompt asking LLM to re-output valid JSON with error details. Max 2–3 attempts with exponential backoff (200ms, 500ms). |
| **Distinction between structured and unstructured responses** | Client UI must render correctly based on parse success/failure; attempting to render unvalidated JSON as form causes crashes or nonsense cards | LOW | Add optional flag in ExtractedPayload or NormalizedMessage to signal parsing failure. Client uses to choose rendering path (form vs plain text). |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | When to Build |
|---------|-------------------|------------|---------------|
| **Confidence scoring per extracted field** | Operator dashboard shows which fields are high/low confidence; enables downstream filtering (use high-confidence data, queue low-confidence for review) | MEDIUM | Phase 2 (v1.6) — add confidence scoring to ExtractedPayload schema; expose in /orchestrate response and structured logs. Required for trustworthy workflows. |
| **Multi-source extraction surface transparency** | Document extraction strategy: activity.value (highest fidelity) > activity.entities (structured) > text-embedded JSON (fallback). Formalizes and exposes confidence per surface. | MEDIUM | Phase 1 (v1.5) — already implemented; v1.5 extends with per-surface confidence scores and decision logging. |
| **LLM-driven next-step determination** | After parsing extraction, send meta-query to agent: "What should happen next?" (collect_email, execute_action, end_workflow). Routes dynamically instead of hard-coded transitions. | HIGH | Phase 2 (v1.6) — new flow step after parsing. Requires new agent prompt template and state machine branching. Enables more flexible workflows. |
| **Context window optimization via artifact offloading** | Large context (long history + collected data) causes token bloat and "lost in the middle" hallucination; offload to Redis with lightweight reference to reduce prompt size | HIGH | Phase 3+ (v1.7+) — defer unless v1.5 latency/cost testing shows token usage exceeds budget. Use handle pattern (store full data in Redis, reference by ID in prompt). |
| **Structured observability logs of all workflow decisions** | Every state transition, extraction attempt, confidence decision logged with timestamps and full context; enables audit trails and multi-turn debugging | MEDIUM | Phase 2 (v1.6) — wrap all orchestrator decisions in structured logger. Emit to stdout + optional Redis. Required for production observability. |
| **Partial/incremental state updates** | Workflow collects phone → email → address across turns; client sends deltas; server merges atomically without re-asking for data | MEDIUM | Phase 2 (v1.6) — extend StoredConversation.workflow with atomic patch merge logic. Improves UX: agent doesn't re-ask for previously provided data. |
| **Intent classification pre-routing** | Pre-classify user message as [request_info, submit_form, ask_followup, escalate] before full Copilot turn; route early exits and simple cases without full agent | MEDIUM | Phase 3 (v1.7+) — optimization if latency/cost becomes issue. Requires lightweight classifier (small prompt, low token cost). |
| **Explicit workflow definition as config** | Workflow transitions defined in JSON/YAML or TypeScript state machine, not scattered across route handlers. Single source of truth for step order and guards. | MEDIUM | Phase 1 (v1.5) — hand-rolled reducer (~100 lines TypeScript) or migrate to finity library. Enables testing and documentation. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Anti-Feature | Why Requested | Why Problematic | What to Do Instead |
|--------------|---------------|-----------------|-------------------|
| **Forcing structured output via regex/grammar-based token constraints** | Seems safer: lock tokens to valid JSON characters. Feels like guaranteed valid output. | Adds latency (tighter decoding loop), reduces model quality (constrained generation undershoots), increases cost. v1.3b already uses agent schema. Changes break if schema changes. | Use native Copilot SDK structured output mode + post-validation fallback. If SDK unavailable, rely on prompt engineering + Zod validation. |
| **Context accumulation without bounds ("append everything")** | Simple to implement: just append every turn to prompt. Avoids complex windowing logic. | Fails catastrophically: token explosion → cost/latency disaster → hallucination ("lost in the middle"). Naive approach collapses at ~50 turns. Context bloat worsens hallucination via recency bias. | Implement context window budgeting: keep N recent turns + compressed state summary. Use artifact offloading (Phase 3) if context exceeds budget. Monitor token counts. |
| **Dual storage (in-memory + Redis with async sync)** | Seems resilient: in-memory for speed, Redis for durability, periodic sync. | Creates race conditions, inconsistency, silent data loss. v1.4 factory pattern already solves this cleanly by selecting ONE backend. | Factory selects ONE backend: Redis or InMemory. No dual writes. Phase 4+ can add read replicas, not dual-write. |
| **Storing serialized LLM conversation objects as JSON** | Seems persistent: if we can JSON.stringify the SDK conversation, we can resume it later. | SDK ConversationRef is a live object with internal timers/channels; JSON round-trip kills it. Deserialization fails or hangs. v1.4 already stores only conversationId. | Store only serializable scalars: conversationId, timestamps, user IDs. Keep live SDK objects in-memory only, scoped to single request or conversation. |
| **Generic "extraction failed" fallback (discard all partial data)** | Seems safe: if validation fails completely, return empty object. No risk of using bad data. | Wastes signal: highest-confidence fields are still useful even if schema validation fails. Conversely, client doesn't know what's usable. | Return highest-confidence fields even if full schema fails. Add field-level confidence. Let client decide if partial extraction is useful. |
| **Synchronous orchestrator steps (serialize everything)** | Seems clearer: no race conditions, no parallel bugs. Each step waits for prior step to finish. | Response latency grows O(n). Fetching context artifacts + initiating Copilot turn done serially doubles latency. Slow = poor UX. | Parallelize orthogonal operations: fetch context artifacts + initiate Copilot turn concurrently using Promise.all. Sequential for dependent steps only. |
| **Hardcoded step transitions ("if step == X && condition, go to Y")** | Seems explicit: transitions written in code, easy to follow in one place. | Unmaintainable: step names scattered across routes, transitions duplicated, hard to test, error-prone. No single source of truth for workflow. | Define workflow transitions as declarative JSON/YAML config or use TypeScript state machine library (finity, xstate, hand-rolled reducer). Single source of truth. |
| **Storing raw full message history in workflow state** | Seems complete: preserve everything for context. All history available for every decision. | Bloats state: every turn copies N prior messages. Multi-tenant database explodes. Context window grows O(n²). Serialization/deserialization expensive. | Store only message IDs/offsets + compressed summary of prior turns. Hydrate full history on-demand from MessageStore if needed. |

## Feature Dependencies

```
Structured output extraction (v1.3b exists)
    ├──requires──> Zod validation in shared/
    ├──requires──> ExtractedPayload schema refinement
    └──enables──> Fallback passthrough (renders as text on validation failure)
                  Retry mechanism (on validation failure, re-prompt Copilot)
                  Confidence scoring (metadata on confidence)

Workflow state tracking (v1.4 ConversationStore exists)
    ├──requires──> StoredConversation.workflow field (exists in v1.4)
    ├──requires──> /orchestrate endpoint wiring (partial in v1.3b)
    └──enables──> Context enrichment (state fed into prompt)
                  LLM-driven next-step (state used in meta-query)
                  Partial state updates (atomic merge)

Context enrichment (v1.3b [WORKFLOW_CONTEXT] prefix exists)
    ├──requires──> Workflow state (to enrich with)
    ├──requires──> ContextBuilder module (new)
    └──enables──> Dynamic system prompt adaptation

Confidence scoring (independent of extraction)
    ├──enhances──> Structured output extraction (metadata on confidence)
    ├──enhances──> Observability logs (decision metadata)
    └──enables──> Intent classification (confidence threshold for routing)

LLM-driven next-step
    ├──requires──> Extraction (parsed signals input to decision)
    ├──requires──> State machine (transitions based on decision)
    ├──requires──> ContextBuilder (context for meta-query)
    └──conflicts──> Hardcoded transitions (choose one pattern)

State machine (hand-rolled reducer or finity)
    ├──requires──> Extraction (signals to make routing decisions)
    ├──enables──> Partial state updates (tracking collectedData)
    └──enables──> Observability (every transition logged)

Observability logs
    ├──enhances──> All features above (logging all decisions)
    └──independent──> Can be added across phases; non-blocking

Context window optimization
    ├──optional──> Only needed if token budget exceeded in v1.5 testing
    └──conflicts──> Dual storage (use only factory pattern)
```

### Dependency Notes

- **Structured output extraction requires Zod validation:** v1.3b extraction exists; v1.5 adds parse-time validation with Zod refine() to reject malformed or empty payloads. Cannot enable fallback or retry without this.
- **Fallback passthrough requires failed extraction detection:** On Zod validation failure, trigger passthrough mode; add kind flag to signal client rendering engine.
- **Workflow state tracking requires /orchestrate endpoint:** v1.4 ConversationStore wired for persistence; v1.5 wires state accumulation in /orchestrate. State must survive across multiple /send calls.
- **Context enrichment requires workflow state:** Cannot enrich context without state to embed. v1.3b context injection exists as structured prefix; v1.5 extends with full state summary (step, priorActions, constraints).
- **Retry mechanism requires validation failure detection:** Only triggered on Zod parse failure; modifies prompt with error details and retries. Orthogonal to all other features.
- **LLM-driven next-step requires extraction + state + context:** Meta-query sent to agent after extraction; decision fed into state machine to select next step. Requires both structured extraction and state tracking.
- **Confidence scoring enhances extraction:** Metadata added to ExtractedPayload; not required for MVP, but enables downstream filtering and operator dashboards. Can be added in Phase 2.
- **Observability logs are orthogonal:** Can be added across phases; cuts across all other features. Non-blocking; can be stubbed in Phase 1 and enriched in Phase 2.
- **Context window optimization conflicts with context accumulation:** If implementing windowing, don't also do dual storage; use factory pattern. Defer to Phase 3 unless v1.5 testing shows token budget exceeded.

## MVP Definition

### Launch With (v1.5)

Minimum viable product for workflow orchestrator + structured output parsing. Building on v1.3b extraction and v1.4 state store.

- [x] **Structured output validation** — Extend v1.3b extraction with Zod refine() to reject empty/invalid payloads; add field-level confidence ('high'|'medium'|'low').
- [x] **Fallback to passthrough** — On validation failure, render agent response as plain text (no form); add kind flag to distinguish from successful extraction.
- [x] **Retry mechanism** — On validation failure, auto-retry with corrective prompt asking LLM to provide valid JSON; max 2 attempts with 200ms backoff.
- [x] **Basic state tracking** — Accept WorkflowState in /orchestrate request; accumulate into StoredConversation.workflow; return updated state in response.
- [x] **Context enrichment** — Extend [WORKFLOW_CONTEXT] prefix to include state summary (step, collectedData, constraints). Formalize in new ContextBuilder module.
- [x] **State machine skeleton** — Define step enum and basic transitions (not dynamic routing yet; v1.6 adds LLM-driven decisions). Use hand-rolled reducer or TypeScript types.

### Add After Validation (v1.6)

Features to add once core orchestrator is working and validated in testing.

- [ ] **Confidence scoring in logs** — Every parse decision logged with confidence threshold; enables observability and per-field filtering.
- [ ] **LLM-driven next-step determination** — Meta-query after extraction: "What should happen next?" Routes dynamically instead of hardcoded transitions.
- [ ] **Structured orchestrator decision logs** — Every state transition, extraction, fallback decision timestamped and queryable; enables audit trails and debugging.
- [ ] **Partial state updates** — Client sends deltas; server merges atomically; avoids re-asking for previously provided data.
- [ ] **State machine graph definition** — Explicit workflow definition as JSON or TypeScript (migrate to finity or xstate if complexity grows).

### Future Consideration (v1.7+)

Features to defer until core workflows are proven in production and requirements are clearer.

- [ ] **Context window optimization via artifact offloading** — Large context causes token bloat and "lost in the middle" hallucination. Defer until token budget exceeded in real usage.
- [ ] **Intent classification pre-routing** — Lightweight pre-classifier for simple cases; optimization only if latency/cost becomes issue.
- [ ] **User-specific conditional logic** — Role-based or tier-based routing. Defer until multi-user/multi-role requirements emerge.
- [ ] **Dynamic system prompt per step** — System prompt references workflow step; changes per turn. Low priority; static prompt works v1.5–v1.6.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase | Dependencies |
|---------|------------|---------------------|----------|-------|--------------|
| Structured output validation | HIGH | HIGH | P1 | v1.5 | v1.3b ExtractedPayload, Zod |
| Fallback passthrough | HIGH | MEDIUM | P1 | v1.5 | Validation (detection of failure) |
| Retry mechanism | HIGH | MEDIUM | P1 | v1.5 | Validation (failure detection) |
| Workflow state tracking | HIGH | MEDIUM | P1 | v1.5 | v1.4 ConversationStore, /orchestrate |
| Context enrichment (extension) | HIGH | MEDIUM | P1 | v1.5 | Workflow state |
| State machine skeleton | HIGH | MEDIUM | P1 | v1.5 | Workflow state |
| Confidence scoring | MEDIUM | MEDIUM | P2 | v1.6 | Structured extraction |
| LLM-driven next-step | MEDIUM | HIGH | P2 | v1.6 | Extraction + state + context |
| Structured observability logs | MEDIUM | MEDIUM | P2 | v1.6 | All orchestrator features |
| Partial state updates | MEDIUM | MEDIUM | P2 | v1.6 | State tracking, atomic merge |
| Explicit workflow config | MEDIUM | MEDIUM | P2 | v1.6 | State machine |
| Context window optimization | MEDIUM | HIGH | P3 | v1.7+ | Only if testing shows need |
| Intent classification | LOW | MEDIUM | P3 | v1.7+ | Latency/cost optimization |
| Dynamic system prompt | LOW | LOW | P3 | v1.7+ | Context enrichment extension |

**Priority key:**
- P1: Must have for v1.5 launch (workflow orchestrator + structured parsing)
- P2: Should have for v1.6 (observability + dynamic routing)
- P3: Nice to have, future consideration (optimizations + advanced features)

---

## Complexity Breakdown

### High Complexity (2–5 days each)

**Structured output validation + retry (3 days)**
- Handle: valid JSON but invalid schema, partial JSON, hallucinations in nested fields
- Retry strategy: return full error to LLM asking for corrected output (not just "invalid JSON")
- Trade-off: retry adds 200–500ms per attempt; cap at 2–3 with exponential backoff
- Testing: mock malformed Copilot responses, verify retry path and fallback activation

**Workflow state machine (3–5 days)**
- Define: step enum, transitions, guards (e.g., "only collect_email if phone exists")
- Tool choice: hand-rolled reducer (~100 lines TypeScript) vs finity (library) vs xstate (overkill)
- Recommendation: hand-rolled reducer for v1.5; migrate to finity if v1.6 adds complex branching
- Testing: state transitions validate; collected data accumulates correctly; steps don't skip

**LLM-driven next-step determination (3 days, v1.6)**
- Send meta-query to agent after extraction; parse decision output
- Transitions become dynamic based on LLM signal instead of hardcoded rules
- Testing: mock agent returning different next-step decisions; verify routing

### Medium Complexity (1–2 days each)

**Confidence scoring (1 day)**
- Copilot SDK may not expose token probabilities for structured fields
- Approximate: presence + validation pass/fail → 3-level confidence ('high'|'medium'|'low')
- Add to ExtractedPayload schema: confidence per field or per payload
- Testing: mock different confidence scenarios; verify client receives and logs

**Fallback passthrough (1 day)**
- On Zod validation failure, set kind='unstructured', clear cardJson, keep text
- Client detects and renders as plain text instead of form
- Testing: mock extraction failure; verify chat renders text, not broken card

**Context enrichment expansion (1 day)**
- Current: [WORKFLOW_CONTEXT] with step, constraints, collectedData
- Extend: add priorActions (list of prior decisions), lastExtraction summary
- Additive change to existing prompt; low risk
- Testing: verify context injected correctly; agent understands state

**Observability logging (1 day)**
- Wrap all orchestrator decisions: { timestamp, stepName, actionType, status, confidence, error? }
- Emit to stdout (Heroku/Azure logging); optional Redis key for recent logs
- Testing: run workflow; grep logs for complete decision chain

**Partial state updates (1 day)**
- Client sends delta (only changed fields); server merges atomically
- Testing: send partial updates; verify merge doesn't lose data

**State machine graph definition (1 day)**
- Explicit workflow definition as JSON or TypeScript
- Testing: parse config, generate state machine, verify transitions

### Low Complexity (< 1 day)

**State tracking in /orchestrate (< 1 day)**
- Accept workflowState in request; store in StoredConversation.workflow; return updated state
- v1.4 infrastructure exists; this is wiring
- Testing: send state; verify persistence across /send calls

**Kind flag for structured/unstructured (< 1 day)**
- Add optional flag to NormalizedMessage or ExtractedPayload
- Client uses to distinguish parsing success from failure
- Testing: verify flag set correctly on validation success/failure

---

## Key Implementation Patterns

### Extraction Retry Pattern

```typescript
// Pseudo-code
async function extractWithRetry(copilotResponse: string, maxAttempts = 2) {
  let result = parseJSON(copilotResponse);
  let attempts = 1;

  while (attempts < maxAttempts && !isValidSchema(result)) {
    const error = getValidationError(result);
    const correction = await copilot.send(
      `Previous output was invalid: ${error}.\n` +
      `Please provide valid JSON matching this schema: ${getSchema()}`
    );
    result = parseJSON(correction);
    attempts++;
  }

  return {
    data: result,
    validated: isValidSchema(result),
    attempts,
    confidence: calculateConfidence(result, attempts)
  };
}
```

### Context Enrichment Pattern

```typescript
// Build enriched context from WorkflowState
function buildContextPrefix(state: WorkflowState): string {
  return `[WORKFLOW_CONTEXT]
Step: ${state.step}
Constraints: ${JSON.stringify(state.constraints)}
Collected Data: ${JSON.stringify(state.collectedData)}
Prior Actions: ${state.priorActions?.map(a => `Turn ${a.turn}: ${a.action}`).join('; ') || 'None'}
[END_CONTEXT]`;
}

// Prepend to outbound message
const enrichedMessage = buildContextPrefix(workflowState) + userMessage;
await copilot.send(enrichedMessage);
```

### State Machine Pattern (Hand-Rolled Reducer)

```typescript
type WorkflowStep = 'collect_phone' | 'collect_email' | 'collect_address' | 'confirm' | 'done';

interface WorkflowState {
  step: WorkflowStep;
  collectedData: Record<string, any>;
  turnCount: number;
}

function getNextStep(
  current: WorkflowState,
  extracted: ExtractedPayload,
): WorkflowState {
  switch (current.step) {
    case 'collect_phone':
      return {
        ...current,
        step: extracted.data.phone ? 'collect_email' : 'collect_phone',
        collectedData: { ...current.collectedData, phone: extracted.data.phone },
      };
    case 'collect_email':
      return {
        ...current,
        step: extracted.data.email ? 'collect_address' : 'collect_email',
        collectedData: { ...current.collectedData, email: extracted.data.email },
      };
    // ... more cases
    default:
      return { ...current, step: 'done' };
  }
}
```

---

## Sources

### Workflow Orchestration Frameworks & Patterns
- [Top 10+ Agentic Orchestration Frameworks & Tools in 2026](https://aimultiple.com/agentic-orchestration)
- [The 2026 Guide to Agentic Workflow Architectures](https://www.stack-ai.com/blog/the-2026-guide-to-agentic-workflow-architectures)
- [AI Agent Architecture: Build Systems That Work in 2026](https://redis.io/blog/ai-agent-architecture/)
- [Architecting efficient context-aware multi-agent framework for production](https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/)
- [Agentic Frameworks in 2026: What Actually Works in Production](https://zircon.tech/blog/agentic-frameworks-in-2026-what-actually-works-in-production/)

### Structured Output & Extraction
- [Structured Outputs Guide - Perplexity](https://docs.perplexity.ai/guides/structured-outputs)
- [How do Structured Outputs Work? | Cohere](https://docs.cohere.com/docs/structured-outputs)
- [The guide to structured outputs and function calling with LLMs](https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms)
- [Use entities and slot filling in agents - Microsoft Copilot Studio](https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-entities-slot-filling)
- [Improve AI accuracy: Confidence Scores in LLM Outputs Explained](https://medium.com/@vatvenger/confidence-unlocked-a-method-to-measure-certainty-in-llm-outputs-1d921a4ca43c)

### Structured Output Validation & Error Recovery
- [Error Recovery and Fallback Strategies in AI Agent Development](https://www.gocodeo.com/post/error-recovery-and-fallback-strategies-in-ai-agent-development)
- [Complex data extraction with function calling](https://langchain-ai.github.io/langgraph/tutorials/extraction/retries/)
- [LLM Output Parsing and Structured Generation Guide](https://tetrate.io/learn/ai/llm-output-parsing-structured-generation)
- [Instructor - Multi-Language Library for Structured LLM Outputs](https://python.useinstructor.com/)

### Multi-Turn State Management
- [Multi-Turn Conversational Agents](https://www.lyzr.ai/glossaries/multi-turn-conversational-agents/)
- [How To Build Multi-Turn AI Conversations With Rasa](https://rasa.com/blog/multi-turn-conversation)
- [Multi-turn Conversations with Agents: Building Context Across Dialogues](https://medium.com/@sainitesh/multi-turn-conversations-with-agents-building-context-across-dialogues-f0d9f14b8f64)
- [Conversation state | OpenAI API](https://platform.openai.com/docs/guides/conversation-state)

### Context Management & Hallucination Prevention
- [Context Engineering for AI Agents: Lessons from Building Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus/)
- [Cutting Through the Noise: Smarter Context Management for LLM-Powered Agents](https://blog.jetbrains.com/research/2025/12/efficient-context-management/)
- [When More Becomes Less: Why LLMs Hallucinate in Long Contexts](https://medium.com/design-bootcamp/when-more-becomes-less-why-llms-hallucinate-in-long-contexts-fc903be6f025)
- [How Long Contexts Fail](https://www.dbreunig.com/2025/06/22/how-contexts-fail-and-how-to-fix-them.html)

### Adaptive Cards & Workflow State
- [Sequential Workflow for Adaptive Cards - Teams](https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/universal-actions-for-adaptive-cards/sequential-workflows)
- [Universal Actions for Adaptive Cards](https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/universal-actions-for-adaptive-cards/overview)
- [Actions - Adaptive Cards | Microsoft Learn](https://learn.microsoft.com/en-us/adaptive-cards/rendering-cards/actions)

### State Machine Libraries
- [Workflows and agents - LangChain JavaScript](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents)
- [Choosing the Right Multi-Agent Architecture](https://blog.langchain.com/choosing-the-right-multi-agent-architecture/)
- [GitHub - nickuraltsev/finity: A finite state machine library for Node.js](https://github.com/nickuraltsev/finity)

---

*Feature research for: Workflow Orchestrator + Structured Output Parsing (v1.5 milestone)*
*Researched: 2026-02-21*
*Confidence: HIGH*
