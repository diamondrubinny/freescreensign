# syntax=docker/dockerfile:1
# Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
# Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
# SPDX-License-Identifier: AGPL-3.0-only
# https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

# Build context: repository root.  docker build -f apps/cms/Dockerfile .
# Produces the public web image: Caddy serving the CMS (/) and the player (/player/),
# and proxying the API.

ARG NODE_IMAGE=node:24-alpine
ARG CADDY_IMAGE=caddy:2-alpine
ARG GO_IMAGE=golang:1.27-alpine

# Caddy from its official source, built with a patched Go toolchain and x/net. The binary
# in the official image can lag behind Go security releases, and this is the public edge.
# Same program as upstream's cmd/caddy (standard modules only).
# Cross-compiled on the build machine (fast; no emulation for arm64 images). Downloads are
# retried: the Go checksum database has had passing network errors (each retry still verifies).
FROM --platform=$BUILDPLATFORM ${GO_IMAGE} AS caddy
ARG CADDY_VERSION=v2.11.7
ARG X_NET_VERSION=v0.60.0
# go-jose 4.1.6: DoS when parsing JWKs with RSA keys (CVE-2026-116587) in 4.1.5 and earlier.
ARG GO_JOSE_VERSION=v4.1.6
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
RUN printf '%s\n' 'package main' '' 'import (' \
      '	caddycmd "github.com/caddyserver/caddy/v2/cmd"' \
      '	_ "github.com/caddyserver/caddy/v2/modules/standard"' \
      ')' '' 'func main() { caddycmd.Main() }' > main.go \
 && go mod init rubinny.local/caddy \
 && retry() { for attempt in 1 2 3; do "$@" && return 0; echo "$* failed (attempt $attempt)" >&2; sleep 20; done; return 1; } \
 && retry go get "github.com/caddyserver/caddy/v2@${CADDY_VERSION}" "golang.org/x/net@${X_NET_VERSION}" \
      "github.com/go-jose/go-jose/v4@${GO_JOSE_VERSION}" \
 && retry go mod tidy \
 && CGO_ENABLED=0 GOOS="$TARGETOS" GOARCH="$TARGETARCH" go build -trimpath -ldflags "-s -w" -o /caddy .

# Static files are the same for every architecture: built once, on the build machine.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
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
# The attribution (LICENSING.md), readable with "docker inspect".
LABEL org.opencontainers.image.title="Rubinny web" \
      org.opencontainers.image.description="Rubinny — free and open-source digital signage: dashboard, player and HTTPS proxy. Powered by Rubinny · Open source." \
      org.opencontainers.image.authors="Diamond Rubinny" \
      org.opencontainers.image.vendor="Rubinny (open source)" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.source="https://github.com/diamondrubinny/freescreensign"
# Security fixes of the base image's packages that its last release does not have yet
# (e.g. brotli and curl); the image scan in CI fails on any that remain.
RUN apk upgrade --no-cache
COPY --from=caddy /caddy /usr/bin/caddy
RUN setcap cap_net_bind_service=+ep /usr/bin/caddy && caddy version
COPY --from=build /repo/apps/cms/dist /srv/cms
COPY --from=build /repo/apps/player/dist /srv/player
COPY deploy/Caddyfile /etc/caddy/Caddyfile
