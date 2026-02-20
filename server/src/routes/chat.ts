import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Activity } from '@microsoft/agents-activity';
import { copilotClient } from '../copilot.js';
import { conversationStore } from '../store/index.js';

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
