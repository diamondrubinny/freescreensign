// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useQuery } from '@tanstack/react-query';
import type { SacredPeriod, SacredSettings, SacredTimes } from '@rubinny/shared';
import { get } from '../api/client';

/** The organization's Shabbat and holiday settings (null when not set). */
export function useSacredSettings(orgId: string) {
  return useQuery({
    queryKey: ['sacred', orgId],
    queryFn: () =>
      get<{ settings: SacredSettings | null }>(`/api/v1/orgs/${orgId}/settings/sacred`),
  });
}

/** Shabbat and holiday periods from a date (the place's) for some days, when set. */
export function useSacredTimes(orgId: string, from: string | null, days: number, enabled = true) {
  return useQuery({
    queryKey: ['sacred-times', orgId, from, days],
    enabled,
    queryFn: () =>
      get<{ timeZone: string | null; times: SacredTimes | null }>(
        `/api/v1/orgs/${orgId}/sacred-times?${new URLSearchParams({
          ...(from ? { from } : {}),
          days: String(days),
        }).toString()}`,
      ),
  });
}

/** How a period is named: the holidays' names, else "Shabbat" or "Holiday". */
export function periodLabel(
  period: SacredPeriod,
  labels: { shabbat: string; holiday: string },
): string {
  const parts: string[] = [];
  if (period.kinds.includes('shabbat')) parts.push(labels.shabbat);
  if (period.names.length > 0) parts.push(...period.names);
  else if (period.kinds.includes('holiday')) parts.push(labels.holiday);
  return parts.join(' · ');
}
