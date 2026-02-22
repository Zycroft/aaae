/**
 * Returns true if the error originated from the Redis store backend (ioredis).
 *
 * Used in route catch blocks to select HTTP status code:
 *   - Redis errors  -> 503 Service Unavailable
 *   - Other errors  -> 502 Bad Gateway (Copilot Studio or application)
 *
 * Detects:
 * 1. redis-errors hierarchy by name (RedisError, ReplyError, AbortError,
 *    InterruptError, ParserError) - base classes used by ioredis
 * 2. ioredis-specific error names (MaxRetriesPerRequestError,
 *    ClusterAllFailedError) - thrown when Redis is unreachable
 * 3. Network-level connection failures (ECONNREFUSED, ECONNRESET,
 *    ETIMEDOUT, EHOSTUNREACH, ENOTFOUND)
 *
 * RESIL-01
 */

/** Error names from the redis-errors package (ioredis base) */
const REDIS_ERROR_NAMES = new Set([
  'RedisError',
  'ReplyError',
  'AbortError',
  'InterruptError',
  'ParserError',
  'MaxRetriesPerRequestError',
  'ClusterAllFailedError',
]);

/** Network error codes that indicate Redis connectivity failure */
const NETWORK_ERROR_PATTERN = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND/;

export function isRedisError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // ioredis / redis-errors named error classes
  if (REDIS_ERROR_NAMES.has(err.name)) {
    return true;
  }

  // Network-level connection failures
  if (NETWORK_ERROR_PATTERN.test(err.message)) {
    return true;
  }

  return false;
}
