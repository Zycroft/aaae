import { createConversationStore, getRedisClient } from './factory.js';
import { InMemoryWorkflowStateStore } from './InMemoryWorkflowStateStore.js';

export type { ConversationStore, StoredConversation } from './ConversationStore.js';
export { InMemoryConversationStore } from './InMemoryStore.js';
export { RedisConversationStore } from './RedisStore.js';
export { createConversationStore, getRedisClient } from './factory.js';

export type { WorkflowStateStore } from './WorkflowStateStore.js';
export { InMemoryWorkflowStateStore } from './InMemoryWorkflowStateStore.js';

/**
 * Singleton conversation store — backend selected by factory at module load.
 * REDIS_URL absent → InMemoryConversationStore
 * REDIS_URL set    → RedisConversationStore (full ioredis implementation)
 *
 * STORE-03
 */
export const conversationStore = createConversationStore();

/** Singleton workflow state store — in-memory only (no Redis backing needed for v1.4) */
export const workflowStateStore = new InMemoryWorkflowStateStore();
