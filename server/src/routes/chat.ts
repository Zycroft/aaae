import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Activity } from '@microsoft/agents-activity';
import { ActivityTypes } from '@microsoft/agents-activity';
import {
  SendMessageRequestSchema,
  CardActionRequestSchema,
  type WorkflowContext,
} from '@copilot-chat/shared';
import { validateCardAction } from '../allowlist/cardActionAllowlist.js';
import { copilotClient } from '../copilot.js';
import { conversationStore } from '../store/index.js';
import { normalizeActivities } from '../normalizer/activityNormalizer.js';
import { isRedisError } from '../utils/errorDetection.js';

/**
 * Builds a structured context prefix for Copilot messages.
 * When workflowContext is provided, this prefix is prepended to the user's message
 * so the Copilot agent receives workflow state alongside the query.
 *
 * CTX-02
 */
export function buildContextPrefix(ctx: WorkflowContext): string {
  return (
    `[WORKFLOW_CONTEXT]\n` +
    `step: ${ctx.step}\n` +
    `constraints: ${ctx.constraints?.join(' | ') ?? 'none'}\n` +
    `data: ${JSON.stringify(ctx.collectedData ?? {})}\n` +
    `[/WORKFLOW_CONTEXT]\n\n`
  );
}

export const chatRouter = Router();

/**
 * POST /api/chat/start
 * Starts a new Copilot Studio conversation.
 * Returns: { conversationId: string } — a server-generated UUID.
 *
 * The Copilot SDK's internal conversation state is captured via the streaming
 * generator and stored in ConversationStore alongside the external UUID.
 *
 * Note: With stub credentials, this endpoint returns 502 (Copilot Studio rejects
 * the stub token). With real credentials, returns 200 { conversationId }.
 *
 * SERV-02
 */
chatRouter.post('/start', async (req, res) => {
  try {
    const externalId = uuidv4(); // The conversationId we return to clients
    const collectedActivities: Activity[] = [];

    // startConversationStreaming returns AsyncGenerator<Activity> — NOT a Promise.
    // Must use for-await-of to consume it.
    for await (const activity of copilotClient.startConversationStreaming(true)) {
      collectedActivities.push(activity);
    }

    const now = new Date().toISOString();
    await conversationStore.set(externalId, {
      externalId,
      sdkConversationRef: collectedActivities, // Store raw activities for Phase 2 normalizer
      history: [], // Message history populated in Phase 2
      userId: req.user?.oid ?? 'anonymous',
      tenantId: req.user?.tid ?? 'dev',
      createdAt: now,
      updatedAt: now,
      status: 'active',
    });

    res.status(200).json({ conversationId: externalId });
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
 * Sends a user message to Copilot Studio and returns the bot's normalized response.
 * Request: { conversationId: string, text: string }
 * Returns: { conversationId: string, messages: NormalizedMessage[] }
 *
 * Uses the singleton copilotClient (which retains the internal Copilot conversation ID
 * from the last startConversationStreaming call — Phase 2 single-conversation approach).
 *
 * SERV-03
 */
chatRouter.post('/send', async (req, res) => {
  // 1. Validate request body
  const parsed = SendMessageRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.format() });
    return;
  }
  const { conversationId, text, workflowContext } = parsed.data;

  // 2. Look up conversation
  const conversation = await conversationStore.get(conversationId);
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  try {
    // 3. Build message activity — prepend context prefix if workflowContext provided
    const outboundText = workflowContext
      ? buildContextPrefix(workflowContext) + text
      : text;

    const userActivity: Activity = {
      type: ActivityTypes.Message,
      text: outboundText,
    } as Activity;

    // 4. Call sendActivityStreaming — no conversationId arg; singleton uses its stored internal ID
    const collectedActivities: Activity[] = [];
    for await (const activity of copilotClient.sendActivityStreaming(userActivity)) {
      collectedActivities.push(activity);
    }

    // 5. Normalize activities to NormalizedMessage[]
    const messages = normalizeActivities(collectedActivities);

    // 6. Update conversation history in store
    await conversationStore.set(conversationId, {
      ...conversation,
      history: [...conversation.history, ...messages],
      updatedAt: new Date().toISOString(),
    });

    // 7. Return response
    res.status(200).json({ conversationId, messages });
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
 * Validates and forwards an Adaptive Card submit action to Copilot Studio.
 * Request: { conversationId, cardId, userSummary, submitData }
 * Returns: { conversationId: string, messages: NormalizedMessage[] }
 *
 * Enforces:
 *   SERV-07: Action type allowlist (rejects disallowed types with 403)
 *   SERV-08: Action.OpenUrl domain allowlist (rejects disallowed domains with 403)
 *
 * SERV-04
 */
chatRouter.post('/card-action', async (req, res) => {
  // 1. Validate request body shape
  const parsed = CardActionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.format() });
    return;
  }
  const { conversationId, cardId, userSummary, submitData } = parsed.data;

  // 2. Validate action against allowlist BEFORE any Copilot call (SERV-07, SERV-08)
  const allowlistResult = validateCardAction(submitData);
  if (!allowlistResult.ok) {
    console.warn(`[chat/card-action] Rejected: ${allowlistResult.reason}`);
    res.status(403).json({ error: allowlistResult.reason });
    return;
  }

  // 3. Look up conversation
  const conversation = await conversationStore.get(conversationId);
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  try {
    // 4. Build card action activity — userSummary as the text, submitData as the value
    const cardActivity: Activity = {
      type: ActivityTypes.Message,
      text: userSummary,
      value: { ...submitData, cardId },
    } as Activity;

    // 5. Forward to Copilot Studio
    const collectedActivities: Activity[] = [];
    for await (const activity of copilotClient.sendActivityStreaming(cardActivity)) {
      collectedActivities.push(activity);
    }

    // 6. Normalize to NormalizedMessage[]
    const messages = normalizeActivities(collectedActivities);

    // 7. Update conversation history
    await conversationStore.set(conversationId, {
      ...conversation,
      history: [...conversation.history, ...messages],
      updatedAt: new Date().toISOString(),
    });

    // 8. Return normalized messages
    res.status(200).json({ conversationId, messages });
  } catch (err) {
    console.error('[chat/card-action] Error forwarding card action:', err);
    if (isRedisError(err)) {
      res.status(503).json({ error: 'Service Unavailable: Redis backend offline' });
    } else {
      res.status(502).json({ error: 'Failed to forward card action to Copilot Studio' });
    }
  }
});
