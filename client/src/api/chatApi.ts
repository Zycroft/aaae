import type { NormalizedMessage, WorkflowState } from '@copilot-chat/shared';

/**
 * Raw HTTP fetch wrappers for the chat API.
 * No state, no retry logic — those live in useChatApi.
 * The Vite dev server proxies /api to http://localhost:3001 (configured in vite.config.ts).
 *
 * Each function accepts a `token` string and injects it as the Authorization: Bearer header.
 * Token acquisition is the responsibility of the caller (ChatShell via useMsal).
 * CAUTH-05
 */

/**
 * Starts a new Copilot Studio conversation.
 * Returns { conversationId: string }.
 * Throws with status property preserved on non-ok responses.
 */
export async function startConversation(
  token: string,
  signal?: AbortSignal,
): Promise<{ conversationId: string; workflowState?: WorkflowState }> {
  const response = await fetch('/api/chat/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    signal,
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(`HTTP ${response.status}`),
      { status: response.status },
    );
  }

  return response.json() as Promise<{ conversationId: string; workflowState?: WorkflowState }>;
}

/**
 * Sends a user message to the server and returns the bot's normalized response.
 * Returns { conversationId, messages: NormalizedMessage[] }.
 * Throws with status property preserved on non-ok responses.
 */
export async function sendMessage(
  conversationId: string,
  text: string,
  token: string,
  signal?: AbortSignal,
): Promise<{ conversationId: string; messages: NormalizedMessage[]; workflowState?: WorkflowState }> {
  const response = await fetch('/api/chat/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ conversationId, text }),
    signal,
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(`HTTP ${response.status}`),
      { status: response.status },
    );
  }

  return response.json() as Promise<{ conversationId: string; messages: NormalizedMessage[]; workflowState?: WorkflowState }>;
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
  token: string,
  signal?: AbortSignal,
): Promise<{ conversationId: string; messages: NormalizedMessage[]; workflowState?: WorkflowState }> {
  const response = await fetch('/api/chat/card-action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ conversationId, cardId, userSummary, submitData }),
    signal,
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(`HTTP ${response.status}`),
      { status: response.status },
    );
  }

  return response.json() as Promise<{ conversationId: string; messages: NormalizedMessage[]; workflowState?: WorkflowState }>;
}
