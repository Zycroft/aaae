import { createConversationStore, createWorkflowStateStore, createConversationLock, getRedisClient } from './factory.js';

export type { ConversationStore, StoredConversation } from './ConversationStore.js';
export { InMemoryConversationStore } from './InMemoryStore.js';
export { RedisConversationStore } from './RedisStore.js';
export { createConversationStore, createWorkflowStateStore, createConversationLock, getRedisClient } from './factory.js';

export type { WorkflowStateStore } from './WorkflowStateStore.js';
export { InMemoryWorkflowStateStore } from './InMemoryWorkflowStateStore.js';
export { RedisWorkflowStateStore } from './RedisWorkflowStateStore.js';

export type { ConversationLock } from '../lock/ConversationLock.js';
export { ConversationLockError } from '../lock/ConversationLock.js';

/**
 * Singleton conversation store — backend selected by factory at module load.
 * REDIS_URL absent → InMemoryConversationStore
 * REDIS_URL set    → RedisConversationStore (full ioredis implementation)
 *
 * STORE-03
 */
export const conversationStore = createConversationStore();

/**
 * Singleton workflow state store — backend selected by factory.
 * REDIS_URL absent → InMemoryWorkflowStateStore (LRU)
 * REDIS_URL set    → RedisWorkflowStateStore (persistent, 24h sliding TTL)
 *
 * ORCH-05
 */
export const workflowStateStore = createWorkflowStateStore();

/**
 * Singleton conversation lock — backend selected by factory.
 * REDIS_URL absent → InMemoryConversationLock (process-local Set)
 * REDIS_URL set    → RedisConversationLock (Redis SET NX PX)
 *
 * ORCH-07
 */
export const conversationLock = createConversationLock();
