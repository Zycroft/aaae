---
phase: 21
plan: 01
status: complete
completed: 2026-02-22
---

# Plan 21-01 Summary: ChatInput Dynamic Input Modes (TDD)

## What was built
Extended ChatInput component with dynamic input modes driven by `suggestedInputType` and `choices` props:
- **Choice mode**: Clickable pill buttons above textarea, each sends choice text via `onSend`
- **Confirmation mode**: Yes (primary) and No buttons above textarea
- **Disabled/none mode**: Textarea disabled with "Waiting for workflow..." status message
- **Free-text fallback**: Textarea always visible and enabled in choice and confirmation modes
- **Overflow handling**: >6 choices shows first 6 with "Show more" toggle

## Key files
- `client/src/components/ChatInput.tsx` — Extended with suggestedInputType, choices props
- `client/src/components/ChatInput.test.tsx` — 7 unit tests covering all modes
- `client/src/components/chat.css` — Choice pill, confirmation, disabled status CSS

## Test results
- 7/7 tests pass (default, choice, overflow, confirmation, disabled, choice fallback, confirmation fallback)
- TypeScript build clean

## Requirements fulfilled
- INPUT-01: Choice pills render and send choice text
- INPUT-02: Confirmation Yes/No buttons
- INPUT-03: Disabled state with status message
- INPUT-04: Free-text fallback always available
- INPUT-05: Overflow toggle and keyboard accessibility
- TEST-02: Unit tests for all input modes
