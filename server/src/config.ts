import 'dotenv/config'; // Must be first — loads .env before any validation

// Required env vars — server will NOT start without these
const REQUIRED = ['COPILOT_ENVIRONMENT_ID', 'COPILOT_AGENT_SCHEMA_NAME'] as const;

for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`[config] FATAL: Missing required environment variable: ${key}`);
    console.error(`[config] Copy server/.env.example to server/.env and fill in values.`);
    process.exit(1);
  }
}

export const config = {
  COPILOT_ENVIRONMENT_ID: process.env.COPILOT_ENVIRONMENT_ID!,
  COPILOT_AGENT_SCHEMA_NAME: process.env.COPILOT_AGENT_SCHEMA_NAME!,
  COPILOT_TENANT_ID: process.env.COPILOT_TENANT_ID,
  COPILOT_APP_ID: process.env.COPILOT_APP_ID,
  COPILOT_CLIENT_SECRET: process.env.COPILOT_CLIENT_SECRET,
  COPILOT_STUB_TOKEN: process.env.COPILOT_STUB_TOKEN ?? '',
  // Fail-closed: AUTH_REQUIRED is TRUE unless explicitly set to the string "false"
  AUTH_REQUIRED: process.env.AUTH_REQUIRED !== 'false',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  PORT: Number(process.env.PORT ?? 3001),
} as const;
