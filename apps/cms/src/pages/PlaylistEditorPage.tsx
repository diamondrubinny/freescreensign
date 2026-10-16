import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { hasRole } from '@rubinny/shared';
import { del, get, patch, put } from '../api/client';
import { useSession } from '../api/session';
import type { MediaItem, PlaylistDetail, PlaylistEntry, WidgetItem } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { formatDuration } from '../lib/format-bytes';
import { useDuplicate } from '../lib/use-duplicate';
import { useFormErrors } from '../lib/use-form-errors';

const DEFAULT_IMAGE_MS = 10_000;
const DEFAULT_WIDGET_MS = 15_000;

/** Mirrors the server default: RSS widgets play one full rotation of their items. */
function widgetDefaultMs(widget: WidgetItem): number {
  if (widget.type === 'rss') {
    const { maxItems, itemDurationMs } = widget.config;
    if (typeof maxItems === 'number' && typeof itemDurationMs === 'number') {
      return maxItems * itemDurationMs;
    }
  }
  return DEFAULT_WIDGET_MS;
}

const itemId = (item: PlaylistEntry) => (item.kind === 'media' ? item.mediaId : item.widgetId);

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
  const widgets = useQuery({
    queryKey: ['widgets', orgId],
    queryFn: () => get<{ widgets: WidgetItem[] }>(`/api/v1/orgs/${orgId}/widgets`),
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
        items: list.map((item) =>
          item.kind === 'media'
            ? { mediaId: item.mediaId, durationMs: item.durationMs, fit: item.fit }
            : { widgetId: item.widgetId, durationMs: item.durationMs },
        ),
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

  const duplicate = useDuplicate(orgId, 'playlists', playlistId);
  const saveErrors = useFormErrors(save.error);
  const renameErrors = useFormErrors(rename.error);
  const loadErrors = useFormErrors(detail.error ?? remove.error ?? duplicate.error);

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
        {saveErrors.form && <Alert variant={saveErrors.variant}>{saveErrors.form}</Alert>}
        {current.length === 0 ? (
          <p>{t('playlists.noItems')}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {current.map((item, index) => (
              <li
                key={`${itemId(item)}-${String(index)}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white shadow-sm p-2 dark:border-gray-800 dark:bg-gray-900"
              >
                <span className="w-8 text-center font-semibold" aria-hidden="true">
                  {index + 1}
                </span>
                {item.kind === 'media' && item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" className="h-12 w-20 rounded object-cover" />
                ) : item.kind === 'widget' ? (
                  <span className="flex h-12 w-20 items-center justify-center rounded bg-brand-100 px-1 text-center text-xs font-semibold text-brand-900 dark:bg-brand-950 dark:text-brand-100">
                    {t(`widgets.types.${item.widgetType}`, { defaultValue: item.widgetType })}
                  </span>
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
                            (item.kind === 'media' && item.mediaKind === 'image'
                              ? DEFAULT_IMAGE_MS
                              : item.effectiveDurationMs) / 1000,
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
                    {item.kind === 'media' && (
                      <div className="flex flex-col">
                        <label htmlFor={`fit-${String(index)}`} className="sr-only">
                          {t('playlists.fitLabel', { name: item.name })}
                        </label>
                        <select
                          id={`fit-${String(index)}`}
                          value={item.fit}
                          aria-describedby="fit-hint"
                          onChange={(event) => {
                            const next = [...current];
                            next[index] = { ...item, fit: event.target.value as typeof item.fit };
                            edit(next);
                          }}
                          className="rounded-lg border border-gray-400 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-900"
                        >
                          {(['contain', 'cover', 'blur'] as const).map((fit) => (
                            <option key={fit} value={fit}>
                              {t(`playlists.fits.${fit}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
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
            <p id="fit-hint" className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              {t('playlists.fitHint')}
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
                className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white shadow-sm p-2 dark:border-gray-800 dark:bg-gray-900"
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
                        kind: 'media',
                        mediaId: m.id,
                        name: m.name,
                        mediaKind: m.kind,
                        status: m.status,
                        fit: 'contain',
                        durationMs: null,
                        effectiveDurationMs:
                          m.kind === 'video' && m.durationMs ? m.durationMs : DEFAULT_IMAGE_MS,
                        thumbnailUrl: m.thumbnailUrl ?? null,
                      },
                    ]);
                  }}
                >
                  {t('playlists.add')}
                  <span className="sr-only">{` ${m.name}`}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canEdit && (
        <section aria-labelledby="widget-picker-heading" className="mb-8">
          <h2 id="widget-picker-heading" className="mb-3 text-xl font-semibold">
            {t('playlists.addWidget')}
          </h2>
          {widgets.isSuccess && widgets.data.widgets.length === 0 && (
            <p>
              {t('playlists.noWidgets')}{' '}
              <Link
                to={`/orgs/${orgId}/widgets`}
                className="text-brand-700 underline dark:text-brand-300"
              >
                {t('playlists.createWidget')}
              </Link>
            </p>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {widgets.data?.widgets.map((w) => (
              <li
                key={w.id}
                className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white shadow-sm p-2 dark:border-gray-800 dark:bg-gray-900"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {t(`widgets.types.${w.type}`, { defaultValue: w.type })}
                </span>
                <span className="text-sm font-medium break-words" dir="auto">
                  {w.name}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => {
                    edit([
                      ...current,
                      {
                        kind: 'widget',
                        widgetId: w.id,
                        widgetType: w.type,
                        name: w.name,
                        durationMs: null,
                        effectiveDurationMs: widgetDefaultMs(w),
                      },
                    ]);
                  }}
                >
                  {t('playlists.add')}
                  <span className="sr-only">{` ${w.name}`}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canEdit && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={duplicate.isPending}
              onClick={() => {
                duplicate.mutate(playlist.name);
              }}
            >
              {t('playlists.duplicate')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDeleting(true);
              }}
            >
              {t('playlists.deletePlaylist')}
            </Button>
          </div>
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
