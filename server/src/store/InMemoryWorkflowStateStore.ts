import { LRUCache } from 'lru-cache';
import type { WorkflowState } from '@copilot-chat/shared';
import type { WorkflowStateStore } from './WorkflowStateStore.js';

/** Maximum number of active workflow states in memory. LRU evicts oldest when exceeded. */
const MAX_WORKFLOW_STATES = 100;

export class InMemoryWorkflowStateStore implements WorkflowStateStore {
  private cache = new LRUCache<string, WorkflowState>({ max: MAX_WORKFLOW_STATES });

  async get(conversationId: string): Promise<WorkflowState | undefined> {
    return this.cache.get(conversationId);
  }

  async set(conversationId: string, state: WorkflowState): Promise<void> {
    this.cache.set(conversationId, state);
  }

  async delete(conversationId: string): Promise<void> {
    this.cache.delete(conversationId);
  }
}
