import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.AUTH_REQUIRED) {
    next();
    return;
  }

  if (!req.headers.authorization) {
    // TODO: Replace with real MSAL OBO token validation.
    // Real flow:
    //   1. Extract Bearer token from req.headers.authorization
    //   2. Call ConfidentialClientApplication.acquireTokenOnBehalfOf() from @azure/msal-node
    //   3. Use config.COPILOT_TENANT_ID, config.COPILOT_APP_ID, config.COPILOT_CLIENT_SECRET
    //   4. Validate JWT audience matches CopilotStudioClient.scopeFromSettings(settings)
    // Until then, all requests without Authorization header are rejected.
    console.warn('[auth] Rejected request — no Authorization header. Set AUTH_REQUIRED=false to bypass in dev.');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // TODO: Validate the token — currently passes through any non-empty Authorization header
  next();
}
