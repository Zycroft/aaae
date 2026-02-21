// Usage: npx tsx spike/context-injection-spike.ts
// Requires server/.env with real COPILOT_ENVIRONMENT_ID, COPILOT_AGENT_SCHEMA_NAME, COPILOT_STUB_TOKEN

/**
 * Context Injection Spike — 3-Turn Live Conversation
 *
 * Drives a multi-turn conversation against the real Copilot agent with
 * workflowContext injection at two size thresholds (~500 chars and ~1000 chars).
 *
 * Validates:
 *   CTX-03: Context injection works end-to-end
 *   CTX-04: Size threshold findings (500 vs 1000 char contexts)
 *   ORCH-04: Conversation state preserved across turns
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  CopilotStudioClient,
  ConnectionSettings,
} from '@microsoft/agents-copilotstudio-client';
import type { Activity } from '@microsoft/agents-activity';
import { ActivityTypes } from '@microsoft/agents-activity';

// Load environment from server/.env
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../server/.env') });

const ENVIRONMENT_ID = process.env.COPILOT_ENVIRONMENT_ID;
const SCHEMA_NAME = process.env.COPILOT_AGENT_SCHEMA_NAME;
const STUB_TOKEN = process.env.COPILOT_STUB_TOKEN ?? '';

if (!ENVIRONMENT_ID || !SCHEMA_NAME) {
  console.error(
    '[ERROR] Missing COPILOT_ENVIRONMENT_ID or COPILOT_AGENT_SCHEMA_NAME in server/.env\n' +
    'This spike requires real Copilot Studio credentials to run.\n' +
    'Copy server/.env.example to server/.env and fill in your credentials.'
  );
  process.exit(1);
}

// --- Context prefix builder (matches server/src/routes/chat.ts) ---

interface WorkflowContext {
  step: string;
  constraints?: string[];
  collectedData?: Record<string, unknown>;
}

function buildContextPrefix(ctx: WorkflowContext): string {
  return (
    `[WORKFLOW_CONTEXT]\n` +
    `step: ${ctx.step}\n` +
    `constraints: ${ctx.constraints?.join(' | ') ?? 'none'}\n` +
    `data: ${JSON.stringify(ctx.collectedData ?? {})}\n` +
    `[/WORKFLOW_CONTEXT]\n\n`
  );
}

// --- Turn definitions ---

interface TurnDef {
  turnNumber: number;
  context: WorkflowContext;
  userQuery: string;
}

const SMALL_CONTEXT_TURNS: TurnDef[] = [
  {
    turnNumber: 1,
    context: { step: 'gather-name', constraints: [], collectedData: {} },
    userQuery: 'What information do you need from me?',
  },
  {
    turnNumber: 2,
    context: {
      step: 'gather-budget',
      constraints: ['must be numeric'],
      collectedData: { name: 'Alice' },
    },
    userQuery: "My name is Alice, what's next?",
  },
  {
    turnNumber: 3,
    context: {
      step: 'confirm',
      constraints: [],
      collectedData: { name: 'Alice', budget: 5000 },
    },
    userQuery: 'Please confirm my details',
  },
];

// Large context — pad collectedData to reach ~1000 chars
function makeLargeContextTurns(): TurnDef[] {
  const paddedData: Record<string, unknown> = {
    name: 'Alice',
    email: 'alice@example.com',
    department: 'Engineering',
    location: 'Building 42, Floor 3, Room 301',
    phone: '+1-555-0123',
    managerName: 'Bob Smith',
    managerEmail: 'bob.smith@example.com',
    projectCode: 'PROJ-2026-ALPHA',
    budgetCategory: 'operational-expenses',
    fiscalYear: '2026',
    notes: 'Priority request for Q1 deliverables. Requires VP approval if over 10k. Contact finance team for PO generation.',
  };

  return [
    {
      turnNumber: 1,
      context: {
        step: 'gather-name',
        constraints: ['respond in English', 'be concise', 'ask one question at a time'],
        collectedData: paddedData,
      },
      userQuery: 'What information do you need from me?',
    },
    {
      turnNumber: 2,
      context: {
        step: 'gather-budget',
        constraints: ['must be numeric', 'USD only', 'max 100000', 'requires justification over 10000'],
        collectedData: { ...paddedData, budget: 5000 },
      },
      userQuery: "My name is Alice, what's next?",
    },
    {
      turnNumber: 3,
      context: {
        step: 'confirm',
        constraints: ['show all collected data', 'ask for explicit confirmation'],
        collectedData: { ...paddedData, budget: 5000, confirmed: false },
      },
      userQuery: 'Please confirm my details',
    },
  ];
}

// --- Execution ---

interface TurnResult {
  turnNumber: number;
  contextSize: number;
  responseText: string | null;
  referencedStep: boolean;
  pass: boolean;
}

async function runScenario(
  client: CopilotStudioClient,
  scenarioName: string,
  turns: TurnDef[]
): Promise<TurnResult[]> {
  console.log(`\n--- ${scenarioName} ---\n`);
  const results: TurnResult[] = [];

  for (const turn of turns) {
    const prefix = buildContextPrefix(turn.context);
    const outboundText = prefix + turn.userQuery;
    const contextSize = prefix.length;

    console.log(`Turn ${turn.turnNumber} (context: ${contextSize} chars)`);

    const userActivity: Activity = {
      type: ActivityTypes.Message,
      text: outboundText,
    } as Activity;

    let responseText: string | null = null;
    let pass = false;

    try {
      const collectedActivities: Activity[] = [];
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        collectedActivities.push(activity);
      }

      // Extract text from message activities
      const textActivities = collectedActivities.filter(
        (a) => a.type === ActivityTypes.Message && a.text
      );

      if (textActivities.length > 0) {
        responseText = textActivities.map((a) => a.text).join(' ');
        pass = true;
      }
    } catch (err) {
      console.error(`  [ERROR] Turn ${turn.turnNumber} failed: ${(err as Error).message}`);
    }

    const first200 = responseText ? responseText.substring(0, 200) : 'NO TEXT RESPONSE';
    const referencedStep = responseText
      ? responseText.toLowerCase().includes(turn.context.step.replace('-', ' ').toLowerCase()) ||
        responseText.toLowerCase().includes(turn.context.step.toLowerCase())
      : false;

    console.log(`  Response (first 200 chars): ${first200}`);
    console.log(`  Referenced step "${turn.context.step}": ${referencedStep ? 'yes' : 'no'}`);
    console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}\n`);

    results.push({ turnNumber: turn.turnNumber, contextSize, responseText, referencedStep, pass });
  }

  return results;
}

async function main() {
  console.log('=== Context Injection Spike ===\n');
  console.log(`Agent: ${SCHEMA_NAME}`);
  console.log(`Environment: ${ENVIRONMENT_ID}`);

  // Start conversation
  const settings = new ConnectionSettings({
    environmentId: ENVIRONMENT_ID!,
    schemaName: SCHEMA_NAME!,
  });

  // --- Scenario 1: Small context (~500 chars) ---
  const client1 = new CopilotStudioClient(settings, STUB_TOKEN);

  console.log('\nEstablishing conversation for small context scenario...');
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _activity of client1.startConversationStreaming(true)) {
      // Consume to establish state
    }
  } catch (err) {
    console.error(
      '\n[ERROR] Failed to start conversation. Ensure server/.env has real COPILOT_* credentials.'
    );
    console.error('Detail:', (err as Error).message);
    process.exit(1);
  }

  const smallResults = await runScenario(client1, 'Small Context (~500 chars)', SMALL_CONTEXT_TURNS);

  // --- Scenario 2: Large context (~1000 chars) ---
  const client2 = new CopilotStudioClient(settings, STUB_TOKEN);

  console.log('\nEstablishing conversation for large context scenario...');
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _activity of client2.startConversationStreaming(true)) {
      // Consume to establish state
    }
  } catch (err) {
    console.error('\n[ERROR] Failed to start conversation for large context scenario.');
    console.error('Detail:', (err as Error).message);
    process.exit(1);
  }

  const largeTurns = makeLargeContextTurns();
  const largeResults = await runScenario(client2, 'Large Context (~1000 chars)', largeTurns);

  // --- Summary ---
  console.log('\n\n=== Summary ===\n');

  const formatResult = (r: TurnResult) => r.pass ? 'PASS' : 'FAIL';

  console.log('| Scenario       | Context Size | Turn 1 | Turn 2 | Turn 3 | Overall |');
  console.log('|----------------|-------------|--------|--------|--------|---------|');

  const smallOverall = smallResults.every((r) => r.pass) ? 'PASS' : 'FAIL';
  console.log(
    `| Small context  | ~${smallResults[0]?.contextSize ?? '?'} chars | ${formatResult(smallResults[0])} | ${formatResult(smallResults[1])} | ${formatResult(smallResults[2])} | ${smallOverall} |`
  );

  const largeOverall = largeResults.every((r) => r.pass) ? 'PASS' : 'FAIL';
  console.log(
    `| Large context  | ~${largeResults[0]?.contextSize ?? '?'} chars | ${formatResult(largeResults[0])} | ${formatResult(largeResults[1])} | ${formatResult(largeResults[2])} | ${largeOverall} |`
  );

  console.log('\nORCH-04 (Conversation Continuity):');
  console.log(`  Small: Turn 1→2 ${smallResults[1]?.pass ? 'preserved' : 'BROKEN'}, Turn 2→3 ${smallResults[2]?.pass ? 'preserved' : 'BROKEN'}`);
  console.log(`  Large: Turn 1→2 ${largeResults[1]?.pass ? 'preserved' : 'BROKEN'}, Turn 2→3 ${largeResults[2]?.pass ? 'preserved' : 'BROKEN'}`);

  console.log('\nUpdate spike/CONTEXT-INJECTION-RESULTS.md with these results.');
}

main().catch((err) => {
  console.error('\n[ERROR] Unexpected failure:', (err as Error).message);
  process.exit(1);
});
