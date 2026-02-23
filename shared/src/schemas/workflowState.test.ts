import { describe, it, expect } from 'vitest';
import { WorkflowStateSchema } from './workflowState.js';

// ──────────────────────────────────────────────────────────────────────────────
// WorkflowStateSchema (ORCH-01)
// ──────────────────────────────────────────────────────────────────────────────

describe('WorkflowStateSchema', () => {
  it('parses minimal valid state with step and turnCount', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'gather-name',
      turnCount: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.step).toBe('gather-name');
      expect(result.data.turnCount).toBe(0);
      expect(result.data.collectedData).toBeUndefined();
      expect(result.data.lastRecommendation).toBeUndefined();
    }
  });

  it('parses full state with all fields', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'confirm',
      collectedData: { name: 'Alice' },
      lastRecommendation: 'ask for budget',
      turnCount: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.step).toBe('confirm');
      expect(result.data.collectedData).toEqual({ name: 'Alice' });
      expect(result.data.lastRecommendation).toBe('ask for budget');
      expect(result.data.turnCount).toBe(3);
    }
  });

  it('rejects empty object (step is required)', () => {
    const result = WorkflowStateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects state with empty step string', () => {
    const result = WorkflowStateSchema.safeParse({
      step: '',
      turnCount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects state with negative turnCount', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'initial',
      turnCount: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects state with non-integer turnCount', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'initial',
      turnCount: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects state missing turnCount', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'initial',
    });
    expect(result.success).toBe(false);
  });

  it('accepts collectedData with mixed value types', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'review',
      collectedData: {
        name: 'Alice',
        age: 30,
        tags: ['a', 'b'],
        nested: { key: 'value' },
      },
      turnCount: 2,
    });
    expect(result.success).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// WorkflowStateSchema v1.6 UX fields (SCHEMA-01, SCHEMA-03)
// ──────────────────────────────────────────────────────────────────────────────

describe('WorkflowStateSchema v1.6 UX fields (SCHEMA-01, SCHEMA-03)', () => {
  it('accepts state with progress = 0.5', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'confirm',
      turnCount: 2,
      progress: 0.5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.progress).toBe(0.5);
    }
  });

  it('accepts state with progress = null (indeterminate)', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'gather_info',
      turnCount: 1,
      progress: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.progress).toBeNull();
    }
  });

  it('accepts state without progress (backward compat)', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'initial',
      turnCount: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.progress).toBeUndefined();
    }
  });

  it('rejects progress > 1', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'gather_info',
      turnCount: 1,
      progress: 1.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects progress < 0', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'gather_info',
      turnCount: 1,
      progress: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts all suggestedInputType enum values', () => {
    for (const value of ['text', 'choice', 'confirmation', 'none']) {
      const result = WorkflowStateSchema.safeParse({
        step: 'x',
        turnCount: 1,
        suggestedInputType: value,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown suggestedInputType', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'x',
      turnCount: 1,
      suggestedInputType: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('accepts choices array when suggestedInputType is choice', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'x',
      turnCount: 1,
      suggestedInputType: 'choice',
      choices: ['A', 'B', 'C'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.choices).toEqual(['A', 'B', 'C']);
    }
  });

  it('accepts state without suggestedInputType or choices (backward compat)', () => {
    const result = WorkflowStateSchema.safeParse({
      step: 'gather_info',
      turnCount: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.suggestedInputType).toBeUndefined();
      expect(result.data.choices).toBeUndefined();
    }
  });
});
