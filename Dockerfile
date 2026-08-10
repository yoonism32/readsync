# ── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Development (hot reload) ───────────────────────────────────────
FROM node:22-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── Stage 3: Build (compile TS + frontend) ───────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules

# Install frontend deps
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci --prefix frontend

# Install userscript deps
COPY userscript/package.json userscript/package-lock.json ./userscript/
RUN npm ci --prefix userscript

COPY . .
RUN npm run build:all && npm prune --production

# ── Stage 4: Production (minimal image) ──────────────────────────────────────
FROM node:22-alpine AS production
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
