# Phase 2: Text Chat End-to-End - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Full proxy chain for plain-text conversations: client sends a message, server proxies to Copilot Studio, normalizer converts activities, transcript renders user/bot bubbles with optimistic updates and error handling. Adaptive Cards, accessibility, theming, and all other capabilities are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Bubble design
- Avatar icons (initials or icon) shown for both user and bot bubbles
- No timestamps on messages
- Alignment and visual feel (pill vs card, color palette): Claude's discretion — pick whatever fits the overall app aesthetic

### Input behavior
- Enter to send + a visible Send button (belt and suspenders — button makes action discoverable)
- Input auto-resizes vertically up to a max height, then scrolls within the box
- Input is disabled while the bot is responding (prevent message flooding / queuing)
- Character limit: Claude's discretion — based on Copilot Studio's practical constraints

### Loading & skeleton states
- While waiting for the bot: skeleton placeholder row + animated typing dots inside it
- Optimistic user bubble appears immediately on send with a subtle "sending" indicator
- Loading indicator delayed ~300ms after send (avoids flicker on fast responses)
- Auto-scroll behavior: Claude's discretion

### Error & retry UX
- Errors displayed inline below the failed user bubble (contextual, tied to the message)
- Auto-retry silently up to N times, then surface the error inline
- Retry bubble appearance during silent retries: Claude's discretion
- Final error state actions (retry button, dismiss, etc.): Claude's discretion

### Claude's Discretion
- Message bubble alignment (user right / bot left, or both left)
- Bubble visual style (pill vs subtle card, exact colors)
- Character limit value
- Auto-scroll logic (always vs smart scroll)
- Number of silent retry attempts
- Visual state of user bubble during silent retry
- Actions shown after all retries exhausted

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-text-chat-end-to-end*
*Context gathered: 2026-02-19*
