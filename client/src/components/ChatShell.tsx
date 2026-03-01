import './chat.css';
import { useMsal } from '@azure/msal-react';
import { useCallback } from 'react';
import { useChatApi } from '../hooks/useChatApi.js';
import { useTheme } from '../hooks/useTheme.js';
import { TranscriptView } from './TranscriptView.js';
import { ChatInput } from './ChatInput.js';
import { ThemeToggle } from './ThemeToggle.js';
import { MetadataPane } from './MetadataPane.js';
import { WorkflowProgress } from './WorkflowProgress.js';
import { WorkflowComplete } from './WorkflowComplete.js';
import { authEnabled, loginRequest, msalInstance } from '../auth/msalConfig.js';

/**
 * Top-level chat UI shell.
 * Wires useChatApi state into the transcript and input components.
 * Manages theme via useTheme hook (UI-13).
 * Layout uses responsive split-pane grid (UI-01) with metadata drawer slot.
 *
 * When authEnabled=false, bypasses MSAL entirely and uses a stub token.
 * When authEnabled=true, acquires Bearer tokens silently before each API call.
 *
 * UI-01, UI-02, UI-03, UI-04, UI-05, UI-07, UI-09, UI-13, SHELL-01, SHELL-02, CAUTH-04, CAUTH-05, CAUTH-06, CAUTH-07
 */
export function ChatShell() {
  if (!authEnabled) return <ChatShellNoAuth />;
  return <ChatShellAuth />;
}

/** Chat shell with MSAL authentication — only rendered when authEnabled=true */
function ChatShellAuth() {
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

  function handleSignOut() {
    void msalInstance.logoutRedirect({
      account: accounts[0],
      postLogoutRedirectUri: window.location.origin,
    });
  }

  return <ChatShellUI getToken={getToken} onSignOut={handleSignOut} theme={theme} onToggleTheme={toggle} />;
}

/** Chat shell without authentication — rendered when authEnabled=false */
function ChatShellNoAuth() {
  const { theme, toggle } = useTheme();
  const getToken = useCallback(async () => 'no-auth', []);

  return <ChatShellUI getToken={getToken} theme={theme} onToggleTheme={toggle} />;
}

/** Shared chat UI rendering — receives auth-related callbacks as props */
function ChatShellUI({
  getToken,
  onSignOut,
  theme,
  onToggleTheme,
}: {
  getToken: () => Promise<string>;
  onSignOut?: () => void;
  theme: string;
  onToggleTheme: () => void;
}) {
  const { messages, isLoading, error, sendMessage, cardAction, workflowState, resetConversation } = useChatApi({ getToken });

  return (
    <div className="appLayout">
      {/* Left column: full chat UI */}
      <div className="chatPane">
        <div className="chatShell">
          {error && <div className="globalError">{error}</div>}
          {workflowState?.status === 'error' && (
            <div className="workflowError" role="alert">
              <span className="workflowErrorMessage">
                The workflow encountered an error.
              </span>
              <button
                type="button"
                className="workflowErrorRetry"
                onClick={resetConversation}
              >
                Start over
              </button>
            </div>
          )}
          <div className="chatHeader">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            {onSignOut && (
              <button
                type="button"
                className="signOutButton"
                onClick={onSignOut}
                aria-label="Sign out"
              >
                Sign out
              </button>
            )}
          </div>
          <WorkflowProgress workflowState={workflowState} />
          {workflowState?.status === 'completed' ? (
            <WorkflowComplete workflowState={workflowState} onReset={resetConversation} />
          ) : (
            <>
              <TranscriptView messages={messages} isLoading={isLoading} onCardAction={cardAction} />
              <ChatInput
                onSend={sendMessage}
                disabled={isLoading}
                suggestedInputType={workflowState?.suggestedInputType}
                choices={workflowState?.choices}
              />
            </>
          )}
        </div>
      </div>
      {/* Phase 4: metadata drawer — UI-11, UI-12 */}
      <MetadataPane messages={messages} workflowState={workflowState} />
    </div>
  );
}
