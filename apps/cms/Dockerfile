# syntax=docker/dockerfile:1
# Build context: repository root.  docker build -f apps/cms/Dockerfile .
# Produces the public web image: Caddy serving the CMS (/) and the player (/player/),
# and proxying the API.

ARG NODE_IMAGE=node:24-alpine
ARG CADDY_IMAGE=caddy:2-alpine
ARG GO_IMAGE=golang:1.27-alpine

# Caddy from its official source, built with a patched Go toolchain and x/net. The binary
# in the official image can lag behind Go security releases, and this is the public edge.
# Same program as upstream's cmd/caddy (standard modules only).
FROM ${GO_IMAGE} AS caddy
ARG CADDY_VERSION=v2.11.7
ARG X_NET_VERSION=v0.60.0
WORKDIR /src
RUN printf '%s\n' 'package main' '' 'import (' \
      '	caddycmd "github.com/caddyserver/caddy/v2/cmd"' \
      '	_ "github.com/caddyserver/caddy/v2/modules/standard"' \
      ')' '' 'func main() { caddycmd.Main() }' > main.go \
 && go mod init rubinny.local/caddy \
 && go get "github.com/caddyserver/caddy/v2@${CADDY_VERSION}" "golang.org/x/net@${X_NET_VERSION}" \
 && go mod tidy \
 && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /caddy . \
 && /caddy version

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
COPY --from=caddy /caddy /usr/bin/caddy
RUN setcap cap_net_bind_service=+ep /usr/bin/caddy
COPY --from=build /repo/apps/cms/dist /srv/cms
COPY --from=build /repo/apps/player/dist /srv/player
COPY deploy/Caddyfile /etc/caddy/Caddyfile
