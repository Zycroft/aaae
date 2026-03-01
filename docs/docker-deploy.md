# Docker Deployment Guide

Step-by-step guide for building, running, and deploying the Agentic Copilot Chat App with Docker.

---

## 1. Prerequisites

- **Docker** and **Docker Compose** (v2) installed ([install guide](https://docs.docker.com/get-docker/))
- This repository cloned locally
- `server/.env` configured (see next section)

## 2. Environment Configuration

Copy the example env file and fill in the values for your chosen provider:

```bash
cp server/.env.example server/.env
```

### Copilot Studio mode (default)

Set `LLM_PROVIDER=copilot` and provide all five Copilot vars:

| Variable | Description |
|---|---|
| `COPILOT_ENVIRONMENT_ID` | Power Platform environment ID |
| `COPILOT_AGENT_SCHEMA_NAME` | Agent schema name from Copilot Studio |
| `COPILOT_TENANT_ID` | Azure AD tenant ID |
| `COPILOT_APP_ID` | Azure App Registration client ID |
| `COPILOT_CLIENT_SECRET` | Azure App Registration client secret |

### OpenAI mode

Set `LLM_PROVIDER=openai` and provide:

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key |
| `OPENAI_MODEL` | Model name (default: `gpt-4o-mini`) |

### No-auth local development

For quick local testing without authentication:

```env
AUTH_REQUIRED=false
```

> **Warning:** Never set `AUTH_REQUIRED=false` in production.

### Production overrides

| Variable | Production value | Notes |
|---|---|---|
| `AUTH_REQUIRED` | `true` | Fail-closed by default |
| `CORS_ORIGIN` | `https://your-domain.com` | Exact client origin, no trailing slash |
| `AZURE_TENANT_NAME` | Your Entra External ID tenant name | Required when `AUTH_REQUIRED=true` |
| `AZURE_CLIENT_ID` | Server app registration client ID | Required when `AUTH_REQUIRED=true` |
| `ALLOWED_TENANT_IDS` | Comma-separated tenant IDs | Only these tenants are accepted |

## 3. Build the Image

```bash
docker compose build
```

### How the build works

The Dockerfile uses a **multi-stage build**:

1. **Build stage** (`node:20-alpine`) — installs all dependencies (`npm ci`), copies source, and runs `npm run build` (shared → client → server).
2. **Production stage** (`node:20-alpine`) — installs production dependencies only (`npm ci --omit=dev`), copies compiled artifacts from the build stage. No source code or devDependencies in the final image.

### Subpath build arg

The client is built with `VITE_BASE_PATH` which controls the base URL for all Vite-generated asset paths. Default is `/aaae/`.

To deploy at the root path:

```bash
docker compose build --build-arg VITE_BASE_PATH=/
```

To deploy at a custom subpath:

```bash
docker compose build --build-arg VITE_BASE_PATH=/my-app/
```

> **Note:** The path must start and end with `/`.

## 4. Run the Container

```bash
docker compose up -d
```

This starts the app container with:

- **Port mapping:** `3001:3001` (host:container)
- **Env file:** `server/.env` loaded automatically
- **CORS override:** `CORS_ORIGIN=https://zycroft.duckdns.org` (set in `docker-compose.yml`)
- **Restart policy:** `unless-stopped` — auto-restarts on crash or reboot

## 5. Verify the Deployment

Check the container is running and healthy:

```bash
docker compose ps
```

You should see the `app` service with status `Up` and `(healthy)`.

Hit the health endpoint:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{
  "status": "ok",
  "provider": "copilot",
  "model": null,
  "authRequired": true,
  "redis": "not_configured"
}
```

The `provider` and `model` fields reflect your `LLM_PROVIDER` setting. `redis` will show `connected` when `REDIS_URL` is configured.

View logs:

```bash
docker compose logs -f
```

## 6. Production Configuration

### CORS

Edit `docker-compose.yml` or override via env to set your domain:

```yaml
environment:
  - CORS_ORIGIN=https://your-domain.com
```

### Authentication

With `AUTH_REQUIRED=true` (the default), all `/api/*` routes require a valid Bearer token. Configure the Azure Entra vars in `server/.env`:

```env
AUTH_REQUIRED=true
AZURE_TENANT_NAME=your-tenant-name
AZURE_CLIENT_ID=your-server-app-client-id
ALLOWED_TENANT_IDS=tenant-id-1,tenant-id-2
```

### Redis for session persistence

By default the server uses an in-memory store. For production, configure Redis:

```env
REDIS_URL=rediss://:your-access-key@your-cache.redis.cache.windows.net:6380
REDIS_TTL=86400
REDIS_TIMEOUT=5000
```

## 7. Caddy Reverse Proxy with Auto-TLS

[Caddy](https://caddyserver.com/) provides automatic HTTPS via Let's Encrypt with zero configuration.

### Add Caddy to docker-compose.yml

```yaml
services:
  app:
    build: .
    ports:
      - "3001:3001"
    env_file:
      - server/.env
    environment:
      - CORS_ORIGIN=https://your-domain.com
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/health"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      app:
        condition: service_healthy
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
```

### Create a Caddyfile

```caddyfile
your-domain.com {
    reverse_proxy app:3001
}
```

Replace `your-domain.com` with your actual domain (e.g. `zycroft.duckdns.org`).

Caddy automatically obtains and renews TLS certificates from Let's Encrypt. No extra configuration needed — just ensure ports 80 and 443 are open and the domain's DNS points to your server.

### Start with Caddy

```bash
docker compose up -d
```

Your app is now available at `https://your-domain.com` with automatic HTTPS.

## 8. Subpath Deployment

### How VITE_BASE_PATH works

`VITE_BASE_PATH` is a build-time argument that configures:

1. **Vite asset paths** — all JS/CSS/image imports are prefixed with the base path
2. **Express static serving** — the server reads `STATIC_DIR` and serves the built client files, with SPA fallback routing all non-API requests to `index.html`

### Rebuild with a different base path

```bash
docker compose build --build-arg VITE_BASE_PATH=/my-app/
docker compose up -d
```

### Caddy config for subpath proxying

If you serve the app under a subpath behind Caddy:

```caddyfile
your-domain.com {
    handle /my-app/* {
        reverse_proxy app:3001
    }
}
```

## 9. Common Operations

### Rebuild after code changes

```bash
docker compose build && docker compose up -d
```

### View logs

```bash
# Follow logs in real time
docker compose logs -f

# Last 100 lines
docker compose logs --tail 100
```

### Stop / restart / remove

```bash
# Stop the container (preserves it)
docker compose stop

# Restart
docker compose restart

# Stop and remove container + network
docker compose down
```

### Shell into the container

```bash
docker compose exec app sh
```

### Update environment variables

If you only changed `server/.env` (no code changes), recreate without rebuilding:

```bash
docker compose up -d --force-recreate
```

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Container exits immediately | Missing or invalid env vars | Check `docker compose logs` for startup errors; verify `server/.env` |
| Health check failing | App not listening on port 3001 | Ensure `PORT=3001` in env; check logs for bind errors |
| `CORS error` in browser | `CORS_ORIGIN` doesn't match client URL | Set `CORS_ORIGIN` to the exact origin (scheme + host + port, no trailing slash) |
| `401 Unauthorized` on API calls | `AUTH_REQUIRED=true` but no valid token | Set `AUTH_REQUIRED=false` for local dev, or configure Azure Entra vars |
| `Cannot find module` at startup | Build artifacts missing | Run `docker compose build` to rebuild; check build stage logs |
| Redis `disconnected` in health | `REDIS_URL` set but unreachable | Verify Redis host/port/credentials; check network connectivity |
| Blank page at subpath | `VITE_BASE_PATH` mismatch | Rebuild with correct `--build-arg VITE_BASE_PATH=/your-path/` |
| `502 Bad Gateway` from Caddy | App not ready yet | Check `depends_on` condition; increase `start_period` in healthcheck |
| TLS certificate not issued | DNS not pointing to server | Verify A/AAAA record; ensure ports 80 and 443 are open |
