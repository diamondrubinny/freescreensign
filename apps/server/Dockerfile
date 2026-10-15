# syntax=docker/dockerfile:1
# Build context: repository root.  docker build -f apps/server/Dockerfile .

ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
RUN npm install -g pnpm@10.28.0
WORKDIR /repo

# Install dependencies first for better layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter "@rubinny/server..."

COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter "@rubinny/server..." build \
 && pnpm --filter @rubinny/server deploy --prod --legacy /out

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
# Application files are owned by root and read-only for the runtime user.
COPY --from=build /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]

# Media worker: same code plus ffmpeg/ffprobe. Build with --target worker.
FROM runtime AS worker
USER root
# /work is the scratch volume (TMPDIR); a new named volume inherits this ownership.
RUN apk add --no-cache ffmpeg && install -d -o node -g node -m 700 /work
USER node
HEALTHCHECK NONE
CMD ["node", "dist/worker/main.js"]

# Default target: the API server.
FROM runtime AS server
