import { describe, it, expect } from 'vitest';
import { NormalizedMessageSchema } from '../schemas/message.js';
import {
  StartConversationResponseSchema,
  SendMessageRequestSchema,
  SendMessageResponseSchema,
  CardActionRequestSchema,
  CardActionResponseSchema,
} from '../schemas/api.js';

// ──────────────────────────────────────────────────────────────────────────────
// NormalizedMessage (SCHEMA-01)
// ──────────────────────────────────────────────────────────────────────────────

describe('NormalizedMessageSchema', () => {
  it('parses a valid text message', () => {
    const result = NormalizedMessageSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      role: 'user',
      kind: 'text',
      text: 'hello',
    });
    expect(result.success).toBe(true);
  });

  it('parses a valid adaptiveCard message', () => {
    const result = NormalizedMessageSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440001',
      role: 'assistant',
      kind: 'adaptiveCard',
      cardJson: { type: 'AdaptiveCard', version: '1.5', body: [] },
      cardId: 'card-survey-1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects message with missing id', () => {
    const result = NormalizedMessageSchema.safeParse({
      role: 'user',
      kind: 'text',
      text: 'hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message with missing role', () => {
    const result = NormalizedMessageSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      kind: 'text',
      text: 'hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message with invalid role value "system"', () => {
    const result = NormalizedMessageSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      role: 'system',
      kind: 'text',
      text: 'hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message with invalid kind value "image"', () => {
    const result = NormalizedMessageSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      role: 'user',
      kind: 'image',
      text: 'hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message with missing kind', () => {
    const result = NormalizedMessageSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      role: 'user',
      text: 'hello',
    });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// API Schemas (SCHEMA-02)
// ──────────────────────────────────────────────────────────────────────────────

describe('StartConversationResponseSchema', () => {
  it('parses a valid start response', () => {
    const result = StartConversationResponseSchema.safeParse({
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID conversationId', () => {
    const result = StartConversationResponseSchema.safeParse({
      conversationId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('SendMessageRequestSchema', () => {
  it('parses a valid send request', () => {
    const result = SendMessageRequestSchema.safeParse({
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      text: 'Hello Copilot',
    });
    expect(result.success).toBe(true);
  });

  it('rejects send request with empty text', () => {
    const result = SendMessageRequestSchema.safeParse({
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      text: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('SendMessageResponseSchema', () => {
  it('parses a valid send response with messages', () => {
    const result = SendMessageResponseSchema.safeParse({
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      messages: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          role: 'assistant',
          kind: 'text',
          text: 'Hello!',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('CardActionRequestSchema', () => {
  it('parses a valid card action request', () => {
    const result = CardActionRequestSchema.safeParse({
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      cardId: 'card-survey-1',
      userSummary: 'Submitted survey form',
      submitData: { rating: 5, comment: 'Great!' },
    });
    expect(result.success).toBe(true);
  });
});

describe('CardActionResponseSchema', () => {
  it('parses a valid card action response', () => {
    const result = CardActionResponseSchema.safeParse({
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      messages: [],
    });
    expect(result.success).toBe(true);
  });
});
