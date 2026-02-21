import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

/**
 * orgAllowlist — Express middleware (synchronous)
 *
 * Precondition: authMiddleware has already run and populated req.user.
 * If req.user is absent, this middleware returns 403 defensively.
 *
 * Checks the `tid` claim from the validated JWT against config.ALLOWED_TENANT_IDS.
 * - Empty ALLOWED_TENANT_IDS → fail-closed (403 for every tenant)
 * - tid not in list → 403 with error code 'tenant_not_allowed'
 * - tid in list → next()
 *
 * ORG-01, ORG-02, ORG-03, ORG-04
 */
export function orgAllowlist(req: Request, res: Response, next: NextFunction): void {
  // Defensive check: req.user should always be set by authMiddleware, but guard anyway
  if (!req.user) {
    res.status(403).json({
      error: 'tenant_not_allowed',
      message: 'No user claims available',
    });
    return;
  }

  const { tid } = req.user;

  // Fail-closed: empty allowlist blocks all tenants
  if (config.ALLOWED_TENANT_IDS.length === 0) {
    console.warn('[auth] Rejected: tenant_not_allowed (tid: none — allowlist empty)');
    res.status(403).json({
      error: 'tenant_not_allowed',
      message: 'No tenants are authorized',
    });
    return;
  }

  // Check if tenant is in the allowlist
  if (!config.ALLOWED_TENANT_IDS.includes(tid)) {
    console.warn(`[auth] Rejected: tenant_not_allowed (tid: ${tid})`);
    res.status(403).json({
      error: 'tenant_not_allowed',
      message: 'Your organization is not authorized',
    });
    return;
  }

  // Tenant is allowed — pass through (success is not logged)
  next();
}
