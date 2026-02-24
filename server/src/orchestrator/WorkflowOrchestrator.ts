import type { WorkflowState, NormalizedMessage } from '@copilot-chat/shared';

import type { LlmProvider } from '../provider/LlmProvider.js';
import type { WorkflowStateStore } from '../store/WorkflowStateStore.js';
import type { ConversationStore } from '../store/ConversationStore.js';
import type { ConversationLock } from '../lock/ConversationLock.js';
import { parseTurn } from '../parser/structuredOutputParser.js';
import { buildContextualQuery } from '../workflow/contextBuilder.js';
import {
  DEFAULT_WORKFLOW_DEFINITION,
  getStepProgress,
  type WorkflowDefinition,
} from '../workflow/workflowDefinition.js';
import type { ContextBuilderConfig } from '../workflow/contextBuilder.js';
import type {
  WorkflowResponse,
  ProcessTurnParams,
  ProcessCardActionParams,
  OrchestratorConfig,
  TurnMeta,
} from './types.js';

/**
 * Map nextAction values from ParsedTurn to workflow definition step IDs.
 *
 * When the structured output contains an `action` field, this maps it
 * to the corresponding step in the workflow definition. Null (passthrough)
 * keeps the current step unchanged.
 */
const ACTION_TO_STEP: Record<string, string> = {
  ask: 'gather_info',
  research: 'research',
  confirm: 'confirm',
  complete: 'complete',
  error: 'initial',
};

/**
 * WorkflowOrchestrator — core per-turn orchestration service.
 *
 * Manages the complete workflow loop:
 * 1. Acquire per-conversation lock
 * 2. Load workflow state from store
 * 3. Enrich outbound query with accumulated context
 * 4. Call LLM provider
 * 5. Parse structured output from normalized messages
 * 6. Merge collected data (shallow merge)
 * 7. Save updated state (single save point — rollback on failure)
 * 8. Release lock
 * 9. Return WorkflowResponse
 *
 * All dependencies are constructor-injected for testability.
 * The orchestrator is backend-agnostic — it accepts any LlmProvider implementation.
 *
 * ORCH-01, ORCH-02, ORCH-03, ORCH-06, PROV-03
 */
export class WorkflowOrchestrator {
  private readonly workflowStore: WorkflowStateStore;
  private readonly conversationStore: ConversationStore;
  private readonly llmProvider: LlmProvider;
  private readonly lock: ConversationLock;
  private readonly definition: WorkflowDefinition;
  private readonly contextConfig?: ContextBuilderConfig;

  constructor(deps: {
    workflowStore: WorkflowStateStore;
    conversationStore: ConversationStore;
    llmProvider: LlmProvider;
    lock: ConversationLock;
    config?: OrchestratorConfig;
  }) {
    this.workflowStore = deps.workflowStore;
    this.conversationStore = deps.conversationStore;
    this.llmProvider = deps.llmProvider;
    this.lock = deps.lock;
    this.definition = deps.config?.workflowDefinition ?? DEFAULT_WORKFLOW_DEFINITION;
    this.contextConfig = deps.config?.contextBuilderConfig;
  }

  /**
   * Start a new workflow session.
   *
   * Creates initial WorkflowState scoped to userId/tenantId, saves it to the
   * workflow store, starts a conversation via the LLM provider, and creates a
   * conversation record for history tracking.
   *
   * ORCH-01
   */
  async startSession(params: {
    conversationId: string;
    userId: string;
    tenantId: string;
  }): Promise<WorkflowState> {
    const { conversationId, userId, tenantId } = params;

    // Create initial workflow state
    const initialState: WorkflowState = {
      step: 'initial',
      collectedData: {},
      turnCount: 0,
      status: 'active',
      userId,
      tenantId,
    };

    // Save workflow state
    await this.workflowStore.set(conversationId, initialState);

    // Start conversation via LLM provider and collect greeting messages
    const greetingMessages = await this.llmProvider.startSession(conversationId);

    // Create conversation record
    const now = new Date().toISOString();
    await this.conversationStore.set(conversationId, {
      externalId: conversationId,
      sdkConversationRef: greetingMessages,
      history: [],
      userId,
      tenantId,
      createdAt: now,
      updatedAt: now,
      status: 'active',
    });

    return initialState;
  }

  /**
   * Process a user text turn through the full orchestration loop.
   *
   * Acquires lock -> loads state -> enriches query -> calls LLM provider ->
   * parses -> merges data -> saves state -> releases lock.
   *
   * If any step after lock acquisition fails, state is NOT saved (rollback-on-failure).
   * Lock is always released in the finally block.
   *
   * ORCH-02, ORCH-06
   */
  async processTurn(params: ProcessTurnParams): Promise<WorkflowResponse> {
    const { conversationId, text, userId, tenantId } = params;

    const release = await this.lock.acquire(conversationId);

    try {
      // Load existing state or create initial
      let state = await this.workflowStore.get(conversationId);
      if (!state) {
        state = {
          step: 'initial',
          collectedData: {},
          turnCount: 0,
          status: 'active',
          userId,
          tenantId,
        };
      }

      // Enrich query with accumulated context
      const { query } = buildContextualQuery(text, state, this.contextConfig);

      const t0 = performance.now();

      // Send enriched query to LLM provider
      const messages: NormalizedMessage[] = await this.llmProvider.sendMessage(
        conversationId,
        query
      );

      const latencyMs = Math.round(performance.now() - t0);

      // Parse structured output
      const parsedTurn = await parseTurn(messages);

      // Compute data delta
      const newData: Record<string, unknown> = {};
      if (parsedTurn.kind === 'structured' && parsedTurn.data) {
        // Extract data fields from the structured output's data sub-object
        const structuredData = parsedTurn.data.data as Record<string, unknown> | undefined;
        if (structuredData && typeof structuredData === 'object') {
          Object.assign(newData, structuredData);
        }
      }

      // Merge data (shallow)
      const mergedData = { ...(state.collectedData ?? {}), ...newData };

      // Compute step from nextAction
      let updatedStep = state.step;
      if (parsedTurn.kind === 'structured' && parsedTurn.nextAction) {
        const mappedStep = ACTION_TO_STEP[parsedTurn.nextAction];
        if (mappedStep) {
          updatedStep = mappedStep;
        }
      }

      // Build updated state
      const updatedState: WorkflowState = {
        ...state,
        collectedData: mergedData,
        turnCount: state.turnCount + 1,
        step: updatedStep,
        currentPhase: updatedStep,
      };

      // Single save point — rollback-on-failure
      await this.workflowStore.set(conversationId, updatedState);

      // Update conversation history
      const existingConv = await this.conversationStore.get(conversationId);
      if (existingConv) {
        await this.conversationStore.set(conversationId, {
          ...existingConv,
          history: [...existingConv.history, ...messages],
          updatedAt: new Date().toISOString(),
        });
      }

      // Compute progress
      const progress = getStepProgress(updatedStep, this.definition);

      // Build turn metadata
      const turnMeta: TurnMeta = {
        turnNumber: updatedState.turnCount,
        stateChanged: Object.keys(newData).length > 0,
        collectedThisTurn: newData,
      };

      return {
        conversationId,
        messages,
        parsedTurn,
        workflowState: updatedState,
        progress,
        turnMeta,
        latencyMs,
      };
    } finally {
      await release();
    }
  }

  /**
   * Process a card action submission through the orchestration loop.
   *
   * Same lock-protected read-modify-write cycle as processTurn, but:
   * - Delegates to LlmProvider.sendCardAction with submitData payload
   * - No context enrichment (card actions carry their own context)
   *
   * ORCH-03
   */
  async processCardAction(params: ProcessCardActionParams): Promise<WorkflowResponse> {
    const { conversationId, cardId, submitData, userId, tenantId } = params;

    const release = await this.lock.acquire(conversationId);

    try {
      // Load existing state or create initial
      let state = await this.workflowStore.get(conversationId);
      if (!state) {
        state = {
          step: 'initial',
          collectedData: {},
          turnCount: 0,
          status: 'active',
          userId,
          tenantId,
        };
      }

      const t0 = performance.now();

      // Send card action to LLM provider
      const messages: NormalizedMessage[] = await this.llmProvider.sendCardAction(
        conversationId,
        { ...submitData, cardId }
      );

      const latencyMs = Math.round(performance.now() - t0);

      // Parse structured output
      const parsedTurn = await parseTurn(messages);

      // Compute data delta
      const newData: Record<string, unknown> = {};
      if (parsedTurn.kind === 'structured' && parsedTurn.data) {
        const structuredData = parsedTurn.data.data as Record<string, unknown> | undefined;
        if (structuredData && typeof structuredData === 'object') {
          Object.assign(newData, structuredData);
        }
      }

      // Merge data (shallow)
      const mergedData = { ...(state.collectedData ?? {}), ...newData };

      // Compute step from nextAction
      let updatedStep = state.step;
      if (parsedTurn.kind === 'structured' && parsedTurn.nextAction) {
        const mappedStep = ACTION_TO_STEP[parsedTurn.nextAction];
        if (mappedStep) {
          updatedStep = mappedStep;
        }
      }

      // Build updated state
      const updatedState: WorkflowState = {
        ...state,
        collectedData: mergedData,
        turnCount: state.turnCount + 1,
        step: updatedStep,
        currentPhase: updatedStep,
      };

      // Single save point
      await this.workflowStore.set(conversationId, updatedState);

      // Update conversation history
      const existingConv = await this.conversationStore.get(conversationId);
      if (existingConv) {
        await this.conversationStore.set(conversationId, {
          ...existingConv,
          history: [...existingConv.history, ...messages],
          updatedAt: new Date().toISOString(),
        });
      }

      // Compute progress
      const progress = getStepProgress(updatedStep, this.definition);

      // Build turn metadata
      const turnMeta: TurnMeta = {
        turnNumber: updatedState.turnCount,
        stateChanged: Object.keys(newData).length > 0,
        collectedThisTurn: newData,
      };

      return {
        conversationId,
        messages,
        parsedTurn,
        workflowState: updatedState,
        progress,
        turnMeta,
        latencyMs,
      };
    } finally {
      await release();
    }
  }
}
