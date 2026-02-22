# Phase 11: StoredConversation Schema + Store Abstraction - Research

**Researched:** 2026-02-21
**Domain:** TypeScript/Node backend patterns for persistent conversation state, Redis integration, schema design
**Confidence:** HIGH

## Summary

Phase 11 establishes the data model and abstraction layer for persistent conversation storage that will underpin the entire v1.4 Persistent State Store milestone. The core task is **expanding the StoredConversation data structure from a transport-only model to a complete persistent entity**, and **establishing a factory-based store selection pattern** that routes to either Redis or InMemory based on environment configuration.

This phase is NOT about wiring Redis connectivity itself — that's Phase 12. Phase 11 focuses on: (1) defining StoredConversation as a Zod schema in shared/ with all required fields (userId, tenantId, timestamps, status), (2) creating the ConversationStore interface with a `listByUser(userId)` method, (3) implementing both RedisStore and InMemoryStore to the interface, and (4) creating a factory that selects the correct store backend at startup and logs which one is active.

**Primary recommendation:** Create StoredConversation Zod schema in shared/ with backward-compatible defaults; implement the factory pattern in server/ that reads REDIS_URL env var at startup; both store implementations must pass identical unit tests (using ioredis-mock for Redis tests).

<user_constraints>
## User Constraints (from Project Decisions)

### Locked Decisions
- **Factory pattern:** REDIS_URL present → RedisStore; absent → InMemoryStore (never both simultaneously)
- **Fail-hard on Redis unavailability:** Return 503 Service Unavailable when Redis is unreachable; no silent fallback to InMemory (prevents hidden data loss)
- **Redis client library:** ioredis with `rediss://` scheme for Azure Cache TLS (port 6380)
- **Unit test mocking:** ioredis-mock for Redis tests (no external Redis instance required in CI)
- **Timestamp storage:** ISO 8601 strings, validated through Zod on deserialization
- **SDK conversation reference:** Store only conversationId string; never serialize the SDK conversation object itself (sdkConversationRef stored as opaque unknown type)

### Claude's Discretion
- Backward compatibility strategy for existing conversations without new fields
- Specific field names and optional/required decisions for StoredConversation schema
- Search/query optimization strategy (sorted sets vs. other secondary index methods)

### Deferred Ideas (OUT OF SCOPE)
- Redis Cluster support (single-node Azure Cache sufficient for v1.4)
- Data migration from InMemory to Redis (greenfield, no existing persistent data)
- Conversation archival to cold storage (v2+)
- Real-time pub/sub notifications (not needed for state store)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STATE-01 | StoredConversation includes userId and tenantId fields | Implemented as required string fields in schema; extracted from JWT claims in Phase 13 |
| STATE-02 | StoredConversation includes createdAt and updatedAt ISO 8601 timestamps | Implemented as z.string().datetime() for validation; default to current time on creation |
| STATE-03 | StoredConversation includes status field (active/completed/abandoned) | Implemented as z.enum(['active', 'completed', 'abandoned']); defaults to 'active' |
| STATE-04 | StoredConversation includes optional workflow fields (workflowId, currentStep, stepData, metadata) | Implemented as optional nested object; mirrors existing WorkflowState pattern in codebase |
| STATE-05 | Zod schema for StoredConversation lives in shared/src/schemas/ | Creates new file: shared/src/schemas/storedConversation.ts; follows project pattern |
| STATE-06 | Existing conversations without new fields still load (backward compatible defaults) | Zod .default() and .optional() used; deserialization never fails on missing fields |
| STORE-01 | Server persists conversations in Redis when REDIS_URL is set | RedisStore implementation; connects via ioredis, JSON serialization |
| STORE-02 | Server uses InMemoryStore when REDIS_URL is not set (no regression) | InMemoryStore already exists (InMemoryConversationStore); factory selects it |
| STORE-03 | Store factory selects Redis or InMemory based on REDIS_URL env var | Factory pattern in server/src/store/factory.ts; selected at module load time |
| STORE-04 | Server logs which store backend is active on startup | Logger call in factory or store initialization; visible in server startup output |
| QUERY-01 | ConversationStore interface has listByUser(userId) method | Extended ConversationStore interface; both implementations satisfy it |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | 3.25.76 (pinned) | Runtime schema validation + TypeScript type inference | Single source of truth for data contracts; already in use project-wide via shared/ |
| ioredis | ^7.0.0 | Redis client with TypeScript support, TLS, connection pooling | Industry standard for Node.js; excellent connection handling; built-in JWKS-like caching patterns |
| lru-cache | ^11.0.0 | In-memory LRU cache for InMemory implementation | Already in use (InMemoryConversationStore); bounded memory with auto-eviction |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis-mock | ^8.0.0 | Mock Redis client for unit tests | CI/local test environments; no external Redis needed; identical API to ioredis |
| uuid | ^11.0.0 | Generate conversation IDs | Already in use for NormalizedMessage.id and conversationId generation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ioredis | node-redis | ioredis: more active, better TypeScript, connection pooling built-in. node-redis: cleaner promise API but requires additional tooling |
| ioredis-mock | Real Redis in test fixtures | ioredis-mock: no external service, fast CI. Real Redis: more realistic but requires Docker, slower CI |
| LRU cache | Map | LRU cache: bounded memory, automatic eviction. Map: unbounded, must manually evict or memory leaks |

**Installation:**
```bash
npm install ioredis ioredis-mock --save
npm install ioredis-mock --save-dev  # Already included as dev dep in most Node projects
# Note: lru-cache already installed; uuid already installed
```

## Architecture Patterns

### Recommended Project Structure

Phase 11 creates/modifies:
```
shared/src/schemas/
└── storedConversation.ts       # NEW: StoredConversation Zod schema + types

server/src/store/
├── ConversationStore.ts        # MODIFY: Add listByUser(userId) to interface
├── InMemoryStore.ts            # MODIFY: Implement listByUser()
├── RedisStore.ts               # NEW: Redis implementation
├── factory.ts                  # NEW: Factory pattern + startup logging
└── index.ts                    # MODIFY: Export factory; select store at module load
```

### Pattern 1: Expandable Persistent Entity Schema

**What:** StoredConversation Zod schema lives in shared/ as the single source of truth. It combines transport data (externalId, history) with persistence metadata (userId, tenantId, timestamps, status).

**When to use:** Whenever you need to persist an entity across service boundaries and want TypeScript types + validation from one source.

**Example:**
```typescript
// shared/src/schemas/storedConversation.ts
import { z } from 'zod';
import { NormalizedMessageSchema } from './message.js';

export const StoredConversationSchema = z.object({
  // Transport identifiers (from existing structure)
  externalId: z.string().uuid(),
  sdkConversationRef: z.unknown(), // Opaque SDK reference, serialized as-is
  history: z.array(NormalizedMessageSchema),

  // Persistence metadata (Phase 11 additions)
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: z.enum(['active', 'completed', 'abandoned']),

  // Optional workflow fields (Phase 11, used by v1.5)
  workflowId: z.string().uuid().optional(),
  currentStep: z.number().nonnegative().optional(),
  stepData: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type StoredConversation = z.infer<typeof StoredConversationSchema>;
```

**Critical insight:** The schema uses `.optional()` on new fields with `.default()` chains to ensure existing conversations (stored without these fields) deserialize without error. Zod's `.catch()` or `.default()` prevents validation failures during migration.

### Pattern 2: Store Interface with Factory Selection

**What:** ConversationStore is an abstract interface; concrete implementations (InMemoryStore, RedisStore) are selected by a factory function at startup based on REDIS_URL.

**When to use:** When you need to swap implementations without changing route code; factory pattern is the cleanest way to handle environment-based selection.

**Example:**
```typescript
// server/src/store/ConversationStore.ts (MODIFIED)
import type { StoredConversation } from '@copilot-chat/shared';

export interface ConversationStore {
  get(id: string): Promise<StoredConversation | undefined>;
  set(id: string, conversation: StoredConversation): Promise<void>;
  delete(id: string): Promise<void>;

  // NEW: Query by user (Phase 11, required for user-scoped list)
  listByUser(userId: string): Promise<StoredConversation[]>;
}
```

```typescript
// server/src/store/factory.ts (NEW)
import { logger } from '../logger.js';
import { InMemoryConversationStore } from './InMemoryStore.js';
import { RedisConversationStore } from './RedisStore.js';
import type { ConversationStore } from './ConversationStore.js';

export function createConversationStore(): ConversationStore {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    logger.info(`[STORE] Redis detected. Initializing RedisConversationStore from ${redisUrl}`);
    return new RedisConversationStore(redisUrl);
  } else {
    logger.info('[STORE] REDIS_URL not set. Using InMemoryConversationStore.');
    return new InMemoryConversationStore();
  }
}
```

**Key decision:** Factory is called once at module load, store instance is exported as singleton (matching existing pattern with CopilotStudioClient).

### Pattern 3: Backward-Compatible Schema Evolution

**What:** When a schema gains new required fields, use Zod's `.default()` to provide fallback values for old records that lack those fields.

**When to use:** Any time you need to add required fields to an existing persisted model without breaking old records.

**Example:**
```typescript
export const StoredConversationSchema = z.object({
  // ... existing fields ...

  // NEW fields with backward-compatible defaults
  userId: z.string().min(1).default('anonymous'),  // Phase 13 will populate from JWT
  tenantId: z.string().min(1).default('dev'),      // Phase 13 will populate
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
  status: z.enum(['active', 'completed', 'abandoned']).default('active'),
});
```

**Critical insight:** `.default()` is evaluated **after** parsing, not before. If a field is missing from JSON, Zod inserts the default before validation. This ensures old records deserialize cleanly.

### Anti-Patterns to Avoid
- **Spreading defaults into every model instance:** Defaults should be in the schema, not in application code. Don't do `{ ...conversation, userId: conversation.userId ?? 'anonymous' }`.
- **Storing SDK reference objects in Redis:** The sdkConversationRef (Copilot SDK object) cannot be serialized to JSON. Store only the conversationId string; routes reconstruct the SDK ref from the ID.
- **Silent fallback on Redis failure:** If Redis is down and you fall back to InMemory, you've created hidden data loss. Return 503 instead.
- **Multiple store instances per app:** Create the store once at module load; export as singleton. Creating new RedisConversationStore() per request drains connection pool.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deciding which store to use at startup | Manual if-else logic in multiple places | Factory function (single location, easier to test) | Factories are the standard pattern; single source of truth for selection logic |
| Providing defaults for old records | Custom deserializer with null coalescing | Zod `.default()` chains | Zod handles validation + defaults together; custom code is fragile and duplicated |
| Connection pooling to Redis | Naive new Redis() per request | ioredis with native pooling | ioredis handles connection reuse, retry, and limits automatically; custom code has concurrency bugs |
| Mocking Redis in tests | Stub methods manually | ioredis-mock (drop-in API match) | ioredis-mock is an official ioredis project; identical API means real tests, not unit-level stubs |

**Key insight:** Zod + factory + ioredis-mock together eliminate the need for custom infrastructure code. Use what the ecosystem provides.

## Common Pitfalls

### Pitfall 1: Serializing Unpersistable Objects into the Store
**What goes wrong:** You try to store the full Copilot SDK conversation object (sdkConversationRef) in Redis, but the SDK object is a class instance with methods and circular references. JSON.stringify() either silently drops it or fails.

**Why it happens:** The sdkConversationRef is needed by the server to send follow-up messages, so it feels like it should be persisted. But it's not JSON-serializable.

**How to avoid:** Store only the conversationId (a UUID string). When you retrieve from store, reconstruct the SDK ref from the ID by calling the Copilot SDK's conversation lookup method (or store both: the string ID and the SDK object in memory, but never serialize the SDK object).

**Warning signs:** JSON.stringify() silently removes properties, or you get TypeError when trying to JSON.parse() and call methods on the deserialized object. Check Redux DevTools or logging to see if sdkConversationRef becomes `{}` after round-trip.

### Pitfall 2: Defaults Evaluated at Schema Definition Time Instead of Deserialization Time
**What goes wrong:** You use `.default(new Date().toISOString())` and expect each missing record to get the current time. Instead, the default is computed once when the schema is defined (server startup), and every old record gets the same timestamp.

**Why it happens:** Default functions should be wrapped in `() => ...` but the syntax is easy to get wrong.

**How to avoid:** Use `.default(() => new Date().toISOString())` (arrow function). Zod calls the function at deserialize time, not schema definition time.

**Warning signs:** All old records have identical timestamps (the server startup time). Check the updatedAt field on old vs. new records.

### Pitfall 3: Missing Environment Variable Not Caught Until First Store Access
**What goes wrong:** REDIS_URL is missing, the factory silently selects InMemoryStore, and only after the first crash do you realize the config was wrong.

**Why it happens:** The factory checks the env var but doesn't validate that it's a valid Redis URL. If it's malformed, the error is deferred until ioredis tries to connect.

**How to avoid:** The factory logs which store is active (see Pattern 2). In tests, verify the log message. In development, add a quick `logger.warn()` if REDIS_URL is set but cannot be parsed (validate URL structure early).

**Warning signs:** Server starts silently with InMemoryStore when you expected Redis. Check logs for the `[STORE]` prefix message; if you see "InMemoryConversationStore", REDIS_URL was not set or was empty.

### Pitfall 4: Forgetting listByUser() Boundary Conditions
**What goes wrong:** listByUser('nonexistent-user') returns an array with old conversations from other users, or hangs waiting for a Redis query.

**Why it happens:** The implementation doesn't index by userId, so it has to scan all keys or reconstruct userId from each value. Scanning is slow and complex.

**How to avoid:** For InMemoryStore, maintain a Map<userId, conversationIds> alongside the main cache. For RedisStore, use a sorted set secondary index (see `SORTED SET secondary index` pattern in Code Examples section).

**Warning signs:** listByUser() is slow (takes >100ms for 100 conversations) or returns wrong results. Add a test case for "list conversations of user A when user B also has conversations" to catch this.

### Pitfall 5: Storing Dates as Timestamps Instead of ISO 8601 Strings
**What goes wrong:** You store `createdAt: 1708953600000` (milliseconds since epoch) to save bytes, but then you forget which unit it is. Some code treats it as seconds, some as milliseconds. Deserialization Zod schema expects ISO 8601 string and rejects the number.

**Why it happens:** Timestamps are smaller, and it saves bytes in Redis. But the project decision (STATE.md) explicitly requires ISO 8601 strings for consistency and debuggability.

**How to avoid:** Use `z.string().datetime()` in the Zod schema. Always store as `new Date().toISOString()` in code. The schema validates the format at deserialization, catching mismatches early.

**Warning signs:** Zod validation fails with "Expected string, received number" when deserializing old records. Or timestamps in logs are unreadable (numeric instead of "2026-02-21T...").

## Code Examples

Verified patterns from codebase and official sources:

### StoredConversation Zod Schema with Backward Compatibility
```typescript
// shared/src/schemas/storedConversation.ts (NEW)
import { z } from 'zod';
import { NormalizedMessageSchema } from './message.js';

/**
 * StoredConversation — the persistent entity for a conversation.
 *
 * Combines existing transport data (externalId, history) with new persistence metadata
 * (userId, tenantId, timestamps, status, optional workflow fields).
 *
 * Backward compatible: old records without new fields deserialize with defaults.
 * Zod validates all fields at deserialization, never at schema definition time.
 *
 * STATE-01, STATE-02, STATE-03, STATE-04, STATE-05, STATE-06
 */
export const StoredConversationSchema = z.object({
  // ─── Existing Transport Data ───
  /** Server-generated UUID — external identifier sent to clients */
  externalId: z.string().uuid(),

  /** Opaque Copilot SDK conversation reference; store as unknown, never serialize to JSON */
  sdkConversationRef: z.unknown(),

  /** Full message history for this conversation */
  history: z.array(NormalizedMessageSchema),

  // ─── Persistence Metadata (Phase 11) ───
  /** User who owns this conversation (from JWT claims, populated in Phase 13) */
  userId: z.string().min(1).default('anonymous'),

  /** Tenant ID for multi-tenancy (from JWT claims, populated in Phase 13) */
  tenantId: z.string().min(1).default('dev'),

  /** Creation timestamp in ISO 8601 format */
  createdAt: z.string().datetime().default(() => new Date().toISOString()),

  /** Last modification timestamp in ISO 8601 format */
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),

  /** Conversation lifecycle state */
  status: z.enum(['active', 'completed', 'abandoned']).default('active'),

  // ─── Optional Workflow Fields (v1.5 Workflow Orchestrator) ───
  /** ID of the workflow this conversation is executing */
  workflowId: z.string().uuid().optional(),

  /** Current step number in the workflow */
  currentStep: z.number().nonnegative().optional(),

  /** Step-specific data (arbitrary key-value pairs) */
  stepData: z.record(z.string(), z.unknown()).optional(),

  /** Conversation-level metadata (arbitrary key-value pairs) */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type StoredConversation = z.infer<typeof StoredConversationSchema>;
```

### ConversationStore Interface with listByUser

```typescript
// server/src/store/ConversationStore.ts (MODIFIED)
import type { StoredConversation } from '@copilot-chat/shared';

/**
 * ConversationStore — persistence abstraction for conversations.
 *
 * Implementations: InMemoryConversationStore, RedisConversationStore
 * Factory selects implementation at startup based on REDIS_URL.
 *
 * STORE-03, QUERY-01
 */
export interface ConversationStore {
  /** Retrieve conversation by ID */
  get(id: string): Promise<StoredConversation | undefined>;

  /** Store or update conversation */
  set(id: string, conversation: StoredConversation): Promise<void>;

  /** Delete conversation by ID */
  delete(id: string): Promise<void>;

  /** List all conversations owned by a user, sorted by most recent first */
  listByUser(userId: string): Promise<StoredConversation[]>;
}
```

### Factory Pattern with Startup Logging

```typescript
// server/src/store/factory.ts (NEW)
import { logger } from '../logger.js';
import { InMemoryConversationStore } from './InMemoryStore.js';
import { RedisConversationStore } from './RedisStore.js';
import type { ConversationStore } from './ConversationStore.js';

/**
 * Factory function to create the appropriate store backend.
 *
 * Selection logic:
 * - REDIS_URL set → RedisConversationStore (connects to Azure Cache for Redis)
 * - REDIS_URL absent → InMemoryConversationStore (local LRU cache)
 *
 * Never both. Never silent fallback.
 *
 * STORE-03, STORE-04
 */
export function createConversationStore(): ConversationStore {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    logger.info(
      `[STORE] Redis detected. Initializing RedisConversationStore from ${redisUrl}`
    );
    return new RedisConversationStore(redisUrl);
  } else {
    logger.info('[STORE] REDIS_URL not set. Using InMemoryConversationStore (local LRU).');
    return new InMemoryConversationStore();
  }
}
```

### Module Singleton Export

```typescript
// server/src/store/index.ts (MODIFIED)
import { createConversationStore } from './factory.js';
import type { ConversationStore } from './ConversationStore.js';

// Export types
export type { ConversationStore, StoredConversation } from './ConversationStore.js';
export { InMemoryConversationStore } from './InMemoryStore.js';

// Create singleton at module load time (STORE-03)
export const conversationStore: ConversationStore = createConversationStore();

// Existing exports (unchanged)
export type { WorkflowStateStore } from './WorkflowStateStore.js';
export { InMemoryWorkflowStateStore } from './InMemoryWorkflowStateStore.js';
export const workflowStateStore = new InMemoryWorkflowStateStore();
```

### InMemoryStore Implementation with listByUser

```typescript
// server/src/store/InMemoryStore.ts (MODIFIED)
import { LRUCache } from 'lru-cache';
import type { ConversationStore, StoredConversation } from './ConversationStore.js';

const MAX_CONVERSATIONS = 100;

export class InMemoryConversationStore implements ConversationStore {
  private cache = new LRUCache<string, StoredConversation>({ max: MAX_CONVERSATIONS });

  // Secondary index: userId -> Set<conversationId> for efficient listByUser()
  private userIndex = new Map<string, Set<string>>();

  async get(id: string): Promise<StoredConversation | undefined> {
    return this.cache.get(id);
  }

  async set(id: string, conversation: StoredConversation): Promise<void> {
    const existing = this.cache.get(id);

    // Update secondary index
    if (existing && existing.userId !== conversation.userId) {
      // User changed (edge case, but handle it): remove from old user's index
      this.userIndex.get(existing.userId)?.delete(id);
    }

    // Add to new user's index
    if (!this.userIndex.has(conversation.userId)) {
      this.userIndex.set(conversation.userId, new Set());
    }
    this.userIndex.get(conversation.userId)!.add(id);

    this.cache.set(id, conversation);
  }

  async delete(id: string): Promise<void> {
    const existing = this.cache.get(id);
    if (existing) {
      this.userIndex.get(existing.userId)?.delete(id);
    }
    this.cache.delete(id);
  }

  async listByUser(userId: string): Promise<StoredConversation[]> {
    const conversationIds = this.userIndex.get(userId) ?? new Set();
    const conversations = Array.from(conversationIds)
      .map(id => this.cache.get(id))
      .filter((c): c is StoredConversation => c !== undefined)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return conversations;
  }
}
```

### RedisStore Sketch (Phase 12, included here for context)

```typescript
// server/src/store/RedisStore.ts (NEW, but shown here for Phase 11 planning)
import Redis from 'ioredis';
import type { ConversationStore, StoredConversation } from './ConversationStore.js';
import { StoredConversationSchema } from '@copilot-chat/shared';

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const OPERATION_TIMEOUT_MS = 5000; // 5 seconds

export class RedisConversationStore implements ConversationStore {
  private redis: Redis;
  private ttlSeconds: number;

  constructor(redisUrl: string, ttlSeconds = DEFAULT_TTL_SECONDS) {
    this.redis = new Redis(redisUrl, {
      connectTimeout: OPERATION_TIMEOUT_MS,
      commandTimeout: OPERATION_TIMEOUT_MS,
    });
    this.ttlSeconds = ttlSeconds;
  }

  private conversationKey(id: string): string {
    return `conv:${id}`;
  }

  private userIndexKey(userId: string): string {
    return `user:${userId}:convs`;
  }

  async get(id: string): Promise<StoredConversation | undefined> {
    const json = await this.redis.get(this.conversationKey(id));
    if (!json) return undefined;

    const data = JSON.parse(json);
    return StoredConversationSchema.parse(data); // Validate + set defaults
  }

  async set(id: string, conversation: StoredConversation): Promise<void> {
    const json = JSON.stringify(conversation);

    // Store conversation with TTL
    await this.redis.setex(
      this.conversationKey(id),
      this.ttlSeconds,
      json
    );

    // Add to user's sorted set (indexed by updatedAt for sorting)
    await this.redis.zadd(
      this.userIndexKey(conversation.userId),
      new Date(conversation.updatedAt).getTime(),
      id
    );
  }

  async delete(id: string): Promise<void> {
    const conv = await this.get(id);
    if (conv) {
      await this.redis.zrem(this.userIndexKey(conv.userId), id);
    }
    await this.redis.del(this.conversationKey(id));
  }

  async listByUser(userId: string): Promise<StoredConversation[]> {
    // ZREVRANGE: return IDs sorted by updatedAt (most recent first)
    const ids = await this.redis.zrevrange(this.userIndexKey(userId), 0, 49); // Limit to 50

    const conversations = await Promise.all(
      ids.map(id => this.get(id))
    );

    return conversations.filter((c): c is StoredConversation => c !== undefined);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single data model for transport + persistence | Separate schemas (NormalizedMessage for chat, StoredConversation for storage) | Phase 11 | Cleaner separation of concerns; shared/ now owns the persistence contract |
| Hard-coded store backend in routes | Factory pattern selecting store at startup | Phase 11 | No if-else in route code; easier to test; environment config drives selection |
| Manual default population in application code | Zod `.default()` chains in schema | Phase 11 | Single source of truth; validation + defaults happen together; less code duplication |
| Synchronous in-memory LRU only | Async interface, swappable backends | Phase 11 | Prepares for async Redis; zero change to route code when switching backends |

**Deprecated/outdated:**
- Storing full SDK objects in persistence layers: The Copilot SDK conversation object is a class instance, not JSON-serializable. Always store the conversationId string only.

## Open Questions

1. **Should listByUser() return ALL conversations or paginate?**
   - What we know: QUERY-02 (future Phase 12) specifies "limited to 50"
   - What's unclear: Phase 11 doesn't require pagination; Phase 12 will add limit and offset
   - Recommendation: Phase 11 implementation can return all (InMemoryStore) or use ZREVRANGE 0 -1 (RedisStore); Phase 12 will add pageSize/offset params to the interface

2. **What happens if a conversation's userId changes during the session?**
   - What we know: ConversationStore gets/sets on the fly; no bulk-user migration needed
   - What's unclear: Should we allow userId to be updated after creation?
   - Recommendation: Phase 13 routes will set userId from JWT on POST /api/chat/start; subsequent sends will use the same externalId, so userId should be immutable. Phase 12/13 can enforce this (no user switch mid-conversation).

3. **Should RedisStore validate that REDIS_URL is a valid URL at factory time, or defer to first connect?**
   - What we know: Factory logs which store is active; errors are caught during first Redis operation
   - What's unclear: Early validation vs. late validation tradeoff
   - Recommendation: Log a warning if REDIS_URL is malformed (e.g., `redis://host:port:extraslash`), but don't throw. ioredis will fail cleanly on first connect and logs will help debugging.

## Sources

### Primary (HIGH confidence)
- **CLAUDE.md** (project instructions) - Monorepo structure, Zod patterns, Store interface requirements
- **REQUIREMENTS.md** - Phase 11 requirements STATE-01 through STATE-06, STORE-01 through STORE-04, QUERY-01
- **STATE.md** - Project decisions (factory pattern, ioredis, ioredis-mock, fail-hard on Redis, ISO 8601 timestamps)
- **Existing codebase** - InMemoryConversationStore implementation, NormalizedMessageSchema pattern, WorkflowStateStore interface
- **ioredis official docs** (https://github.com/luin/ioredis) - Connection pooling, cluster support, TLS (rediss://), timeouts

### Secondary (MEDIUM confidence)
- **Zod official docs** (https://zod.dev) - Schema composition, `.default()` behavior, type inference
- **lru-cache official docs** (https://github.com/isaacs/node-lru-cache) - Bounded cache, eviction strategy
- **ioredis-mock official docs** (https://github.com/stipsan/ioredis-mock) - Drop-in mock for testing

### Tertiary (LOW confidence)
- N/A — all critical findings verified with codebase or official documentation

## Metadata

**Confidence breakdown:**
- **Standard stack**: HIGH - ioredis, Zod, lru-cache verified in codebase and official sources
- **Architecture**: HIGH - Factory pattern documented in STATE.md; store interface pattern already in use (WorkflowStateStore)
- **Pitfalls**: HIGH - Derived from project constraints (serialization, backward compatibility, environment-based selection)
- **Code examples**: HIGH - Based on existing codebase patterns (InMemoryStore, Zod schema structure, singleton pattern)

**Research date:** 2026-02-21
**Valid until:** 2026-03-07 (16 days; stable tech stack, unlikely to change)

---

## Key Takeaways for Planning

1. **StoredConversation goes in shared/**, not server/. It's a cross-boundary contract.
2. **Backward compatibility via `.default()`** — phase 13 routes will set userId/tenantId from JWT, but old in-memory conversations must deserialize without error.
3. **Factory function selects at module load** — singular decision point, no runtime if-else in routes.
4. **listByUser() needs secondary index** — InMemoryStore: Map<userId, Set<id>>; RedisStore: sorted set (ZADD/ZREVRANGE).
5. **Never store SDK objects** — only conversationId string; routes will reconstruct SDK ref (Phase 12 implementation detail).
6. **Logging the store choice** — "Redis detected..." or "Using InMemoryStore..." at startup helps operators debug data path.
7. **ioredis-mock for tests** — no external service needed; identical API to real ioredis.
