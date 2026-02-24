import { WorkflowOrchestrator } from './WorkflowOrchestrator.js';
import { workflowStateStore, conversationStore, conversationLock } from '../store/index.js';
import { copilotClient } from '../copilot.js';
import { CopilotProvider } from '../provider/CopilotProvider.js';
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
 * CopilotProvider wraps the existing CopilotStudioClient behind the LlmProvider
 * interface. The orchestrator receives it as a generic LlmProvider.
 *
 * PROV-03
 */
const copilotProvider = new CopilotProvider(copilotClient);

/**
 * Singleton WorkflowOrchestrator — pre-wired with store, lock, and LLM provider.
 *
 * Consumed by route handlers in Phase 17.
 * Uses default workflow definition; can be reconfigured via constructor if needed.
 *
 * ORCH-02, PROV-03
 */
export const orchestrator = new WorkflowOrchestrator({
  workflowStore: workflowStateStore,
  conversationStore,
  llmProvider: copilotProvider,
  lock: conversationLock,
  config: {
    workflowDefinition: DEFAULT_WORKFLOW_DEFINITION,
  },
});
