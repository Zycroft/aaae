import type { NormalizedMessage } from '@copilot-chat/shared';

/**
 * Contract for all LLM backends. Implementations handle normalization
 * internally — callers receive NormalizedMessage[] only.
 *
 * startSession   — initialise a new conversation; may return a greeting message or empty array
 * sendMessage    — send a user text turn and return the assistant's response messages
 * sendCardAction — forward an Adaptive Card submit action and return response messages
 */
export interface LlmProvider {
  startSession(conversationId: string): Promise<NormalizedMessage[]>;
  sendMessage(conversationId: string, message: string): Promise<NormalizedMessage[]>;
  sendCardAction(
    conversationId: string,
    actionValue: Record<string, unknown>
  ): Promise<NormalizedMessage[]>;
}
