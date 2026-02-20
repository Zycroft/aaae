import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { authMiddleware } from './middleware/auth.js';

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

  return app;
}
