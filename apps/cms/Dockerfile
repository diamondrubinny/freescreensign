# syntax=docker/dockerfile:1
# Build context: repository root.  docker build -f apps/cms/Dockerfile .
# Produces the public web image: Caddy serving the CMS (/) and the player (/player/),
# and proxying the API.

ARG NODE_IMAGE=node:24-alpine
ARG CADDY_IMAGE=caddy:2-alpine

FROM ${NODE_IMAGE} AS build
RUN npm install -g pnpm@10.28.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/widget-sdk/package.json packages/widget-sdk/
COPY apps/cms/package.json apps/cms/
COPY apps/player/package.json apps/player/
RUN pnpm install --frozen-lockfile --filter "@rubinny/cms..." --filter "@rubinny/player..."
COPY packages/shared packages/shared
COPY packages/widget-sdk packages/widget-sdk
COPY apps/cms apps/cms
COPY apps/player apps/player
RUN pnpm --filter @rubinny/shared build \
 && pnpm --filter @rubinny/widget-sdk build \
 && pnpm --filter @rubinny/cms exec vite build \
 && pnpm --filter @rubinny/player exec vite build

FROM ${CADDY_IMAGE} AS runtime
COPY --from=build /repo/apps/cms/dist /srv/cms
COPY --from=build /repo/apps/player/dist /srv/player
COPY deploy/Caddyfile /etc/caddy/Caddyfile
