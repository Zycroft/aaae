import { z } from 'zod';

/**
 * WorkflowContext — optional context injection payload for multi-turn workflows.
 *
 * Sent alongside the user message to provide the Copilot agent with current
 * workflow state: which step we're on, any constraints, and data collected so far.
 *
 * CTX-01
 */
export const WorkflowContextSchema = z.object({
  /** Current workflow step identifier (required) */
  step: z.string().min(1),
  /** Optional list of constraint strings for the current step */
  constraints: z.array(z.string()).optional(),
  /** Optional key-value bag of data collected during the workflow */
  collectedData: z.record(z.string(), z.unknown()).optional(),
});

export type WorkflowContext = z.infer<typeof WorkflowContextSchema>;
