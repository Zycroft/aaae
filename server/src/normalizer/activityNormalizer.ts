import { v4 as uuidv4 } from 'uuid';
import type { Activity } from '@microsoft/agents-activity';
import { NormalizedMessageSchema } from '@copilot-chat/shared';
import type { NormalizedMessage, ExtractedPayload } from '@copilot-chat/shared';

/** Copilot Studio uses this content type for Adaptive Card attachments */
const ADAPTIVE_CARD_CONTENT_TYPE = 'application/vnd.microsoft.card.adaptive';

/**
 * Checks whether a value is a non-null plain object (not array, not primitive).
 */
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Extracts structured payload from a Copilot SDK Activity, checking three
 * surfaces in priority order:
 *
 * 1. activity.value (confidence: 'high') — structured field from SDK
 * 2. activity.entities (confidence: 'medium') — entity array, type keys omitted
 * 3. bot text JSON parse (confidence: 'low') — only for assistant messages
 *
 * Returns undefined when no structured data can be extracted.
 *
 * SOUT-01, SOUT-02, SOUT-03
 */
function extractStructuredPayload(
  activity: Activity,
  role: 'user' | 'assistant'
): ExtractedPayload | undefined {
  // 1. activity.value — highest confidence
  const activityValue = (activity as Record<string, unknown>).value;
  if (isPlainObject(activityValue) && Object.keys(activityValue).length > 0) {
    return {
      source: 'value',
      confidence: 'high',
      data: activityValue,
    };
  }

  // 2. activity.entities — medium confidence
  const activityEntities = (activity as Record<string, unknown>).entities;
  if (Array.isArray(activityEntities) && activityEntities.length > 0) {
    const merged: Record<string, unknown> = {};
    for (const entity of activityEntities) {
      if (isPlainObject(entity)) {
        for (const [key, val] of Object.entries(entity)) {
          if (key !== 'type') {
            merged[key] = val;
          }
        }
      }
    }
    if (Object.keys(merged).length > 0) {
      return {
        source: 'entities',
        confidence: 'medium',
        data: merged,
      };
    }
  }

  // 3. Bot text JSON parse — lowest confidence, only for assistant messages
  if (role === 'assistant' && activity.text) {
    const parsed = tryParseJsonFromText(activity.text);
    if (parsed !== undefined) {
      return {
        source: 'text',
        confidence: 'low',
        data: parsed,
      };
    }
  }

  return undefined;
}

/**
 * Attempts to extract a JSON object from text content.
 * Tries markdown code fences first, then raw JSON object detection.
 * Returns parsed object or undefined.
 */
function tryParseJsonFromText(text: string): Record<string, unknown> | undefined {
  // Try markdown code fence: ```json ... ``` or ``` ... ```
  const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeFenceMatch) {
    const candidate = codeFenceMatch[1].trim();
    try {
      const parsed = JSON.parse(candidate);
      if (isPlainObject(parsed)) {
        return parsed;
      }
    } catch {
      // Not valid JSON in code fence, fall through
    }
  }

  // Try raw JSON object: first { to matching }
  const rawMatch = text.match(/\{[\s\S]*\}/);
  if (rawMatch) {
    try {
      const parsed = JSON.parse(rawMatch[0]);
      if (isPlainObject(parsed)) {
        return parsed;
      }
    } catch {
      // Not valid JSON, no extraction
    }
  }

  return undefined;
}

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
 * 8. Structured payload extracted from activity surfaces when available (SOUT-05).
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

    // Extract structured payload once per activity — shared across all messages from this activity
    const extractedPayload = extractStructuredPayload(activity, role);

    // Text content (may coexist with attachments in a hybrid turn — emit text first)
    if (activity.text) {
      const textMsg: NormalizedMessage = {
        id: uuidv4(),
        role,
        kind: 'text',
        text: activity.text,
        ...(extractedPayload !== undefined ? { extractedPayload } : {}),
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
          ...(extractedPayload !== undefined ? { extractedPayload } : {}),
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
