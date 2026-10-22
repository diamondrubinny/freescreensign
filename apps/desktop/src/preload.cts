// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * Preload (sandboxed, CommonJS). Exposes the smallest possible bridge:
 * - on the player page: window.RubinnyNative (platform, version, capabilities, capture)
 * - on the bundled setup page: window.RubinnySetup.setServer(url)
 * The main process checks the sender's address again for every call.
 */
// A sandboxed preload must be CommonJS; with verbatimModuleSyntax that means `import = require`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import electron = require('electron');

const { contextBridge, ipcRenderer } = electron;

const version =
  process.argv.find((arg) => arg.startsWith('--rubinny-version='))?.split('=')[1] ?? 'unknown';

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('RubinnySetup', {
    setServer: (url: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('rubinny:set-server', url) as Promise<{ ok: boolean }>,
  });
} else {
  contextBridge.exposeInMainWorld('RubinnyNative', {
    platform: 'electron',
    version,
    capabilities: ['screenshot'],
    capture: (): Promise<Uint8Array> =>
      ipcRenderer.invoke('rubinny:capture') as Promise<Uint8Array>,
  });
}
