import { z } from 'zod';
import { NormalizedMessageSchema } from './message.js';
import { ExtractedPayloadSchema } from './extractedPayload.js';
import { WorkflowContextSchema } from './workflowContext.js';
import { WorkflowStateSchema } from './workflowState.js';

/**
 * API endpoint request/response schemas.
 * All API endpoints are covered here.
 *
 * SCHEMA-02
 */

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/chat/start
// ──────────────────────────────────────────────────────────────────────────────

export const StartConversationResponseSchema = z.object({
  conversationId: z.string().uuid(),
});

export type StartConversationResponse = z.infer<typeof StartConversationResponseSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/chat/send
// ──────────────────────────────────────────────────────────────────────────────

export const SendMessageRequestSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1),
  workflowContext: WorkflowContextSchema.optional(),
});

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const SendMessageResponseSchema = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(NormalizedMessageSchema),
});

export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/chat/card-action
// ──────────────────────────────────────────────────────────────────────────────

export const CardActionRequestSchema = z.object({
  conversationId: z.string().uuid(),
  cardId: z.string(),
  /** Human-readable summary of what the user submitted — included in the Copilot transcript */
  userSummary: z.string(),
  /** Arbitrary submit payload from the Adaptive Card form */
  submitData: z.record(z.string(), z.unknown()),
});

export type CardActionRequest = z.infer<typeof CardActionRequestSchema>;

export const CardActionResponseSchema = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(NormalizedMessageSchema),
});

export type CardActionResponse = z.infer<typeof CardActionResponseSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/chat/orchestrate
// ──────────────────────────────────────────────────────────────────────────────

export const OrchestrateRequestSchema = z.object({
  query: z.string().min(1),
  workflowContext: WorkflowContextSchema.optional(),
});

export type OrchestrateRequest = z.infer<typeof OrchestrateRequestSchema>;

export const OrchestrateResponseSchema = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(NormalizedMessageSchema),
  extractedPayload: ExtractedPayloadSchema.nullable(),
  latencyMs: z.number().nonnegative(),
  workflowState: WorkflowStateSchema,
});

export type OrchestrateResponse = z.infer<typeof OrchestrateResponseSchema>;
