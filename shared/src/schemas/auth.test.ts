import { describe, it, expect } from 'vitest';
import { UserClaimsSchema } from './auth.js';

describe('UserClaimsSchema', () => {
  describe('valid inputs', () => {
    it('accepts minimal valid claims (sub, tid, oid)', () => {
      const result = UserClaimsSchema.safeParse({ sub: 'u1', tid: 't1', oid: 'o1' });
      expect(result.success).toBe(true);
    });

    it('accepts full valid claims with optional email and name', () => {
      const result = UserClaimsSchema.safeParse({
        sub: 'u1',
        tid: 't1',
        oid: 'o1',
        email: 'a@b.com',
        name: 'Alice',
      });
      expect(result.success).toBe(true);
    });

    it('accepts claims with email but no name', () => {
      const result = UserClaimsSchema.safeParse({
        sub: 'u1',
        tid: 't1',
        oid: 'o1',
        email: 'user@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('accepts claims with name but no email', () => {
      const result = UserClaimsSchema.safeParse({
        sub: 'u1',
        tid: 't1',
        oid: 'o1',
        name: 'Bob',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('rejects claims missing oid', () => {
      const result = UserClaimsSchema.safeParse({ sub: 'u1', tid: 't1' });
      expect(result.success).toBe(false);
    });

    it('rejects claims missing sub', () => {
      const result = UserClaimsSchema.safeParse({ tid: 't1', oid: 'o1' });
      expect(result.success).toBe(false);
    });

    it('rejects claims missing tid', () => {
      const result = UserClaimsSchema.safeParse({ sub: 'u1', oid: 'o1' });
      expect(result.success).toBe(false);
    });

    it('rejects empty object', () => {
      const result = UserClaimsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects null', () => {
      const result = UserClaimsSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('rejects non-string sub', () => {
      const result = UserClaimsSchema.safeParse({ sub: 123, tid: 't1', oid: 'o1' });
      expect(result.success).toBe(false);
    });
  });
});
