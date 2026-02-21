import { useMsal } from '@azure/msal-react';
import { loginRequest } from './msalConfig.js';

/**
 * Sign-in page shown to unauthenticated users.
 * Centered card using existing CSS design tokens — matches app visual identity.
 * No custom branding beyond the app name. Entra handles the actual login UI.
 *
 * Sign-in flow:
 * 1. Set sessionStorage flag so AuthGuard shows welcome toast after redirect
 * 2. Call instance.loginRedirect() — browser navigates to Entra login
 * 3. After user authenticates, Entra redirects back to VITE_AZURE_REDIRECT_URI
 * 4. MSAL processes the redirect hash, sets account in cache, inProgress → None
 * 5. AuthGuard sees isAuthenticated=true → renders children
 *
 * CAUTH-01, CAUTH-02
 */
export function SignInPage() {
  const { instance } = useMsal();

  async function handleSignIn() {
    sessionStorage.setItem('msal:justSignedIn', 'true');
    await instance.loginRedirect(loginRequest);
  }

  return (
    <div className="signInLayout">
      <div className="signInCard">
        <h1 className="signInTitle">Copilot Chat</h1>
        <p className="signInSubtitle">Sign in to continue</p>
        <button
          type="button"
          className="signInButton"
          onClick={() => void handleSignIn()}
        >
          Sign in with Microsoft
        </button>
      </div>
    </div>
  );
}
