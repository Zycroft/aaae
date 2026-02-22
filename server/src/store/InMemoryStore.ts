import { LRUCache } from 'lru-cache';
import type { ConversationStore, StoredConversation } from './ConversationStore.js';

/** Maximum number of active conversations in memory. LRU evicts oldest when exceeded. */
const MAX_CONVERSATIONS = 100;

/**
 * InMemoryConversationStore — LRU-backed in-process store.
 *
 * Selected by factory when REDIS_URL is not set (local dev, CI).
 * Secondary index (userIndex) enables efficient listByUser() without full-scan.
 *
 * STORE-02, QUERY-01
 */
export class InMemoryConversationStore implements ConversationStore {
  private cache = new LRUCache<string, StoredConversation>({ max: MAX_CONVERSATIONS });

  /** Secondary index: userId → Set<externalId> for listByUser() */
  private userIndex = new Map<string, Set<string>>();

  async get(id: string): Promise<StoredConversation | undefined> {
    return this.cache.get(id);
  }

  async set(id: string, conversation: StoredConversation): Promise<void> {
    const existing = this.cache.get(id);

    // If userId changed (edge case), remove from old user's index
    if (existing && existing.userId !== conversation.userId) {
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

  /**
   * List conversations for a user sorted most-recent-first by updatedAt.
   * Returns empty array when user has no conversations.
   * QUERY-01
   */
  async listByUser(userId: string): Promise<StoredConversation[]> {
    const ids = this.userIndex.get(userId) ?? new Set<string>();
    return Array.from(ids)
      .map(id => this.cache.get(id))
      .filter((c): c is StoredConversation => c !== undefined)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
}
