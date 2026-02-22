import { z } from 'zod';
import { NormalizedMessageSchema } from './message.js';

/**
 * StoredConversation — the persistent entity for a conversation.
 *
 * Combines transport data (externalId, sdkConversationRef, history) with
 * persistence metadata (userId, tenantId, timestamps, status) and optional
 * workflow fields for v1.5 Workflow Orchestrator.
 *
 * Backward compatible: old records without new fields deserialize with
 * Zod .default() values — never fail on missing fields.
 *
 * STATE-01, STATE-02, STATE-03, STATE-04, STATE-05, STATE-06
 */
export const StoredConversationSchema = z.object({
  // ─── Existing Transport Data ───
  /** Server-generated UUID — external identifier sent to clients */
  externalId: z.string().uuid(),

  /**
   * Opaque Copilot SDK conversation reference.
   * Typed as unknown — never serialize to JSON (class instance, not JSON-safe).
   * Routes cast to the appropriate SDK type when needed.
   */
  sdkConversationRef: z.unknown(),

  /** Full message history for this conversation */
  history: z.array(NormalizedMessageSchema),

  // ─── Persistence Metadata (Phase 11) ───
  /** User who owns this conversation; populated from JWT claims in Phase 13 */
  userId: z.string().min(1).default('anonymous'),

  /** Tenant ID for multi-tenancy; populated from JWT claims in Phase 13 */
  tenantId: z.string().min(1).default('dev'),

  /** Creation timestamp in ISO 8601 format */
  createdAt: z.string().datetime().default(() => new Date().toISOString()),

  /** Last modification timestamp in ISO 8601 format */
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),

  /** Conversation lifecycle state */
  status: z.enum(['active', 'completed', 'abandoned']).default('active'),

  // ─── Optional Workflow Fields (v1.5 Workflow Orchestrator) ───
  /** ID of the workflow this conversation is executing */
  workflowId: z.string().uuid().optional(),

  /** Current step number in the workflow */
  currentStep: z.number().nonnegative().optional(),

  /** Step-specific data (arbitrary key-value pairs) */
  stepData: z.record(z.string(), z.unknown()).optional(),

  /** Conversation-level metadata (arbitrary key-value pairs) */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** TypeScript type inferred from StoredConversationSchema */
export type StoredConversation = z.infer<typeof StoredConversationSchema>;
