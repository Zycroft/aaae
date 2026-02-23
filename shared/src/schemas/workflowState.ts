import { z } from 'zod';

/**
 * WorkflowState — server-side state container for multi-turn workflow progress.
 *
 * Tracks the current workflow step, accumulated data, last agent recommendation,
 * and turn count. Managed by the orchestrate endpoint; re-injected via
 * WorkflowContext on each turn.
 *
 * v1.6 UX fields (progress, suggestedInputType, choices) provide client-side
 * hints for dynamic step-driven UI rendering. All v1.6 fields are optional/
 * nullable for backward compatibility (SCHEMA-03).
 *
 * ORCH-01, SCHEMA-01
 */
export const WorkflowStateSchema = z.object({
  /** Current workflow step identifier (required) */
  step: z.string().min(1),
  /** Optional key-value bag of data collected during the workflow */
  collectedData: z.record(z.string(), z.unknown()).optional(),
  /** Last recommendation extracted from agent response */
  lastRecommendation: z.string().optional(),
  /** Number of orchestrate calls for this conversation (non-negative integer) */
  turnCount: z.number().int().nonnegative(),
  /** Workflow lifecycle status — default 'active' for backward compatibility (ORCH-01) */
  status: z.enum(['active', 'completed', 'error']).default('active'),
  /** Maps to the step from WorkflowDefinition — used for progress tracking */
  currentPhase: z.string().optional(),
  /** User identifier — scoping field for ORCH-01 */
  userId: z.string().optional(),
  /** Tenant identifier — scoping field for ORCH-01 */
  tenantId: z.string().optional(),
  /** Workflow progress as 0-1 float (null = indeterminate/pulsing). SCHEMA-01 */
  progress: z.number().min(0).max(1).nullable().optional(),
  /** Hints the client about the preferred input mode for this step. SCHEMA-01 */
  suggestedInputType: z.enum(['text', 'choice', 'confirmation', 'none']).optional(),
  /** Available choices when suggestedInputType is 'choice'. SCHEMA-01 */
  choices: z.array(z.string()).optional(),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
