import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Activity } from '@microsoft/agents-activity';
import type { WorkflowState } from '@copilot-chat/shared';
import type { WorkflowStateStore } from '../store/WorkflowStateStore.js';
import type { ConversationStore } from '../store/ConversationStore.js';
import type { ConversationLock } from '../lock/ConversationLock.js';
import type { CopilotStudioClient } from '@microsoft/agents-copilotstudio-client';
import { WorkflowOrchestrator } from './WorkflowOrchestrator.js';
import { DEFAULT_WORKFLOW_DEFINITION } from '../workflow/workflowDefinition.js';

/**
 * Integration test for WorkflowOrchestrator multi-turn data accumulation.
 *
 * Demonstrates TEST-03: collectedData accumulates across 3+ sequential
 * processTurn calls and appears in successive Copilot query preambles.
 *
 * Uses fully mocked dependencies (no real Redis, no real Copilot calls).
 * Mock stores use real Map operations for state persistence across calls.
 *
 * TEST-03
 */

// ── Mock helpers ──

/** Produces a minimal bot Activity with optional structured value */
function botActivity(text: string, value?: Record<string, unknown>): Activity {
  return {
    type: 'message',
    text,
    from: { role: 'bot' },
    ...(value !== undefined ? { value } : {}),
  } as unknown as Activity;
}

/** Creates an async generator yielding activities one by one */
async function* mockStream(activities: Activity[]): AsyncGenerator<Activity> {
  for (const a of activities) yield a;
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
  let mockCopilotClient: {
    startConversationStreaming: ReturnType<typeof vi.fn>;
    sendActivityStreaming: ReturnType<typeof vi.fn>;
  };
  let orchestrator: WorkflowOrchestrator;

  beforeEach(() => {
    const wfStore = makeWorkflowStore();
    workflowStoreMock = wfStore.mock;

    const convStore = makeConversationStore();
    conversationStoreMock = convStore.mock;

    mockRelease = vi.fn().mockResolvedValue(undefined);
    mockLock = {
      acquire: vi.fn().mockResolvedValue(mockRelease),
    };

    mockCopilotClient = {
      startConversationStreaming: vi
        .fn()
        .mockReturnValue(mockStream([botActivity('Welcome!')])),
      sendActivityStreaming: vi.fn(),
    };

    orchestrator = new WorkflowOrchestrator({
      workflowStore: workflowStoreMock as unknown as WorkflowStateStore,
      conversationStore: conversationStoreMock as unknown as ConversationStore,
      copilotClient: mockCopilotClient as unknown as CopilotStudioClient,
      lock: mockLock as unknown as ConversationLock,
      config: { workflowDefinition: DEFAULT_WORKFLOW_DEFINITION },
    });
  });

  // ────────────────────────────────────────────────────────────────
  // TEST-03: 3-turn data accumulation
  // ────────────────────────────────────────────────────────────────

  it('accumulates collectedData across 3 turns and includes prior data in each query preamble', async () => {
    // Turn 1: Copilot returns name=Alice
    mockCopilotClient.sendActivityStreaming.mockReturnValueOnce(
      mockStream([
        botActivity('What is your age?', {
          action: 'ask',
          data: { name: 'Alice' },
          prompt: 'What is your age?',
        }),
      ])
    );

    // Turn 2: Copilot returns age=30
    mockCopilotClient.sendActivityStreaming.mockReturnValueOnce(
      mockStream([
        botActivity('What is your location?', {
          action: 'ask',
          data: { age: 30 },
          prompt: 'What is your location?',
        }),
      ])
    );

    // Turn 3: Copilot returns location=Seattle, completes workflow
    mockCopilotClient.sendActivityStreaming.mockReturnValueOnce(
      mockStream([
        botActivity('Thank you!', {
          action: 'complete',
          data: { location: 'Seattle' },
        }),
      ])
    );

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
    const turn2Activity =
      mockCopilotClient.sendActivityStreaming.mock.calls[1][0] as Activity;
    expect(turn2Activity.text).toContain('[CONTEXT]');
    expect(turn2Activity.text).toContain('name');

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

    // Query sent on turn 3 should include context preamble with turns 1+2 data
    const turn3Activity =
      mockCopilotClient.sendActivityStreaming.mock.calls[2][0] as Activity;
    expect(turn3Activity.text).toContain('[CONTEXT]');
    expect(turn3Activity.text).toContain('name');
    expect(turn3Activity.text).toContain('age');

    // All three processTurn calls resolved without throwing — verified by reaching here
    expect(mockCopilotClient.sendActivityStreaming).toHaveBeenCalledTimes(3);
    expect(mockRelease).toHaveBeenCalledTimes(3);
  });

  // ────────────────────────────────────────────────────────────────
  // TEST-03 companion: turn count increments correctly
  // ────────────────────────────────────────────────────────────────

  it('increments turnCount on each successive processTurn call', async () => {
    // Three identical plain-text responses
    for (let i = 0; i < 3; i++) {
      mockCopilotClient.sendActivityStreaming.mockReturnValueOnce(
        mockStream([botActivity('Reply ' + (i + 1))])
      );
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
    // No value field → activity normalizer produces no extractedPayload
    mockCopilotClient.sendActivityStreaming.mockReturnValueOnce(
      mockStream([botActivity('Just a plain text response, no structured data')])
    );

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
    // activity.value has an invalid action enum value
    mockCopilotClient.sendActivityStreaming.mockReturnValueOnce(
      mockStream([
        botActivity('Bad response', {
          action: 'INVALID_ACTION_VALUE',
          data: { shouldNotBeCollected: true },
        }),
      ])
    );

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
    mockCopilotClient.sendActivityStreaming.mockReturnValueOnce(
      mockStream([botActivity('Plain text')])
    );
    // structured
    mockCopilotClient.sendActivityStreaming.mockReturnValueOnce(
      mockStream([
        botActivity('Structured', {
          action: 'ask',
          data: { field: 'value' },
        }),
      ])
    );
    // parse_error
    mockCopilotClient.sendActivityStreaming.mockReturnValueOnce(
      mockStream([
        botActivity('Error', {
          action: 'UNKNOWN_INVALID',
        }),
      ])
    );

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
    expect(mockCopilotClient.sendActivityStreaming).toHaveBeenCalledTimes(3);
  });
});
