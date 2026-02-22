import { z } from 'zod';
import { NormalizedMessageSchema } from './message.js';
import { ExtractionConfidenceSchema } from './extractedPayload.js';

/**
 * NextAction — the set of workflow actions a Copilot structured response can signal.
 *
 * PARSE-05
 */
export const NextActionSchema = z.enum([
  'ask',
  'research',
  'confirm',
  'complete',
  'error',
]);
export type NextAction = z.infer<typeof NextActionSchema>;

/**
 * CopilotStructuredOutputSchema — validates structured JSON extracted from
 * Copilot response surfaces (activity.value, activity.entities, text JSON).
 *
 * Uses .passthrough() for forward compatibility: unknown fields from Copilot
 * are preserved without validation errors, enabling seamless upgrades when
 * the Copilot agent adds new response fields.
 *
 * PARSE-02, PARSE-05
 */
export const CopilotStructuredOutputSchema = z
  .object({
    /** Workflow action signal from Copilot */
    action: NextActionSchema.optional(),
    /** Follow-up prompt or question from Copilot */
    prompt: z.string().optional(),
    /** Arbitrary structured data payload */
    data: z.record(z.string(), z.unknown()).optional(),
    /** Copilot's self-reported confidence (0-1) */
    confidence: z.number().min(0).max(1).optional(),
    /** Citation URLs from Copilot response */
    citations: z.array(z.string()).optional(),
  })
  .passthrough();
export type CopilotStructuredOutput = z.infer<
  typeof CopilotStructuredOutputSchema
>;

/**
 * ParsedTurn — result of parsing a Copilot response turn.
 *
 * Discriminated union with three variants keyed on `kind`:
 * - structured: data extracted and validated successfully
 * - passthrough: no structured data found (backward-compatible text response)
 * - parse_error: extraction attempted but validation failed
 *
 * The parser NEVER throws — all outcomes are represented by these three kinds.
 *
 * PARSE-03, PARSE-05
 */

const ParsedTurnStructuredSchema = z.object({
  kind: z.literal('structured'),
  /** Validated structured data from Copilot response */
  data: z.record(z.string(), z.unknown()),
  /** Workflow action extracted from data.action */
  nextAction: NextActionSchema,
  /** Follow-up prompt extracted from data.prompt */
  nextPrompt: z.string().nullable(),
  /** Original display messages for the UI */
  displayMessages: z.array(NormalizedMessageSchema),
  /** Extraction confidence based on source surface */
  confidence: ExtractionConfidenceSchema,
  /** Citation URLs from structured output */
  citations: z.array(z.string()),
  /** Empty on success */
  parseErrors: z.array(z.string()).max(0),
});

const ParsedTurnPassthroughSchema = z.object({
  kind: z.literal('passthrough'),
  /** No data extracted */
  data: z.null(),
  /** No action determined */
  nextAction: z.null(),
  /** No prompt extracted */
  nextPrompt: z.null(),
  /** Original display messages for the UI */
  displayMessages: z.array(NormalizedMessageSchema),
  /** No confidence — no extraction attempted */
  confidence: z.null(),
  /** No citations */
  citations: z.array(z.string()).max(0),
  /** No errors — simply no data found */
  parseErrors: z.array(z.string()).max(0),
});

const ParsedTurnParseErrorSchema = z.object({
  kind: z.literal('parse_error'),
  /** No valid data on error */
  data: z.null(),
  /** No action on error */
  nextAction: z.null(),
  /** No prompt on error */
  nextPrompt: z.null(),
  /** Original display messages for the UI */
  displayMessages: z.array(NormalizedMessageSchema),
  /** No confidence on error */
  confidence: z.null(),
  /** No citations on error */
  citations: z.array(z.string()).max(0),
  /** Non-empty array of parse error descriptions */
  parseErrors: z.array(z.string()).min(1),
});

export const ParsedTurnSchema = z.discriminatedUnion('kind', [
  ParsedTurnStructuredSchema,
  ParsedTurnPassthroughSchema,
  ParsedTurnParseErrorSchema,
]);
export type ParsedTurn = z.infer<typeof ParsedTurnSchema>;
