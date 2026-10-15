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
