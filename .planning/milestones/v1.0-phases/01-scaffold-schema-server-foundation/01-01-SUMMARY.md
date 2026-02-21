---
phase: 01-scaffold-schema-server-foundation
plan: 01
subsystem: infra
tags: [npm-workspaces, typescript, vite, react, express, eslint, prettier, zod, monorepo]

requires: []

provides:
  - npm workspaces monorepo with client/, server/, shared/ symlinked in node_modules
  - TypeScript base config (tsconfig.base.json) extended by all three workspaces
  - ESLint 9 flat config covering all workspaces with Node/browser env separation
  - Prettier config with single quotes, 100-char width
  - concurrently root dev script starting Vite (5173) and Express (3001) in parallel
  - Jest in client (--passWithNoTests) and Vitest in server/shared (--passWithNoTests)
  - client/.env.example (VITE_API_URL) and server/.env.example (all COPILOT_* vars with inline comments)
  - Single physical Zod instance in node_modules/zod (3.25.76); overridden via package.json overrides
  - shared/dist/ with compiled index.js + index.d.ts (placeholder, schemas added in Plan 02)
  - globals npm package added for ESLint environment definitions

affects:
  - 01-02 (shared schemas — consumes shared/ workspace structure)
  - 01-03 (Express server — consumes server/ workspace structure)
  - 01-04 (chat routes — depends on server/ and shared/)
  - All future phases (all build on this monorepo scaffold)

tech-stack:
  added:
    - npm workspaces (npm 10 built-in)
    - TypeScript 5.7
    - Vite 6.x + @vitejs/plugin-react 4.x
    - React 18.3
    - Express 4.21
    - concurrently 9.1.2
    - ESLint 9.x flat config + @typescript-eslint 8.x
    - Prettier 3.x + eslint-config-prettier 10.x
    - globals (ESLint env definitions)
    - Zod 3.25.76 (in shared/ only; overridden via root package.json)
    - tsx 4.x (server dev runner)
    - Vitest 3.x (server + shared tests)
    - Jest 29.x (client tests)
    - @microsoft/agents-copilotstudio-client 1.3.1 (installed; initialized in Plan 04)
    - lru-cache 11.x (installed; used in Plan 03)
    - uuid 11.x (installed; used in Plan 04)
    - dotenv 16.x (installed; used in Plan 03)
    - cors 2.8.5 (installed; used in Plan 03)
  patterns:
    - Workspace packages referenced as "@copilot-chat/shared" (workspace symlink)
    - shared/ builds to dist/ (tsc --build); consumers import compiled JS
    - ESLint 9 flat config with per-glob env overrides (server=Node, client=Browser+Node)
    - Vitest uses --passWithNoTests flag (not --reporter=verbose by default)
    - Root overrides.zod pins single Zod version across workspace

key-files:
  created:
    - package.json (root — workspaces, overrides, scripts)
    - tsconfig.base.json (shared TypeScript base config)
    - eslint.config.mjs (ESLint 9 flat config)
    - .prettierrc (Prettier config)
    - .gitignore
    - shared/package.json (Zod sole dep; dist exports)
    - shared/tsconfig.json (composite: true for project references)
    - shared/src/index.ts (placeholder; replaced in Plan 02)
    - client/package.json
    - client/tsconfig.json (moduleResolution: Bundler for Vite)
    - client/vite.config.ts (React plugin, proxy to server)
    - client/src/App.tsx (placeholder)
    - client/src/main.tsx (React entry)
    - client/index.html (Vite HTML entry)
    - client/.env.example
    - server/package.json
    - server/tsconfig.json (NodeNext module resolution)
    - server/src/index.ts (placeholder; replaced in Plan 03)
    - server/.env.example (all COPILOT_* vars with inline comments)
  modified: []

key-decisions:
  - "Zod 3.25.76 pinned via root overrides — sdk @microsoft/agents-activity pins 3.25.75 exactly, causing npm ls zod ELSPROBLEMS, but single physical instance confirmed (one node_modules/zod directory)"
  - "Vitest --passWithNoTests flag added to server and shared test scripts — Vitest 3.x exits code 1 on no test files without this flag"
  - "ESLint globals package added to provide browser/node environment definitions for ESLint 9 flat config"
  - "vite.config.ts includes /api proxy to server — allows client to call /api/* during dev without CORS issues on same port"

requirements-completed:
  - INFRA-01
  - INFRA-02
  - INFRA-03
  - INFRA-04
  - INFRA-05
  - INFRA-06

duration: 15min
completed: 2026-02-20
---

# Phase 1 Plan 01: Scaffold Summary

**npm workspaces monorepo with client (Vite 6/React 18), server (Express/tsx), shared (Zod schemas), ESLint 9 flat config, Prettier, and passing test runners across all three packages**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-20T03:59:55Z
- **Completed:** 2026-02-20T04:14:00Z
- **Tasks:** 2
- **Files modified:** 21

## Accomplishments

- npm workspaces monorepo linking client/, server/, shared/ with correct symlinks
- Single Zod instance (3.25.76) confirmed in node_modules/zod with root overrides
- ESLint 9 flat config with Node/browser environment separation, all linting passes
- `npm test` exits 0 across both workspaces (Jest --passWithNoTests + Vitest --passWithNoTests)
- .env.example files for both client and server with inline-documented variables

## Task Commits

1. **Tasks 1+2: Root scaffold + workspace packages** - `f212604` (feat)

## Files Created/Modified

- `package.json` — Root monorepo config, workspaces, overrides.zod, scripts
- `tsconfig.base.json` — Shared TypeScript base (NodeNext, strict, sourceMap)
- `eslint.config.mjs` — ESLint 9 flat config with env-separated rules
- `.prettierrc` — Single quotes, 100-char width
- `.gitignore` — Excludes node_modules, dist, .env
- `shared/package.json` — @copilot-chat/shared with Zod sole dep, dist exports
- `shared/tsconfig.json` — composite:true for project references
- `shared/src/index.ts` — Placeholder (Plan 02 adds schemas)
- `client/package.json` — @copilot-chat/client, Vite 6, React 18, Jest
- `client/tsconfig.json` — moduleResolution:Bundler, jsx:react-jsx
- `client/vite.config.ts` — React plugin, /api proxy
- `client/src/App.tsx`, `main.tsx`, `index.html` — Minimal placeholders
- `client/.env.example` — VITE_API_URL with comment
- `server/package.json` — @copilot-chat/server, Express, tsx, Vitest
- `server/tsconfig.json` — NodeNext module resolution
- `server/src/index.ts` — Placeholder (Plan 03 replaces)
- `server/.env.example` — All COPILOT_* vars, AUTH_REQUIRED, PORT, CORS_ORIGIN

## Decisions Made

- **Zod version pin:** SDK `@microsoft/agents-activity` pins `"zod": "3.25.75"` exactly. npm resolves `3.25.76`. `npm ls zod` shows `ELSPROBLEMS` (invalid version for agents-activity) but there is physically ONE zod directory in node_modules. Runtime behavior is unaffected. Documented for Phase 2 team awareness.
- **Vitest --passWithNoTests:** Vitest 3.x exits code 1 on empty test suite by default. Added `--passWithNoTests` flag to server and shared test scripts.
- **ESLint globals package:** Required for ESLint 9 to define `globals.browser` and `globals.node` environments in flat config format.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLint `no-undef` errors for `document`, `process`, `console`**
- **Found during:** Task 1 verification (npm run lint)
- **Issue:** ESLint flat config didn't configure env globals — `document` (browser), `process`, `console` (node) reported as undefined
- **Fix:** Added `globals` npm package; split ESLint config into server (Node globals) and client (Browser + Node globals) file matchers
- **Files modified:** eslint.config.mjs, package.json (added globals dep)
- **Verification:** `npm run lint` exits 0 with no errors
- **Committed in:** f212604

**2. [Rule 3 - Blocking] Vitest exits code 1 on empty test suite**
- **Found during:** Task 2 verification (npm test)
- **Issue:** Vitest 3.x exits code 1 when no test files found (unlike Jest's --passWithNoTests default)
- **Fix:** Added `--passWithNoTests` to server and shared vitest run scripts
- **Files modified:** server/package.json, shared/package.json
- **Verification:** `npm test` exits 0 across all workspaces
- **Committed in:** f212604

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both essential for correctness. No scope creep.

## Issues Encountered

- `npm ls zod` reports ELSPROBLEMS due to SDK internal version pin mismatch (3.25.75 expected vs 3.25.76 resolved). Physical single instance confirmed. Will be resolved when SDK updates their exact pin or npm deduplication logic changes.

## User Setup Required

None — no external service configuration required for scaffold plan.

## Next Phase Readiness

- Plan 02 (shared schemas) can begin: shared/ workspace is set up and building
- Plan 03 (Express server) can begin: server/ workspace is set up with all deps installed
- Both Plan 02 and 03 are Wave 2 (parallel) — both can start immediately
- Shared package builds to dist/ with TypeScript declarations

---
*Phase: 01-scaffold-schema-server-foundation*
*Completed: 2026-02-20*
