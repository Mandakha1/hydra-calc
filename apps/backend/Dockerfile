# syntax=docker/dockerfile:1.6
# Hydra Calc backend — multi-stage, pnpm monorepo-aware, ARM64 friendly.

# ---- deps + build ----
FROM node:20-alpine AS build
WORKDIR /repo
RUN apk add --no-cache python3 make g++ \
 && corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --offline || pnpm install --frozen-lockfile
RUN pnpm --filter backend typecheck

# `pnpm deploy` produces a self-contained, flat node_modules tree for the backend
# workspace with the shared workspace package inlined.
RUN pnpm --filter backend deploy --prod /out

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init tini curl \
 && adduser -D -u 1001 app \
 && chown -R app:app /app

COPY --from=build --chown=app:app /out /app

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s --start-period=25s --retries=3 \
  CMD curl -fs http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
# tsx runs the TypeScript entry point directly — no separate build step.
# The shared package is installed as a local dep by `pnpm deploy`.
CMD ["node", "--import", "tsx/esm", "src/server.ts"]
