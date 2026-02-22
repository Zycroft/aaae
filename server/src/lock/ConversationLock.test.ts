import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import {
  RedisConversationLock,
  InMemoryConversationLock,
  ConversationLockError,
} from './ConversationLock.js';

/**
 * ConversationLock unit tests using ioredis-mock.
 *
 * ORCH-07
 */

describe('RedisConversationLock', () => {
  let redis: InstanceType<typeof RedisMock>;
  let lock: RedisConversationLock;

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lock = new RedisConversationLock(redis as any, 10000);
  });

  it('acquire() returns a release function', async () => {
    const release = await lock.acquire('conv-1');
    expect(typeof release).toBe('function');
    await release();
  });

  it('acquire() sets NX key in Redis', async () => {
    await lock.acquire('conv-2');
    const key = await redis.get('lock:conv:conv-2');
    expect(key).toBeDefined();
    expect(key).not.toBeNull();
  });

  it('release() removes the key', async () => {
    const release = await lock.acquire('conv-3');
    await release();
    const key = await redis.get('lock:conv:conv-3');
    expect(key).toBeNull();
  });

  it('acquire() throws ConversationLockError when lock already held', async () => {
    await lock.acquire('conv-4');
    await expect(lock.acquire('conv-4')).rejects.toThrow(ConversationLockError);
  });

  it('release() is safe when lock expired (token mismatch)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const release = await lock.acquire('conv-5');

    // Simulate lock expiry by manually deleting the key
    await redis.del('lock:conv:conv-5');

    // Release should not throw even though the key is gone
    await expect(release()).resolves.not.toThrow();

    warnSpy.mockRestore();
  });

  it('ConversationLockError has conversationId property', () => {
    const err = new ConversationLockError('conv-err');
    expect(err.conversationId).toBe('conv-err');
    expect(err.message).toContain('conv-err');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('InMemoryConversationLock', () => {
  it('acquire and release works', async () => {
    const lock = new InMemoryConversationLock();
    const release = await lock.acquire('conv-mem-1');
    expect(typeof release).toBe('function');
    await release();

    // After release, can acquire again
    const release2 = await lock.acquire('conv-mem-1');
    await release2();
  });

  it('acquire() throws when lock already held', async () => {
    const lock = new InMemoryConversationLock();
    await lock.acquire('conv-mem-2');
    await expect(lock.acquire('conv-mem-2')).rejects.toThrow(ConversationLockError);
  });

  it('different conversations can be locked concurrently', async () => {
    const lock = new InMemoryConversationLock();
    const release1 = await lock.acquire('conv-a');
    const release2 = await lock.acquire('conv-b');
    await release1();
    await release2();
  });
});
