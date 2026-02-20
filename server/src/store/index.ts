import { InMemoryConversationStore } from './InMemoryStore.js';
import type { ConversationStore } from './ConversationStore.js';

export type { ConversationStore, StoredConversation } from './ConversationStore.js';
export { InMemoryConversationStore } from './InMemoryStore.js';

// Module-level singleton — production replacement is a drop-in (implement ConversationStore, swap here)
export const conversationStore: ConversationStore = new InMemoryConversationStore();
