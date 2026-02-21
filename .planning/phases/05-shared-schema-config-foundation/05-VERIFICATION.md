---
phase: 05-shared-schema-config-foundation
verified: 2026-02-20T22:05:30Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 5: Shared Schema + Config Foundation Verification Report

**Phase Goal:** The shared UserClaims type and all auth environment variables exist and are wired — both workspaces can reference auth config without any code being deployed yet

**Verified:** 2026-02-20T22:05:30Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | shared/src/schemas/auth.ts exports UserClaims Zod schema with fields sub, tid, email (optional), name (optional), oid | ✓ VERIFIED | File exists with all 5 fields: sub (required), tid (required), oid (required), email (optional), name (optional). JSDoc references SCHEMA-01, SCHEMA-02. |
| 2 | TypeScript type UserClaims is exported from shared and usable in server and client without any Zod import | ✓ VERIFIED | shared/src/index.ts exports `type UserClaims` from './schemas/auth.js'. shared/dist/index.d.ts confirms TypeScript type is compiled and re-exported. Type can be imported as `import { UserClaims } from '@copilot-chat/shared'` in both workspaces. |
| 3 | shared barrel (index.ts) re-exports both UserClaimsSchema and the UserClaims type | ✓ VERIFIED | shared/src/index.ts lines 14-17 re-export `UserClaimsSchema` and `type UserClaims` from './schemas/auth.js'. Compiled dist also confirms exports present. |
| 4 | shared package builds cleanly after adding auth.ts (cd shared && npm run build exits 0) | ✓ VERIFIED | Full monorepo build completed with exit 0. Shared workspace tests pass (24 tests including 10 new auth schema tests). shared/dist/ contains index.js, index.d.ts, schemas/auth.js, and schemas/auth.d.ts. |
| 5 | server/.env.example contains AZURE_TENANT_NAME, AZURE_CLIENT_ID, and ALLOWED_TENANT_IDS entries with placeholder values | ✓ VERIFIED | All three present with documentation comments and placeholder values: `AZURE_TENANT_NAME=your-tenant-name-here`, `AZURE_CLIENT_ID=your-server-app-client-id-here`, `ALLOWED_TENANT_IDS=tenant-id-1,tenant-id-2` |
| 6 | client/.env.example contains VITE_AZURE_CLIENT_ID, VITE_AZURE_TENANT_NAME, and VITE_AZURE_REDIRECT_URI entries with placeholder values | ✓ VERIFIED | All three present with documentation comments and placeholder values: `VITE_AZURE_CLIENT_ID=your-client-app-client-id-here`, `VITE_AZURE_TENANT_NAME=your-tenant-name-here`, `VITE_AZURE_REDIRECT_URI=http://localhost:5173` |
| 7 | When AUTH_REQUIRED=true and AZURE_CLIENT_ID is not set, server/src/config.ts causes the server to refuse all requests (fails closed) | ✓ VERIFIED | Tested: `COPILOT_ENVIRONMENT_ID=x COPILOT_AGENT_SCHEMA_NAME=x AUTH_REQUIRED=true node dist/config.js` produces FATAL error "[config] FATAL: AUTH_REQUIRED=true but AZURE_CLIENT_ID is not set." and exits with code 1. |
| 8 | When AUTH_REQUIRED=false, server starts and serves requests without any Azure AD env vars present | ✓ VERIFIED | Tested: `COPILOT_ENVIRONMENT_ID=x COPILOT_AGENT_SCHEMA_NAME=x AUTH_REQUIRED=false node dist/config.js` succeeds with no errors, demonstrating the server can start without Azure AD configuration when AUTH_REQUIRED=false. |
| 9 | server/src/config.ts exports AZURE_TENANT_NAME, AZURE_CLIENT_ID, and ALLOWED_TENANT_IDS (parsed as string array) | ✓ VERIFIED | config.ts lines 34-38 export all three: AZURE_TENANT_NAME (string \| undefined), AZURE_CLIENT_ID (string \| undefined), ALLOWED_TENANT_IDS (parsed comma-separated string to string[] with trim and filter for empty). |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `shared/src/schemas/auth.ts` | UserClaims Zod schema and TypeScript type | ✓ VERIFIED | File exists with UserClaimsSchema z.object and exported type. 26 lines, clean implementation following message.ts pattern. |
| `shared/src/index.ts` | Barrel export including auth schema | ✓ VERIFIED | Lines 14-17 re-export UserClaimsSchema and type UserClaims from './schemas/auth.js'. Follows exact pattern as NormalizedMessageSchema export. |
| `shared/src/schemas/auth.test.ts` | 10 Vitest tests covering valid/invalid cases | ✓ VERIFIED | 74-line test file with 10 tests passing: valid minimal, valid full, valid partial optional claims, and invalid cases (missing required fields, null, non-string sub). |
| `server/.env.example` | Azure AD env var documentation | ✓ VERIFIED | 44 lines total. Lines 33-43 contain all required Azure AD variables with inline documentation comments. No existing entries removed. |
| `client/.env.example` | Azure AD env var documentation | ✓ VERIFIED | 16 lines total. Lines 5-15 contain all required VITE_* Azure AD variables with inline documentation comments. Existing VITE_API_URL preserved. |
| `server/src/config.ts` | Validated config with Azure AD fail-closed logic | ✓ VERIFIED | 40 lines. Lines 14-21 implement fail-closed guard. Lines 34-38 export Azure AD config fields. Logic matches existing REQUIRED array pattern. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| shared/src/index.ts | shared/src/schemas/auth.ts | named re-export `from './schemas/auth.js'` | ✓ WIRED | Line 17: `} from './schemas/auth.js';` exports both UserClaimsSchema and type UserClaims. |
| shared/src/schemas/auth.ts | zod | `import { z } from 'zod'` | ✓ WIRED | Line 1: `import { z } from 'zod';` and line 11 uses z.object(...) to define schema. |
| server/src/config.ts | process.env.AZURE_CLIENT_ID | conditional process.exit when AUTH_REQUIRED=true and missing | ✓ WIRED | Lines 15-21: Check pattern `process.env.AUTH_REQUIRED !== 'false'` guards line 16 check for AZURE_CLIENT_ID; missing triggers process.exit(1) at line 19. |
| server/src/config.ts | exported config object | AZURE_CLIENT_ID, AZURE_TENANT_NAME, ALLOWED_TENANT_IDS fields | ✓ WIRED | Lines 34-38 in config export: AZURE_TENANT_NAME, AZURE_CLIENT_ID, ALLOWED_TENANT_IDS all present and properly parsed. |
| server/src/middleware/auth.ts | server/src/config.ts | config.AUTH_REQUIRED guard | ✓ VERIFIED | auth.ts already checks config.AUTH_REQUIRED (confirmed via grep); config.ts exports AUTH_REQUIRED correctly on line 31. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SCHEMA-01 | 05-01-PLAN.md | `UserClaims` Zod schema exists with sub, tid, oid (required), email, name (optional) | ✓ SATISFIED | shared/src/schemas/auth.ts implements full schema; JSDoc on lines 3-9 references SCHEMA-01. |
| SCHEMA-02 | 05-01-PLAN.md | TypeScript type exported for server-side `req.user` | ✓ SATISFIED | shared/src/index.ts line 16 exports `type UserClaims` for use in both server and client without Zod dependency. |
| CFG-01 | 05-02-PLAN.md | Server env vars added: `AZURE_TENANT_NAME`, `AZURE_CLIENT_ID`, `ALLOWED_TENANT_IDS` | ✓ SATISFIED | server/.env.example lines 35, 39, 43 document all three with comments. server/src/config.ts lines 34-38 export all three. |
| CFG-02 | 05-02-PLAN.md | Client env vars added: `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_NAME`, `VITE_AZURE_REDIRECT_URI` | ✓ SATISFIED | client/.env.example lines 8, 11, 15 document all three with comments. Documented only (not yet wired into client code — Phase 7 will consume these). |
| CFG-03 | 05-02-PLAN.md | `.env.example` files updated for both workspaces | ✓ SATISFIED | Both server/.env.example and client/.env.example updated with Azure AD sections including inline documentation. No existing entries removed. |
| CFG-04 | 05-02-PLAN.md | Server fails closed (refuses all requests) if `AZURE_CLIENT_ID` is not set when `AUTH_REQUIRED=true` | ✓ SATISFIED | server/src/config.ts lines 14-21 implement fail-closed guard: if AUTH_REQUIRED !== 'false' and no AZURE_CLIENT_ID, console.error FATAL message and process.exit(1). Tested and confirmed. |
| CFG-05 | 05-02-PLAN.md | `AUTH_REQUIRED=false` still works for local dev without Azure AD setup | ✓ SATISFIED | server/src/config.ts line 31 exports AUTH_REQUIRED logic unchanged (already in codebase). Tested: AUTH_REQUIRED=false allows server startup without AZURE_CLIENT_ID present. |

**All 7 required IDs satisfied.**

### Anti-Patterns Found

No anti-patterns detected.

- Scanned auth.ts for TODO/FIXME/XXX/HACK/placeholder — none found.
- Scanned config.ts for TODO/FIXME/XXX/HACK/placeholder — none found.
- No empty stubs, console.log-only implementations, or orphaned code found.
- Fail-closed guard is implemented correctly (no silent passthroughs).

### Human Verification Required

None. All success criteria are automated, observable, and verified programmatically.

## Summary

Phase 5 goal achieved completely. The shared UserClaims schema is defined, exported, and compiled. All environment variables are documented with placeholder values in both workspaces. The server config implements fail-closed validation — refusing to start when AUTH_REQUIRED=true but AZURE_CLIENT_ID is missing. Both workspaces can now reference the auth configuration without deployment:

- **Server** can import `UserClaims` type and config variables for Phase 6 JWT middleware
- **Client** can import `UserClaims` type for Phase 7 display logic
- **Config** properly gates on AUTH_REQUIRED: enforces Azure AD when true, allows local dev bypass when false

All 7 requirements (SCHEMA-01, SCHEMA-02, CFG-01–CFG-05) are satisfied. All 9 must-have truths are verified. Build passes. All tests pass (24 shared tests including 10 new auth schema tests). No gaps.

---

_Verified: 2026-02-20T22:05:30Z_
_Verifier: Claude (gsd-verifier)_
