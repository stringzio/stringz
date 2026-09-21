# Multi-stage image: builds the web app, then the api server that serves
# both the API and the built SPA from one origin (STATIC_DIR).
# Cloud Build runs from the repo root.

# ---- web build ----
FROM oven/bun:1 AS web
WORKDIR /repo
# Public WalletConnect project id - baked into the browser bundle by design
# (override at build time with --build-arg if it ever needs rotating).
ARG VITE_WC_PROJECT_ID=aff5e013faa10a86e4ff8dec4982a6ef
ENV VITE_WC_PROJECT_ID=$VITE_WC_PROJECT_ID
COPY package.json bun.lock ./
COPY server/package.json server/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- production deps (server installed standalone: workspace --production
# installs prune member packages, so install server/package.json by itself) ----
FROM oven/bun:1 AS deps
WORKDIR /repo/server
COPY server/package.json ./
RUN bun install --production

# ---- runtime ----
FROM oven/bun:1
WORKDIR /repo
ENV NODE_ENV=production
COPY server ./server
COPY --from=deps /repo/server/node_modules ./server/node_modules
COPY src/lib ./src/lib
COPY --from=web /repo/dist ./dist
ENV STATIC_DIR=/repo/dist
EXPOSE 8787
CMD ["bun", "run", "server/src/index.ts"]
