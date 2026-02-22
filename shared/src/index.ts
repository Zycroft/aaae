/**
 * @copilot-chat/shared — barrel export
 * Single source of truth for shared types between client and server.
 *
 * SCHEMA-03: Zod is a dep of shared/ only; re-exported types are plain TypeScript (no Zod runtime).
 * SCHEMA-04: All z.infer<> types are exported alongside their schemas.
 */

export {
  NormalizedMessageSchema,
  type NormalizedMessage,
} from './schemas/message.js';

export {
  ExtractedPayloadSchema,
  ExtractionConfidenceSchema,
  type ExtractedPayload,
  type ExtractionConfidence,
} from './schemas/extractedPayload.js';

export {
  UserClaimsSchema,
  type UserClaims,
} from './schemas/auth.js';

export {
  WorkflowContextSchema,
  type WorkflowContext,
} from './schemas/workflowContext.js';

export {
  WorkflowStateSchema,
  type WorkflowState,
} from './schemas/workflowState.js';

export {
  StoredConversationSchema,
  type StoredConversation,
} from './schemas/storedConversation.js';

export {
  NextActionSchema,
  type NextAction,
  CopilotStructuredOutputSchema,
  type CopilotStructuredOutput,
  ParsedTurnSchema,
  type ParsedTurn,
} from './schemas/workflow.js';

export {
  StartConversationResponseSchema,
  type StartConversationResponse,
  SendMessageRequestSchema,
  type SendMessageRequest,
  SendMessageResponseSchema,
  type SendMessageResponse,
  CardActionRequestSchema,
  type CardActionRequest,
  CardActionResponseSchema,
  type CardActionResponse,
  OrchestrateRequestSchema,
  type OrchestrateRequest,
  OrchestrateResponseSchema,
  type OrchestrateResponse,
} from './schemas/api.js';
