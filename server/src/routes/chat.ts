import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  SendMessageRequestSchema,
  CardActionRequestSchema,
} from '@copilot-chat/shared';
import { validateCardAction } from '../allowlist/cardActionAllowlist.js';
import { isRedisError } from '../utils/errorDetection.js';
import { getOrchestrator } from '../orchestrator/index.js';

export const chatRouter = Router();

/**
 * POST /api/chat/start
 * Starts a new Copilot Studio conversation via the WorkflowOrchestrator.
 * Returns: { conversationId: string, workflowState: WorkflowState }
 *
 * The orchestrator creates initial workflow state, starts the Copilot conversation,
 * and persists the conversation record.
 *
 * SERV-02, ROUTE-01
 */
chatRouter.post('/start', async (req, res) => {
  try {
    const orchestrator = getOrchestrator();
    const conversationId = uuidv4();
    const workflowState = await orchestrator.startSession({
      conversationId,
      userId: req.user?.oid ?? 'anonymous',
      tenantId: req.user?.tid ?? 'dev',
    });
    res.status(200).json({ conversationId, workflowState });
  } catch (err) {
    console.error('[chat/start] Error starting conversation:', err);
    if (isRedisError(err)) {
      res.status(503).json({ error: 'Service Unavailable: Redis backend offline' });
    } else {
      res.status(502).json({ error: 'Failed to start conversation with Copilot Studio' });
    }
  }
});

/**
 * POST /api/chat/send
 * Sends a user message to Copilot Studio via the WorkflowOrchestrator.
 * Request: { conversationId: string, text: string, workflowContext?: WorkflowContext }
 * Returns: { conversationId: string, messages: NormalizedMessage[], workflowState: WorkflowState }
 *
 * Note: workflowContext in the request body is accepted for backward compatibility but
 * ignored — the orchestrator enriches queries from its own stored WorkflowState.
 *
 * SERV-03, ROUTE-02, COMPAT-01
 */
chatRouter.post('/send', async (req, res) => {
  const parsed = SendMessageRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.format() });
    return;
  }
  const { conversationId, text } = parsed.data;

  try {
    const orchestrator = getOrchestrator();
    const workflowResponse = await orchestrator.processTurn({
      conversationId,
      text,
      userId: req.user?.oid ?? 'anonymous',
      tenantId: req.user?.tid ?? 'dev',
    });
    res.status(200).json({
      conversationId: workflowResponse.conversationId,
      messages: workflowResponse.messages,
      workflowState: workflowResponse.workflowState,
    });
  } catch (err) {
    console.error('[chat/send] Error sending message:', err);
    if (isRedisError(err)) {
      res.status(503).json({ error: 'Service Unavailable: Redis backend offline' });
    } else {
      res.status(502).json({ error: 'Failed to send message to Copilot Studio' });
    }
  }
});

/**
 * POST /api/chat/card-action
 * Validates and forwards an Adaptive Card submit action via the WorkflowOrchestrator.
 * Request: { conversationId, cardId, userSummary, submitData }
 * Returns: { conversationId: string, messages: NormalizedMessage[], workflowState: WorkflowState }
 *
 * Enforces:
 *   SERV-07: Action type allowlist (rejects disallowed types with 403) — BEFORE orchestrator
 *   SERV-08: Action.OpenUrl domain allowlist (rejects disallowed domains with 403) — BEFORE orchestrator
 *
 * SERV-04, ROUTE-03, COMPAT-02
 */
chatRouter.post('/card-action', async (req, res) => {
  const parsed = CardActionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.format() });
    return;
  }
  const { conversationId, cardId, userSummary, submitData } = parsed.data;

  // COMPAT-02: Allowlist validation BEFORE orchestrator — preserve 403 contract
  const allowlistResult = validateCardAction(submitData);
  if (!allowlistResult.ok) {
    console.warn(`[chat/card-action] Rejected: ${allowlistResult.reason}`);
    res.status(403).json({ error: allowlistResult.reason });
    return;
  }

  try {
    const orchestrator = getOrchestrator();
    const workflowResponse = await orchestrator.processCardAction({
      conversationId,
      cardId,
      userSummary,
      submitData,
      userId: req.user?.oid ?? 'anonymous',
      tenantId: req.user?.tid ?? 'dev',
    });
    res.status(200).json({
      conversationId: workflowResponse.conversationId,
      messages: workflowResponse.messages,
      workflowState: workflowResponse.workflowState,
    });
  } catch (err) {
    console.error('[chat/card-action] Error forwarding card action:', err);
    if (isRedisError(err)) {
      res.status(503).json({ error: 'Service Unavailable: Redis backend offline' });
    } else {
      res.status(502).json({ error: 'Failed to forward card action to Copilot Studio' });
    }
  }
});
