import {
  CopilotStructuredOutputSchema,
  type ParsedTurn,
  type NormalizedMessage,
  type NextAction,
  type ExtractionConfidence,
} from '@copilot-chat/shared';
import type { ZodSchema } from 'zod';

/**
 * Parses a Copilot response turn by validating extracted structured payload
 * against CopilotStructuredOutputSchema (or a custom schema).
 *
 * Operates on NormalizedMessage[] (already processed by activityNormalizer),
 * reusing the extractedPayload field rather than re-extracting from raw Activity.
 *
 * NEVER throws — all error paths return ParsedTurn variants.
 *
 * Three outcomes:
 * - structured: data extracted and validated successfully
 * - passthrough: no structured data found in any assistant message
 * - parse_error: extraction attempted but validation failed
 *
 * PARSE-01, PARSE-02, PARSE-03, PARSE-04
 *
 * @param messages - Normalized messages from Copilot response
 * @param schema - Optional Zod schema for validation (defaults to CopilotStructuredOutputSchema)
 * @returns ParsedTurn discriminated union result
 */
export async function parseTurn(
  messages: NormalizedMessage[],
  schema: ZodSchema = CopilotStructuredOutputSchema
): Promise<ParsedTurn> {
  try {
    for (const msg of messages) {
      // Only parse assistant messages — user messages are passed through
      if (msg.role !== 'assistant') continue;

      // Skip messages without extracted payload
      if (!msg.extractedPayload) continue;

      // Validate extracted data against schema using safeParse (never throws)
      const result = schema.safeParse(msg.extractedPayload.data);

      if (result.success) {
        const parsed = result.data as Record<string, unknown>;

        // Extract nextAction — cast if valid, null if absent
        const actionValue = parsed['action'];
        const nextAction: NextAction | null =
          typeof actionValue === 'string' ? (actionValue as NextAction) : null;

        // Extract nextPrompt — string or null
        const nextPrompt: string | null =
          typeof parsed['prompt'] === 'string'
            ? (parsed['prompt'] as string)
            : null;

        // Extract citations — string array or empty
        const citations: string[] = Array.isArray(parsed['citations'])
          ? (parsed['citations'] as string[])
          : [];

        return {
          kind: 'structured',
          data: parsed,
          nextAction: nextAction as ParsedTurn extends { kind: 'structured' }
            ? ParsedTurn['nextAction']
            : never,
          nextPrompt,
          displayMessages: messages,
          confidence:
            msg.extractedPayload.confidence as ExtractionConfidence,
          citations,
          parseErrors: [] as string[] as [],
        } as ParsedTurn;
      } else {
        // Schema validation failed — return parse_error with details
        return {
          kind: 'parse_error',
          data: null,
          nextAction: null,
          nextPrompt: null,
          displayMessages: messages,
          confidence: null,
          citations: [] as string[],
          parseErrors: [result.error.message],
        } as ParsedTurn;
      }
    }

    // No assistant message with extractedPayload found — passthrough
    return {
      kind: 'passthrough',
      data: null,
      nextAction: null,
      nextPrompt: null,
      displayMessages: messages,
      confidence: null,
      citations: [] as string[],
      parseErrors: [] as string[],
    } as ParsedTurn;
  } catch (err) {
    // Catch-all: any unexpected exception becomes parse_error
    return {
      kind: 'parse_error',
      data: null,
      nextAction: null,
      nextPrompt: null,
      displayMessages: messages,
      confidence: null,
      citations: [] as string[],
      parseErrors: [err instanceof Error ? err.message : String(err)],
    } as ParsedTurn;
  }
}
