import { LRUCache } from 'lru-cache';
import type { ConversationStore, StoredConversation } from './ConversationStore.js';

/** Maximum number of active conversations in memory. LRU evicts oldest when exceeded. */
const MAX_CONVERSATIONS = 100;

export class InMemoryConversationStore implements ConversationStore {
  private cache = new LRUCache<string, StoredConversation>({ max: MAX_CONVERSATIONS });

  async get(id: string): Promise<StoredConversation | undefined> {
    return this.cache.get(id);
  }

  async set(id: string, conversation: StoredConversation): Promise<void> {
    this.cache.set(id, conversation);
  }

  async delete(id: string): Promise<void> {
    this.cache.delete(id);
  }
}
