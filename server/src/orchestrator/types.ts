import type { NormalizedMessage, WorkflowState, ParsedTurn } from '@copilot-chat/shared';
import type { WorkflowDefinition, WorkflowProgress } from '../workflow/workflowDefinition.js';
import type { ContextBuilderConfig } from '../workflow/contextBuilder.js';

/**
 * TurnMeta — metadata about a specific orchestrator turn.
 *
 * Tells the client: which turn this is, whether state changed,
 * and exactly what data was collected in this turn (delta, not full state).
 *
 * ORCH-04
 */
export interface TurnMeta {
  /** Turn number (1-based) */
  turnNumber: number;
  /** Whether collectedData was modified this turn */
  stateChanged: boolean;
  /** New data collected THIS turn only (delta, not full state) */
  collectedThisTurn: Record<string, unknown>;
}

/**
 * WorkflowResponse — full orchestrator response returned from processTurn/processCardAction.
 *
 * Includes messages for display, parsed structured output, updated workflow state,
 * progress indicators, turn metadata, and latency measurement.
 *
 * ORCH-04
 */
export interface WorkflowResponse {
  /** Conversation identifier */
  conversationId: string;
  /** Normalized messages from Copilot response for UI display */
  messages: NormalizedMessage[];
  /** Parsed structured output from Copilot response */
  parsedTurn: ParsedTurn;
  /** Updated workflow state after this turn */
  workflowState: WorkflowState;
  /** Progress indicator based on step position in workflow definition */
  progress: WorkflowProgress;
  /** Metadata about this specific turn */
  turnMeta: TurnMeta;
  /** Round-trip latency for the Copilot call in milliseconds */
  latencyMs: number;
}

/**
 * ProcessTurnParams — input for WorkflowOrchestrator.processTurn().
 */
export interface ProcessTurnParams {
  /** Conversation identifier */
  conversationId: string;
  /** User's text message */
  text: string;
  /** User identifier (from JWT claims) */
  userId: string;
  /** Tenant identifier (from JWT claims) */
  tenantId: string;
}

/**
 * ProcessCardActionParams — input for WorkflowOrchestrator.processCardAction().
 */
export interface ProcessCardActionParams {
  /** Conversation identifier */
  conversationId: string;
  /** Server-assigned card identifier for action routing */
  cardId: string;
  /** Human-readable summary of the card submission */
  userSummary: string;
  /** Arbitrary submit payload from the Adaptive Card form */
  submitData: Record<string, unknown>;
  /** User identifier (from JWT claims) */
  userId: string;
  /** Tenant identifier (from JWT claims) */
  tenantId: string;
}

/**
 * OrchestratorConfig — configuration for the WorkflowOrchestrator.
 */
export interface OrchestratorConfig {
  /** Workflow step definitions (optional, defaults to DEFAULT_WORKFLOW_DEFINITION) */
  workflowDefinition?: WorkflowDefinition;
  /** Context builder configuration (preamble template and maxLength) */
  contextBuilderConfig?: ContextBuilderConfig;
  /** Lock timeout override in milliseconds (default from ConversationLock) */
  lockTtlMs?: number;
}
