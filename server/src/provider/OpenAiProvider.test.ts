import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopilotStructuredOutputSchema } from '@copilot-chat/shared';

// Shared mock fn — accessible by both the mock factory and test code
const mockCreate = vi.fn();

// Mock the openai module
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// Mock uuid for deterministic IDs
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-uuid-001'),
}));

import { OpenAiProvider } from './OpenAiProvider.js';

/**
 * Helper: creates a mock OpenAI chat completion response.
 */
function mockCompletion(content: Record<string, unknown>) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify(content),
          role: 'assistant',
        },
        finish_reason: 'stop',
      },
    ],
  };
}

/** Standard structured response matching CopilotStructuredOutputSchema */
const STANDARD_RESPONSE = {
  action: 'ask',
  prompt: 'Hello! How can I help you today?',
  data: {},
  confidence: 0.9,
  citations: [],
};

const GREETING_RESPONSE = {
  action: 'ask',
  prompt: 'Welcome! I am your assistant. What would you like help with?',
  data: {},
  confidence: 1.0,
  citations: [],
};

const SECOND_TURN_RESPONSE = {
  action: 'research',
  prompt: 'I see. Let me look into that for you.',
  data: { topic: 'deployment' },
  confidence: 0.85,
  citations: [],
};

describe('OpenAiProvider', () => {
  let provider: OpenAiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAiProvider({
      apiKey: 'test-api-key',
      model: 'gpt-4o-mini',
    });
  });

  describe('constructor', () => {
    it('uses OPENAI_MODEL from config, defaults to gpt-4o-mini', () => {
      const defaultProvider = new OpenAiProvider({ apiKey: 'test-key' });
      expect(defaultProvider).toBeDefined();
    });

    it('accepts custom model parameter', () => {
      const customProvider = new OpenAiProvider({
        apiKey: 'test-key',
        model: 'gpt-4o',
      });
      expect(customProvider).toBeDefined();
    });
  });

  describe('startSession', () => {
    it('returns NormalizedMessage[] with greeting text and extractedPayload', async () => {
      mockCreate.mockResolvedValueOnce(mockCompletion(GREETING_RESPONSE));

      const result = await provider.startSession('conv-1');

      expect(result).toHaveLength(1);
      const msg = result[0];
      expect(msg.role).toBe('assistant');
      expect(msg.kind).toBe('text');
      expect(msg.text).toBe(GREETING_RESPONSE.prompt);
      expect(msg.id).toBe('test-uuid-001');
    });

    it('includes extractedPayload with source "value" and confidence "high"', async () => {
      mockCreate.mockResolvedValueOnce(mockCompletion(GREETING_RESPONSE));

      const result = await provider.startSession('conv-1');

      const msg = result[0];
      expect(msg.extractedPayload).toBeDefined();
      expect(msg.extractedPayload!.source).toBe('value');
      expect(msg.extractedPayload!.confidence).toBe('high');
      expect(msg.extractedPayload!.data).toEqual(GREETING_RESPONSE);
    });

    it('initializes conversation history for the conversationId', async () => {
      mockCreate.mockResolvedValueOnce(mockCompletion(GREETING_RESPONSE));

      await provider.startSession('conv-new');

      // Verify the OpenAI call was made (greeting request)
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendMessage', () => {
    it('calls OpenAI with system prompt and user message in history', async () => {
      // Start session first
      mockCreate.mockResolvedValueOnce(mockCompletion(GREETING_RESPONSE));
      await provider.startSession('conv-1');

      // Send message
      mockCreate.mockResolvedValueOnce(mockCompletion(STANDARD_RESPONSE));
      await provider.sendMessage('conv-1', 'Help me deploy');

      // Second call is the sendMessage
      const callArgs = mockCreate.mock.calls[1][0];
      expect(callArgs.model).toBe('gpt-4o-mini');

      // Should have system prompt + greeting assistant message + user message
      const messages = callArgs.messages;
      expect(messages[0].role).toBe('system');
      expect(messages.some((m: { role: string }) => m.role === 'user')).toBe(true);
    });

    it('returns NormalizedMessage with extractedPayload containing structured data', async () => {
      mockCreate.mockResolvedValueOnce(mockCompletion(GREETING_RESPONSE));
      await provider.startSession('conv-1');

      mockCreate.mockResolvedValueOnce(mockCompletion(STANDARD_RESPONSE));
      const result = await provider.sendMessage('conv-1', 'Hello');

      expect(result).toHaveLength(1);
      const msg = result[0];
      expect(msg.role).toBe('assistant');
      expect(msg.kind).toBe('text');
      expect(msg.text).toBe(STANDARD_RESPONSE.prompt);
      expect(msg.extractedPayload).toBeDefined();
      expect(msg.extractedPayload!.data).toEqual(STANDARD_RESPONSE);
    });

    it('includes prior turn in history on second call (OAPI-04)', async () => {
      mockCreate.mockResolvedValueOnce(mockCompletion(GREETING_RESPONSE));
      await provider.startSession('conv-1');

      // First message
      mockCreate.mockResolvedValueOnce(mockCompletion(STANDARD_RESPONSE));
      await provider.sendMessage('conv-1', 'First question');

      // Second message
      mockCreate.mockResolvedValueOnce(mockCompletion(SECOND_TURN_RESPONSE));
      await provider.sendMessage('conv-1', 'Second question');

      // Third call (index 2) is the second sendMessage
      const callArgs = mockCreate.mock.calls[2][0];
      const messages = callArgs.messages;

      // Count user messages — should be 2
      const userMessages = messages.filter((m: { role: string }) => m.role === 'user');
      expect(userMessages.length).toBe(2);
      expect(userMessages[0].content).toBe('First question');
      expect(userMessages[1].content).toBe('Second question');

      // Count assistant messages — should be 2 (greeting + first response)
      const assistantMessages = messages.filter((m: { role: string }) => m.role === 'assistant');
      expect(assistantMessages.length).toBe(2);
    });

    it('uses response_format with json_schema (OAPI-02)', async () => {
      mockCreate.mockResolvedValueOnce(mockCompletion(GREETING_RESPONSE));
      await provider.startSession('conv-1');

      mockCreate.mockResolvedValueOnce(mockCompletion(STANDARD_RESPONSE));
      await provider.sendMessage('conv-1', 'Hello');

      const callArgs = mockCreate.mock.calls[1][0];
      expect(callArgs.response_format).toBeDefined();
      expect(callArgs.response_format.type).toBe('json_schema');
      expect(callArgs.response_format.json_schema).toBeDefined();
      expect(callArgs.response_format.json_schema.name).toBe('workflow_response');
    });

    it('defaults model to gpt-4o-mini when not specified (OAPI-06)', async () => {
      const defaultProvider = new OpenAiProvider({ apiKey: 'test-key' });

      mockCreate.mockResolvedValueOnce(mockCompletion(GREETING_RESPONSE));
      await defaultProvider.startSession('conv-default');

      mockCreate.mockResolvedValueOnce(mockCompletion(STANDARD_RESPONSE));
      await defaultProvider.sendMessage('conv-default', 'Hello');

      const callArgs = mockCreate.mock.calls[1][0];
      expect(callArgs.model).toBe('gpt-4o-mini');
    });
  });

  describe('sendCardAction', () => {
    it('converts action to text description and delegates to sendMessage (OAPI-05)', async () => {
      mockCreate.mockResolvedValueOnce(mockCompletion(GREETING_RESPONSE));
      await provider.startSession('conv-1');

      const actionValue = { action: 'submit', name: 'John', email: 'john@example.com' };

      mockCreate.mockResolvedValueOnce(mockCompletion(STANDARD_RESPONSE));
      const result = await provider.sendCardAction('conv-1', actionValue);

      // Should have called OpenAI with a text representation of the card action
      const callArgs = mockCreate.mock.calls[1][0];
      const userMessages = callArgs.messages.filter((m: { role: string }) => m.role === 'user');
      const lastUserMsg = userMessages[userMessages.length - 1];

      // The user message should contain the action data as text
      expect(lastUserMsg.content).toContain('Card Action');
      expect(lastUserMsg.content).toContain('action');
      expect(lastUserMsg.content).toContain('submit');

      // Should return NormalizedMessage[]
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('assistant');
    });
  });

  describe('edge cases', () => {
    it('returns empty array when OpenAI returns no content in startSession', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null, role: 'assistant' }, finish_reason: 'stop' }],
      });

      const result = await provider.startSession('conv-empty');

      expect(result).toEqual([]);
    });

    it('returns empty array when OpenAI returns no content in sendMessage', async () => {
      mockCreate.mockResolvedValueOnce(mockCompletion(GREETING_RESPONSE));
      await provider.startSession('conv-1');

      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null, role: 'assistant' }, finish_reason: 'stop' }],
      });

      const result = await provider.sendMessage('conv-1', 'Hello');

      expect(result).toEqual([]);
    });

    it('sendMessage auto-creates history for unknown conversationId', async () => {
      // Call sendMessage without startSession first
      mockCreate.mockResolvedValueOnce(mockCompletion(STANDARD_RESPONSE));

      const result = await provider.sendMessage('conv-unknown', 'Hello');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe(STANDARD_RESPONSE.prompt);

      // Verify system prompt + user message were sent
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].role).toBe('system');
      const userMsgs = callArgs.messages.filter((m: { role: string }) => m.role === 'user');
      expect(userMsgs).toHaveLength(1);
      expect(userMsgs[0].content).toBe('Hello');
    });
  });

  describe('extractedPayload schema compatibility', () => {
    it('extractedPayload.data passes CopilotStructuredOutputSchema.safeParse()', async () => {
      mockCreate.mockResolvedValueOnce(mockCompletion(GREETING_RESPONSE));
      await provider.startSession('conv-1');

      mockCreate.mockResolvedValueOnce(mockCompletion(STANDARD_RESPONSE));
      const result = await provider.sendMessage('conv-1', 'Hello');

      const msg = result[0];
      expect(msg.extractedPayload).toBeDefined();

      const parseResult = CopilotStructuredOutputSchema.safeParse(msg.extractedPayload!.data);
      expect(parseResult.success).toBe(true);
    });
  });
});
