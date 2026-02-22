import { describe, it, expect } from 'vitest';
import type { NormalizedMessage } from '@copilot-chat/shared';
import { parseTurn } from './structuredOutputParser.js';

/**
 * TDD test suite for parseTurn — structured output parser.
 * Covers all three ParsedTurn kinds plus non-throwing contract.
 *
 * PARSE-01, PARSE-02, PARSE-03, PARSE-04
 */

/** Helper to create a minimal NormalizedMessage for testing */
function msg(
  overrides: Partial<NormalizedMessage> & { role: NormalizedMessage['role'] }
): NormalizedMessage {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    kind: 'text',
    text: 'Hello',
    ...overrides,
  };
}

describe('parseTurn', () => {
  // ──────────────────────────────────────────────────────────────
  // kind='passthrough' cases — no extraction attempted
  // ──────────────────────────────────────────────────────────────

  it('returns passthrough for plain text assistant message with no extractedPayload', async () => {
    const messages: NormalizedMessage[] = [
      msg({ role: 'assistant', text: 'Hello!' }),
    ];

    const result = await parseTurn(messages);

    expect(result.kind).toBe('passthrough');
    expect(result.data).toBeNull();
    expect(result.nextAction).toBeNull();
    expect(result.nextPrompt).toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.parseErrors).toHaveLength(0);
    expect(result.citations).toHaveLength(0);
    expect(result.displayMessages).toBe(messages);
  });

  it('returns passthrough for empty messages array', async () => {
    const result = await parseTurn([]);

    expect(result.kind).toBe('passthrough');
    expect(result.data).toBeNull();
    expect(result.parseErrors).toHaveLength(0);
    expect(result.displayMessages).toHaveLength(0);
  });

  it('returns passthrough when only user messages are present', async () => {
    const messages: NormalizedMessage[] = [
      msg({ role: 'user', text: 'What is my eligibility?' }),
    ];

    const result = await parseTurn(messages);

    expect(result.kind).toBe('passthrough');
    expect(result.data).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────
  // kind='structured' cases — extraction succeeded + schema valid
  // ──────────────────────────────────────────────────────────────

  it('returns structured for assistant message with valid extractedPayload from activity.value', async () => {
    const messages: NormalizedMessage[] = [
      msg({
        role: 'assistant',
        text: 'What is your name?',
        extractedPayload: {
          source: 'value',
          confidence: 'high',
          data: { action: 'ask', prompt: 'What is your name?' },
        },
      }),
    ];

    const result = await parseTurn(messages);

    expect(result.kind).toBe('structured');
    if (result.kind !== 'structured') throw new Error('Expected structured');
    expect(result.data).toEqual({ action: 'ask', prompt: 'What is your name?' });
    expect(result.nextAction).toBe('ask');
    expect(result.nextPrompt).toBe('What is your name?');
    expect(result.confidence).toBe('high');
    expect(result.parseErrors).toHaveLength(0);
    expect(result.citations).toHaveLength(0);
    expect(result.displayMessages).toBe(messages);
  });

  it('returns structured for entities-sourced extractedPayload with confirm action', async () => {
    const messages: NormalizedMessage[] = [
      msg({
        role: 'assistant',
        text: 'Please confirm.',
        extractedPayload: {
          source: 'entities',
          confidence: 'medium',
          data: { action: 'confirm', data: { name: 'Alice' } },
        },
      }),
    ];

    const result = await parseTurn(messages);

    expect(result.kind).toBe('structured');
    if (result.kind !== 'structured') throw new Error('Expected structured');
    expect(result.nextAction).toBe('confirm');
    expect(result.confidence).toBe('medium');
  });

  it('returns structured for text-sourced extractedPayload with complete action', async () => {
    const messages: NormalizedMessage[] = [
      msg({
        role: 'assistant',
        text: '```json\n{"action":"complete"}\n```',
        extractedPayload: {
          source: 'text',
          confidence: 'low',
          data: { action: 'complete' },
        },
      }),
    ];

    const result = await parseTurn(messages);

    expect(result.kind).toBe('structured');
    if (result.kind !== 'structured') throw new Error('Expected structured');
    expect(result.nextAction).toBe('complete');
    expect(result.confidence).toBe('low');
  });

  it('validates with .passthrough() — extra unknown fields do not cause rejection', async () => {
    const messages: NormalizedMessage[] = [
      msg({
        role: 'assistant',
        text: 'ok',
        extractedPayload: {
          source: 'value',
          confidence: 'high',
          data: { action: 'ask', unknownField: 'extra-data', anotherField: 42 },
        },
      }),
    ];

    const result = await parseTurn(messages);

    expect(result.kind).toBe('structured');
    if (result.kind !== 'structured') throw new Error('Expected structured');
    expect(result.nextAction).toBe('ask');
    // Extra fields preserved due to .passthrough()
    expect(result.data).toHaveProperty('unknownField', 'extra-data');
    expect(result.data).toHaveProperty('anotherField', 42);
  });

  it('extracts citations from structured data', async () => {
    const messages: NormalizedMessage[] = [
      msg({
        role: 'assistant',
        text: 'here',
        extractedPayload: {
          source: 'value',
          confidence: 'high',
          data: {
            action: 'research',
            citations: ['https://example.com/doc1', 'https://example.com/doc2'],
          },
        },
      }),
    ];

    const result = await parseTurn(messages);

    expect(result.kind).toBe('structured');
    if (result.kind !== 'structured') throw new Error('Expected structured');
    expect(result.citations).toEqual([
      'https://example.com/doc1',
      'https://example.com/doc2',
    ]);
  });

  it('sets nextPrompt to null when data.prompt is absent', async () => {
    const messages: NormalizedMessage[] = [
      msg({
        role: 'assistant',
        text: 'done',
        extractedPayload: {
          source: 'value',
          confidence: 'high',
          data: { action: 'complete' },
        },
      }),
    ];

    const result = await parseTurn(messages);

    expect(result.kind).toBe('structured');
    if (result.kind !== 'structured') throw new Error('Expected structured');
    expect(result.nextPrompt).toBeNull();
  });

  it('uses the first assistant message with extractedPayload (skips user messages)', async () => {
    const messages: NormalizedMessage[] = [
      msg({ role: 'user', text: 'Hi' }),
      msg({
        role: 'assistant',
        text: 'Response',
        extractedPayload: {
          source: 'value',
          confidence: 'high',
          data: { action: 'ask', prompt: 'What do you need?' },
        },
      }),
    ];

    const result = await parseTurn(messages);

    expect(result.kind).toBe('structured');
    if (result.kind !== 'structured') throw new Error('Expected structured');
    expect(result.nextAction).toBe('ask');
  });

  // ──────────────────────────────────────────────────────────────
  // kind='parse_error' cases — extraction attempted but failed
  // ──────────────────────────────────────────────────────────────

  it('returns parse_error when extractedPayload data has invalid action enum', async () => {
    const messages: NormalizedMessage[] = [
      msg({
        role: 'assistant',
        text: 'bad',
        extractedPayload: {
          source: 'value',
          confidence: 'high',
          data: { action: 'INVALID_ACTION' },
        },
      }),
    ];

    const result = await parseTurn(messages);

    expect(result.kind).toBe('parse_error');
    expect(result.data).toBeNull();
    expect(result.nextAction).toBeNull();
    expect(result.parseErrors.length).toBeGreaterThan(0);
    expect(result.displayMessages).toBe(messages);
  });

  it('returns parse_error when confidence is out of range', async () => {
    const messages: NormalizedMessage[] = [
      msg({
        role: 'assistant',
        text: 'bad confidence',
        extractedPayload: {
          source: 'value',
          confidence: 'high',
          data: { action: 'ask', confidence: 5.0 },
        },
      }),
    ];

    const result = await parseTurn(messages);

    expect(result.kind).toBe('parse_error');
    expect(result.parseErrors.length).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────
  // Non-throwing contract — PARSE-04
  // ──────────────────────────────────────────────────────────────

  it('never throws even with deliberately malformed input', async () => {
    // Pass completely broken input — should not throw
    const brokenMessages = [
      { role: 'assistant', extractedPayload: 'not-an-object' },
    ] as unknown as NormalizedMessage[];

    let threw = false;
    try {
      const result = await parseTurn(brokenMessages);
      // Should return a ParsedTurn (either passthrough or parse_error), not throw
      expect(result).toBeDefined();
      expect(['passthrough', 'parse_error', 'structured']).toContain(result.kind);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });

  it('returns parse_error when an unexpected exception occurs during processing', async () => {
    // Force an exception via a Proxy that throws on property access
    const poison = new Proxy(
      {},
      {
        get() {
          throw new Error('Poisoned object');
        },
      }
    );

    const messages = [
      { role: 'assistant', kind: 'text', id: 'test', extractedPayload: poison },
    ] as unknown as NormalizedMessage[];

    const result = await parseTurn(messages);

    expect(result.kind).toBe('parse_error');
    expect(result.parseErrors.length).toBeGreaterThan(0);
    expect(result.parseErrors[0]).toContain('Poisoned object');
  });

  // ──────────────────────────────────────────────────────────────
  // Data with no action field — all fields optional, so passes as structured
  // ──────────────────────────────────────────────────────────────

  it('returns structured with null nextAction when data has no action field', async () => {
    const messages: NormalizedMessage[] = [
      msg({
        role: 'assistant',
        text: 'here is data',
        extractedPayload: {
          source: 'value',
          confidence: 'high',
          data: { someRandomField: 42 },
        },
      }),
    ];

    const result = await parseTurn(messages);

    // CopilotStructuredOutputSchema has all optional fields + .passthrough()
    // So { someRandomField: 42 } validates successfully
    expect(result.kind).toBe('structured');
    if (result.kind !== 'structured') throw new Error('Expected structured');
    expect(result.nextAction).toBeNull();
    expect(result.data).toHaveProperty('someRandomField', 42);
  });
});
