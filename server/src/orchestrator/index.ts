import { WorkflowOrchestrator } from './WorkflowOrchestrator.js';
import { workflowStateStore, conversationStore, conversationLock } from '../store/index.js';
import { copilotClient } from '../copilot.js';
import { DEFAULT_WORKFLOW_DEFINITION } from '../workflow/workflowDefinition.js';

export { WorkflowOrchestrator } from './WorkflowOrchestrator.js';
export type {
  WorkflowResponse,
  ProcessTurnParams,
  ProcessCardActionParams,
  OrchestratorConfig,
  TurnMeta,
} from './types.js';
export type { WorkflowProgress } from '../workflow/workflowDefinition.js';

/**
 * Singleton WorkflowOrchestrator — pre-wired with store, lock, and Copilot client.
 *
 * Consumed by route handlers in Phase 17.
 * Uses default workflow definition; can be reconfigured via constructor if needed.
 *
 * ORCH-02
 */
export const orchestrator = new WorkflowOrchestrator({
  workflowStore: workflowStateStore,
  conversationStore,
  copilotClient,
  lock: conversationLock,
  config: {
    workflowDefinition: DEFAULT_WORKFLOW_DEFINITION,
  },
});
