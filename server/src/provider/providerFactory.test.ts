import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config module before imports
vi.mock('../config.js', () => ({
  config: {
    LLM_PROVIDER: 'copilot' as const,
    OPENAI_API_KEY: undefined as string | undefined,
    OPENAI_MODEL: 'gpt-4o-mini',
    COPILOT_ENVIRONMENT_ID: '',
    COPILOT_AGENT_SCHEMA_NAME: '',
  },
}));

// Mock OpenAiProvider module
const MockOpenAiProvider = vi.fn().mockImplementation(() => ({
  startSession: vi.fn(),
  sendMessage: vi.fn(),
  sendCardAction: vi.fn(),
}));
vi.mock('./OpenAiProvider.js', () => ({
  OpenAiProvider: MockOpenAiProvider,
}));

// Mock CopilotProvider module
const MockCopilotProvider = vi.fn().mockImplementation(() => ({
  startSession: vi.fn(),
  sendMessage: vi.fn(),
  sendCardAction: vi.fn(),
}));
vi.mock('./CopilotProvider.js', () => ({
  CopilotProvider: MockCopilotProvider,
}));

// Mock copilot.ts singleton
const mockCopilotClient = { startConversationStreaming: vi.fn() };
vi.mock('../copilot.js', () => ({
  copilotClient: mockCopilotClient,
}));

import { config } from '../config.js';
import { createProvider, getProviderInfo } from './providerFactory.js';

describe('providerFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset config to defaults
    vi.mocked(config).LLM_PROVIDER = 'copilot';
    vi.mocked(config).OPENAI_API_KEY = undefined;
    vi.mocked(config).OPENAI_MODEL = 'gpt-4o-mini';
  });

  // ── getProviderInfo ──

  describe('getProviderInfo', () => {
    it('returns copilot provider info when LLM_PROVIDER is copilot', () => {
      vi.mocked(config).LLM_PROVIDER = 'copilot';

      const info = getProviderInfo();

      expect(info).toEqual({ provider: 'copilot', model: 'copilot-studio' });
    });

    it('returns openai provider info with default model when LLM_PROVIDER is openai', () => {
      vi.mocked(config).LLM_PROVIDER = 'openai';
      vi.mocked(config).OPENAI_MODEL = 'gpt-4o-mini';

      const info = getProviderInfo();

      expect(info).toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
    });

    it('returns custom model when OPENAI_MODEL is overridden', () => {
      vi.mocked(config).LLM_PROVIDER = 'openai';
      vi.mocked(config).OPENAI_MODEL = 'gpt-4o';

      const info = getProviderInfo();

      expect(info).toEqual({ provider: 'openai', model: 'gpt-4o' });
    });
  });

  // ── createProvider ──

  describe('createProvider', () => {
    it('creates CopilotProvider when LLM_PROVIDER is copilot (PROV-04)', async () => {
      vi.mocked(config).LLM_PROVIDER = 'copilot';

      const provider = await createProvider();

      expect(MockCopilotProvider).toHaveBeenCalledOnce();
      expect(MockCopilotProvider).toHaveBeenCalledWith(mockCopilotClient);
      expect(provider).toBeDefined();
      // OpenAiProvider should NOT have been constructed
      expect(MockOpenAiProvider).not.toHaveBeenCalled();
    });

    it('creates OpenAiProvider when LLM_PROVIDER is openai (PROV-04)', async () => {
      vi.mocked(config).LLM_PROVIDER = 'openai';
      vi.mocked(config).OPENAI_API_KEY = 'test-api-key';
      vi.mocked(config).OPENAI_MODEL = 'gpt-4o-mini';

      const provider = await createProvider();

      expect(MockOpenAiProvider).toHaveBeenCalledOnce();
      expect(MockOpenAiProvider).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        model: 'gpt-4o-mini',
      });
      expect(provider).toBeDefined();
      // CopilotProvider should NOT have been constructed
      expect(MockCopilotProvider).not.toHaveBeenCalled();
    });

    it('passes custom OPENAI_MODEL to OpenAiProvider', async () => {
      vi.mocked(config).LLM_PROVIDER = 'openai';
      vi.mocked(config).OPENAI_API_KEY = 'test-key';
      vi.mocked(config).OPENAI_MODEL = 'gpt-4o';

      await createProvider();

      expect(MockOpenAiProvider).toHaveBeenCalledWith({
        apiKey: 'test-key',
        model: 'gpt-4o',
      });
    });

    it('logs provider name to console', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(config).LLM_PROVIDER = 'openai';
      vi.mocked(config).OPENAI_API_KEY = 'test-key';
      await createProvider();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('openai')
      );
      consoleSpy.mockRestore();
    });
  });
});
