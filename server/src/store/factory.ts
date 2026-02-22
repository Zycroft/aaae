import { Redis } from 'ioredis';
import { InMemoryConversationStore } from './InMemoryStore.js';
import { RedisConversationStore } from './RedisStore.js';
import { RedisWorkflowStateStore } from './RedisWorkflowStateStore.js';
import { InMemoryWorkflowStateStore } from './InMemoryWorkflowStateStore.js';
import {
  RedisConversationLock,
  InMemoryConversationLock,
} from '../lock/ConversationLock.js';
import type { ConversationStore } from './ConversationStore.js';
import type { WorkflowStateStore } from './WorkflowStateStore.js';
import type { ConversationLock } from '../lock/ConversationLock.js';
import { config } from '../config.js';

/** The ioredis client instance — null when using InMemoryStore */
let redisClient: Redis | null = null;

/**
 * createConversationStore — selects the active store backend from environment.
 *
 * Selection:
 *   REDIS_URL set   → RedisConversationStore (Azure Cache for Redis)
 *   REDIS_URL absent → InMemoryConversationStore (LRU, local dev / CI)
 *
 * Never both. Never silent fallback on Redis failure (returns 503).
 * Called once at module load time; result exported as singleton from store/index.ts.
 *
 * STORE-03, STORE-04, STORE-05
 */
export function createConversationStore(): ConversationStore {
  const redisUrl = config.REDIS_URL;

  if (redisUrl) {
    // Validate TLS scheme — Azure Cache for Redis requires rediss://
    const url = new URL(redisUrl);
    if (url.protocol !== 'rediss:') {
      console.error(
        `[STORE] FATAL: Invalid REDIS_URL scheme "${url.protocol}". Azure Cache requires rediss:// (TLS on port 6380).`
      );
      process.exit(1);
    }

    redisClient = new Redis(redisUrl, {
      commandTimeout: config.REDIS_TIMEOUT,
      connectTimeout: 10000, // 10 seconds for initial connection
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 10) {
          console.error(`[STORE] Redis reconnection failed after ${times} attempts. Giving up.`);
          return null; // Stop retrying
        }
        const delay = Math.min(times * 200, 2000); // 200ms, 400ms, 600ms... max 2s
        console.log(`[STORE] Redis reconnecting (attempt ${times}), delay ${delay}ms`);
        return delay;
      },
      reconnectOnError(err: Error) {
        // Reconnect on READONLY errors (Azure failover)
        return err.message.includes('READONLY');
      },
    });

    // Connection event logging
    redisClient.on('error', (err: Error) => console.error('[STORE] Redis error:', err.message));
    redisClient.on('connect', () => console.log('[STORE] Redis connected'));
    redisClient.on('ready', () => console.log('[STORE] Redis ready'));
    redisClient.on('close', () => console.warn('[STORE] Redis connection closed'));

    console.log(`[STORE] Redis detected. Initializing RedisConversationStore. TLS: ${url.protocol}`);
    return new RedisConversationStore(redisClient, config.REDIS_TTL);
  }

  console.log('[STORE] REDIS_URL not set. Using InMemoryConversationStore (local LRU).');
  return new InMemoryConversationStore();
}

/**
 * Get the ioredis client instance for health checks.
 * Returns null when using InMemoryStore (REDIS_URL not set).
 * RESIL-02
 */
export function getRedisClient(): Redis | null {
  return redisClient;
}

/**
 * createWorkflowStateStore — selects the active workflow state backend.
 *
 * Follows the same factory pattern as createConversationStore:
 *   REDIS_URL set   → RedisWorkflowStateStore (persistent, 24h sliding TTL)
 *   REDIS_URL absent → InMemoryWorkflowStateStore (LRU, local dev / CI)
 *
 * MUST be called AFTER createConversationStore (which initializes redisClient).
 *
 * ORCH-05
 */
export function createWorkflowStateStore(): WorkflowStateStore {
  if (redisClient) {
    console.log('[STORE] Redis detected. Using RedisWorkflowStateStore.');
    return new RedisWorkflowStateStore(redisClient, config.REDIS_TTL);
  }

  console.log('[STORE] Using InMemoryWorkflowStateStore (local LRU).');
  return new InMemoryWorkflowStateStore();
}

/**
 * createConversationLock — selects the active lock backend.
 *
 *   REDIS_URL set   → RedisConversationLock (distributed, SET NX PX)
 *   REDIS_URL absent → InMemoryConversationLock (process-local Set)
 *
 * MUST be called AFTER createConversationStore (which initializes redisClient).
 *
 * ORCH-07
 */
export function createConversationLock(): ConversationLock {
  if (redisClient) {
    console.log('[LOCK] Redis detected. Using RedisConversationLock.');
    return new RedisConversationLock(redisClient);
  }

  console.log('[LOCK] Using InMemoryConversationLock.');
  return new InMemoryConversationLock();
}
