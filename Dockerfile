# ---- Stage 1: Build ----
FROM node:20-alpine AS build

WORKDIR /app

# Copy workspace config + lockfile first (layer cache for npm ci)
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/

RUN npm ci

# Copy source
COPY shared/ shared/
COPY client/ client/
COPY server/ server/
COPY tsconfig.base.json ./

# Build all workspaces: shared → client → server
RUN npm run build

# ---- Stage 2: Production ----
FROM node:20-alpine

WORKDIR /app

# Copy workspace config + lockfile
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy build artifacts from stage 1
COPY --from=build /app/shared/dist/ shared/dist/
COPY --from=build /app/server/dist/ server/dist/
COPY --from=build /app/client/dist/ client/dist/

# Express serves the React SPA from this directory
ENV STATIC_DIR=/app/client/dist
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server/dist/index.js"]
