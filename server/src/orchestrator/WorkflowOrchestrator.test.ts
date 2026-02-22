import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Activity } from '@microsoft/agents-activity';
import type { WorkflowState } from '@copilot-chat/shared';
import type { WorkflowStateStore } from '../store/WorkflowStateStore.js';
import type { ConversationStore } from '../store/ConversationStore.js';
import type { ConversationLock } from '../lock/ConversationLock.js';
import type { CopilotStudioClient } from '@microsoft/agents-copilotstudio-client';
import { WorkflowOrchestrator } from './WorkflowOrchestrator.js';
import { DEFAULT_WORKFLOW_DEFINITION } from '../workflow/workflowDefinition.js';

// ── Mock helpers ──

/** Produces a minimal bot Activity with text content */
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

// ── Shared mocks ──

let mockWorkflowStore: {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
let mockConversationStore: {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  listByUser: ReturnType<typeof vi.fn>;
};
let mockRelease: ReturnType<typeof vi.fn>;
let mockLock: { acquire: ReturnType<typeof vi.fn> };
let mockCopilotClient: {
  startConversationStreaming: ReturnType<typeof vi.fn>;
  sendActivityStreaming: ReturnType<typeof vi.fn>;
};

let orchestrator: WorkflowOrchestrator;

const CONV_ID = 'conv-001';
const USER_ID = 'user-42';
const TENANT_ID = 'tenant-7';

/** Builds a baseline WorkflowState for tests that need existing state */
function baseState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    step: 'gather_info',
    collectedData: {},
    turnCount: 1,
    status: 'active',
    userId: USER_ID,
    tenantId: TENANT_ID,
    ...overrides,
  };
}

beforeEach(() => {
  mockWorkflowStore = {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  mockConversationStore = {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    listByUser: vi.fn().mockResolvedValue([]),
  };

  mockRelease = vi.fn().mockResolvedValue(undefined);
  mockLock = {
    acquire: vi.fn().mockResolvedValue(mockRelease),
  };

  // Default: copilot returns a simple text reply
  mockCopilotClient = {
    startConversationStreaming: vi
      .fn()
      .mockReturnValue(mockStream([botActivity('Welcome!')])),
    sendActivityStreaming: vi
      .fn()
      .mockReturnValue(mockStream([botActivity('Got it.')])),
  };

  orchestrator = new WorkflowOrchestrator({
    workflowStore: mockWorkflowStore as unknown as WorkflowStateStore,
    conversationStore: mockConversationStore as unknown as ConversationStore,
    copilotClient: mockCopilotClient as unknown as CopilotStudioClient,
    lock: mockLock as unknown as ConversationLock,
    config: { workflowDefinition: DEFAULT_WORKFLOW_DEFINITION },
  });
});

// ── Tests ──

describe('WorkflowOrchestrator', () => {
  // 1. startSession
  it('startSession creates initial WorkflowState scoped to userId and tenantId', async () => {
    const state = await orchestrator.startSession({
      conversationId: CONV_ID,
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    // Verify initial state saved
    expect(mockWorkflowStore.set).toHaveBeenCalledOnce();
    const [savedId, savedState] = mockWorkflowStore.set.mock.calls[0];
    expect(savedId).toBe(CONV_ID);
    expect(savedState).toMatchObject({
      step: 'initial',
      collectedData: {},
      turnCount: 0,
      status: 'active',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    // Verify conversation record created
    expect(mockConversationStore.set).toHaveBeenCalledOnce();
    const [convId, convRecord] = mockConversationStore.set.mock.calls[0];
    expect(convId).toBe(CONV_ID);
    expect(convRecord.externalId).toBe(CONV_ID);
    expect(convRecord.userId).toBe(USER_ID);
    expect(convRecord.tenantId).toBe(TENANT_ID);

    // Verify returned state
    expect(state.step).toBe('initial');
    expect(state.turnCount).toBe(0);
  });

  // 2. processTurn full loop
  it('processTurn executes full loop and returns WorkflowResponse', async () => {
    mockWorkflowStore.get.mockResolvedValue(baseState());

    const response = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'Hello',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    // Lock acquired and released
    expect(mockLock.acquire).toHaveBeenCalledWith(CONV_ID);
    expect(mockRelease).toHaveBeenCalledOnce();

    // State read and saved
    expect(mockWorkflowStore.get).toHaveBeenCalledWith(CONV_ID);
    expect(mockWorkflowStore.set).toHaveBeenCalledOnce();

    // Copilot called
    expect(mockCopilotClient.sendActivityStreaming).toHaveBeenCalledOnce();

    // Turn count incremented
    const savedState = mockWorkflowStore.set.mock.calls[0][1] as WorkflowState;
    expect(savedState.turnCount).toBe(2); // was 1, now 2

    // Response shape
    expect(response).toHaveProperty('conversationId', CONV_ID);
    expect(response).toHaveProperty('messages');
    expect(response).toHaveProperty('parsedTurn');
    expect(response).toHaveProperty('workflowState');
    expect(response).toHaveProperty('progress');
    expect(response).toHaveProperty('turnMeta');
    expect(response).toHaveProperty('latencyMs');
    expect(response.messages.length).toBeGreaterThan(0);
  });

  // 3. context enrichment
  it('processTurn enriches query with accumulated context', async () => {
    mockWorkflowStore.get.mockResolvedValue(
      baseState({ collectedData: { name: 'Alice' } })
    );

    await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'next question',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    // The activity sent to copilot should contain context preamble
    const sentActivity = mockCopilotClient.sendActivityStreaming.mock.calls[0][0] as Activity;
    expect(sentActivity.text).toContain('Phase:');
    expect(sentActivity.text).toContain('"name":"Alice"');
    expect(sentActivity.text).toContain('next question');
  });

  // 4. data merging
  it('processTurn merges new data into collectedData', async () => {
    mockWorkflowStore.get.mockResolvedValue(
      baseState({ collectedData: { name: 'Alice' } })
    );

    // Copilot returns structured response with data
    mockCopilotClient.sendActivityStreaming.mockReturnValue(
      mockStream([
        botActivity('Here you go', {
          action: 'ask',
          data: { age: 30 },
        }),
      ])
    );

    const response = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'tell me more',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    // Saved state has merged data
    const savedState = mockWorkflowStore.set.mock.calls[0][1] as WorkflowState;
    expect(savedState.collectedData).toEqual({ name: 'Alice', age: 30 });

    // TurnMeta reflects the delta
    expect(response.turnMeta.collectedThisTurn).toEqual({ age: 30 });
    expect(response.turnMeta.stateChanged).toBe(true);
  });

  // 5. passthrough response
  it('processTurn with passthrough response does not modify collectedData', async () => {
    mockWorkflowStore.get.mockResolvedValue(
      baseState({ collectedData: { name: 'Alice' } })
    );

    // Copilot returns plain text (no structured data)
    mockCopilotClient.sendActivityStreaming.mockReturnValue(
      mockStream([botActivity('Just some text')])
    );

    const response = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'chat',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    const savedState = mockWorkflowStore.set.mock.calls[0][1] as WorkflowState;
    expect(savedState.collectedData).toEqual({ name: 'Alice' });
    expect(response.turnMeta.stateChanged).toBe(false);
    expect(response.turnMeta.collectedThisTurn).toEqual({});
  });

  // 6. processCardAction
  it('processCardAction flows through orchestrator', async () => {
    mockWorkflowStore.get.mockResolvedValue(baseState());

    const response = await orchestrator.processCardAction({
      conversationId: CONV_ID,
      cardId: 'card-1',
      userSummary: 'User selected option A',
      submitData: { choice: 'A' },
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    // Lock acquired and released
    expect(mockLock.acquire).toHaveBeenCalledWith(CONV_ID);
    expect(mockRelease).toHaveBeenCalledOnce();

    // Copilot called with activity containing submitData
    const sentActivity = mockCopilotClient.sendActivityStreaming.mock.calls[0][0] as Activity;
    expect(sentActivity.text).toBe('User selected option A');
    expect((sentActivity as Record<string, unknown>).value).toEqual({
      choice: 'A',
      cardId: 'card-1',
    });

    // Response has expected shape
    expect(response.conversationId).toBe(CONV_ID);
    expect(response.messages.length).toBeGreaterThan(0);
    expect(response.workflowState.turnCount).toBe(2);
  });

  // 7. rollback on failure
  it('processTurn rolls back on Copilot failure — state NOT saved', async () => {
    mockWorkflowStore.get.mockResolvedValue(baseState());
    mockCopilotClient.sendActivityStreaming.mockImplementation(() => {
      throw new Error('Copilot timeout');
    });

    await expect(
      orchestrator.processTurn({
        conversationId: CONV_ID,
        text: 'Hello',
        userId: USER_ID,
        tenantId: TENANT_ID,
      })
    ).rejects.toThrow('Copilot timeout');

    // State NOT saved
    expect(mockWorkflowStore.set).not.toHaveBeenCalled();

    // Lock still released (cleanup in finally)
    expect(mockRelease).toHaveBeenCalledOnce();
  });

  // 8. lock ordering
  it('processTurn acquires lock before state read and releases after save', async () => {
    const callOrder: string[] = [];

    mockLock.acquire.mockImplementation(async () => {
      callOrder.push('acquire');
      return async () => {
        callOrder.push('release');
      };
    });
    mockWorkflowStore.get.mockImplementation(async () => {
      callOrder.push('get');
      return baseState();
    });
    mockWorkflowStore.set.mockImplementation(async () => {
      callOrder.push('set');
    });
    mockCopilotClient.sendActivityStreaming.mockReturnValue(
      mockStream([botActivity('OK')])
    );

    await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'test',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(callOrder).toEqual(['acquire', 'get', 'set', 'release']);
  });

  // 9. initial state creation when none exists
  it('processTurn creates initial state if none exists', async () => {
    // workflowStore.get returns undefined (new conversation)
    mockWorkflowStore.get.mockResolvedValue(undefined);

    await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'first message',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    // Saved state should be initial with turnCount=1
    const savedState = mockWorkflowStore.set.mock.calls[0][1] as WorkflowState;
    expect(savedState.step).toBe('initial');
    expect(savedState.turnCount).toBe(1);
    expect(savedState.userId).toBe(USER_ID);
    expect(savedState.tenantId).toBe(TENANT_ID);
    expect(savedState.status).toBe('active');
  });

  // 10. progress reflects step position
  it('processTurn progress reflects step position in definition', async () => {
    // 'confirm' is index 3 in the default 5-step definition
    mockWorkflowStore.get.mockResolvedValue(baseState({ step: 'confirm' }));

    // Return structured with action 'confirm' to keep step at confirm
    mockCopilotClient.sendActivityStreaming.mockReturnValue(
      mockStream([botActivity('Confirm this?', { action: 'confirm' })])
    );

    const response = await orchestrator.processTurn({
      conversationId: CONV_ID,
      text: 'yes',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(response.progress.percentComplete).toBe(60); // 3/5 * 100
    expect(response.progress.totalSteps).toBe(5);
    expect(response.progress.currentStep).toBe('confirm');
    expect(response.progress.stepIndex).toBe(3);
  });
});
