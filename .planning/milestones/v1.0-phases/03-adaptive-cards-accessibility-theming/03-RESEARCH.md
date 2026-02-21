# Phase 3 Research: Adaptive Cards + Accessibility + Theming

**Phase:** 3 — Adaptive Cards + Accessibility + Theming
**Requirements:** SERV-04, SERV-07, SERV-08, SERV-12, UI-01, UI-06, UI-07, UI-08, UI-10, UI-13, UI-14, UI-15, UI-16, UI-17
**Researched:** 2026-02-20

---

## 1. Codebase Foundation (What Phase 2 Built)

### Client structure
- `client/src/components/ChatShell.tsx` — top-level shell, single `.chatShell` flex column, no layout regions yet
- `client/src/components/TranscriptView.tsx` — scrolling list of `MessageBubble` + `SkeletonBubble`
- `client/src/components/MessageBubble.tsx` — renders `kind === 'adaptiveCard'` as a placeholder string `[Interactive card — Phase 3]`
- `client/src/components/chat.css` — hardcoded light-mode colors (`#fff`, `#0078d4`, `#f3f2f1`); no CSS custom properties, no dark-mode media queries, no responsive breakpoints
- `client/src/hooks/useChatApi.ts` — `useReducer` state; exposes `messages`, `isLoading`, `error`, `sendMessage`; no `cardAction` dispatch yet (hook has a `cardAction` fetch wrapper stub referenced in the API layer schema but not yet wired)
- `client/src/api/chatApi.ts` — only `startConversation` and `sendMessage`; no `cardAction` function yet

### Server structure
- `server/src/routes/chat.ts` — only `/start` and `/send`; no `/card-action` route
- `server/src/normalizer/activityNormalizer.ts` — produces `cardId` (uuidv4) per card; this `cardId` is what gets sent back to `/api/chat/card-action`
- `shared/src/schemas/api.ts` — `CardActionRequestSchema` and `CardActionResponseSchema` already defined
- `shared/src/schemas/message.ts` — `NormalizedMessage` already has `cardJson`, `cardId` optional fields

### Package state
- `adaptivecards` package is **NOT installed** in `client/` — must be added in Phase 3
- No CSS custom properties / design tokens anywhere yet
- No ARIA live region on the transcript
- No keyboard focus indicators beyond browser defaults

---

## 2. Adaptive Cards SDK — Key Technical Facts

### Package to install
```
npm install adaptivecards --workspace=client
```
The `adaptivecards-react` package is explicitly banned (out of scope, React 18 incompatible). Use `adaptivecards` v3 SDK directly with `useRef`/`useEffect` (per UI-06).

### Core rendering pattern
```ts
import * as AdaptiveCards from 'adaptivecards';

const ac = new AdaptiveCards.AdaptiveCard();
ac.hostConfig = new AdaptiveCards.HostConfig({ fontFamily: 'system-ui' });
ac.parse(cardJson);               // parse the raw card JSON
ac.onExecuteAction = (action) => { /* handle submit */ };
const rendered = ac.render();    // returns HTMLElement | undefined
if (rendered && containerRef.current) {
  containerRef.current.innerHTML = '';
  containerRef.current.appendChild(rendered);
}
```

### Action handling
- `onExecuteAction` receives an `AdaptiveCards.Action` object
- For `Action.Submit`: `(action as AdaptiveCards.SubmitAction).data` contains the form payload
- For `Action.OpenUrl`: `(action as AdaptiveCards.OpenUrlAction).url` — subject to domain allowlist (SERV-08)
- Action type is available on `action.getJsonTypeName()` → `"Action.Submit"`, `"Action.OpenUrl"`, etc.
- The `userSummary` field sent to `/api/chat/card-action` should be derived from the card title or a static label keyed to `cardId`

### Theme integration
The SDK renders raw DOM — it does NOT inherit CSS custom properties automatically. To apply dark/light theme to cards, pass a custom `HostConfig` with the appropriate colors, or wrap the card container in a CSS scope and use careful selectors.

### Cleanup
Always clear `containerRef.current.innerHTML = ''` before re-rendering to avoid duplicate DOM nodes. Use `useEffect` cleanup.

---

## 3. Server: POST /api/chat/card-action (SERV-04, SERV-07, SERV-08, SERV-12)

### Route contract
Already defined in `shared/src/schemas/api.ts`:
```ts
CardActionRequestSchema = z.object({
  conversationId: z.string().uuid(),
  cardId: z.string(),
  userSummary: z.string(),
  submitData: z.record(z.string(), z.unknown()),
})
```

### Allowlist design (SERV-07, SERV-08)
Two separate allowlists:
1. **Action type allowlist** — which action types are permitted (e.g., `["Action.Submit"]`; `Action.OpenUrl` may be allowed with domain check)
2. **Domain allowlist** — if `Action.OpenUrl` passes the type check, the URL's hostname must match an allowlist

`submitData.action` carries the action type from the client. The route must:
1. Parse/validate the request with `CardActionRequestSchema`
2. Check `submitData.action` against `ALLOWED_ACTION_TYPES` — return 403 if not allowed
3. For `Action.OpenUrl`: parse URL, check hostname against `ALLOWED_DOMAINS` — return 403 if not allowed
4. Build a message Activity and call `copilotClient.sendActivityStreaming()`
5. Normalize response and return `CardActionResponseSchema`-shaped JSON

### Unit tests (SERV-12)
Use Vitest. Test:
- Allowed action type → passes validation and proceeds
- Disallowed action type → validator returns error/false (unit-test the pure function, not the HTTP handler)
- OpenUrl with allowed domain → passes
- OpenUrl with disallowed domain → blocked

Extract the allowlist validator as a pure function for easy testing.

---

## 4. Layout: Responsive Split-Pane (UI-01)

### Target breakpoints
- **Mobile** ≤767px: single-column, transcript fills width, input at bottom
- **Desktop** ≥768px: two-column CSS Grid — `transcript | metadata-drawer`
- Verified at 360px, 768px, 1280px

### CSS Grid approach
```css
/* Mobile first */
.appLayout {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr auto;
  height: 100vh;
}

@media (min-width: 768px) {
  .appLayout {
    grid-template-columns: 1fr 280px; /* right pane reserved for Phase 4 drawer */
    grid-template-rows: 1fr;
  }
}
```

### Phase 4 drawer slot
The right pane must exist in the DOM as a structural element on desktop but be empty / show a placeholder in Phase 3. This avoids layout rework in Phase 4.

### ChatShell changes
`ChatShell` currently is a single column. It must become the `.appLayout` grid wrapper, with the transcript+input in the left cell and a `.metadataDrawer` placeholder in the right cell (desktop only, hidden on mobile).

---

## 5. Theme System (UI-13, UI-14, UI-15)

### CSS custom properties approach
Replace all hardcoded color values in `chat.css` with CSS custom properties defined on `:root` (or `[data-theme]`):

```css
:root {
  /* Light theme defaults */
  --color-bg: #ffffff;
  --color-surface: #f3f2f1;
  --color-primary: #0078d4;
  --color-primary-hover: #006cbf;
  --color-text: #323130;
  --color-text-inverse: #ffffff;
  --color-border: #e0e0e0;
  --color-error-bg: #fde7e9;
  --color-error-text: #a4262c;
  --color-skeleton: #ebebeb;
  --color-skeleton-shine: #f5f5f5;
  /* Typography scale (UI-14) */
  --font-size-sm: clamp(11px, 1.5vw, 12px);
  --font-size-base: clamp(13px, 2vw, 14px);
  --font-size-lg: clamp(14px, 2.5vw, 16px);
  /* Spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
}

[data-theme="dark"] {
  --color-bg: #1b1a19;
  --color-surface: #2d2c2b;
  --color-text: #f3f2f1;
  /* ... etc */
}
```

### System preference detection
```ts
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
```

### Persistence
Store in `localStorage` with key e.g. `'chatTheme'`. On app init: read localStorage → fallback to system preference → apply `document.documentElement.dataset.theme`.

### Toggle hook
A `useTheme()` hook manages:
- Initial value: `localStorage.getItem('chatTheme') ?? (systemDark ? 'dark' : 'light')`
- Sets `document.documentElement.dataset.theme` on change
- Persists to `localStorage`

### Reduced motion (UI-15)
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```
This covers skeleton shimmer, button transitions, and all other transitions.

---

## 6. Accessibility (UI-16, UI-17)

### ARIA live region (UI-16)
Add to `TranscriptView`:
```tsx
<div
  className="transcriptView"
  ref={containerRef}
  aria-live="polite"
  aria-label="Conversation transcript"
  role="log"
>
```
`role="log"` implies `aria-live="polite"` but explicitly setting both is safe and portable.

### Keyboard navigation (UI-17)
- All interactive elements (textarea, send button, theme toggle, card buttons/inputs) must be focusable and operable via Enter/Space
- Visible focus states: add `:focus-visible` ring styles using CSS custom properties
- The Adaptive Cards SDK renders buttons as native `<button>` elements — these are keyboard-accessible by default, but the SDK's default styling may hide focus rings; apply `:focus-visible` overrides in the card container CSS

### Scope of WCAG 2.2 AA
Key checks:
- Color contrast ≥ 4.5:1 for normal text, 3:1 for large text — verify dark and light themes
- All interactive elements reachable by Tab key
- No keyboard traps
- Error messages associated with their inputs
- Skeleton loading state is `aria-hidden="true"` (already decorative)

---

## 7. AdaptiveCardMessage Component Design (UI-06, UI-07, UI-08, UI-10)

### Component: `AdaptiveCardMessage`
Replaces the placeholder in `MessageBubble` for `kind === 'adaptiveCard'`.

```tsx
interface AdaptiveCardMessageProps {
  message: TranscriptMessage;  // kind === 'adaptiveCard'
  onCardAction: (cardId: string, userSummary: string, submitData: Record<string, unknown>) => void;
  disabled: boolean; // true after first submit (UI-08)
}
```

### Submission flow (UI-07, UI-08)
1. User clicks Submit on card
2. `onExecuteAction` fires
3. Component sets local `submitted = true` immediately (disables card, shows pending state)
4. Calls `onCardAction(cardId, userSummary, submitData)` which calls `/api/chat/card-action`
5. Bot response messages added to transcript

### Preventing resubmit (UI-08)
- Use local `useState<boolean>` for `submitted`
- Once `true`, re-render the card container with `pointer-events: none; opacity: 0.6` and show a pending indicator
- Do NOT re-render the card with `ac.render()` after submit (no clean way to programmatically disable the SDK's DOM); instead overlay the container with a CSS pseudo-element or a `<div>` overlay

### Transcript chip for card-submit (UI-10)
After card submission, the optimistic user bubble should be a "card-submit summary" chip, not a standard text bubble. This means:
- When dispatching the card action result, add a synthetic user message with `kind: 'text'` and `text: userSummary` but with a new `subKind: 'cardSubmit'` or a flag on `TranscriptMessage`
- Render a visually distinct chip (pill style, different background) in `MessageBubble` when this flag is set

Alternative simpler approach: just show the `userSummary` as a regular user bubble with an italic prefix "Submitted: ...". Either approach satisfies UI-10.

---

## 8. Hook and API Changes

### `useChatApi` additions
The hook needs a `cardAction` function:
```ts
async function cardAction(cardId: string, userSummary: string, submitData: Record<string, unknown>): Promise<void>
```
This follows the same pattern as `send()`:
1. Optimistic user bubble (userSummary text, marked as cardSubmit)
2. Call `sendCardAction(conversationId, cardId, userSummary, submitData, signal)` from `chatApi.ts`
3. Dispatch SEND_SUCCESS with bot messages OR SEND_ERROR

New reducer action types needed:
- `CARD_ACTION_SUCCESS` (or reuse `SEND_SUCCESS`)
- Possibly a `subKind` field on TranscriptMessage to differentiate card-submit summaries

### `chatApi.ts` additions
New fetch function:
```ts
export async function sendCardAction(
  conversationId: string,
  cardId: string,
  userSummary: string,
  submitData: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ conversationId: string; messages: NormalizedMessage[] }>
```

---

## 9. Plan Decomposition Recommendation

Based on the work required and parallelization opportunities:

| Wave | Plan | Description | Key Requirements |
|------|------|-------------|-----------------|
| 1 | 03-01 | Server: card-action allowlist validator + tests + route | SERV-04, SERV-07, SERV-08, SERV-12 |
| 1 | 03-02 | CSS design tokens + dark/light theme + reduced-motion | UI-13, UI-14, UI-15 |
| 2 | 03-03 | Responsive layout (split-pane grid + Phase 4 drawer slot) | UI-01 |
| 2 | 03-04 | AdaptiveCardMessage component + useChatApi cardAction hook | UI-06, UI-07, UI-08, UI-10 |
| 3 | 03-05 | Accessibility hardening (ARIA live region, focus states, WCAG AA) | UI-16, UI-17 |

**Wave 1** plans are independent (server vs. CSS). **Wave 2** plans depend on Wave 1 (layout needs tokens; card component needs the server route to exist). **Wave 3** accessibility plan applies across the full component tree built in waves 1-2.

---

## 10. Critical Implementation Notes

1. **`adaptivecards` package must be installed** before the card component plan executes — add to `03-04`'s tasks.
2. **Card container overflow at 360px** — set `max-width: 100%` and `overflow-x: auto` on the card wrapper; this is the most accessible option for cards with wide content.
3. **HostConfig for theme** — the Adaptive Card SDK renders raw HTML with inline styles from its HostConfig. To support dark mode, either pass a dark-appropriate HostConfig when `data-theme="dark"`, or accept that card internal colors won't follow the app theme (acceptable per CONTEXT.md which says card theme integration is Claude's discretion).
4. **`cardId` comes from the server** (already in `NormalizedMessage.cardId`) — the client just passes it through to `/api/chat/card-action`. No client-side ID generation needed.
5. **Single-submission guarantee** — use a `useRef` (not `useState`) for the submitted flag inside the card component if the callback closes over stale state; or `useState` with immediate disable before the async call begins.
6. **STATE.md blocker note** — verify `adaptivecards` v3 `render()` API and `onExecuteAction` signature at install time; community examples may reference v1/v2 or the banned React wrapper.

## RESEARCH COMPLETE

All requirements (SERV-04, SERV-07, SERV-08, SERV-12, UI-01, UI-06, UI-07, UI-08, UI-10, UI-13, UI-14, UI-15, UI-16, UI-17) addressed. Ready for planning.
