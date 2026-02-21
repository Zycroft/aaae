/**
 * Card action allowlist validator.
 *
 * Pure function — no side effects, no Express dependencies.
 * Validates whether a card action's submitData is permitted before forwarding to Copilot Studio.
 *
 * SERV-07: Action type allowlist
 * SERV-08: Action.OpenUrl domain allowlist
 * SERV-12: Unit-tested (see cardActionAllowlist.test.ts)
 */

export interface AllowlistResult {
  ok: boolean;
  reason?: string;
}

/**
 * Action types permitted to be forwarded to Copilot Studio.
 * Configurable via comma-separated ALLOWED_ACTION_TYPES env var.
 */
const ALLOWED_ACTION_TYPES: string[] = process.env.ALLOWED_ACTION_TYPES
  ? process.env.ALLOWED_ACTION_TYPES.split(',').map((s) => s.trim())
  : ['Action.Submit', 'Action.OpenUrl'];

/**
 * Domains permitted for Action.OpenUrl.
 * Configurable via comma-separated ALLOWED_DOMAINS env var.
 * Subdomain matching is supported (e.g., sub.microsoft.com matches microsoft.com).
 */
const ALLOWED_DOMAINS: string[] = process.env.ALLOWED_DOMAINS
  ? process.env.ALLOWED_DOMAINS.split(',').map((s) => s.trim())
  : ['copilot.microsoft.com', 'microsoft.com'];

/**
 * Validates a card action's submitData against the configured allowlists.
 *
 * @param submitData - Arbitrary payload from the Adaptive Card form
 * @returns { ok: true } if allowed, { ok: false, reason: string } if rejected
 */
export function validateCardAction(submitData: Record<string, unknown>): AllowlistResult {
  const action = submitData.action;

  // Validate action field presence and type
  if (action === undefined || action === null) {
    return { ok: false, reason: 'Missing action type' };
  }

  if (typeof action !== 'string') {
    return { ok: false, reason: 'Action type must be a string' };
  }

  // Check against action type allowlist
  if (!ALLOWED_ACTION_TYPES.includes(action)) {
    return { ok: false, reason: `Action type not allowed: ${action}` };
  }

  // Additional domain check for OpenUrl actions (SERV-08)
  if (action === 'Action.OpenUrl') {
    const url = submitData.url;

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(String(url ?? ''));
    } catch {
      return { ok: false, reason: 'Invalid URL' };
    }

    const hostname = parsedUrl.hostname;

    // Check hostname against allowlist — exact match or subdomain match
    const domainAllowed = ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );

    if (!domainAllowed) {
      return { ok: false, reason: `Domain not allowed: ${hostname}` };
    }
  }

  return { ok: true };
}
