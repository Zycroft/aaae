/* global describe, test, expect */
/**
 * WorkflowProgress — unit tests (TDD: RED phase)
 *
 * Uses renderToStaticMarkup from react-dom/server since @testing-library/react
 * is not available in this project. Tests verify render output as HTML strings.
 *
 * 20-01: PROG-01, PROG-02, PROG-03
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkflowProgress } from './WorkflowProgress.js';
import type { WorkflowState } from '@copilot-chat/shared';

describe('WorkflowProgress', () => {
  test('renders null when workflowState is null', () => {
    const html = renderToStaticMarkup(<WorkflowProgress workflowState={null} />);
    expect(html).toBe('');
  });

  test('renders phase label when workflow active with currentPhase', () => {
    const ws: WorkflowState = {
      step: 'gather-info',
      turnCount: 1,
      status: 'active',
      currentPhase: 'Gathering Information',
      progress: 0.25,
    };
    const html = renderToStaticMarkup(<WorkflowProgress workflowState={ws} />);
    expect(html).toContain('Gathering Information');
    expect(html).toContain('workflowProgressLabel');
  });

  test('renders determinate progress bar when progress is a number', () => {
    const ws: WorkflowState = {
      step: 'step-2',
      turnCount: 2,
      status: 'active',
      currentPhase: 'Processing',
      progress: 0.5,
    };
    const html = renderToStaticMarkup(<WorkflowProgress workflowState={ws} />);
    expect(html).toContain('width:50%');
    expect(html).toContain('workflowProgressBar');
    expect(html).not.toContain('indeterminate');
  });

  test('renders indeterminate pulsing bar when progress is null', () => {
    const ws: WorkflowState = {
      step: 'step-1',
      turnCount: 1,
      status: 'active',
      currentPhase: 'Starting',
      progress: null,
    };
    const html = renderToStaticMarkup(<WorkflowProgress workflowState={ws} />);
    expect(html).toContain('indeterminate');
    // Should NOT have an inline width style
    expect(html).not.toMatch(/style="[^"]*width:/);
  });

  test('renders active without currentPhase (uses fallback label)', () => {
    const ws: WorkflowState = {
      step: 'step-1',
      turnCount: 0,
      status: 'active',
      progress: 0.1,
    };
    const html = renderToStaticMarkup(<WorkflowProgress workflowState={ws} />);
    // Should render without crashing, with a fallback label
    expect(html).toContain('workflowProgress');
    expect(html).toContain('workflowProgressLabel');
    // Fallback text should be present (not empty)
    expect(html.length).toBeGreaterThan(0);
  });

  test('hides when workflowState status is not active', () => {
    const completed: WorkflowState = {
      step: 'done',
      turnCount: 5,
      status: 'completed',
      currentPhase: 'Done',
      progress: 1,
    };
    const errorState: WorkflowState = {
      step: 'failed',
      turnCount: 3,
      status: 'error',
      currentPhase: 'Error Phase',
      progress: 0.7,
    };
    const htmlCompleted = renderToStaticMarkup(<WorkflowProgress workflowState={completed} />);
    const htmlError = renderToStaticMarkup(<WorkflowProgress workflowState={errorState} />);
    expect(htmlCompleted).toBe('');
    expect(htmlError).toBe('');
  });
});
