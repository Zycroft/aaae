import { describe, it, expect } from 'vitest';
import { isRedisError } from './errorDetection.js';

describe('isRedisError()', () => {
  // --- redis-errors hierarchy (detected by error.name) ---

  it('returns true for RedisError by name', () => {
    const err = new Error('READONLY You cannot write against a read only replica');
    err.name = 'RedisError';
    expect(isRedisError(err)).toBe(true);
  });

  it('returns true for ReplyError by name', () => {
    const err = new Error('ERR unknown command');
    err.name = 'ReplyError';
    expect(isRedisError(err)).toBe(true);
  });

  it('returns true for AbortError by name', () => {
    const err = new Error('Command aborted');
    err.name = 'AbortError';
    expect(isRedisError(err)).toBe(true);
  });

  it('returns true for InterruptError by name', () => {
    const err = new Error('Connection interrupted');
    err.name = 'InterruptError';
    expect(isRedisError(err)).toBe(true);
  });

  it('returns true for ParserError by name', () => {
    const err = new Error('Protocol parse error');
    err.name = 'ParserError';
    expect(isRedisError(err)).toBe(true);
  });

  // --- ioredis-specific error classes ---

  it('returns true for MaxRetriesPerRequestError by name', () => {
    const err = new Error('Reached the max retries per request limit');
    err.name = 'MaxRetriesPerRequestError';
    expect(isRedisError(err)).toBe(true);
  });

  it('returns true for ClusterAllFailedError by name', () => {
    const err = new Error('Failed to refresh slots cache');
    err.name = 'ClusterAllFailedError';
    expect(isRedisError(err)).toBe(true);
  });

  // --- Network-level errors (detected by message pattern) ---

  it('returns true for ECONNREFUSED in message', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:6380');
    expect(isRedisError(err)).toBe(true);
  });

  it('returns true for ECONNRESET in message', () => {
    const err = new Error('read ECONNRESET');
    expect(isRedisError(err)).toBe(true);
  });

  it('returns true for ETIMEDOUT in message', () => {
    const err = new Error('connect ETIMEDOUT');
    expect(isRedisError(err)).toBe(true);
  });

  it('returns true for EHOSTUNREACH in message', () => {
    const err = new Error('connect EHOSTUNREACH');
    expect(isRedisError(err)).toBe(true);
  });

  it('returns true for ENOTFOUND in message', () => {
    const err = new Error('getaddrinfo ENOTFOUND my-redis.cache.windows.net');
    expect(isRedisError(err)).toBe(true);
  });

  // --- Non-Redis errors (must return false) ---

  it('returns false for generic Error', () => {
    const err = new Error('Something went wrong');
    expect(isRedisError(err)).toBe(false);
  });

  it('returns false for Copilot SDK authentication error', () => {
    const err = new Error('Authentication failed: invalid token');
    expect(isRedisError(err)).toBe(false);
  });

  it('returns false for Copilot Studio timeout (non-Redis)', () => {
    const err = new Error('Request to Copilot Studio timed out after 30s');
    // Note: this does NOT match ETIMEDOUT (no ETIMEDOUT in message)
    expect(isRedisError(err)).toBe(false);
  });

  it('returns false for non-Error values (null, string, number)', () => {
    expect(isRedisError(null)).toBe(false);
    expect(isRedisError('error string')).toBe(false);
    expect(isRedisError(42)).toBe(false);
    expect(isRedisError(undefined)).toBe(false);
  });
});
