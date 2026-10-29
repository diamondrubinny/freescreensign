// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { SCHEDULE_LIMITS } from '@rubinny/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { del, get, patch } from '../api/client';
import type {
  LayoutSummary,
  PlaylistSummary,
  ScheduleDetail,
  ScheduleEntryInput,
} from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { Loading } from '../components/Loading';
import { SacredField } from '../components/SacredField';
import { PageHeading } from '../components/PageHeading';
import { Card, inputClass, linkClass } from '../components/ui';
import { useDuplicate } from '../lib/use-duplicate';
import { useFormErrors } from '../lib/use-form-errors';
import { useOrgRole } from '../lib/use-org-role';
import { useSacredSettings } from '../lib/use-sacred';
import { ScheduleTimeline, entryColor } from './schedule/ScheduleTimeline';

/** An entry being edited; `key` keeps React state stable while entries move. */
type DraftEntry = ScheduleEntryInput & { key: string };

interface Draft {
  name: string;
  entries: DraftEntry[];
}

let nextKey = 0;
const newKey = () => `entry-${String(++nextKey)}`;

/** The API fields of an entry (drops the local key). */
const toInput = (entry: ScheduleEntryInput): ScheduleEntryInput => ({
  name: entry.name,
  layoutId: entry.layoutId,
  playlistId: entry.playlistId,
  dateFrom: entry.dateFrom,
  dateTo: entry.dateTo,
  daysOfWeek: entry.daysOfWeek,
  timeFrom: entry.timeFrom,
  timeTo: entry.timeTo,
  sacred: entry.sacred,
  enabled: entry.enabled,
});

const small = `${inputClass} px-2! py-1.5!`;

/** Field-level error text (the server returns paths such as `entries.2.timeTo`). */
function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm font-medium text-red-800 dark:text-red-300">
      {message}
    </p>
  );
}

export function ScheduleEditorPage() {
  const { t, i18n } = useTranslation();
  const { orgId = '', scheduleId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEdit = useOrgRole(orgId).allowed;

  const detail = useQuery({
    queryKey: ['schedule', orgId, scheduleId],
    queryFn: () =>
      get<{ schedule: ScheduleDetail }>(`/api/v1/orgs/${orgId}/schedules/${scheduleId}`),
  });
  const layouts = useQuery({
    queryKey: ['layouts', orgId],
    queryFn: () => get<{ layouts: LayoutSummary[] }>(`/api/v1/orgs/${orgId}/layouts`),
  });
  const playlists = useQuery({
    queryKey: ['playlists', orgId],
    queryFn: () => get<{ playlists: PlaylistSummary[] }>(`/api/v1/orgs/${orgId}/playlists`),
  });
  const sacredSettings = useSacredSettings(orgId);
  const sacredAvailable = sacredSettings.data ? sacredSettings.data.settings !== null : undefined;

  // Local editable copy (null = show the server version); saved in one PATCH.
  const [edited, setEdited] = useState<Draft | null>(null);
  const save = useMutation({
    mutationFn: (draft: Draft) =>
      patch<{ schedule: ScheduleDetail }>(`/api/v1/orgs/${orgId}/schedules/${scheduleId}`, {
        name: draft.name,
        entries: draft.entries.map(toInput),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['schedule', orgId, scheduleId], data);
      setEdited(null);
      void queryClient.invalidateQueries({ queryKey: ['schedules', orgId] });
    },
  });
  const [deleting, setDeleting] = useState(false);
  const remove = useMutation({
    mutationFn: () => del(`/api/v1/orgs/${orgId}/schedules/${scheduleId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['schedules', orgId] });
      void navigate(`/orgs/${orgId}/schedules`);
    },
  });
  const duplicate = useDuplicate(orgId, 'schedules', scheduleId);
  const errors = useFormErrors(save.error);
  const loadErrors = useFormErrors(detail.error ?? remove.error ?? duplicate.error);
  if (detail.isPending) return <Loading />;
  if (!detail.data)
    return <Alert variant="error">{loadErrors.form ?? t('errors.NOT_FOUND')}</Alert>;
  const schedule = detail.data.schedule;

  const draft: Draft = edited ?? {
    name: schedule.name,
    // Saved entries are keyed by their id; new ones get a local key.
    entries: schedule.entries.map((entry) => ({ ...toInput(entry), key: entry.id })),
  };
  const dirty = edited !== null;
  const update = (patchDraft: Partial<Draft>) => {
    setEdited({ ...draft, ...patchDraft });
  };
  const updateEntry = (index: number, patchEntry: Partial<ScheduleEntryInput>) => {
    update({
      entries: draft.entries.map((entry, i) => (i === index ? { ...entry, ...patchEntry } : entry)),
    });
  };
  const move = (index: number, by: -1 | 1) => {
    const entries = [...draft.entries];
    const [entry] = entries.splice(index, 1);
    if (!entry) return;
    entries.splice(index + by, 0, entry);
    update({ entries });
  };
  const fieldError = (path: string) => errors.fields[path];

  const timeZone =
    schedule.screens[0]?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' });
  // 2026-10-11 is a Sunday.
  const dayLabels = Array.from({ length: 7 }, (_, day) =>
    weekday.format(new Date(Date.UTC(2026, 9, 11 + day))),
  );
  const layoutOptions = layouts.data?.layouts ?? [];
  const playlistOptions = playlists.data?.playlists ?? [];

  return (
    <>
      <PageHeading title={`${t('schedules.editorTitle')}: ${schedule.name}`} />
      <p className="mb-6">
        <Link to={`/orgs/${orgId}/schedules`} className={linkClass}>
          {t('schedules.title')}
        </Link>
      </p>

      <Card className="mb-8 p-4">
        <h2 className="font-semibold">{t('schedules.screens')}</h2>
        {schedule.screens.length > 0 ? (
          <p dir="auto">{schedule.screens.map((screen) => screen.name).join(', ')}</p>
        ) : (
          <p className="text-gray-700 dark:text-gray-300">{t('schedules.noScreens')}</p>
        )}
      </Card>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form
          noValidate
          aria-labelledby="schedule-form-heading"
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(draft);
          }}
        >
          <h2 id="schedule-form-heading" className="sr-only">
            {t('schedules.editorTitle')}
          </h2>
          {(errors.form ?? Object.keys(errors.fields).length > 0) && (
            <Alert variant={errors.form ? errors.variant : 'error'}>
              {errors.form ?? t('validation.summary')}
            </Alert>
          )}
          <fieldset disabled={!canEdit} className="flex flex-col gap-6">
            <legend className="sr-only">{t('schedules.editorTitle')}</legend>
            <div className="flex flex-col gap-1">
              <label htmlFor="schedule-name" className="font-medium">
                {t('schedules.name')}
              </label>
              <input
                id="schedule-name"
                required
                maxLength={200}
                dir="auto"
                value={draft.name}
                aria-invalid={fieldError('name') ? true : undefined}
                aria-describedby={fieldError('name') ? 'schedule-name-error' : undefined}
                onChange={(event) => {
                  update({ name: event.target.value });
                }}
                className={`${inputClass} max-w-lg`}
              />
              <FieldError id="schedule-name-error" message={fieldError('name')} />
            </div>

            <section aria-labelledby="entries-heading" className="flex flex-col gap-4">
              <div>
                <h2 id="entries-heading" className="text-xl font-semibold">
                  {t('schedules.entries')}
                </h2>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t('schedules.priorityHint')}
                </p>
              </div>
              {draft.entries.length === 0 && (
                <p className="rounded-lg border-2 border-dashed border-gray-300 p-4 dark:border-gray-700">
                  {t('schedules.noEntries')}
                </p>
              )}
              <ol className="flex flex-col gap-4">
                {draft.entries.map((entry, index) => {
                  const prefix = `entries.${String(index)}`;
                  const id = (key: string) => `${entry.key}-${key}`;
                  const label = entry.name || t('schedules.unnamed');
                  const contentValue = entry.layoutId
                    ? `layout:${entry.layoutId}`
                    : entry.playlistId
                      ? `playlist:${entry.playlistId}`
                      : '';
                  const contentError =
                    fieldError(`${prefix}.layoutId`) ?? fieldError(`${prefix}.playlistId`);
                  const allDay = entry.timeFrom === null;
                  return (
                    <li key={entry.key}>
                      <fieldset
                        className={`flex flex-col gap-4 rounded-xl border border-gray-200 border-s-8 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${entry.enabled ? '' : 'opacity-75'}`}
                        style={{ borderInlineStartColor: entryColor(index) }}
                      >
                        <legend className="px-1 font-semibold">
                          {t('schedules.entry', { index: index + 1 })}:{' '}
                          <span dir="auto">{label}</span>
                          {!entry.enabled && ` (${t('schedules.disabled')})`}
                        </legend>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="flex flex-col gap-1">
                            <label htmlFor={id('name')} className="text-sm font-medium">
                              {t('schedules.entryName')}
                            </label>
                            <input
                              id={id('name')}
                              maxLength={200}
                              dir="auto"
                              value={entry.name}
                              aria-invalid={fieldError(`${prefix}.name`) ? true : undefined}
                              aria-describedby={
                                fieldError(`${prefix}.name`) ? id('name-error') : undefined
                              }
                              onChange={(event) => {
                                updateEntry(index, { name: event.target.value });
                              }}
                              className={small}
                            />
                            <FieldError
                              id={id('name-error')}
                              message={fieldError(`${prefix}.name`)}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label htmlFor={id('content')} className="text-sm font-medium">
                              {t('schedules.content')}
                            </label>
                            <select
                              id={id('content')}
                              value={contentValue}
                              aria-invalid={contentError ? true : undefined}
                              aria-describedby={contentError ? id('content-error') : undefined}
                              onChange={(event) => {
                                const [kind, value = ''] = event.target.value.split(':');
                                updateEntry(index, {
                                  layoutId: kind === 'layout' ? value : null,
                                  playlistId: kind === 'playlist' ? value : null,
                                });
                              }}
                              className={small}
                            >
                              <option value="">{t('schedules.chooseContent')}</option>
                              {layoutOptions.length > 0 && (
                                <optgroup label={t('schedules.layoutsGroup')}>
                                  {layoutOptions.map((layout) => (
                                    <option key={layout.id} value={`layout:${layout.id}`}>
                                      {layout.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {playlistOptions.length > 0 && (
                                <optgroup label={t('schedules.playlistsGroup')}>
                                  {playlistOptions.map((playlist) => (
                                    <option key={playlist.id} value={`playlist:${playlist.id}`}>
                                      {playlist.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                            <FieldError id={id('content-error')} message={contentError} />
                          </div>
                        </div>

                        <fieldset aria-describedby={id('days-hint')}>
                          <legend className="text-sm font-medium">{t('schedules.days')}</legend>
                          <p
                            id={id('days-hint')}
                            className="mb-1 text-sm text-gray-700 dark:text-gray-300"
                          >
                            {t('schedules.daysHint')}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {dayLabels.map((dayLabel, day) => (
                              <label
                                key={day}
                                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 has-checked:border-brand-600 has-checked:bg-brand-50 has-focus-visible:outline-2 has-focus-visible:outline-brand-700 dark:border-gray-600 dark:has-checked:bg-brand-950"
                              >
                                <input
                                  type="checkbox"
                                  checked={entry.daysOfWeek.includes(day)}
                                  onChange={(event) => {
                                    updateEntry(index, {
                                      daysOfWeek: event.target.checked
                                        ? [...entry.daysOfWeek, day].sort((a, b) => a - b)
                                        : entry.daysOfWeek.filter((d) => d !== day),
                                    });
                                  }}
                                  className="size-4"
                                />
                                {dayLabel}
                              </label>
                            ))}
                          </div>
                        </fieldset>

                        <div className="flex flex-wrap items-end gap-4">
                          <label className="inline-flex min-h-11 items-center gap-2 font-medium">
                            <input
                              type="checkbox"
                              checked={allDay}
                              onChange={(event) => {
                                updateEntry(
                                  index,
                                  event.target.checked
                                    ? { timeFrom: null, timeTo: null }
                                    : { timeFrom: '08:00', timeTo: '12:00' },
                                );
                              }}
                              className="size-4"
                            />
                            {t('schedules.allDay')}
                          </label>
                          {!allDay && (
                            <>
                              <div className="flex flex-col gap-1">
                                <label htmlFor={id('from')} className="text-sm font-medium">
                                  {t('schedules.timeFrom')}
                                </label>
                                <input
                                  id={id('from')}
                                  type="time"
                                  dir="ltr"
                                  required
                                  value={entry.timeFrom ?? ''}
                                  aria-describedby={id('time-hint')}
                                  onChange={(event) => {
                                    updateEntry(index, { timeFrom: event.target.value || null });
                                  }}
                                  className={small}
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label htmlFor={id('to')} className="text-sm font-medium">
                                  {t('schedules.timeTo')}
                                </label>
                                <input
                                  id={id('to')}
                                  type="time"
                                  dir="ltr"
                                  required
                                  value={entry.timeTo ?? ''}
                                  aria-invalid={fieldError(`${prefix}.timeTo`) ? true : undefined}
                                  aria-describedby={`${id('time-hint')}${fieldError(`${prefix}.timeTo`) ? ` ${id('to-error')}` : ''}`}
                                  onChange={(event) => {
                                    updateEntry(index, { timeTo: event.target.value || null });
                                  }}
                                  className={small}
                                />
                              </div>
                              <p
                                id={id('time-hint')}
                                className="basis-full text-sm text-gray-700 dark:text-gray-300"
                              >
                                {t('schedules.timeHint')}
                              </p>
                              <FieldError
                                id={id('to-error')}
                                message={fieldError(`${prefix}.timeTo`)}
                              />
                            </>
                          )}
                        </div>

                        <div className="flex flex-wrap items-start gap-4">
                          <div className="flex flex-col gap-1">
                            <label htmlFor={id('date-from')} className="text-sm font-medium">
                              {t('schedules.dateFrom')}
                            </label>
                            <input
                              id={id('date-from')}
                              type="date"
                              dir="ltr"
                              value={entry.dateFrom ?? ''}
                              onChange={(event) => {
                                updateEntry(index, { dateFrom: event.target.value || null });
                              }}
                              className={small}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label htmlFor={id('date-to')} className="text-sm font-medium">
                              {t('schedules.dateTo')}
                            </label>
                            <input
                              id={id('date-to')}
                              type="date"
                              dir="ltr"
                              value={entry.dateTo ?? ''}
                              aria-invalid={fieldError(`${prefix}.dateTo`) ? true : undefined}
                              aria-describedby={
                                fieldError(`${prefix}.dateTo`) ? id('date-error') : undefined
                              }
                              onChange={(event) => {
                                updateEntry(index, { dateTo: event.target.value || null });
                              }}
                              className={small}
                            />
                            <FieldError
                              id={id('date-error')}
                              message={fieldError(`${prefix}.dateTo`)}
                            />
                          </div>
                        </div>

                        <SacredField
                          id={id('sacred')}
                          orgId={orgId}
                          value={entry.sacred}
                          available={sacredAvailable}
                          error={fieldError(`${prefix}.sacred`)}
                          onChange={(sacred) => {
                            updateEntry(index, { sacred });
                          }}
                        />

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-3 dark:border-gray-800">
                          <label className="inline-flex min-h-11 items-center gap-2 font-medium">
                            <input
                              type="checkbox"
                              checked={entry.enabled}
                              onChange={(event) => {
                                updateEntry(index, { enabled: event.target.checked });
                              }}
                              className="size-4"
                            />
                            {t('schedules.enabled')}
                          </label>
                          {canEdit && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="secondary"
                                disabled={index === 0}
                                aria-label={t('schedules.moveUp', { name: label })}
                                onClick={() => {
                                  move(index, -1);
                                }}
                              >
                                <ArrowUp aria-hidden="true" className="size-4" />
                              </Button>
                              <Button
                                variant="secondary"
                                disabled={index === draft.entries.length - 1}
                                aria-label={t('schedules.moveDown', { name: label })}
                                onClick={() => {
                                  move(index, 1);
                                }}
                              >
                                <ArrowDown aria-hidden="true" className="size-4" />
                              </Button>
                              <Button
                                variant="secondary"
                                aria-label={t('schedules.removeEntry', { name: label })}
                                onClick={() => {
                                  update({ entries: draft.entries.filter((_, i) => i !== index) });
                                }}
                              >
                                <Trash2 aria-hidden="true" className="size-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </fieldset>
                    </li>
                  );
                })}
              </ol>
              {canEdit && draft.entries.length < SCHEDULE_LIMITS.maxEntries && (
                <div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const first = layoutOptions[0];
                      const firstPlaylist = playlistOptions[0];
                      update({
                        entries: [
                          ...draft.entries,
                          {
                            key: newKey(),
                            name: t('schedules.newEntry', { index: draft.entries.length + 1 }),
                            layoutId: first?.id ?? null,
                            playlistId: first ? null : (firstPlaylist?.id ?? null),
                            dateFrom: null,
                            dateTo: null,
                            daysOfWeek: [],
                            timeFrom: '08:00',
                            timeTo: '12:00',
                            sacred: null,
                            enabled: true,
                          },
                        ],
                      });
                    }}
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    {t('schedules.addEntry')}
                  </Button>
                </div>
              )}
            </section>
          </fieldset>

          {canEdit && (
            <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-gray-200 bg-white/95 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
              <Button type="submit" loading={save.isPending} disabled={!dirty}>
                {t('schedules.save')}
              </Button>
              <span role="status">
                {dirty ? t('schedules.unsaved') : save.isSuccess ? t('schedules.saved') : ''}
              </span>
            </div>
          )}
        </form>

        <ScheduleTimeline
          orgId={orgId}
          rules={draft.entries}
          names={draft.entries.map((entry) => entry.name)}
          timeZone={timeZone}
        />
      </div>

      {canEdit && (
        <div className="mt-10 flex flex-col gap-3">
          {loadErrors.form && <Alert variant={loadErrors.variant}>{loadErrors.form}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={duplicate.isPending}
              onClick={() => {
                duplicate.mutate(schedule.name);
              }}
            >
              {t('schedules.duplicate')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDeleting(true);
              }}
            >
              {t('schedules.delete')}
            </Button>
          </div>
          <ConfirmDialog
            open={deleting}
            message={t('schedules.deleteConfirm', { name: schedule.name })}
            confirmLabel={t('common.delete')}
            loading={remove.isPending}
            onCancel={() => {
              setDeleting(false);
            }}
            onConfirm={() => {
              remove.mutate();
            }}
          />
        </div>
      )}
    </>
  );
}
