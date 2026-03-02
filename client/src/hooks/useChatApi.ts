import { useReducer, useEffect, useRef } from 'react';
import type { NormalizedMessage, WorkflowState } from '@copilot-chat/shared';
import { startConversation, sendMessage, sendCardAction } from '../api/chatApi.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MessageStatus = 'sending' | 'sent' | 'error';

/** NormalizedMessage augmented with client-side status tracking */
export type TranscriptMessage = NormalizedMessage & {
  status?: MessageStatus;
  errorMessage?: string;
  /** 'cardSubmit' = user bubble rendered as a chip after card submission (UI-10) */
  /** 'orchestratorStatus' = centered muted text, no speech bubble (TRANS-02) */
  subKind?: 'cardSubmit' | 'orchestratorStatus';
  /** Workflow phase label at the time this message was received (TRANS-01) */
  workflowPhase?: string;
};

export type State = {
  conversationId: string | null;
  messages: TranscriptMessage[];
  /** true = skeleton loading row should be visible */
  isLoading: boolean;
  /** Global error (e.g., failed to start conversation) */
  error: string | null;
  /** Server-returned workflow state — null when absent or before first response (STATE-01) */
  workflowState: WorkflowState | null;
};

export type Action =
  | { type: 'INIT_CONVERSATION'; conversationId: string }
  | { type: 'ADD_OPTIMISTIC_MESSAGE'; message: TranscriptMessage }
  | { type: 'START_LOADING' }
  | { type: 'SEND_SUCCESS'; optimisticId: string; botMessages: NormalizedMessage[]; currentPhase?: string }
  | { type: 'SEND_ERROR'; optimisticId: string; errorMessage: string }
  | { type: 'CARD_ACTION_SUCCESS'; optimisticId: string; botMessages: NormalizedMessage[]; currentPhase?: string }
  | { type: 'GLOBAL_ERROR'; error: string }
  | { type: 'SET_WORKFLOW_STATE'; workflowState: WorkflowState }
  | { type: 'RESET_CONVERSATION' };

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────

export const initialState: State = {
  conversationId: null,
  messages: [],
  isLoading: false,
  error: null,
  workflowState: null,
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'INIT_CONVERSATION':
      return {
        ...state,
        conversationId: action.conversationId,
        messages: [
          {
            id: 'welcome',
            role: 'assistant',
            kind: 'text',
            text: 'Hello! I\'m your airport planning and procurement assistant. How can I help you today?',
            status: 'sent',
          },
        ],
      };

    case 'ADD_OPTIMISTIC_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };

    case 'START_LOADING':
      return { ...state, isLoading: true };

    case 'SEND_SUCCESS':
      return {
        ...state,
        isLoading: false,
        messages: [
          // Mark the optimistic user bubble as 'sent'
          ...state.messages.map((m) =>
            m.id === action.optimisticId ? { ...m, status: 'sent' as const } : m
          ),
          // Append all bot messages with 'sent' status + workflow phase tag (TRANS-01)
          ...action.botMessages.map((m) => ({
            ...m,
            status: 'sent' as const,
            workflowPhase: action.currentPhase,
          })),
        ],
      };

    case 'SEND_ERROR':
      return {
        ...state,
        isLoading: false,
        messages: state.messages.map((m) =>
          m.id === action.optimisticId
            ? { ...m, status: 'error' as const, errorMessage: action.errorMessage }
            : m
        ),
      };

    case 'CARD_ACTION_SUCCESS':
      return {
        ...state,
        isLoading: false,
        messages: [
          // Mark the optimistic card-submit chip as 'sent'
          ...state.messages.map((m) =>
            m.id === action.optimisticId ? { ...m, status: 'sent' as const } : m
          ),
          // Append all bot response messages with 'sent' status + workflow phase tag (TRANS-01)
          ...action.botMessages.map((m) => ({
            ...m,
            status: 'sent' as const,
            workflowPhase: action.currentPhase,
          })),
        ],
      };

    case 'GLOBAL_ERROR':
      return { ...state, error: action.error };

    case 'SET_WORKFLOW_STATE':
      return { ...state, workflowState: action.workflowState };

    case 'RESET_CONVERSATION':
      return { ...initialState };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry helper
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 200;
const SKELETON_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches with automatic retry on 5xx or network errors.
 * AbortError is never retried — it is immediately rethrown.
 */
async function fetchWithRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      return await fn(signal);
    } catch (err) {
      const error = err as Error & { status?: number };

      // Never retry on abort — rethrow immediately
      if (error.name === 'AbortError') throw error;

      lastError = error;

      // Only retry on 5xx server errors or network failures (no status = network error)
      const shouldRetry = !error.status || error.status >= 500;
      if (!shouldRetry) throw error;

      if (attempt < MAX_RETRIES - 1) {
        // Exponential backoff: 200ms, 400ms, 800ms
        await sleep(Math.pow(2, attempt) * BASE_DELAY_MS);
      }
    }
  }

  throw lastError ?? new Error('Unknown error after retries');
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Central hook for all chat API interaction (UI-09).
 *
 * Accepts a `getToken` function that acquires a valid Bearer token before each API call.
 * Token acquisition failure is treated like a network error — shown in error state.
 *
 * - Auto-starts a conversation on mount
 * - Manages transcript state via useReducer
 * - Dispatches optimistic user bubbles before fetch resolves
 * - Shows skeleton loading state after 300ms delay (avoids flicker on fast responses)
 * - Retries on 5xx / network errors (up to 3 attempts, exponential backoff)
 * - Dispatches inline error on the user bubble when all retries exhausted
 *
 * CAUTH-04, CAUTH-05, CAUTH-07
 */
export function useChatApi({ getToken }: { getToken: () => Promise<string> }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Stable ref to the abort controller so unmount cleanup can cancel in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  // Auto-start conversation on mount
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const token = await getToken();
        const data = await startConversation(token, controller.signal);
        dispatch({ type: 'INIT_CONVERSATION', conversationId: data.conversationId });
        if (data.workflowState) {
          dispatch({ type: 'SET_WORKFLOW_STATE', workflowState: data.workflowState });
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (error.name !== 'AbortError') {
          dispatch({ type: 'GLOBAL_ERROR', error: 'Failed to start conversation. Please refresh.' });
        }
      }
    })();

    return () => {
      controller.abort();
    };
    // getToken is a stable useCallback ref from ChatShell — empty dep array is intentional
    // (re-running on getToken changes would cause an infinite loop: mount → getToken → mount)
  }, []);

  /**
   * Sends a user message with optimistic update, 300ms skeleton delay, and retry.
   */
  async function send(text: string): Promise<void> {
    if (!state.conversationId) return;
    if (!text.trim()) return;

    // 1. Generate optimistic message
    const optimisticId = crypto.randomUUID();
    const optimisticMessage: TranscriptMessage = {
      id: optimisticId,
      role: 'user',
      kind: 'text',
      text: text.trim(),
      status: 'sending',
    };

    // 2. Dispatch optimistic bubble immediately
    dispatch({ type: 'ADD_OPTIMISTIC_MESSAGE', message: optimisticMessage });

    // 3. Schedule skeleton loading after 300ms delay (avoids flicker on fast responses)
    const skeletonTimer = setTimeout(() => {
      dispatch({ type: 'START_LOADING' });
    }, SKELETON_DELAY_MS);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // 4. Acquire token then fetch with retry
      const token = await getToken();
      const data = await fetchWithRetry(
        (signal) => sendMessage(state.conversationId!, text.trim(), token, signal),
        controller.signal,
      );

      // 5. Cancel skeleton timer if response came back fast
      clearTimeout(skeletonTimer);

      // 6. Dispatch success with bot messages + current phase for dividers (TRANS-01)
      dispatch({
        type: 'SEND_SUCCESS',
        optimisticId,
        botMessages: data.messages,
        currentPhase: data.workflowState?.currentPhase,
      });
      if (data.workflowState) {
        dispatch({ type: 'SET_WORKFLOW_STATE', workflowState: data.workflowState });
      }
    } catch (err) {
      clearTimeout(skeletonTimer);
      const error = err as Error;

      if (error.name !== 'AbortError') {
        dispatch({
          type: 'SEND_ERROR',
          optimisticId,
          errorMessage: error.message || 'Failed to send message. Please try again.',
        });
      }
    }
  }

  /**
   * Handles an Adaptive Card submit action (UI-07, UI-08, UI-10).
   *
   * - Dispatches an optimistic 'cardSubmit' chip bubble immediately
   * - Shows skeleton loading after 300ms delay
   * - Calls sendCardAction with retry
   * - On success: marks chip as 'sent', appends bot response messages
   * - On error: marks chip as 'error' with inline message
   */
  async function cardAction(
    cardId: string,
    userSummary: string,
    submitData: Record<string, unknown>,
  ): Promise<void> {
    if (!state.conversationId) return;

    // 1. Generate optimistic chip bubble
    const optimisticId = crypto.randomUUID();
    const optimisticMessage: TranscriptMessage = {
      id: optimisticId,
      role: 'user',
      kind: 'text',
      text: userSummary,
      status: 'sending',
      subKind: 'cardSubmit',
    };

    // 2. Dispatch chip immediately
    dispatch({ type: 'ADD_OPTIMISTIC_MESSAGE', message: optimisticMessage });

    // 3. Schedule skeleton after 300ms
    const skeletonTimer = setTimeout(() => {
      dispatch({ type: 'START_LOADING' });
    }, SKELETON_DELAY_MS);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // 4. Acquire token then fetch with retry
      const token = await getToken();
      const data = await fetchWithRetry(
        (signal) =>
          sendCardAction(state.conversationId!, cardId, userSummary, submitData, token, signal),
        controller.signal,
      );

      clearTimeout(skeletonTimer);

      // Dispatch success with current phase for dividers (TRANS-01)
      dispatch({
        type: 'CARD_ACTION_SUCCESS',
        optimisticId,
        botMessages: data.messages,
        currentPhase: data.workflowState?.currentPhase,
      });
      if (data.workflowState) {
        dispatch({ type: 'SET_WORKFLOW_STATE', workflowState: data.workflowState });
      }
    } catch (err) {
      clearTimeout(skeletonTimer);
      const error = err as Error;

      if (error.name !== 'AbortError') {
        dispatch({
          type: 'SEND_ERROR',
          optimisticId,
          errorMessage: error.message || 'Failed to submit card. Please try again.',
        });
      }
    }
  }

  /**
   * Resets conversation state to initial — clears messages, workflowState, and conversationId.
   * Use when starting a fresh conversation (STATE-02).
   */
  function resetConversation(): void {
    dispatch({ type: 'RESET_CONVERSATION' });
  }

  return {
    conversationId: state.conversationId,
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    workflowState: state.workflowState,
    sendMessage: send,
    cardAction,
    resetConversation,
  };
}
