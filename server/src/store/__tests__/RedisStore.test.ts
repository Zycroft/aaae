import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import { RedisConversationStore } from '../RedisStore.js';
import type { StoredConversation } from '@copilot-chat/shared';

/**
 * RedisConversationStore unit tests using ioredis-mock.
 * No external Redis server required — runs entirely in-memory.
 */

// Fixed UUIDs for deterministic tests
const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';
const UUID_3 = '33333333-3333-4333-8333-333333333333';
const UUID_4 = '44444444-4444-4444-8444-444444444444';
const UUID_5 = '55555555-5555-4555-8555-555555555555';

function makeConversation(overrides: Partial<StoredConversation> = {}): StoredConversation {
  return {
    externalId: UUID_1,
    sdkConversationRef: { fake: 'sdk-object' },
    history: [],
    userId: 'user-alice',
    tenantId: 'tenant-1',
    createdAt: '2026-02-22T10:00:00.000Z',
    updatedAt: '2026-02-22T10:00:00.000Z',
    status: 'active' as const,
    ...overrides,
  };
}

describe('RedisConversationStore', () => {
  let redis: InstanceType<typeof RedisMock>;
  let store: RedisConversationStore;
  const TTL = 86400; // 24 hours

  beforeEach(async () => {
    redis = new RedisMock();
    // ioredis-mock instances share a global data store — flush between tests
    await redis.flushall();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store = new RedisConversationStore(redis as any, TTL);
  });

  describe('get()', () => {
    it('returns undefined for non-existent key', async () => {
      const result = await store.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('retrieves a stored conversation', async () => {
      const conv = makeConversation();
      await store.set('conv-1', conv);
      const result = await store.get('conv-1');
      expect(result).toBeDefined();
      expect(result!.externalId).toBe(UUID_1);
      expect(result!.userId).toBe('user-alice');
      expect(result!.status).toBe('active');
    });

    it('deserializes with Zod validation (applies defaults for missing fields)', async () => {
      // Manually store JSON missing optional fields to verify Zod handles it
      const minimal = {
        externalId: UUID_2,
        history: [],
        userId: 'user-bob',
        tenantId: 'tenant-2',
        createdAt: '2026-02-22T12:00:00.000Z',
        updatedAt: '2026-02-22T12:00:00.000Z',
        status: 'active',
      };
      await redis.set('conv:minimal-1', JSON.stringify(minimal), 'EX', TTL);
      const result = await store.get('minimal-1');
      expect(result).toBeDefined();
      expect(result!.externalId).toBe(UUID_2);
      // workflowId, currentStep, stepData, metadata should be undefined (optional)
      expect(result!.workflowId).toBeUndefined();
    });
  });

  describe('set()', () => {
    it('stores conversation and is retrievable', async () => {
      const conv = makeConversation({ externalId: UUID_2 });
      await store.set('set-1', conv);
      const result = await store.get('set-1');
      expect(result).toBeDefined();
      expect(result!.externalId).toBe(UUID_2);
    });

    it('excludes sdkConversationRef from stored JSON', async () => {
      const conv = makeConversation({ sdkConversationRef: { complexObj: true } });
      await store.set('sdk-test', conv);
      const raw = await redis.get('conv:sdk-test');
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw!);
      expect(parsed.sdkConversationRef).toBeUndefined();
    });

    it('updates sorted-set user index with updatedAt score', async () => {
      const conv = makeConversation({
        userId: 'user-index-test',
        updatedAt: '2026-02-22T15:00:00.000Z',
      });
      await store.set('idx-1', conv);

      // Verify the sorted set has the entry
      const members = await redis.zrevrangebyscore(
        'user:user-index-test:conversations',
        '+inf', '-inf'
      );
      expect(members).toContain('idx-1');
    });

    it('overwrites existing conversation (TTL resets)', async () => {
      const conv1 = makeConversation({ status: 'active' as const });
      await store.set('overwrite-1', conv1);

      const conv2 = makeConversation({ status: 'completed' as const, updatedAt: '2026-02-22T16:00:00.000Z' });
      await store.set('overwrite-1', conv2);

      const result = await store.get('overwrite-1');
      expect(result!.status).toBe('completed');
    });
  });

  describe('delete()', () => {
    it('removes conversation key', async () => {
      const conv = makeConversation();
      await store.set('del-1', conv);
      await store.delete('del-1');
      const result = await store.get('del-1');
      expect(result).toBeUndefined();
    });

    it('removes entry from user sorted-set index', async () => {
      const conv = makeConversation({ userId: 'user-del-test' });
      await store.set('del-idx-1', conv);
      await store.delete('del-idx-1');

      const members = await redis.zrevrangebyscore(
        'user:user-del-test:conversations',
        '+inf', '-inf'
      );
      expect(members).not.toContain('del-idx-1');
    });

    it('does not throw when deleting non-existent key', async () => {
      await expect(store.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('listByUser()', () => {
    it('returns empty array for user with no conversations', async () => {
      const result = await store.listByUser('no-such-user');
      expect(result).toEqual([]);
    });

    it('returns conversations sorted most-recent-first', async () => {
      const conv1 = makeConversation({
        externalId: UUID_3,
        userId: 'user-sort',
        updatedAt: '2026-02-22T10:00:00.000Z',
      });
      const conv2 = makeConversation({
        externalId: UUID_4,
        userId: 'user-sort',
        updatedAt: '2026-02-22T12:00:00.000Z',
      });
      const conv3 = makeConversation({
        externalId: UUID_5,
        userId: 'user-sort',
        updatedAt: '2026-02-22T14:00:00.000Z',
      });

      await store.set('sort-1', conv1);
      await store.set('sort-2', conv2);
      await store.set('sort-3', conv3);

      const result = await store.listByUser('user-sort');
      expect(result).toHaveLength(3);
      expect(result[0].externalId).toBe(UUID_5);
      expect(result[1].externalId).toBe(UUID_4);
      expect(result[2].externalId).toBe(UUID_3);
    });

    it('returns only conversations for the specified user', async () => {
      const alice = makeConversation({ externalId: UUID_2, userId: 'user-alice' });
      const bob = makeConversation({ externalId: UUID_3, userId: 'user-bob' });

      await store.set('alice-1', alice);
      await store.set('bob-1', bob);

      const aliceResult = await store.listByUser('user-alice');
      expect(aliceResult).toHaveLength(1);
      expect(aliceResult[0].externalId).toBe(UUID_2);

      const bobResult = await store.listByUser('user-bob');
      expect(bobResult).toHaveLength(1);
      expect(bobResult[0].externalId).toBe(UUID_3);
    });

    it('filters out expired conversation keys gracefully', async () => {
      const conv = makeConversation({ userId: 'user-expire' });
      await store.set('expire-1', conv);

      // Manually delete the conversation key but leave the sorted-set entry
      // (simulates TTL expiry where sorted-set entry orphans)
      await redis.del('conv:expire-1');

      const result = await store.listByUser('user-expire');
      // Should return empty — the ID is in the sorted set but the key is gone
      expect(result).toHaveLength(0);
    });
  });
});
