import type { WorkflowState } from '@copilot-chat/shared';

/**
 * WorkflowStateStore — persistence interface for workflow state.
 *
 * Follows the same pattern as ConversationStore. Keyed by conversationId.
 *
 * ORCH-02
 */
export interface WorkflowStateStore {
  get(conversationId: string): Promise<WorkflowState | undefined>;
  set(conversationId: string, state: WorkflowState): Promise<void>;
  delete(conversationId: string): Promise<void>;
}
