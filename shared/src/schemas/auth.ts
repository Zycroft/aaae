import { z } from 'zod';

/**
 * UserClaimsSchema — the shared shape for decoded JWT claims.
 * Used by server middleware to validate and type `req.user` (Phase 6),
 * and referenced by client display logic (Phase 7).
 *
 * SCHEMA-01: sub, tid, oid are required Azure AD / Entra External ID fields.
 * SCHEMA-02: email and name are optional claims, not always present in tokens.
 */
export const UserClaimsSchema = z.object({
  /** Subject identifier — unique user ID in the identity provider */
  sub: z.string(),
  /** Tenant ID — used by org allowlist to restrict access (Phase 6) */
  tid: z.string(),
  /** Object ID — stable Azure AD / Entra External ID user identifier */
  oid: z.string(),
  /** User email address — optional, not always present in CIAM tokens */
  email: z.string().optional(),
  /** Display name — optional, not always present in CIAM tokens */
  name: z.string().optional(),
});

/** TypeScript type inferred from UserClaimsSchema (SCHEMA-01, SCHEMA-02) */
export type UserClaims = z.infer<typeof UserClaimsSchema>;
