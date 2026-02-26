# Copilot Chat App — Azure CLI Setup

End-to-end CLI commands to configure Azure tenants, app registrations, and CIAM for the Agentic Copilot Chat App. Mirrors the steps in [copilot-config.md](./copilot-config.md).

## Variables used throughout

Set these once at the top of your terminal session. Update placeholders as you go.

```bash
# ─── Known values ────────────────────────────────────────────
COPILOT_TENANT_ID="599505eb-5b0f-4ba0-9a4f-3efe9f4ad5bc"
SERVER_APP_ID="9cc7a937-5eb2-408a-ab48-721df3142946"
COPILOT_AGENT_SCHEMA_NAME="copilots_header_8f332"
COPILOT_ENVIRONMENT_ID="eefa33df-14b8-ecbe-a026-0ae24a382712"

# ─── Set these yourself ──────────────────────────────────────
CIAM_TENANT_NAME="copilotchatapp"            # your CIAM tenant prefix
CIAM_TENANT_ID="<your-ciam-tenant-id>"       # filled in after Step 3
CLIENT_APP_ID="<your-client-app-id>"         # filled in after Step 2
USER_EMAIL="developer@yourdomain.com"        # user to grant permissions
```

---

## Step 1: Prerequisites and User Permissions

### 1a. Install and login

```bash
# Install Azure CLI (macOS)
brew install azure-cli

# Verify installation
az version

# Login — opens a browser for interactive auth
az login

# Verify you're in the right tenant
az account show --query "{tenant:tenantId, user:user.name}" -o table
```

### 1b. Add a user with app registration permissions — Copilot tenant

The user running these commands must be a **Global Administrator** or **Privileged Role Administrator**.

```bash
# Switch to the Copilot tenant
az login --tenant $COPILOT_TENANT_ID

# ── Option A: Create a new user in this tenant ──
az ad user create \
  --display-name "App Developer" \
  --user-principal-name $USER_EMAIL \
  --password "TempP@ss1234!" \
  --force-change-password-next-sign-in true

# ── Option B: Invite an external user as a guest ──
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/invitations" \
  --body "{
    \"invitedUserEmailAddress\": \"$USER_EMAIL\",
    \"inviteRedirectUrl\": \"https://portal.azure.com\",
    \"sendInvitationMessage\": true
  }"

# Get the user's object ID
USER_OBJECT_ID=$(az ad user show --id "$USER_EMAIL" --query id -o tsv)
echo "User Object ID: $USER_OBJECT_ID"

# Activate the Application Administrator role (idempotent — safe to re-run)
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/directoryRoles" \
  --body "{
    \"roleTemplateId\": \"9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3\"
  }" 2>/dev/null || true

# Get the activated role ID
APP_ADMIN_ROLE_ID=$(az rest --method GET \
  --uri "https://graph.microsoft.com/v1.0/directoryRoles" \
  --query "value[?displayName=='Application Administrator'].id" -o tsv)

# Assign the role to the user
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/directoryRoles/$APP_ADMIN_ROLE_ID/members/\$ref" \
  --body "{
    \"@odata.id\": \"https://graph.microsoft.com/v1.0/directoryObjects/$USER_OBJECT_ID\"
  }"

echo "User $USER_EMAIL now has Application Administrator role in Copilot tenant"
```

### 1c. Add the same user to the CIAM tenant

> Skip this step if you haven't created the CIAM tenant yet — come back after Step 3.

```bash
# Switch to the CIAM tenant
az login --tenant $CIAM_TENANT_ID

# Invite the user as a guest
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/invitations" \
  --body "{
    \"invitedUserEmailAddress\": \"$USER_EMAIL\",
    \"inviteRedirectUrl\": \"https://portal.azure.com\",
    \"sendInvitationMessage\": true
  }"

# Get the user's object ID in this tenant
USER_OBJECT_ID=$(az ad user show --id "$USER_EMAIL" --query id -o tsv)

# Activate and assign Application Administrator role
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/directoryRoles" \
  --body "{
    \"roleTemplateId\": \"9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3\"
  }" 2>/dev/null || true

APP_ADMIN_ROLE_ID=$(az rest --method GET \
  --uri "https://graph.microsoft.com/v1.0/directoryRoles" \
  --query "value[?displayName=='Application Administrator'].id" -o tsv)

az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/directoryRoles/$APP_ADMIN_ROLE_ID/members/\$ref" \
  --body "{
    \"@odata.id\": \"https://graph.microsoft.com/v1.0/directoryObjects/$USER_OBJECT_ID\"
  }"

echo "User $USER_EMAIL now has Application Administrator role in CIAM tenant"
```

> **Least-privilege alternative:** Skip the role assignments above and instead add the user as an **Owner** of each specific app registration (shown in Step 2).

---

## Step 2: Create App Registrations

### 2a. Server app registration — Copilot tenant

```bash
# Switch to the Copilot tenant
az login --tenant $COPILOT_TENANT_ID

# ── Create the app ──
SERVER_APP_ID=$(az ad app create \
  --display-name "Copilot Chat API" \
  --sign-in-audience "AzureADMyOrg" \
  --query appId -o tsv)

echo "Server App (client) ID: $SERVER_APP_ID"

# Set the Application ID URI
az ad app update --id $SERVER_APP_ID \
  --identifier-uris "api://$SERVER_APP_ID"

# Generate a GUID for the scope
SCOPE_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
echo "Scope ID: $SCOPE_ID  (save this — needed for the client app in Step 2b)"

# Add the access_as_user scope
az ad app update --id $SERVER_APP_ID \
  --set api="{
    \"oauth2PermissionScopes\": [{
      \"id\": \"$SCOPE_ID\",
      \"adminConsentDescription\": \"Allow the app to access the API on behalf of the signed-in user\",
      \"adminConsentDisplayName\": \"Access as user\",
      \"isEnabled\": true,
      \"type\": \"User\",
      \"userConsentDescription\": \"Allow the app to access the API on your behalf\",
      \"userConsentDisplayName\": \"Access as user\",
      \"value\": \"access_as_user\"
    }]
  }"

# Create a client secret (valid for 2 years)
SECRET=$(az ad app credential reset \
  --id $SERVER_APP_ID \
  --append \
  --years 2 \
  --query password -o tsv)

echo "Client Secret (save this — it won't be shown again): $SECRET"

# Create a service principal
az ad sp create --id $SERVER_APP_ID

# Add user as Owner (least-privilege — optional if they have Application Administrator)
USER_OBJECT_ID=$(az ad user show --id "$USER_EMAIL" --query id -o tsv)
az ad app owner add --id $SERVER_APP_ID --owner-object-id $USER_OBJECT_ID

# ── Verify ──
echo "=== Server App Registration ==="
az ad app show --id $SERVER_APP_ID \
  --query "{appId:appId, displayName:displayName, identifierUris:identifierUris}" -o table
```

### 2b. Client SPA app registration — CIAM tenant

```bash
# Switch to the CIAM tenant
az login --tenant $CIAM_TENANT_ID

# ── Create the app ──
CLIENT_APP_ID=$(az ad app create \
  --display-name "Copilot Chat SPA" \
  --sign-in-audience "AzureADMyOrg" \
  --query appId -o tsv)

echo "Client App (client) ID: $CLIENT_APP_ID"

# Set the redirect URI as SPA type (not web)
az rest --method PATCH \
  --uri "https://graph.microsoft.com/v1.0/applications(appId='$CLIENT_APP_ID')" \
  --body "{
    \"web\": { \"redirectUris\": [] },
    \"spa\": { \"redirectUris\": [\"http://localhost:5173\"] }
  }"

# Add API permission for the server app's access_as_user scope
# Use the SCOPE_ID from Step 2a
az ad app permission add \
  --id $CLIENT_APP_ID \
  --api $SERVER_APP_ID \
  --api-permissions "$SCOPE_ID=Scope"

# Grant admin consent
az ad app permission admin-consent --id $CLIENT_APP_ID

# Create a service principal
az ad sp create --id $CLIENT_APP_ID

# Add user as Owner
USER_OBJECT_ID=$(az ad user show --id "$USER_EMAIL" --query id -o tsv)
az ad app owner add --id $CLIENT_APP_ID --owner-object-id $USER_OBJECT_ID

# ── Authorize the client in the server app ──
# Switch back to Copilot tenant to add the client as an authorized app
az login --tenant $COPILOT_TENANT_ID

# Get the server app's object ID (not the appId)
SERVER_OBJECT_ID=$(az ad app show --id $SERVER_APP_ID --query id -o tsv)

# Add the client as a pre-authorized application for the access_as_user scope
az rest --method PATCH \
  --uri "https://graph.microsoft.com/v1.0/applications/$SERVER_OBJECT_ID" \
  --body "{
    \"api\": {
      \"preAuthorizedApplications\": [{
        \"appId\": \"$CLIENT_APP_ID\",
        \"delegatedPermissionIds\": [\"$SCOPE_ID\"]
      }]
    }
  }"

echo "Client app $CLIENT_APP_ID authorized on server app"

# ── Verify ──
echo "=== Client App Registration ==="
az login --tenant $CIAM_TENANT_ID --output none
az ad app show --id $CLIENT_APP_ID \
  --query "{appId:appId, displayName:displayName}" -o table
```

### 2c. Updating existing app registrations

```bash
# ── Rotate server app secret (Copilot tenant) ──
az login --tenant $COPILOT_TENANT_ID

# Create a new secret
NEW_SECRET=$(az ad app credential reset \
  --id $SERVER_APP_ID \
  --append \
  --years 2 \
  --query password -o tsv)
echo "New secret: $NEW_SECRET"

# List existing credentials to find old ones
az ad app credential list --id $SERVER_APP_ID \
  --query "[].{keyId:keyId, endDateTime:endDateTime}" -o table

# Remove an old credential by key ID
# az ad app credential delete --id $SERVER_APP_ID --key-id "<old-key-id>"

# ── Add production redirect URIs (CIAM tenant) ──
az login --tenant $CIAM_TENANT_ID

az rest --method PATCH \
  --uri "https://graph.microsoft.com/v1.0/applications(appId='$CLIENT_APP_ID')" \
  --body "{
    \"spa\": {
      \"redirectUris\": [
        \"http://localhost:5173\",
        \"https://yourapp.com\"
      ]
    }
  }"
```

---

## Step 3: Create CIAM (External ID) Tenant

> **Skip this step for local testing.** Set `AUTH_REQUIRED=false` in `server/.env` and use a stub token. See the Quick Start section in [copilot-config.md](./copilot-config.md).

### 3a. Create the tenant

CIAM tenant creation is not fully supported via CLI — you must use the Azure Portal for the initial creation:

1. Go to [Azure Portal](https://portal.azure.com/) > **Microsoft Entra External ID**
2. Click **Create a tenant** > select **Customer** type
3. Enter tenant name (e.g. `copilotchatapp`) and domain
4. Select location and subscription > **Create**

Once created, capture the tenant ID:

```bash
# Login to the new CIAM tenant
az login --tenant "${CIAM_TENANT_NAME}.onmicrosoft.com"

# Get the tenant ID
CIAM_TENANT_ID=$(az account show --query tenantId -o tsv)
echo "CIAM Tenant ID: $CIAM_TENANT_ID"
```

### 3b. Configure user flows

User flow creation requires the Portal UI, but you can verify the tenant is set up:

```bash
# Verify you're in the CIAM tenant
az account show --query "{name:name, tenantId:tenantId}" -o table

# List existing app registrations (should be empty for a new tenant)
az ad app list --query "[].{appId:appId, displayName:displayName}" -o table
```

After creating user flows in the Portal (see [copilot-config.md](./copilot-config.md) Step 3), proceed to create the client app registration:

```bash
# Now run Step 2b above to create the client app in this tenant
# Then run Step 1c to grant user permissions in this tenant
```

### 3c. Add external identity providers

```bash
# Login to the CIAM tenant
az login --tenant $CIAM_TENANT_ID

# List currently configured identity providers
az rest --method GET \
  --uri "https://graph.microsoft.com/v1.0/identity/identityProviders" \
  --query "value[].{type:identityProviderType, name:displayName}" -o table

# Add Google as an identity provider
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/identity/identityProviders" \
  --body "{
    \"@odata.type\": \"microsoft.graph.socialIdentityProvider\",
    \"displayName\": \"Google\",
    \"identityProviderType\": \"Google\",
    \"clientId\": \"<your-google-client-id>\",
    \"clientSecret\": \"<your-google-client-secret>\"
  }"

# Add Microsoft personal accounts as an identity provider
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/identity/identityProviders" \
  --body "{
    \"@odata.type\": \"microsoft.graph.socialIdentityProvider\",
    \"displayName\": \"Microsoft\",
    \"identityProviderType\": \"MicrosoftAccount\",
    \"clientId\": \"<your-microsoft-client-id>\",
    \"clientSecret\": \"<your-microsoft-client-secret>\"
  }"

# Verify providers were added
az rest --method GET \
  --uri "https://graph.microsoft.com/v1.0/identity/identityProviders" \
  --query "value[].{type:identityProviderType, name:displayName}" -o table
```

---

## Step 4: Validate the Configuration

Run these commands to verify everything is wired up correctly.

### 4a. Validate the server app registration (Copilot tenant)

```bash
az login --tenant $COPILOT_TENANT_ID

echo "=== Server App Registration ==="
az ad app show --id $SERVER_APP_ID --query "{
  appId: appId,
  displayName: displayName,
  identifierUris: identifierUris,
  signInAudience: signInAudience
}" -o jsonc

# Verify the Application ID URI is set
URI=$(az ad app show --id $SERVER_APP_ID --query "identifierUris[0]" -o tsv)
if [ "$URI" = "api://$SERVER_APP_ID" ]; then
  echo "PASS: Application ID URI is set correctly"
else
  echo "FAIL: Application ID URI is '$URI', expected 'api://$SERVER_APP_ID'"
fi

# Verify the access_as_user scope exists
SCOPE=$(az ad app show --id $SERVER_APP_ID \
  --query "api.oauth2PermissionScopes[?value=='access_as_user'].value" -o tsv)
if [ "$SCOPE" = "access_as_user" ]; then
  echo "PASS: access_as_user scope exists"
else
  echo "FAIL: access_as_user scope not found"
fi

# Verify the service principal exists
SP=$(az ad sp show --id $SERVER_APP_ID --query appId -o tsv 2>/dev/null)
if [ "$SP" = "$SERVER_APP_ID" ]; then
  echo "PASS: Service principal exists"
else
  echo "FAIL: Service principal not found — run: az ad sp create --id $SERVER_APP_ID"
fi

# Verify credentials exist (at least one secret)
CRED_COUNT=$(az ad app credential list --id $SERVER_APP_ID --query "length(@)" -o tsv)
if [ "$CRED_COUNT" -gt 0 ]; then
  echo "PASS: $CRED_COUNT credential(s) found"
  az ad app credential list --id $SERVER_APP_ID \
    --query "[].{keyId:keyId, endDateTime:endDateTime}" -o table
else
  echo "FAIL: No credentials found — run Step 2a to create a client secret"
fi

# Verify pre-authorized client app
PREAUTH=$(az ad app show --id $SERVER_APP_ID \
  --query "api.preAuthorizedApplications[?appId=='$CLIENT_APP_ID'].appId" -o tsv)
if [ "$PREAUTH" = "$CLIENT_APP_ID" ]; then
  echo "PASS: Client app $CLIENT_APP_ID is pre-authorized"
else
  echo "WARN: Client app not pre-authorized (required for consent-free token flow)"
fi
```

### 4b. Validate the client app registration (CIAM tenant)

```bash
az login --tenant $CIAM_TENANT_ID

echo "=== Client App Registration ==="
az ad app show --id $CLIENT_APP_ID --query "{
  appId: appId,
  displayName: displayName,
  signInAudience: signInAudience,
  spaRedirectUris: spa.redirectUris
}" -o jsonc

# Verify SPA redirect URI
REDIRECT=$(az ad app show --id $CLIENT_APP_ID \
  --query "spa.redirectUris[?contains(@, 'localhost:5173')]" -o tsv)
if [ -n "$REDIRECT" ]; then
  echo "PASS: SPA redirect URI includes localhost:5173"
else
  echo "FAIL: SPA redirect URI for localhost:5173 not found"
fi

# Verify no web redirect URIs are set (should be SPA only)
WEB_URIS=$(az ad app show --id $CLIENT_APP_ID \
  --query "web.redirectUris | length(@)" -o tsv)
if [ "$WEB_URIS" = "0" ]; then
  echo "PASS: No web redirect URIs (SPA-only, correct)"
else
  echo "WARN: Web redirect URIs found — MSAL v2 SPA should use spa type, not web"
fi

# Verify API permissions include the server app
PERM=$(az ad app show --id $CLIENT_APP_ID \
  --query "requiredResourceAccess[?resourceAppId=='$SERVER_APP_ID'].resourceAppId" -o tsv)
if [ "$PERM" = "$SERVER_APP_ID" ]; then
  echo "PASS: API permission for server app exists"
else
  echo "FAIL: No API permission for server app $SERVER_APP_ID"
fi

# Verify the service principal exists
SP=$(az ad sp show --id $CLIENT_APP_ID --query appId -o tsv 2>/dev/null)
if [ "$SP" = "$CLIENT_APP_ID" ]; then
  echo "PASS: Service principal exists"
else
  echo "FAIL: Service principal not found — run: az ad sp create --id $CLIENT_APP_ID"
fi
```

### 4c. Validate the CIAM tenant

```bash
az login --tenant $CIAM_TENANT_ID

echo "=== CIAM Tenant ==="
az account show --query "{tenantId:tenantId, name:name}" -o table

# Verify identity providers
echo "--- Identity Providers ---"
az rest --method GET \
  --uri "https://graph.microsoft.com/v1.0/identity/identityProviders" \
  --query "value[].{type:identityProviderType, name:displayName}" -o table

# Verify the OpenID configuration endpoint is reachable
OIDC_URL="https://${CIAM_TENANT_NAME}.ciamlogin.com/${CIAM_TENANT_NAME}.onmicrosoft.com/v2.0/.well-known/openid-configuration"
echo "--- OpenID Configuration ---"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$OIDC_URL")
if [ "$HTTP_STATUS" = "200" ]; then
  echo "PASS: OpenID configuration endpoint reachable ($OIDC_URL)"
else
  echo "FAIL: OpenID configuration returned HTTP $HTTP_STATUS ($OIDC_URL)"
fi
```

### 4d. Validate cross-tenant connectivity

```bash
echo "=== Cross-Tenant Validation ==="

# Verify the server app is visible from the CIAM tenant
# (needed for the client to request API permissions)
az login --tenant $CIAM_TENANT_ID
SP_CROSS=$(az ad sp show --id $SERVER_APP_ID --query appId -o tsv 2>/dev/null)
if [ "$SP_CROSS" = "$SERVER_APP_ID" ]; then
  echo "PASS: Server app service principal visible in CIAM tenant"
else
  echo "WARN: Server app service principal not found in CIAM tenant"
  echo "      This is expected if the server app is single-tenant."
  echo "      The client will need admin consent to access the server API."
fi
```

### 4e. Full summary

```bash
echo ""
echo "============================================"
echo "  Configuration Summary"
echo "============================================"
echo ""
echo "Copilot Tenant:     $COPILOT_TENANT_ID"
echo "CIAM Tenant:        $CIAM_TENANT_ID"
echo "CIAM Tenant Name:   $CIAM_TENANT_NAME"
echo ""
echo "Server App ID:      $SERVER_APP_ID"
echo "Client App ID:      $CLIENT_APP_ID"
echo ""
echo "Environment ID:     $COPILOT_ENVIRONMENT_ID"
echo "Agent Schema:       $COPILOT_AGENT_SCHEMA_NAME"
echo ""
echo "Server .env values:"
echo "  COPILOT_ENVIRONMENT_ID=$COPILOT_ENVIRONMENT_ID"
echo "  COPILOT_AGENT_SCHEMA_NAME=$COPILOT_AGENT_SCHEMA_NAME"
echo "  COPILOT_TENANT_ID=$COPILOT_TENANT_ID"
echo "  COPILOT_APP_ID=$SERVER_APP_ID"
echo "  COPILOT_CLIENT_SECRET=<from Step 2a>"
echo "  AUTH_REQUIRED=true"
echo "  AZURE_TENANT_NAME=$CIAM_TENANT_NAME"
echo "  AZURE_CLIENT_ID=$SERVER_APP_ID"
echo "  ALLOWED_TENANT_IDS=$CIAM_TENANT_ID"
echo ""
echo "Client .env values:"
echo "  VITE_API_URL=http://localhost:3001"
echo "  VITE_AZURE_CLIENT_ID=$CLIENT_APP_ID"
echo "  VITE_AZURE_TENANT_NAME=$CIAM_TENANT_NAME"
echo "  VITE_AZURE_REDIRECT_URI=http://localhost:5173"
echo ""
echo "============================================"
```

---

## Troubleshooting

| Issue | Command to diagnose | Fix |
|-------|-------------------|-----|
| "Insufficient privileges" | `az ad signed-in-user show` | Ensure you have Application Administrator or Global Admin role |
| Server app not visible in "My APIs" | `az ad sp show --id $SERVER_APP_ID` (from CIAM tenant) | Create a service principal: `az ad sp create --id $SERVER_APP_ID` (in CIAM tenant) |
| Wrong tenant context | `az account show --query tenantId -o tsv` | Switch with `az login --tenant <tenant-id>` |
| Scope not found | `az ad app show --id $SERVER_APP_ID --query api.oauth2PermissionScopes` | Re-run the scope creation in Step 2a |
| Secret expired | `az ad app credential list --id $SERVER_APP_ID -o table` | Rotate with Step 2c commands |
| SPA redirect set as "web" type | `az ad app show --id $CLIENT_APP_ID --query "{web:web.redirectUris, spa:spa.redirectUris}"` | Fix with the `az rest --method PATCH` command in Step 2b |
