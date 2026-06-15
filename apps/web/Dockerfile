# syntax=docker/dockerfile:1
#
# Web image. Build context is the REPO ROOT (workspaces monorepo):
#   docker build -f apps/web/Dockerfile -t costing-web .
# Builds the static SPA with Vite, then serves it with nginx, reverse-proxying
# /api to the API container so the browser talks to a single origin.

# ---- builder ----------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

# Default to a blank API base URL → the client makes relative /api requests,
# which nginx proxies to the api service (same origin). Override at build time
# (--build-arg VITE_API_URL=https://api.example.com) for a separate API host.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w @costing/web

# ---- runtime ----------------------------------------------------------------
FROM nginx:alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
