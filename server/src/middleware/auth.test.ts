import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Mock jose before importing auth.ts ──────────────────────────────────────
// In jose v6, error classes live under the `errors` namespace (not direct exports)
vi.mock('jose', () => {
  class JWTExpired extends Error {
    code = 'ERR_JWT_EXPIRED';
    claim = 'exp';
    reason = 'check_failed';
    payload: unknown;
    // Match jose's actual signature: (message, payload, claim?, reason?)
    constructor(message: string, payload: unknown = {}, _claim?: string, _reason?: string) {
      super(message);
      this.name = 'JWTExpired';
      this.payload = payload;
    }
  }
  class JWTClaimValidationFailed extends Error {
    code = 'ERR_JWT_CLAIM_VALIDATION_FAILED';
    claim: string;
    reason = 'check_failed';
    payload: unknown;
    constructor(message: string, payload: unknown = {}, claim = 'generic', _reason?: string) {
      super(message);
      this.name = 'JWTClaimValidationFailed';
      this.claim = claim;
      this.payload = payload;
    }
  }
  return {
    createRemoteJWKSet: vi.fn(() => 'mocked-jwks'),
    jwtVerify: vi.fn(),
    errors: { JWTExpired, JWTClaimValidationFailed },
  };
});

// ── Mock config ──────────────────────────────────────────────────────────────
vi.mock('../config.js', () => ({
  config: {
    AUTH_REQUIRED: true,
    AZURE_CLIENT_ID: 'test-client-id',
    AZURE_TENANT_NAME: 'test-tenant',
    ALLOWED_TENANT_IDS: [],
  },
}));

// Import after mocks are set up
import { jwtVerify, errors } from 'jose';
import { authMiddleware } from './auth.js';

const { JWTExpired, JWTClaimValidationFailed } = errors;

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    getHeader: vi.fn(),
  };
  return res as unknown as Response;
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('authMiddleware (AUTH_REQUIRED=true)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 with error token_missing when no Authorization header is present', async () => {
    const req = makeReq({});
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'token_missing' }),
    );
    // WWW-Authenticate header must be set
    expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with error token_invalid when Authorization header is not Bearer format', async () => {
    const req = makeReq({ authorization: 'NotBearer sometoken' });
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'token_invalid' }),
    );
    expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with error token_expired when token is expired', async () => {
    vi.mocked(jwtVerify).mockRejectedValueOnce(
      new JWTExpired('token expired', {}, 'exp', 'check_failed'),
    );

    const req = makeReq({ authorization: 'Bearer expired.token.here' });
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'token_expired' }),
    );
    expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with error audience_mismatch when aud claim is wrong', async () => {
    vi.mocked(jwtVerify).mockRejectedValueOnce(
      new JWTClaimValidationFailed('audience mismatch', {}, 'aud'),
    );

    const req = makeReq({ authorization: 'Bearer valid.format.token' });
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'audience_mismatch' }),
    );
    expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with error issuer_mismatch when iss claim is wrong', async () => {
    vi.mocked(jwtVerify).mockRejectedValueOnce(
      new JWTClaimValidationFailed('issuer mismatch', {}, 'iss'),
    );

    const req = makeReq({ authorization: 'Bearer valid.format.token' });
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'issuer_mismatch' }),
    );
    expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets req.user when token is valid', async () => {
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: {
        sub: 'user-sub-123',
        tid: 'tenant-id-456',
        oid: 'object-id-789',
        email: 'user@example.com',
        name: 'Test User',
      },
      protectedHeader: { alg: 'RS256' },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

    const req = makeReq({ authorization: 'Bearer valid.jwt.token' });
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as Request & { user?: unknown }).user).toEqual({
      sub: 'user-sub-123',
      tid: 'tenant-id-456',
      oid: 'object-id-789',
      email: 'user@example.com',
      name: 'Test User',
    });
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('authMiddleware (AUTH_REQUIRED=false)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injects stub user and calls next() without calling jwtVerify', async () => {
    // Re-import with AUTH_REQUIRED=false by overriding the mock
    vi.doMock('../config.js', () => ({
      config: {
        AUTH_REQUIRED: false,
        AZURE_CLIENT_ID: 'test-client-id',
        AZURE_TENANT_NAME: 'test-tenant',
        ALLOWED_TENANT_IDS: [],
      },
    }));

    vi.resetModules();
    vi.doMock('jose', () => {
      class JWTExpiredLocal extends Error {
        code = 'ERR_JWT_EXPIRED';
        claim = 'exp';
        reason = 'check_failed';
        payload: unknown;
        constructor(message: string, payload: unknown = {}, _claim?: string, _reason?: string) {
          super(message);
          this.name = 'JWTExpired';
          this.payload = payload;
        }
      }
      class JWTClaimValidationFailedLocal extends Error {
        code = 'ERR_JWT_CLAIM_VALIDATION_FAILED';
        claim: string;
        reason = 'check_failed';
        payload: unknown;
        constructor(message: string, payload: unknown = {}, claim = 'generic', _reason?: string) {
          super(message);
          this.name = 'JWTClaimValidationFailed';
          this.claim = claim;
          this.payload = payload;
        }
      }
      return {
        createRemoteJWKSet: vi.fn(() => 'mocked-jwks'),
        jwtVerify: vi.fn(),
        errors: { JWTExpired: JWTExpiredLocal, JWTClaimValidationFailed: JWTClaimValidationFailedLocal },
      };
    });

    const { authMiddleware: authMiddlewareLocal } = await import('./auth.js');
    const { jwtVerify: jwtVerifyLocal } = await import('jose');

    const req = makeReq({});
    const res = makeRes();
    const next = makeNext();

    await authMiddlewareLocal(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as Request & { user?: unknown }).user).toEqual(
      expect.objectContaining({ sub: 'local-dev-user' }),
    );
    expect(jwtVerifyLocal).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
