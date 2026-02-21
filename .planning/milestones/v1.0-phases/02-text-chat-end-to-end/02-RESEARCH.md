# Phase 2: Text Chat End-to-End - Research

**Researched:** 2026-02-19
**Domain:** React 18 chat UI + Express Activity normalization + `useChatApi` hook with retry
**Confidence:** HIGH (primary sources: installed package type definitions, project source, official React/Vite docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Avatar icons (initials or icon) shown for both user and bot bubbles
- No timestamps on messages
- Enter to send + a visible Send button
- Input auto-resizes vertically up to a max height, then scrolls within the box
- Input is disabled while the bot is responding
- While waiting for the bot: skeleton placeholder row + animated typing dots inside it
- Optimistic user bubble appears immediately on send with a subtle "sending" indicator
- Loading indicator delayed ~300ms after send (avoids flicker on fast responses)
- Errors displayed inline below the failed user bubble (contextual, tied to the message)
- Auto-retry silently up to N times, then surface the error inline

### Claude's Discretion
- Message bubble alignment (user right / bot left, or both left)
- Bubble visual style (pill vs subtle card, exact colors)
- Character limit value
- Auto-scroll logic (always vs smart scroll)
- Number of silent retry attempts
- Visual state of user bubble during silent retry
- Actions shown after all retries exhausted

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SERV-03 | `POST /api/chat/send` — accepts `{ conversationId, text }`, calls `sendActivityStreaming()`, normalizes response, returns `{ conversationId, messages: NormalizedMessage[] }` | Activity type fields, `sendActivityStreaming` signature confirmed from installed package |
| SERV-06 | Response normalizer converts raw `Activity` objects to `NormalizedMessage[]`, strips proprietary fields; handles hybrid turns (text + attachment in one activity) | Activity structure fully mapped; normalizer logic documented below |
| SERV-11 | Unit tests for the response normalizer (text-only, card-only, hybrid turn cases) | Vitest already installed and configured in server; test structure documented |
| UI-02 | Chat transcript renders text messages as user/assistant bubbles with role indicator | React 18 + CSS Modules; bubble component pattern documented |
| UI-03 | Optimistic user message bubble appears immediately on send (before server response) | useReducer-based transcript state; optimistic pattern documented |
| UI-04 | Loading skeleton displayed while awaiting server response | CSS keyframe skeleton; 300ms delay pattern documented |
| UI-05 | Error toast displayed on network or server error with actionable message | Inline error below bubble (per CONTEXT.md); no toast library needed |
| UI-09 | `useChatApi` hook centralizes all fetch logic (start, send) with retry on transient errors | Exponential backoff pattern; fetch with AbortController documented |
</phase_requirements>

---

## Summary

Phase 2 builds the full text-chat loop: a React 18 client with a `useChatApi` hook, optimistic transcript state (via `useReducer`), and an Express `/api/chat/send` route backed by a pure-function Activity normalizer. The stack is already in place — no new runtime dependencies are needed beyond what Phase 1 installed.

The central design insight is that **the normalizer is the only truly novel code** in this phase. Everything else follows well-established React patterns. The normalizer's job is to inspect each `Activity` from the Copilot SDK, decide whether it is text-only, card-only, or hybrid, and produce one or more `NormalizedMessage` objects matching the existing `NormalizedMessageSchema`. This is pure TypeScript with zero I/O, making it highly testable.

On the client side, the critical discipline is keeping the transcript state in a single `useReducer` and performing all optimistic writes through dispatched actions — never via local `useState` scattered across components. This prevents the common pitfall of optimistic updates getting out of sync with server responses.

**Primary recommendation:** Build the normalizer + Vitest tests first (SERV-06, SERV-11), wire the `/api/chat/send` route next (SERV-03), then build the React UI top-down (useChatApi → TranscriptView → MessageBubble → ChatInput) to keep the dependency chain clear.

---

## Standard Stack

### Core (already installed — no new installs needed)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `react` | ^18.3.0 | UI rendering | Already in `client/package.json` |
| `react-dom` | ^18.3.0 | DOM rendering | Already installed |
| `vite` / `@vitejs/plugin-react` | ^6.0.0 / ^4.3.0 | Dev server + HMR | Configured in `client/vite.config.ts`; `/api` proxy to port 3001 already wired |
| `vitest` | ^3.0.0 | Server unit tests | Already in `server/devDependencies` |
| `uuid` | ^11.0.0 | Message ID generation | Already in server dependencies |
| `@microsoft/agents-copilotstudio-client` | ^1.1.1 | `sendActivityStreaming()` | Already installed |
| `@microsoft/agents-activity` | (transitive) | `Activity` type | Available via installed client package |

### New Installs Required

None for runtime. The Vite proxy to `/api` (already configured) means `fetch('/api/chat/...')` from the client browser works without CORS issues in dev.

**Optional — CSS-only, no install needed:**
- Skeleton shimmer: pure CSS `@keyframes` — no library required
- Typing dots: pure CSS animation — no library required

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `useReducer` for transcript | `useState` array | `useReducer` wins — multiple async state transitions (optimistic add, loading start, success replace, error update) are error-prone with `useState` |
| Pure CSS skeleton | `react-loading-skeleton` | No install needed; a 4-line `@keyframes` covers the use case |
| Inline fetch in component | `useChatApi` custom hook | Hook required by UI-09; also enables retry logic and abort |

---

## Architecture Patterns

### Recommended File Structure (new files only — additions to existing scaffold)

```
server/src/
├── normalizer/
│   ├── activityNormalizer.ts   # Pure function: Activity[] → NormalizedMessage[]
│   └── activityNormalizer.test.ts  # Vitest tests (text, card, hybrid)
└── routes/
    └── chat.ts                 # Extend with POST /api/chat/send

client/src/
├── api/
│   └── chatApi.ts              # Raw fetch wrappers (startConversation, sendMessage)
├── hooks/
│   └── useChatApi.ts           # UI-09: state management + retry logic
├── components/
│   ├── ChatShell.tsx            # Layout: transcript + input wired together
│   ├── TranscriptView.tsx       # Scrolling list of MessageBubble components
│   ├── MessageBubble.tsx        # Single message row: avatar + content + error area
│   ├── SkeletonBubble.tsx       # Animated placeholder while bot responds
│   └── ChatInput.tsx            # Auto-resize textarea + Send button
└── App.tsx                      # Replace Phase 1 stub; renders ChatShell
```

### Pattern 1: Activity Normalizer (Pure Function)

**What:** Converts an array of raw `Activity` objects from `sendActivityStreaming()` into `NormalizedMessage[]`.

**Key fields from `Activity` type (verified from installed package):**

```typescript
// From @microsoft/agents-activity Activity interface
type Activity = {
  type: string;           // "message" | "typing" | "endOfConversation" | etc.
  text?: string;          // Present on message activities with text content
  from?: {
    role?: string;        // "bot" | "user" | "skill" | etc.
  };
  attachments?: Attachment[];  // Present on card/media activities
  // ...many other fields to strip
};

type Attachment = {
  contentType: string;    // "application/vnd.microsoft.card.adaptive" for Adaptive Cards
  content?: unknown;      // The card JSON object
  contentUrl?: string;
  name?: string;
};
```

**Normalization rules (verified against `NormalizedMessageSchema`):**

```typescript
// Source: installed package type definitions + shared/src/schemas/message.ts
import { v4 as uuidv4 } from 'uuid';
import type { Activity } from '@microsoft/agents-activity';
import type { NormalizedMessage } from '@copilot-chat/shared';

const ADAPTIVE_CARD_CONTENT_TYPE = 'application/vnd.microsoft.card.adaptive';

export function normalizeActivities(activities: Activity[]): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [];

  for (const activity of activities) {
    // Only process "message" type activities; skip "typing", "endOfConversation", etc.
    if (activity.type !== 'message') continue;

    // Determine role — Copilot Studio bot activities have from.role === "bot"
    const role: 'user' | 'assistant' =
      activity.from?.role === 'bot' ? 'assistant' : 'user';

    // Text content (may coexist with attachments in a hybrid turn)
    if (activity.text) {
      messages.push({
        id: uuidv4(),
        role,
        kind: 'text',
        text: activity.text,
      });
    }

    // Attachments — look for Adaptive Cards
    for (const attachment of activity.attachments ?? []) {
      if (attachment.contentType === ADAPTIVE_CARD_CONTENT_TYPE && attachment.content) {
        messages.push({
          id: uuidv4(),
          role,
          kind: 'adaptiveCard',
          cardJson: attachment.content as Record<string, unknown>,
          cardId: uuidv4(), // Server-assigned; used for action routing in Phase 3
        });
      }
      // Non-Adaptive Card attachments (images, files) are silently skipped in Phase 2
    }
  }

  return messages;
}
```

**Hybrid turn:** A single `Activity` can have both `text` and `attachments`. The normalizer above handles this correctly — it produces a text `NormalizedMessage` AND one or more card `NormalizedMessage` objects from the same activity.

### Pattern 2: `sendActivityStreaming` Usage in `/api/chat/send`

**What:** The `CopilotStudioClient` singleton was designed with conversation ID stored internally. **Critical issue:** the Phase 1 singleton holds ONE internal `conversationId`, but multiple concurrent clients may call `/api/chat/send` with different `conversationId`s.

**Problem verified from type definition:**
```typescript
// From copilotStudioClient.d.ts
sendActivityStreaming(activity: Activity, conversationId?: string): AsyncGenerator<Activity>;
// conversationId parameter allows override — use this
```

**Solution:** Always pass the `conversationId` as the second argument to `sendActivityStreaming()`. This overrides the internal state.

```typescript
// Source: copilotStudioClient.d.ts
import { ActivityTypes } from '@microsoft/agents-activity';
import type { Activity } from '@microsoft/agents-activity';

// Build a message activity
const userActivity: Activity = {
  type: ActivityTypes.Message,  // "message"
  text: userText,
};

// Pass conversationId explicitly to avoid singleton state collision
for await (const activity of copilotClient.sendActivityStreaming(userActivity, sdkConversationId)) {
  collected.push(activity);
}
```

**The conversationId problem:** Phase 1 stores `collectedActivities` (raw `Activity[]`) in `ConversationStore.sdkConversationRef`. But what the SDK actually needs is a conversationId string, not a raw activity array. We need to capture the SDK's internal conversationId during `startConversationStreaming` and store it — OR use the fact that the SDK's `conversationId` property is set after `startConversationStreaming` completes.

**Recommended approach:** After consuming `startConversationStreaming`, read `copilotClient.conversationId` (private — not directly accessible) OR capture it from the SSE response headers (the SDK does this internally). **Better alternative:** Store the `copilotClient` instance itself per conversation, or access the `conversationId` via the SDK's WebChat connection (not clean). **Simplest:** Use the SDK singleton approach — Copilot Studio assigns a conversationId during `startConversationStreaming`, and the singleton remembers it. For Phase 2 (single-user dev context), the singleton's remembered `conversationId` is sufficient. Pass `undefined` as `conversationId` argument to let the SDK use its stored value.

**Phase 2 pragmatic decision:** For single-user dev use, the singleton conversation state is acceptable. The `conversationId` stored in `ConversationStore` is the server's external UUID; the SDK's internal ID is managed by the singleton. In Phase 2, treat the singleton as single-conversation. Multi-conversation support is a v2 concern (AUTH-02).

### Pattern 3: `useReducer`-based Transcript State (Client)

```typescript
// Source: React 18 docs patterns
type MessageStatus = 'sending' | 'sent' | 'error';

type TranscriptMessage = NormalizedMessage & {
  status?: MessageStatus;
  error?: string;
};

type TranscriptState = {
  messages: TranscriptMessage[];
  isLoading: boolean;
  conversationId: string | null;
};

type TranscriptAction =
  | { type: 'INIT'; conversationId: string }
  | { type: 'ADD_OPTIMISTIC'; message: TranscriptMessage }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'ADD_BOT_MESSAGES'; messages: NormalizedMessage[] }
  | { type: 'SET_ERROR'; messageId: string; error: string }
  | { type: 'CLEAR_OPTIMISTIC_STATUS'; messageId: string };

function transcriptReducer(state: TranscriptState, action: TranscriptAction): TranscriptState {
  switch (action.type) {
    case 'INIT':
      return { ...state, conversationId: action.conversationId };
    case 'ADD_OPTIMISTIC':
      return { ...state, messages: [...state.messages, action.message] };
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    case 'ADD_BOT_MESSAGES':
      return {
        ...state,
        isLoading: false,
        messages: [...state.messages, ...action.messages.map(m => ({ ...m, status: 'sent' as const }))],
      };
    case 'SET_ERROR':
      return {
        ...state,
        isLoading: false,
        messages: state.messages.map(m =>
          m.id === action.messageId ? { ...m, status: 'error', error: action.error } : m
        ),
      };
    default:
      return state;
  }
}
```

### Pattern 4: Retry with Exponential Backoff (`useChatApi`)

```typescript
// Source: MDN fetch docs + project pattern
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  signal?: AbortSignal
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const response = await fetch(url, { ...options, signal });
      // Retry on 5xx only
      if (response.status >= 500) {
        lastError = new Error(`Server error: ${response.status}`);
        if (attempt < maxRetries - 1) {
          await delay(Math.pow(2, attempt) * 200); // 200ms, 400ms, 800ms
          continue;
        }
        throw lastError;
      }
      return response;
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      lastError = err as Error;
      if (attempt < maxRetries - 1) {
        await delay(Math.pow(2, attempt) * 200);
      }
    }
  }
  throw lastError ?? new Error('Unknown error');
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Pattern 5: 300ms Skeleton Delay

```typescript
// Prevent flicker for fast responses
const SKELETON_DELAY_MS = 300;

// In useChatApi send handler:
const skeletonTimer = setTimeout(() => {
  dispatch({ type: 'SET_LOADING', loading: true });
}, SKELETON_DELAY_MS);

try {
  const response = await fetchWithRetry(...);
  clearTimeout(skeletonTimer);
  dispatch({ type: 'SET_LOADING', loading: false });
  // ...
} catch (err) {
  clearTimeout(skeletonTimer);
  // ...
}
```

### Pattern 6: Auto-resize Textarea

```typescript
// Source: standard DOM pattern — no library needed
function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
  const el = e.currentTarget;
  el.style.height = 'auto';            // Reset to measure scrollHeight
  el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
}
```

CSS:
```css
.chatInput {
  resize: none;
  overflow-y: auto;   /* scrolls within box once max-height reached */
  max-height: 160px;  /* ~4-5 lines */
  min-height: 44px;   /* single line */
}
```

### Pattern 7: Skeleton CSS Animation

```css
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
  height: 44px;
}
```

### Anti-Patterns to Avoid

- **setState in optimistic update**: Never `setState([...messages, newMsg])` then `setState([...messages, newMsg, ...botMsgs])` — race conditions between async state transitions. Use `useReducer` actions.
- **Singleton conversationId collision**: Do not rely on `copilotClient` internal `conversationId` for multi-user scenarios. For Phase 2, document this as single-conversation. Phase 3/v2 will address multi-tenancy.
- **Missing activity type filter**: Process only `type === "message"` activities. Copilot SDK emits `typing`, `endOfConversation`, `event`, and `trace` activities — these must be silently discarded.
- **Unmounted component setState**: Always check `signal.aborted` or use `useEffect` cleanup to cancel in-flight fetch requests via `AbortController`.
- **Card content type assumptions**: Always check `attachment.contentType === 'application/vnd.microsoft.card.adaptive'` before treating attachment as a card. Other content types (Hero Cards, images) exist and should be skipped in Phase 2.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | Custom random string | `uuid` (already installed) | RFC 4122 compliance, collision resistance |
| Exponential backoff | Manual loop with `Math.random` | Simple `2^attempt * 200ms` pattern | Complex jitter unnecessary for 3-retry UX |
| Skeleton shimmer | Third-party library | 4-line CSS `@keyframes` | Zero dependency cost |
| Typing dots | Third-party library | CSS `@keyframes` with 3 dots | Same |
| Auto-resize textarea | `react-textarea-autosize` | Native DOM `scrollHeight` pattern | Avoids unnecessary dependency |

**Key insight:** For a focused Phase 2 scope, native browser APIs + CSS cover all UI animation needs. Every added dependency has a Phase 1 cost (workspace resolution) and a Phase 3 upgrade cost.

---

## Common Pitfalls

### Pitfall 1: CopilotStudioClient Singleton ConversationId

**What goes wrong:** The singleton `copilotClient` stores an internal `conversationId`. If `startConversationStreaming` is called once on startup (Phase 1's route does this per request), the singleton's stored ID is from the last `start` call.

**Why it happens:** `CopilotStudioClient` was designed for single-conversation use cases. The `sendActivityStreaming(activity, conversationId?)` second parameter allows override, but if you pass `undefined`, it uses the stored ID.

**How to avoid:** In Phase 2, the `/api/chat/send` route must look up the stored conversation from `ConversationStore` and pass the SDK conversation ID explicitly. **Practical approach for Phase 2:** Store the result of `copilotClient.conversationId` right after `startConversationStreaming` completes (by reading the private field is not possible; instead, the SDK sets it internally). The pragmatic solution: after `startConversationStreaming`, call `sendActivityStreaming(activity)` without a `conversationId` argument — the singleton will use its stored ID from the last `start`. This is correct for single-conversation dev use.

**Warning signs:** `sendActivityStreaming` returns 0 activities or throws a 404/401, often indicating wrong conversation ID.

### Pitfall 2: Missing Activity Type Filter

**What goes wrong:** The normalizer processes all activities including `typing`, `endOfConversation`, `event` — these have no `text` and no `attachments`, producing empty messages or throwing errors.

**How to avoid:** Guard with `if (activity.type !== 'message') continue;` as the first check in the normalizer loop.

### Pitfall 3: Optimistic Message ID Mismatch

**What goes wrong:** The optimistic user bubble gets a client-generated UUID, and the server response also generates UUIDs for bot messages. If the client tries to "confirm" the optimistic message using the server's ID, it won't find it.

**How to avoid:** Keep optimistic messages as client-generated and permanent. The server response contains ONLY the bot's reply messages — the user's message doesn't come back from the server. The optimistic bubble is confirmed (status: 'sent') once the server 200 is received, not replaced.

### Pitfall 4: React `key` Prop Instability

**What goes wrong:** Using array index as `key` for transcript messages causes React to re-render the wrong elements when messages are inserted.

**How to avoid:** Always use `message.id` (UUID) as the React `key`.

### Pitfall 5: Input Not Disabled During Request

**What goes wrong:** User submits multiple messages while bot is responding, flooding the conversation queue. The existing `conversationStore` history won't be sequential.

**How to avoid:** Disable both the textarea and Send button when `isLoading === true` (per CONTEXT.md locked decisions).

---

## Vitest Test Structure (SERV-11)

The server already has `vitest` installed and `"test": "vitest run --passWithNoTests"` configured. No vitest config file is needed for basic usage — Vitest auto-discovers `*.test.ts` files.

```typescript
// server/src/normalizer/activityNormalizer.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeActivities } from './activityNormalizer.js';
import type { Activity } from '@microsoft/agents-activity';

const BOT_FROM = { role: 'bot' as const };

describe('normalizeActivities', () => {
  it('text-only turn', () => {
    const activities: Activity[] = [
      { type: 'message', text: 'Hello!', from: BOT_FROM },
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ role: 'assistant', kind: 'text', text: 'Hello!' });
  });

  it('card-only turn', () => {
    const activities: Activity[] = [{
      type: 'message',
      from: BOT_FROM,
      attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { type: 'AdaptiveCard' } }],
    }];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ role: 'assistant', kind: 'adaptiveCard' });
    expect(result[0].cardJson).toEqual({ type: 'AdaptiveCard' });
    expect(result[0].cardId).toBeDefined();
  });

  it('hybrid turn (text + card)', () => {
    const activities: Activity[] = [{
      type: 'message',
      text: 'Here is a card:',
      from: BOT_FROM,
      attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { type: 'AdaptiveCard' } }],
    }];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ kind: 'text', text: 'Here is a card:' });
    expect(result[1]).toMatchObject({ kind: 'adaptiveCard' });
  });

  it('skips non-message activity types', () => {
    const activities: Activity[] = [
      { type: 'typing', from: BOT_FROM },
      { type: 'endOfConversation', from: BOT_FROM },
      { type: 'message', text: 'Hi', from: BOT_FROM },
    ];
    const result = normalizeActivities(activities);
    expect(result).toHaveLength(1);
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| `useState` for async multi-step state | `useReducer` with dispatched actions | Standard since React Hooks RFC; prevents stale closures |
| `adaptivecards-react` | Custom `useRef`/`useEffect` wrapper | Already decided in Phase 1; out of scope for Phase 2 |
| Manual `XHR`/`axios` for fetch | Native `fetch` + `AbortController` | Fetch available since Node 18; client is browser |
| `react-query` / SWR | Custom `useChatApi` hook | UI-09 requires a custom hook; react-query is overkill for 2 endpoints |

---

## Open Questions

1. **SDK internal conversationId access**
   - What we know: `CopilotStudioClient.conversationId` is `private` (from type definition). After `startConversationStreaming` completes, the SDK internally knows the Copilot conversation ID via response headers (`x-ms-bot-conversationid` or similar).
   - What's unclear: Whether there's a public accessor for the post-start conversationId, or whether we must pass `conversationId` explicitly to `sendActivityStreaming`.
   - Recommendation: For Phase 2, use the singleton pattern — after `start`, call `send` on the same singleton without passing `conversationId`. Document as single-conversation. If explicit passing is needed, intercept via a subclass or wrapper.

2. **Character limit for Copilot Studio**
   - What we know: No documented hard limit found in the SDK type definitions.
   - Recommendation: Use 4000 characters as a safe default (well under any internal limits). Surface a counter UI only when within 10% of limit.

3. **Auto-scroll behavior**
   - Recommendation: "Smart scroll" — auto-scroll to bottom when the user is already at/near the bottom; don't force-scroll when user has manually scrolled up to review history.

---

## Sources

### Primary (HIGH confidence)
- Installed package types: `/node_modules/@microsoft/agents-copilotstudio-client/dist/src/copilotStudioClient.d.ts` — `sendActivityStreaming` signature
- Installed package types: `/node_modules/@microsoft/agents-activity/dist/src/activity.d.ts` — `Activity` interface, `Attachment` interface
- Installed package types: `/node_modules/@microsoft/agents-activity/dist/src/activityTypes.d.ts` — `ActivityTypes.Message = "message"`
- Project source: `shared/src/schemas/message.ts` — `NormalizedMessageSchema` (target output shape)
- Project source: `server/src/routes/chat.ts` — existing start route pattern
- Project source: `server/src/store/ConversationStore.ts` — `sdkConversationRef` typed as `unknown`
- Project source: `client/vite.config.ts` — `/api` proxy already configured

### Secondary (MEDIUM confidence)
- React 18 `useReducer` pattern — official React docs
- Vitest test discovery — official Vitest docs (no config file required for basic `*.test.ts` discovery)

---

## Metadata

**Confidence breakdown:**
- Activity normalization logic: HIGH — verified from installed type definitions
- React patterns (useReducer, hooks): HIGH — standard patterns
- SDK conversationId handling: MEDIUM — private field, behavior inferred from pattern
- Character limit: LOW — no official source found; using conservative default

**Research date:** 2026-02-19
**Valid until:** 2026-03-20 (stable stack, 30-day window)

---

## RESEARCH COMPLETE

**Phase:** 2 - Text Chat End-to-End
**Confidence:** HIGH

### Key Findings
- `sendActivityStreaming(activity, conversationId?)` is the correct SDK method for Phase 2; pass `undefined` for the Phase 2 singleton pattern
- Only `type === "message"` activities should be normalized; `typing`, `endOfConversation`, `event`, `trace` must be discarded
- Hybrid turns (text + Adaptive Card attachment in one Activity) are handled by producing multiple `NormalizedMessage` objects from one Activity
- Vitest is already installed; no config file needed; tests go in `server/src/normalizer/activityNormalizer.test.ts`
- No new npm dependencies required — the full Phase 2 stack is already installed

### File Created
`.planning/phases/02-text-chat-end-to-end/02-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| SDK Activity types | HIGH | Verified from installed package type definitions |
| Normalizer logic | HIGH | Derived directly from Activity + NormalizedMessage types |
| React UI patterns | HIGH | Standard React 18 patterns |
| Vitest setup | HIGH | Already installed and configured |
| SDK conversation ID | MEDIUM | Private field; behavior inferred |

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
