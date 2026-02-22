import { Redis } from 'ioredis';
import { StoredConversationSchema } from '@copilot-chat/shared';
import type { ConversationStore, StoredConversation } from './ConversationStore.js';

/** Redis key prefix for conversation records */
const CONV_PREFIX = 'conv:';

/** Redis key prefix for user sorted-set index */
const USER_PREFIX = 'user:';

/** Suffix for user conversation index keys */
const USER_SUFFIX = ':conversations';

/**
 * Serialize StoredConversation to JSON string for Redis storage.
 * Excludes sdkConversationRef — it holds a live SDK object that is not JSON-serializable.
 * The SDK reference is reconstructed in memory when the conversation is resumed.
 */
function serialize(conversation: StoredConversation): string {
  const { sdkConversationRef, ...serializable } = conversation;
  return JSON.stringify(serializable);
}

/**
 * Deserialize JSON string to StoredConversation.
 * Validates with Zod schema to catch schema drift and apply defaults for missing fields.
 * sdkConversationRef will be undefined after deserialization (z.unknown() accepts undefined).
 */
function deserialize(json: string): StoredConversation {
  const raw = JSON.parse(json);
  return StoredConversationSchema.parse(raw);
}

/**
 * RedisConversationStore — Redis-backed persistent store.
 *
 * Uses ioredis with TLS (rediss://), per-key TTL, operation timeouts,
 * sorted-set secondary index for user-scoped queries, and hard-fail behavior.
 *
 * STORE-05, STORE-06, STORE-07, QUERY-02, QUERY-03, RESIL-01, RESIL-03
 */
export class RedisConversationStore implements ConversationStore {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;

  /**
   * @param redis — Pre-configured ioredis client instance (created by factory)
   * @param ttlSeconds — TTL for conversation keys in seconds (default from config)
   */
  constructor(redis: Redis, ttlSeconds: number) {
    this.redis = redis;
    this.ttlSeconds = ttlSeconds;
  }

  async get(id: string): Promise<StoredConversation | undefined> {
    const json = await this.redis.get(`${CONV_PREFIX}${id}`);
    if (!json) return undefined;
    return deserialize(json);
  }

  async set(id: string, conversation: StoredConversation): Promise<void> {
    const key = `${CONV_PREFIX}${id}`;
    const userKey = `${USER_PREFIX}${conversation.userId}${USER_SUFFIX}`;
    const score = new Date(conversation.updatedAt).getTime();

    // Pipeline for atomic set + zadd + expire
    const pipeline = this.redis.pipeline();
    pipeline.set(key, serialize(conversation), 'EX', this.ttlSeconds);
    pipeline.zadd(userKey, score.toString(), id);
    // User index TTL = conversation TTL + 1 hour buffer to avoid orphaned index entries
    pipeline.expire(userKey, this.ttlSeconds + 3600);

    const results = await pipeline.exec();

    // Check for pipeline errors
    if (results) {
      for (const [err] of results) {
        if (err) throw err;
      }
    }
  }

  async delete(id: string): Promise<void> {
    // Read conversation first to get userId for index cleanup
    const json = await this.redis.get(`${CONV_PREFIX}${id}`);
    if (json) {
      const conversation = deserialize(json);
      const userKey = `${USER_PREFIX}${conversation.userId}${USER_SUFFIX}`;

      const pipeline = this.redis.pipeline();
      pipeline.del(`${CONV_PREFIX}${id}`);
      pipeline.zrem(userKey, id);
      await pipeline.exec();
    } else {
      // Key already gone, just attempt del
      await this.redis.del(`${CONV_PREFIX}${id}`);
    }
  }

  /**
   * List conversations for a user sorted most-recent-first by updatedAt.
   * Returns up to 50 conversations. Filters out IDs whose keys have expired.
   * QUERY-02, QUERY-03
   */
  async listByUser(userId: string): Promise<StoredConversation[]> {
    const userKey = `${USER_PREFIX}${userId}${USER_SUFFIX}`;

    // Get top 50 conversation IDs by score (updatedAt epoch ms), descending
    const ids = await this.redis.zrevrangebyscore(
      userKey, '+inf', '-inf', 'LIMIT', 0, 50
    );
    if (ids.length === 0) return [];

    // Multi-get all conversations via pipeline
    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.get(`${CONV_PREFIX}${id}`);
    }
    const results = await pipeline.exec();

    if (!results) return [];

    return results
      .map(([err, json]: [Error | null, unknown]) => {
        if (err || !json) return null;
        try {
          return deserialize(json as string);
        } catch {
          return null; // Skip conversations that fail Zod validation
        }
      })
      .filter((c: StoredConversation | null): c is StoredConversation => c !== null);
  }
}
