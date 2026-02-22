import type { WorkflowState } from '@copilot-chat/shared';

/**
 * Configuration for the context builder.
 *
 * CTX-02, CTX-03
 */
export interface ContextBuilderConfig {
  /**
   * Custom preamble template. Placeholders:
   * - {step} — current workflow step
   * - {dataJson} — JSON-serialized collectedData
   * - {turnCount} — workflow turn number
   * - {userMessage} — the user's message text
   */
  preambleTemplate?: string;

  /**
   * Maximum total query length in characters. Excess is truncated with '...' suffix.
   * Default: 2000.
   */
  maxLength?: number;
}

const DEFAULT_TEMPLATE = `[CONTEXT]
Phase: {step}
Collected data: {dataJson}
Turn number: {turnCount}
[/CONTEXT]

{userMessage}`;

/**
 * Enriches an outbound Copilot query with a workflow state preamble.
 *
 * Builds a full query string by interpolating workflow state into a configurable
 * template, then truncating to maxLength if the result exceeds the limit.
 * Pure synchronous function with no side effects.
 *
 * CTX-01, CTX-02, CTX-03
 *
 * @param userMessage - The user's raw message text
 * @param workflowState - Current workflow state (step, collectedData, turnCount)
 * @param config - Optional configuration for template and max length
 * @returns Object with the enriched query string and whether truncation occurred
 */
export function buildContextualQuery(
  userMessage: string,
  workflowState: WorkflowState,
  config?: ContextBuilderConfig
): { query: string; truncated: boolean } {
  const template = config?.preambleTemplate ?? DEFAULT_TEMPLATE;
  const maxLength = config?.maxLength ?? 2000;

  const dataJson = JSON.stringify(workflowState.collectedData ?? {});

  // Use string .replace() (not regex) for safe literal substitution —
  // avoids issues with special characters like $ or braces in values
  let query = template
    .replace('{step}', workflowState.step)
    .replace('{dataJson}', dataJson)
    .replace('{turnCount}', String(workflowState.turnCount))
    .replace('{userMessage}', userMessage);

  if (query.length > maxLength) {
    query = query.slice(0, maxLength - 3).trimEnd() + '...';
    return { query, truncated: true };
  }

  return { query, truncated: false };
}
