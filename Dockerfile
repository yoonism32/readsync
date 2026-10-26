# syntax=docker/dockerfile:1
# ── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:22.23.4-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Development (hot reload) ───────────────────────────────────────
FROM node:22.23.4-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── Stage 3: Build (compile TS + frontend) ───────────────────────────────────
FROM node:22.23.4-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules

# Install frontend deps
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci --prefix frontend --legacy-peer-deps

# Install userscript deps
COPY userscript/package.json userscript/package-lock.json ./userscript/
RUN npm ci --prefix userscript --legacy-peer-deps

COPY . .
# The userscript build embeds API_KEY and USERSCRIPT_UPDATE_TOKEN. They arrive
# as BuildKit secrets (mounted for this step only, never stored in a layer).
# Secrets are not part of the layer cache key, so --no-cache-filter build is
# needed, or a rebuild after rotating a key silently reuses the old one:
#   docker build --target production --no-cache-filter build \
#     --secret id=api_key,env=API_KEY \
#     --secret id=userscript_update_token,env=USERSCRIPT_UPDATE_TOKEN .
RUN --mount=type=secret,id=api_key,required=true \
    --mount=type=secret,id=userscript_update_token,required=true \
    API_KEY="$(cat /run/secrets/api_key)" \
    USERSCRIPT_UPDATE_TOKEN="$(cat /run/secrets/userscript_update_token)" \
    npm run build:all && npm prune --omit=dev

# ── Stage 4: Production (minimal image) ──────────────────────────────────────
FROM node:22.23.4-alpine AS production
WORKDIR /app

RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001
USER appuser

COPY --from=build --chown=appuser:appgroup /app/dist ./dist
COPY --from=build --chown=appuser:appgroup /app/public ./public
COPY --from=build --chown=appuser:appgroup /app/dist-userscript ./dist-userscript
COPY --from=build --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appgroup /app/package.json ./

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
