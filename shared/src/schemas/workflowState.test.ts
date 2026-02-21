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
