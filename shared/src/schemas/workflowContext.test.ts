import { describe, it, expect } from 'vitest';
import { WorkflowContextSchema } from './workflowContext.js';
import { SendMessageRequestSchema } from './api.js';

// ──────────────────────────────────────────────────────────────────────────────
// WorkflowContextSchema (CTX-01)
// ──────────────────────────────────────────────────────────────────────────────

describe('WorkflowContextSchema', () => {
  it('parses minimal valid context with step only', () => {
    const result = WorkflowContextSchema.safeParse({
      step: 'gather-name',
    });
    expect(result.success).toBe(true);
  });

  it('parses full context with step, constraints, and collectedData', () => {
    const result = WorkflowContextSchema.safeParse({
      step: 'gather-name',
      constraints: ['max 10 words'],
      collectedData: { name: 'Alice' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.step).toBe('gather-name');
      expect(result.data.constraints).toEqual(['max 10 words']);
      expect(result.data.collectedData).toEqual({ name: 'Alice' });
    }
  });

  it('rejects empty object (step is required)', () => {
    const result = WorkflowContextSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects context with empty step string', () => {
    const result = WorkflowContextSchema.safeParse({ step: '' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SendMessageRequest with optional workflowContext (CTX-01)
// ──────────────────────────────────────────────────────────────────────────────

describe('SendMessageRequestSchema + workflowContext', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts request without workflowContext (backwards-compatible)', () => {
    const result = SendMessageRequestSchema.safeParse({
      conversationId: validUuid,
      text: 'hello',
    });
    expect(result.success).toBe(true);
  });

  it('accepts request with minimal workflowContext', () => {
    const result = SendMessageRequestSchema.safeParse({
      conversationId: validUuid,
      text: 'hello',
      workflowContext: { step: 'gather-name' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workflowContext?.step).toBe('gather-name');
    }
  });

  it('accepts request with full workflowContext', () => {
    const result = SendMessageRequestSchema.safeParse({
      conversationId: validUuid,
      text: 'hello',
      workflowContext: {
        step: 'gather-name',
        constraints: ['max 10 words'],
        collectedData: { name: 'Alice' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects request with workflowContext missing step', () => {
    const result = SendMessageRequestSchema.safeParse({
      conversationId: validUuid,
      text: 'hello',
      workflowContext: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects request with workflowContext empty step', () => {
    const result = SendMessageRequestSchema.safeParse({
      conversationId: validUuid,
      text: 'hello',
      workflowContext: { step: '' },
    });
    expect(result.success).toBe(false);
  });
});
