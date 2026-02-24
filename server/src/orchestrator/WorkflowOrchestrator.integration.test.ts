import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkflowState, NormalizedMessage } from '@copilot-chat/shared';
import type { WorkflowStateStore } from '../store/WorkflowStateStore.js';
import type { ConversationStore } from '../store/ConversationStore.js';
import type { ConversationLock } from '../lock/ConversationLock.js';
import type { LlmProvider } from '../provider/LlmProvider.js';
import { WorkflowOrchestrator } from './WorkflowOrchestrator.js';
import { DEFAULT_WORKFLOW_DEFINITION } from '../workflow/workflowDefinition.js';

/**
 * Integration test for WorkflowOrchestrator multi-turn data accumulation.
 *
 * Demonstrates multi-turn workflow through orchestrator with mocked LlmProvider:
 * - TEST-03 (v1.5): collectedData accumulates across 3+ sequential processTurn calls
 * - TEST-04 (v1.7): multi-turn conversation drives workflow to completion
 *
 * Uses fully mocked dependencies (no real Redis, no real LLM calls).
 * Mock stores use real Map operations for state persistence across calls.
 *
 * TEST-03 (v1.5), TEST-04 (v1.7)
 */

// ── Mock helpers ──

/** Counter for unique IDs in test messages */
let msgCounter = 0;

/** Produces a NormalizedMessage with optional extractedPayload (for structured responses) */
function textMessage(
  text: string,
  structuredData?: Record<string, unknown>
): NormalizedMessage {
  msgCounter++;
  return {
    id: `00000000-0000-0000-0000-${String(msgCounter).padStart(12, '0')}`,
    role: 'assistant' as const,
    kind: 'text' as const,
    text,
    ...(structuredData
      ? {
          extractedPayload: {
            source: 'value' as const,
            confidence: 'high' as const,
            data: structuredData,
          },
        }
      : {}),
  };
}

// ── In-memory store helpers ──

/**
 * Build a workflow store backed by a real Map so state persists across calls.
 * vi.fn() wrappers track call counts without interfering with Map operations.
 */
function makeWorkflowStore(): {
  store: Map<string, WorkflowState>;
  mock: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
} {
  const store = new Map<string, WorkflowState>();
  const mock = {
    get: vi.fn(async (id: string) => store.get(id)),
    set: vi.fn(async (id: string, state: WorkflowState) => {
      store.set(id, state);
    }),
    delete: vi.fn(async (id: string) => {
      store.delete(id);
    }),
  };
  return { store, mock };
}

/**
 * Build a conversation store backed by a real Map.
 */
function makeConversationStore(): {
  mock: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    listByUser: ReturnType<typeof vi.fn>;
  };
} {
  const store = new Map<string, unknown>();
  const mock = {
    get: vi.fn(async (id: string) => store.get(id)),
    set: vi.fn(async (id: string, val: unknown) => {
      store.set(id, val);
    }),
    delete: vi.fn(async (id: string) => {
      store.delete(id);
    }),
    listByUser: vi.fn(async () => []),
  };
  return { mock };
}

// ── Shared test constants ──

const CONV_ID = 'conv-integration-001';
const USER_ID = 'user-alice';
const TENANT_ID = 'tenant-test';

// ── Test suite ──

describe('WorkflowOrchestrator integration — multi-turn data accumulation', () => {
  let workflowStoreMock: ReturnType<typeof makeWorkflowStore>['mock'];
  let conversationStoreMock: ReturnType<typeof makeConversationStore>['mock'];
  let mockRelease: ReturnType<typeof vi.fn>;
  let mockLock: { acquire: ReturnType<typeof vi.fn> };
  let mockLlmProvider: {
    startSession: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    sendCardAction: ReturnType<typeof vi.fn>;
  };
  let orchestrator: WorkflowOrchestrator;

  beforeEach(() => {
    msgCounter = 0;

    const wfStore = makeWorkflowStore();
    workflowStoreMock = wfStore.mock;

    const convStore = makeConversationStore();
    conversationStoreMock = convStore.mock;

    mockRelease = vi.fn().mockResolvedValue(undefined);
    mockLock = {
      acquire: vi.fn().mockResolvedValue(mockRelease),
    };

    mockLlmProvider = {
      startSession: vi.fn().mockResolvedValue([textMessage('Welcome!')]),
      sendMessage: vi.fn(),
      sendCardAction: vi.fn().mockResolvedValue([textMessage('Card response')]),
    };

    orchestrator = new WorkflowOrchestrator({
      workflowStore: workflowStoreMock as unknown as WorkflowStateStore,
      conversationStore: conversationStoreMock as unknown as ConversationStore,
      llmProvider: mockLlmProvider as unknown as LlmProvider,
      lock: mockLock as unknown as ConversationLock,
      config: { workflowDefinition: DEFAULT_WORKFLOW_DEFINITION },
    });
  });

  // ────────────────────────────────────────────────────────────────
  // TEST-03: 3-turn data accumulation
  // ────────────────────────────────────────────────────────────────

  it('accumulates collectedData across 3 turns and includes prior data in each query preamble', async () => {
    // Turn 1: LLM returns name=Alice
    mockLlmProvider.sendMessage.mockResolvedValueOnce([
      textMessage('What is your age?', {
        action: 'ask',
        data: { name: 'Alice' },
        prompt: 'What is your age?',
      }),
    ]);

    // Turn 2: LLM returns age=30
    mockLlmProvider.sendMessage.mockResolvedValueOnce([
      textMessage('What is your location?', {
        action: 'ask',
        data: { age: 30 },
        prompt: 'What is your location?',
      }),
    ]);

    // Turn 3: LLM returns location=Seattle, completes workflow
    mockLlmProvider.sendMessage.mockResolvedValueOnce([
      textMessage('Thank you!', {
        action: 'complete',
        data: { location: 'Seattle' },
      }),
    ]);

    // ── Turn 1 ──
    const turn1Result = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'My name is Alice',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(turn1Result.workflowState.collectedData).toEqual({ name: 'Alice' });

    // ── Turn 2 ──
    const turn2Result = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'I am 30',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(turn2Result.workflowState.collectedData).toEqual({
      name: 'Alice',
      age: 30,
    });

    // Query sent on turn 2 should include context preamble with turn-1 data
    const turn2Query = mockLlmProvider.sendMessage.mock.calls[1][1] as string;
    expect(turn2Query).toContain('[CONTEXT]');
    expect(turn2Query).toContain('name');

    // ── Turn 3 ──
    const turn3Result = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'I am in Seattle',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(turn3Result.workflowState.collectedData).toEqual({
      name: 'Alice',
      age: 30,
      location: 'Seattle',
    });

    // Workflow driven to completion (TEST-04): step should be 'complete'
    expect(turn3Result.workflowState.step).toBe('complete');

    // Query sent on turn 3 should include context preamble with turns 1+2 data
    const turn3Query = mockLlmProvider.sendMessage.mock.calls[2][1] as string;
    expect(turn3Query).toContain('[CONTEXT]');
    expect(turn3Query).toContain('name');
    expect(turn3Query).toContain('age');

    // All three processTurn calls resolved without throwing — verified by reaching here
    expect(mockLlmProvider.sendMessage).toHaveBeenCalledTimes(3);
    expect(mockRelease).toHaveBeenCalledTimes(3);
  });

  // ────────────────────────────────────────────────────────────────
  // TEST-03 companion: turn count increments correctly
  // ────────────────────────────────────────────────────────────────

  it('increments turnCount on each successive processTurn call', async () => {
    // Three identical plain-text responses
    for (let i = 0; i < 3; i++) {
      mockLlmProvider.sendMessage.mockResolvedValueOnce([
        textMessage('Reply ' + (i + 1)),
      ]);
    }

    const r1 = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'turn 1',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });
    const r2 = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'turn 2',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });
    const r3 = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'turn 3',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(r1.workflowState.turnCount).toBe(1);
    expect(r2.workflowState.turnCount).toBe(2);
    expect(r3.workflowState.turnCount).toBe(3);
  });

  // ────────────────────────────────────────────────────────────────
  // Passthrough mode: plain text leaves collectedData empty
  // ────────────────────────────────────────────────────────────────

  it('passthrough mode — plain text response leaves collectedData empty', async () => {
    // No extractedPayload → parseTurn produces passthrough
    mockLlmProvider.sendMessage.mockResolvedValueOnce([
      textMessage('Just a plain text response, no structured data'),
    ]);

    const result = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'Hello',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    // parsedTurn kind is passthrough
    expect(result.parsedTurn.kind).toBe('passthrough');

    // collectedData is empty (no data collected)
    expect(result.workflowState.collectedData).toEqual({});

    // response contains the plain text message
    expect(result.messages.length).toBeGreaterThan(0);
    const textMsg = result.messages.find(
      (m) => m.text === 'Just a plain text response, no structured data'
    );
    expect(textMsg).toBeDefined();

    // turnMeta reflects no state change
    expect(result.turnMeta.stateChanged).toBe(false);
    expect(result.turnMeta.collectedThisTurn).toEqual({});
  });

  // ────────────────────────────────────────────────────────────────
  // parse_error kind: structured output with invalid action
  // ────────────────────────────────────────────────────────────────

  it('parse_error kind — invalid action in response does not throw, collectedData unchanged', async () => {
    // extractedPayload.data has an invalid action enum value
    mockLlmProvider.sendMessage.mockResolvedValueOnce([
      textMessage('Bad response', {
        action: 'INVALID_ACTION_VALUE',
        data: { shouldNotBeCollected: true },
      }),
    ]);

    const result = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'trigger error path',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    // Does not throw — verified by reaching here
    expect(result.parsedTurn.kind).toBe('parse_error');

    // Data was NOT collected due to parse error
    expect(result.workflowState.collectedData).toEqual({});

    // turnMeta reflects no state change
    expect(result.turnMeta.stateChanged).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────
  // All three kinds exercised without throwing (consolidated)
  // ────────────────────────────────────────────────────────────────

  it('exercises passthrough, structured, and parse_error kinds without throwing', async () => {
    // passthrough
    mockLlmProvider.sendMessage.mockResolvedValueOnce([
      textMessage('Plain text'),
    ]);
    // structured
    mockLlmProvider.sendMessage.mockResolvedValueOnce([
      textMessage('Structured', {
        action: 'ask',
        data: { field: 'value' },
      }),
    ]);
    // parse_error
    mockLlmProvider.sendMessage.mockResolvedValueOnce([
      textMessage('Error', {
        action: 'UNKNOWN_INVALID',
      }),
    ]);

    const passthroughResult = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'a',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });
    const structuredResult = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'b',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });
    const parseErrorResult = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'c',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(passthroughResult.parsedTurn.kind).toBe('passthrough');
    expect(structuredResult.parsedTurn.kind).toBe('structured');
    expect(parseErrorResult.parsedTurn.kind).toBe('parse_error');

    // All resolved without throwing — verified by reaching here
    expect(mockLlmProvider.sendMessage).toHaveBeenCalledTimes(3);
  });
});
