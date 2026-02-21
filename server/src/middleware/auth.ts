import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, errors } from 'jose';
import { UserClaimsSchema } from '@copilot-chat/shared';
import { config } from '../config.js';

const { JWTExpired, JWTClaimValidationFailed } = errors;

// ── JWKS + JWT validation config (built once at module load) ─────────────────
// Audience: 'api://<AZURE_CLIENT_ID>' (startup guard in config.ts ensures this is set)
const audience = `api://${config.AZURE_CLIENT_ID}`;

// Issuer: CIAM authority URL for the configured tenant
const issuer = `https://${config.AZURE_TENANT_NAME}.ciamlogin.com/${config.AZURE_TENANT_NAME}.onmicrosoft.com/v2.0`;

// JWKS: remote key set — jose handles caching and key rotation automatically
const jwksUrl = `https://${config.AZURE_TENANT_NAME}.ciamlogin.com/${config.AZURE_TENANT_NAME}.onmicrosoft.com/discovery/v2.0/keys`;
const JWKS = config.AZURE_TENANT_NAME ? createRemoteJWKSet(new URL(jwksUrl)) : null;

// ── AUTH_REQUIRED=false stub user ────────────────────────────────────────────
const STUB_USER = {
  sub: 'local-dev-user',
  tid: 'local-dev-tenant',
  oid: 'local-dev-oid',
  name: 'Local Developer',
  email: 'dev@localhost',
} as const;

// Log the bypass warning once at module load when AUTH_REQUIRED=false
if (!config.AUTH_REQUIRED) {
  console.warn('[auth] WARNING: AUTH_REQUIRED=false — all requests bypass JWT validation with stub user');
}

// ── Helper: send 401 with WWW-Authenticate ───────────────────────────────────
function reject(res: Response, errorCode: string, message: string): void {
  res.setHeader('WWW-Authenticate', 'Bearer');
  res.status(401).json({ error: errorCode, message });
}

// ── authMiddleware ────────────────────────────────────────────────────────────
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // AUTH_REQUIRED=false: inject stub user and pass through
  if (!config.AUTH_REQUIRED) {
    req.user = STUB_USER;
    next();
    return;
  }

  // Extract Bearer token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.warn('[auth] Rejected: missing Authorization header');
    reject(res, 'token_missing', 'Authorization header required');
    return;
  }

  if (!authHeader.startsWith('Bearer ')) {
    console.warn('[auth] Rejected: Authorization header is not Bearer format');
    reject(res, 'token_invalid', 'Authorization header must be in "Bearer <token>" format');
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    if (!JWKS) {
      console.warn('[auth] Rejected: AZURE_TENANT_NAME not configured, cannot validate tokens');
      reject(res, 'token_invalid', 'Server JWT validation not configured');
      return;
    }

    const { payload } = await jwtVerify(token, JWKS, {
      audience,
      issuer,
      clockTolerance: 30, // 30 seconds tolerance for clock skew
    });

    // Parse and validate claims through UserClaimsSchema
    const claims = UserClaimsSchema.parse(payload);
    req.user = claims;
    next();
  } catch (err) {
    if (err instanceof JWTExpired) {
      console.warn('[auth] Rejected: token_expired');
      reject(res, 'token_expired', 'Token has expired');
      return;
    }

    if (err instanceof JWTClaimValidationFailed) {
      const claim = err.claim;
      if (claim === 'aud') {
        console.warn('[auth] Rejected: audience_mismatch');
        reject(res, 'audience_mismatch', 'Token audience does not match expected value');
      } else if (claim === 'iss') {
        console.warn('[auth] Rejected: issuer_mismatch');
        reject(res, 'issuer_mismatch', 'Token issuer does not match expected value');
      } else {
        console.warn(`[auth] Rejected: claim validation failed on '${claim}'`);
        reject(res, 'token_invalid', 'Token claim validation failed');
      }
      return;
    }

    // Generic error (malformed token, UserClaimsSchema parse failure, etc.)
    console.warn('[auth] Rejected: token_invalid (generic error)');
    reject(res, 'token_invalid', 'Token validation failed');
  }
}
