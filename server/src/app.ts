import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { getRedisClient } from './store/index.js';
import { getProviderInfo } from './provider/providerFactory.js';
import { authMiddleware } from './middleware/auth.js';
import { orgAllowlist } from './middleware/orgAllowlist.js';
import { chatRouter } from './routes/chat.js';
import { orchestrateRouter } from './routes/orchestrate.js';

export function createApp() {
  const app = express();

  // CORS — client origin only, never wildcard (SERV-10)
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  app.use(express.json());

  // Health check — unauthenticated so dev tools can probe without a token (RESIL-02)
  app.get('/health', (_req, res) => {
    const redisClient = getRedisClient();

    let redisStatus: 'connected' | 'disconnected' | 'not_configured';
    if (!redisClient) {
      redisStatus = 'not_configured';
    } else {
      // ioredis status values: 'wait', 'reconnecting', 'connecting', 'connect', 'ready', 'close', 'end'
      // Only 'ready' means connected and accepting commands
      redisStatus = redisClient.status === 'ready' ? 'connected' : 'disconnected';
    }

    const providerInfo = getProviderInfo();

    res.json({
      status: 'ok',
      provider: providerInfo.provider,
      model: providerInfo.model,
      authRequired: config.AUTH_REQUIRED,
      redis: redisStatus,
    });
  });

  // All /api routes require auth (SERV-09)
  app.use('/api', authMiddleware);

  // Org allowlist — tenant membership check after JWT validation (ORG-01..ORG-04)
  // Must run AFTER authMiddleware so req.user is populated
  app.use('/api', orgAllowlist);

  // Chat routes (SERV-02, SERV-03, SERV-04)
  app.use('/api/chat', chatRouter);

  // Orchestrate route — batteries-included endpoint for workflow orchestrator (ORCH-03)
  app.use('/api/chat/orchestrate', orchestrateRouter);

  // Static client serving (Docker production) — opt-in via STATIC_DIR env var
  if (process.env.STATIC_DIR) {
    const staticDir = path.resolve(process.env.STATIC_DIR);
    app.use(express.static(staticDir));
    // SPA fallback — all non-API, non-file routes serve index.html
    app.get('*', (_req, res) => {
      res.sendFile('index.html', { root: staticDir });
    });
  }

  return app;
}
