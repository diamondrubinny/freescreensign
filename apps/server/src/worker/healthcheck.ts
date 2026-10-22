// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { readFileSync } from 'node:fs';
import { HEARTBEAT_FILE, isHeartbeatFresh } from './heartbeat.js';

/** Container health check for the media worker: exit 0 only with a fresh heartbeat. */
function healthy(): boolean {
  try {
    return isHeartbeatFresh(readFileSync(HEARTBEAT_FILE, 'utf8'));
  } catch {
    return false;
  }
}

process.exit(healthy() ? 0 : 1);
