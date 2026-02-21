# Phase 7: Client MSAL Authentication - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Gate the chat UI behind Entra External ID (CIAM) sign-in using MSAL React. Unauthenticated users see a sign-in page and cannot access the chat. Authenticated users interact with the chat identically to v1.1, with tokens acquired and refreshed silently. Every API call includes an Authorization: Bearer header automatically.

</domain>

<decisions>
## Implementation Decisions

### Sign-in Page Appearance

- Centered card with "Sign in with Microsoft" button
- Respects existing dark/light theme (uses CSS custom properties from v1.0)
- No custom branding beyond the app name — Entra handles the actual login UI via redirect
- Minimal design: app title, sign-in button, nothing else

### Auth State Transitions

- **Initial load (checking auth):** Show the chat layout skeleton (same skeleton pattern used for message loading). This feels fast and avoids a jarring blank screen.
- **Not authenticated → sign-in page:** Brief fade transition from skeleton to sign-in card. Smoother than an instant swap.
- **After successful sign-in (redirect back):** Show a brief "Welcome, {name}" message for ~1 second before rendering the chat UI. Uses the `name` claim from UserClaims if available, falls back to "Welcome" without a name.
- **prefers-reduced-motion:** Fade transitions disabled; instant swaps used instead (consistent with v1.0 accessibility pattern).

### Sign-out Flow

- Sign-out button in the header area (visible on all screen sizes)
- Immediate sign-out — no confirmation dialog
- Clears MSAL token cache, returns browser to the sign-in page
- No "are you sure" prompt — signing back in is easy

### Token Failure UX

- Silent token refresh happens in the background (acquireTokenSilent)
- If silent refresh fails: automatic redirect to Entra login page (acquireTokenRedirect fallback)
- No disruptive modal or in-app error — just re-authenticate seamlessly
- If redirect also fails: show error toast (same pattern as v1.0 network errors)

### Claude's Discretion

- MSAL configuration details (scopes, cache storage type)
- Exact skeleton-to-content transition timing
- How to structure the AuthGuard/MsalProvider component hierarchy
- Error boundary placement around auth components

</decisions>

<specifics>
## Specific Ideas

- The chat skeleton during auth check should be the exact same component used for message loading skeletons — no new loading UI needed
- "Welcome, {name}" should feel lightweight, not a splash screen — think a small toast or fade-in text, not a blocking page
- Sign-in page should look like it belongs to the same app — same background, same typography tokens, just different content

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-client-msal-authentication*
*Context gathered: 2026-02-21*
