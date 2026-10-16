import { useMutation, useQuery } from '@tanstack/react-query';
import { CLOCK_WARNING_MS } from '@rubinny/shared';
import { Camera, Image as ImageIcon, Puzzle, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { get, post } from '../api/client';
import type { NowPlayingEntry, ScreenItem, ScreenStatus } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { Card, IconTile, StatusPill, linkClass } from '../components/ui';
import { WIDGET_ICONS } from '../components/widget-icons';
import { formatDateTime } from '../lib/format';
import { useFormErrors } from '../lib/use-form-errors';
import { useOrgRole } from '../lib/use-org-role';

const percent = (ratio: number) => `${String(Math.round(ratio * 1000) / 10)}%`;

function NowPlayingCard({ entry }: { entry: NowPlayingEntry }) {
  const { t } = useTranslation();
  const widgetIcon = entry.kind === 'widget' ? WIDGET_ICONS[entry.widgetType] : undefined;
  return (
    <Card as="li" className="flex items-center gap-3 overflow-hidden p-3">
      {entry.kind === 'media' && entry.thumbnailUrl ? (
        <img
          src={entry.thumbnailUrl}
          alt=""
          className="size-16 shrink-0 rounded-md bg-gray-100 object-cover dark:bg-gray-800"
        />
      ) : (
        <IconTile
          icon={
            entry.kind === 'widget'
              ? (widgetIcon?.icon ?? Puzzle)
              : entry.mediaKind === 'video'
                ? Video
                : ImageIcon
          }
          tone={widgetIcon?.tone ?? 'gray'}
          size="lg"
        />
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold" dir="auto">
          {entry.name}
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {entry.kind === 'media'
            ? t(`screenPage.media.${entry.mediaKind}`)
            : t(`widgets.types.${entry.widgetType}`, { defaultValue: entry.widgetType })}
          {' · '}
          <span dir="auto">{t('screenPage.zone', { name: entry.zoneId })}</span>
        </p>
      </div>
    </Card>
  );
}

/** One screen: connection, clock, uptime and what it shows right now. */
export function ScreenDetailPage() {
  const { t, i18n } = useTranslation();
  const { orgId = '', screenId = '' } = useParams();
  const canEdit = useOrgRole(orgId).allowed;

  const screens = useQuery({
    queryKey: ['screens', orgId],
    queryFn: () => get<{ screens: ScreenItem[] }>(`/api/v1/orgs/${orgId}/screens`),
    refetchInterval: 15_000,
  });
  const status = useQuery({
    queryKey: ['screen-status', orgId, screenId],
    queryFn: () =>
      get<{ status: ScreenStatus }>(`/api/v1/orgs/${orgId}/screens/${screenId}/status`),
    // Poll faster while a screenshot is on its way.
    refetchInterval: (query) => (query.state.data?.status.screenshotPending ? 2000 : 15_000),
  });
  const screenshot = useMutation({
    mutationFn: () => post(`/api/v1/orgs/${orgId}/screens/${screenId}/screenshot`),
    onSuccess: () => status.refetch(),
  });
  const reload = useMutation({
    mutationFn: () => post(`/api/v1/orgs/${orgId}/screens/${screenId}/reload`),
  });
  const errors = useFormErrors(status.error ?? screens.error ?? reload.error ?? screenshot.error);

  if (status.isPending || screens.isPending) return <Loading />;
  const screen = screens.data?.screens.find((s) => s.id === screenId);
  if (!status.data || !screen) {
    return <Alert variant="error">{errors.form ?? t('errors.NOT_FOUND')}</Alert>;
  }
  const info = status.data.status;
  const offset = info.clockOffsetMs;
  const minutes = offset === null ? 0 : Math.round(Math.abs(offset) / 60_000);
  const seconds = offset === null ? 0 : Math.round(Math.abs(offset) / 1000);

  return (
    <>
      <PageHeading title={screen.name} />
      <p className="mb-6">
        <Link to={`/orgs/${orgId}/screens`} className={linkClass}>
          {t('screenPage.back')}
        </Link>
      </p>
      {errors.form && (
        <div className="mb-6">
          <Alert variant="error">{errors.form}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" className="p-5">
          <h2 className="mb-3 text-xl font-semibold">{t('screenPage.status')}</h2>
          <p className="mb-3">
            <StatusPill tone={info.online ? 'green' : 'gray'}>
              {info.online ? t('screens.online') : t('screens.offline')}
            </StatusPill>
            {!info.online && (
              <span className="ms-2 text-sm text-gray-700 dark:text-gray-300">
                {info.lastSeenAt
                  ? t('screens.lastSeen', { when: formatDateTime(info.lastSeenAt, i18n.language) })
                  : t('screens.neverSeen')}
              </span>
            )}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="font-medium">{t('screenPage.resolution')}</dt>
            <dd dir="ltr" className="text-end">
              {screen.resolution ?? '—'}
            </dd>
            <dt className="font-medium">{t('screenPage.playerVersion')}</dt>
            <dd dir="ltr" className="text-end">
              {screen.playerVersion ?? '—'}
            </dd>
            <dt className="font-medium">{t('screenPage.platform')}</dt>
            <dd className="text-end">{t(`screenPage.platforms.${info.platform}`)}</dd>
            <dt className="font-medium">{t('screenPage.timezone')}</dt>
            <dd dir="ltr" className="text-end">
              {screen.timezone}
            </dd>
          </dl>
          {canEdit && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                loading={reload.isPending}
                onClick={() => {
                  reload.mutate();
                }}
              >
                {t('screens.reload')}
              </Button>
              {reload.isSuccess && <span role="status">{t('screens.reloadSent')}</span>}
            </div>
          )}
        </Card>

        <Card as="section" className="p-5">
          <h2 className="mb-3 text-xl font-semibold">{t('screenPage.uptime')}</h2>
          <dl className="mb-4 grid grid-cols-2 gap-4">
            {(['day', 'week'] as const).map((key) => (
              <div key={key}>
                <dt className="text-sm text-gray-700 dark:text-gray-300">
                  {t(key === 'day' ? 'screenPage.uptimeDay' : 'screenPage.uptimeWeek')}
                </dt>
                <dd className="text-2xl font-bold" dir="ltr">
                  {info.uptime[key] === null
                    ? t('screenPage.uptimeNone')
                    : percent(info.uptime[key] ?? 0)}
                </dd>
              </div>
            ))}
          </dl>
          {/* Decorative: the numbers above carry the information. */}
          <div aria-hidden="true" className="flex h-10 items-end gap-0.5">
            {info.uptime.hours.map((ratio, index) => (
              <div
                key={index}
                title={t('screenPage.hourTooltip', {
                  hours: info.uptime.hours.length - index,
                  value: ratio === null ? '—' : percent(ratio),
                })}
                className={`flex-1 rounded-sm ${
                  ratio === null
                    ? 'h-1 bg-gray-200 dark:bg-gray-700'
                    : ratio >= 0.99
                      ? 'bg-green-600'
                      : ratio > 0
                        ? 'bg-amber-500'
                        : 'h-1 bg-red-600'
                }`}
                style={ratio !== null && ratio > 0 ? { height: `${String(ratio * 100)}%` } : {}}
              />
            ))}
          </div>

          <h3 className="mt-5 mb-1 font-semibold">{t('screenPage.clock')}</h3>
          {offset === null ? (
            <p className="text-sm">{t('screenPage.clockUnknown')}</p>
          ) : Math.abs(offset) <= CLOCK_WARNING_MS ? (
            <p className="text-sm">{t('screenPage.clockOk', { seconds })}</p>
          ) : (
            <Alert variant="warning">
              {t('screenPage.clockOff', {
                amount:
                  minutes >= 1
                    ? t('screenPage.minutes', { count: minutes })
                    : t('screenPage.seconds', { count: seconds }),
              })}
            </Alert>
          )}
        </Card>
      </div>

      <section aria-labelledby="now-playing-heading" className="mt-8">
        <h2 id="now-playing-heading" className="mb-1 text-xl font-semibold">
          {t('screenPage.nowPlaying')}
        </h2>
        {info.online && info.layout && (
          <p className="mb-3 text-gray-700 dark:text-gray-300" dir="auto">
            {info.layout.kind === 'default'
              ? t('screenPage.showingDefault')
              : t('screenPage.showing', {
                  name: info.layout.name ?? t('screenPage.unknownLayout'),
                })}
          </p>
        )}
        {!info.online ? (
          <p>{t('screenPage.nowPlayingOffline')}</p>
        ) : info.nowPlaying.length === 0 ? (
          <p>{t('screenPage.nowPlayingEmpty')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {info.nowPlaying.map((entry) => (
              <NowPlayingCard key={`${entry.zoneId}-${entry.id}`} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="screenshot-heading" className="mt-8">
        <h2 id="screenshot-heading" className="mb-2 text-xl font-semibold">
          {t('screenPage.screenshot')}
        </h2>
        {info.capabilities.includes('screenshot') ? (
          <>
            {canEdit && (
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  loading={screenshot.isPending || info.screenshotPending}
                  disabled={!info.online}
                  onClick={() => {
                    screenshot.mutate();
                  }}
                >
                  <Camera aria-hidden="true" className="size-4" />
                  {t('screenPage.takeScreenshot')}
                </Button>
                <span role="status" className="text-sm">
                  {info.screenshotPending
                    ? t('screenPage.screenshotPending')
                    : !info.online
                      ? t('screenPage.screenshotOffline')
                      : ''}
                </span>
              </div>
            )}
            {info.screenshot ? (
              <figure>
                <img
                  src={`/api/v1/orgs/${orgId}/screens/${screenId}/screenshot?t=${encodeURIComponent(info.screenshot.takenAt)}`}
                  alt={t('screenPage.screenshotAlt', {
                    name: screen.name,
                    when: formatDateTime(info.screenshot.takenAt, i18n.language),
                  })}
                  width={info.screenshot.width}
                  height={info.screenshot.height}
                  className="h-auto w-full max-w-3xl rounded-lg border border-gray-300 bg-black dark:border-gray-700"
                />
                <figcaption className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  {t('screenPage.screenshotTaken', {
                    when: formatDateTime(info.screenshot.takenAt, i18n.language),
                  })}
                </figcaption>
              </figure>
            ) : (
              <p className="text-gray-700 dark:text-gray-300">{t('screenPage.noScreenshot')}</p>
            )}
          </>
        ) : (
          <p className="text-gray-700 dark:text-gray-300">
            {t('screenPage.screenshotUnsupported')}
          </p>
        )}
      </section>
    </>
  );
}
