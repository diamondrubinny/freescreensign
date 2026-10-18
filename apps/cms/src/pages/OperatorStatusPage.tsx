import { useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, CircleHelp, CircleX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError, get } from '../api/client';
import { useSession } from '../api/session';
import { Alert } from '../components/Alert';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { TableRegion } from '../components/TableRegion';
import { linkClass } from '../components/ui';
import { formatBytes } from '../lib/format-bytes';
import { formatDateTime } from '../lib/format';

type State = 'ok' | 'warning' | 'error' | 'unknown';

export interface OperatorStatus {
  checkedAt: string;
  version: { server: string; migration: string | null };
  services: { state: State; checks: Record<string, 'up' | 'down'> };
  clamav: {
    state: State;
    configured: boolean;
    engine?: string;
    signatures?: number | null;
    signaturesDate?: string | null;
  };
  backup: {
    state: State;
    lastAt: string | null;
    sizeBytes?: number;
    encrypted?: boolean;
  };
  disk: {
    state: State;
    freeBytes: number | null;
    totalBytes: number | null;
    databaseBytes: number;
    mediaBytes: number;
  };
  processing: { state: State; waiting: number; oldestAt: string | null };
  usage: { organizations: number; users: number; screens: number; online: number };
  mail: { state: State; transport: string };
}

/** State in words and a shape, not by color alone. */
function StateLabel({ state }: { state: State }) {
  const { t } = useTranslation();
  const look = {
    ok: { Icon: CircleCheck, className: 'text-green-800 dark:text-green-300' },
    warning: { Icon: CircleAlert, className: 'text-amber-800 dark:text-amber-300' },
    error: { Icon: CircleX, className: 'text-red-800 dark:text-red-300' },
    unknown: { Icon: CircleHelp, className: 'text-gray-700 dark:text-gray-300' },
  }[state];
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${look.className}`}>
      <look.Icon aria-hidden="true" className="size-5 shrink-0" />
      {t(`operator.states.${state}`)}
    </span>
  );
}

/** Server status for the operator of the installation (read only, refreshed every minute). */
export function OperatorStatusPage() {
  const { t, i18n } = useTranslation();
  const user = useSession().data?.user;
  const status = useQuery({
    queryKey: ['operator-status'],
    queryFn: () => get<{ status: OperatorStatus }>('/api/v1/operator/status'),
    refetchInterval: 60_000,
    retry: false,
  });
  const locale = i18n.language;
  const when = (iso: string | null | undefined) => (iso ? formatDateTime(iso, locale) : '—');
  const bytes = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : formatBytes(value, locale);

  if (status.isPending) return <Loading />;
  if (!status.data) {
    const hidden = status.error instanceof ApiError && status.error.status === 404;
    return (
      <>
        <PageHeading title={t('operator.title')} />
        <Alert variant={hidden ? 'info' : 'error'}>
          {hidden && user?.isOperator && !user.mfaEnabled ? (
            <>
              {t('operator.needsMfa')}{' '}
              <Link to="/account" className={linkClass}>
                {t('nav.account')}
              </Link>
            </>
          ) : hidden ? (
            t('operator.notOperator')
          ) : (
            t('operator.unavailable')
          )}
        </Alert>
      </>
    );
  }

  const s = status.data.status;
  const rows: { key: string; label: string; state: State; details: ReactNode }[] = [
    {
      key: 'services',
      label: t('operator.rows.services'),
      state: s.services.state,
      details: Object.entries(s.services.checks)
        .map(([name, value]) => `${name}: ${t(`operator.service.${value}`)}`)
        .join(' · '),
    },
    {
      key: 'clamav',
      label: t('operator.rows.clamav'),
      state: s.clamav.state,
      details: !s.clamav.configured
        ? t('operator.clamavOff')
        : s.clamav.engine === undefined
          ? t('operator.clamavNoAnswer')
          : t('operator.clamavDetails', {
              engine: s.clamav.engine,
              signatures: s.clamav.signatures ?? '—',
              date: when(s.clamav.signaturesDate),
            }),
    },
    {
      key: 'backup',
      label: t('operator.rows.backup'),
      state: s.backup.state,
      details: s.backup.lastAt
        ? `${t('operator.backupDetails', { when: when(s.backup.lastAt), size: bytes(s.backup.sizeBytes) })} · ${t(
            s.backup.encrypted ? 'operator.encrypted' : 'operator.notEncrypted',
          )}`
        : t('operator.noBackup'),
    },
    {
      key: 'disk',
      label: t('operator.rows.disk'),
      state: s.disk.state,
      details: t('operator.diskDetails', {
        free: bytes(s.disk.freeBytes),
        total: bytes(s.disk.totalBytes),
        database: bytes(s.disk.databaseBytes),
        media: bytes(s.disk.mediaBytes),
      }),
    },
    {
      key: 'processing',
      label: t('operator.rows.processing'),
      state: s.processing.state,
      details:
        s.processing.waiting === 0
          ? t('operator.nothingWaiting')
          : t('operator.waiting', {
              count: s.processing.waiting,
              since: when(s.processing.oldestAt),
            }),
    },
    {
      key: 'mail',
      label: t('operator.rows.mail'),
      state: s.mail.state,
      details: s.mail.transport === 'smtp' ? t('operator.mailSmtp') : t('operator.mailOff'),
    },
  ];

  return (
    <>
      <PageHeading title={t('operator.title')} />
      <p className="mb-4 text-sm text-gray-700 dark:text-gray-300">
        {t('operator.intro')}{' '}
        <span role="status">{t('operator.checkedAt', { when: when(s.checkedAt) })}</span>
      </p>
      <TableRegion label={t('operator.title')}>
        <table className="data-table">
          <caption className="sr-only">{t('operator.title')}</caption>
          <thead>
            <tr>
              <th scope="col" className="text-start">
                {t('operator.columns.item')}
              </th>
              <th scope="col" className="text-start">
                {t('operator.columns.state')}
              </th>
              <th scope="col" className="text-start">
                {t('operator.columns.details')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="text-start font-semibold">
                  {row.label}
                </th>
                <td>
                  <StateLabel state={row.state} />
                </td>
                <td>{row.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableRegion>

      <section aria-labelledby="operator-usage" className="mt-8">
        <h2 id="operator-usage" className="mb-2 text-xl font-semibold">
          {t('operator.usageTitle')}
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['organizations', s.usage.organizations],
              ['users', s.usage.users],
              ['screens', s.usage.screens],
              ['online', s.usage.online],
            ] as const
          ).map(([key, value]) => (
            <div
              key={key}
              className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <dt className="text-sm text-gray-700 dark:text-gray-300">
                {t(`operator.usage.${key}`)}
              </dt>
              <dd className="text-2xl font-semibold">{value.toLocaleString(locale)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-gray-700 dark:text-gray-300" dir="ltr">
          Rubinny {s.version.server} · {s.version.migration ?? '—'}
        </p>
      </section>
    </>
  );
}
