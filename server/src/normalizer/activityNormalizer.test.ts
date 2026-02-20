import { describe, it, expect } from 'vitest';
import type { Activity } from '@microsoft/agents-activity';
import { NormalizedMessageSchema } from '@copilot-chat/shared';
import { normalizeActivities } from './activityNormalizer.js';

const BOT_FROM = { role: 'bot' as const };
const USER_FROM = { role: 'user' as const };
const ADAPTIVE_CARD_TYPE = 'application/vnd.microsoft.card.adaptive';

describe('normalizeActivities', () => {
  // ──────────────────────────────────────────────────────────────
  // Basic cases
  // ──────────────────────────────────────────────────────────────

  it('returns empty array for empty input', () => {
    const result = normalizeActivities([]);
    expect(result).toHaveLength(0);
  });

  it('skips non-message activity types (typing, endOfConversation, event, trace)', () => {
    const activities: Activity[] = [
      { type: 'typing', from: BOT_FROM },
      { type: 'endOfConversation', from: BOT_FROM },
      { type: 'event', from: BOT_FROM },
      { type: 'trace', from: BOT_FROM },
      { type: 'message', text: 'Hi', from: BOT_FROM },
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Hi');
  });

  // ──────────────────────────────────────────────────────────────
  // Text-only turns (SERV-11 requirement)
  // ──────────────────────────────────────────────────────────────

  it('text-only bot message → assistant NormalizedMessage', () => {
    const activities: Activity[] = [
      { type: 'message', text: 'Hello!', from: BOT_FROM },
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
    const activities: Activity[] = [
      { type: 'message', text: 'A question', from: USER_FROM },
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
    const activities: Activity[] = [
      { type: 'message', text: 'Mystery message' },
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  it('skips activity with empty string text and no attachments', () => {
    const activities: Activity[] = [
      { type: 'message', text: '', from: BOT_FROM },
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(0);
  });

  it('skips message activity with undefined text and no attachments', () => {
    const activities: Activity[] = [
      { type: 'message', from: BOT_FROM },
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────
  // Card-only turns (SERV-11 requirement)
  // ──────────────────────────────────────────────────────────────

  it('card-only bot message → adaptiveCard NormalizedMessage', () => {
    const cardContent = { type: 'AdaptiveCard', version: '1.5', body: [] };
    const activities: Activity[] = [{
      type: 'message',
      from: BOT_FROM,
      attachments: [{
        contentType: ADAPTIVE_CARD_TYPE,
        content: cardContent,
      }],
    }];
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
    const activities: Activity[] = [{
      type: 'message',
      from: BOT_FROM,
      attachments: [{ contentType: 'image/png', contentUrl: 'https://example.com/img.png' }],
    }];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(0);
  });

  it('skips adaptive card attachment with no content', () => {
    const activities: Activity[] = [{
      type: 'message',
      from: BOT_FROM,
      attachments: [{ contentType: ADAPTIVE_CARD_TYPE }],
    }];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────
  // Hybrid turns (SERV-11 requirement)
  // ──────────────────────────────────────────────────────────────

  it('hybrid turn (text + card) → text first, then card', () => {
    const cardContent = { type: 'AdaptiveCard' };
    const activities: Activity[] = [{
      type: 'message',
      text: 'Here is a card:',
      from: BOT_FROM,
      attachments: [{ contentType: ADAPTIVE_CARD_TYPE, content: cardContent }],
    }];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ kind: 'text', text: 'Here is a card:', role: 'assistant' });
    expect(result[1]).toMatchObject({ kind: 'adaptiveCard', role: 'assistant' });
    expect(result[1].cardJson).toEqual(cardContent);
  });

  it('multiple activities → each normalized independently', () => {
    const activities: Activity[] = [
      { type: 'message', text: 'First', from: BOT_FROM },
      { type: 'typing', from: BOT_FROM },
      { type: 'message', text: 'Second', from: BOT_FROM },
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
    const activities: Activity[] = [
      { type: 'message', text: 'Hello', from: BOT_FROM },
      {
        type: 'message',
        text: 'With card:',
        from: BOT_FROM,
        attachments: [{ contentType: ADAPTIVE_CARD_TYPE, content: cardContent }],
      },
    ];
    const result = normalizeActivities(activities);
    expect(result.length).toBeGreaterThan(0);
    for (const msg of result) {
      // Should not throw
      expect(() => NormalizedMessageSchema.parse(msg)).not.toThrow();
    }
  });

  it('each message gets a unique id', () => {
    const activities: Activity[] = [
      { type: 'message', text: 'First', from: BOT_FROM },
      { type: 'message', text: 'Second', from: BOT_FROM },
    ];
    const result = normalizeActivities(activities);
    const ids = result.map(m => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
