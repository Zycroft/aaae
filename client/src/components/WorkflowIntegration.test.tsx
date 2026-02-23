/* global describe, test, expect */
/**
 * Workflow Integration Test — full lifecycle simulation (TEST-04)
 *
 * Validates the assembled v1.6 system end-to-end by exercising:
 * 1. The useChatApi reducer (state transitions)
 * 2. Component rendering via renderToStaticMarkup at each lifecycle step
 *
 * Lifecycle: idle -> active(choice) -> active(confirmation) -> completed -> reset -> idle
 *
 * Uses renderToStaticMarkup from react-dom/server since @testing-library/react
 * is not available in this project.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorkflowState } from '@copilot-chat/shared';
import { reducer, initialState } from '../hooks/useChatApi.js';
import { WorkflowProgress } from './WorkflowProgress.js';
import { ChatInput } from './ChatInput.js';
import { WorkflowComplete } from './WorkflowComplete.js';

describe('Workflow Integration', () => {
  // ── Workflow state fixtures for each phase ──────────────────────────────

  const phase1State: WorkflowState = {
    step: 'gather-info',
    turnCount: 1,
    status: 'active',
    currentPhase: 'Gathering Information',
    progress: 0.25,
    suggestedInputType: 'choice',
    choices: ['Option A', 'Option B', 'Option C'],
  };

  const phase2State: WorkflowState = {
    step: 'confirm-details',
    turnCount: 3,
    status: 'active',
    currentPhase: 'Confirming Details',
    progress: 0.75,
    suggestedInputType: 'confirmation',
  };

  const completedState: WorkflowState = {
    step: 'done',
    turnCount: 5,
    status: 'completed',
    currentPhase: 'Complete',
    progress: 1,
    collectedData: { first_name: 'Alice', preference: 'Option A', confirmed: 'Yes' },
  };

  // ── Full lifecycle ─────────────────────────────────────────────────────

  describe('full lifecycle: idle -> active(choice) -> active(confirmation) -> completed -> reset', () => {
    test('Step 1: idle state — no workflow artifacts visible', () => {
      // Reducer: initialState has workflowState = null
      expect(initialState.workflowState).toBeNull();
      expect(initialState.messages).toEqual([]);

      // WorkflowProgress renders nothing when workflowState is null
      const progressHtml = renderToStaticMarkup(<WorkflowProgress workflowState={null} />);
      expect(progressHtml).toBe('');

      // ChatInput in default mode — no choice pills, no confirmation buttons
      const inputHtml = renderToStaticMarkup(
        <ChatInput onSend={() => {}} disabled={false} />
      );
      expect(inputHtml).not.toContain('choicePill');
      expect(inputHtml).not.toContain('inputDisabledStatus');
    });

    test('Step 2: phase transition to phase 1 (active + choice mode)', () => {
      // Reducer: simulate conversation init + bot response + workflow state
      let state = reducer(initialState, {
        type: 'INIT_CONVERSATION',
        conversationId: 'test-conv-123',
      });
      state = reducer(state, {
        type: 'SEND_SUCCESS',
        optimisticId: 'msg-1',
        botMessages: [{ id: 'bot-1', role: 'assistant', kind: 'text', text: 'Please choose an option.' }],
        currentPhase: 'Gathering Information',
      });
      state = reducer(state, {
        type: 'SET_WORKFLOW_STATE',
        workflowState: phase1State,
      });

      // Verify reducer state
      expect(state.workflowState).toEqual(phase1State);
      expect(state.workflowState?.status).toBe('active');
      expect(state.workflowState?.suggestedInputType).toBe('choice');
      expect(state.messages).toHaveLength(1);

      // WorkflowProgress shows phase label and determinate bar
      const progressHtml = renderToStaticMarkup(<WorkflowProgress workflowState={phase1State} />);
      expect(progressHtml).toContain('Gathering Information');
      expect(progressHtml).toContain('width:25%');
      expect(progressHtml).not.toContain('indeterminate');

      // ChatInput shows choice pills
      const inputHtml = renderToStaticMarkup(
        <ChatInput onSend={() => {}} disabled={false} suggestedInputType="choice" choices={phase1State.choices} />
      );
      expect(inputHtml).toContain('choicePill');
      expect(inputHtml).toContain('Option A');
      expect(inputHtml).toContain('Option B');
      expect(inputHtml).toContain('Option C');
      // Free-text textarea still available (INPUT-04)
      expect(inputHtml).toContain('chatTextarea');
    });

    test('Step 3: phase transition to phase 2 (active + confirmation mode)', () => {
      // Reducer: apply phase 2 state
      let state = reducer(initialState, {
        type: 'INIT_CONVERSATION',
        conversationId: 'test-conv-123',
      });
      state = reducer(state, {
        type: 'SET_WORKFLOW_STATE',
        workflowState: phase2State,
      });

      expect(state.workflowState).toEqual(phase2State);
      expect(state.workflowState?.suggestedInputType).toBe('confirmation');
      expect(state.workflowState?.currentPhase).toBe('Confirming Details');

      // WorkflowProgress shows updated phase and progress
      const progressHtml = renderToStaticMarkup(<WorkflowProgress workflowState={phase2State} />);
      expect(progressHtml).toContain('Confirming Details');
      expect(progressHtml).toContain('width:75%');

      // ChatInput shows Yes/No confirmation buttons
      const inputHtml = renderToStaticMarkup(
        <ChatInput onSend={() => {}} disabled={false} suggestedInputType="confirmation" />
      );
      expect(inputHtml).toContain('choicePillPrimary');
      expect(inputHtml).toContain('>Yes<');
      expect(inputHtml).toContain('>No<');
      // Free-text textarea still available (INPUT-04)
      expect(inputHtml).toContain('chatTextarea');
    });

    test('Step 4: transition to completed state', () => {
      // Reducer: apply completed state
      let state = reducer(initialState, {
        type: 'INIT_CONVERSATION',
        conversationId: 'test-conv-123',
      });
      state = reducer(state, {
        type: 'SET_WORKFLOW_STATE',
        workflowState: completedState,
      });

      expect(state.workflowState?.status).toBe('completed');

      // WorkflowProgress should NOT render for completed status
      const progressHtml = renderToStaticMarkup(<WorkflowProgress workflowState={completedState} />);
      expect(progressHtml).toBe('');

      // WorkflowComplete should render with collected data
      const completeHtml = renderToStaticMarkup(
        <WorkflowComplete workflowState={completedState} onReset={() => {}} />
      );
      expect(completeHtml).toContain('Workflow Complete');
      expect(completeHtml).toContain('First name');   // formatLabel('first_name')
      expect(completeHtml).toContain('Alice');
      expect(completeHtml).toContain('Preference');    // formatLabel('preference')
      expect(completeHtml).toContain('Option A');
      expect(completeHtml).toContain('Start new conversation');
      expect(completeHtml).toContain('Download summary');
    });

    test('Step 5: reset returns to initial idle state', () => {
      // Build up state then reset
      let state = reducer(initialState, {
        type: 'INIT_CONVERSATION',
        conversationId: 'test-conv-123',
      });
      state = reducer(state, {
        type: 'ADD_OPTIMISTIC_MESSAGE',
        message: { id: 'u-1', role: 'user', kind: 'text', text: 'Hello' },
      });
      state = reducer(state, {
        type: 'SET_WORKFLOW_STATE',
        workflowState: completedState,
      });

      // Verify state has data
      expect(state.conversationId).toBe('test-conv-123');
      expect(state.messages).toHaveLength(1);
      expect(state.workflowState).toBeTruthy();

      // Reset
      state = reducer(state, { type: 'RESET_CONVERSATION' });

      // All state cleared
      expect(state.conversationId).toBeNull();
      expect(state.messages).toEqual([]);
      expect(state.workflowState).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();

      // Components render clean after reset
      const progressHtml = renderToStaticMarkup(<WorkflowProgress workflowState={null} />);
      expect(progressHtml).toBe('');

      const inputHtml = renderToStaticMarkup(
        <ChatInput onSend={() => {}} disabled={false} />
      );
      expect(inputHtml).not.toContain('choicePill');
      expect(inputHtml).not.toContain('inputDisabledStatus');
      expect(inputHtml).toContain('chatTextarea');
    });
  });

  // ── Phase dividers ─────────────────────────────────────────────────────

  describe('phase dividers in transcript messages', () => {
    test('messages carry workflowPhase from SEND_SUCCESS currentPhase', () => {
      let state = reducer(initialState, {
        type: 'INIT_CONVERSATION',
        conversationId: 'test-conv-123',
      });

      // Phase 1 message
      state = reducer(state, {
        type: 'SEND_SUCCESS',
        optimisticId: 'opt-1',
        botMessages: [{ id: 'b1', role: 'assistant', kind: 'text', text: 'Phase 1 response' }],
        currentPhase: 'Gathering Information',
      });

      // Phase 2 message
      state = reducer(state, {
        type: 'SEND_SUCCESS',
        optimisticId: 'opt-2',
        botMessages: [{ id: 'b2', role: 'assistant', kind: 'text', text: 'Phase 2 response' }],
        currentPhase: 'Confirming Details',
      });

      // First bot message tagged with phase 1
      const botMsg1 = state.messages.find(m => m.id === 'b1');
      expect(botMsg1?.workflowPhase).toBe('Gathering Information');

      // Second bot message tagged with phase 2
      const botMsg2 = state.messages.find(m => m.id === 'b2');
      expect(botMsg2?.workflowPhase).toBe('Confirming Details');

      // Different phases on consecutive messages = divider should appear
      expect(botMsg1?.workflowPhase).not.toBe(botMsg2?.workflowPhase);
    });
  });

  // ── Error state ────────────────────────────────────────────────────────

  describe('error state', () => {
    test('workflow error state is tracked in reducer', () => {
      const errorState: WorkflowState = {
        step: 'failed',
        turnCount: 3,
        status: 'error',
        currentPhase: 'Error',
        progress: 0.5,
      };

      let state = reducer(initialState, {
        type: 'INIT_CONVERSATION',
        conversationId: 'test-conv-123',
      });
      state = reducer(state, {
        type: 'SET_WORKFLOW_STATE',
        workflowState: errorState,
      });

      expect(state.workflowState?.status).toBe('error');

      // WorkflowProgress does NOT render for error status (handled by ChatShell)
      const progressHtml = renderToStaticMarkup(<WorkflowProgress workflowState={errorState} />);
      expect(progressHtml).toBe('');
    });
  });
});
