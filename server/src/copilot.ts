import {
  CopilotStudioClient,
  ConnectionSettings,
} from '@microsoft/agents-copilotstudio-client';
import { config } from './config.js';

// Build ConnectionSettings explicitly from config.ts values.
// We do NOT use loadCopilotStudioConnectionSettingsFromEnv() because its env var
// names are undocumented — explicit construction is clearer and testable.
export const copilotSettings = new ConnectionSettings({
  environmentId: config.COPILOT_ENVIRONMENT_ID,
  schemaName: config.COPILOT_AGENT_SCHEMA_NAME,
});

// TODO: Replace stub token with real MSAL OBO token flow.
// Real implementation:
//   1. Import ConfidentialClientApplication from @azure/msal-node
//   2. Configure with config.COPILOT_TENANT_ID, config.COPILOT_APP_ID, config.COPILOT_CLIENT_SECRET
//   3. Call acquireTokenOnBehalfOf() with inbound user's Bearer token
//   4. Scope: CopilotStudioClient.scopeFromSettings(copilotSettings)
//   5. Pass the acquired token to new CopilotStudioClient(copilotSettings, acquiredToken)
//   6. For per-request auth (OBO), the client may need to be created per-request (see v2 AUTH-02)
//
// WARNING: With AUTH_REQUIRED=true (default), requests reach this code only with an
// Authorization header — but that header is NOT validated in Phase 1. Real validation is v2.
const STUB_TOKEN = config.COPILOT_STUB_TOKEN;

/**
 * Module-level CopilotStudioClient singleton.
 * Server-side only — NEVER import this in client/ code.
 * Production token acquisition replaces STUB_TOKEN above.
 */
export const copilotClient = new CopilotStudioClient(copilotSettings, STUB_TOKEN);
