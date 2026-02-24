import type { Activity } from '@microsoft/agents-activity';
import { ActivityTypes } from '@microsoft/agents-activity';
import type { CopilotStudioClient } from '@microsoft/agents-copilotstudio-client';
import type { NormalizedMessage } from '@copilot-chat/shared';
import type { LlmProvider } from './LlmProvider.js';
import { normalizeActivities } from '../normalizer/activityNormalizer.js';

/**
 * CopilotProvider — wraps the existing CopilotStudioClient behind LlmProvider.
 *
 * Delegates all SDK interaction to the injected CopilotStudioClient and
 * normalizes responses via activityNormalizer. No behavioral change from
 * the pre-refactor path — this is a pure extraction.
 *
 * PROV-02, COMPAT-03
 */
export class CopilotProvider implements LlmProvider {
  private readonly client: CopilotStudioClient;

  constructor(client: CopilotStudioClient) {
    this.client = client;
  }

  /**
   * Start a new Copilot Studio conversation.
   *
   * Calls startConversationStreaming, collects all greeting activities,
   * and normalizes them to NormalizedMessage[].
   *
   * Note: conversationId is accepted per the LlmProvider interface but
   * not used by Copilot SDK (it manages conversation state internally).
   */
  async startSession(_conversationId: string): Promise<NormalizedMessage[]> {
    const activities: Activity[] = [];
    for await (const activity of this.client.startConversationStreaming(true)) {
      activities.push(activity);
    }
    return normalizeActivities(activities);
  }

  /**
   * Send a user text message to the active Copilot conversation.
   *
   * Builds a Message activity, sends via streaming, collects responses,
   * and normalizes to NormalizedMessage[].
   */
  async sendMessage(_conversationId: string, message: string): Promise<NormalizedMessage[]> {
    const userActivity: Activity = {
      type: ActivityTypes.Message,
      text: message,
    } as Activity;

    const activities: Activity[] = [];
    for await (const activity of this.client.sendActivityStreaming(userActivity)) {
      activities.push(activity);
    }
    return normalizeActivities(activities);
  }

  /**
   * Forward an Adaptive Card submit action to the active Copilot conversation.
   *
   * Builds a Message activity with the action value payload, sends via
   * streaming, collects responses, and normalizes to NormalizedMessage[].
   */
  async sendCardAction(
    _conversationId: string,
    actionValue: Record<string, unknown>
  ): Promise<NormalizedMessage[]> {
    const cardActivity = {
      type: ActivityTypes.Message,
      text: '',
      value: actionValue,
    } as Activity;

    const activities: Activity[] = [];
    for await (const activity of this.client.sendActivityStreaming(cardActivity)) {
      activities.push(activity);
    }
    return normalizeActivities(activities);
  }
}
