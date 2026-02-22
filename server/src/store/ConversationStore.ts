import type { StoredConversation } from '@copilot-chat/shared';

export type { StoredConversation };

/**
 * ConversationStore — persistence abstraction for conversations.
 *
 * Implementations: InMemoryConversationStore (default), RedisConversationStore (REDIS_URL set).
 * Factory in factory.ts selects the implementation at startup.
 *
 * STORE-03, QUERY-01
 */
export interface ConversationStore {
  /** Retrieve conversation by externalId */
  get(id: string): Promise<StoredConversation | undefined>;

  /** Store or update conversation */
  set(id: string, conversation: StoredConversation): Promise<void>;

  /** Delete conversation by externalId */
  delete(id: string): Promise<void>;

  /**
   * List all conversations owned by a user, sorted most-recent-first by updatedAt.
   * Returns an empty array when the user has no conversations.
   * QUERY-01
   */
  listByUser(userId: string): Promise<StoredConversation[]>;
}
