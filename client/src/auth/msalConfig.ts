import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

/**
 * MSAL configuration for Entra External ID (CIAM).
 * Authority uses ciamlogin.com — NOT login.microsoftonline.com.
 * See STATE.md decision: CIAM authority URLs use ciamlogin.com.
 *
 * CAUTH-02, CAUTH-04
 */
const tenantName = import.meta.env.VITE_AZURE_TENANT_NAME as string;
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID as string;
const redirectUri = (import.meta.env.VITE_AZURE_REDIRECT_URI as string) || window.location.origin;

const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://${tenantName}.ciamlogin.com/${tenantName}.onmicrosoft.com`,
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
  scopes: [`api://${clientId}/access_as_user`],
};

/**
 * Singleton PublicClientApplication instance.
 * Created once; shared across the app via MsalProvider context.
 */
export const msalInstance = new PublicClientApplication(msalConfig);
