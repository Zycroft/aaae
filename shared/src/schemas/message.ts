import { z } from 'zod';
import { ExtractedPayloadSchema } from './extractedPayload.js';

/**
 * NormalizedMessage — the shared shape for all messages in the chat transcript.
 * Used by both client (rendering) and server (response building).
 *
 * SCHEMA-01
 */
export const NormalizedMessageSchema = z.object({
  /** UUID — uniquely identifies this message in the transcript */
  id: z.string().uuid(),
  /** Who sent this message */
  role: z.enum(['user', 'assistant']),
  /** What kind of content this message carries */
  kind: z.enum(['text', 'adaptiveCard']),
  /** Present when kind = "text" */
  text: z.string().optional(),
  /** Full Adaptive Card JSON — present when kind = "adaptiveCard" */
  cardJson: z.record(z.string(), z.unknown()).optional(),
  /** Server-assigned card identifier used for action routing — present when kind = "adaptiveCard" */
  cardId: z.string().optional(),
  /** Structured data extracted from Copilot activity — present when the normalizer found parseable JSON (SOUT-04, SOUT-05) */
  extractedPayload: ExtractedPayloadSchema.optional(),
});

/** TypeScript type inferred from NormalizedMessageSchema (SCHEMA-04) */
export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>;
