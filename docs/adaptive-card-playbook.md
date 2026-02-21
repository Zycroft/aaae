# Adaptive Cards Playbook

This guide shows you how to register, build, and wire a new Adaptive Card into the chat
system. You do not need to read source code — follow these four steps.

---

## Overview

Every Adaptive Card in the system is identified by a `cardId`. The server validates card
submissions against an allowlist before forwarding to Copilot Studio. This ensures:

- Only registered cards can be submitted
- Card submissions produce consistent summary text in the chat transcript
- Unrecognized or malformed card actions are rejected at the server boundary

The server allowlist lives in `server/src/allowlist/cardActionAllowlist.ts`. This file
controls which card IDs are accepted and how each card's submitted data is summarized in
the transcript.

---

## Step 1: Choose a Card ID

Pick a descriptive, lowercase, kebab-case identifier. This string must be unique across
all cards in the system.

**Good examples:**
- `approval-request`
- `feedback-survey`
- `resource-booking`
- `leave-request`

**Rules:**
- Lowercase only
- Hyphens as separators (no underscores, no spaces)
- Describes the card's purpose, not its visual appearance
- Must be unique — check existing entries in `cardActionAllowlist.ts`

---

## Step 2: Create the Card JSON

Save the Adaptive Card JSON to `docs/cards/{your-card-id}.json`. Use Adaptive Cards
schema version 1.5.

**Required structure:**

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [ ... ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Submit",
      "data": {
        "action": "Action.Submit",
        "cardId": "your-card-id"
      }
    }
  ]
}
```

**Critical:** The `data` object in `Action.Submit` MUST include both `action` and `cardId`
fields. The server uses `cardId` for allowlist lookup and action routing.

**Working example** (`docs/cards/feedback-survey.json`):

See `docs/cards/feedback-survey.json` for a complete card with `Input.ChoiceSet` and
optional `Input.Text`. The feedback-survey card:

- Uses `Input.ChoiceSet` with `style: "expanded"` for radio-button style selection
- Includes an optional free-text comment field with a 500-character limit
- Submits with `action: "Action.Submit"` and `cardId: "feedback-survey"`

**Design constraints:**
- Supported input types: `Input.Text`, `Input.Number`, `Input.ChoiceSet`, `Input.Toggle`,
  `Input.Date`
- Supported action: `Action.Submit` only (no `Action.OpenUrl` in card data for security)
- Max card body nesting: 3 levels
- Keep cards concise — the Adaptive Cards SDK renders inside the chat transcript column

---

## Step 3: Register the Card in the Server Allowlist

Open `server/src/allowlist/cardActionAllowlist.ts`.

The allowlist currently validates the `action` type field (must be `Action.Submit` or
`Action.OpenUrl`) and checks domains for `Action.OpenUrl`. To add per-card summary
formatting for the activity log sidebar, add a `userSummary` formatter following the
pattern established in this step.

**3a. Add a card summary formatter**

Add a new entry to the card summaries map. The formatter receives the raw `data` payload
from the card submission. Return a human-readable string (shown in the Activity Log
sidebar as the submission label).

```typescript
// Example entry to add to cardActionAllowlist.ts or a companion file
'feedback-survey': (data: unknown) => {
  const d = data as { satisfaction?: string; comments?: string };
  const labels: Record<string, string> = {
    '5': 'Very Satisfied',
    '4': 'Satisfied',
    '3': 'Neutral',
    '2': 'Dissatisfied',
    '1': 'Very Dissatisfied',
  };
  const rating = labels[d.satisfaction ?? ''] ?? 'No rating';
  return d.comments
    ? `Feedback: ${rating} — "${d.comments.slice(0, 60)}${d.comments.length > 60 ? '…' : ''}"`
    : `Feedback: ${rating}`;
},
```

**Summary string guidelines:**
- 80 characters or fewer (fits in transcript chip)
- Include the card's key submitted value(s)
- Truncate long free-text inputs with an ellipsis (`…`)
- Never include raw form field names — use human-readable labels

**3b. Verify no credential patterns in your changes**

The CI `security-checks` job will fail if any `COPILOT_*=` assignment patterns are found
in `client/` source code. Keep all auth logic in `server/` only.

---

## Step 4: Write a Test

Add test cases to `server/src/allowlist/cardActionAllowlist.test.ts` (or the equivalent
test file — see existing tests for the pattern).

```typescript
describe('feedback-survey card', () => {
  it('accepts a valid submission', () => {
    const submitData = {
      action: 'Action.Submit',
      cardId: 'feedback-survey',
      satisfaction: '5',
    };
    const result = validateCardAction(submitData);
    expect(result.ok).toBe(true);
  });

  it('generates correct summary for Very Satisfied', () => {
    // Call the summary formatter via the allowlist validation path
    // Follow existing test patterns in the file
    const summary = CARD_SUMMARIES['feedback-survey']({ satisfaction: '5' });
    expect(summary).toBe('Feedback: Very Satisfied');
  });

  it('truncates long comments', () => {
    const longComment = 'a'.repeat(100);
    const summary = CARD_SUMMARIES['feedback-survey']({
      satisfaction: '4',
      comments: longComment,
    });
    expect(summary).toContain('…');
  });

  it('rejects unknown action type', () => {
    const submitData = { action: 'Action.Unknown', cardId: 'feedback-survey' };
    const result = validateCardAction(submitData);
    expect(result.ok).toBe(false);
  });
});
```

Run `npm test` from the repo root to confirm all tests pass.

---

## Reference

### Card Input Types

| Type | Use For | Key Properties |
|------|---------|----------------|
| `Input.Text` | Short text, free-form | `id`, `placeholder`, `isMultiline`, `maxLength` |
| `Input.Number` | Numeric values | `id`, `min`, `max`, `placeholder` |
| `Input.ChoiceSet` | Multiple choice | `id`, `style` (compact/expanded), `choices[]`, `isRequired` |
| `Input.Toggle` | Yes/No boolean | `id`, `title`, `valueOn`, `valueOff` |
| `Input.Date` | Date selection | `id`, `min`, `max` |

### File Checklist

When adding a new card, ensure all of these exist or are updated:

- [ ] `docs/cards/{cardId}.json` — card schema JSON (v1.5)
- [ ] Entry in `server/src/allowlist/cardActionAllowlist.ts` — cardId summary formatter registered
- [ ] Test cases in `server/src/allowlist/cardActionAllowlist.test.ts`
- [ ] Card JSON committed and pushed (the server reads `cardId` from the submission payload,
      not from the JSON file — but committing keeps the JSON as documentation)

### Resources

- [Adaptive Cards Designer (visual editor)](https://adaptivecards.io/designer/)
- [Adaptive Cards Schema Explorer (v1.5)](https://adaptivecards.io/explorer/)
- [Adaptive Cards Samples](https://adaptivecards.io/samples/)
- [Adaptive Cards GitHub](https://github.com/microsoft/AdaptiveCards)
