// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * Holds an invitation token in memory while the user signs in or registers
 * (never persisted to storage). Cleared once read.
 */
let pending: string | null = null;

export function rememberInviteToken(token: string): void {
  pending = token;
}

export function peekInviteToken(): string | null {
  return pending;
}

export function clearInviteToken(): void {
  pending = null;
}
