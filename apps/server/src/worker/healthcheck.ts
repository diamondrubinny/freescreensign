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
