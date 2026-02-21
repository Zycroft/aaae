import { describe, it, expect } from 'vitest';
import type { Activity } from '@microsoft/agents-activity';
import { NormalizedMessageSchema, ExtractedPayloadSchema } from '@copilot-chat/shared';
import { normalizeActivities } from './activityNormalizer.js';

const BOT_FROM = { role: 'bot' as const };
const USER_FROM = { role: 'user' as const };
const ADAPTIVE_CARD_TYPE = 'application/vnd.microsoft.card.adaptive';

/**
 * Helper to create minimal test Activity objects without all class-required properties.
 * Activity is a class; plain objects use `as unknown as Activity` to satisfy TypeScript
 * while still exercising the normalizer's runtime logic.
 */
function act(partial: Record<string, unknown>): Activity {
  return partial as unknown as Activity;
}

describe('normalizeActivities', () => {
  // ──────────────────────────────────────────────────────────────
  // Basic cases
  // ──────────────────────────────────────────────────────────────

  it('returns empty array for empty input', () => {
    const result = normalizeActivities([]);
    expect(result).toHaveLength(0);
  });

  it('skips non-message activity types (typing, endOfConversation, event, trace)', () => {
    const activities = [
      act({ type: 'typing', from: BOT_FROM }),
      act({ type: 'endOfConversation', from: BOT_FROM }),
      act({ type: 'event', from: BOT_FROM }),
      act({ type: 'trace', from: BOT_FROM }),
      act({ type: 'message', text: 'Hi', from: BOT_FROM }),
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Hi');
  });

  // ──────────────────────────────────────────────────────────────
  // Text-only turns (SERV-11 requirement)
  // ──────────────────────────────────────────────────────────────

  it('text-only bot message → assistant NormalizedMessage', () => {
    const activities = [
      act({ type: 'message', text: 'Hello!', from: BOT_FROM }),
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      role: 'assistant',
      kind: 'text',
      text: 'Hello!',
    });
    expect(result[0].id).toBeDefined();
    expect(typeof result[0].id).toBe('string');
  });

  it('text-only user message → user NormalizedMessage', () => {
    const activities = [
      act({ type: 'message', text: 'A question', from: USER_FROM }),
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      role: 'user',
      kind: 'text',
      text: 'A question',
    });
  });

  it('activity with no from field → defaults to user role', () => {
    const activities = [
      act({ type: 'message', text: 'Mystery message' }),
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  it('skips activity with empty string text and no attachments', () => {
    const activities = [
      act({ type: 'message', text: '', from: BOT_FROM }),
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(0);
  });

  it('skips message activity with undefined text and no attachments', () => {
    const activities = [
      act({ type: 'message', from: BOT_FROM }),
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────
  // Card-only turns (SERV-11 requirement)
  // ──────────────────────────────────────────────────────────────

  it('card-only bot message → adaptiveCard NormalizedMessage', () => {
    const cardContent = { type: 'AdaptiveCard', version: '1.5', body: [] };
    const activities = [
      act({
        type: 'message',
        from: BOT_FROM,
        attachments: [{ contentType: ADAPTIVE_CARD_TYPE, content: cardContent }],
      }),
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      role: 'assistant',
      kind: 'adaptiveCard',
      cardJson: cardContent,
    });
    expect(result[0].cardId).toBeDefined();
    expect(typeof result[0].cardId).toBe('string');
    expect(result[0].id).toBeDefined();
  });

  it('silently skips non-Adaptive Card attachments (images, files)', () => {
    const activities = [
      act({
        type: 'message',
        from: BOT_FROM,
        attachments: [{ contentType: 'image/png', contentUrl: 'https://example.com/img.png' }],
      }),
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(0);
  });

  it('skips adaptive card attachment with no content', () => {
    const activities = [
      act({
        type: 'message',
        from: BOT_FROM,
        attachments: [{ contentType: ADAPTIVE_CARD_TYPE }],
      }),
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────
  // Hybrid turns (SERV-11 requirement)
  // ──────────────────────────────────────────────────────────────

  it('hybrid turn (text + card) → text first, then card', () => {
    const cardContent = { type: 'AdaptiveCard' };
    const activities = [
      act({
        type: 'message',
        text: 'Here is a card:',
        from: BOT_FROM,
        attachments: [{ contentType: ADAPTIVE_CARD_TYPE, content: cardContent }],
      }),
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ kind: 'text', text: 'Here is a card:', role: 'assistant' });
    expect(result[1]).toMatchObject({ kind: 'adaptiveCard', role: 'assistant' });
    expect(result[1].cardJson).toEqual(cardContent);
  });

  it('multiple activities → each normalized independently', () => {
    const activities = [
      act({ type: 'message', text: 'First', from: BOT_FROM }),
      act({ type: 'typing', from: BOT_FROM }),
      act({ type: 'message', text: 'Second', from: BOT_FROM }),
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('First');
    expect(result[1].text).toBe('Second');
  });

  // ──────────────────────────────────────────────────────────────
  // Schema validation — all outputs must pass NormalizedMessageSchema
  // ──────────────────────────────────────────────────────────────

  it('all returned messages pass NormalizedMessageSchema.parse()', () => {
    const cardContent = { type: 'AdaptiveCard' };
    const activities = [
      act({ type: 'message', text: 'Hello', from: BOT_FROM }),
      act({
        type: 'message',
        text: 'With card:',
        from: BOT_FROM,
        attachments: [{ contentType: ADAPTIVE_CARD_TYPE, content: cardContent }],
      }),
    ];
    const result = normalizeActivities(activities);
    expect(result.length).toBeGreaterThan(0);
    for (const msg of result) {
      // Should not throw
      expect(() => NormalizedMessageSchema.parse(msg)).not.toThrow();
    }
  });

  it('each message gets a unique id', () => {
    const activities = [
      act({ type: 'message', text: 'First', from: BOT_FROM }),
      act({ type: 'message', text: 'Second', from: BOT_FROM }),
    ];
    const result = normalizeActivities(activities);
    const ids = result.map(m => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  // ──────────────────────────────────────────────────────────────
  // Structured payload extraction — activity.value (SOUT-01)
  // ──────────────────────────────────────────────────────────────

  describe('extractedPayload from activity.value (SOUT-01)', () => {
    it('extracts from activity.value when it is a non-null object', () => {
      const activities = [
        act({
          type: 'message',
          text: 'Structured reply',
          from: BOT_FROM,
          value: { step: 'greeting', score: 0.9 },
        }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeDefined();
      expect(result[0].extractedPayload!.source).toBe('value');
      expect(result[0].extractedPayload!.confidence).toBe('high');
      expect(result[0].extractedPayload!.data).toEqual({ step: 'greeting', score: 0.9 });
    });

    it('does not extract when activity.value is null', () => {
      const activities = [
        act({ type: 'message', text: 'No value', from: BOT_FROM, value: null }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeUndefined();
    });

    it('does not extract when activity.value is a string', () => {
      const activities = [
        act({ type: 'message', text: 'String value', from: BOT_FROM, value: 'just a string' }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeUndefined();
    });

    it('does not extract when activity.value is an array', () => {
      const activities = [
        act({ type: 'message', text: 'Array value', from: BOT_FROM, value: [1, 2] }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeUndefined();
    });

    it('does not extract when activity.value is a number', () => {
      const activities = [
        act({ type: 'message', text: 'Number value', from: BOT_FROM, value: 42 }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Structured payload extraction — activity.entities (SOUT-02)
  // ──────────────────────────────────────────────────────────────

  describe('extractedPayload from activity.entities (SOUT-02)', () => {
    it('extracts from entities array, omitting type key', () => {
      const activities = [
        act({
          type: 'message',
          text: 'Entity reply',
          from: BOT_FROM,
          entities: [{ type: 'clientInfo', locale: 'en-US', platform: 'web' }],
        }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeDefined();
      expect(result[0].extractedPayload!.source).toBe('entities');
      expect(result[0].extractedPayload!.confidence).toBe('medium');
      expect(result[0].extractedPayload!.data).toEqual({ locale: 'en-US', platform: 'web' });
      // type key should be omitted
      expect(result[0].extractedPayload!.data).not.toHaveProperty('type');
    });

    it('merges multiple entities into one data record', () => {
      const activities = [
        act({
          type: 'message',
          text: 'Multi entity',
          from: BOT_FROM,
          entities: [
            { type: 'clientInfo', locale: 'en-US' },
            { type: 'mention', name: 'Bot' },
          ],
        }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeDefined();
      expect(result[0].extractedPayload!.data).toEqual({ locale: 'en-US', name: 'Bot' });
    });

    it('does not extract from empty entities array', () => {
      const activities = [
        act({ type: 'message', text: 'Empty entities', from: BOT_FROM, entities: [] }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeUndefined();
    });

    it('does not extract when entities only have type keys (nothing useful after omission)', () => {
      const activities = [
        act({
          type: 'message',
          text: 'Type only',
          from: BOT_FROM,
          entities: [{ type: 'clientInfo' }],
        }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeUndefined();
    });

    it('value extraction wins over entities when both present', () => {
      const activities = [
        act({
          type: 'message',
          text: 'Both present',
          from: BOT_FROM,
          value: { step: 'greeting' },
          entities: [{ type: 'clientInfo', locale: 'en-US' }],
        }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload!.source).toBe('value');
      expect(result[0].extractedPayload!.confidence).toBe('high');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Structured payload extraction — bot text JSON parse (SOUT-03)
  // ──────────────────────────────────────────────────────────────

  describe('extractedPayload from bot text JSON (SOUT-03)', () => {
    it('extracts JSON from markdown code fence in bot text', () => {
      const activities = [
        act({
          type: 'message',
          text: 'Here is your result:\n```json\n{"status":"ok"}\n```',
          from: BOT_FROM,
        }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeDefined();
      expect(result[0].extractedPayload!.source).toBe('text');
      expect(result[0].extractedPayload!.confidence).toBe('low');
      expect(result[0].extractedPayload!.data).toEqual({ status: 'ok' });
    });

    it('extracts JSON from plain code fence (no json tag)', () => {
      const activities = [
        act({
          type: 'message',
          text: 'Result:\n```\n{"count":5}\n```',
          from: BOT_FROM,
        }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeDefined();
      expect(result[0].extractedPayload!.data).toEqual({ count: 5 });
    });

    it('extracts raw JSON object from bot text', () => {
      const activities = [
        act({
          type: 'message',
          text: 'Result: {"foo":"bar"}',
          from: BOT_FROM,
        }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeDefined();
      expect(result[0].extractedPayload!.source).toBe('text');
      expect(result[0].extractedPayload!.confidence).toBe('low');
      expect(result[0].extractedPayload!.data).toEqual({ foo: 'bar' });
    });

    it('does not extract from plain text with no JSON', () => {
      const activities = [
        act({
          type: 'message',
          text: 'Just a plain message with no JSON at all',
          from: BOT_FROM,
        }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeUndefined();
    });

    it('does not extract JSON from user messages (only bot)', () => {
      const activities = [
        act({
          type: 'message',
          text: '{"user":"data"}',
          from: USER_FROM,
        }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeUndefined();
    });

    it('does not extract arrays from text (only objects)', () => {
      const activities = [
        act({
          type: 'message',
          text: '[1, 2, 3]',
          from: BOT_FROM,
        }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Extraction general / cross-cutting
  // ──────────────────────────────────────────────────────────────

  describe('extractedPayload cross-cutting', () => {
    it('no extraction when none of the three sources has data', () => {
      const activities = [
        act({ type: 'message', text: 'Plain bot text', from: BOT_FROM }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(1);
      expect(result[0].extractedPayload).toBeUndefined();
    });

    it('extractedPayload passes ExtractedPayloadSchema validation', () => {
      const activities = [
        act({
          type: 'message',
          text: 'Structured',
          from: BOT_FROM,
          value: { key: 'val' },
        }),
      ];
      const result = normalizeActivities(activities);
      expect(result[0].extractedPayload).toBeDefined();
      expect(() => ExtractedPayloadSchema.parse(result[0].extractedPayload)).not.toThrow();
    });

    it('hybrid turn carries same extractedPayload on both text and card messages', () => {
      const cardContent = { type: 'AdaptiveCard', version: '1.5', body: [] };
      const activities = [
        act({
          type: 'message',
          text: 'Here is a card:',
          from: BOT_FROM,
          value: { cardType: 'summary' },
          attachments: [{ contentType: ADAPTIVE_CARD_TYPE, content: cardContent }],
        }),
      ];
      const result = normalizeActivities(activities);
      expect(result).toHaveLength(2);
      // Both messages should have the same extractedPayload
      expect(result[0].extractedPayload).toBeDefined();
      expect(result[1].extractedPayload).toBeDefined();
      expect(result[0].extractedPayload!.source).toBe('value');
      expect(result[1].extractedPayload!.source).toBe('value');
      expect(result[0].extractedPayload!.data).toEqual(result[1].extractedPayload!.data);
    });

    it('all messages with extractedPayload pass NormalizedMessageSchema', () => {
      const activities = [
        act({
          type: 'message',
          text: 'Structured',
          from: BOT_FROM,
          value: { step: 'done' },
        }),
      ];
      const result = normalizeActivities(activities);
      for (const msg of result) {
        expect(() => NormalizedMessageSchema.parse(msg)).not.toThrow();
      }
    });
  });
});
