import { MsalProvider } from '@azure/msal-react';
import { msalInstance } from './msalConfig.js';
import type { ReactNode } from 'react';

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Thin wrapper around MsalProvider that binds the singleton msalInstance.
 * Place this at the root of the React tree (wrapping App in main.tsx).
 * All MSAL hooks (useMsal, useIsAuthenticated, useMsalAuthentication) require
 * this provider to be an ancestor in the component tree.
 *
 * CAUTH-02, CAUTH-04
 */
export function AuthProvider({ children }: AuthProviderProps) {
  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
