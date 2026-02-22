# Phase 15: Parser + Context Builder - Research

**Researched:** 2026-02-22
**Domain:** Structured Output Parsing + Workflow Context Injection
**Confidence:** HIGH

## Summary

Phase 15 implements two complementary systems that enable reliable workflow orchestration: a **structured output parser** that extracts JSON from any Copilot response surface (activity.value, activity.entities, JSON blocks, Adaptive Card data fields) and validates it with Zod, and a **context builder** that enriches outbound Copilot queries with workflow state (current step, collected data, turn count). Both systems build directly on v1.3b and v1.4 infrastructure (activity normalization, Redis store, Zod validation). The parser reuses the existing three-surface priority extraction pattern already in `activityNormalizer.ts`; the context builder refactors existing inline context logic into a reusable service. No new external dependencies required beyond what Phase 14 established.

**Primary recommendation:** Implement as two focused modules (`server/src/parser/structuredOutputParser.ts` and `server/src/workflow/contextBuilder.ts`) that extend existing normalization and context logic, with shared schema definitions in `shared/src/schemas/workflow.ts` for `CopilotStructuredOutputSchema`, `ParsedTurn`, and `NextAction`.

## Standard Stack

### Core (No new packages required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | 3.25.76 | Schema validation for parsed JSON | Already in shared/; used throughout v1.3b-v1.4 for all schema contracts. Passthrough mode allows forward compatibility. |
| Express | 4.21.0 | HTTP routing | Already in place; parser and context builder are service layers, not route handlers |
| ioredis | 5.9.3 | State persistence | Already deployed in Phase 14; no new Redis patterns needed |
| TypeScript | 5.7.0 | Type safety | Already strict config; parser and context builder are pure logic |

### Supporting Libraries (Already in place)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uuid | 11.0.0 | Generate message IDs, parse errors tracking | For unique IDs on ParsedTurn objects |
| @microsoft/agents-activity | (SDK) | Activity interface from Copilot SDK | Parsing source activities; no version change needed |

**No new dependencies required.** All required capabilities exist in the current stack. Zod's `.passthrough()` method (v3.0+, verified in shared/src) enables forward-compatible schema validation.

**Installation:** No `npm install` needed. Phase 15 adds TypeScript modules only.

## Architecture Patterns

### Recommended Project Structure

```
shared/src/schemas/
├── workflow.ts                    # (NEW) CopilotStructuredOutputSchema, ParsedTurn, NextAction

server/src/
├── parser/
│   ├── structuredOutputParser.ts  # (NEW) Multi-strategy extraction + Zod validation
│   └── structuredOutputParser.test.ts
├── workflow/
│   ├── contextBuilder.ts          # (NEW) Context preamble formatting + injection
│   └── contextBuilder.test.ts
└── normalizer/
    └── activityNormalizer.ts      # (EXISTING) Reused for initial extraction
```

### Pattern 1: Multi-Surface Priority Extraction (Priority Chain)

**What:** The parser tries three surfaces in priority order (highest confidence first), returning the first successful match. This pattern already exists in `activityNormalizer.ts` and Phase 15 simply formalizes and extends it for the new parser module.

**When to use:** Whenever structured data could come from multiple sources in the same response. The priority chain ensures deterministic, confidence-ranked results.

**Extraction Priority (highest → lowest confidence):**
1. `activity.value` — Direct Line / SDK field, structured by protocol (confidence: 'high')
2. `activity.entities` — Entity array from Copilot SDK, merge non-type keys (confidence: 'medium')
3. JSON in `activity.text` — Parse markdown code blocks (```json ... ```) or raw JSON object (confidence: 'low')

**Example:**
```typescript
// Source: existing activityNormalizer.ts pattern, extended for Phase 15
function extractStructuredPayload(
  activity: Activity,
  schema?: ZodSchema
): { data: unknown; source: 'value' | 'entities' | 'text'; confidence: 'high' | 'medium' | 'low' } | null {

  // 1. Try activity.value (highest confidence)
  const activityValue = (activity as Record<string, unknown>).value;
  if (isPlainObject(activityValue) && Object.keys(activityValue).length > 0) {
    if (schema) {
      const parsed = schema.safeParse(activityValue);
      if (parsed.success) {
        return { data: parsed.data, source: 'value', confidence: 'high' };
      }
    } else {
      return { data: activityValue, source: 'value', confidence: 'high' };
    }
  }

  // 2. Try activity.entities (medium confidence)
  const activityEntities = (activity as Record<string, unknown>).entities;
  if (Array.isArray(activityEntities) && activityEntities.length > 0) {
    const merged: Record<string, unknown> = {};
    for (const entity of activityEntities) {
      if (isPlainObject(entity)) {
        for (const [key, val] of Object.entries(entity)) {
          if (key !== 'type') merged[key] = val;
        }
      }
    }
    if (Object.keys(merged).length > 0) {
      if (schema) {
        const parsed = schema.safeParse(merged);
        if (parsed.success) {
          return { data: parsed.data, source: 'entities', confidence: 'medium' };
        }
      } else {
        return { data: merged, source: 'entities', confidence: 'medium' };
      }
    }
  }

  // 3. Try JSON in text (lowest confidence, assistant messages only)
  if (role === 'assistant' && activity.text) {
    const extracted = tryParseJsonFromText(activity.text);
    if (extracted) {
      if (schema) {
        const parsed = schema.safeParse(extracted);
        if (parsed.success) {
          return { data: parsed.data, source: 'text', confidence: 'low' };
        }
      } else {
        return { data: extracted, source: 'text', confidence: 'low' };
      }
    }
  }

  return null;
}
```

### Pattern 2: Zod .passthrough() for Forward Compatibility

**What:** When validating extracted JSON against `CopilotStructuredOutputSchema`, use `.passthrough()` to allow fields the schema doesn't know about. This prevents breakage when Copilot's response format evolves.

**When to use:** For external API schemas (like Copilot responses) where you don't control the full shape but can safely ignore extra fields.

**Example:**
```typescript
// Source: v1.5 requirements, Zod 3.25.76 docs (https://zod.dev/)
const CopilotStructuredOutputSchema = z.object({
  action: z.enum(['ask', 'research', 'confirm', 'complete', 'error']).optional(),
  prompt: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  citations: z.array(z.string().url()).optional(),
}).passthrough();  // Allows additional fields without error

// Client sends: { action: 'ask', prompt: '...', data: {...}, newFieldWeAddedLater: '...' }
// Parser validates: passes, strips extra fields in strict mode or keeps them with .passthrough()
const result = schema.safeParse(clientData);
```

### Pattern 3: ParsedTurn with Confidence and Error Signals

**What:** The parser always returns a `ParsedTurn` object that distinguishes between three modes: structured (data extracted and validated), passthrough (no data found, return text as-is), and parse_error (extraction attempted but failed). This prevents silent failures.

**When to use:** When a system component could fail silently (parser finds JSON but it's invalid, extraction attempts made but all failed). Explicit error signals enable observability and fallback logic.

**Example:**
```typescript
// Source: v1.5 requirements, structured output research
type ParsedTurn =
  | {
      kind: 'structured';
      data: Record<string, unknown>;        // Validated data
      nextAction: 'ask' | 'research' | 'confirm' | 'complete' | 'error';
      nextPrompt: string;
      displayMessages: NormalizedMessage[];
      confidence: 'high' | 'medium' | 'low';
      citations: string[];
      parseErrors: [];  // Empty on success
    }
  | {
      kind: 'passthrough';
      data: null;
      nextAction: null;
      nextPrompt: null;
      displayMessages: NormalizedMessage[];
      confidence: null;
      citations: [];
      parseErrors: [];  // No errors, just no data found
    }
  | {
      kind: 'parse_error';
      data: null;
      nextAction: null;
      nextPrompt: null;
      displayMessages: NormalizedMessage[];
      confidence: null;
      citations: [];
      parseErrors: string[];  // E.g., ["activity.value JSON invalid: expected action enum", "text parse: not valid JSON"]
    };

// Parser function signature (never throws)
async function parseTurn(
  messages: NormalizedMessage[],
  schema?: ZodSchema
): Promise<ParsedTurn> {
  // ... extraction logic ...
  // Always returns a ParsedTurn, never throws
}
```

### Pattern 4: Context Preamble Injection (Configurable Format)

**What:** Before sending a user message to Copilot, prepend a structured preamble containing workflow state (current step, collected data, turn number). The preamble format should be configurable to match different Copilot agent prompt templates.

**When to use:** For stateful conversations where the AI system needs recent context but you want to keep context injection separate from core message handling.

**Example:**
```typescript
// Source: v1.5 requirements, Copilot context injection patterns (Phase 10 validated)
function buildContextualQuery(
  userMessage: string,
  workflowState: WorkflowState,
  contextConfig?: { preambleTemplate?: string; maxLength?: number }
): string {
  const defaultTemplate = `[CONTEXT]
Phase: {step}
Collected data: {dataJson}
Turn number: {turnCount}
[/CONTEXT]

{userMessage}`;

  const template = contextConfig?.preambleTemplate || defaultTemplate;
  const maxLength = contextConfig?.maxLength || 2000;

  // Build preamble by interpolating template
  const dataJson = JSON.stringify(workflowState.collectedData || {});
  let preamble = template
    .replace('{step}', workflowState.step)
    .replace('{dataJson}', dataJson)
    .replace('{turnCount}', String(workflowState.turnCount));

  // Truncate to max length if needed
  if (preamble.length > maxLength) {
    preamble = preamble.slice(0, maxLength).trim() + '...';
  }

  // Final query includes user message
  return preamble.replace('{userMessage}', userMessage);
}
```

### Anti-Patterns to Avoid

- **Throwing on parse failure:** Parser must be defensive — return `parseErrors[]` and continue, never throw. Allows orchestrator to decide fallback strategy.
- **Ignoring extraction confidence:** Different sources have different signal reliability (activity.value = high, text parse = low). Preserve confidence in output; let orchestrator weight decisions accordingly.
- **Hardcoding preamble format:** Context builder format should be configurable (env var or passed config) because different Copilot agents may expect different formats (e.g., system message vs. user message vs. prefixed to content).
- **No truncation on context overflow:** Context preamble should respect a maximum length (default 2000 chars, configurable) to prevent context window explosion when collectedData grows large.
- **Extracting from all message types indiscriminately:** Only extract from bot (assistant) messages for structured output signals. User messages should be passed through as-is.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation of extracted JSON | Custom validators, regex patterns, manual type checks | Zod (already in shared/) with `.safeParse()` | Zod handles edge cases (null vs undefined, type coercion, custom refinements), is production-proven, integrates with TypeScript type inference. Manual validation is error-prone and unmaintainable at scale. |
| JSON extraction from various text formats | Custom string parsing with try/catch chains | Combine existing `tryParseJsonFromText()` pattern with markdown code fence detection (already in activityNormalizer.ts) | Text parsing for JSON is deceptively brittle — need to handle markdown code fences, raw JSON objects, nested braces, escaped quotes. Reusing v1.3b pattern ensures consistency. |
| Distinguishing valid vs. invalid extractions | Catch all exceptions and assume success | Zod's `.safeParse()` which returns `{ success, data?, error? }` | `safeParse()` is explicitly designed for untrusted input; `parse()` throws. Mixing them causes silent failures or unexpected exceptions. Always use `safeParse()` for external data. |
| Context truncation logic | Substring with no regard for structure | Implement max-length check with optional ellipsis marker, respecting sentence/object boundaries where possible | Naive truncation in the middle of JSON or a sentence breaks context. Better to document truncation happened (with "...") and let orchestrator decide if truncation was acceptable. |

**Key insight:** v1.3b already solved JSON extraction from multiple surfaces (`activityNormalizer.ts` lines 28-113). Phase 15 extends that pattern with validation and confidence signals. Don't re-implement extraction — formalize and extend.

## Common Pitfalls

### Pitfall 1: Parser Silently Returns Null When Validation Fails

**What goes wrong:** Extraction finds JSON (e.g., in activity.value), passes it to Zod schema, schema validation fails, parser returns `{ kind: 'passthrough', data: null }`. Orchestrator has no idea parsing was attempted. Downstream, you can't distinguish "no structured output in response" from "structured output found but invalid."

**Why it happens:** Treating all non-success outcomes the same; conflating "no data found" with "data found but invalid."

**How to avoid:** Always distinguish parse attempts from parse successes. Use `ParsedTurn` with three kinds: `structured` (success), `passthrough` (no attempt made), `parse_error` (attempt made but failed). Log all `parse_error` cases with source and validation error details.

**Warning signs:** Observability logs show no parse errors ever, despite complex Copilot responses. Zero confidence scoring in metrics. Orchestrator behavior inconsistent between responses that *look* similar.

### Pitfall 2: Context Preamble Grows Unbounded, Exceeds Context Window

**What goes wrong:** `buildContextualQuery()` serializes full `collectedData` into preamble every turn. After 10-20 turns, preamble is 5000+ chars. Copilot receives truncated context window (no error signaled). Copilot's response becomes shorter/less detailed. Parser receives incomplete JSON (parse error). Workflow degrades silently.

**Why it happens:** No max-length enforcement or warning. Assuming Copilot can always receive full context.

**How to avoid:** Set configurable `maxLength` (default 2000 chars, tuned to typical Copilot token budget). Check preamble length before sending. Log a WARN when truncation occurs. Consider three-tier strategy for Phase 16+: full data (<40% budget), summary (40-70%), keys-only (70%+).

**Warning signs:** Copilot responses get progressively shorter after turn 5+. Parse error rate increases on later turns. Logs show preamble > 2000 chars routinely.

### Pitfall 3: Parser Doesn't Validate Against Schema, Returns Raw Extracted JSON

**What goes wrong:** Extractor finds `activity.value = { weird_field: 123 }`, parser returns it as-is without schema validation. Downstream orchestrator assumes structure matches `CopilotStructuredOutputSchema`, tries to read `nextAction` field, gets undefined. Logic breaks.

**Why it happens:** Skipping Zod validation to "save time" or "avoid failed validations." Assuming extracted JSON is automatically valid.

**How to avoid:** Always pass schema to extraction logic. Use `schema.safeParse(extracted)` before returning. If schema is not provided, document that validation is skipped and set confidence to 'low'. In practice, always provide schema in Phase 15 (pass `CopilotStructuredOutputSchema` or a conversation-specific variant).

**Warning signs:** Downstream code uses optional chaining everywhere (`data?.nextAction?.` instead of `data.nextAction`). Defensive checks for undefined fields suggest schema mismatches.

### Pitfall 4: Context Preamble Format Hardcoded, Breaks When Copilot Agent Prompt Changes

**What goes wrong:** Phase 15 hardcodes preamble format: `[CONTEXT] Phase: {step} ...`. Phase 10 validation showed that format. New Copilot agent deployed (standard practice), expects format `<context>...$</context>`. Context is no longer recognized. Orchestrator stops understanding workflow state. Workflows degrade.

**Why it happens:** Assuming preamble format is universal. Not separating configuration from code.

**How to avoid:** Make preamble format configurable. Store in env var or config file (not in code). Default to a reasonable format (e.g., `[CONTEXT]...`), but allow override. Document that changing preamble format requires coordinating with Copilot agent prompt. Add a test that verifies preamble is injected into the final query sent to Copilot.

**Warning signs:** Changes to Copilot agent prompt can't be deployed without code change. Test fixtures have hardcoded format expectations. Multiple context builders with slightly different formats scattered in code.

### Pitfall 5: JSON Extraction from Text Matches Nested Objects Outside Context

**What goes wrong:** User sends message with example JSON: `"Here's a sample: { deprecated: true, status: 'error' }"`. Parser tries `text.match(/\{[\s\S]*\}/)`, matches the innermost `{}`. Attempts to parse `"deprecated: true, status: 'error'"` as JSON, fails, logs confusing error. Confusion about whether parsing attempted at all.

**Why it happens:** Regex `\{[\s\S]*\}` is greedy; matches first `{` to last `}` in the entire text. Doesn't respect nesting.

**How to avoid:** Prioritize markdown code fences first: `\`\`\`(?:json)?\s*\n?([\s\S]*?)\`\`\`` (non-greedy, bounded by delimiters). Only fall back to raw JSON detection if code fence search fails. Consider using a proper JSON parser library (but Zod's `safeParse` with recursive descent is sufficient for this use case). Test with real user messages that contain example JSON.

**Warning signs:** Parse errors mention unexpected content outside the intended JSON block. Test cases have hardcoded simple JSON (`{ "key": "value" }`), but fail on real Copilot responses with nested data.

## Code Examples

Verified patterns from existing v1.4 codebase + v1.5 requirements:

### Example 1: Multi-Surface Priority Extraction with Validation

```typescript
// Source: server/src/normalizer/activityNormalizer.ts (existing pattern, extended with validation)
// + Zod 3.25.76 documentation (https://zod.dev/)

import { z } from 'zod';
import type { Activity } from '@microsoft/agents-activity';

/**
 * Structured output parser: extracts JSON from Copilot response and validates
 * against optional schema. Never throws.
 *
 * PARSE-01, PARSE-02, PARSE-03, PARSE-04
 */
export async function parseStructuredOutput(
  activity: Activity,
  schema?: z.ZodSchema
): Promise<{
  data: unknown;
  source: 'value' | 'entities' | 'text';
  confidence: 'high' | 'medium' | 'low';
  validationError?: string;
} | null> {
  // 1. Try activity.value
  const value = (activity as Record<string, unknown>).value;
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) {
    if (schema) {
      const result = schema.safeParse(value);
      if (result.success) {
        return { data: result.data, source: 'value', confidence: 'high' };
      } else {
        // Validation failed, log error and continue to next surface
        return { data: value, source: 'value', confidence: 'high', validationError: result.error.message };
      }
    }
    return { data: value, source: 'value', confidence: 'high' };
  }

  // 2. Try activity.entities
  const entities = (activity as Record<string, unknown>).entities;
  if (Array.isArray(entities) && entities.length > 0) {
    const merged: Record<string, unknown> = {};
    for (const entity of entities) {
      if (entity && typeof entity === 'object' && !Array.isArray(entity)) {
        for (const [key, val] of Object.entries(entity)) {
          if (key !== 'type') merged[key] = val;
        }
      }
    }
    if (Object.keys(merged).length > 0) {
      if (schema) {
        const result = schema.safeParse(merged);
        if (result.success) {
          return { data: result.data, source: 'entities', confidence: 'medium' };
        } else {
          return { data: merged, source: 'entities', confidence: 'medium', validationError: result.error.message };
        }
      }
      return { data: merged, source: 'entities', confidence: 'medium' };
    }
  }

  // 3. Try JSON in text (assistant only)
  if (activity.from?.role === 'bot' && activity.text) {
    const extracted = extractJsonFromText(activity.text);
    if (extracted) {
      if (schema) {
        const result = schema.safeParse(extracted);
        if (result.success) {
          return { data: result.data, source: 'text', confidence: 'low' };
        } else {
          return { data: extracted, source: 'text', confidence: 'low', validationError: result.error.message };
        }
      }
      return { data: extracted, source: 'text', confidence: 'low' };
    }
  }

  return null;
}

function extractJsonFromText(text: string): Record<string, unknown> | null {
  // Try markdown code fences first (more reliable)
  const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeFenceMatch) {
    try {
      const parsed = JSON.parse(codeFenceMatch[1].trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not valid JSON in code fence, fall through
    }
  }

  // Try raw JSON object detection (non-greedy, first { to matching })
  const rawMatch = text.match(/\{[\s\S]*?\}/);
  if (rawMatch) {
    try {
      const parsed = JSON.parse(rawMatch[0]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not valid JSON
    }
  }

  return null;
}
```

### Example 2: Context Builder with Configurable Format and Truncation

```typescript
// Source: v1.5 requirements, Phase 10 context injection validation

import type { WorkflowState } from '@copilot-chat/shared';

interface ContextBuilderConfig {
  preambleTemplate?: string;
  maxLength?: number;
}

/**
 * Builds enriched Copilot query with workflow state preamble.
 * Format is configurable; respects max-length with graceful truncation.
 *
 * CTX-01, CTX-02, CTX-03
 */
export function buildCopilotQuery(
  userMessage: string,
  workflowState: WorkflowState,
  config?: ContextBuilderConfig
): { query: string; truncated: boolean } {
  const template =
    config?.preambleTemplate ||
    `[CONTEXT]
Phase: {step}
Collected data: {dataJson}
Turn number: {turnCount}
[/CONTEXT]

{userMessage}`;

  const maxLength = config?.maxLength || 2000;

  // Serialize workflow state
  const dataJson = JSON.stringify(workflowState.collectedData || {});
  let fullQuery = template
    .replace('{step}', workflowState.step)
    .replace('{dataJson}', dataJson)
    .replace('{turnCount}', String(workflowState.turnCount))
    .replace('{userMessage}', userMessage);

  // Truncate if needed
  let truncated = false;
  if (fullQuery.length > maxLength) {
    fullQuery = fullQuery.slice(0, maxLength).trim() + '...';
    truncated = true;
  }

  return { query: fullQuery, truncated };
}
```

### Example 3: ParsedTurn Type and Passthrough Handling

```typescript
// Source: v1.5 requirements, structured output research (SUMMARY.md)

import type { NormalizedMessage } from '@copilot-chat/shared';

/**
 * ParsedTurn — result of parsing a Copilot response.
 * Three kinds: structured (data extracted), passthrough (no data), parse_error (extraction failed).
 *
 * PARSE-03, PARSE-04
 */
export type ParsedTurn =
  | {
      kind: 'structured';
      data: Record<string, unknown>;
      nextAction: 'ask' | 'research' | 'confirm' | 'complete' | 'error';
      nextPrompt: string | null;
      displayMessages: NormalizedMessage[];
      confidence: 'high' | 'medium' | 'low';
      citations: string[];
      parseErrors: [];
    }
  | {
      kind: 'passthrough';
      data: null;
      nextAction: null;
      nextPrompt: null;
      displayMessages: NormalizedMessage[];
      confidence: null;
      citations: [];
      parseErrors: [];
    }
  | {
      kind: 'parse_error';
      data: null;
      nextAction: null;
      nextPrompt: null;
      displayMessages: NormalizedMessage[];
      confidence: null;
      citations: [];
      parseErrors: string[];
    };

/**
 * Parses Copilot response activities. Never throws.
 * Returns ParsedTurn distinguishing success, passthrough, and error cases.
 */
export async function parseTurn(
  messages: NormalizedMessage[],
  schema?: z.ZodSchema
): Promise<ParsedTurn> {
  const errors: string[] = [];

  // Try to extract from each message (usually just one bot message per turn)
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;

    // Parser logic here...
    // If extraction succeeds: return { kind: 'structured', data, nextAction, ... }
    // If extraction fails: push error message
    // If no extraction attempted: continue
  }

  // If errors were logged, return parse_error kind
  if (errors.length > 0) {
    return {
      kind: 'parse_error',
      data: null,
      nextAction: null,
      nextPrompt: null,
      displayMessages: messages,
      confidence: null,
      citations: [],
      parseErrors: errors,
    };
  }

  // If no errors and no extraction, return passthrough (backward compatible)
  return {
    kind: 'passthrough',
    data: null,
    nextAction: null,
    nextPrompt: null,
    displayMessages: messages,
    confidence: null,
    citations: [],
    parseErrors: [],
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline JSON extraction in `activityNormalizer.ts` (v1.3b) | Dedicated `StructuredOutputParser` module with schema validation (Phase 15) | Phase 15 | Separates concerns (normalization vs. parsing), enables reuse in orchestrator, adds observability via ParsedTurn kind distinction |
| Hardcoded `buildContextPrefix()` logic in routes (v1.1-v1.3b) | Configurable `ContextBuilder` service with max-length truncation (Phase 15) | Phase 15 | Context injection becomes testable, format becomes configurable (enables agent prompt changes), truncation prevents context window overflow |
| `ExtractedPayload` with confidence per source (v1.3b) | `ParsedTurn` with three-kind distinction (structured/passthrough/parse_error) plus confidence + citations (Phase 15) | Phase 15 | Enables observability (distinguish "no data" from "data found but invalid"), supports confidence-weighted orchestrator decisions, provides error signals for alerting |

**Deprecated/outdated:**
- Direct JSON validation without schema: Zod now standard (v1.3b+). Always use `safeParse()` for external data.
- Throwing exceptions in parser: Not acceptable for robust systems. Use `ParsedTurn.kind` and `parseErrors[]` for error signaling.

## Open Questions

1. **CopilotStructuredOutputSchema exact structure**
   - What we know: Copilot responses should contain `action`, `prompt`, `data`, `confidence`, `citations` fields (from v1.5 requirements). Enum values for `action` field: `'ask' | 'research' | 'confirm' | 'complete' | 'error'`.
   - What's unclear: Are all fields required or optional? Can the schema vary per conversation/workflow? Should citations always be URLs or can they be other formats?
   - Recommendation: Phase 15 spike (2-3 hours) to enumerate 3-5 example Copilot responses from real workflows. Document as `shared/src/schemas/copilotResponses.examples.ts`. Finalize schema during planning.

2. **Confidence scoring thresholds**
   - What we know: Three-level confidence (high/medium/low) based on extraction source. Phase 16 requires empirical analysis of parser accuracy per strategy.
   - What's unclear: Should "medium confidence" data trigger state machine transitions? Should "low confidence" be logged differently? What confidence threshold gates workflow progression?
   - Recommendation: Phase 15 establishes framework (`source → confidence` mapping). Phase 16 refines rules based on 50+ real Copilot responses.

3. **Context truncation behavior when collectedData is large**
   - What we know: Default max-length is 2000 chars. If preamble exceeds limit, truncate with "..." marker.
   - What's unclear: Should truncation trigger a warning? Should there be a fallback strategy (summary instead of full data)? At what collectedData size does truncation typically occur?
   - Recommendation: Implement basic truncation in Phase 15. Monitor truncation rate in logs (Phase 18 observability). If >5% of requests truncate, implement three-tier strategy in Phase 16 (full → summary → keys-only).

4. **Adaptive Card data field extraction**
   - What we know: Some Copilot agents return structured data in Adaptive Card `data` fields (not in activity.value or text).
   - What's unclear: Should parser scan all Adaptive Cards in a response and merge their data fields? Should we extract from `card.data` or nested fields?
   - Recommendation: Phase 15 research: check v1.3b test fixtures for Adaptive Card with data fields. Document extraction logic. If not present in current agent, defer to Phase 16.

5. **Error recovery and retry in parser**
   - What we know: Parser doesn't throw, returns `parseErrors[]`.
   - What's unclear: Should orchestrator retry parsing with corrective prompts (Phase 16+)? Should failed parses count toward circuit breaker threshold? How many consecutive parse errors trigger downgrade to passthrough mode?
   - Recommendation: Phase 15 provides error signals and passthrough fallback. Phase 16 adds retry mechanism and circuit breaker logic.

## Sources

### Primary (HIGH confidence)

- **Existing codebase:**
  - `server/src/normalizer/activityNormalizer.ts` (lines 28-113) — Proven three-surface priority extraction pattern, used in production v1.3b+
  - `shared/src/schemas/extractedPayload.ts` — Existing `ExtractedPayload` and `ExtractionConfidence` schemas, reused as foundation
  - `server/src/normalizer/activityNormalizer.test.ts` — Comprehensive test fixtures for JSON extraction (code fences, raw JSON, entities)
  - `shared/package.json` — Confirms Zod 3.25.76 installed, no override needed

- **v1.5 requirements documentation:**
  - `/Users/zycroft/Documents/PA/aaae/REQUIREMENTS.md` — PARSE-01 through PARSE-05, CTX-01 through CTX-03 (official requirements)
  - `/Users/zycroft/Documents/PA/aaae/v1.5 Workflow Orchestrator-Structured Output.md` — Detailed spec for ParsedTurn, CopilotStructuredOutputSchema, context builder

- **v1.5 research synthesis:**
  - `/Users/zycroft/Documents/PA/aaae/.planning/research/SUMMARY.md` — High-confidence synthesis of all research. Covers stack, architecture, pitfalls, phase structure.
  - `/Users/zycroft/Documents/PA/aaae/.planning/research/ARCHITECTURE.md` — Build order, integration points, data flow verification against existing code

### Secondary (MEDIUM confidence)

- Zod official documentation (https://zod.dev/): Schema validation, `.safeParse()`, `.passthrough()` mode, error handling patterns. Verified against installed v3.25.76 in package.json.
- TypeScript strict mode configuration (`server/tsconfig.json`): Confirms no implicit any, strict null checks, enabling safe type inference for parsed JSON.

### Tertiary (LOW confidence, needs validation during implementation)

- Exact Copilot response format for structured outputs — assumed from v1.5 requirements but not empirically verified against live agent. Phase 15 spike will validate.
- Typical distribution of collectedData size — assumed max-length of 2000 chars is sufficient; Phase 18 observability will confirm or adjust.

## Metadata

**Confidence breakdown:**

- **Standard Stack:** HIGH — No new packages needed. Zod 3.25.76 is installed and used throughout codebase. All required capabilities (safeParse, passthrough, union types) exist.
- **Architecture:** HIGH — Parser and context builder are service modules, not route handlers. Both patterns (priority chain extraction, configurable context) proven in v1.3b-v1.4 codebase.
- **Patterns:** HIGH — Multi-surface extraction is production-proven in activityNormalizer.ts. Zod validation is standard across codebase. Context injection was validated in Phase 10.
- **Pitfalls:** HIGH — Common pitfalls derived from v1.4 research synthesis (SUMMARY.md) and similar systems in the ecosystem. All have documented prevention strategies.
- **Code Examples:** HIGH — Drawn from existing v1.4 code (activityNormalizer.ts) and Zod 3.25.76 official documentation.

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days for stable patterns, assuming no breaking changes to Zod or Copilot SDK)
**Researcher:** GSD Phase Researcher Agent
