import type { NormalizedMessage } from '@copilot-chat/shared';

/**
 * Raw HTTP fetch wrappers for the chat API.
 * No state, no retry logic — those live in useChatApi.
 * The Vite dev server proxies /api to http://localhost:3001 (configured in vite.config.ts).
 */

/**
 * Starts a new Copilot Studio conversation.
 * Returns { conversationId: string }.
 * Throws with status property preserved on non-ok responses.
 */
export async function startConversation(signal?: AbortSignal): Promise<{ conversationId: string }> {
  const response = await fetch('/api/chat/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(`HTTP ${response.status}`),
      { status: response.status },
    );
  }

  return response.json() as Promise<{ conversationId: string }>;
}

/**
 * Sends a user message to the server and returns the bot's normalized response.
 * Returns { conversationId, messages: NormalizedMessage[] }.
 * Throws with status property preserved on non-ok responses.
 */
export async function sendMessage(
  conversationId: string,
  text: string,
  signal?: AbortSignal,
): Promise<{ conversationId: string; messages: NormalizedMessage[] }> {
  const response = await fetch('/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, text }),
    signal,
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(`HTTP ${response.status}`),
      { status: response.status },
    );
  }

  return response.json() as Promise<{ conversationId: string; messages: NormalizedMessage[] }>;
}

/**
 * Forwards an Adaptive Card submit action to the server for validation and Copilot proxying.
 * Returns { conversationId, messages: NormalizedMessage[] }.
 * Throws with status property preserved on non-ok responses.
 *
 * UI-07: Calls /api/chat/card-action with cardId, userSummary, submitData
 */
export async function sendCardAction(
  conversationId: string,
  cardId: string,
  userSummary: string,
  submitData: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ conversationId: string; messages: NormalizedMessage[] }> {
  const response = await fetch('/api/chat/card-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, cardId, userSummary, submitData }),
    signal,
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(`HTTP ${response.status}`),
      { status: response.status },
    );
  }

  return response.json() as Promise<{ conversationId: string; messages: NormalizedMessage[] }>;
}
