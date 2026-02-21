import './chat.css';
import { useMsal } from '@azure/msal-react';
import { useCallback } from 'react';
import { useChatApi } from '../hooks/useChatApi.js';
import { useTheme } from '../hooks/useTheme.js';
import { TranscriptView } from './TranscriptView.js';
import { ChatInput } from './ChatInput.js';
import { ThemeToggle } from './ThemeToggle.js';
import { MetadataPane } from './MetadataPane.js';
import { loginRequest, msalInstance } from '../auth/msalConfig.js';

/**
 * Top-level chat UI shell.
 * Wires useChatApi state into the transcript and input components.
 * Manages theme via useTheme hook (UI-13).
 * Layout uses responsive split-pane grid (UI-01) with metadata drawer slot.
 *
 * Acquires Bearer tokens silently before each API call (CAUTH-04, CAUTH-07).
 * Provides sign-out capability (CAUTH-06).
 *
 * UI-01, UI-02, UI-03, UI-04, UI-05, UI-07, UI-09, UI-13, CAUTH-04, CAUTH-05, CAUTH-06, CAUTH-07
 */
export function ChatShell() {
  const { instance, accounts } = useMsal();
  const { theme, toggle } = useTheme();

  /**
   * Acquires a valid access token for the server API.
   * 1. Try silent acquisition (uses cached token if valid, refreshes if near-expiry)
   * 2. If silent fails (interaction_required or network error): fall back to loginRedirect
   *
   * CAUTH-04, CAUTH-07: Silent refresh keeps session alive without UI disruption.
   */
  const getToken = useCallback(async (): Promise<string> => {
    const account = accounts[0];
    try {
      const result = await instance.acquireTokenSilent({
        ...loginRequest,
        account,
      });
      return result.accessToken;
    } catch {
      // Silent failed — redirect to Entra for re-authentication
      // This handles: token expired beyond refresh window, interaction_required, network errors
      await instance.loginRedirect(loginRequest);
      // loginRedirect navigates away; this line never executes
      throw new Error('Redirecting to sign-in');
    }
  }, [instance, accounts]);

  /**
   * Signs the user out: clears MSAL token cache, redirects browser to sign-in page.
   * No confirmation dialog per CONTEXT.md decision.
   * CAUTH-06
   */
  function handleSignOut() {
    void msalInstance.logoutRedirect({
      account: accounts[0],
      postLogoutRedirectUri: window.location.origin,
    });
  }

  const { messages, isLoading, error, sendMessage, cardAction } = useChatApi({ getToken });

  return (
    <div className="appLayout">
      {/* Left column: full chat UI */}
      <div className="chatPane">
        <div className="chatShell">
          {error && <div className="globalError">{error}</div>}
          <div className="chatHeader">
            <ThemeToggle theme={theme} onToggle={toggle} />
            <button
              type="button"
              className="signOutButton"
              onClick={handleSignOut}
              aria-label="Sign out"
            >
              Sign out
            </button>
          </div>
          <TranscriptView messages={messages} isLoading={isLoading} onCardAction={cardAction} />
          <ChatInput onSend={sendMessage} disabled={isLoading} />
        </div>
      </div>
      {/* Phase 4: metadata drawer — UI-11, UI-12 */}
      <MetadataPane messages={messages} />
    </div>
  );
}
