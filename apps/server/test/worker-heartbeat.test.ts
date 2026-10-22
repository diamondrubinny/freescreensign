// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isHeartbeatFresh, startHeartbeat } from '../src/worker/heartbeat.js';

describe('worker heartbeat', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rubinny-hb-'));
    file = join(dir, 'worker.heartbeat');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes a fresh timestamp while healthy and removes it on stop', async () => {
    const stop = await startHeartbeat(() => true, { file, intervalMs: 20 });
    expect(isHeartbeatFresh(await readFile(file, 'utf8'))).toBe(true);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await stop();
    await expect(stat(file)).rejects.toThrow();
  });

  it('removes a stale file from an earlier run and writes nothing while unhealthy', async () => {
    await writeFile(file, String(Date.now()));
    const stop = await startHeartbeat(() => false, { file, intervalMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 60));
    await expect(stat(file)).rejects.toThrow();
    await stop();
  });

  it('starts beating once the worker becomes healthy', async () => {
    let healthy = false;
    const stop = await startHeartbeat(() => healthy, { file, intervalMs: 20 });
    await expect(stat(file)).rejects.toThrow();
    healthy = true;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(isHeartbeatFresh(await readFile(file, 'utf8'))).toBe(true);
    await stop();
  });

  it('judges freshness strictly', () => {
    const now = 1_000_000_000;
    expect(isHeartbeatFresh(String(now - 1_000), now)).toBe(true);
    expect(isHeartbeatFresh(String(now - 46_000), now)).toBe(false);
    expect(isHeartbeatFresh(String(now + 60_000), now)).toBe(false);
    expect(isHeartbeatFresh('', now)).toBe(false);
    expect(isHeartbeatFresh('not a number', now)).toBe(false);
    expect(isHeartbeatFresh('0', now)).toBe(false);
  });
});
