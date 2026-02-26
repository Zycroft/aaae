# Copilot Studio SDK Configuration Guide

How to configure the Agentic Copilot Chat App to connect to a Microsoft Copilot Studio agent. Covers Azure Portal setup, Copilot Studio setup, and all environment variables for both server and client.

## Prerequisites

- An Azure subscription with access to **Entra External ID** (formerly Azure AD B2C/CIAM)
- A **Copilot Studio** agent deployed in a Power Platform environment
- Node.js 20+ and npm installed locally

## Overview

The app has two separate Azure App Registrations and two `.env` files:

| Component | App Registration | `.env` file | Purpose |
|-----------|-----------------|-------------|---------|
| **Server** (Express) | Server/API app | `server/.env` | Validates JWTs, connects to Copilot Studio SDK |
| **Client** (React SPA) | Client/SPA app | `client/.env` | MSAL sign-in, acquires tokens for the server API |

---

## Step 1: Create the Copilot Studio Agent

1. Go to [Copilot Studio](https://copilotstudio.microsoft.com/)
2. Create or open your agent
3. Note two values from **Settings > Advanced**:
   - **Schema name** — e.g. `cr0ab_agentSchemaName` (used for `COPILOT_AGENT_SCHEMA_NAME`)
4. Go to [Power Platform Admin Center](https://admin.powerplatform.microsoft.com/) > **Environments**
5. Select the environment hosting your agent
6. Copy the **Environment ID** from the URL or details pane (used for `COPILOT_ENVIRONMENT_ID`)

**Current deployment values:**

| Key | Value |
|-----|-------|
| Tenant ID (`COPILOT_TENANT_ID`) | `599505eb-5b0f-4ba0-9a4f-3efe9f4ad5bc` |
| Agent Schema Name (`COPILOT_AGENT_SCHEMA_NAME`) | `copilots_header_8f332` |
| Environment ID (`COPILOT_ENVIRONMENT_ID`) | `eefa33df-14b8-ecbe-a026-0ae24a382712` |
| Agent App ID (`COPILOT_APP_ID`) | `9cc7a937-5eb2-408a-ab48-721df3142946` |

---

## Step 2: Azure App Registrations

You need **two** app registrations in the [Azure Portal](https://portal.azure.com/) > **App Registrations**.

### Which Tenant for Each App Registration?

When working with multiple tenants (e.g. a Copilot tenant, a CIAM authentication tenant, and a test tenant), app registrations must be created in the correct tenant:

| App Registration | Create In | Reason |
|-----------------|-----------|--------|
| **Server / API** (`9cc7a937-...`) | **Copilot tenant** (`599505eb-...`) | The Copilot Studio SDK authenticates using this app's client credentials against the Copilot tenant's authority (`https://login.microsoftonline.com/599505eb-...`). The app registration, the agent, and the token authority must all be in the same tenant. |
| **Client / SPA** | **Authentication (CIAM) tenant** | MSAL signs users in against the CIAM tenant's authority (`https://{name}.ciamlogin.com`). The client app registration must live in the tenant where users authenticate. |

> **Can app registrations live in a separate tenant?** Technically yes — you can mark an app registration as **multi-tenant** (under **Authentication > Supported account types**) so it accepts tokens across tenant boundaries. However, this adds significant complexity: cross-tenant admin consent, token issuer validation across multiple tenants, and additional security surface area. Unless you have a specific requirement, keep each app registration in the tenant where it's used.

> **What about a test tenant?** A test tenant can be used as a source of test users who sign in to the app, but the app registrations themselves should not live there. Test users authenticate against the CIAM tenant where the client app is registered.

**Typical multi-tenant architecture:**

```
┌─────────────────────────┐     ┌─────────────────────────┐
│   Copilot Tenant        │     │   CIAM Tenant           │
│   (599505eb-...)        │     │   (External ID)         │
│                         │     │                         │
│  ┌───────────────────┐  │     │  ┌───────────────────┐  │
│  │ Server App Reg    │  │     │  │ Client App Reg    │  │
│  │ (9cc7a937-...)    │  │     │  │ (SPA)             │  │
│  └───────────────────┘  │     │  └───────────────────┘  │
│  ┌───────────────────┐  │     │  ┌───────────────────┐  │
│  │ Copilot Studio    │  │     │  │ User Flows        │  │
│  │ Agent             │  │     │  │ (sign-up/sign-in) │  │
│  └───────────────────┘  │     │  └───────────────────┘  │
└─────────────────────────┘     └─────────────────────────┘
         ▲                               ▲
         │ SDK token                     │ MSAL sign-in
         │ (client credentials)          │ (auth code + PKCE)
         │                               │
    ┌────┴────────────────────────────────┴────┐
    │          Express Server + React SPA       │
    └──────────────────────────────────────────┘
                      ▲
                      │ sign in
               ┌──────┴──────┐
               │ Test Tenant │
               │ (test users)│
               └─────────────┘
```

### 2a. Server App Registration (API)

This app represents the Express server. Copilot Studio SDK uses its credentials. **Create this in the Copilot tenant** (`599505eb-5b0f-4ba0-9a4f-3efe9f4ad5bc`).

1. **Register the app:**
   - Name: e.g. `Copilot Chat API`
   - Supported account types: depends on your tenant setup
   - No redirect URI needed for the server

2. **Note these values** (from the Overview page):
   - **Application (client) ID** → `COPILOT_APP_ID` and `AZURE_CLIENT_ID` = `9cc7a937-5eb2-408a-ab48-721df3142946`
   - **Directory (tenant) ID** → `COPILOT_TENANT_ID` = `599505eb-5b0f-4ba0-9a4f-3efe9f4ad5bc`

3. **Create a client secret:**
   - Go to **Certificates & Secrets > New client secret**
   - Copy the secret **Value** (not the ID) → `COPILOT_CLIENT_SECRET`
   - Set a reminder for expiration — secrets expire and must be rotated

4. **Expose an API** (for the client SPA to request tokens):
   - Go to **Expose an API**
   - Set **Application ID URI** to `api://9cc7a937-5eb2-408a-ab48-721df3142946`
   - **Add a scope**: `access_as_user` (admin consent: Yes)
   - This creates the scope `api://9cc7a937-5eb2-408a-ab48-721df3142946/access_as_user` that the client requests

5. **Add authorized client application:**
   - Under **Expose an API > Authorized client applications**
   - Add the Client SPA app's client ID (from Step 2b)
   - Select the `access_as_user` scope

### 2b. Client App Registration (SPA)

This app represents the React frontend. MSAL uses it for sign-in. **Create this in the CIAM (External ID) tenant** — the tenant where end users authenticate.

1. **Register the app:**
   - First, **switch to the CIAM tenant** using the directory picker (top-right of Azure Portal)
   - Name: e.g. `Copilot Chat SPA`
   - Supported account types: match your tenant setup
   - **Redirect URI**: type = **Single-page application (SPA)**, URI = `http://localhost:5173` (dev) or your production URL

2. **Note these values:**
   - **Application (client) ID** → `VITE_AZURE_CLIENT_ID`

3. **API permissions:**
   - Go to **API Permissions > Add a permission > My APIs**
   - Select the Server app (Step 2a)
   - Check `access_as_user`
   - Grant admin consent

4. **Authentication settings:**
   - Ensure **Single-page application** redirect URI is registered
   - Under **Implicit grant and hybrid flows**, leave both checkboxes **unchecked** (MSAL v2 uses auth code + PKCE, not implicit)

> For CLI commands to set up all of the above (user permissions, app registrations, CIAM tenant, and validation), see [copilot-cli-setup.md](./copilot-cli-setup.md).

---

## Step 3: Entra External ID (CIAM) Tenant

> **Skipping this step for local testing:** You do not need an External ID tenant to test the app locally. Set `AUTH_REQUIRED=false` in `server/.env` to disable all JWT validation. The client will send requests without a Bearer token and the server will accept them without verifying identity. You still need a valid `COPILOT_STUB_TOKEN` — the Copilot Studio SDK requires a bearer token regardless of whether user auth is enabled. Acquire one manually via Azure CLI or Postman and paste it into `server/.env`. Note that stub tokens expire and must be refreshed periodically. See the [Quick Start: Local Dev (No Auth)](#quick-start-local-dev-no-auth) section for the minimal `.env` setup.

If using Entra External ID (customer-facing auth):

1. Your tenant uses `*.ciamlogin.com` authority URLs (not `login.microsoftonline.com`)
2. The **tenant name** is the prefix — e.g. for `contoso.ciamlogin.com`, the tenant name is `contoso`
3. This value goes into both `AZURE_TENANT_NAME` (server) and `VITE_AZURE_TENANT_NAME` (client)

### Creating an External Tenant

If you don't already have an Entra External ID tenant, follow these steps:

1. **Navigate to Entra External ID:**
   - Go to the [Azure Portal](https://portal.azure.com/)
   - Search for **Microsoft Entra External ID** (or navigate to **Microsoft Entra ID > External Identities**)
   - Click **Get started** or **Create a tenant**

2. **Create the tenant:**
   - Select **Customer** as the tenant type (this creates a CIAM tenant)
   - Enter a **Tenant name** — e.g. `copilotchatapp` (this becomes `copilotchatapp.ciamlogin.com`)
   - Enter a **Domain name** — e.g. `copilotchatapp` (becomes `copilotchatapp.onmicrosoft.com`)
   - Select your **Location** and **Subscription**
   - Click **Review + Create**, then **Create**

3. **Switch to the new tenant:**
   - After creation, click **Switch to new tenant** or use the directory picker (top-right of Azure Portal)
   - Verify you're in the new tenant by checking the tenant name in the top bar

4. **Configure user flows:**
   - Go to **External Identities > User flows**
   - Create a **Sign up and sign in** flow
   - Choose identity providers (e.g. Email + password, Google, Microsoft personal accounts)
   - Customize branding and attributes as needed

5. **Register your apps in the external tenant:**
   - While in the external tenant, go to **App Registrations**
   - Create both the Server and Client app registrations (Step 2a and 2b) inside this tenant
   - This ensures the authority URLs use `*.ciamlogin.com`

### Example: Full External Tenant Setup

Assuming you created a tenant named `copilotchatapp`:

| Setting | Value |
|---------|-------|
| Authority URL | `https://copilotchatapp.ciamlogin.com/copilotchatapp.onmicrosoft.com` |
| `AZURE_TENANT_NAME` (server) | `copilotchatapp` |
| `VITE_AZURE_TENANT_NAME` (client) | `copilotchatapp` |
| Tenant ID | Found in **Overview** page of the external tenant |

The MSAL authority in the client resolves to:
```
https://copilotchatapp.ciamlogin.com/copilotchatapp.onmicrosoft.com
```

The server JWT validation uses the same authority to fetch the OpenID discovery document:
```
https://copilotchatapp.ciamlogin.com/copilotchatapp.onmicrosoft.com/v2.0/.well-known/openid-configuration
```

### Adding External Identity Providers

To allow users to sign in with social accounts or external directories:

1. **Go to** the external tenant > **External Identities > All identity providers**
2. **Add a provider** — e.g. Google:
   - Click **+ Google**
   - Enter your Google OAuth **Client ID** and **Client Secret** (from [Google Cloud Console](https://console.cloud.google.com/) > APIs & Credentials)
   - Save
3. **Link the provider to your user flow:**
   - Go to **User flows** > select your flow
   - Under **Identity providers**, check the providers you want to offer (Email, Google, etc.)
   - Save
4. **Test the flow:**
   - From the user flow page, click **Run user flow**
   - Select the Client app registration
   - The browser opens the sign-in page — verify all providers appear

### Notes

- External tenants are **separate** from your organization's main Entra ID (workforce) tenant. App registrations, users, and policies are isolated.
- The `COPILOT_TENANT_ID` (`599505eb-5b0f-4ba0-9a4f-3efe9f4ad5bc`) is your **workforce tenant** where the Copilot Studio agent and server app live. The external tenant is a separate tenant for end-user authentication.
- If you use a single tenant for both Copilot and user auth, use `login.microsoftonline.com` instead of `ciamlogin.com` and set the authority accordingly.

---

## Step 4: Server Environment Variables

Copy `server/.env.example` to `server/.env` and fill in:

```env
# ─── LLM Provider ─────────────────────────────────────────────
# Which backend to use: "copilot" (default) or "openai"
LLM_PROVIDER=copilot

# ─── Copilot Studio Connection ────────────────────────────────
# Required when LLM_PROVIDER=copilot (server exits if missing)

# Power Platform environment ID
# Where: Power Platform Admin Center > Environments > select env > Environment ID
COPILOT_ENVIRONMENT_ID=eefa33df-14b8-ecbe-a026-0ae24a382712

# Agent schema name
# Where: Copilot Studio > your agent > Settings > Advanced > Schema name
COPILOT_AGENT_SCHEMA_NAME=copilots_header_8f332

# Azure AD tenant ID (Directory ID)
# Where: Azure Portal > App Registrations > your server app > Overview > Directory (tenant) ID
COPILOT_TENANT_ID=599505eb-5b0f-4ba0-9a4f-3efe9f4ad5bc

# Azure AD app client ID (for Copilot SDK auth)
# Where: Azure Portal > App Registrations > your server app > Overview > Application (client) ID
COPILOT_APP_ID=9cc7a937-5eb2-408a-ab48-721df3142946

# Azure AD app client secret
# Where: Azure Portal > App Registrations > your server app > Certificates & Secrets
# WARNING: Never commit real secrets
COPILOT_CLIENT_SECRET=your-client-secret-value

# Stub bearer token for local dev (bypasses real token acquisition)
# Leave blank in production — see "Token Acquisition" section below
COPILOT_STUB_TOKEN=

# ─── JWT Authentication ───────────────────────────────────────

# Set to "false" to skip JWT validation for local dev
# Default: "true" (fail-closed — server exits if AZURE_CLIENT_ID is missing)
AUTH_REQUIRED=false

# Entra External ID tenant name (prefix of *.ciamlogin.com)
# Where: Azure Portal > Entra External ID > Overview
AZURE_TENANT_NAME=contoso

# Server app client ID (same as COPILOT_APP_ID if using one registration)
# Where: Azure Portal > App Registrations > your server app > Overview
AZURE_CLIENT_ID=9cc7a937-5eb2-408a-ab48-721df3142946

# Comma-separated tenant IDs allowed to access the API
# Empty = fail-closed (blocks all tenants)
# Where: Azure Portal > Entra External ID > Overview > Tenant ID
ALLOWED_TENANT_IDS=599505eb-5b0f-4ba0-9a4f-3efe9f4ad5bc

# ─── Server Config ────────────────────────────────────────────
PORT=3001
CORS_ORIGIN=http://localhost:5173

# ─── Redis (optional) ────────────────────────────────────────
# When unset, server uses in-memory store (fine for local dev)
# Must use rediss:// (TLS) scheme for Azure Cache for Redis
# REDIS_URL=rediss://:access-key@your-cache.redis.cache.windows.net:6380
# REDIS_TTL=86400
# REDIS_TIMEOUT=5000
```

### Required vs Optional

| Variable | Required When | Validated At |
|----------|--------------|--------------|
| `COPILOT_ENVIRONMENT_ID` | `LLM_PROVIDER=copilot` | Startup (fatal exit) |
| `COPILOT_AGENT_SCHEMA_NAME` | `LLM_PROVIDER=copilot` | Startup (fatal exit) |
| `COPILOT_TENANT_ID` | Production Copilot auth | Runtime (token acquisition) |
| `COPILOT_APP_ID` | Production Copilot auth | Runtime (token acquisition) |
| `COPILOT_CLIENT_SECRET` | Production Copilot auth | Runtime (token acquisition) |
| `AZURE_CLIENT_ID` | `AUTH_REQUIRED=true` | Startup (fatal exit) |
| `AZURE_TENANT_NAME` | `AUTH_REQUIRED=true` | Runtime (JWT validation) |
| `ALLOWED_TENANT_IDS` | `AUTH_REQUIRED=true` | Runtime (empty = block all) |
| `OPENAI_API_KEY` | `LLM_PROVIDER=openai` | Startup (fatal exit) |

---

## Step 5: Client Environment Variables

Copy `client/.env.example` to `client/.env` and fill in:

```env
# Express server URL (no trailing slash)
VITE_API_URL=http://localhost:3001

# Client SPA app client ID
# Where: Azure Portal > App Registrations > your SPA app > Overview > Application (client) ID
VITE_AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Entra External ID tenant name (same as server's AZURE_TENANT_NAME)
VITE_AZURE_TENANT_NAME=contoso

# Redirect URI (must be registered in Azure Portal > Authentication)
VITE_AZURE_REDIRECT_URI=http://localhost:5173
```

The client MSAL config builds an authority URL from the tenant name:
```
https://{tenantName}.ciamlogin.com/{tenantName}.onmicrosoft.com
```

The login scope requested is:
```
api://{VITE_AZURE_CLIENT_ID}/access_as_user
```

---

## Step 6: Token Acquisition (Current State)

The Copilot Studio SDK requires a bearer token. The current implementation in `server/src/copilot.ts` uses a **stub token** (`COPILOT_STUB_TOKEN`) passed directly to the SDK constructor:

```typescript
const copilotClient = new CopilotStudioClient(copilotSettings, STUB_TOKEN);
```

### Getting a Stub Token for Local Dev

To get a working stub token for local testing, you need to acquire one manually:

1. Use a tool like Postman or the Azure CLI to get a token
2. The token must have the correct scope for the Copilot Studio API
3. Set the token value in `COPILOT_STUB_TOKEN`
4. Note: stub tokens expire — you'll need to refresh periodically

### Production Token Flow (Not Yet Implemented)

The planned production flow uses MSAL On-Behalf-Of (OBO):

1. Client signs in via MSAL and gets an access token
2. Client sends the token as `Authorization: Bearer <token>` to the Express server
3. Server validates the JWT (auth middleware)
4. Server exchanges the user's token for a Copilot-scoped token using OBO:
   ```typescript
   import { ConfidentialClientApplication } from '@azure/msal-node';

   const cca = new ConfidentialClientApplication({
     auth: {
       clientId: config.COPILOT_APP_ID,
       authority: `https://login.microsoftonline.com/${config.COPILOT_TENANT_ID}`,
       clientSecret: config.COPILOT_CLIENT_SECRET,
     },
   });

   const result = await cca.acquireTokenOnBehalfOf({
     oboAssertion: userBearerToken,
     scopes: [CopilotStudioClient.scopeFromSettings(copilotSettings)],
   });

   const client = new CopilotStudioClient(copilotSettings, result.accessToken);
   ```
5. The OBO token is used to call Copilot Studio on behalf of the signed-in user

---

## Quick Start: Local Dev (No Auth)

Minimal setup to get running with Copilot Studio locally:

```env
# server/.env
LLM_PROVIDER=copilot
COPILOT_ENVIRONMENT_ID=eefa33df-14b8-ecbe-a026-0ae24a382712
COPILOT_AGENT_SCHEMA_NAME=copilots_header_8f332
COPILOT_STUB_TOKEN=your-manually-acquired-token
AUTH_REQUIRED=false
CORS_ORIGIN=http://localhost:5173
```

```env
# client/.env
VITE_API_URL=http://localhost:3001
```

Then run:
```bash
npm run dev
```

---

## Quick Start: Local Dev (OpenAI Mode, No Copilot)

If you don't have Copilot Studio credentials, use OpenAI mode:

```env
# server/.env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-key
AUTH_REQUIRED=false
```

```env
# client/.env
VITE_API_URL=http://localhost:3001
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `[config] FATAL: Missing required env var: COPILOT_ENVIRONMENT_ID` | Missing Copilot config | Set `COPILOT_ENVIRONMENT_ID` in `server/.env` |
| `[config] FATAL: AUTH_REQUIRED=true but AZURE_CLIENT_ID is not set` | Auth enabled without Azure config | Set `AZURE_CLIENT_ID` or set `AUTH_REQUIRED=false` |
| `[config] FATAL: LLM_PROVIDER="xyz" is not valid` | Invalid provider value | Set `LLM_PROVIDER` to `copilot` or `openai` |
| `[auth] Rejected: token_expired` | JWT expired | Re-authenticate from client or refresh stub token |
| `[auth] Rejected: audience_mismatch` | Token audience doesn't match | Verify `AZURE_CLIENT_ID` matches the server app registration |
| `[auth] Rejected: issuer_mismatch` | Wrong tenant name | Verify `AZURE_TENANT_NAME` matches your CIAM tenant |
| `[auth] Rejected: tenant_not_allowed` | Tenant ID not in allowlist | Add tenant ID to `ALLOWED_TENANT_IDS` |
