---
status: complete
phase: 03-adaptive-cards-accessibility-theming
source: 03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md
started: 2026-02-20T18:00:00Z
updated: 2026-02-20T18:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Dark/Light Theme Toggle
expected: A theme toggle button (☾ or ☀) is visible in the chat UI. Clicking it switches between dark and light themes — colors change across the whole app. The icon flips between ☾ (light mode) and ☀ (dark mode).
result: pass

### 2. Theme Persists on Reload
expected: Switch to dark mode, then reload the page (Cmd+R / F5). The app reopens in dark mode — it remembered your preference via localStorage.
result: pass

### 3. System Preference on First Load
expected: Clear localStorage (DevTools → Application → Storage → Clear all), then reload. The app picks up your OS theme (System Preferences → Appearance) — dark OS gets dark app, light OS gets light app.
result: pass

### 4. Desktop Split-Pane Layout
expected: At a wide viewport (≥768px), the layout shows two columns: the chat pane on the left, and a right sidebar that reads "Activity log (Phase 4)" as a placeholder. Both panes are visible side by side.
result: pass

### 5. Mobile Single-Column Layout
expected: Resize the browser to ~360px wide (or use DevTools device emulation). The right sidebar disappears — only the chat column is shown. The layout is unbroken and usable at this width.
result: pass

### 6. Card Action Allowlist (403)
expected: Send a crafted POST to /api/chat/card-action with a disallowed action type. The server returns 403 and nothing is forwarded to Copilot Studio.
result: pass

### 7. Adaptive Card Renders and Submits
expected: When the bot responds with an Adaptive Card, it renders inline in the transcript with its interactive elements (buttons, inputs) visible and functional. Clicking Submit fires exactly one POST to /api/chat/card-action — the card immediately shows a pending overlay and all its elements become disabled. A "submitted" chip appears in the transcript.
result: pass

### 8. Focus-Visible Rings + ARIA Live Region
expected: Press Tab to navigate through the UI — the send button, theme toggle, and any card buttons each show a visible 2px focus ring when focused. The transcript div has role="log" and aria-live="polite".
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
