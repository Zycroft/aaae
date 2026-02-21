/**
 * Copilot Studio SDK Latency Baseline Measurement
 *
 * Measures startConversation, sendMessage, and full round-trip latencies
 * against the real Copilot Studio agent.
 *
 * Usage (from repo root):
 *   npx tsx spike/latency-baseline.ts
 *
 * Requirements:
 *   - server/.env must have real COPILOT_ENVIRONMENT_ID, COPILOT_AGENT_SCHEMA_NAME, COPILOT_STUB_TOKEN
 *   - The Copilot Studio agent must be reachable
 *
 * PERF-01, PERF-02, PERF-03
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
import { normalizeActivities } from '../server/src/normalizer/activityNormalizer.js';

// Load environment from server/.env
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../server/.env') });

const ENVIRONMENT_ID = process.env.COPILOT_ENVIRONMENT_ID;
const SCHEMA_NAME = process.env.COPILOT_AGENT_SCHEMA_NAME;
const STUB_TOKEN = process.env.COPILOT_STUB_TOKEN ?? '';

if (!ENVIRONMENT_ID || !SCHEMA_NAME) {
  console.error(
    '[ERROR] Missing COPILOT_ENVIRONMENT_ID or COPILOT_AGENT_SCHEMA_NAME in server/.env'
  );
  process.exit(1);
}

const SAMPLE_COUNT = 5;

// --- Helpers ---

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function formatSamples(samples: number[]): string {
  return samples.map((s) => `${s}ms`).join(', ');
}

// --- Measurement functions ---

async function measureStartConversation(
  samples: number
): Promise<number[]> {
  const results: number[] = [];

  for (let i = 0; i < samples; i++) {
    // Create a fresh client for each startConversation measurement
    const settings = new ConnectionSettings({
      environmentId: ENVIRONMENT_ID!,
      schemaName: SCHEMA_NAME!,
    });
    const client = new CopilotStudioClient(settings, STUB_TOKEN);

    const start = performance.now();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _activity of client.startConversationStreaming(true)) {
      // Consume the full generator
    }
    const elapsed = Math.round(performance.now() - start);
    results.push(elapsed);
    console.log(`  startConversation sample ${i + 1}/${samples}: ${elapsed}ms`);
  }

  return results;
}

async function measureSendMessage(
  client: CopilotStudioClient,
  samples: number
): Promise<number[]> {
  const results: number[] = [];

  for (let i = 0; i < samples; i++) {
    const userActivity: Activity = {
      type: ActivityTypes.Message,
      text: 'hello',
    } as Activity;

    const start = performance.now();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _activity of client.sendActivityStreaming(userActivity)) {
      // Consume the full generator
    }
    const elapsed = Math.round(performance.now() - start);
    results.push(elapsed);
    console.log(`  sendMessage sample ${i + 1}/${samples}: ${elapsed}ms`);
  }

  return results;
}

async function measureFullRoundTrip(
  client: CopilotStudioClient,
  samples: number
): Promise<number[]> {
  const results: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = performance.now();

    // Build Activity (simulating route handler)
    const userActivity: Activity = {
      type: ActivityTypes.Message,
      text: 'hello',
    } as Activity;

    // Send and collect
    const collectedActivities: Activity[] = [];
    for await (const activity of client.sendActivityStreaming(userActivity)) {
      collectedActivities.push(activity);
    }

    // Normalize (same as route handler does)
    normalizeActivities(collectedActivities);

    const elapsed = Math.round(performance.now() - start);
    results.push(elapsed);
    console.log(`  full round-trip sample ${i + 1}/${samples}: ${elapsed}ms`);
  }

  return results;
}

// --- Main ---

async function main() {
  console.log('=== Copilot Studio SDK Latency Baseline ===\n');
  console.log(`Agent: ${SCHEMA_NAME}`);
  console.log(`Environment: ${ENVIRONMENT_ID}`);
  console.log(`Samples per metric: ${SAMPLE_COUNT}\n`);

  // 1. Measure startConversation
  console.log('--- startConversation ---');
  let startSamples: number[];
  try {
    startSamples = await measureStartConversation(SAMPLE_COUNT);
  } catch (err) {
    console.error(
      '\n[ERROR] Copilot Studio connection failed. Ensure server/.env has real COPILOT_* credentials.'
    );
    console.error('Detail:', (err as Error).message);
    process.exit(1);
  }

  // 2. Establish a conversation for subsequent measurements
  console.log('\n--- Establishing conversation for sendMessage/round-trip ---');
  const settings = new ConnectionSettings({
    environmentId: ENVIRONMENT_ID!,
    schemaName: SCHEMA_NAME!,
  });
  const client = new CopilotStudioClient(settings, STUB_TOKEN);

  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _activity of client.startConversationStreaming(true)) {
      // Consume to establish state
    }
  } catch (err) {
    console.error(
      '\n[ERROR] Failed to establish conversation for sendMessage measurements.'
    );
    console.error('Detail:', (err as Error).message);
    process.exit(1);
  }

  // 3. Measure sendMessage
  console.log('\n--- sendMessage to first activity ---');
  let sendSamples: number[];
  try {
    sendSamples = await measureSendMessage(client, SAMPLE_COUNT);
  } catch (err) {
    console.error('\n[ERROR] sendMessage measurement failed.');
    console.error('Detail:', (err as Error).message);
    process.exit(1);
  }

  // 4. Measure full round-trip
  console.log('\n--- Full round-trip ---');
  let roundTripSamples: number[];
  try {
    roundTripSamples = await measureFullRoundTrip(client, SAMPLE_COUNT);
  } catch (err) {
    console.error('\n[ERROR] Full round-trip measurement failed.');
    console.error('Detail:', (err as Error).message);
    process.exit(1);
  }

  // 5. Print summary
  console.log('\n\n=== Copilot Studio SDK Latency Baseline ===\n');

  console.log(`startConversation (${SAMPLE_COUNT} samples):`);
  console.log(`  Samples: [${formatSamples(startSamples)}]`);
  console.log(`  Median:  ${median(startSamples)}ms\n`);

  console.log(`sendMessage to first activity (${SAMPLE_COUNT} samples):`);
  console.log(`  Samples: [${formatSamples(sendSamples)}]`);
  console.log(`  Median:  ${median(sendSamples)}ms\n`);

  console.log(`Full round-trip (${SAMPLE_COUNT} samples):`);
  console.log(`  Samples: [${formatSamples(roundTripSamples)}]`);
  console.log(`  Median:  ${median(roundTripSamples)}ms\n`);

  console.log('Copy these numbers into spike/LATENCY-RESULTS.md');
}

main().catch((err) => {
  console.error('\n[ERROR] Unexpected failure:', (err as Error).message);
  process.exit(1);
});
