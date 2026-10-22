// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { CLOCK_WARNING_MS, WALL_LIMITS, hasRole, timeZoneOptions } from '@rubinny/shared';
import { del, get, patch, post } from '../api/client';
import { useSession } from '../api/session';
import type {
  LayoutSummary,
  Orientation,
  PlaylistSummary,
  ScheduleSummary,
  ScreenGroup,
  ScreenItem,
  ScreenWall,
} from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { StatusPill, linkClass } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { useFormErrors } from '../lib/use-form-errors';
import { TableRegion } from '../components/TableRegion';
import { ContentSelect } from './screens/ContentSelect';
import { ScreenGroupsSection } from './screens/ScreenGroupsSection';

const ORIENTATIONS: Orientation[] = [
  'landscape',
  'portrait',
  'landscape-flipped',
  'portrait-flipped',
];

/** The wall fields of the edit form; cells are 1-based for people, 0-based in the API. */
function readWall(data: FormData): ScreenWall | null {
  if (data.get('wallEnabled') !== 'on') return null;
  const number = (name: string) => Number(value(data, name));
  return {
    columns: number('wallColumns'),
    rows: number('wallRows'),
    column: number('wallColumn') - 1,
    row: number('wallRow') - 1,
    bezelX: number('wallBezelX'),
    bezelY: number('wallBezelY'),
  };
}

function WallFields({
  wall,
  errors,
}: {
  wall: ScreenWall | null;
  errors: Record<string, string | undefined>;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(wall !== null);
  const numberProps = { type: 'number', inputMode: 'numeric', step: 1, dir: 'ltr' } as const;
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-gray-300 p-3 dark:border-gray-700">
      <legend className="px-1 font-medium">{t('screens.wall.title')}</legend>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="wallEnabled"
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
          }}
          className="size-4"
        />
        {t('screens.wall.enabled')}
      </label>
      {enabled && (
        <>
          <p className="text-sm text-gray-700 dark:text-gray-300">{t('screens.wall.hint')}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field
              {...numberProps}
              label={t('screens.wall.columns')}
              name="wallColumns"
              min={1}
              max={WALL_LIMITS.maxColumns}
              required
              defaultValue={wall?.columns ?? 2}
              error={errors['wall.columns']}
            />
            <Field
              {...numberProps}
              label={t('screens.wall.rows')}
              name="wallRows"
              min={1}
              max={WALL_LIMITS.maxRows}
              required
              defaultValue={wall?.rows ?? 1}
              error={errors['wall.rows']}
            />
            <Field
              {...numberProps}
              label={t('screens.wall.column')}
              name="wallColumn"
              min={1}
              max={WALL_LIMITS.maxColumns}
              required
              defaultValue={(wall?.column ?? 0) + 1}
              error={errors['wall.column']}
            />
            <Field
              {...numberProps}
              label={t('screens.wall.row')}
              name="wallRow"
              min={1}
              max={WALL_LIMITS.maxRows}
              required
              defaultValue={(wall?.row ?? 0) + 1}
              error={errors['wall.row']}
            />
            <Field
              {...numberProps}
              label={t('screens.wall.bezelX')}
              name="wallBezelX"
              min={0}
              max={WALL_LIMITS.maxBezelPx}
              defaultValue={wall?.bezelX ?? 0}
              error={errors['wall.bezelX']}
            />
            <Field
              {...numberProps}
              label={t('screens.wall.bezelY')}
              name="wallBezelY"
              min={0}
              max={WALL_LIMITS.maxBezelPx}
              defaultValue={wall?.bezelY ?? 0}
              error={errors['wall.bezelY']}
            />
          </div>
        </>
      )}
    </fieldset>
  );
}

export function ScreensPage() {
  const { t, i18n } = useTranslation();
  const { orgId = '' } = useParams();
  const session = useSession().data;
  const queryClient = useQueryClient();
  const membership = session?.memberships.find((m) => m.orgId === orgId);
  const role = membership?.role;
  const canEdit = role ? hasRole(role, 'EDITOR') : false;
  const canRemove = role ? hasRole(role, 'ADMIN') : false;
  // Content shown on screens waits for approval: editors pair screens empty.
  const contentHeld = Boolean(membership?.requireApproval) && !canRemove;

  const screens = useQuery({
    queryKey: ['screens', orgId],
    queryFn: () => get<{ screens: ScreenItem[] }>(`/api/v1/orgs/${orgId}/screens`),
    refetchInterval: 15_000, // keep online status fresh
  });
  const playlists = useQuery({
    queryKey: ['playlists', orgId],
    queryFn: () => get<{ playlists: PlaylistSummary[] }>(`/api/v1/orgs/${orgId}/playlists`),
  });
  const layouts = useQuery({
    queryKey: ['layouts', orgId],
    queryFn: () => get<{ layouts: LayoutSummary[] }>(`/api/v1/orgs/${orgId}/layouts`),
  });
  const schedules = useQuery({
    queryKey: ['schedules', orgId],
    queryFn: () => get<{ schedules: ScheduleSummary[] }>(`/api/v1/orgs/${orgId}/schedules`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['screens', orgId] });

  const add = useMutation({
    mutationFn: (body: { code: string; name: string; playlistId: string | null }) =>
      post(`/api/v1/orgs/${orgId}/screens`, body),
    onSuccess: refresh,
  });
  const groups = useQuery({
    queryKey: ['screen-groups', orgId],
    queryFn: () => get<{ groups: ScreenGroup[] }>(`/api/v1/orgs/${orgId}/screen-groups`),
  });
  const [groupFilter, setGroupFilter] = useState('');
  const shown = (screens.data?.screens ?? []).filter(
    (screen) => !groupFilter || (screen.groupIds ?? []).includes(groupFilter),
  );
  const [editing, setEditing] = useState<ScreenItem | null>(null);
  const update = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name: string;
      playlistId: string | null;
      layoutId: string | null;
      scheduleId: string | null;
      orientation: Orientation;
      timezone: string;
      wall: ScreenWall | null;
    }) => patch(`/api/v1/orgs/${orgId}/screens/${id}`, body),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const reload = useMutation({
    mutationFn: (id: string) => post(`/api/v1/orgs/${orgId}/screens/${id}/reload`),
  });
  const [removing, setRemoving] = useState<ScreenItem | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/v1/orgs/${orgId}/screens/${id}`),
    onSuccess: async () => {
      setRemoving(null);
      await refresh();
    },
  });

  const addErrors = useFormErrors(add.error);
  const editErrors = useFormErrors(update.error);
  const listErrors = useFormErrors(screens.error ?? reload.error ?? remove.error);
  const playerUrl = `${window.location.origin}/player/`;

  return (
    <>
      <PageHeading title={t('screens.title')} />
      {listErrors.form && <Alert variant="error">{listErrors.form}</Alert>}

      {canEdit && (
        <section aria-labelledby="add-screen-heading" className="mb-8 max-w-lg">
          <h2 id="add-screen-heading" className="mb-2 text-xl font-semibold">
            {t('screens.add')}
          </h2>
          <p className="mb-1">{t('screens.addIntro')}</p>
          <p className="mb-4 text-sm">
            {t('screens.playerLink')}:{' '}
            <code dir="ltr" className="break-all">
              {playerUrl}
            </code>
          </p>
          <Form
            errors={addErrors}
            labelledBy="add-screen-heading"
            onSubmit={(data) => {
              add.mutate({
                code: value(data, 'code'),
                name: value(data, 'name'),
                playlistId: value(data, 'playlistId') || null,
              });
            }}
          >
            <Field
              label={t('screens.code')}
              name="code"
              required
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={8}
              dir="ltr"
              hint={t('screens.codeHint')}
              error={addErrors.fields.code}
            />
            <Field label={t('fields.name')} name="name" required error={addErrors.fields.name} />
            {contentHeld ? (
              <p className="text-sm">{t('screens.pairEmptyForApproval')}</p>
            ) : (
              <ContentSelect
                id="add-screen-playlist"
                name="playlistId"
                label={t('screens.playlist')}
                emptyLabel={t('screens.noPlaylist')}
                options={playlists.data?.playlists ?? []}
                defaultValue={null}
              />
            )}
            <Button type="submit" loading={add.isPending}>
              {t('screens.add')}
            </Button>
            {add.isSuccess && <Alert variant="success">{t('screens.paired')}</Alert>}
          </Form>
        </section>
      )}

      {screens.isPending && <Loading />}
      {screens.data?.screens.length === 0 && <p>{t('screens.empty')}</p>}
      {screens.data && screens.data.screens.length > 0 && (
        <>
          {(groups.data?.groups.length ?? 0) > 0 && (
            <div className="mb-3 flex flex-col gap-1">
              <label htmlFor="screens-group-filter" className="font-medium">
                {t('screenGroups.filter')}
              </label>
              <select
                id="screens-group-filter"
                value={groupFilter}
                onChange={(event) => {
                  setGroupFilter(event.target.value);
                }}
                className="max-w-xs rounded-md border border-gray-500 bg-white px-3 py-2 dark:bg-gray-900"
              >
                <option value="">{t('screenGroups.allScreens')}</option>
                {groups.data?.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <TableRegion label={t('screens.title')}>
            <table className="data-table">
              <caption className="sr-only">{t('screens.title')}</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-start">
                    {t('fields.name')}
                  </th>
                  <th scope="col" className="text-start">
                    {t('screens.status')}
                  </th>
                  <th scope="col" className="text-start">
                    {t('screens.content')}
                  </th>
                  <th scope="col" className="text-start">
                    {t('screens.resolution')}
                  </th>
                  {canEdit && (
                    <th scope="col" className="text-start">
                      {t('members.actions')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {shown.map((screen) => (
                  <tr key={screen.id}>
                    <th scope="row" className="text-start font-semibold" dir="auto">
                      <Link to={`/orgs/${orgId}/screens/${screen.id}`} className={linkClass}>
                        {screen.name}
                      </Link>
                      {screen.clockOffsetMs !== null &&
                        Math.abs(screen.clockOffsetMs) > CLOCK_WARNING_MS && (
                          <span className="mt-1 block">
                            <StatusPill tone="amber">{t('screens.clockWarning')}</StatusPill>
                          </span>
                        )}
                    </th>
                    <td>
                      <StatusPill tone={screen.online ? 'green' : 'gray'}>
                        {screen.online ? t('screens.online') : t('screens.offline')}
                      </StatusPill>
                      {!screen.online && (
                        <span className="mt-1 block text-sm whitespace-nowrap text-gray-700 dark:text-gray-300">
                          {screen.lastSeenAt
                            ? t('screens.lastSeen', {
                                when: formatDateTime(screen.lastSeenAt, i18n.language),
                              })
                            : t('screens.neverSeen')}
                        </span>
                      )}
                    </td>
                    <td dir="auto">
                      {screen.layoutName
                        ? t('screens.layoutContent', { name: screen.layoutName })
                        : (screen.playlistName ?? t('screens.noPlaylist'))}
                      {screen.scheduleName && (
                        <span className="block text-sm text-gray-700 dark:text-gray-300">
                          {t('screens.scheduleContent', { name: screen.scheduleName })}
                        </span>
                      )}
                      {screen.wall && (
                        <span className="block text-sm text-gray-700 dark:text-gray-300">
                          {t('screens.wall.badge', {
                            column: screen.wall.column + 1,
                            row: screen.wall.row + 1,
                            columns: screen.wall.columns,
                            rows: screen.wall.rows,
                          })}
                        </span>
                      )}
                    </td>
                    <td dir="ltr">{screen.resolution ?? '—'}</td>
                    {canEdit && (
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              update.reset();
                              setEditing(screen);
                            }}
                          >
                            {t('screens.edit')}
                            <span className="sr-only">{` ${screen.name}`}</span>
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={reload.isPending && reload.variables === screen.id}
                            onClick={() => {
                              reload.mutate(screen.id);
                            }}
                          >
                            {t('screens.reload')}
                            <span className="sr-only">{` ${screen.name}`}</span>
                          </Button>
                          {canRemove && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setRemoving(screen);
                              }}
                            >
                              {t('screens.remove')}
                              <span className="sr-only">{` ${screen.name}`}</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
          {reload.isSuccess && (
            <div className="mt-3">
              <Alert variant="success">{t('screens.reloadSent')}</Alert>
            </div>
          )}
        </>
      )}

      {screens.data && (
        <ScreenGroupsSection
          orgId={orgId}
          screens={screens.data.screens}
          canEdit={canEdit}
          playlists={playlists.data?.playlists ?? []}
          layouts={layouts.data?.layouts ?? []}
          schedules={schedules.data?.schedules ?? []}
          onContentChanged={refresh}
        />
      )}

      <Dialog
        open={editing !== null}
        onClose={() => {
          setEditing(null);
        }}
        title={t('screens.editTitle')}
        footer={<></>}
      >
        {editing && (
          <Form
            errors={editErrors}
            onSubmit={(data) => {
              update.mutate({
                id: editing.id,
                name: value(data, 'name'),
                playlistId: value(data, 'playlistId') || null,
                layoutId: value(data, 'layoutId') || null,
                scheduleId: value(data, 'scheduleId') || null,
                orientation: value(data, 'orientation') as Orientation,
                timezone: value(data, 'timezone'),
                wall: readWall(data),
              });
            }}
          >
            <Field
              label={t('fields.name')}
              name="name"
              required
              defaultValue={editing.name}
              error={editErrors.fields.name}
            />
            <ContentSelect
              id="edit-screen-layout"
              name="layoutId"
              label={t('screens.layout')}
              emptyLabel={t('screens.noLayout')}
              hint={t('screens.layoutHint')}
              options={layouts.data?.layouts ?? []}
              defaultValue={editing.layoutId}
            />
            <ContentSelect
              id="edit-screen-playlist"
              name="playlistId"
              label={t('screens.playlist')}
              emptyLabel={t('screens.noPlaylist')}
              options={playlists.data?.playlists ?? []}
              defaultValue={editing.playlistId}
            />
            <ContentSelect
              id="edit-screen-schedule"
              name="scheduleId"
              label={t('screens.schedule')}
              emptyLabel={t('screens.noSchedule')}
              hint={t('screens.scheduleHint')}
              options={schedules.data?.schedules ?? []}
              defaultValue={editing.scheduleId}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-screen-orientation" className="font-medium">
                {t('screens.orientation')}
              </label>
              <select
                id="edit-screen-orientation"
                name="orientation"
                defaultValue={editing.orientation}
                className="rounded-md border border-gray-500 bg-white px-3 py-2 dark:bg-gray-900"
              >
                {ORIENTATIONS.map((o) => (
                  <option key={o} value={o}>
                    {t(`screens.orientations.${o}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-screen-timezone" className="font-medium">
                {t('screens.timezone')}
              </label>
              <select
                id="edit-screen-timezone"
                name="timezone"
                dir="ltr"
                defaultValue={editing.timezone}
                aria-describedby={`edit-screen-timezone-hint${editErrors.fields.timezone ? ' edit-screen-timezone-error' : ''}`}
                aria-invalid={editErrors.fields.timezone ? true : undefined}
                className="rounded-md border border-gray-500 bg-white px-3 py-2 dark:bg-gray-900"
              >
                {[...new Set([editing.timezone, ...timeZoneOptions()])].map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
              <p
                id="edit-screen-timezone-hint"
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                {t('screens.timezoneHint')}
              </p>
              {editErrors.fields.timezone && (
                <p
                  id="edit-screen-timezone-error"
                  className="text-sm font-medium text-red-800 dark:text-red-300"
                >
                  {editErrors.fields.timezone}
                </p>
              )}
            </div>
            <WallFields wall={editing.wall} errors={editErrors.fields} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={update.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </Form>
        )}
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        message={t('screens.removeConfirm', { name: removing?.name ?? '' })}
        confirmLabel={t('screens.remove')}
        loading={remove.isPending}
        onCancel={() => {
          setRemoving(null);
        }}
        onConfirm={() => {
          if (removing) remove.mutate(removing.id);
        }}
      />
    </>
  );
}
