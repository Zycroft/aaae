import './config.js'; // MUST be first — exits process if required vars missing
import { createApp } from './app.js';
import { config } from './config.js';
import { initOrchestrator } from './orchestrator/index.js';

/**
 * Async server startup.
 *
 * Initializes the orchestrator (which creates the LLM provider via factory)
 * before starting the Express server. This ensures the provider is ready
 * before any route handlers execute.
 *
 * CONF-04
 */
async function main() {
  await initOrchestrator();

  const app = createApp();

  app.listen(config.PORT, () => {
    console.log(`[server] Running on http://localhost:${config.PORT}`);
    console.log(`[server] Auth required: ${config.AUTH_REQUIRED}`);
    console.log(`[server] CORS origin: ${config.CORS_ORIGIN}`);
    console.log(`[server] Provider: ${config.LLM_PROVIDER}`);
  });
}

main().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
