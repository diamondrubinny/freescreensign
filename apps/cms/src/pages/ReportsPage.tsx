// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useQuery } from '@tanstack/react-query';
import { addDays, localTime } from '@rubinny/shared';
import { ChartColumn, Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { get } from '../api/client';
import type { PlayReport, ScreenItem } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { Card, EmptyState, inputClass } from '../components/ui';
import { formatDate } from '../lib/format';
import { useFormErrors } from '../lib/use-form-errors';
import { TableRegion } from '../components/TableRegion';

interface Filters {
  from: string;
  to: string;
  screenId: string;
}

/** h:mm:ss (or m:ss under an hour). */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${String(h)}:${String(m).padStart(2, '0')}:${s}` : `${String(m)}:${s}`;
}

const download =
  'inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-900 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700';

/** Proof-of-play report: plays per content over a date range, with CSV export. */
export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { orgId = '' } = useParams();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [filters, setFilters] = useState<Filters>(() => {
    const today = localTime(new Date(), timeZone).date;
    return { from: addDays(today, -6), to: today, screenId: '' };
  });
  const [draft, setDraft] = useState<Filters>(filters);

  const params = (extra: Record<string, string> = {}) =>
    new URLSearchParams({
      from: filters.from,
      to: filters.to,
      tz: timeZone,
      ...(filters.screenId ? { screenId: filters.screenId } : {}),
      ...extra,
    }).toString();
  const base = `/api/v1/orgs/${orgId}/reports/plays`;

  const screens = useQuery({
    queryKey: ['screens', orgId],
    queryFn: () => get<{ screens: ScreenItem[] }>(`/api/v1/orgs/${orgId}/screens`),
  });
  const report = useQuery({
    queryKey: ['report', orgId, filters, timeZone],
    queryFn: () => get<{ report: PlayReport }>(`${base}?${params()}`),
  });
  const errors = useFormErrors(report.error);
  const data = report.data?.report;
  const max = Math.max(1, ...(data?.items.map((item) => item.plays) ?? []));
  const day = (date: string) => formatDate(`${date}T12:00:00Z`, i18n.language);

  return (
    <>
      <PageHeading title={t('reports.title')} description={t('reports.intro')} />

      <Card as="section" className="mb-8 p-5">
        <form
          noValidate
          aria-label={t('reports.filters')}
          className="flex flex-wrap items-end gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters(draft);
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="report-from" className="text-sm font-medium">
              {t('reports.from')}
            </label>
            <input
              id="report-from"
              type="date"
              dir="ltr"
              required
              value={draft.from}
              aria-invalid={errors.fields.from ? true : undefined}
              onChange={(event) => {
                setDraft({ ...draft, from: event.target.value });
              }}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="report-to" className="text-sm font-medium">
              {t('reports.to')}
            </label>
            <input
              id="report-to"
              type="date"
              dir="ltr"
              required
              value={draft.to}
              aria-invalid={errors.fields.to ? true : undefined}
              aria-describedby={errors.fields.to ? 'report-to-error' : undefined}
              onChange={(event) => {
                setDraft({ ...draft, to: event.target.value });
              }}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="report-screen" className="text-sm font-medium">
              {t('reports.screen')}
            </label>
            <select
              id="report-screen"
              value={draft.screenId}
              onChange={(event) => {
                setDraft({ ...draft, screenId: event.target.value });
              }}
              className={inputClass}
            >
              <option value="">{t('reports.allScreens')}</option>
              {screens.data?.screens.map((screen) => (
                <option key={screen.id} value={screen.id}>
                  {screen.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">{t('reports.show')}</Button>
          {errors.fields.to && (
            <p
              id="report-to-error"
              className="basis-full text-sm font-medium text-red-800 dark:text-red-300"
            >
              {errors.fields.to}
            </p>
          )}
        </form>
      </Card>

      {errors.form && !errors.fields.to && (
        <div className="mb-6">
          <Alert variant="error">{errors.form}</Alert>
        </div>
      )}
      {report.isPending && <Loading />}
      {data && (
        <section aria-labelledby="report-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="report-heading" className="text-xl font-semibold">
                {t('reports.range', {
                  from: day(data.from),
                  to: day(data.to),
                  zone: data.timeZone,
                })}
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                {t('reports.totals', {
                  plays: data.totals.plays.toLocaleString(i18n.language),
                  duration: formatDuration(data.totals.durationMs),
                })}
              </p>
            </div>
            {data.items.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <a href={`${base}?${params({ format: 'csv' })}`} download className={download}>
                  <Download aria-hidden="true" className="size-4" />
                  {t('reports.exportSummary')}
                </a>
                <a
                  href={`${base}?${params({ format: 'csv', view: 'events' })}`}
                  download
                  className={download}
                >
                  <Download aria-hidden="true" className="size-4" />
                  {t('reports.exportEvents')}
                </a>
              </div>
            )}
          </div>
          {data.items.length === 0 ? (
            <EmptyState
              icon={ChartColumn}
              title={t('reports.empty')}
              text={t('reports.emptyText')}
            />
          ) : (
            <TableRegion label={t('reports.title')}>
              <table className="data-table">
                <caption className="sr-only">{t('reports.title')}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="text-start">
                      {t('reports.content')}
                    </th>
                    <th scope="col" className="text-start">
                      {t('reports.kind')}
                    </th>
                    <th scope="col" className="text-end">
                      {t('reports.plays')}
                    </th>
                    <th scope="col" className="text-end">
                      {t('reports.duration')}
                    </th>
                    <th scope="col" className="text-end">
                      {t('reports.screens')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={`${item.kind}-${item.contentId ?? item.name}`}>
                      <th scope="row" className="text-start font-semibold">
                        <span dir="auto">{item.name}</span>
                        {item.contentId === null && (
                          <span className="ms-1 text-sm font-normal text-gray-700 dark:text-gray-300">
                            {t('reports.deleted')}
                          </span>
                        )}
                        {/* Share of plays: decorative, the number is in the next cells. */}
                        <span
                          aria-hidden="true"
                          title={t('reports.share')}
                          className="mt-1 block h-1.5 rounded-full bg-gray-100 dark:bg-gray-800"
                        >
                          <span
                            className="block h-full rounded-full bg-brand-600 dark:bg-brand-400"
                            style={{ width: `${String((item.plays / max) * 100)}%` }}
                          />
                        </span>
                      </th>
                      <td>{t(`reports.kinds.${item.kind}`)}</td>
                      <td className="text-end tabular-nums">
                        {item.plays.toLocaleString(i18n.language)}
                      </td>
                      <td className="text-end tabular-nums" dir="ltr">
                        {formatDuration(item.durationMs)}
                      </td>
                      <td className="text-end tabular-nums">{item.screens}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableRegion>
          )}
        </section>
      )}
    </>
  );
}
