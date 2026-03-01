import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

/**
 * MSAL configuration for Entra External ID (CIAM).
 * Authority uses ciamlogin.com — NOT login.microsoftonline.com.
 * See STATE.md decision: CIAM authority URLs use ciamlogin.com.
 *
 * When VITE_AZURE_CLIENT_ID is not set (e.g. local dev or AUTH_REQUIRED=false deployments),
 * MSAL is disabled entirely — authEnabled=false bypasses all auth checks client-side.
 *
 * CAUTH-02, CAUTH-04
 */
const tenantName = import.meta.env.VITE_AZURE_TENANT_NAME as string;
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID as string;
const redirectUri = (import.meta.env.VITE_AZURE_REDIRECT_URI as string) || window.location.origin;

/** True when Azure auth credentials are configured at build time */
export const authEnabled = Boolean(clientId);

const msalConfig: Configuration = {
  auth: {
    clientId: clientId || 'placeholder',
    authority: tenantName
      ? `https://${tenantName}.ciamlogin.com/${tenantName}.onmicrosoft.com`
      : 'https://login.microsoftonline.com/common',
    redirectUri,
    postLogoutRedirectUri: redirectUri,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

/**
 * The API scopes to request. Adjust to match your server app registration's exposed API scope.
 * Format: api://{server-app-client-id}/{scope-name}
 * The token acquired with these scopes is the Bearer token sent to the Express server.
 */
export const loginRequest = {
  scopes: authEnabled ? [`api://${clientId}/access_as_user`] : [],
};

/**
 * Singleton PublicClientApplication instance.
 * Only used when authEnabled=true. When auth is disabled, components bypass MSAL entirely.
 */
export const msalInstance = new PublicClientApplication(msalConfig);
