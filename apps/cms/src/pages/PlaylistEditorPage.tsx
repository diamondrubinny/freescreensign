import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { hasRole } from '@rubinny/shared';
import { del, get, patch, put } from '../api/client';
import { useSession } from '../api/session';
import type { MediaItem, PlaylistDetail, PlaylistEntry } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { formatDuration } from '../lib/format-bytes';
import { useFormErrors } from '../lib/use-form-errors';

const DEFAULT_IMAGE_MS = 10_000;

export function PlaylistEditorPage() {
  const { t } = useTranslation();
  const { orgId = '', playlistId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useSession().data;
  const role = session?.memberships.find((m) => m.orgId === orgId)?.role;
  const canEdit = role ? hasRole(role, 'EDITOR') : false;

  const detail = useQuery({
    queryKey: ['playlist', orgId, playlistId],
    queryFn: () =>
      get<{ playlist: PlaylistDetail }>(`/api/v1/orgs/${orgId}/playlists/${playlistId}`),
  });
  const library = useQuery({
    queryKey: ['media', orgId, 'ready-picker'],
    queryFn: () => get<{ media: MediaItem[] }>(`/api/v1/orgs/${orgId}/media`),
    enabled: canEdit,
  });

  // Local, editable copy of the items (null = show the server version); saved in one atomic PUT.
  const [items, setItems] = useState<PlaylistEntry[] | null>(null);
  const dirty = items !== null;

  const edit = (next: PlaylistEntry[]) => {
    setItems(next);
  };
  const move = (index: number, delta: number) => {
    const list = items ?? detail.data?.playlist.items;
    if (!list) return;
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    edit(next);
  };

  const save = useMutation({
    mutationFn: (list: PlaylistEntry[]) =>
      put<{ playlist: PlaylistDetail }>(`/api/v1/orgs/${orgId}/playlists/${playlistId}/items`, {
        items: list.map((item) => ({ mediaId: item.mediaId, durationMs: item.durationMs })),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['playlist', orgId, playlistId], data);
      setItems(null);
      void queryClient.invalidateQueries({ queryKey: ['playlists', orgId] });
    },
  });
  const rename = useMutation({
    mutationFn: (name: string) =>
      patch<{ playlist: PlaylistDetail }>(`/api/v1/orgs/${orgId}/playlists/${playlistId}`, {
        name,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['playlist', orgId, playlistId], data);
    },
  });
  const [deleting, setDeleting] = useState(false);
  const remove = useMutation({
    mutationFn: () => del(`/api/v1/orgs/${orgId}/playlists/${playlistId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['playlists', orgId] });
      void navigate(`/orgs/${orgId}/playlists`);
    },
  });

  const saveErrors = useFormErrors(save.error);
  const renameErrors = useFormErrors(rename.error);
  const loadErrors = useFormErrors(detail.error ?? remove.error);

  if (detail.isPending) return <Loading />;
  if (!detail.data)
    return <Alert variant="error">{loadErrors.form ?? t('errors.NOT_FOUND')}</Alert>;
  const playlist = detail.data.playlist;
  const current = items ?? playlist.items;
  const total = current.reduce(
    (sum, item) => sum + (item.durationMs ?? item.effectiveDurationMs),
    0,
  );
  const readyMedia = (library.data?.media ?? []).filter((m) => m.status === 'ready');

  return (
    <>
      <PageHeading title={`${t('playlists.editorTitle')}: ${playlist.name}`} />

      {canEdit && (
        <Form
          errors={renameErrors}
          className="mb-8 max-w-lg"
          onSubmit={(data) => {
            rename.mutate(value(data, 'name'));
          }}
        >
          <Field
            label={t('playlists.name')}
            name="name"
            required
            defaultValue={playlist.name}
            error={renameErrors.fields.name}
          />
          <Button type="submit" variant="secondary" loading={rename.isPending}>
            {t('common.save')}
          </Button>
        </Form>
      )}

      {playlist.screens.length > 0 && (
        <p className="mb-6">
          {t('playlists.screens')}: {playlist.screens.map((s) => s.name).join(', ')}
        </p>
      )}

      <section aria-labelledby="content-heading" className="mb-8">
        <h2 id="content-heading" className="mb-1 text-xl font-semibold">
          {t('playlists.content')}
        </h2>
        <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
          {t('playlists.totalDuration', { duration: formatDuration(total) })}
        </p>
        {saveErrors.form && <Alert variant="error">{saveErrors.form}</Alert>}
        {current.length === 0 ? (
          <p>{t('playlists.noItems')}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {current.map((item, index) => (
              <li
                key={`${item.mediaId}-${String(index)}`}
                className="flex flex-wrap items-center gap-3 rounded-md border border-gray-300 p-2 dark:border-gray-700"
              >
                <span className="w-8 text-center font-semibold" aria-hidden="true">
                  {index + 1}
                </span>
                {item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" className="h-12 w-20 rounded object-cover" />
                ) : (
                  <span className="h-12 w-20" />
                )}
                <span className="min-w-32 flex-1 font-medium" dir="auto">
                  {item.name}
                </span>
                {canEdit ? (
                  <>
                    <div className="flex flex-col">
                      <label htmlFor={`duration-${String(index)}`} className="sr-only">
                        {t('playlists.durationSeconds', { name: item.name })}
                      </label>
                      <input
                        id={`duration-${String(index)}`}
                        type="number"
                        min={1}
                        max={86400}
                        step={1}
                        inputMode="numeric"
                        placeholder={String(
                          Math.round(
                            (item.kind === 'image' ? DEFAULT_IMAGE_MS : item.effectiveDurationMs) /
                              1000,
                          ),
                        )}
                        value={item.durationMs === null ? '' : Math.round(item.durationMs / 1000)}
                        onChange={(event) => {
                          const seconds = Number(event.target.value);
                          const next = [...current];
                          next[index] = {
                            ...item,
                            durationMs:
                              event.target.value === '' || !Number.isFinite(seconds)
                                ? null
                                : Math.max(1, Math.round(seconds)) * 1000,
                          };
                          edit(next);
                        }}
                        className="w-24 rounded-md border border-gray-500 bg-white px-2 py-1 dark:bg-gray-900"
                      />
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="secondary"
                        disabled={index === 0}
                        aria-label={t('playlists.moveUp', { name: item.name })}
                        onClick={() => {
                          move(index, -1);
                        }}
                      >
                        <span aria-hidden="true">↑</span>
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={index === current.length - 1}
                        aria-label={t('playlists.moveDown', { name: item.name })}
                        onClick={() => {
                          move(index, 1);
                        }}
                      >
                        <span aria-hidden="true">↓</span>
                      </Button>
                      <Button
                        variant="secondary"
                        aria-label={t('playlists.removeItem', { name: item.name })}
                        onClick={() => {
                          edit(current.filter((_, i) => i !== index));
                        }}
                      >
                        <span aria-hidden="true">✕</span>
                      </Button>
                    </div>
                  </>
                ) : (
                  <span>{formatDuration(item.effectiveDurationMs)}</span>
                )}
              </li>
            ))}
          </ol>
        )}
        {canEdit && (
          <>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              {t('playlists.durationHint')}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                loading={save.isPending}
                disabled={!dirty}
                onClick={() => {
                  save.mutate(current);
                }}
              >
                {t('playlists.save')}
              </Button>
              {dirty && <span role="status">{t('playlists.unsaved')}</span>}
              {save.isSuccess && !dirty && <Alert variant="success">{t('playlists.saved')}</Alert>}
            </div>
          </>
        )}
      </section>

      {canEdit && (
        <section aria-labelledby="library-picker-heading" className="mb-8">
          <h2 id="library-picker-heading" className="mb-3 text-xl font-semibold">
            {t('playlists.addFromLibrary')}
          </h2>
          {library.isSuccess && readyMedia.length === 0 && <p>{t('playlists.noReadyMedia')}</p>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {readyMedia.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-2 rounded-md border border-gray-300 p-2 dark:border-gray-700"
              >
                {m.thumbnailUrl && (
                  <img
                    src={m.thumbnailUrl}
                    alt=""
                    className="aspect-video w-full rounded object-cover"
                  />
                )}
                <span className="text-sm font-medium break-words" dir="auto">
                  {m.name}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => {
                    edit([
                      ...current,
                      {
                        mediaId: m.id,
                        name: m.name,
                        kind: m.kind,
                        status: m.status,
                        durationMs: null,
                        effectiveDurationMs:
                          m.kind === 'video' && m.durationMs ? m.durationMs : DEFAULT_IMAGE_MS,
                        thumbnailUrl: m.thumbnailUrl ?? null,
                      },
                    ]);
                  }}
                >
                  {t('playlists.add')}
                  <span className="sr-only"> {m.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canEdit && (
        <>
          <Button
            variant="danger"
            onClick={() => {
              setDeleting(true);
            }}
          >
            {t('playlists.deletePlaylist')}
          </Button>
          <ConfirmDialog
            open={deleting}
            message={t('playlists.deleteConfirm', { name: playlist.name })}
            confirmLabel={t('common.delete')}
            loading={remove.isPending}
            onCancel={() => {
              setDeleting(false);
            }}
            onConfirm={() => {
              remove.mutate();
            }}
          />
        </>
      )}
    </>
  );
}
