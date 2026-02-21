import type { UserClaims } from '@copilot-chat/shared';

/**
 * Express Request type augmentation — adds `req.user` typed as UserClaims.
 * Populated by authMiddleware after successful JWT validation (Phase 6).
 * Uses declaration merging on express-serve-static-core to extend Request.
 */
declare module 'express-serve-static-core' {
  interface Request {
    user?: UserClaims;
  }
}
