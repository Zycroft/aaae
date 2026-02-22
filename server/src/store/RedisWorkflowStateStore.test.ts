import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import { RedisWorkflowStateStore } from './RedisWorkflowStateStore.js';
import type { WorkflowState } from '@copilot-chat/shared';

/**
 * RedisWorkflowStateStore unit tests using ioredis-mock.
 * No external Redis server required — runs entirely in-memory.
 *
 * ORCH-05
 */

function makeWorkflowState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    step: 'initial',
    collectedData: {},
    turnCount: 0,
    ...overrides,
  };
}

describe('RedisWorkflowStateStore', () => {
  let redis: InstanceType<typeof RedisMock>;
  let store: RedisWorkflowStateStore;
  const TTL = 86400; // 24 hours

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store = new RedisWorkflowStateStore(redis as any, TTL);
  });

  describe('get()', () => {
    it('returns undefined for non-existent key', async () => {
      const result = await store.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('validates with WorkflowStateSchema on deserialization', async () => {
      // Store raw JSON with extra fields to verify Zod handles it
      const raw = {
        step: 'gather_info',
        collectedData: { name: 'Alice' },
        turnCount: 3,
        extraField: 'should be stripped by Zod parse',
      };
      await redis.set('wf:validate-1', JSON.stringify(raw), 'EX', TTL);
      const result = await store.get('validate-1');
      expect(result).toBeDefined();
      expect(result!.step).toBe('gather_info');
      expect(result!.turnCount).toBe(3);
    });
  });

  describe('set()', () => {
    it('set() and get() round-trip correctly', async () => {
      const state = makeWorkflowState({
        step: 'confirm',
        collectedData: { name: 'Bob', age: 30 },
        lastRecommendation: 'Product X',
        turnCount: 5,
      });
      await store.set('round-trip-1', state);
      const result = await store.get('round-trip-1');
      expect(result).toBeDefined();
      expect(result!.step).toBe('confirm');
      expect(result!.collectedData).toEqual({ name: 'Bob', age: 30 });
      expect(result!.lastRecommendation).toBe('Product X');
      expect(result!.turnCount).toBe(5);
    });

    it('applies TTL (sliding window)', async () => {
      const state = makeWorkflowState();
      await store.set('ttl-1', state);

      // Verify key has TTL set
      const ttl = await redis.ttl('wf:ttl-1');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(TTL);
    });

    it('resets TTL on update (sliding window)', async () => {
      const state = makeWorkflowState({ step: 'initial' });
      await store.set('sliding-1', state);

      const ttl1 = await redis.ttl('wf:sliding-1');
      expect(ttl1).toBeGreaterThan(0);

      // Update the state — TTL should reset
      const updated = makeWorkflowState({ step: 'confirm', turnCount: 3 });
      await store.set('sliding-1', updated);

      const ttl2 = await redis.ttl('wf:sliding-1');
      expect(ttl2).toBeGreaterThan(0);
      expect(ttl2).toBeLessThanOrEqual(TTL);

      // Verify the state was actually updated
      const result = await store.get('sliding-1');
      expect(result!.step).toBe('confirm');
      expect(result!.turnCount).toBe(3);
    });
  });

  describe('delete()', () => {
    it('removes state', async () => {
      const state = makeWorkflowState();
      await store.set('del-1', state);
      await store.delete('del-1');
      const result = await store.get('del-1');
      expect(result).toBeUndefined();
    });

    it('does not throw when deleting non-existent key', async () => {
      await expect(store.delete('non-existent')).resolves.not.toThrow();
    });
  });
});
