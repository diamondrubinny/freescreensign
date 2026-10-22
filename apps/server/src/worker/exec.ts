// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { spawn } from 'node:child_process';

export class ExecError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'ExecError';
  }
}

/**
 * Runs a binary without a shell (no injection), with a hard timeout and bounded
 * output buffers. Arguments are passed as an array, never interpolated.
 */
export function run(
  command: string,
  args: readonly string[],
  options: { timeoutMs: number; maxOutputBytes?: number },
): Promise<{ stdout: string; stderr: string }> {
  const maxOutput = options.maxOutputBytes ?? 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new ExecError(`${command} timed out`, stderr.slice(-2000)));
    }, options.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < maxOutput) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < maxOutput) stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new ExecError(`${command} failed to start: ${err.message}`, ''));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(new ExecError(`${command} exited with code ${String(code)}`, stderr.slice(-2000)));
    });
  });
}
