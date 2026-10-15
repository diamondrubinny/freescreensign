import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { hasRole } from '@rubinny/shared';
import { del, get, patch, post } from '../api/client';
import { useSession } from '../api/session';
import type { LayoutSummary, Orientation, PlaylistSummary, ScreenItem } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { StatusPill } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { useFormErrors } from '../lib/use-form-errors';

const ORIENTATIONS: Orientation[] = [
  'landscape',
  'portrait',
  'landscape-flipped',
  'portrait-flipped',
];

function ContentSelect({
  id,
  name,
  label,
  emptyLabel,
  hint,
  options,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  emptyLabel: string;
  hint?: string;
  options: { id: string; name: string }[];
  defaultValue: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-gray-700 dark:text-gray-300">
          {hint}
        </p>
      )}
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ''}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="rounded-md border border-gray-500 bg-white px-3 py-2 dark:bg-gray-900"
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ScreensPage() {
  const { t, i18n } = useTranslation();
  const { orgId = '' } = useParams();
  const session = useSession().data;
  const queryClient = useQueryClient();
  const role = session?.memberships.find((m) => m.orgId === orgId)?.role;
  const canEdit = role ? hasRole(role, 'EDITOR') : false;
  const canRemove = role ? hasRole(role, 'ADMIN') : false;

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
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['screens', orgId] });

  const add = useMutation({
    mutationFn: (body: { code: string; name: string; playlistId: string | null }) =>
      post(`/api/v1/orgs/${orgId}/screens`, body),
    onSuccess: refresh,
  });
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
      orientation: Orientation;
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
            <ContentSelect
              id="add-screen-playlist"
              name="playlistId"
              label={t('screens.playlist')}
              emptyLabel={t('screens.noPlaylist')}
              options={playlists.data?.playlists ?? []}
              defaultValue={null}
            />
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
        <div className="table-wrap">
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
              {screens.data.screens.map((screen) => (
                <tr key={screen.id}>
                  <th scope="row" className="text-start font-semibold" dir="auto">
                    {screen.name}
                  </th>
                  <td>
                    <StatusPill tone={screen.online ? 'green' : 'gray'}>
                      {screen.online ? t('screens.online') : t('screens.offline')}
                    </StatusPill>
                    {!screen.online && (
                      <span className="block text-sm text-gray-700 dark:text-gray-300">
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
                  </td>
                  <td dir="ltr">{screen.resolution ?? '—'}</td>
                  {canEdit && (
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
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
          {reload.isSuccess && (
            <div className="mt-3">
              <Alert variant="success">{t('screens.reloadSent')}</Alert>
            </div>
          )}
        </div>
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
                orientation: value(data, 'orientation') as Orientation,
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
