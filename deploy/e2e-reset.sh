#!/bin/sh
# Development helper: recreates the local stack with an empty database for E2E tests.
# WARNING: deletes all local Rubinny data volumes.
set -eu
cd "$(dirname "$0")"
docker compose down -v
docker compose up -d --wait server web
