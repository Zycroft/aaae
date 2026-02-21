import { z } from 'zod';

/**
 * ExtractionConfidence — how reliably the structured data was extracted.
 *
 * - high: from activity.value (structured field, SDK-provided)
 * - medium: from activity.entities (entity array, some noise)
 * - low: parsed from bot text via regex/JSON.parse fallback
 *
 * SOUT-04
 */
export const ExtractionConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type ExtractionConfidence = z.infer<typeof ExtractionConfidenceSchema>;

/**
 * ExtractedPayload — structured data extracted from a Copilot activity surface.
 *
 * The normalizer populates this when it finds parseable structured data on an
 * activity's value, entities, or text fields. The `data` record must contain at
 * least one key to prevent phantom extractions.
 *
 * SOUT-04
 */
export const ExtractedPayloadSchema = z.object({
  /** Where the data came from on the Activity */
  source: z.enum(['value', 'entities', 'text']),
  /** Confidence in the extraction: high (activity.value), medium (entities), low (text parse) */
  confidence: ExtractionConfidenceSchema,
  /** The extracted structured data — Record type, requires at least one key */
  data: z.record(z.string(), z.unknown()).refine(
    (d) => Object.keys(d).length > 0,
    { message: 'ExtractedPayload.data must contain at least one field' }
  ),
});

export type ExtractedPayload = z.infer<typeof ExtractedPayloadSchema>;
