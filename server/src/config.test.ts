import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Config validation tests (TEST-05).
 *
 * config.ts runs validation at module scope — it calls process.exit(1) for
 * bad configurations. We test this by:
 * 1. Resetting modules between tests (vi.resetModules)
 * 2. Mocking process.exit to throw instead of exiting
 * 3. Mocking dotenv/config to prevent .env file interference
 * 4. Controlling process.env directly
 * 5. Dynamically importing config.ts in each test
 */

// Save original env vars to restore after each test
const originalEnv = { ...process.env };

describe('config validation (TEST-05)', () => {
  beforeEach(() => {
    vi.resetModules();

    // Mock dotenv/config to prevent .env file from interfering
    vi.mock('dotenv/config', () => ({}));

    // Mock process.exit to throw instead of actually exiting
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    // Suppress console.error output during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Clear all relevant env vars
    delete process.env.LLM_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.COPILOT_ENVIRONMENT_ID;
    delete process.env.COPILOT_AGENT_SCHEMA_NAME;
    delete process.env.COPILOT_TENANT_ID;
    delete process.env.COPILOT_APP_ID;
    delete process.env.COPILOT_CLIENT_SECRET;
    delete process.env.COPILOT_STUB_TOKEN;
    delete process.env.AUTH_REQUIRED;
    delete process.env.AZURE_CLIENT_ID;
    delete process.env.AZURE_TENANT_NAME;
    delete process.env.ALLOWED_TENANT_IDS;
    delete process.env.CORS_ORIGIN;
    delete process.env.PORT;
    delete process.env.REDIS_URL;
    delete process.env.REDIS_TTL;
    delete process.env.REDIS_TIMEOUT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore original env vars
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  // ── Invalid LLM_PROVIDER value ──

  it('exits with fatal error when LLM_PROVIDER is an invalid value', async () => {
    process.env.LLM_PROVIDER = 'invalid_provider';
    process.env.AUTH_REQUIRED = 'false';

    await expect(import('./config.js')).rejects.toThrow('process.exit(1)');

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('FATAL')
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('not valid')
    );
  });

  // ── Missing OPENAI_API_KEY for openai provider ──

  it('exits with fatal error when LLM_PROVIDER=openai but OPENAI_API_KEY is missing', async () => {
    process.env.LLM_PROVIDER = 'openai';
    // No OPENAI_API_KEY
    process.env.AUTH_REQUIRED = 'false';

    await expect(import('./config.js')).rejects.toThrow('process.exit(1)');

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('OPENAI_API_KEY')
    );
  });

  // ── Missing COPILOT_ENVIRONMENT_ID for copilot provider ──

  it('exits with fatal error when LLM_PROVIDER=copilot but COPILOT_ENVIRONMENT_ID is missing', async () => {
    process.env.LLM_PROVIDER = 'copilot';
    // No COPILOT_ENVIRONMENT_ID
    process.env.AUTH_REQUIRED = 'false';

    await expect(import('./config.js')).rejects.toThrow('process.exit(1)');

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('COPILOT_ENVIRONMENT_ID')
    );
  });

  // ── Missing COPILOT_AGENT_SCHEMA_NAME for copilot provider ──

  it('exits with fatal error when LLM_PROVIDER=copilot but COPILOT_AGENT_SCHEMA_NAME is missing', async () => {
    process.env.LLM_PROVIDER = 'copilot';
    process.env.COPILOT_ENVIRONMENT_ID = 'test-env';
    // No COPILOT_AGENT_SCHEMA_NAME
    process.env.AUTH_REQUIRED = 'false';

    await expect(import('./config.js')).rejects.toThrow('process.exit(1)');

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('COPILOT_AGENT_SCHEMA_NAME')
    );
  });

  // ── Missing AZURE_CLIENT_ID when AUTH_REQUIRED is true ──

  it('exits with fatal error when AUTH_REQUIRED is true but AZURE_CLIENT_ID is missing', async () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    // AUTH_REQUIRED defaults to true (not set or not 'false')
    // No AZURE_CLIENT_ID

    await expect(import('./config.js')).rejects.toThrow('process.exit(1)');

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('AZURE_CLIENT_ID')
    );
  });

  // ── Valid openai config does not exit ──

  it('succeeds with valid openai config (LLM_PROVIDER=openai + OPENAI_API_KEY + AUTH_REQUIRED=false)', async () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.AUTH_REQUIRED = 'false';

    const module = await import('./config.js');

    expect(module.config.LLM_PROVIDER).toBe('openai');
    expect(module.config.OPENAI_API_KEY).toBe('test-key');
    expect(module.config.OPENAI_MODEL).toBe('gpt-4o-mini'); // default
    expect(process.exit).not.toHaveBeenCalled();
  });

  // ── Valid copilot config does not exit ──

  it('succeeds with valid copilot config (all required Copilot vars + AUTH_REQUIRED=false)', async () => {
    process.env.LLM_PROVIDER = 'copilot';
    process.env.COPILOT_ENVIRONMENT_ID = 'test-env';
    process.env.COPILOT_AGENT_SCHEMA_NAME = 'test-schema';
    process.env.AUTH_REQUIRED = 'false';

    const module = await import('./config.js');

    expect(module.config.LLM_PROVIDER).toBe('copilot');
    expect(module.config.COPILOT_ENVIRONMENT_ID).toBe('test-env');
    expect(module.config.COPILOT_AGENT_SCHEMA_NAME).toBe('test-schema');
    expect(process.exit).not.toHaveBeenCalled();
  });

  // ── Default LLM_PROVIDER is copilot ──

  it('defaults LLM_PROVIDER to copilot when not set', async () => {
    // No LLM_PROVIDER set
    process.env.COPILOT_ENVIRONMENT_ID = 'test-env';
    process.env.COPILOT_AGENT_SCHEMA_NAME = 'test-schema';
    process.env.AUTH_REQUIRED = 'false';

    const module = await import('./config.js');

    expect(module.config.LLM_PROVIDER).toBe('copilot');
    expect(process.exit).not.toHaveBeenCalled();
  });
});
