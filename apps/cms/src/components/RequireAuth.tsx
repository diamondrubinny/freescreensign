// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { Navigate, useLocation } from 'react-router';
import { useSession } from '../api/session';
import { AppShell } from './AppShell';
import { Loading } from './Loading';
import { ErrorPage } from '../pages/ErrorPage';

/** Guards signed-in routes. UI hiding is a convenience; the API enforces access. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <Loading />;
  if (session.isError) return <ErrorPage />;
  if (!session.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <AppShell session={session.data} />;
}
