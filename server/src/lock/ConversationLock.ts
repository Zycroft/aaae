import { v4 as uuidv4 } from 'uuid';
import type { Redis } from 'ioredis';

/**
 * ConversationLock — per-conversation mutex interface.
 *
 * Ensures only one request can process a given conversationId at a time.
 * acquire() returns a release function that MUST be called in a finally block.
 *
 * ORCH-07
 */
export interface ConversationLock {
  acquire(conversationId: string): Promise<() => Promise<void>>;
}

/**
 * Error thrown when a lock cannot be acquired because another request
 * is already processing the same conversation.
 */
export class ConversationLockError extends Error {
  public readonly conversationId: string;

  constructor(conversationId: string) {
    super(
      `Lock contention: conversation ${conversationId} is being processed by another request`
    );
    this.name = 'ConversationLockError';
    this.conversationId = conversationId;
  }
}

/** Redis key prefix for conversation locks */
const LOCK_PREFIX = 'lock:conv:';

/** Default lock TTL in milliseconds (10 seconds — 2x conservative Copilot P99 latency) */
const DEFAULT_LOCK_TTL_MS = 10000;

/**
 * Lua script for safe lock release.
 * Atomically checks the token matches before deleting — prevents releasing
 * a lock acquired by another request after the original lock expired.
 */
const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * RedisConversationLock — Redis-based per-conversation lock using SET NX PX.
 *
 * - Acquires: SET lockKey token NX PX ttl (atomic, no race)
 * - Releases: Lua script checks token before DEL (safe against expired locks)
 * - Orphan protection: PX TTL auto-expires forgotten locks
 *
 * ORCH-07
 */
export class RedisConversationLock implements ConversationLock {
  private readonly redis: Redis;
  private readonly lockTtlMs: number;

  constructor(redis: Redis, lockTtlMs: number = DEFAULT_LOCK_TTL_MS) {
    this.redis = redis;
    this.lockTtlMs = lockTtlMs;
  }

  async acquire(conversationId: string): Promise<() => Promise<void>> {
    const token = uuidv4();
    const key = `${LOCK_PREFIX}${conversationId}`;

    // SET key value PX ttl NX — only sets if key doesn't exist, auto-expires after TTL
    const result = await this.redis.set(key, token, 'PX', this.lockTtlMs, 'NX');

    if (result !== 'OK') {
      throw new ConversationLockError(conversationId);
    }

    // Return release function — caller MUST call in finally block
    return async () => {
      const released = await this.redis.eval(RELEASE_LUA, 1, key, token);
      if (released === 0) {
        console.warn(
          `[lock] Token mismatch on release for ${conversationId} — lock may have expired`
        );
      }
    };
  }
}

/**
 * InMemoryConversationLock — in-memory lock for local dev and CI.
 *
 * Uses a Set<string> of held conversationIds. Not distributed — only
 * works within a single Node.js process.
 */
export class InMemoryConversationLock implements ConversationLock {
  private readonly held = new Set<string>();

  async acquire(conversationId: string): Promise<() => Promise<void>> {
    if (this.held.has(conversationId)) {
      throw new ConversationLockError(conversationId);
    }

    this.held.add(conversationId);

    return async () => {
      this.held.delete(conversationId);
    };
  }
}
