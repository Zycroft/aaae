import { Redis } from 'ioredis';
import { WorkflowStateSchema } from '@copilot-chat/shared';
import type { WorkflowState } from '@copilot-chat/shared';
import type { WorkflowStateStore } from './WorkflowStateStore.js';

/** Redis key prefix for workflow state records */
const WF_PREFIX = 'wf:';

/**
 * RedisWorkflowStateStore — Redis-backed persistent store for workflow state.
 *
 * Uses ioredis with per-key TTL and sliding window expiration:
 * every set() call resets the TTL to the configured value (24h default).
 * Actively-used workflows never expire.
 *
 * Follows the same pattern as RedisConversationStore.
 *
 * ORCH-05
 */
export class RedisWorkflowStateStore implements WorkflowStateStore {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;

  /**
   * @param redis — Pre-configured ioredis client instance (created by factory)
   * @param ttlSeconds — TTL for workflow state keys in seconds (default from config)
   */
  constructor(redis: Redis, ttlSeconds: number) {
    this.redis = redis;
    this.ttlSeconds = ttlSeconds;
  }

  async get(conversationId: string): Promise<WorkflowState | undefined> {
    const json = await this.redis.get(`${WF_PREFIX}${conversationId}`);
    if (!json) return undefined;
    return WorkflowStateSchema.parse(JSON.parse(json));
  }

  async set(conversationId: string, state: WorkflowState): Promise<void> {
    // EX resets TTL on every write — sliding window per user decision
    await this.redis.set(
      `${WF_PREFIX}${conversationId}`,
      JSON.stringify(state),
      'EX',
      this.ttlSeconds
    );
  }

  async delete(conversationId: string): Promise<void> {
    await this.redis.del(`${WF_PREFIX}${conversationId}`);
  }
}
