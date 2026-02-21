# Phase 4: Polish, Metadata Drawer, CI, and Docs - Research

**Researched:** 2026-02-20
**Domain:** UI Polish (Timeline Sidebar + Activity Log Export), GitHub Actions CI, README & Documentation
**Confidence:** HIGH (stack verified, patterns established in v1.0, ecosystem sources current)

## Summary

Phase 4 builds on v1.0's solid foundation to add production-ready polish across three domains: (1) a desktop metadata sidebar displaying card action history in chronological order plus an activity log download button; (2) a GitHub Actions workflow that lints both workspaces, runs tests, and enforces credential-leak and Zod-instance checks; (3) documentation (README.md, Adaptive Card playbook, sample card JSON) enabling new developers and card authors to onboard without reading source code.

The tech stack is locked from v1.0 — Vite/React 18, Express/Node 20+, npm workspaces, Vitest, ESLint 9, Zod 3.25.76 — with established patterns for schema validation, API integration, and responsive layout. No new core dependencies are required; all Phase 4 work is integration and documentation.

**Primary recommendation:** Implement the metadata drawer as a controlled component receiving filtered card-action messages from parent state; persist activity log export via Blob/download API; use a simple GitHub Actions workflow (no third-party secret scanners) with grep for credential detection and `npm ls zod` for instance counting.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| **UI-11** | Timeline sidebar (desktop only) lists completed card actions in chronological order | Metadata pane already laid out in chat.css (`.metadataPane` display: none on mobile, display: block @media 768px+); implementation needs component to filter messages where kind = "adaptiveCard" and render timeline items |
| **UI-12** | Activity log download button exports the full conversation as a JSON file | JavaScript Blob/download API is standard; conversation history already stored in `StoredConversation.history` on server; client receives full message array; no new dependencies needed |
| **INFRA-07** | GitHub Actions workflow: lints both workspaces, runs tests; fails on credential-leak or Zod-instance checks | GitHub Actions ecosystem supports Node.js caching and parallel jobs; grep for credential patterns is zero-dependency; `npm ls zod` output is parseable; no third-party secret scanner needed |
| **DOCS-01** | README.md: monorepo setup, .env configuration, `npm run dev`, `npm test` | Established monorepo documentation patterns include quick-start, env var table, workspace descriptions, scripts reference |
| **DOCS-02** | Adaptive Cards playbook: card registration pattern (cardId, inputs, userSummary formatter) | Adaptive Cards official template service and template language docs provide reference patterns; playbook should map cardId → JSON file → server registration flow |
| **DOCS-03** | Sample Adaptive Card JSON asset in docs/cards/ used in tests | Adaptive Cards SDK provides examples; asset location mirrors docs/cards/ structure already implicit in playbook; JSON can be referenced in tests |

</phase_requirements>

## Standard Stack

### Core (Unchanged from v1.0)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.0 | UI framework, client-side rendering | Established in v1.0; UI-11 sidebar is React component |
| Vite | 6.0.0 | Client dev server, build tool | Established in v1.0; no changes needed |
| Express | 4.21.0 | Server framework | Established in v1.0; activity log export endpoint can attach to existing server |
| Node.js | 20+ | Runtime (server) | Established in v1.0; no version bump needed |
| Vitest | 3.0.0 | Server test runner | Established in v1.0; already running tests successfully |
| Zod | 3.25.76 | Schema validation, type source of truth | Established in v1.0, hoisted via `overrides` in root package.json; single instance verified |
| TypeScript | 5.7.0 | Compiler, type safety | Established in v1.0 across all workspaces |
| ESLint | 9.0.0 | Linting | Established in v1.0; GitHub Actions workflow will invoke `npm run lint` |
| Prettier | 3.0.0 | Code formatting | Established in v1.0; included in `npm run format` |

### Supporting (Phase 4 Additions)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | No new runtime dependencies needed | Metadata drawer is pure React; activity log export is Blob API; CI is shell script in GitHub Actions |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Browser Blob + download API | Server-side streaming endpoint | Adds HTTP endpoint when local export is simpler; Blob/download is zero-dependency, ships in all browsers |
| grep for credential detection | TruffleHog or Gitleaks | Third-party tools add CI dependency; grep is POSIX-standard, already available in GitHub Actions runners |
| `npm ls zod` for instance detection | ESLint plugin or build-time check | npm ls is zero-dependency, immediate, accurate; detects real node_modules state post-install |
| Custom CSS for metadata drawer | Tailwind CSS or Material-UI | v1.0 established CSS custom properties design tokens; adding Tailwind would bloat bundle unnecessarily |

**Installation:**
```bash
# No new packages to install for Phase 4.
# All dependencies already present from v1.0.
npm ci
```

## Architecture Patterns

### Recommended Project Structure

```
.
├── .github/workflows/
│   └── ci.yml                          # GitHub Actions: lint + test + checks
├── docs/
│   ├── adaptive-card-playbook.md       # Card registration & development guide
│   └── cards/
│       ├── example-card.json           # Sample Adaptive Card (reference)
│       └── ...                         # Additional sample cards
├── README.md                            # Monorepo setup, env vars, npm scripts
└── (existing v1.0 structure unchanged)
```

### Pattern 1: Metadata Drawer as Controlled Timeline Component

**What:** A React component that:
- Receives full message history from parent (ChatShell)
- Filters to `kind === 'adaptiveCard'` messages (card actions)
- Renders list in chronological order (oldest → newest)
- Shows card action metadata (cardId, timestamp, userSummary if available)
- Appears as `<aside>` in desktop layout (≥768px), hidden on mobile

**When to use:** All card action history display, activity log interaction

**Example:**

```typescript
// Source: v1.0 pattern in TranscriptView (UI-02, UI-03)
export function MetadataPane({ messages }: { messages: NormalizedMessage[] }) {
  // Filter to card actions only; enrich with timestamp and summary
  const cardActions = messages
    .filter((m) => m.kind === 'adaptiveCard')
    .map((m, idx) => ({
      ...m,
      // Derive timestamp from message sequence (or add timestamp field in future)
      sequence: idx,
      // userSummary already in message.text for card-submit chips (UI-10)
    }));

  return (
    <aside className="metadataPane" aria-label="Activity log">
      <div className="metadataPaneHeader">
        <h2>Activity Log</h2>
        <button onClick={handleDownload}>Download</button>
      </div>
      <ol className="activityTimeline">
        {cardActions.map((action) => (
          <li key={action.id} className="timelineItem">
            <time>{formatTime(action.sequence)}</time>
            <p>{action.cardId}</p>
            {action.text && <p className="summary">{action.text}</p>}
          </li>
        ))}
      </ol>
    </aside>
  );
}
```

### Pattern 2: Activity Log Download via Blob API

**What:** A function that:
- Serializes full conversation history to JSON
- Creates a Blob with `application/json` MIME type
- Triggers browser download via `<a href="...">` or `URL.createObjectURL()`
- Filename includes timestamp: `activity-log-2026-02-20T15-30-45Z.json`

**When to use:** Export full chat history for analysis, audit, or record-keeping

**Example:**

```typescript
// Source: Browser File API (standard, zero-dependency)
export function downloadActivityLog(messages: NormalizedMessage[]): void {
  const data = {
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `activity-log-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
```

### Pattern 3: GitHub Actions Lint + Test + Security Checks

**What:** A YAML workflow that:
- Runs on `push` and `pull_request` (default branches)
- Installs Node 20 with `npm ci`
- Runs `npm run lint` (covers all workspaces via root ESLint config)
- Runs `npm test` (covers all workspaces via root test script)
- Runs credential-leak check: `grep -r "COPILOT" client/` (fails if found)
- Runs Zod-instance check: `npm ls zod` (fails if output shows >1 instance)
- Reports results on PR/commit

**When to use:** Enforce code quality and security on every push; gate PRs with required status checks

**Example:**

```yaml
# Source: GitHub Actions documentation + v1.0 npm scripts
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - run: npm ci
      - run: npm run lint
      - run: npm test

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci
      - name: Check for credential leaks
        run: |
          if grep -r "COPILOT" client/; then
            echo "ERROR: Copilot credentials leaked in client code"
            exit 1
          fi
      - name: Check Zod instance count
        run: |
          INSTANCE_COUNT=$(npm ls zod | grep -c "zod@")
          if [ "$INSTANCE_COUNT" -gt 1 ]; then
            echo "ERROR: Multiple Zod instances detected"
            npm ls zod
            exit 1
          fi
```

### Anti-Patterns to Avoid

- **Embedding secrets in code before CI check:** All `.env.example` files must use placeholders (COPILOT_*, not real values); CI check catches mistakes
- **Zod hoisting to workspace roots:** v1.0 correctly prevents this with `"overrides": { "zod": "3.25.76" }` in root; don't remove or change
- **Metadata pane always visible:** CSS already hides on mobile; CSS must remain, not overridden by React conditional render
- **Activity log with unserializable fields:** Only serialize primitive types; avoid circular references (already guaranteed by NormalizedMessage schema)
- **Manual Zod instance audit:** Use `npm ls` output parsing instead of `node_modules` inspection; detection is automated in CI

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client-side file download | Custom HTTP fetch + streaming | Browser Blob + `URL.createObjectURL()` | Avoids server endpoint, simpler UX (instant download), zero HTTP overhead |
| Responsive layout for sidebar | Custom media query logic | CSS `@media (min-width: 768px)` + classNames | Already implemented in v1.0 chat.css; CSS cascade handles all states |
| Lint enforcement across workspaces | Workspace-specific configs | Root ESLint config (already present) | v1.0 already unified across client/, server/, shared/; adding workspace configs defeats the purpose |
| Secret pattern detection | Custom regex engine | Grep + GitHub Actions shell | POSIX grep is available in all runners; regexes are easier to audit than bespoke code |
| Package instance detection | Custom node_modules traversal | `npm ls` command | npm output is guaranteed to reflect installed state; parsing is one-liner |

**Key insight:** Phase 4 is integration + polish, not feature addition. All infrastructure is already in place (layout, state management, testing, linting). The phase glues it together (metadata pane into layout, export into UI, CI into repo) and documents patterns (README, playbook) to unblock new developers.

## Common Pitfalls

### Pitfall 1: Missing Timestamp on Card Actions

**What goes wrong:** Activity log export shows messages in order, but without millisecond precision, it's ambiguous when rapid-fire card actions occurred.

**Why it happens:** NormalizedMessage schema doesn't include a `timestamp` field; messages are inferred to be in chronological order by array position.

**How to avoid:** Either (a) add optional `timestamp: number` (ms since epoch) to NormalizedMessage schema in Phase 5, or (b) for Phase 4, document that activity log preserves order but not precise timing; UI can show message index instead of wall-clock time.

**Warning signs:** Card action log shows same timestamp for multiple actions; export JSON has no `timestamp` fields.

### Pitfall 2: Metadata Drawer Causing Layout Shift on Desktop

**What goes wrong:** `.metadataPane` renders empty when no messages, creating a blank 280px sidebar; on first message, content appears and layout jitters.

**Why it happens:** Container exists but is empty; browser reflow happens when content populates.

**How to avoid:** Always populate metadata pane with at least a header (e.g., "Activity Log" title) and a message like "No card actions yet" when empty. CSS `:empty` pseudo-selector can hide truly empty containers, but semantic HTML prefers always-present structure.

**Warning signs:** Sidebar disappears/reappears; width changes; scrollbar position jumps.

### Pitfall 3: Activity Log Export Includes Credentials

**What goes wrong:** User downloads JSON; it contains `.env` values that got logged in error messages.

**Why it happens:** Errors from failed Copilot calls might leak API keys or tenant IDs if not sanitized.

**How to avoid:** In the response normalizer (server-side), strip any fields that could contain secrets before adding to history. Alternatively, document in README that activity logs are sensitive and shouldn't be shared publicly.

**Warning signs:** Export JSON contains strings like `COPILOT_TENANT_ID=...` or bearer tokens.

### Pitfall 4: GitHub Actions Workflow Not Triggered on Pull Requests

**What goes wrong:** Developers push directly to main and CI doesn't run; bad code merges without being caught.

**Why it happens:** Workflow YAML is missing `pull_request` trigger or branch filters are incorrect.

**How to avoid:** Workflow must have both `push` and `pull_request` triggers; use branch filters `branches: [main]` or `branches-ignore: [refs/tags/**]` to avoid redundant runs.

**Warning signs:** PR checks don't appear; CI only runs on merge, not on PR open.

### Pitfall 5: Grep Credential Check Too Broad

**What goes wrong:** `grep -r "COPILOT" client/` matches legitimate variable names like `CopilotStudioClient` (in comments), causing false failures.

**Why it happens:** Grep pattern is too simple; doesn't distinguish between code comments/strings and actual hardcoded secrets.

**How to avoid:** Refine pattern to catch only suspicious patterns, e.g., `grep -r "COPILOT_[A-Z_]*=" client/` (assignment operators). Or exclude test/fixture files: `grep -r "COPILOT" client/ --exclude-dir=__tests__ --exclude="*.fixture.json"`.

**Warning signs:** CI fails even though no secrets are present; legitimate code strings match the pattern.

### Pitfall 6: `npm ls zod` Output Parsing Brittle

**What goes wrong:** `npm ls zod` output format varies by npm version; simple grep count breaks.

**Why it happens:** npm v8/v9/v10 have different tree formatting (flat vs. tree symbols).

**How to avoid:** Parse output more carefully: count non-zero lines with `zod@` and a version number, e.g., `npm ls zod --depth=0` to limit to direct deps. Or use `npm ls zod --json | jq '.dependencies.zod'` to get structured output.

**Warning signs:** CI passes locally but fails in GitHub Actions (different npm version); false positives.

## Code Examples

Verified patterns from official sources and v1.0 codebase:

### Activity Log Download

```typescript
// Source: v1.0 ChatShell pattern + Browser File API
// File: client/src/components/ActivityLogButton.tsx

import { NormalizedMessage } from '@copilot-chat/shared';

export function ActivityLogButton({ messages }: { messages: NormalizedMessage[] }) {
  const handleDownload = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      conversationLength: messages.length,
      messages,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `activity-log-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <button onClick={handleDownload} className="downloadButton">
      Download Activity Log
    </button>
  );
}
```

### Metadata Pane Component

```typescript
// Source: v1.0 TranscriptView pattern + UI-11 requirement
// File: client/src/components/MetadataPane.tsx

import { NormalizedMessage } from '@copilot-chat/shared';
import './metadata.css';

export function MetadataPane({ messages }: { messages: NormalizedMessage[] }) {
  const cardActions = messages.filter((m) => m.kind === 'adaptiveCard');

  return (
    <aside className="metadataPane" aria-label="Activity log">
      <div className="metadataPaneHeader">
        <h2>Card Actions</h2>
      </div>
      {cardActions.length === 0 ? (
        <p className="metadataPanePlaceholder">No card actions yet</p>
      ) : (
        <ol className="activityTimeline">
          {cardActions.map((action, idx) => (
            <li key={action.id} className="timelineItem">
              <time>#{idx + 1}</time>
              <span className="cardId">{action.cardId}</span>
              {action.text && (
                <p className="actionSummary">{action.text}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
```

### GitHub Actions Workflow

```yaml
# Source: GitHub Docs, v1.0 npm scripts, POSIX standard tools
# File: .github/workflows/ci.yml

name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-test:
    name: Lint & Test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

  security-checks:
    name: Security Checks
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Check credential leaks
        run: |
          if grep -r "COPILOT" client/ 2>/dev/null | grep -v "node_modules" | grep -v ".git"; then
            echo "❌ FAIL: Credentials detected in client code"
            exit 1
          fi
          echo "✓ PASS: No credential leaks detected"

      - name: Check Zod instance count
        run: |
          ZOD_COUNT=$(npm ls zod --depth=0 2>&1 | grep -c "zod@" || echo "0")
          if [ "$ZOD_COUNT" -ne 1 ]; then
            echo "❌ FAIL: Expected 1 Zod instance, found $ZOD_COUNT"
            npm ls zod
            exit 1
          fi
          echo "✓ PASS: Single Zod instance verified"
```

### README.md Structure

```markdown
# Agentic Copilot Chat App

A production-ready monorepo delivering a responsive chat experience powered by Microsoft Copilot Studio and Adaptive Cards.

**Status:** v1.0 shipped (2026-02-20); v1.1 Phase 4 in progress.

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### 1. Clone and Install

\`\`\`bash
git clone <repo>
cd copilot-chat
npm ci
\`\`\`

### 2. Configure Environment

Copy `.env.example` files to `.env` in both `client/` and `server/`:

\`\`\`bash
cp client/.env.example client/.env
cp server/.env.example server/.env
\`\`\`

Then fill in your Copilot Studio credentials:

| Variable | Description | Example |
|----------|-------------|---------|
| `COPILOT_TENANT_ID` | Your Azure tenant ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `COPILOT_APP_ID` | Copilot Studio app ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `COPILOT_AGENT_IDENTIFIER` | Agent identifier from Copilot Studio | `agent-name-here` |
| `VITE_API_URL` (client only) | Server API endpoint | `http://localhost:3001` |

### 3. Run Development Server

\`\`\`bash
npm run dev
\`\`\`

Opens:
- **Client:** http://localhost:5173
- **Server:** http://localhost:3001

### 4. Run Tests

\`\`\`bash
npm test
\`\`\`

Runs Vitest across `server/` and `shared/`, Jest in `client/`.

### 5. Lint & Format

\`\`\`bash
npm run lint       # Check for issues
npm run format     # Auto-fix formatting
\`\`\`

## Project Structure

\`\`\`
.
├── client/              # React 18 + Vite chat UI
├── server/              # Express.js Copilot proxy
├── shared/              # Zod schemas & types (single source of truth)
├── .github/workflows/   # GitHub Actions CI
├── docs/                # Documentation & Adaptive Card assets
└── README.md            # This file
\`\`\`

## Workspaces

### `client/`

React + TypeScript chat interface. Handles user input, renders messages and Adaptive Cards, manages theme.

- **Dev:** `npm run dev --workspace=client`
- **Build:** `npm run build --workspace=client`
- **Test:** `npm test --workspace=client`

### `server/`

Express.js API proxy for Copilot Studio. All secrets (API keys, tenant IDs) live here only.

- **Dev:** `npm run dev --workspace=server`
- **Build:** `npm run build --workspace=server`
- **Test:** `npm test --workspace=server`

### `shared/`

Zod schemas for API contracts and message types. Generates TypeScript types consumed by client and server.

- **Build:** `npm run build --workspace=shared`
- **Dev:** `npm run dev --workspace=shared` (watches)

## Adaptive Cards

Card definitions are registered in `docs/adaptive-card-playbook.md`. See that guide for:

1. How to register a new card by ID
2. Card JSON structure and validation rules
3. How to wire server-side submission handling
4. Patterns for user summary text

Sample cards are in `docs/cards/`.

## Security

All Copilot Studio client instantiation happens on the server only. The browser never has direct access to credentials. Card actions are validated against an allowlist before forwarding to Copilot.

See `.env.example` for required environment variables.

## Deployment

Not yet documented (v1.2 milestone). See constraints in PROJECT.md.

## License

Proprietary.
```

### Adaptive Cards Playbook Structure

```markdown
# Adaptive Cards Playbook

This guide explains how to register, develop, and integrate a new Adaptive Card into the chat system.

## Overview

Every Adaptive Card submitted by a user is routed through a server-side allowlist. This ensures that:
1. Only registered cards can be rendered
2. Card actions are validated before forwarding to Copilot
3. Card submission summaries are consistent and user-friendly

## Step 1: Register a Card ID

A card is identified by a unique `cardId`. Choose a descriptive, kebab-case name:

**Examples:**
- `approval-form`
- `feedback-survey`
- `resource-booking`

## Step 2: Create Card JSON

Save the Adaptive Card JSON schema to `docs/cards/{cardId}.json`.

**Template:**

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "Example Card",
      "weight": "bolder"
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Submit",
      "data": {
        "action": "submit",
        "cardId": "{cardId}"
      }
    }
  ]
}
```

## Step 3: Define User Summary

When a card is submitted, the system displays a summary chip in the chat transcript (e.g., "✓ Submitted: Approval Request"). Define this in your card's metadata.

**In code (server/src/allowlist/cardActionAllowlist.ts):**

```typescript
const CARD_SUMMARIES: Record<string, (data: unknown) => string> = {
  'approval-form': (data) => {
    const d = data as { approverEmail?: string };
    return `Approval request for ${d.approverEmail || 'unknown'}`;
  },
  // ...
};
```

## Step 4: Wire Server Handling

Card action submissions are forwarded to Copilot. Ensure the card's action data includes:

```json
{
  "action": "submit",
  "cardId": "your-card-id",
  // ... card-specific fields
}
```

The server validates `cardId` and action names against the allowlist before calling Copilot.

## Example: Complete Feedback Card

**Card JSON** (`docs/cards/feedback-survey.json`):

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "How satisfied are you?",
      "weight": "bolder"
    },
    {
      "type": "Input.ChoiceSet",
      "id": "satisfaction",
      "choices": [
        { "title": "Very Satisfied", "value": "5" },
        { "title": "Satisfied", "value": "4" },
        { "title": "Neutral", "value": "3" }
      ]
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Submit Feedback",
      "data": { "action": "submit", "cardId": "feedback-survey" }
    }
  ]
}
```

**Server allowlist entry** (`server/src/allowlist/cardActionAllowlist.ts`):

```typescript
CARD_SUMMARIES['feedback-survey'] = (data) => {
  const d = data as { satisfaction?: string };
  const scores: Record<string, string> = { '5': 'Very Satisfied', '4': 'Satisfied', '3': 'Neutral' };
  return `Feedback: ${scores[d.satisfaction] || 'Unknown'}`;
};
```

## Testing

Each card should have a corresponding test in `server/src/allowlist/cardActionAllowlist.test.ts`:

```typescript
it('accepts and summarizes feedback-survey card actions', () => {
  const action = { action: 'submit', cardId: 'feedback-survey' };
  expect(() => validateCardAction(action, 'feedback-survey')).not.toThrow();

  const summary = CARD_SUMMARIES['feedback-survey']({ satisfaction: '5' });
  expect(summary).toBe('Feedback: Very Satisfied');
});
```

## Versioning & Updating Cards

- **Version 1.5:** Current Adaptive Card schema version (no breaking changes expected in v1.1)
- **Backward Compatibility:** If you update an existing card, preserve the `cardId` and ensure old action data still routes correctly
- **New Cards:** Are always safe; just add a new entry to the allowlist

---

*For more on Adaptive Cards, see https://adaptivecards.io/*
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual credential audits | GitHub Actions grep + CI gate | v1.1 Phase 4 | Prevents secrets from merging; automated on every PR |
| No activity export | Browser Blob download | v1.1 Phase 4 | Users can audit/archive chat history without server endpoint |
| Single metadata placeholder | Card action timeline sidebar | v1.1 Phase 4 | Desktop users see history; improves UX for extended conversations |
| Oral knowledge transfer | README + playbook docs | v1.1 Phase 4 | New developers onboard without pairing; card authors can extend independently |
| Local-only linting | Enforced CI linting | v1.1 Phase 4 | Bad code can't merge; consistency guaranteed |

**Deprecated/outdated:**
- Placeholder `.env` files without examples — Phase 4 README references them explicitly
- Bare `docs/` directory — Phase 4 adds structure: `docs/adaptive-card-playbook.md`, `docs/cards/`

## Open Questions

1. **Timestamp precision on card actions**
   - What we know: NormalizedMessage schema doesn't include `timestamp` field; messages are in order but lack millisecond precision
   - What's unclear: Should activity log show wall-clock time or just sequence numbers?
   - Recommendation: For Phase 4, use sequence index (simplest). If precision is needed in Phase 5, add optional `timestamp: number` to schema and populate server-side.

2. **Activity log export retention on client**
   - What we know: Download creates Blob in-memory; no server storage
   - What's unclear: Should client also persist to IndexedDB for offline access?
   - Recommendation: Out of scope for Phase 4. Document that downloads are one-time; repeat download if needed.

3. **Metadata drawer scroll behavior on long conversations**
   - What we know: Aside has `overflow-y: auto` in CSS; should work
   - What's unclear: Should timeline items be virtualized for 1000+ messages?
   - Recommendation: Test in Phase 4 with realistic data. If performance is acceptable, no virtualization needed. Virtual scroll is a Phase 5 optimization (PERF-02).

4. **CI failure notifications**
   - What we know: GitHub Actions workflow succeeds/fails; status checks block PRs
   - What's unclear: Should we add email/Slack notifications for main branch failures?
   - Recommendation: Out of scope for Phase 4. Branch protection rules + PR status checks are sufficient for MVP. Notifications are a v1.2 operational concern.

## Sources

### Primary (HIGH confidence)

- **React 18 + Vite:** v1.0 codebase verification; established patterns in ChatShell.tsx, TranscriptView.tsx
- **Express + Node 20:** v1.0 server/src/ structure; routes working in production
- **Zod 3.25.76:** v1.0 shared/ schemas; single instance verified via npm overrides
- **npm workspaces:** v1.0 root package.json; lint and test scripts execute across all workspaces
- **GitHub Actions setup-node:** [GitHub Actions: Building and testing Node.js](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs)
- **CSS @media queries:** [MDN Web Docs: Media Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries); v1.0 chat.css implements responsive layout
- **Browser Blob API:** [MDN Web Docs: Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob); standard Web API, no dependencies
- **npm ls command:** [npm Docs: npm ls](https://docs.npmjs.com/cli/v7/commands/npm-ls); parses installed package tree
- **Adaptive Cards schema v1.5:** [Adaptive Cards: Schema Explorer](https://adaptivecards.io/designer/); official reference

### Secondary (MEDIUM confidence)

- **README.md best practices (monorepo):** [Complete Monorepo Guide: pnpm + Workspace + Changesets](https://jsdev.space/complete-monorepo-guide/); patterns apply to npm workspaces
- **GitHub Actions secrets detection:** [GitHub Docs: About secret scanning](https://docs.github.com/code-security/secret-scanning/about-secret-scanning); grep-based approach is complementary to GitHub's built-in scanning
- **npm find-dupes and dedupe:** [npm Docs: npm find-dupes](https://docs.npmjs.com/cli/v7/commands/npm-find-dupes); `npm ls` output parsing verified against npm v10 behavior
- **Adaptive Cards templating and registry:** [Adaptive Cards: Templating Overview](https://learn.microsoft.com/en-us/adaptive-cards/templating/); [Microsoft Adaptive Cards Templates GitHub](https://github.com/microsoft/adaptivecards-templates); informs playbook structure

### Tertiary (LOW confidence / context)

- **GitHub Actions performance optimization:** [Building and testing Node.js - GitHub Docs](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs); caching strategies are standard but vary by npm/Node version
- **Web search on credential leak patterns:** Multiple sources (StepSecurity, Checkmarx blogs); useful for background but grep-based approach chosen for simplicity

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — All v1.0 verified, no version changes, established patterns
- **Architecture patterns:** HIGH — UI-11 and UI-12 are pure React/CSS/Blob API; no new paradigms
- **Metadata drawer implementation:** HIGH — Builds directly on v1.0 responsive layout and message filtering
- **GitHub Actions workflow:** HIGH — Official GitHub docs + standard POSIX tools (grep, npm ls)
- **README & playbook documentation:** MEDIUM — Patterns verified against monorepo best practices, but structure refined for this specific project

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (30 days; stack is stable, no major ecosystem shifts expected in Feb-Mar 2026)

