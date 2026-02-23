/* global describe, test, expect */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkflowComplete } from './WorkflowComplete.js';
import type { WorkflowState } from '@copilot-chat/shared';

describe('WorkflowComplete', () => {
  const onReset = () => {};

  function makeState(overrides: Partial<WorkflowState> = {}): WorkflowState {
    return {
      step: 'done',
      turnCount: 3,
      status: 'completed',
      ...overrides,
    };
  }

  test('renders heading "Workflow Complete"', () => {
    const html = renderToStaticMarkup(
      <WorkflowComplete workflowState={makeState()} onReset={onReset} />
    );
    expect(html).toContain('Workflow Complete');
    expect(html).toContain('workflowCompleteHeading');
  });

  test('renders collected data as key-value pairs', () => {
    const state = makeState({
      collectedData: {
        first_name: 'Alice',
        email_address: 'alice@example.com',
      },
    });
    const html = renderToStaticMarkup(
      <WorkflowComplete workflowState={state} onReset={onReset} />
    );
    expect(html).toContain('First name');
    expect(html).toContain('Alice');
    expect(html).toContain('Email address');
    expect(html).toContain('alice@example.com');
  });

  test('renders "Start new conversation" button', () => {
    const html = renderToStaticMarkup(
      <WorkflowComplete workflowState={makeState()} onReset={onReset} />
    );
    expect(html).toContain('Start new conversation');
    expect(html).toContain('workflowCompleteReset');
  });

  test('renders "Download summary" button', () => {
    const html = renderToStaticMarkup(
      <WorkflowComplete workflowState={makeState()} onReset={onReset} />
    );
    expect(html).toContain('Download summary');
    expect(html).toContain('workflowCompleteDownload');
  });

  test('handles empty collectedData gracefully', () => {
    const state = makeState({ collectedData: {} });
    const html = renderToStaticMarkup(
      <WorkflowComplete workflowState={state} onReset={onReset} />
    );
    expect(html).toContain('Workflow Complete');
    expect(html).toContain('Start new conversation');
    expect(html).toContain('Download summary');
    // No data rows
    expect(html).not.toContain('workflowCompleteDataRow');
  });

  test('handles undefined collectedData', () => {
    const state = makeState(); // no collectedData field
    const html = renderToStaticMarkup(
      <WorkflowComplete workflowState={state} onReset={onReset} />
    );
    expect(html).toContain('Workflow Complete');
    expect(html).toContain('Start new conversation');
    expect(html).toContain('Download summary');
    expect(html).not.toContain('workflowCompleteDataRow');
  });
});
