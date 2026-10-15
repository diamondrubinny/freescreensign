# syntax=docker/dockerfile:1
# Build context: repository root.  docker build -f apps/cms/Dockerfile .
# Produces the public web image: Caddy serving the CMS and proxying the API.

ARG NODE_IMAGE=node:24-alpine
ARG CADDY_IMAGE=caddy:2-alpine

FROM ${NODE_IMAGE} AS build
RUN npm install -g pnpm@10.28.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/cms/package.json apps/cms/
RUN pnpm install --frozen-lockfile --filter "@rubinny/cms..."
COPY packages/shared packages/shared
COPY apps/cms apps/cms
RUN pnpm --filter @rubinny/shared build && pnpm --filter @rubinny/cms exec vite build

FROM ${CADDY_IMAGE} AS runtime
COPY --from=build /repo/apps/cms/dist /srv/cms
COPY deploy/Caddyfile /etc/caddy/Caddyfile
