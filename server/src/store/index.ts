import { InMemoryConversationStore } from './InMemoryStore.js';
import { InMemoryWorkflowStateStore } from './InMemoryWorkflowStateStore.js';
import type { ConversationStore } from './ConversationStore.js';
import type { WorkflowStateStore } from './WorkflowStateStore.js';

export type { ConversationStore, StoredConversation } from './ConversationStore.js';
export { InMemoryConversationStore } from './InMemoryStore.js';

export type { WorkflowStateStore } from './WorkflowStateStore.js';
export { InMemoryWorkflowStateStore } from './InMemoryWorkflowStateStore.js';

// Module-level singletons — production replacement is a drop-in (implement interface, swap here)
export const conversationStore: ConversationStore = new InMemoryConversationStore();
export const workflowStateStore: WorkflowStateStore = new InMemoryWorkflowStateStore();
