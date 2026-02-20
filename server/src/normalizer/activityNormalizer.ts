import { v4 as uuidv4 } from 'uuid';
import type { Activity } from '@microsoft/agents-activity';
import { NormalizedMessageSchema } from '@copilot-chat/shared';
import type { NormalizedMessage } from '@copilot-chat/shared';

/** Copilot Studio uses this content type for Adaptive Card attachments */
const ADAPTIVE_CARD_CONTENT_TYPE = 'application/vnd.microsoft.card.adaptive';

/**
 * Normalizes an array of raw Copilot SDK Activity objects into NormalizedMessage[].
 *
 * Rules:
 * 1. Only processes activities where type === 'message'; all others are skipped.
 * 2. Role: from.role === 'bot' → 'assistant', everything else → 'user'.
 * 3. Non-empty activity.text → text NormalizedMessage.
 * 4. Each Adaptive Card attachment → adaptiveCard NormalizedMessage.
 * 5. Non-Adaptive Card attachments are silently skipped.
 * 6. Hybrid turns (text + card) produce multiple messages (text first, then cards).
 * 7. All output passes NormalizedMessageSchema validation.
 *
 * SERV-06
 */
export function normalizeActivities(activities: Activity[]): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [];

  for (const activity of activities) {
    // Only process message-type activities; skip typing, endOfConversation, event, trace, etc.
    if (activity.type !== 'message') continue;

    // Determine role
    const role: 'user' | 'assistant' =
      activity.from?.role === 'bot' ? 'assistant' : 'user';

    // Text content (may coexist with attachments in a hybrid turn — emit text first)
    if (activity.text) {
      const textMsg: NormalizedMessage = {
        id: uuidv4(),
        role,
        kind: 'text',
        text: activity.text,
      };
      // Runtime validation — ensures output always conforms to shared schema
      NormalizedMessageSchema.parse(textMsg);
      messages.push(textMsg);
    }

    // Attachments — look for Adaptive Cards only
    for (const attachment of activity.attachments ?? []) {
      if (
        attachment.contentType === ADAPTIVE_CARD_CONTENT_TYPE &&
        attachment.content != null
      ) {
        const cardMsg: NormalizedMessage = {
          id: uuidv4(),
          role,
          kind: 'adaptiveCard',
          cardJson: attachment.content as Record<string, unknown>,
          cardId: uuidv4(), // Server-assigned identifier for action routing (Phase 3)
        };
        // Runtime validation
        NormalizedMessageSchema.parse(cardMsg);
        messages.push(cardMsg);
      }
      // Non-Adaptive Card attachments (images, Hero Cards, etc.) are silently skipped in Phase 2
    }
  }

  return messages;
}
