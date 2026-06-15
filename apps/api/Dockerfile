# syntax=docker/dockerfile:1
#
# API image. Build context is the REPO ROOT (this is a workspaces monorepo):
#   docker build -f apps/api/Dockerfile -t costing-api .
# The same image runs locally and in the cloud — only environment variables and
# the database connection change.

# ---- builder ----------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first (better layer caching). Copy every workspace's
# package.json so `npm ci` can resolve the workspace graph against the lockfile.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

# Build the API. tsup bundles @costing/shared (TypeScript source) into the output
# and leaves runtime deps (express, pg, …) external.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @costing/api

# Ship the SQL migrations next to the bundled server so MIGRATE_ON_START works.
RUN cp -r apps/api/src/db/migrations apps/api/dist/migrations

# Drop dev dependencies for a lean runtime image.
RUN npm prune --omit=dev

# ---- runtime ----------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Hoisted workspace dependencies live at the repo-root node_modules; Node resolves
# up to here from apps/api/dist.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
