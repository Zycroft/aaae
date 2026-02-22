import { z } from 'zod';

/**
 * WorkflowState — server-side state container for multi-turn workflow progress.
 *
 * Tracks the current workflow step, accumulated data, last agent recommendation,
 * and turn count. Managed by the orchestrate endpoint; re-injected via
 * WorkflowContext on each turn.
 *
 * ORCH-01
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
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
