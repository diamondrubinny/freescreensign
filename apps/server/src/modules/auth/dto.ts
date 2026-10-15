import type { User } from '../../db/schema.js';

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale,
    emailVerified: user.email_verified_at !== null,
    mfaEnabled: user.mfa_enabled_at !== null,
    createdAt: user.created_at.toISOString(),
  };
}
