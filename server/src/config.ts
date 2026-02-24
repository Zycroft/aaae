import 'dotenv/config'; // Must be first — loads .env before any validation

// --- LLM Provider selection ---
const LLM_PROVIDER = process.env.LLM_PROVIDER ?? 'copilot';

if (LLM_PROVIDER !== 'copilot' && LLM_PROVIDER !== 'openai') {
  console.error(
    `[config] FATAL: LLM_PROVIDER="${LLM_PROVIDER}" is not valid. Must be "copilot" or "openai".`
  );
  process.exit(1);
}

if (LLM_PROVIDER === 'copilot') {
  const COPILOT_REQUIRED = ['COPILOT_ENVIRONMENT_ID', 'COPILOT_AGENT_SCHEMA_NAME'] as const;
  for (const key of COPILOT_REQUIRED) {
    if (!process.env[key]) {
      console.error(`[config] FATAL: Missing required env var: ${key}`);
      console.error(`[config] Copy server/.env.example to server/.env and fill in values.`);
      process.exit(1);
    }
  }
}

if (LLM_PROVIDER === 'openai') {
  if (!process.env.OPENAI_API_KEY) {
    console.error('[config] FATAL: LLM_PROVIDER=openai but OPENAI_API_KEY is not set.');
    console.error('[config] Set OPENAI_API_KEY in server/.env.');
    process.exit(1);
  }
}

// Azure AD config — required when AUTH_REQUIRED=true (fail-closed: never silently skip validation)
if (process.env.AUTH_REQUIRED !== 'false') {
  if (!process.env.AZURE_CLIENT_ID) {
    console.error('[config] FATAL: AUTH_REQUIRED=true but AZURE_CLIENT_ID is not set.');
    console.error('[config] Set AZURE_CLIENT_ID in server/.env or set AUTH_REQUIRED=false for local dev without Azure AD.');
    process.exit(1);
  }
}

export const config = {
  // LLM Provider (Phase 23+)
  LLM_PROVIDER: LLM_PROVIDER as 'copilot' | 'openai',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  // Copilot Studio — required only when LLM_PROVIDER=copilot
  COPILOT_ENVIRONMENT_ID: process.env.COPILOT_ENVIRONMENT_ID ?? '',
  COPILOT_AGENT_SCHEMA_NAME: process.env.COPILOT_AGENT_SCHEMA_NAME ?? '',
  COPILOT_TENANT_ID: process.env.COPILOT_TENANT_ID,
  COPILOT_APP_ID: process.env.COPILOT_APP_ID,
  COPILOT_CLIENT_SECRET: process.env.COPILOT_CLIENT_SECRET,
  COPILOT_STUB_TOKEN: process.env.COPILOT_STUB_TOKEN ?? '',
  // Fail-closed: AUTH_REQUIRED is TRUE unless explicitly set to the string "false"
  AUTH_REQUIRED: process.env.AUTH_REQUIRED !== 'false',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  PORT: Number(process.env.PORT ?? 3001),
  AZURE_TENANT_NAME: process.env.AZURE_TENANT_NAME,
  AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
  ALLOWED_TENANT_IDS: process.env.ALLOWED_TENANT_IDS
    ? process.env.ALLOWED_TENANT_IDS.split(',').map((id) => id.trim()).filter(Boolean)
    : [],
  // Redis (Phase 12) — optional; when absent, InMemoryStore is used
  REDIS_URL: process.env.REDIS_URL,
  REDIS_TTL: Number(process.env.REDIS_TTL ?? 86400),       // Default: 24 hours in seconds
  REDIS_TIMEOUT: Number(process.env.REDIS_TIMEOUT ?? 5000), // Default: 5 seconds in milliseconds
} as const;
