---
phase: 03-adaptive-cards-accessibility-theming
plan: "02"
subsystem: client
tags: [css, theme, dark-mode, typography, accessibility, react, typescript]

requires: []

provides:
  - client/src/hooks/useTheme.ts: useTheme() hook with localStorage + system preference detection
  - client/src/components/ThemeToggle.tsx: Theme toggle button (☾/☀, aria-label)
  - client/src/components/chat.css: Full CSS token system with :root, [data-theme=dark], reduced-motion

affects:
  - Phase 3 Plan 03-03 (layout CSS already included in chat.css; ChatShell already has appLayout)
  - Phase 3 Plan 03-04 (AdaptiveCard CSS classes pre-written in chat.css)
  - Phase 3 Plan 03-05 (focus-visible rules, sr-only, reduced-motion already in chat.css)

tech-stack:
  added: []
  patterns:
    - "document.documentElement.dataset.theme = theme — CSS [data-theme=dark] selector triggers token swap"
    - "localStorage key 'chatTheme' — persists 'dark'|'light' string"
    - "getSystemTheme(): window.matchMedia('(prefers-color-scheme: dark)').matches"
    - "getInitialTheme(): localStorage ?? system preference"
    - "clamp(min, vw, max) for fluid typography on --font-size-* tokens"
    - "@media (prefers-reduced-motion: reduce) with !important overrides on all animation/transition"
    - "position: absolute ThemeToggle anchored to position: relative ChatShell"

key-files:
  created:
    - client/src/hooks/useTheme.ts
    - client/src/components/ThemeToggle.tsx
  modified:
    - client/src/components/chat.css (complete rewrite with design tokens)
    - client/src/components/ChatShell.tsx (added useTheme, ThemeToggle, appLayout grid)

key-decisions:
  - "☾ (dark toggle icon) / ☀ (light toggle icon) — no external icon library needed"
  - "Chat.css also pre-includes UI-01 layout CSS (.appLayout, .chatPane, .metadataPane) and Phase 3 card/a11y classes — ChatShell updated to use appLayout structure immediately"
  - "STORAGE_KEY = 'chatTheme' — simple, unlikely to conflict with other apps"
  - "Default theme: system preference — dark OS → dark app, light OS → light app per CONTEXT.md decision"

requirements-completed:
  - UI-13
  - UI-14
  - UI-15

duration: 2 min
completed: 2026-02-20
---

# Phase 3 Plan 02: CSS Design Tokens + Dark/Light Theme + Reduced-Motion Summary

**chat.css fully refactored with 60 CSS custom properties (light + dark themes), fluid typography via clamp(), prefers-reduced-motion, focus-visible rings; useTheme hook manages localStorage persistence + system preference; ThemeToggle button wired into ChatShell with aria-label; appLayout responsive grid included. TypeScript clean.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T17:09:42Z
- **Completed:** 2026-02-20T17:12:02Z
- **Tasks:** 2
- **Files modified:** 4 (2 new, 2 modified)

## Accomplishments

- `chat.css`: Complete token system — :root (light) with 25 color vars, [data-theme="dark"] with 25 dark overrides, --font-size-* clamp() vars, --space-* scale, --transition-base. All 57 color usages via var(--color-*). prefers-reduced-motion kills all animations/transitions. :focus-visible global rule. .sr-only utility. Also pre-included: .appLayout / .chatPane / .metadataPane (responsive grid), .adaptiveCardWrapper / .cardSubmitChip (Phase 3 card classes), .adaptiveCardContainer focus-visible overrides.
- `useTheme.ts`: useState(getInitialTheme), useEffect sets dataset.theme + localStorage, toggle() flips 'dark'↔'light'
- `ThemeToggle.tsx`: Button with aria-label="Switch to dark/light mode", ☾ in light mode, ☀ in dark mode
- `ChatShell.tsx`: Imports useTheme + ThemeToggle, renders appLayout grid (chatPane + aside.metadataPane), ThemeToggle above transcript

## Task Commits

1. **Tasks 1+2:** `315a78a` (feat) — CSS design tokens, dark/light theme, fluid typography, reduced-motion

## Deviations from Plan

**[Rule 3 - Efficiency] Combined Plan 03-02 + layout pre-work:** The CSS rewrite included all UI-01 layout classes (.appLayout, .chatPane, .metadataPane) and Plan 03-03/04/05 CSS classes in one shot — this avoids re-editing chat.css in subsequent plans. ChatShell.tsx also updated to appLayout structure immediately. Plan 03-03 will verify the layout works but requires no CSS changes.

## Self-Check: PASSED

- `client/src/hooks/useTheme.ts` ✓ exists, exports useTheme + Theme
- `client/src/components/ThemeToggle.tsx` ✓ exists
- `client/src/components/chat.css` ✓ has [data-theme="dark"], @media prefers-reduced-motion, 57 var(--color-*) usages
- `client/src/components/ChatShell.tsx` ✓ imports useTheme and ThemeToggle
- `cd client && npx tsc --noEmit` ✓ exits 0
- `git log --oneline --grep="03-02"` ✓ returns 1 commit
