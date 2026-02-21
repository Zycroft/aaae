import express from 'express';
import cors from 'cors';
import { config } from './config.js';
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

  // Health check — unauthenticated so dev tools can probe without a token
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', authRequired: config.AUTH_REQUIRED });
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

  return app;
}
