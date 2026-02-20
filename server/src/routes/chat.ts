import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Activity } from '@microsoft/agents-activity';
import { ActivityTypes } from '@microsoft/agents-activity';
import { SendMessageRequestSchema } from '@copilot-chat/shared';
import { copilotClient } from '../copilot.js';
import { conversationStore } from '../store/index.js';
import { normalizeActivities } from '../normalizer/activityNormalizer.js';

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
chatRouter.post('/start', async (_req, res) => {
  try {
    const externalId = uuidv4(); // The conversationId we return to clients
    const collectedActivities: Activity[] = [];

    // startConversationStreaming returns AsyncGenerator<Activity> — NOT a Promise.
    // Must use for-await-of to consume it.
    for await (const activity of copilotClient.startConversationStreaming(true)) {
      collectedActivities.push(activity);
    }

    await conversationStore.set(externalId, {
      externalId,
      sdkConversationRef: collectedActivities, // Store raw activities for Phase 2 normalizer
      history: [], // Message history populated in Phase 2
    });

    res.status(200).json({ conversationId: externalId });
  } catch (err) {
    console.error('[chat/start] Error starting conversation:', err);
    res.status(502).json({ error: 'Failed to start conversation with Copilot Studio' });
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
  const { conversationId, text } = parsed.data;

  // 2. Look up conversation
  const conversation = await conversationStore.get(conversationId);
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  try {
    // 3. Build message activity
    const userActivity: Activity = {
      type: ActivityTypes.Message,
      text,
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
    });

    // 7. Return response
    res.status(200).json({ conversationId, messages });
  } catch (err) {
    console.error('[chat/send] Error sending message:', err);
    res.status(502).json({ error: 'Failed to send message to Copilot Studio' });
  }
});
