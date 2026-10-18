import type { User } from '../../db/schema.js';

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale,
    emailVerified: user.email_verified_at !== null,
    mfaEnabled: user.mfa_enabled_at !== null,
    /** False for accounts created through SSO that have not set a password. */
    hasPassword: user.password_login,
    /** Operator of the installation (the server status page). */
    isOperator: user.is_operator,
    createdAt: user.created_at.toISOString(),
  };
}
