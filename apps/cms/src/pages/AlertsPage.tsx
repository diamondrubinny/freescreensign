// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Siren } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { get, post } from '../api/client';
import type { AlertItem, ScreenItem } from '../api/types';
import { AiSuggest } from '../components/AiSuggest';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { TableRegion } from '../components/TableRegion';
import {
  Card,
  EmptyState,
  IconTile,
  SectionHeading,
  StatusPill,
  inputClass,
} from '../components/ui';
import { formatDateTime } from '../lib/format';
import { useFormErrors } from '../lib/use-form-errors';
import { useOrgRole } from '../lib/use-org-role';

type Style = AlertItem['style'];
type TemplateKey = 'evacuate' | 'shelter' | 'lockdown' | 'general';

const TEMPLATES: Record<TemplateKey, Style> = {
  evacuate: 'emergency',
  shelter: 'emergency',
  lockdown: 'emergency',
  general: 'notice',
};

const DURATIONS = [null, 15, 30, 60, 120, 240, 1440] as const;

interface Draft {
  style: Style;
  title: string;
  message: string;
  allScreens: boolean;
  screenIds: string[];
  durationMinutes: number | null;
}

const EMPTY: Draft = {
  style: 'emergency',
  title: '',
  message: '',
  allScreens: true,
  screenIds: [],
  durationMinutes: null,
};

export function AlertsPage() {
  const { t, i18n } = useTranslation();
  const { orgId = '' } = useParams();
  const canEdit = useOrgRole(orgId).allowed;
  const queryClient = useQueryClient();
  const formId = useId();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<'title' | 'screens' | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const alerts = useQuery({
    queryKey: ['alerts', orgId],
    queryFn: () =>
      get<{ active: AlertItem[]; recent: AlertItem[] }>(`/api/v1/orgs/${orgId}/alerts`),
    // Timed alerts end by themselves; keep the status current.
    refetchInterval: 15_000,
  });
  const screens = useQuery({
    queryKey: ['screens', orgId],
    queryFn: () => get<{ screens: ScreenItem[] }>(`/api/v1/orgs/${orgId}/screens`),
    enabled: canEdit,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['alerts', orgId] });
  const start = useMutation({
    mutationFn: (body: Draft) =>
      post<{ alert: AlertItem; screens: number }>(`/api/v1/orgs/${orgId}/alerts`, {
        style: body.style,
        title: body.title.trim(),
        message: body.message.trim(),
        screenIds: body.allScreens ? null : body.screenIds,
        durationMinutes: body.durationMinutes,
      }),
    onSuccess: ({ screens: count }) => {
      setConfirming(false);
      setDraft(EMPTY);
      setNotice(t('alerts.started', { count }));
      void refresh();
    },
    onError: () => {
      setConfirming(false);
    },
  });
  const end = useMutation({
    mutationFn: (alert: AlertItem) =>
      post<{ alert: AlertItem }>(`/api/v1/orgs/${orgId}/alerts/${alert.id}/end`),
    onSuccess: ({ alert }) => {
      setNotice(t('alerts.ended', { title: alert.title }));
      void refresh();
    },
    onSettled: () => void refresh(),
  });
  const errors = useFormErrors(start.error);
  const endErrors = useFormErrors(end.error);
  const listErrors = useFormErrors(alerts.error);

  const applyTemplate = (key: TemplateKey) => {
    setDraft((current) => ({
      ...current,
      style: TEMPLATES[key],
      title: t(`alerts.templates.${key}.title`),
      message: t(`alerts.templates.${key}.message`),
    }));
    setProblem(null);
    formRef.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
  };

  const target = (alert: AlertItem) =>
    alert.screenIds === null
      ? t('alerts.allScreens')
      : t('alerts.someScreens', { count: alert.screenIds.length });

  return (
    <>
      <PageHeading title={t('alerts.title')} description={t('alerts.intro')} />
      <div aria-live="polite" className="mb-4 empty:hidden">
        {notice && <Alert variant="success">{notice}</Alert>}
      </div>
      {(listErrors.form ?? endErrors.form) && (
        <div className="mb-6">
          <Alert variant="error">{listErrors.form ?? endErrors.form}</Alert>
        </div>
      )}

      <section aria-labelledby="active-alerts-heading" className="mb-10">
        <SectionHeading id="active-alerts-heading" title={t('alerts.active')} />
        {alerts.isPending && <Loading />}
        {alerts.data?.active.length === 0 && (
          <EmptyState icon={Megaphone} title={t('alerts.none')} text={t('alerts.noneText')} />
        )}
        <ul className="grid gap-4 lg:grid-cols-2">
          {alerts.data?.active.map((alert) => (
            <Card
              as="li"
              key={alert.id}
              className={`flex gap-3 border-s-4 p-4 ${
                alert.style === 'emergency' ? 'border-s-red-700' : 'border-s-amber-600'
              }`}
            >
              <IconTile
                icon={alert.style === 'emergency' ? Siren : Megaphone}
                tone={alert.style === 'emergency' ? 'rose' : 'amber'}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={alert.style === 'emergency' ? 'red' : 'amber'}>
                    {t(`alerts.styles.${alert.style}`)} · {t('alerts.onScreens')}
                  </StatusPill>
                </div>
                <h3 className="text-lg font-bold" dir="auto">
                  {alert.title}
                </h3>
                {alert.message && (
                  <p className="whitespace-pre-line" dir="auto">
                    {alert.message}
                  </p>
                )}
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {target(alert)} ·{' '}
                  {t('alerts.since', { when: formatDateTime(alert.startsAt, i18n.language) })}
                  {alert.endsAt &&
                    ` · ${t('alerts.until', { when: formatDateTime(alert.endsAt, i18n.language) })}`}
                </p>
                {canEdit && (
                  <div className="mt-2">
                    <Button
                      variant="secondary"
                      loading={end.isPending && end.variables.id === alert.id}
                      // Starts with the visible text (WCAG 2.5.3), then names the alert.
                      aria-label={`${t('alerts.end')}: ${alert.title}`}
                      onClick={() => {
                        end.mutate(alert);
                      }}
                    >
                      {t('alerts.end')}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </ul>
      </section>

      {canEdit && (
        <section aria-labelledby="start-alert-heading" className="mb-10 max-w-3xl">
          <SectionHeading
            id="start-alert-heading"
            title={t('alerts.start')}
            description={t('alerts.startHint')}
          />
          <Card className="p-5">
            <fieldset className="mb-5">
              <legend className="mb-2 font-medium">{t('alerts.templatesLabel')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(TEMPLATES) as TemplateKey[]).map((key) => (
                  <Button
                    key={key}
                    variant="secondary"
                    className="justify-start"
                    onClick={() => {
                      applyTemplate(key);
                    }}
                  >
                    {TEMPLATES[key] === 'emergency' ? (
                      <Siren aria-hidden="true" className="text-red-700 dark:text-red-400" />
                    ) : (
                      <Megaphone
                        aria-hidden="true"
                        className="text-amber-700 dark:text-amber-400"
                      />
                    )}
                    {t(`alerts.templates.${key}.title`)}
                  </Button>
                ))}
              </div>
            </fieldset>

            <form
              ref={formRef}
              noValidate
              aria-labelledby="start-alert-heading"
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                const missing =
                  draft.title.trim() === ''
                    ? 'title'
                    : !draft.allScreens && draft.screenIds.length === 0
                      ? 'screens'
                      : null;
                setProblem(missing);
                if (missing === 'title')
                  formRef.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
                if (!missing) setConfirming(true);
              }}
            >
              {errors.form && <Alert variant="error">{errors.form}</Alert>}
              <fieldset>
                <legend className="mb-1 font-medium">{t('alerts.style')}</legend>
                <div className="flex flex-wrap gap-4">
                  {(['emergency', 'notice'] as const).map((style) => (
                    <label key={style} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="style"
                        value={style}
                        checked={draft.style === style}
                        onChange={() => {
                          setDraft({ ...draft, style });
                        }}
                        className="size-4"
                      />
                      {t(`alerts.styles.${style}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field
                label={t('alerts.alertTitle')}
                name="title"
                required
                maxLength={120}
                value={draft.title}
                onChange={(event) => {
                  setDraft({ ...draft, title: event.target.value });
                }}
                error={problem === 'title' ? t('alerts.titleRequired') : errors.fields.title}
                dir="auto"
              />
              <div className="flex flex-col gap-1">
                <label htmlFor={`${formId}-message`} className="font-medium">
                  {t('alerts.message')}
                </label>
                <textarea
                  id={`${formId}-message`}
                  name="message"
                  rows={3}
                  maxLength={500}
                  dir="auto"
                  value={draft.message}
                  onChange={(event) => {
                    setDraft({ ...draft, message: event.target.value });
                  }}
                  className={inputClass}
                />
                <AiSuggest
                  task="alert"
                  controls={`${formId}-message`}
                  maxLength={500}
                  getText={() => draft.message || draft.title}
                  onAccept={(message) => {
                    setDraft({ ...draft, message });
                  }}
                />
              </div>

              <fieldset>
                <legend className="mb-1 font-medium">{t('alerts.target')}</legend>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="target"
                      checked={draft.allScreens}
                      onChange={() => {
                        setDraft({ ...draft, allScreens: true });
                      }}
                      className="size-4"
                    />
                    {t('alerts.allScreens')}
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="target"
                      checked={!draft.allScreens}
                      onChange={() => {
                        setDraft({ ...draft, allScreens: false });
                      }}
                      className="size-4"
                    />
                    {t('alerts.chooseScreens')}
                  </label>
                </div>
                {!draft.allScreens && (
                  <div className="mt-3">
                    {problem === 'screens' && (
                      <p className="mb-2 font-medium text-red-700 dark:text-red-400" role="alert">
                        {t('alerts.screensRequired')}
                      </p>
                    )}
                    {screens.isPending && <Loading />}
                    {screens.data?.screens.length === 0 && <p>{t('alerts.noScreens')}</p>}
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {screens.data?.screens.map((screen) => (
                        <li key={screen.id}>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={draft.screenIds.includes(screen.id)}
                              onChange={(event) => {
                                setDraft({
                                  ...draft,
                                  screenIds: event.target.checked
                                    ? [...draft.screenIds, screen.id]
                                    : draft.screenIds.filter((id) => id !== screen.id),
                                });
                              }}
                              className="size-4"
                            />
                            <span dir="auto">{screen.name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </fieldset>

              <div className="flex flex-col gap-1">
                <label htmlFor={`${formId}-duration`} className="font-medium">
                  {t('alerts.duration')}
                </label>
                <select
                  id={`${formId}-duration`}
                  value={draft.durationMinutes ?? ''}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      durationMinutes:
                        event.target.value === '' ? null : Number(event.target.value),
                    });
                  }}
                  className={`${inputClass} max-w-xs`}
                >
                  {DURATIONS.map((minutes) => (
                    <option key={String(minutes)} value={minutes ?? ''}>
                      {minutes === null
                        ? t('alerts.untilEnded')
                        : minutes < 60
                          ? t('alerts.minutes', { count: minutes })
                          : t('alerts.hours', { count: minutes / 60 })}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Button type="submit" variant={draft.style === 'emergency' ? 'danger' : 'primary'}>
                  {t('alerts.send')}
                </Button>
              </div>
            </form>
          </Card>
          <ConfirmDialog
            open={confirming}
            message={
              draft.allScreens
                ? t('alerts.confirmAll', { title: draft.title.trim() })
                : t('alerts.confirmSome', {
                    title: draft.title.trim(),
                    count: draft.screenIds.length,
                  })
            }
            confirmLabel={t('alerts.send')}
            loading={start.isPending}
            onCancel={() => {
              setConfirming(false);
            }}
            onConfirm={() => {
              start.mutate(draft);
            }}
          />
        </section>
      )}

      <section aria-labelledby="recent-alerts-heading">
        <SectionHeading id="recent-alerts-heading" title={t('alerts.history')} />
        {alerts.data && alerts.data.recent.length > 0 && (
          <TableRegion label={t('alerts.history')}>
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-gray-300 dark:border-gray-700">
                  <th scope="col" className="px-2 py-2 text-start">
                    {t('alerts.alertTitle')}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start">
                    {t('alerts.style')}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start">
                    {t('alerts.started_at')}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start">
                    {t('alerts.by')}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start">
                    {t('alerts.status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {alerts.data.recent.map((alert) => (
                  <tr key={alert.id} className="border-b border-gray-200 dark:border-gray-800">
                    <td className="px-2 py-2">
                      <bdi>{alert.title}</bdi>
                    </td>
                    <td className="px-2 py-2">{t(`alerts.styles.${alert.style}`)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {formatDateTime(alert.startsAt, i18n.language)}
                    </td>
                    <td className="px-2 py-2">
                      <bdi>{alert.createdBy ?? '—'}</bdi>
                    </td>
                    <td className="px-2 py-2">
                      {alert.active ? (
                        <StatusPill tone="red">{t('alerts.onScreens')}</StatusPill>
                      ) : (
                        <StatusPill tone="gray">
                          {alert.endedAt
                            ? t('alerts.endedBy', { name: alert.endedBy ?? '—' })
                            : t('alerts.expired')}
                        </StatusPill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
        )}
      </section>
    </>
  );
}
