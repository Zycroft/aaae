---
phase: 03-adaptive-cards-accessibility-theming
plan: "04"
subsystem: client
tags: [client, react, adaptivecards, adaptive-cards, hook, typescript]

requires:
  - 03-01 (server POST /api/chat/card-action route with allowlist)

provides:
  - client/src/components/AdaptiveCardMessage.tsx: Adaptive Card renderer (useRef/useEffect, SDK v3, single-submit guard)
  - client/src/api/chatApi.ts: sendCardAction() fetch wrapper for /api/chat/card-action
  - client/src/hooks/useChatApi.ts: cardAction() function + CARD_ACTION_SUCCESS reducer + subKind:'cardSubmit' type field
  - client/src/components/MessageBubble.tsx: renders AdaptiveCardMessage for adaptiveCard kind; .cardSubmitChip for UI-10
  - client/src/components/TranscriptView.tsx: passes onCardAction prop to each MessageBubble
  - client/src/components/ChatShell.tsx: wires cardAction from useChatApi into TranscriptView

affects:
  - Phase 3 Plan 03-05 (accessibility pass on the same components)

tech-stack:
  added:
    - adaptivecards@3.0.5
  patterns:
    - "useRef/useEffect rendering pattern — AdaptiveCards SDK renders into a div ref, not JSX"
    - "submittedRef (not state) prevents stale-closure double-fire on first click"
    - "submitted state drives visual overlay (.cardPendingOverlay) independently of ref"
    - "subKind:'cardSubmit' on TranscriptMessage distinguishes chip from regular text bubble"
    - "CARD_ACTION_SUCCESS reducer mirrors SEND_SUCCESS — marks optimistic chip sent, appends bot messages"
    - "onCardAction callback flows: ChatShell → TranscriptView → MessageBubble → AdaptiveCardMessage"

key-files:
  created:
    - client/src/components/AdaptiveCardMessage.tsx
  modified:
    - client/src/api/chatApi.ts
    - client/src/hooks/useChatApi.ts
    - client/src/components/MessageBubble.tsx
    - client/src/components/TranscriptView.tsx
    - client/src/components/ChatShell.tsx

key-decisions:
  - "onCardAction omitted from useEffect deps in AdaptiveCardMessage — callback captured via closure, card re-render would break submit guard"
  - "submittedRef used (not just submitted state) to prevent race condition where second click fires before setSubmitted re-renders"
  - "cardAction uses SEND_ERROR action (not a separate CARD_ACTION_ERROR) — reuses existing error display path in MessageBubble"
  - "userSummary derived from cardJson.title, first TextBlock, or fallback 'Card {cardId}' — no custom UI needed"

requirements-completed:
  - UI-06
  - UI-07
  - UI-08
  - UI-10

duration: 4 min
completed: 2026-02-20
---

# Phase 3 Plan 04: AdaptiveCardMessage + Card Action Hook Summary

**Adaptive Card rendering wired end-to-end: SDK renders interactive HTML cards, single-submit guard prevents double-fire, submitted card shows pending overlay, card submission dispatches a .cardSubmitChip transcript entry and POSTs to /api/chat/card-action with retry. TypeScript clean, all 22 tests pass.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-20T17:09:00Z
- **Completed:** 2026-02-20T17:13:00Z
- **Tasks:** 2
- **Files created/modified:** 6

## Accomplishments

- `client/src/components/AdaptiveCardMessage.tsx`: full adaptive card renderer
  - `new AdaptiveCards.AdaptiveCard()` with hostConfig (system font stack)
  - `ac.parse(message.cardJson)` + `ac.render()` appended into `containerRef.current`
  - `onExecuteAction` handler extracts `Action.Submit` data and `Action.OpenUrl` url
  - `submittedRef.current` guard prevents double-fire across re-renders
  - `submitted` state drives `.cardPendingOverlay` visual and `.submitted` CSS class
  - Error catch renders `<p class="cardRenderError">Card failed to render.</p>`
  - Cleanup: `containerRef.current.innerHTML = ''` on unmount
- `client/src/api/chatApi.ts`: `sendCardAction()` POSTs `{ conversationId, cardId, userSummary, submitData }` to `/api/chat/card-action`
- `client/src/hooks/useChatApi.ts`:
  - `TranscriptMessage` extended with `subKind?: 'cardSubmit'`
  - `CARD_ACTION_SUCCESS` action type added and handled in reducer
  - `cardAction(cardId, userSummary, submitData)` function: optimistic chip, 300ms skeleton, retry, success/error dispatch
  - `cardAction` added to hook return object
- `client/src/components/MessageBubble.tsx`:
  - Renders `<AdaptiveCardMessage>` for `kind === 'adaptiveCard'`
  - Renders `<span className="cardSubmitChip">` for `kind === 'text' && subKind === 'cardSubmit'`
  - `onCardAction` prop added and passed to `AdaptiveCardMessage`
- `client/src/components/TranscriptView.tsx`: `onCardAction` prop threaded through to each `<MessageBubble>`
- `client/src/components/ChatShell.tsx`: `cardAction` destructured from `useChatApi()`, passed as `onCardAction` to `<TranscriptView>`

## Task Commits

1. **Task 1:** `cbad0b2` (feat) — install adaptivecards, create AdaptiveCardMessage component
2. **Task 2:** `59b7ce2` (feat) — sendCardAction in chatApi, cardAction in useChatApi, MessageBubble/TranscriptView/ChatShell wiring

## Deviations from Plan

None — implemented exactly per plan spec.

## Self-Check: PASSED

- `client/src/components/AdaptiveCardMessage.tsx` ✓ exists with useRef/useEffect pattern
- `grep "sendCardAction" client/src/api/chatApi.ts` ✓ found
- `grep "cardAction" client/src/hooks/useChatApi.ts` ✓ found (function + return)
- `grep "AdaptiveCardMessage" client/src/components/MessageBubble.tsx` ✓ found
- `grep "cardSubmitChip" client/src/components/MessageBubble.tsx` ✓ found
- `cd client && npx tsc --noEmit` ✓ exits 0
- `npm test` ✓ exits 0 (22 tests pass)
