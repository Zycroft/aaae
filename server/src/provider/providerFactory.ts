import { config } from '../config.js';
import type { LlmProvider } from './LlmProvider.js';

/**
 * Provider metadata for health endpoint and logging.
 */
export interface ProviderInfo {
  provider: string;
  model: string;
}

/**
 * Returns metadata about the active LLM provider.
 *
 * Synchronous — reads from config only, no SDK loading.
 * Used by the health endpoint to report provider and model.
 *
 * CONF-05
 */
export function getProviderInfo(): ProviderInfo {
  if (config.LLM_PROVIDER === 'openai') {
    return { provider: 'openai', model: config.OPENAI_MODEL };
  }
  return { provider: 'copilot', model: 'copilot-studio' };
}

/**
 * Creates the LlmProvider based on LLM_PROVIDER config.
 *
 * Uses dynamic import() to lazy-load only the selected provider's SDK:
 * - LLM_PROVIDER=openai  → loads OpenAiProvider (pulls openai SDK)
 * - LLM_PROVIDER=copilot → loads CopilotProvider + copilot.ts (pulls Copilot SDK)
 *
 * This ensures the Copilot SDK is never imported when using OpenAI,
 * and the OpenAI SDK is never imported when using Copilot.
 *
 * PROV-04, PROV-05
 */
export async function createProvider(): Promise<LlmProvider> {
  console.log(`[provider] Creating ${config.LLM_PROVIDER} provider`);

  if (config.LLM_PROVIDER === 'openai') {
    const { OpenAiProvider } = await import('./OpenAiProvider.js');
    return new OpenAiProvider({
      apiKey: config.OPENAI_API_KEY!,
      model: config.OPENAI_MODEL,
    });
  }

  // Default: copilot
  const { copilotClient } = await import('../copilot.js');
  const { CopilotProvider } = await import('./CopilotProvider.js');
  return new CopilotProvider(copilotClient);
}
