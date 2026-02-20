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
} from './schemas/api.js';
