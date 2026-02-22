import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Activity } from '@microsoft/agents-activity';
import { ActivityTypes } from '@microsoft/agents-activity';
import {
  OrchestrateRequestSchema,
  type WorkflowState,
  type ExtractedPayload,
} from '@copilot-chat/shared';
import { copilotClient } from '../copilot.js';
import { conversationStore, workflowStateStore } from '../store/index.js';
import { normalizeActivities } from '../normalizer/activityNormalizer.js';
import { buildContextPrefix } from './chat.js';
import { isRedisError } from '../utils/errorDetection.js';

export const orchestrateRouter = Router();

/**
 * POST /api/chat/orchestrate
 * Batteries-included single-call endpoint for the workflow orchestrator.
 *
 * 1. Starts a NEW Copilot conversation
 * 2. Sends the query (with optional context prefix)
 * 3. Normalizes the response
 * 4. Extracts structured payload
 * 5. Measures latency
 * 6. Returns everything the orchestrator needs in one response
 *
 * Request: { query: string, workflowContext?: WorkflowContext }
 * Response: { conversationId, messages, extractedPayload, latencyMs, workflowState }
 *
 * ORCH-03
 */
orchestrateRouter.post('/', async (req, res) => {
  // 1. Validate request body
  const parsed = OrchestrateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.format() });
    return;
  }
  const { query, workflowContext } = parsed.data;

  try {
    // 2. Start a NEW conversation — consume greeting activities
    const startActivities: Activity[] = [];
    for await (const activity of copilotClient.startConversationStreaming(true)) {
      startActivities.push(activity);
    }

    // 3. Generate conversationId and store conversation
    const conversationId = uuidv4();
    const now = new Date().toISOString();
    await conversationStore.set(conversationId, {
      externalId: conversationId,
      sdkConversationRef: startActivities,
      history: [],
      userId: req.user?.oid ?? 'anonymous',
      tenantId: req.user?.tid ?? 'dev',
      createdAt: now,
      updatedAt: now,
      status: 'active',
    });

    // 4. Build outbound text with optional context prefix
    const outboundText = workflowContext
      ? buildContextPrefix(workflowContext) + query
      : query;

    // 5. Send message and measure latency
    const t0 = performance.now();

    const userActivity: Activity = {
      type: ActivityTypes.Message,
      text: outboundText,
    } as Activity;

    const collectedActivities: Activity[] = [];
    for await (const activity of copilotClient.sendActivityStreaming(userActivity)) {
      collectedActivities.push(activity);
    }

    const latencyMs = Math.round(performance.now() - t0);

    // 6. Normalize activities → messages
    const messages = normalizeActivities(collectedActivities);

    // 7. Extract payload: find first message with extractedPayload, or null
    let extractedPayload: ExtractedPayload | null = null;
    for (const msg of messages) {
      if (msg.extractedPayload) {
        extractedPayload = msg.extractedPayload;
        break;
      }
    }

    // 8. Build workflow state
    const existingState = await workflowStateStore.get(conversationId);
    const workflowState: WorkflowState = {
      step: workflowContext?.step ?? 'initial',
      collectedData: workflowContext?.collectedData ?? existingState?.collectedData ?? {},
      lastRecommendation: extractedPayload?.data
        ? JSON.stringify(extractedPayload.data)
        : existingState?.lastRecommendation,
      turnCount: (existingState?.turnCount ?? 0) + 1,
    };
    await workflowStateStore.set(conversationId, workflowState);

    // 9. Update conversation history
    await conversationStore.set(conversationId, {
      externalId: conversationId,
      sdkConversationRef: startActivities,
      history: messages,
      userId: req.user?.oid ?? 'anonymous',
      tenantId: req.user?.tid ?? 'dev',
      createdAt: now,
      updatedAt: new Date().toISOString(),
      status: 'active',
    });

    // 10. Return response
    res.status(200).json({
      conversationId,
      messages,
      extractedPayload,
      latencyMs,
      workflowState,
    });
  } catch (err) {
    console.error('[chat/orchestrate] Error:', err);
    if (isRedisError(err)) {
      res.status(503).json({ error: 'Service Unavailable: Redis backend offline' });
    } else {
      res.status(502).json({ error: 'Failed to communicate with Copilot Studio' });
    }
  }
});
