import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { SkeletonBubble } from '../components/SkeletonBubble.js';
import { SignInPage } from './SignInPage.js';
import { authEnabled } from './msalConfig.js';

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Gates the app behind MSAL authentication.
 *
 * When authEnabled=false (no Azure credentials at build time), renders children
 * directly — no authentication check, no MSAL hooks.
 *
 * State machine (when auth enabled):
 * 1. MSAL initializing (inProgress !== None) → show skeleton (same pattern as message loading)
 * 2. Not authenticated + MSAL idle → show SignInPage
 * 3. Authenticated → show welcome toast for ~1 second (first time after redirect), then children
 *
 * CRITICAL: InteractionStatus must be checked before isAuthenticated.
 * During a redirect flow, inProgress is 'handleRedirect' — rendering SignInPage during this
 * window would cause a loop. The skeleton during init avoids this.
 *
 * CAUTH-01, CAUTH-02, CAUTH-03
 */
export function AuthGuard({ children }: AuthGuardProps) {
  if (!authEnabled) return <>{children}</>;
  return <AuthGuardMsal>{children}</AuthGuardMsal>;
}

/** Inner component that uses MSAL hooks — only rendered when authEnabled=true */
function AuthGuardMsal({ children }: AuthGuardProps) {
  const { inProgress, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeShownRef = useRef(false);

  // Detect first-time sign-in (redirect just completed): accounts went from 0 → >0
  // Show welcome toast for 1200ms, then dismiss
  useEffect(() => {
    if (isAuthenticated && !welcomeShownRef.current) {
      // Only show welcome if MSAL just completed a redirect (handleRedirect → None transition)
      // Check sessionStorage flag set by SignInPage before redirect
      const justSignedIn = sessionStorage.getItem('msal:justSignedIn') === 'true';
      if (justSignedIn) {
        sessionStorage.removeItem('msal:justSignedIn');
        welcomeShownRef.current = true;
        setShowWelcome(true);
        const timer = setTimeout(() => setShowWelcome(false), 1200);
        return () => clearTimeout(timer);
      }
      welcomeShownRef.current = true;
    }
  }, [isAuthenticated]);

  // Phase 1: MSAL still initializing or processing redirect
  if (inProgress !== InteractionStatus.None) {
    return (
      <div className="authCheckLayout" aria-live="polite" aria-label="Checking authentication…">
        <SkeletonBubble />
      </div>
    );
  }

  // Phase 2: Idle, not authenticated
  if (!isAuthenticated) {
    return <SignInPage />;
  }

  // Phase 3: Authenticated — render children with optional welcome toast
  const name = accounts[0]?.name ?? accounts[0]?.username ?? '';

  return (
    <>
      {showWelcome && (
        <div className="welcomeToast" role="status" aria-live="polite">
          {name ? `Welcome, ${name}` : 'Welcome'}
        </div>
      )}
      {children}
    </>
  );
}
