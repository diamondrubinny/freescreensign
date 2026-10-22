// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { hasRole, type Role } from '@rubinny/shared';
import { useSession } from '../api/session';

/** The signed-in user's role in an organization, and whether it reaches `minimum`. */
export function useOrgRole(orgId: string, minimum: Role = 'EDITOR') {
  const session = useSession().data;
  const role = session?.memberships.find((m) => m.orgId === orgId)?.role;
  return { role, allowed: role ? hasRole(role, minimum) : false };
}
