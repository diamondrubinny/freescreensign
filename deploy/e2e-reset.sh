#!/bin/sh
# Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
# Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
# SPDX-License-Identifier: AGPL-3.0-only
# https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

# Development helper: recreates the local stack with an empty database for E2E tests.
# WARNING: deletes all local Rubinny data volumes.
set -eu
cd "$(dirname "$0")"
docker compose down -v
docker compose up -d --no-build --wait
