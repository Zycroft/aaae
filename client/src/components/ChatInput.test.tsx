/* global describe, test, expect */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatInput } from './ChatInput.js';

describe('ChatInput dynamic modes', () => {
  const onSend = () => {};

  test('renders default text input when no suggestedInputType', () => {
    const html = renderToStaticMarkup(
      <ChatInput onSend={onSend} disabled={false} />
    );
    expect(html).toContain('chatTextarea');
    expect(html).toContain('sendButton');
    expect(html).not.toContain('choicePill');
  });

  test('renders choice pills when suggestedInputType is choice', () => {
    const html = renderToStaticMarkup(
      <ChatInput
        onSend={onSend}
        disabled={false}
        suggestedInputType="choice"
        choices={['Option A', 'Option B', 'Option C']}
      />
    );
    expect(html).toContain('choicePill');
    expect(html).toContain('Option A');
    expect(html).toContain('Option B');
    expect(html).toContain('Option C');
  });

  test('renders only first 6 pills and Show more toggle when choices exceed 6', () => {
    const choices = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const html = renderToStaticMarkup(
      <ChatInput
        onSend={onSend}
        disabled={false}
        suggestedInputType="choice"
        choices={choices}
      />
    );
    // Count occurrences of choicePill class (not including showMoreToggle)
    const pillMatches = html.match(/choicePill"/g) || [];
    expect(pillMatches.length).toBe(6);
    expect(html).toContain('showMoreToggle');
    expect(html).toContain('Show more');
    // G and H should NOT be rendered initially
    expect(html).not.toContain('>G<');
    expect(html).not.toContain('>H<');
  });

  test('renders Yes and No buttons for confirmation mode', () => {
    const html = renderToStaticMarkup(
      <ChatInput
        onSend={onSend}
        disabled={false}
        suggestedInputType="confirmation"
      />
    );
    expect(html).toContain('choicePill');
    expect(html).toContain('choicePillPrimary');
    expect(html).toContain('>Yes<');
    expect(html).toContain('>No<');
  });

  test('renders disabled state with status message when suggestedInputType is none', () => {
    const html = renderToStaticMarkup(
      <ChatInput
        onSend={onSend}
        disabled={false}
        suggestedInputType="none"
      />
    );
    expect(html).toContain('inputDisabledStatus');
    expect(html).toContain('Waiting for workflow...');
    expect(html).toContain('disabled');
  });

  test('keeps textarea visible and enabled in choice mode (free-text fallback)', () => {
    const html = renderToStaticMarkup(
      <ChatInput
        onSend={onSend}
        disabled={false}
        suggestedInputType="choice"
        choices={['Option A']}
      />
    );
    expect(html).toContain('chatTextarea');
    // Textarea should NOT have disabled attribute
    expect(html).not.toMatch(/textarea[^>]*disabled/);
    expect(html).toContain('Select an option');
  });

  test('keeps textarea visible and enabled in confirmation mode (free-text fallback)', () => {
    const html = renderToStaticMarkup(
      <ChatInput
        onSend={onSend}
        disabled={false}
        suggestedInputType="confirmation"
      />
    );
    expect(html).toContain('chatTextarea');
    // Textarea should NOT have disabled attribute
    expect(html).not.toMatch(/textarea[^>]*disabled/);
    expect(html).toContain('Confirm');
  });
});
