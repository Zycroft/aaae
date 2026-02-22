import { describe, it, expect } from 'vitest';
import type { WorkflowState } from '@copilot-chat/shared';
import { buildContextualQuery } from './contextBuilder.js';

/**
 * TDD test suite for buildContextualQuery — context builder.
 * Covers: default format, custom template, truncation, undefined collectedData,
 * special characters in step names.
 *
 * CTX-01, CTX-02, CTX-03
 */
describe('buildContextualQuery', () => {
  // ──────────────────────────────────────────────────────────────
  // CTX-01: Default preamble format
  // ──────────────────────────────────────────────────────────────

  it('prepends default preamble with step, collectedData, and turnCount', () => {
    const state: WorkflowState = {
      step: 'intake',
      collectedData: { name: 'Alice' },
      turnCount: 2,
    };

    const { query, truncated } = buildContextualQuery(
      'What is my eligibility?',
      state
    );

    expect(query).toContain('[CONTEXT]');
    expect(query).toContain('Phase: intake');
    expect(query).toContain('Collected data: {"name":"Alice"}');
    expect(query).toContain('Turn number: 2');
    expect(query).toContain('[/CONTEXT]');
    expect(query).toContain('What is my eligibility?');
    expect(truncated).toBe(false);
  });

  it('serializes undefined collectedData as empty object', () => {
    const state: WorkflowState = {
      step: 'start',
      collectedData: undefined,
      turnCount: 0,
    };

    const { query } = buildContextualQuery('Hello', state);

    expect(query).toContain('Collected data: {}');
  });

  it('places user message after the preamble block', () => {
    const state: WorkflowState = {
      step: 'review',
      collectedData: {},
      turnCount: 5,
    };

    const { query } = buildContextualQuery('Submit my form', state);

    const contextEnd = query.indexOf('[/CONTEXT]');
    const userMsgStart = query.indexOf('Submit my form');
    expect(contextEnd).toBeGreaterThan(-1);
    expect(userMsgStart).toBeGreaterThan(contextEnd);
  });

  // ──────────────────────────────────────────────────────────────
  // CTX-02: Custom preamble template
  // ──────────────────────────────────────────────────────────────

  it('uses custom preamble template replacing default format', () => {
    const state: WorkflowState = {
      step: 'intake',
      collectedData: { name: 'Alice' },
      turnCount: 2,
    };

    const { query } = buildContextualQuery('What is my eligibility?', state, {
      preambleTemplate:
        '<ctx>step={step},turn={turnCount}</ctx>\n{userMessage}',
    });

    expect(query).toBe(
      '<ctx>step=intake,turn=2</ctx>\nWhat is my eligibility?'
    );
    expect(query).not.toContain('[CONTEXT]');
  });

  it('substitutes {dataJson} in custom template', () => {
    const state: WorkflowState = {
      step: 'gather',
      collectedData: { age: 30 },
      turnCount: 1,
    };

    const { query } = buildContextualQuery('Next', state, {
      preambleTemplate: 'data={dataJson}\n{userMessage}',
    });

    expect(query).toBe('data={"age":30}\nNext');
  });

  // ──────────────────────────────────────────────────────────────
  // CTX-03: Truncation at maxLength
  // ──────────────────────────────────────────────────────────────

  it('truncates to maxLength and returns truncated=true when query exceeds limit', () => {
    const state: WorkflowState = {
      step: 'intake',
      collectedData: { longField: 'x'.repeat(200) },
      turnCount: 1,
    };

    const { query, truncated } = buildContextualQuery('Hello', state, {
      maxLength: 100,
    });

    expect(query.length).toBeLessThanOrEqual(100);
    expect(query).toMatch(/\.\.\.$/);
    expect(truncated).toBe(true);
  });

  it('does not truncate when query is within maxLength', () => {
    const state: WorkflowState = {
      step: 'start',
      collectedData: {},
      turnCount: 0,
    };

    const { query, truncated } = buildContextualQuery('Hi', state, {
      maxLength: 5000,
    });

    expect(truncated).toBe(false);
    expect(query).not.toMatch(/\.\.\.$/);
  });

  it('uses default maxLength of 2000 when no config provided', () => {
    const state: WorkflowState = {
      step: 'intake',
      // Generate a large collectedData payload
      collectedData: Object.fromEntries(
        Array.from({ length: 100 }, (_, i) => [
          `field_${i}`,
          'x'.repeat(20),
        ])
      ),
      turnCount: 99,
    };

    const { query, truncated } = buildContextualQuery(
      'Check status',
      state
    );

    // The serialized data alone is > 2000 chars; expect truncation
    expect(query.length).toBeLessThanOrEqual(2000);
    expect(truncated).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────
  // Robustness: special characters
  // ──────────────────────────────────────────────────────────────

  it('handles step name with curly braces without infinite loop', () => {
    const state: WorkflowState = {
      step: 'step with {curly}',
      collectedData: {},
      turnCount: 1,
    };

    const { query } = buildContextualQuery('test', state);

    expect(query).toContain('Phase: step with {curly}');
  });

  // ──────────────────────────────────────────────────────────────
  // Pure function contract
  // ──────────────────────────────────────────────────────────────

  it('is a pure function — same inputs produce same outputs', () => {
    const state: WorkflowState = {
      step: 'review',
      collectedData: { x: 1 },
      turnCount: 3,
    };

    const result1 = buildContextualQuery('msg', state);
    const result2 = buildContextualQuery('msg', state);

    expect(result1).toEqual(result2);
  });
});
