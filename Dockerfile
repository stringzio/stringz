# Multi-stage image: builds the web app, then the api server that serves
# both the API and the built SPA from one origin (STATIC_DIR).
# Cloud Build runs from the repo root.

# ---- web build ----
FROM oven/bun:1 AS web
WORKDIR /repo
# Public WalletConnect project id - baked into the browser bundle by design.
# Pass it at build time: --build-arg VITE_WC_PROJECT_ID=...
# (No default here: the value is attribution-sensitive and must not live in
# the public repo. The build fails loudly if it is omitted.)
ARG VITE_WC_PROJECT_ID
ENV VITE_WC_PROJECT_ID=$VITE_WC_PROJECT_ID
RUN test -n "$VITE_WC_PROJECT_ID" || (echo "ERROR: VITE_WC_PROJECT_ID build arg is required (see .env.example)" && exit 1)
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
