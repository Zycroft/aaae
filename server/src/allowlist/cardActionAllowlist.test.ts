import { describe, it, expect } from 'vitest';
import { validateCardAction } from './cardActionAllowlist.js';

/**
 * Unit tests for the card action allowlist validator.
 *
 * SERV-07: Action type allowlist
 * SERV-08: OpenUrl domain allowlist
 * SERV-12: These tests are the requirement
 */
describe('validateCardAction', () => {
  // ── Action type allowlist (SERV-07) ─────────────────────────────────────────

  it('allows Action.Submit', () => {
    const result = validateCardAction({ action: 'Action.Submit' });
    expect(result.ok).toBe(true);
  });

  it('rejects a disallowed action type (Action.Execute)', () => {
    const result = validateCardAction({ action: 'Action.Execute' });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Action type not allowed');
    expect(result.reason).toContain('Action.Execute');
  });

  it('rejects when action is missing', () => {
    const result = validateCardAction({});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Missing action type');
  });

  it('rejects when action is not a string', () => {
    const result = validateCardAction({ action: 42 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Action type must be a string');
  });

  // ── OpenUrl domain allowlist (SERV-08) ───────────────────────────────────────

  it('allows Action.OpenUrl with an allowed domain (copilot.microsoft.com)', () => {
    const result = validateCardAction({
      action: 'Action.OpenUrl',
      url: 'https://copilot.microsoft.com/foo',
    });
    expect(result.ok).toBe(true);
  });

  it('allows Action.OpenUrl with an allowed subdomain (sub.microsoft.com)', () => {
    const result = validateCardAction({
      action: 'Action.OpenUrl',
      url: 'https://sub.microsoft.com/bar',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects Action.OpenUrl with a disallowed domain', () => {
    const result = validateCardAction({
      action: 'Action.OpenUrl',
      url: 'https://evil.com/steal',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Domain not allowed');
    expect(result.reason).toContain('evil.com');
  });

  it('rejects Action.OpenUrl with an invalid (non-URL) url value', () => {
    const result = validateCardAction({
      action: 'Action.OpenUrl',
      url: 'not-a-url',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Invalid URL');
  });
});
