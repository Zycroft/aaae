# Phase 3: Adaptive Cards + Accessibility + Theming - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Adaptive Cards render inline in the chat transcript and submit card actions through the validated server proxy (allowlist-enforced). The full UI meets WCAG 2.2 Level AA. Dark/light theme with persistence and system-preference detection. Responsive layout from 360px to 1280px with single-column mobile and split-pane desktop. Metadata drawer content (Phase 4) is out of scope — only the layout slot is reserved.

</domain>

<decisions>
## Implementation Decisions

### Card Visual Integration
- Claude's discretion on all visual decisions: bubble-style vs widget container, labeling/header, card width, and whether to inherit app theme tokens or use an isolated card scheme

### Post-Action Card States
- Claude's discretion on: pending state treatment (spinner on button, overlay, or dim), success state behavior (stay/lock vs collapse), error state placement (inside card, chat message, or toast), and locked card visual indicator

### Theme Behavior
- Default theme: follow system `prefers-color-scheme` — dark OS gets dark, light OS gets light
- Theme preference saved to **localStorage** — persists across browser sessions
- Reduced motion: Claude picks the most accessible interpretation (applies to all animation including skeleton pulses)
- Toggle placement: Claude's discretion on location that doesn't compete with the chat interface

### Responsive Layout
- Desktop split-pane reserves the **right-side pane as a placeholder for the Phase 4 metadata drawer** — layout architecture must support the drawer being filled in without rework
- Mobile input sticky behavior: Claude's discretion (standard mobile chat pattern)
- Single-column/split-pane breakpoint: Claude's discretion based on the 360px–1280px requirement
- Adaptive Card overflow at 360px: Claude's discretion (more accessible option preferred)

### Claude's Discretion
- All card visual styling (appearance, width, labels, theme integration)
- All card state visual treatments (pending, success/lock, error, submitted indicator)
- Theme toggle placement
- Reduced motion scope (all animation vs transitions only)
- Mobile input sticky behavior
- Responsive breakpoint selection
- Card overflow behavior at narrow widths

</decisions>

<specifics>
## Specific Ideas

- No specific references or "I want it like X" requirements — open to standard approaches on all visual and interaction decisions
- The one structural constraint: desktop layout must reserve the right pane slot for the Phase 4 metadata drawer from the start

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-adaptive-cards-accessibility-theming*
*Context gathered: 2026-02-20*
