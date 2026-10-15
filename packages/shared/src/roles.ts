/** Organization roles, ordered from most to least privileged. */
export const ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { OWNER: 4, ADMIN: 3, EDITOR: 2, VIEWER: 1 };

/** Returns true when `role` grants at least the privileges of `required`. */
export function hasRole(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}
