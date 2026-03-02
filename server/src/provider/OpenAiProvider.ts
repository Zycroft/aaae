import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import type { NormalizedMessage, ExtractedPayload } from '@copilot-chat/shared';
import type { LlmProvider } from './LlmProvider.js';

/**
 * Chat message shape for the OpenAI messages array.
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Configuration for OpenAiProvider.
 */
export interface OpenAiProviderConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Model identifier (default: 'gpt-4o-mini') */
  model?: string;
}

/**
 * The JSON schema passed to OpenAI's response_format to enforce structured output
 * matching CopilotStructuredOutputSchema.
 */
const WORKFLOW_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'workflow_response',
    strict: false,
    schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['ask', 'research', 'confirm', 'complete', 'error'],
        },
        prompt: { type: 'string' },
        data: { type: 'object' },
        confidence: { type: 'number' },
        citations: { type: 'array', items: { type: 'string' } },
      },
      required: ['action', 'prompt', 'data', 'confidence', 'citations'],
    },
  },
};

/**
 * System prompt instructing the OpenAI model about the workflow and response format.
 *
 * The orchestrator's contextBuilder already enriches user messages with
 * [CONTEXT]...[/CONTEXT] preambles containing step, collectedData, and turnCount.
 * This system prompt teaches the model how to interpret that context and produce
 * structured output compatible with the existing parser pipeline.
 */
const SYSTEM_PROMPT = `You are an expert assistant for airport planning, purchasing, and project management.

You help airport professionals with:
- **RFQs (Requests for Quotation)** — drafting, reviewing, comparing vendor quotes, and recommending selections
- **RFIs (Requests for Information)** — creating, tracking, and managing information requests across project stakeholders
- **Project planning** — capital improvement programs, terminal expansions, runway projects, airfield upgrades, and facility modernization
- **Procurement** — vendor evaluation, bid analysis, contract language, compliance with FAA/DOT regulations, and AIP (Airport Improvement Program) grant requirements
- **General airport operations knowledge** — TSA requirements, FAA Advisory Circulars, airport design standards, and industry best practices

You guide users through a structured workflow with these steps:
1. initial — Greet the user and understand their need
2. gather_info — Collect project details, requirements, specifications, and constraints
3. research — Analyze options, compare vendors/approaches, and assess compliance
4. confirm — Present recommendation or deliverable for user review
5. complete — Deliver the final document, analysis, or recommendation

IMPORTANT: You MUST respond with valid JSON matching the required schema. Every response must include:
- "action": One of "ask", "research", "confirm", "complete", "error" — signals the current workflow stage
- "prompt": Your user-facing text response (this is what the user sees). Use markdown formatting for readability.
- "data": An object containing any structured data you want to collect or return (empty {} if none)
- "confidence": A number between 0 and 1 indicating your certainty
- "citations": An array of source URLs (empty [] if none)

User messages may include a [CONTEXT] block with workflow state (step, collectedData, turnCount). Use this to maintain continuity across turns.

When greeting: use action "ask" and a welcoming, professional prompt that mentions your airport planning expertise.
When collecting info: use action "ask" with specific questions about the project, timeline, budget, or requirements.
When researching: use action "research" and provide detailed analysis with industry context.
When confirming: use action "confirm" and present your recommendation clearly with pros/cons.
When done: use action "complete" with the final deliverable formatted for professional use.`;

/**
 * OpenAiProvider — implements LlmProvider using the OpenAI chat completions API.
 *
 * Manages per-conversation message history in server memory, uses structured output
 * (response_format: json_schema) to produce extractedPayload compatible with the
 * existing orchestrator and parser pipeline, and converts card actions to text.
 *
 * OAPI-01, OAPI-02, OAPI-03, OAPI-04, OAPI-05, OAPI-06
 */
export class OpenAiProvider implements LlmProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly conversationHistories: Map<string, ChatMessage[]>;

  constructor(config: OpenAiProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model ?? 'gpt-4o-mini';
    this.conversationHistories = new Map();
  }

  /**
   * Start a new conversation session.
   *
   * Initializes conversation history, sends a greeting request to OpenAI,
   * and returns the greeting as NormalizedMessage[] with extractedPayload.
   *
   * OAPI-01
   */
  async startSession(conversationId: string): Promise<NormalizedMessage[]> {
    // Initialize empty history for this conversation
    this.conversationHistories.set(conversationId, []);

    // Request a greeting from OpenAI
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: 'Please greet me and introduce yourself.' },
      ],
      response_format: WORKFLOW_RESPONSE_SCHEMA,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content) as Record<string, unknown>;

    // Store the greeting exchange in history
    const history = this.conversationHistories.get(conversationId)!;
    history.push({ role: 'assistant', content });

    return [this.buildNormalizedMessage(parsed)];
  }

  /**
   * Send a user text message and return the assistant's response.
   *
   * Appends the user message to conversation history, calls OpenAI with the
   * full history (system prompt + all prior turns), parses the structured
   * response, and returns NormalizedMessage[] with extractedPayload.
   *
   * OAPI-02, OAPI-03, OAPI-04
   */
  async sendMessage(
    conversationId: string,
    message: string
  ): Promise<NormalizedMessage[]> {
    // Get or create history
    let history = this.conversationHistories.get(conversationId);
    if (!history) {
      history = [];
      this.conversationHistories.set(conversationId, history);
    }

    // Append user message to history
    history.push({ role: 'user', content: message });

    // Build messages array: system prompt + full conversation history
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
    ];

    // Call OpenAI with structured output
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      response_format: WORKFLOW_RESPONSE_SCHEMA,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content) as Record<string, unknown>;

    // Append assistant response to history
    history.push({ role: 'assistant', content });

    return [this.buildNormalizedMessage(parsed)];
  }

  /**
   * Convert a card action submission to text and process through sendMessage.
   *
   * Adaptive Card submit actions carry structured data that is Copilot-specific.
   * For the OpenAI provider, we convert the action payload to a human-readable
   * text description and delegate to sendMessage for processing.
   *
   * OAPI-05
   */
  async sendCardAction(
    conversationId: string,
    actionValue: Record<string, unknown>
  ): Promise<NormalizedMessage[]> {
    // Convert action value to text description
    const entries = Object.entries(actionValue)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(', ');
    const textDescription = `[Card Action] User submitted: ${entries}`;

    // Delegate to sendMessage
    return this.sendMessage(conversationId, textDescription);
  }

  /**
   * Build a NormalizedMessage from a parsed OpenAI structured response.
   *
   * Sets extractedPayload with source 'value' and confidence 'high' since
   * the response comes from OpenAI's structured output (json_schema mode),
   * which guarantees valid JSON matching our schema.
   */
  private buildNormalizedMessage(
    parsed: Record<string, unknown>
  ): NormalizedMessage {
    const extractedPayload: ExtractedPayload = {
      source: 'value',
      confidence: 'high',
      data: parsed,
    };

    return {
      id: uuidv4(),
      role: 'assistant',
      kind: 'text',
      text: (parsed.prompt as string) ?? '',
      extractedPayload,
    };
  }
}
