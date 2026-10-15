import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Blocks,
  Building2,
  Images,
  LayoutTemplate,
  ListVideo,
  Monitor,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { hasRole } from '@rubinny/shared';
import { get, post } from '../api/client';
import { useRefreshSession, useSession } from '../api/session';
import type { LayoutSummary, PlaylistSummary, ScreenItem, WidgetItem } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { PageHeading } from '../components/PageHeading';
import { Card, IconTile, SectionHeading, linkClass } from '../components/ui';
import { useFormErrors } from '../lib/use-form-errors';

function Stat({
  icon,
  tone,
  label,
  value: count,
  detail,
  to,
}: {
  icon: LucideIcon;
  tone: 'brand' | 'green' | 'amber' | 'sky' | 'rose';
  label: string;
  value: number | undefined;
  detail?: string | undefined;
  to: string;
}) {
  return (
    <Card as="li" className="relative p-5 transition-shadow focus-within:shadow-md hover:shadow-md">
      <div className="flex items-center gap-4">
        <IconTile icon={icon} tone={tone} size="lg" />
        <div>
          <p className="text-3xl font-extrabold tabular-nums">{count ?? '—'}</p>
          {/* The link covers the whole card; its text is the label. */}
          <Link to={to} className="font-medium after:absolute after:inset-0 after:content-['']">
            {label}
          </Link>
          {detail && <p className="text-sm text-gray-700 dark:text-gray-300">{detail}</p>}
        </div>
      </div>
    </Card>
  );
}

function OrgOverview({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { t } = useTranslation();
  const base = `/api/v1/orgs/${orgId}`;
  const screens = useQuery({
    queryKey: ['screens', orgId],
    queryFn: () => get<{ screens: ScreenItem[] }>(`${base}/screens`),
  });
  const playlists = useQuery({
    queryKey: ['playlists', orgId],
    queryFn: () => get<{ playlists: PlaylistSummary[] }>(`${base}/playlists`),
  });
  const media = useQuery({
    queryKey: ['media-usage', orgId],
    queryFn: () => get<{ fileCount: number }>(`${base}/media-usage`),
  });
  const layouts = useQuery({
    queryKey: ['layouts', orgId],
    queryFn: () => get<{ layouts: LayoutSummary[] }>(`${base}/layouts`),
  });
  const widgets = useQuery({
    queryKey: ['widgets', orgId],
    queryFn: () => get<{ widgets: WidgetItem[] }>(`${base}/widgets`),
  });
  const screenList = screens.data?.screens;
  const online = screenList?.filter((s) => s.online).length ?? 0;
  const org = `/orgs/${orgId}`;

  const steps = [
    {
      icon: Monitor,
      title: t('dashboard.stepScreen'),
      text: t('dashboard.stepScreenText'),
      to: `${org}/screens`,
    },
    {
      icon: Images,
      title: t('dashboard.stepContent'),
      text: t('dashboard.stepContentText'),
      to: `${org}/media`,
    },
    {
      icon: LayoutTemplate,
      title: t('dashboard.stepLayout'),
      text: t('dashboard.stepLayoutText'),
      to: `${org}/layouts`,
    },
  ];

  return (
    <>
      <section aria-labelledby="overview-heading" className="mb-10">
        <SectionHeading id="overview-heading" title={t('dashboard.overview', { org: orgName })} />
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Stat
            icon={Monitor}
            tone="green"
            label={t('dashboard.statScreens')}
            value={screenList?.length}
            detail={
              screenList
                ? t('dashboard.statOnline', { online, total: screenList.length })
                : undefined
            }
            to={`${org}/screens`}
          />
          <Stat
            icon={Images}
            tone="sky"
            label={t('dashboard.statMedia')}
            value={media.data?.fileCount}
            to={`${org}/media`}
          />
          <Stat
            icon={ListVideo}
            tone="brand"
            label={t('dashboard.statPlaylists')}
            value={playlists.data?.playlists.length}
            to={`${org}/playlists`}
          />
          <Stat
            icon={LayoutTemplate}
            tone="amber"
            label={t('dashboard.statLayouts')}
            value={layouts.data?.layouts.length}
            to={`${org}/layouts`}
          />
          <Stat
            icon={Blocks}
            tone="rose"
            label={t('dashboard.statWidgets')}
            value={widgets.data?.widgets.length}
            to={`${org}/widgets`}
          />
        </ul>
      </section>

      <section aria-labelledby="quick-start-heading" className="mb-10">
        <SectionHeading
          id="quick-start-heading"
          title={t('dashboard.quickStart')}
          description={t('dashboard.quickStartText')}
        />
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <Card as="li" key={step.to} className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-8 items-center justify-center rounded-full bg-brand-700 font-bold text-white"
                >
                  {index + 1}
                </span>
                <IconTile icon={step.icon} size="sm" />
              </div>
              <h3 className="text-lg font-bold">{step.title}</h3>
              <p className="flex-1 text-gray-700 dark:text-gray-300">{step.text}</p>
              <Link to={step.to} className={linkClass}>
                {t('dashboard.go')} <span className="sr-only">{step.title}</span>
              </Link>
            </Card>
          ))}
        </ol>
      </section>
    </>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const session = useSession().data;
  const refresh = useRefreshSession();
  const [showCreate, setShowCreate] = useState(false);
  const create = useMutation({
    mutationFn: (name: string) => post('/api/v1/orgs', { name }),
    onSuccess: async () => {
      setShowCreate(false);
      await refresh();
    },
  });
  const errors = useFormErrors(create.error);
  if (!session) return null;
  const first = session.memberships[0];

  return (
    <>
      <PageHeading
        title={t('dashboard.title')}
        description={t('dashboard.welcome', { name: session.user.name })}
      />

      {!session.user.mfaEnabled && (
        <div className="mb-8">
          <Alert variant="warning">
            <div className="flex flex-wrap items-center gap-3">
              <ShieldAlert aria-hidden="true" className="size-5 shrink-0" />
              <p>{t('dashboard.mfaWarning')}</p>
              <Link to="/account" className="font-semibold underline">
                {t('dashboard.enableMfa')}
              </Link>
            </div>
          </Alert>
        </div>
      )}

      {first && <OrgOverview orgId={first.orgId} orgName={first.name} />}

      <section aria-labelledby="orgs-heading" className="mb-8">
        <SectionHeading id="orgs-heading" title={t('dashboard.myOrgs')}>
          {!showCreate && (
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreate(true);
              }}
            >
              {t('dashboard.createOrg')}
            </Button>
          )}
        </SectionHeading>
        {session.memberships.length === 0 ? (
          <p>{t('dashboard.noOrgs')}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {session.memberships.map((org) => (
              <Card as="li" key={org.orgId} className="flex items-center gap-4 p-5">
                <IconTile icon={Building2} tone="gray" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-bold">{org.name}</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {t('fields.role')}: {t(`roles.${org.role}`)}
                  </p>
                </div>
                {hasRole(org.role, 'ADMIN') && (
                  <Link to={`/orgs/${org.orgId}/members`} className={linkClass}>
                    {t('dashboard.open')} <span className="sr-only">{org.name}</span>
                  </Link>
                )}
              </Card>
            ))}
          </ul>
        )}
        {showCreate && (
          <Card className="mt-4 max-w-md p-5">
            <Form
              errors={errors}
              onSubmit={(data) => {
                create.mutate(value(data, 'name'));
              }}
            >
              <Field label={t('fields.orgName')} name="name" required error={errors.fields.name} />
              <div className="flex gap-2">
                <Button type="submit" loading={create.isPending}>
                  {t('dashboard.createOrg')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCreate(false);
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </Form>
          </Card>
        )}
      </section>
    </>
  );
}
