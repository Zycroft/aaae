import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Activity } from '@microsoft/agents-activity';
import type { NormalizedMessage } from '@copilot-chat/shared';
import { CopilotProvider } from './CopilotProvider.js';

// Mock activityNormalizer — control what NormalizedMessage[] it returns
vi.mock('../normalizer/activityNormalizer.js', () => ({
  normalizeActivities: vi.fn(),
}));

import { normalizeActivities } from '../normalizer/activityNormalizer.js';
const mockNormalizeActivities = vi.mocked(normalizeActivities);

/**
 * Helper: creates a mock async iterable that yields the given items.
 */
async function* mockAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

/**
 * Creates a mock CopilotStudioClient with controllable streaming methods.
 */
function createMockClient() {
  return {
    startConversationStreaming: vi.fn(),
    sendActivityStreaming: vi.fn(),
  };
}

describe('CopilotProvider', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let provider: CopilotProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    // Cast to satisfy CopilotStudioClient type — we only use the streaming methods
    provider = new CopilotProvider(mockClient as unknown as ConstructorParameters<typeof CopilotProvider>[0]);
  });

  describe('startSession', () => {
    it('collects streaming activities and normalizes them', async () => {
      const activity1 = { type: 'message', text: 'Welcome' } as Activity;
      const activity2 = { type: 'message', text: 'How can I help?' } as Activity;
      mockClient.startConversationStreaming.mockReturnValue(
        mockAsyncIterable([activity1, activity2])
      );

      const expectedMessages: NormalizedMessage[] = [
        { id: '1', role: 'assistant', kind: 'text', text: 'Welcome' },
      ];
      mockNormalizeActivities.mockReturnValue(expectedMessages);

      const result = await provider.startSession('conv-1');

      expect(mockClient.startConversationStreaming).toHaveBeenCalledWith(true);
      expect(mockNormalizeActivities).toHaveBeenCalledWith([activity1, activity2]);
      expect(result).toEqual(expectedMessages);
    });

    it('returns empty array when no activities are streamed', async () => {
      mockClient.startConversationStreaming.mockReturnValue(mockAsyncIterable([]));
      mockNormalizeActivities.mockReturnValue([]);

      const result = await provider.startSession('conv-empty');

      expect(mockClient.startConversationStreaming).toHaveBeenCalledWith(true);
      expect(mockNormalizeActivities).toHaveBeenCalledWith([]);
      expect(result).toEqual([]);
    });
  });

  describe('sendMessage', () => {
    it('builds activity and normalizes response', async () => {
      const responseActivity = { type: 'message', text: 'Response' } as Activity;
      mockClient.sendActivityStreaming.mockReturnValue(
        mockAsyncIterable([responseActivity])
      );

      const expectedMessages: NormalizedMessage[] = [
        { id: '2', role: 'assistant', kind: 'text', text: 'Response' },
      ];
      mockNormalizeActivities.mockReturnValue(expectedMessages);

      const result = await provider.sendMessage('conv-1', 'Hello');

      // Verify the activity was built correctly
      const sentActivity = mockClient.sendActivityStreaming.mock.calls[0][0];
      expect(sentActivity.type).toBe('message');
      expect(sentActivity.text).toBe('Hello');

      expect(mockNormalizeActivities).toHaveBeenCalledWith([responseActivity]);
      expect(result).toEqual(expectedMessages);
    });
  });

  describe('sendCardAction', () => {
    it('builds card action activity and normalizes response', async () => {
      const responseActivity = { type: 'message', text: 'Card processed' } as Activity;
      mockClient.sendActivityStreaming.mockReturnValue(
        mockAsyncIterable([responseActivity])
      );

      const expectedMessages: NormalizedMessage[] = [
        { id: '3', role: 'assistant', kind: 'text', text: 'Card processed' },
      ];
      mockNormalizeActivities.mockReturnValue(expectedMessages);

      const actionValue = { action: 'submit', data: { key: 'value' } };
      const result = await provider.sendCardAction('conv-1', actionValue);

      // Verify the activity carries the action value
      const sentActivity = mockClient.sendActivityStreaming.mock.calls[0][0];
      expect(sentActivity.type).toBe('message');
      expect(sentActivity.value).toEqual(actionValue);

      expect(mockNormalizeActivities).toHaveBeenCalledWith([responseActivity]);
      expect(result).toEqual(expectedMessages);
    });
  });
});
