# Phase 22: Integration Testing - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

A single integration test simulates a complete multi-step workflow from start to finish, verifying that phase transitions, input mode changes, and completion rendering all work in sequence. This validates that the assembled v1.6 system behaves as designed. No new features or UI components — testing only.

</domain>

<decisions>
## Implementation Decisions

### Test scope and workflow simulation
- Test drives a simulated workflow through at least 2 phase transitions (e.g., "Gathering Info" -> "Processing" -> "Completed")
- At least 2 different input modes exercised (e.g., choice pills in phase 1, confirmation Yes/No in phase 2)
- Uses the existing `renderToStaticMarkup` pattern from Phase 20-21 tests — no new test dependencies
- Test file lives in `client/src/components/` alongside existing test files

### Mocking strategy
- Mock `chatApi.ts` functions (startConversation, sendMessage, sendCardAction) at the module level — return controlled WorkflowState payloads
- Each mock call returns a different workflowState to simulate phase progression
- No real network calls — pure unit-style integration test of the component tree
- Since ChatShell depends on MSAL (`useMsal`), the test should exercise the reducer + component rendering flow directly rather than mounting ChatShell with all its auth dependencies

### Reset verification
- After workflow completes, verify resetConversation() clears workflowState, messages, and conversationId
- Verify that no workflow artifacts remain visible (no progress bar, no completion view, no choice pills)
- Verify the UI returns to initial empty state

### Claude's Discretion
- Exact phase names and progress values in the test fixtures
- Number of intermediate steps beyond the minimum 2 transitions
- Whether to test error state recovery in the same test or keep it separate
- Test file naming convention

</decisions>

<specifics>
## Specific Ideas

- The test should exercise the `useChatApi` reducer actions directly (SEND_SUCCESS, SET_WORKFLOW_STATE, RESET_CONVERSATION) since mounting the full ChatShell requires MSAL mocking that adds complexity without value
- Complement reducer-level tests with `renderToStaticMarkup` assertions on individual components receiving the simulated workflow state at each step
- The test validates the full phase-transition cycle: idle -> active (phase 1, choice mode) -> active (phase 2, confirmation mode) -> completed -> reset -> idle

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-integration-testing*
*Context gathered: 2026-02-22*
