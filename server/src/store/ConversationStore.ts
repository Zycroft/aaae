import type { NormalizedMessage } from '@copilot-chat/shared';

export interface StoredConversation {
  /** Server-generated UUID — the external conversationId sent to clients */
  externalId: string;
  /**
   * The internal Copilot SDK conversation reference.
   * Typed as unknown here because the SDK type is only imported on the server.
   * Routes cast this to the appropriate SDK type when needed.
   */
  sdkConversationRef: unknown;
  /** Full message history for this conversation */
  history: NormalizedMessage[];
}

export interface ConversationStore {
  get(id: string): Promise<StoredConversation | undefined>;
  set(id: string, conversation: StoredConversation): Promise<void>;
  delete(id: string): Promise<void>;
}
