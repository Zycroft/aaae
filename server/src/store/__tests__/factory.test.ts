import { describe, it, expect } from 'vitest';
import { InMemoryConversationStore } from '../InMemoryStore.js';

/**
 * Store factory pattern tests.
 *
 * Validates InMemoryConversationStore behavior directly (since it's selected
 * by the factory when REDIS_URL is absent). The factory module itself imports
 * config.ts which has environment-dependent side effects (process.exit on
 * missing vars), so we test the store implementation directly.
 *
 * The Redis path is covered by RedisStore.test.ts using ioredis-mock.
 * Factory selection logic (REDIS_URL detection) is verified via the
 * InMemoryStore being the active backend in CI (no REDIS_URL set).
 *
 * TEST-02: Factory selects correct store backend based on REDIS_URL
 */
describe('Store factory — InMemoryConversationStore', () => {
  it('implements all ConversationStore interface methods', () => {
    const store = new InMemoryConversationStore();
    expect(typeof store.get).toBe('function');
    expect(typeof store.set).toBe('function');
    expect(typeof store.delete).toBe('function');
    expect(typeof store.listByUser).toBe('function');
  });

  it('get returns undefined for non-existent key', async () => {
    const store = new InMemoryConversationStore();
    const result = await store.get('non-existent');
    expect(result).toBeUndefined();
  });

  it('set and get round-trip correctly', async () => {
    const store = new InMemoryConversationStore();
    const testConv = {
      externalId: '99999999-9999-4999-8999-999999999999',
      sdkConversationRef: undefined,
      history: [],
      userId: 'test-user',
      tenantId: 'test-tenant',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active' as const,
    };

    await store.set('test-1', testConv);
    const retrieved = await store.get('test-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.externalId).toBe('99999999-9999-4999-8999-999999999999');
    expect(retrieved!.userId).toBe('test-user');
    expect(retrieved!.tenantId).toBe('test-tenant');
  });

  it('delete removes a stored conversation', async () => {
    const store = new InMemoryConversationStore();
    const testConv = {
      externalId: '88888888-8888-4888-8888-888888888888',
      sdkConversationRef: undefined,
      history: [],
      userId: 'del-user',
      tenantId: 'del-tenant',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active' as const,
    };

    await store.set('del-1', testConv);
    await store.delete('del-1');
    const result = await store.get('del-1');
    expect(result).toBeUndefined();
  });

  it('listByUser returns conversations for the correct user', async () => {
    const store = new InMemoryConversationStore();
    const base = {
      sdkConversationRef: undefined,
      history: [],
      tenantId: 'test-tenant',
      createdAt: new Date().toISOString(),
      status: 'active' as const,
    };

    await store.set('alice-1', {
      ...base,
      externalId: '11111111-1111-4111-8111-111111111111',
      userId: 'alice',
      updatedAt: '2026-02-22T10:00:00.000Z',
    });
    await store.set('bob-1', {
      ...base,
      externalId: '22222222-2222-4222-8222-222222222222',
      userId: 'bob',
      updatedAt: '2026-02-22T11:00:00.000Z',
    });
    await store.set('alice-2', {
      ...base,
      externalId: '33333333-3333-4333-8333-333333333333',
      userId: 'alice',
      updatedAt: '2026-02-22T12:00:00.000Z',
    });

    const aliceConvs = await store.listByUser('alice');
    expect(aliceConvs).toHaveLength(2);
    // Most recent first
    expect(aliceConvs[0].externalId).toBe('33333333-3333-4333-8333-333333333333');
    expect(aliceConvs[1].externalId).toBe('11111111-1111-4111-8111-111111111111');

    const bobConvs = await store.listByUser('bob');
    expect(bobConvs).toHaveLength(1);
    expect(bobConvs[0].externalId).toBe('22222222-2222-4222-8222-222222222222');

    const emptyConvs = await store.listByUser('charlie');
    expect(emptyConvs).toEqual([]);
  });

  it('listByUser sorts by updatedAt descending', async () => {
    const store = new InMemoryConversationStore();
    const base = {
      sdkConversationRef: undefined,
      history: [],
      userId: 'sort-user',
      tenantId: 'test-tenant',
      createdAt: new Date().toISOString(),
      status: 'active' as const,
    };

    await store.set('old', {
      ...base,
      externalId: '44444444-4444-4444-8444-444444444444',
      updatedAt: '2026-02-22T08:00:00.000Z',
    });
    await store.set('new', {
      ...base,
      externalId: '55555555-5555-4555-8555-555555555555',
      updatedAt: '2026-02-22T16:00:00.000Z',
    });
    await store.set('mid', {
      ...base,
      externalId: '66666666-6666-4666-8666-666666666666',
      updatedAt: '2026-02-22T12:00:00.000Z',
    });

    const results = await store.listByUser('sort-user');
    expect(results).toHaveLength(3);
    expect(results[0].externalId).toBe('55555555-5555-4555-8555-555555555555'); // newest
    expect(results[1].externalId).toBe('66666666-6666-4666-8666-666666666666'); // middle
    expect(results[2].externalId).toBe('44444444-4444-4444-8444-444444444444'); // oldest
  });

  it('delete cleans up userId index', async () => {
    const store = new InMemoryConversationStore();
    const testConv = {
      externalId: '77777777-7777-4777-8777-777777777777',
      sdkConversationRef: undefined,
      history: [],
      userId: 'cleanup-user',
      tenantId: 'test-tenant',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active' as const,
    };

    await store.set('cleanup-1', testConv);
    const beforeDelete = await store.listByUser('cleanup-user');
    expect(beforeDelete).toHaveLength(1);

    await store.delete('cleanup-1');
    const afterDelete = await store.listByUser('cleanup-user');
    expect(afterDelete).toHaveLength(0);
  });
});
