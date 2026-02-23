# Phase 21: Dynamic Input + Completion + MetadataPane - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The chat input adapts to the workflow's requested input mode (choice pills, confirmation buttons, disabled/none), a completion view summarizes what was collected when the workflow finishes, and the metadata pane exposes accumulated workflow data. Users interact with all input modes via keyboard or pointer. Free-text input remains available as fallback in choice and confirmation modes.

Three components being built or extended:
1. **ChatInput** — Dynamic input modes driven by workflowState.suggestedInputType and choices
2. **WorkflowComplete** — New component for status='completed' with data summary, reset, download
3. **MetadataPane** — Extended with "Workflow Data" section for collectedData display

</domain>

<decisions>
## Implementation Decisions

### Choice pill layout and interaction
- Pills render as horizontal inline-flex row that wraps naturally (flexbox wrap)
- Pills appear ABOVE the textarea row, inside the .chatInputArea container
- Each pill is a button element with .choicePill class — click sends the choice text as a message via onSend
- After selecting a pill, pills disappear (they are response to a single prompt, not persistent)
- When >6 pills, show first 6 with a "Show more" toggle button that expands the full list
- Pills use var(--color-surface) background with var(--color-border) outline — subtle, not primary-colored
- Hover: border color changes to var(--color-primary); focus-visible: standard focus ring
- Keyboard: Tab navigates between pills, Enter/Space activates

### Confirmation buttons
- Render as two buttons: "Yes" and "No" — same area as choice pills (above textarea)
- Use same .choicePill styling as choice pills for visual consistency
- "Yes" pill has var(--color-primary) background with inverse text; "No" is neutral
- Click sends "Yes" or "No" as message text via onSend
- Free-text textarea remains visible and active below

### Disabled input state (suggestedInputType='none')
- Textarea is disabled (grayed out) with opacity reduction
- Status message appears inline where pills would normally appear: "Waiting for workflow..." in muted text
- Send button also disabled
- No pills or confirmation buttons visible

### Free-text fallback
- In choice and confirmation modes, the textarea + send button remain fully functional below the pills
- User can always type and send free text regardless of suggestedInputType
- Placeholder text changes contextually: "Select an option or type a message..." (choice), "Confirm or type a message..." (confirmation)

### WorkflowComplete component
- Renders in place of the transcript + input area when workflowState.status === 'completed'
- Shows a summary card with: heading "Workflow Complete", collected data as a key-value list
- collectedData keys displayed as labels (capitalized, underscores replaced with spaces), values as text
- Two action buttons at bottom: "Start new conversation" (calls resetConversation) and "Download summary" (exports JSON)
- "Start new conversation" uses var(--color-primary) button styling
- "Download summary" uses outlined/secondary button styling (border, no fill)
- Uses existing .chatShell flex layout — replaces transcript area, not overlaid

### MetadataPane workflow data section
- New "Workflow Data" section appears ABOVE the existing "Activity Log" when workflowState has collectedData
- Section header: "Workflow Data" with same .metadataPaneTitle styling
- Key-value pairs rendered as a definition list (dl/dt/dd) for semantic HTML
- Keys: monospace font, muted color; Values: normal text
- Nested objects (2-3 levels): displayed inline with indented sub-keys using dot notation (e.g., "address.street")
- Deeper nesting (>3 levels): collapsed behind a "View full data" button that toggles a `<pre>` JSON block
- Empty collectedData or null: section not rendered (same pattern as WorkflowProgress null-return)

### Claude's Discretion
- Exact pill border-radius and padding values (follow existing .cardSubmitChip pattern as reference)
- Animation/transition on pill appearance/disappearance
- WorkflowComplete layout spacing and max-width
- JSON formatting in "View full data" toggle (indentation level)
- Whether "Download summary" filename includes workflow step or just date

</decisions>

<specifics>
## Specific Ideas

- Choice pills should feel like tag/chip selectors — similar to the existing .cardSubmitChip styling but clickable and outlined rather than filled
- WorkflowComplete should feel like a "receipt" — clean summary of what happened, not a wall of data
- The MetadataPane workflow data section should complement (not replace) the existing Activity Log — workflow data above, activity log below
- "Start new conversation" is the primary CTA on completion; "Download summary" is secondary

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-dynamic-input-completion-metadatapane*
*Context gathered: 2026-02-22*
