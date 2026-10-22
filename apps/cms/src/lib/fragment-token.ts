// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * Reads a one-time token from the URL fragment (#token=...) and removes it from
 * the address bar and history, so it is not leaked via screenshots, history sync
 * or copy-pasted URLs. Fragments are never sent to servers.
 */
export function takeFragmentToken(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('token');
  if (token) {
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }
  return token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
}
