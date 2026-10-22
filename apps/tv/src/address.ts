// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * Rules for the Rubinny server address on a TV: https only (a TV never hosts the server
 * itself), no credentials in the address. The same rules as the desktop and Android apps,
 * without their plain-http exception for the device itself.
 */

/** The origin ("https://host[:port]") of an address typed with a remote, or null. */
export function parseServer(input: string): string | null {
  const text = input.trim();
  if (text === '' || /\s/.test(text)) return null;
  // Typing "https://" with a remote is slow; a bare host name (with or without a port) means https.
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$))/i.test(text);
  const withScheme = hasScheme ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname === '') return null;
  if (url.username !== '' || url.password !== '') return null;
  return url.origin;
}

/** The web player of a server. */
export function playerUrl(origin: string): string {
  return `${origin}/player/`;
}
