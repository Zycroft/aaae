# Requirements: Agentic Copilot Chat App

**Defined:** 2026-02-22
**Core Value:** Users can interact with a Copilot Studio agent through a polished chat UI that seamlessly mixes text responses and interactive Adaptive Cards — server-side only, secrets protected, authenticated via Entra External ID.

## v1.6 Requirements

Requirements for v1.6 Dynamic Step-Driven UX. Each maps to roadmap phases.

### Schema & API

- [ ] **SCHEMA-01**: WorkflowState Zod schema in shared/ defines status (active/completed/error), currentPhase, progress (0-1), collectedData, suggestedInputType (text/choice/confirmation/none), and choices array
- [ ] **SCHEMA-02**: SendMessageResponse and CardActionResponse include optional workflowState field
- [ ] **SCHEMA-03**: All workflowState fields are nullable — absence means pure chat mode (backward compatible)

### Progress Indicator

- [ ] **PROG-01**: WorkflowProgress component shows currentPhase label and progress bar above transcript when workflow is active
- [ ] **PROG-02**: Progress bar shows determinate (0-100%) when progress is set, indeterminate/pulsing when null
- [ ] **PROG-03**: Component hides when no workflow active, animates phase transitions smoothly

### Dynamic Input

- [ ] **INPUT-01**: ChatInput renders clickable pill buttons when suggestedInputType is 'choice', selecting sends choice as text
- [ ] **INPUT-02**: ChatInput renders Yes/No buttons when suggestedInputType is 'confirmation'
- [ ] **INPUT-03**: ChatInput is disabled with status message when suggestedInputType is 'none'
- [ ] **INPUT-04**: Free-text input is always available as fallback in choice and confirmation modes
- [ ] **INPUT-05**: Choice pills handle overflow (>6 items) with "Show more" toggle; all input modes keyboard accessible

### Workflow Completion

- [ ] **COMPL-01**: WorkflowComplete component renders when workflowState.status is 'completed' with collected data summary
- [ ] **COMPL-02**: "Start new conversation" button resets conversation state
- [ ] **COMPL-03**: "Download summary" button exports collected data as JSON

### Transcript Enhancement

- [ ] **TRANS-01**: Phase dividers appear in transcript when currentPhase changes between messages
- [ ] **TRANS-02**: Orchestrator status messages render as centered, muted text without bubbles

### State Management

- [ ] **STATE-01**: useChatApi hook stores and exposes workflowState, dispatching updates from every send/cardAction response
- [ ] **STATE-02**: Workflow-specific actions (state update, complete, error) integrated into reducer
- [ ] **STATE-03**: resetConversation() function available for starting fresh after workflow completion

### Chat Shell

- [ ] **SHELL-01**: ChatShell passes workflowState to child components (progress, input, completion)
- [ ] **SHELL-02**: Error state with retry option when workflowState.status is 'error'

### MetadataPane

- [ ] **META-01**: MetadataPane shows "Workflow Data" section with accumulated collectedData key-value pairs
- [ ] **META-02**: Nested data (2-3 levels) displayed inline, deeper structures show "View full data" JSON viewer

### Compatibility

- [ ] **COMPAT-01**: Client without workflowState behaves identically to v1.1 (no regression)
- [ ] **COMPAT-02**: No hardcoded workflow phases — client renders whatever server returns
- [ ] **COMPAT-03**: All new components responsive (360px/768px/1280px) and theme-aware (dark/light)

### Testing

- [ ] **TEST-01**: Unit tests for WorkflowProgress component (active, inactive, determinate, indeterminate states)
- [ ] **TEST-02**: Unit tests for ChatInput modes (choice pills, confirmation buttons, none/disabled)
- [ ] **TEST-03**: Unit tests for WorkflowComplete component (summary rendering, reset, download)
- [ ] **TEST-04**: Integration test simulating multi-step workflow with phase transitions and input mode changes

## Future Requirements

### Streaming & Performance

- **PERF-01**: Server-Sent Events (SSE) for real-time response streaming
- **CARD-01**: Markdown rendering in text messages
- **CARD-02**: Quick-reply chips from suggestedActions

## Out of Scope

| Feature | Reason |
|---------|--------|
| Hardcoded workflow steps/screens | Workflows are AI-driven and dynamic — client renders whatever server returns |
| New npm dependencies for UI | Use existing React 18 + CSS; no component libraries |
| Server-side workflow UX changes | v1.5 orchestrator is complete; v1.6 is client-only |
| Mobile native app | Web-first, mobile is a future milestone |
| Multi-user real-time workflows | Single-user sessions for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | — | Pending |
| SCHEMA-02 | — | Pending |
| SCHEMA-03 | — | Pending |
| PROG-01 | — | Pending |
| PROG-02 | — | Pending |
| PROG-03 | — | Pending |
| INPUT-01 | — | Pending |
| INPUT-02 | — | Pending |
| INPUT-03 | — | Pending |
| INPUT-04 | — | Pending |
| INPUT-05 | — | Pending |
| COMPL-01 | — | Pending |
| COMPL-02 | — | Pending |
| COMPL-03 | — | Pending |
| TRANS-01 | — | Pending |
| TRANS-02 | — | Pending |
| STATE-01 | — | Pending |
| STATE-02 | — | Pending |
| STATE-03 | — | Pending |
| SHELL-01 | — | Pending |
| SHELL-02 | — | Pending |
| META-01 | — | Pending |
| META-02 | — | Pending |
| COMPAT-01 | — | Pending |
| COMPAT-02 | — | Pending |
| COMPAT-03 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |
| TEST-04 | — | Pending |

**Coverage:**
- v1.6 requirements: 30 total
- Mapped to phases: 0
- Unmapped: 30 (awaiting roadmap)

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 after initial definition*
