# Feature Research

**Domain:** Enterprise chat UI — Copilot Studio + Adaptive Cards (React/Node, custom canvas)
**Researched:** 2026-02-19
**Confidence:** MEDIUM-HIGH (official Microsoft docs + multi-source verification; some UI-pattern claims from WebSearch only)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken or incomplete. Enterprise users abandon products that fail these.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Message bubble transcript | Every chat product in existence has distinguishable user vs. bot message display | LOW | User bubbles right-aligned or labeled; bot bubbles left-aligned. Required for basic usability. |
| Optimistic user message display | Users expect to see their message appear instantly; waiting for server confirmation feels broken | LOW | Render user bubble immediately on send; reconcile on server response. React `useOptimistic` (React 19) or local state pattern. |
| Typing / thinking indicator | Users need feedback the agent is working; without it they think the app crashed | LOW | Animated indicator (spinner or pulsing dots) while awaiting Copilot Studio response. |
| Loading skeletons for bot responses | Skeleton screens reduce perceived wait vs. blank space | LOW-MED | Shimmer skeleton in bot bubble position while response streams or arrives. |
| Error toasts / send failure feedback | Network errors and API failures must surface to the user | LOW | Non-blocking toast for transient errors. Inline error state on the failed bubble (retry affordance). |
| Adaptive Card rendering in transcript | Core product requirement — cards are the primary interaction modality | MED | `adaptivecards-react` renders card JSON inline in the transcript. Bot Framework Web Chat does this out of the box; custom canvas must implement manually. |
| Submitted card disabled after action | Copilot Studio docs explicitly warn that cards allow multiple submits by default; disabling after submit is the expected pattern | MED | Cards must be visually disabled + non-interactive after submit to prevent double submission. Requires custom attachment renderer (per BotFramework-WebChat #1427). |
| Submitted card pending state | User needs to know the submission is processing | LOW | Spinner or "Submitting…" overlay on card actions after click, before server response. |
| Hybrid turn rendering (text + card in same message) | Agent responses often combine a text preamble with a card; rendering them as a unified turn is expected | MED | Bot activity can contain both `text` and `attachments`. Normalizer must extract both; UI must render them sequentially within one turn. |
| Send box with text input | Basic text input for free-form conversation | LOW | Textarea or input; submit on Enter (with Shift+Enter for newline) or Send button. |
| Conversation start / new conversation | Users need to start a fresh session; expected from all chat products | LOW | Triggers `/api/chat/start`; clears transcript; Copilot issues a new conversationId. |
| Responsive layout (360px – 1280px+) | Mobile-first is a given; PROJECT.md specifies this range | MED | Single-column mobile layout. Desktop can add split pane (transcript + metadata drawer). Adaptive Cards must not use fixed-pixel-wide multi-column layouts on mobile. |
| Dark / light mode | Dark mode is table stakes as of 2025 for any consumer or enterprise app | LOW-MED | `prefers-color-scheme` media query drives default; manual toggle persists preference to localStorage. CSS custom properties for color tokens. |
| Reduced-motion respect | Accessibility requirement; WCAG 2.2 Level AA (EAA in force June 2025) | LOW | `prefers-reduced-motion: reduce` disables typing indicator animation, skeleton shimmer, and card transition animations. |
| Keyboard navigation throughout | WCAG 2.1/2.2 requirement; enterprise legal exposure | MED | Focus trap handled correctly in send box. All interactive elements (buttons, card actions) reachable via Tab. Card submit buttons keyboard-activatable. |
| Screen reader support (ARIA live regions) | WCAG 2.1 SC 4.1.3 (Status Messages); enterprise accessibility mandates | MED | Transcript container as `aria-live="polite"` region. New bot messages announced. Card submit confirmation announced. Error toasts announced. |
| Avatar / sender identity | Standard visual pattern to distinguish user vs. agent in transcript | LOW | Bot avatar image or initials; user avatar or initials. Copilot Studio default canvas uses `botAvatarImage` / `userAvatarImage` styleOptions. |
| Timestamp display | Users orient in time; enterprise audit expectations | LOW | Relative time ("just now", "2 min ago") toggling to absolute on hover. |

---

### Differentiators (Competitive Advantage)

Features that set this product apart from stock Copilot Studio canvas or generic chat UIs. These align with the project's core value proposition.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Split-pane desktop layout (transcript + metadata drawer) | Surfaces context (card action history, conversation metadata) without leaving the chat; no comparable in default Copilot Studio canvas | MED | Side drawer on desktop (≥768px breakpoint). Collapses to bottom sheet or hidden panel on mobile. |
| Timeline sidebar summarizing completed card actions | Audit trail of structured interactions visible at a glance; unique to this product vs. default canvas | MED | Lists submitted cards with timestamp, action type, summary of values. Depends on: Adaptive Card rendering + card action tracking. |
| Activity log download (JSON) | Enterprise auditability and debugging capability; differentiates from stock canvas | LOW-MED | Serializes normalized message array to JSON. Single button download. Depends on: normalized message schema (Zod). |
| Card action allowlist enforcement (client-side) | Defense-in-depth against malicious card payloads; not a feature of default Copilot Studio canvas | MED | Client validates action type + data against allowlist before sending to `/api/chat/card-action`. Server re-validates (both layers). `Action.OpenUrl` domain allowlist prevents phishing via bot-delivered URLs. |
| Normalized message schema (Zod, shared) | Type-safe contract between client and server; prevents entire class of runtime bugs | MED | `shared/` package with Zod schemas; both client and server import. Differentiates from ad-hoc message handling in typical implementations. |
| MSAL On-Behalf-Of token flow stubs | Architecturally correct placeholder for enterprise SSO; signals production-readiness | LOW-MED | TODO-commented stub in server auth middleware. Teaches the integration pattern. Not functionally active in v1. |
| Adaptive Cards playbook documentation | Provides a card registration pattern so future cards can be added predictably | LOW | Markdown doc in repo. Describes schema validation, allowlist registration, test patterns. Not common in reference implementations. |
| Reduced-motion + accessible animations | Exceeds what most Copilot Studio custom canvas implementations bother to implement | LOW | See table stakes; elevated to differentiator because it's uncommon in practice even when required. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create complexity, security risk, or scope creep without proportionate value for v1.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Real-time streaming token-by-token response | Feels "alive" like ChatGPT; users ask for it | Requires SSE or WebSocket infrastructure; Copilot Studio SDK does not natively stream token-by-token (it returns complete activities); significant server + client complexity for v1 | Use loading skeleton + optimistic display to manage perceived wait; revisit streaming in v2 if SDK supports it |
| Conversation history / multi-session persistence | "I want to pick up where I left off" | Requires a persistent store (DB), a session identity model, and surfacing history UI; Copilot Studio conversationId is single-session; cross-session requires bot state APIs | Scope explicitly out of v1; log download covers the audit use case |
| File / image upload in send box | Users want to attach files to agent requests | Copilot Studio standard Web Chat supports it but custom canvas proxy must handle multipart; adds attack surface and complexity; not in project requirements | Keep send box to text + card-action only |
| Suggested replies / quick reply chips | Chat products show them; reduces typing friction | Copilot Studio can emit `suggestedActions` but mapping them reliably through the custom proxy is non-trivial; adds UI complexity for uncertain benefit | Defer; implement only if Copilot Studio topics specifically produce suggestedActions |
| Full markdown parser in bot bubbles | Rich formatting expected from AI chat products | Requires a markdown library (e.g. `react-markdown`); introduces XSS risk if not sanitized; Adaptive Cards already handle structured content better than markdown in cards | Use a well-known sanitized markdown renderer (e.g. `react-markdown` + `rehype-sanitize`) only if bot responses actually use markdown in practice; do not default-enable |
| Voice input / speech-to-text | Modern AI interfaces support voice | Out of scope per PROJECT.md; adds browser permission complexity, audio processing, and accessibility edge cases that dwarf the benefit | Note as future milestone; stub the UI affordance if desired |
| Full conversation thread branching / editing | Users want to edit a past message and regenerate | No native support in Copilot Studio SDK for mid-conversation mutation; rewriting history causes state divergence | Not applicable; this is a turn-based bot protocol |
| Real-time multi-user shared conversation | "Collaborative" agent sessions | Requires WebSocket broadcast, conflict resolution, and identity scoping; far outside project constraints | Single-user session per conversationId is the correct model |

---

## Feature Dependencies

```
[Conversation Start / new conversationId]
    └──required by──> [Message Send (text)]
    └──required by──> [Card Action Submit]
                          └──required by──> [Card Disabled/Pending State]
                          └──required by──> [Timeline Sidebar]
                          └──required by──> [Activity Log Download]

[Adaptive Card Rendering]
    └──required by──> [Card Action Submit]
    └──required by──> [Card Disabled/Pending State]
    └──required by──> [Card Action Allowlist Enforcement]
    └──required by──> [Hybrid Turn Rendering (text + card)]

[Normalized Message Schema (Zod)]
    └──required by──> [Activity Log Download]
    └──required by──> [Timeline Sidebar]
    └──required by──> [Hybrid Turn Rendering]
    └──required by──> [Error Toast / Send Failure]

[Optimistic User Bubble]
    └──enhances──> [Error Toast / Send Failure] (rollback pattern)

[Keyboard Navigation]
    └──enhances──> [Card Action Submit] (card buttons must be keyboard-reachable)
    └──enhances──> [Send Box]

[ARIA Live Regions]
    └──enhances──> [Error Toast]
    └──enhances──> [Bot Response Display]
    └──enhances──> [Card Submit Confirmation]

[Dark / Light Mode (CSS tokens)]
    └──enhances──> [Adaptive Card Rendering] (Adaptive Cards adapt to host theme via CSS variable injection)

[Reduced-Motion]
    └──conflicts──> [Typing Indicator Animation] (must be suppressed)
    └──conflicts──> [Skeleton Shimmer] (must be suppressed)
```

### Dependency Notes

- **Card Action Submit requires Adaptive Card Rendering:** The card must be rendered and interactive before a submit action can be dispatched.
- **Timeline Sidebar requires Card Action tracking:** Card submissions must be stored in normalized state to surface in the sidebar; this is downstream of both Zod schema and card action handling.
- **Activity Log Download requires Normalized Schema:** The download is a serialization of the normalized message array; schema correctness is a prerequisite.
- **Card Disabled State requires custom renderer:** Bot Framework Web Chat does not disable cards after submit by default. A custom attachment middleware or renderer override is required (BotFramework-WebChat issue #1427).
- **Dark Mode enhances Adaptive Card rendering:** Adaptive Cards inherit host theme variables; consistent CSS custom properties allow the host theme toggle to flow into card rendering without per-card overrides.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed for the core value proposition to work end to end.

- [ ] Message bubble transcript with user/bot distinction — without this there is no chat
- [ ] Optimistic user bubble + loading skeleton — eliminates perceived broken state during async calls
- [ ] Typing indicator — basic async feedback
- [ ] Error toast with inline bubble error state — required for any production use
- [ ] Adaptive Card rendering (adaptivecards-react, version 1.5) — core modality for this product
- [ ] Card disabled + pending state after submit — prevents double-submission bug Copilot Studio docs explicitly warn about
- [ ] Hybrid turn rendering (text + card in one bot activity) — agents routinely return both
- [ ] Conversation start / new conversation — without this there is no session
- [ ] Responsive layout 360px–1280px — PROJECT.md hard requirement
- [ ] Dark / light mode toggle + prefers-color-scheme default — table stakes in 2025/2026
- [ ] Reduced-motion respect — accessibility and EAA compliance
- [ ] Keyboard navigation + basic ARIA live regions — WCAG 2.2 Level AA (legally required in EU since June 2025)
- [ ] Card action allowlist enforcement (client + server) — security requirement from PROJECT.md
- [ ] Normalized Zod message schema (shared package) — all downstream features depend on this
- [ ] Activity log download (JSON) — audit use case; low complexity, high enterprise value

### Add After Validation (v1.x)

Add once the core is working and producing real usage data.

- [ ] Timeline sidebar (desktop) — valuable but requires card action tracking to be stable first; trigger: users request history review
- [ ] MSAL OBO token flow (real, not stub) — trigger: moving to production deployment with real user identities
- [ ] Suggested replies rendering — trigger: Copilot Studio topics actually emit suggestedActions
- [ ] Markdown rendering in bot bubbles — trigger: real bot responses use markdown and users notice missing formatting

### Future Consideration (v2+)

Defer until product-market fit is established and requirements are clearer.

- [ ] Conversation history / multi-session persistence — requires DB + session identity model; validate demand first
- [ ] Voice input — significant scope increase; browser permissions + audio processing
- [ ] Token-by-token streaming responses — only viable if Copilot Studio SDK adds native streaming support
- [ ] Collaborative / shared sessions — architecture change; validate use case first

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Message bubble transcript | HIGH | LOW | P1 |
| Adaptive Card rendering | HIGH | MEDIUM | P1 |
| Card disabled/pending after submit | HIGH | MEDIUM | P1 |
| Hybrid turn (text + card) | HIGH | MEDIUM | P1 |
| Optimistic user bubble | HIGH | LOW | P1 |
| Error toast + inline error | HIGH | LOW | P1 |
| Responsive layout (360–1280px) | HIGH | MEDIUM | P1 |
| Normalized Zod schema | HIGH | MEDIUM | P1 |
| Card action allowlist (client + server) | HIGH | MEDIUM | P1 |
| Keyboard navigation | HIGH | MEDIUM | P1 |
| ARIA live regions | HIGH | MEDIUM | P1 |
| Dark / light mode toggle | HIGH | LOW | P1 |
| Reduced-motion respect | MEDIUM | LOW | P1 |
| Loading skeleton | MEDIUM | LOW | P1 |
| Typing indicator | MEDIUM | LOW | P1 |
| Activity log download | HIGH | LOW | P1 |
| Timeline sidebar (desktop) | MEDIUM | MEDIUM | P2 |
| MSAL OBO stubs | MEDIUM | LOW | P1 (stub only) |
| Suggested replies | LOW | MEDIUM | P3 |
| Markdown in bot bubbles | MEDIUM | LOW | P2 |
| Conversation history (multi-session) | MEDIUM | HIGH | P3 |
| Voice input | LOW | HIGH | P3 |
| Streaming responses | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Copilot Studio Default Canvas (Bot Framework Web Chat) | ChatGPT Enterprise | Our Approach |
|---------|--------------------------------------------------------|--------------------|--------------|
| Adaptive Cards rendering | Built-in; all action types supported | Not applicable (no AC) | Custom renderer with pending/disabled state overrides |
| Card disabled after submit | NOT built-in; requires custom middleware | N/A | Custom attachment renderer (P1 requirement) |
| Hybrid text + card turns | Supported natively in Web Chat | N/A | Normalizer extracts both from activity; renders sequentially |
| Split-pane / sidebar | Not available in default canvas | Sidebar panels (canvas, artifacts) | Desktop split pane + metadata drawer (differentiator) |
| Activity / audit log | Not available | Partial (admin conversation history) | JSON download of normalized activity log |
| Dark mode | Configurable via styleOptions | Yes, native | CSS custom properties + toggle + prefers-color-scheme |
| Responsive mobile | Fixed 450px widget by default | Yes, native app | Full viewport responsive from 360px |
| Accessibility (ARIA) | Partial in Bot Framework Web Chat | Partial | Full WCAG 2.2 AA: live regions, keyboard nav |
| Action allowlist (security) | Not built-in; must be custom | Server-side only | Both client validation + server enforcement |
| Conversation restart | Built-in restart button in custom canvas sample | "New Chat" button | Explicit new conversation trigger with transcript clear |

---

## Sources

- Microsoft Copilot Studio — Adaptive Cards overview (official docs, updated 2025-12-22):
  https://learn.microsoft.com/en-us/microsoft-copilot-studio/adaptive-cards-overview
- Microsoft Copilot Studio — Customize the default canvas (official docs, updated 2025-12-19):
  https://learn.microsoft.com/en-us/microsoft-copilot-studio/customize-default-canvas
- Microsoft Teams — Designing Adaptive Cards for your app (official docs, updated 2025-04-04):
  https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/design-effective-cards
- BotFramework-WebChat GitHub issue #1427 — Disable Adaptive Cards after submit/obsoleted:
  https://github.com/Microsoft/BotFramework-WebChat/issues/1427
- WCAG 2.2 compliance (European Accessibility Act in force June 28, 2025):
  https://www.w3.org/WAI/standards-guidelines/wcag/new-in-21/
- Conversational AI UI comparison 2025 (IntuitionLabs — competitor feature analysis):
  https://intuitionlabs.ai/articles/conversational-ai-ui-comparison-2025
- Optimistic UI pattern with React useOptimistic:
  https://www.freecodecamp.org/news/how-to-use-the-optimistic-ui-pattern-with-the-useoptimistic-hook-in-react/
- ARIA live regions for chat interfaces:
  https://www.allaccessible.org/blog/implementing-aria-labels-for-web-accessibility
- Action.OpenUrl domain allowlist security (BotFramework-WebChat issue #3225):
  https://github.com/microsoft/BotFramework-WebChat/issues/3225
- Adaptive Cards design best practices hub:
  https://adaptivecards.microsoft.com/?topic=design-best-practices

---

*Feature research for: Enterprise chat UI — Copilot Studio + Adaptive Cards (React/Node, custom canvas)*
*Researched: 2026-02-19*
