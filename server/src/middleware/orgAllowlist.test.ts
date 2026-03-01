import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Mock config before importing orgAllowlist ────────────────────────────────
// We use vi.mock with a factory so individual tests can override ALLOWED_TENANT_IDS
// via vi.mocked() or module-level mock setup.
vi.mock('../config.js', () => ({
  config: {
    ALLOWED_TENANT_IDS: ['tenant-a', 'tenant-b'],
    AUTH_REQUIRED: true,
  },
}));

// Import after mocks are set up
import { orgAllowlist } from './orgAllowlist.js';
import { config } from '../config.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeReq(tid?: string): Request {
  const user = tid !== undefined
    ? { sub: 'user-sub', tid, oid: 'user-oid' }
    : undefined;
  return { user } as unknown as Request;
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('orgAllowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset config to default for each test
    vi.mocked(config).ALLOWED_TENANT_IDS = ['tenant-a', 'tenant-b'] as unknown as readonly string[] & string[];
    vi.mocked(config).AUTH_REQUIRED = true as unknown as boolean;
  });

  it('calls next() when tid is in ALLOWED_TENANT_IDS', () => {
    const req = makeReq('tenant-a');
    const res = makeRes();
    const next = makeNext();

    orgAllowlist(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 tenant_not_allowed when tid is NOT in ALLOWED_TENANT_IDS', () => {
    const req = makeReq('evil-tenant');
    const res = makeRes();
    const next = makeNext();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    orgAllowlist(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'tenant_not_allowed' }),
    );
    expect(next).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('tenant_not_allowed'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('evil-tenant'),
    );
    warnSpy.mockRestore();
  });

  it('returns 403 tenant_not_allowed when ALLOWED_TENANT_IDS is empty (fail-closed)', () => {
    // Override ALLOWED_TENANT_IDS to empty for this test
    vi.mocked(config).ALLOWED_TENANT_IDS = [] as unknown as readonly string[] & string[];

    const req = makeReq('tenant-a');
    const res = makeRes();
    const next = makeNext();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    orgAllowlist(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'tenant_not_allowed' }),
    );
    expect(next).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns 403 tenant_not_allowed when req.user is undefined (defensive check)', () => {
    const req = makeReq(undefined); // user is undefined
    const res = makeRes();
    const next = makeNext();

    orgAllowlist(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'tenant_not_allowed' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when tid matches one of multiple entries in ALLOWED_TENANT_IDS', () => {
    // tenant-b is the second entry in the default mock
    const req = makeReq('tenant-b');
    const res = makeRes();
    const next = makeNext();

    orgAllowlist(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() without checking tenant when AUTH_REQUIRED=false', () => {
    vi.mocked(config).AUTH_REQUIRED = false as unknown as boolean;
    vi.mocked(config).ALLOWED_TENANT_IDS = [] as unknown as readonly string[] & string[];

    const req = makeReq(undefined); // no user at all
    const res = makeRes();
    const next = makeNext();

    orgAllowlist(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
