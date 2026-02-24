import { WorkflowOrchestrator } from './WorkflowOrchestrator.js';
import { workflowStateStore, conversationStore, conversationLock } from '../store/index.js';
import { createProvider } from '../provider/providerFactory.js';
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
 * Module-level orchestrator singleton. Initialized asynchronously by initOrchestrator().
 * Routes access it via getOrchestrator().
 */
let orchestrator: WorkflowOrchestrator | null = null;

/**
 * Initialize the orchestrator with the config-driven LLM provider.
 *
 * Must be called once at server startup (before any route handlers execute).
 * Uses the provider factory to dynamically load only the selected provider's SDK.
 *
 * PROV-04
 */
export async function initOrchestrator(): Promise<void> {
  const provider = await createProvider();
  orchestrator = new WorkflowOrchestrator({
    workflowStore: workflowStateStore,
    conversationStore,
    llmProvider: provider,
    lock: conversationLock,
    config: {
      workflowDefinition: DEFAULT_WORKFLOW_DEFINITION,
    },
  });
  console.log('[orchestrator] Initialized with provider');
}

/**
 * Get the initialized orchestrator singleton.
 *
 * Throws if called before initOrchestrator() completes.
 * Route handlers call this at request time (not module scope).
 */
export function getOrchestrator(): WorkflowOrchestrator {
  if (!orchestrator) {
    throw new Error('Orchestrator not initialized — call initOrchestrator() first');
  }
  return orchestrator;
}
