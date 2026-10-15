import { hasRole, type Role } from '@rubinny/shared';
import { useSession } from '../api/session';

/** The signed-in user's role in an organization, and whether it reaches `minimum`. */
export function useOrgRole(orgId: string, minimum: Role = 'EDITOR') {
  const session = useSession().data;
  const role = session?.memberships.find((m) => m.orgId === orgId)?.role;
  return { role, allowed: role ? hasRole(role, minimum) : false };
}
