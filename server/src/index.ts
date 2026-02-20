import './config.js'; // MUST be first — exits process if required vars missing
import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`[server] Running on http://localhost:${config.PORT}`);
  console.log(`[server] Auth required: ${config.AUTH_REQUIRED}`);
  console.log(`[server] CORS origin: ${config.CORS_ORIGIN}`);
});
