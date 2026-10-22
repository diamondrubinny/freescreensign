// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { hasRole } from '@rubinny/shared';
import { del, get, patch } from '../api/client';
import { useSession } from '../api/session';
import type { MediaItem, MediaStatus } from '../api/types';
import { uploadFile } from '../api/upload';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { StockImageSearch } from '../components/StockImageSearch';
import { Card, SectionHeading } from '../components/ui';
import { toFormErrors } from '../lib/api-errors';
import { formatBytes, formatDuration } from '../lib/format-bytes';
import { useFormErrors } from '../lib/use-form-errors';
import { Upload } from 'lucide-react';

const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';
const PENDING: MediaStatus[] = ['uploading', 'queued', 'processing'];

interface Usage {
  usedBytes: number;
  quotaBytes: number | null;
  maxImageBytes: number;
  maxVideoBytes: number;
}

interface UploadState {
  key: string;
  name: string;
  progress: number;
  state: 'uploading' | 'done' | 'error';
  message?: string;
}

const STATUS_ICON: Record<MediaStatus, string> = {
  uploading: '⏳',
  queued: '⏳',
  processing: '⚙️',
  ready: '✅',
  blocked: '⛔',
  failed: '⚠️',
};

export function MediaPage() {
  const { t, i18n } = useTranslation();
  const { orgId = '' } = useParams();
  const session = useSession().data;
  const queryClient = useQueryClient();
  const role = session?.memberships.find((m) => m.orgId === orgId)?.role;
  const canEdit = role ? hasRole(role, 'EDITOR') : false;

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState<'' | 'image' | 'video'>('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  const listKey = ['media', orgId, debounced, kind] as const;
  const list = useInfiniteQuery({
    queryKey: listKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (debounced) params.set('q', debounced);
      if (kind) params.set('kind', kind);
      if (pageParam) params.set('cursor', pageParam);
      return get<{ media: MediaItem[]; nextCursor: string | null }>(
        `/api/v1/orgs/${orgId}/media?${params.toString()}`,
      );
    },
    getNextPageParam: (last) => last.nextCursor,
    // Keep polling while files are still being checked.
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.media.some((m) => PENDING.includes(m.status)))
        ? 2000
        : false,
  });
  const usage = useQuery({
    queryKey: ['media-usage', orgId],
    queryFn: () => get<Usage>(`/api/v1/orgs/${orgId}/media-usage`),
  });
  const items = list.data?.pages.flatMap((page) => page.media) ?? [];
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['media', orgId] }),
      queryClient.invalidateQueries({ queryKey: ['media-usage', orgId] }),
    ]);

  const [showStock, setShowStock] = useState(false);
  const [stockImported, setStockImported] = useState(false);

  // ---------------------------------------------------------------- uploads
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const startUploads = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const key = `${file.name}-${String(Date.now())}-${Math.random().toString(36).slice(2)}`;
      setUploads((current) => [
        ...current,
        { key, name: file.name, progress: 0, state: 'uploading' },
      ]);
      setAnnouncement(t('media.uploading', { name: file.name }));
      const update = (patchState: Partial<UploadState>) => {
        setUploads((current) => current.map((u) => (u.key === key ? { ...u, ...patchState } : u)));
      };
      uploadFile(`/api/v1/orgs/${orgId}/media`, file, (progress) => {
        update({ progress });
      })
        .then(() => {
          update({ state: 'done', progress: 1 });
          setAnnouncement(t('media.uploaded', { name: file.name }));
          void refresh();
        })
        .catch((error: unknown) => {
          const errors = toFormErrors(t, error);
          const reason = errors.fields.file ?? errors.form ?? t('errors.INTERNAL_ERROR');
          const message = t('media.uploadFailed', { name: file.name, reason });
          update({ state: 'error', message });
          setAnnouncement(message);
        });
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (canEdit && event.dataTransfer.files.length > 0) startUploads(event.dataTransfer.files);
  };

  // ---------------------------------------------------------------- actions
  const [previewing, setPreviewing] = useState<MediaItem | null>(null);
  const [renaming, setRenaming] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState<MediaItem | null>(null);
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      patch(`/api/v1/orgs/${orgId}/media/${id}`, { name }),
    onSuccess: async () => {
      setRenaming(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/v1/orgs/${orgId}/media/${id}`),
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
    },
  });
  const renameErrors = useFormErrors(rename.error);
  const listErrors = useFormErrors(list.error ?? remove.error);

  return (
    <>
      <PageHeading title={t('media.title')} />
      {listErrors.form && <Alert variant={listErrors.variant}>{listErrors.form}</Alert>}

      {usage.data && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label htmlFor="media-usage" className="font-medium">
            {t('media.usage')}
          </label>
          {usage.data.quotaBytes ? (
            <meter
              id="media-usage"
              min={0}
              max={usage.data.quotaBytes}
              value={usage.data.usedBytes}
              className="w-48"
            />
          ) : null}
          <span id={usage.data.quotaBytes ? undefined : 'media-usage'}>
            {usage.data.quotaBytes
              ? t('media.usageOf', {
                  used: formatBytes(usage.data.usedBytes, i18n.language),
                  quota: formatBytes(usage.data.quotaBytes, i18n.language),
                })
              : t('media.usageUnlimited', {
                  used: formatBytes(usage.data.usedBytes, i18n.language),
                })}
          </span>
        </div>
      )}

      {canEdit && (
        <section aria-labelledby="upload-heading" className="mb-8">
          <h2 id="upload-heading" className="mb-3 text-xl font-semibold">
            {t('media.upload')}
          </h2>
          {/* Drag and drop is a pointer-only convenience; the labelled file input is the accessible path. */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => {
              setDragging(false);
            }}
            onDrop={onDrop}
            className={`flex flex-col items-start gap-2 rounded-lg border-2 border-dashed p-6 ${
              dragging ? 'border-brand-700 bg-brand-50 dark:bg-brand-950' : 'border-gray-400'
            }`}
          >
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              multiple
              accept={ACCEPT}
              aria-describedby={`${inputId}-hint`}
              onChange={(event) => {
                if (event.target.files) startUploads(event.target.files);
                event.target.value = '';
              }}
              // Visually replaced by the label below (the browser's own control is not translated).
              className="peer sr-only"
            />
            <label
              htmlFor={inputId}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 font-medium text-white shadow-sm peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-700 hover:bg-brand-800 dark:bg-brand-600 dark:hover:bg-brand-500 dark:peer-focus-visible:outline-brand-300"
            >
              <Upload aria-hidden="true" className="size-4" />
              {t('media.chooseFiles')}
            </label>
            <p id={`${inputId}-hint`} className="text-sm text-gray-700 dark:text-gray-300">
              {t('media.dropHint')}{' '}
              {usage.data &&
                t('media.accepted', {
                  image: formatBytes(usage.data.maxImageBytes, i18n.language),
                  video: formatBytes(usage.data.maxVideoBytes, i18n.language),
                })}{' '}
              {t('media.privacyNote')}
            </p>
          </div>
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
          {uploads.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {uploads.map((u) => (
                <li key={u.key} className="flex flex-col gap-1">
                  <span dir="auto">{u.state === 'error' ? u.message : u.name}</span>
                  {u.state === 'uploading' && (
                    <progress
                      max={1}
                      value={u.progress}
                      aria-label={t('media.progress', { name: u.name })}
                      className="w-full max-w-md"
                    />
                  )}
                  {u.state === 'done' && (
                    <span className="text-sm">{t('media.uploaded', { name: u.name })}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canEdit && (
        <section aria-labelledby="stock-heading" className="mb-8">
          <SectionHeading
            id="stock-heading"
            title={t('stock.title')}
            description={t('stock.intro')}
          >
            <Button
              variant="secondary"
              aria-expanded={showStock}
              aria-controls="stock-panel"
              onClick={() => {
                setShowStock((open) => !open);
              }}
            >
              {showStock ? t('common.close') : t('stock.searchButton')}
            </Button>
          </SectionHeading>
          {stockImported && (
            <div className="mb-3">
              <Alert variant="success">{t('stock.imported')}</Alert>
            </div>
          )}
          {showStock && (
            <Card className="p-4">
              <div id="stock-panel">
                <StockImageSearch
                  orgId={orgId}
                  onImported={() => {
                    setStockImported(true);
                    void refresh();
                  }}
                />
              </div>
            </Card>
          )}
        </section>
      )}

      <section aria-labelledby="library-heading">
        <h2 id="library-heading" className="sr-only">
          {t('media.title')}
        </h2>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <Field
            label={t('media.search')}
            name="q"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            className="w-64"
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="media-kind" className="font-medium">
              {t('media.kind')}
            </label>
            <select
              id="media-kind"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as '' | 'image' | 'video');
              }}
              className="rounded-md border border-gray-500 bg-white px-3 py-2 dark:bg-gray-900"
            >
              <option value="">{t('media.kindAll')}</option>
              <option value="image">{t('media.kindImage')}</option>
              <option value="video">{t('media.kindVideo')}</option>
            </select>
          </div>
        </div>

        {list.isPending && <Loading />}
        {list.isSuccess && items.length === 0 && (
          <p>{debounced || kind ? t('media.noResults') : t('media.empty')}</p>
        )}
        <ul
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label={t('media.title')}
        >
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="relative flex aspect-video items-center justify-center bg-gray-100 dark:bg-gray-800">
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : (
                  <span aria-hidden="true" className="text-4xl">
                    {STATUS_ICON[item.status]}
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <h3 className="font-semibold break-words" dir="auto">
                  {item.name}
                </h3>
                <p className="text-sm">
                  <span aria-hidden="true">{STATUS_ICON[item.status]} </span>
                  {t(`media.status.${item.status}`)}
                </p>
                {item.attribution && (
                  <p className="text-xs text-gray-700 dark:text-gray-300" dir="auto">
                    {item.attribution}
                  </p>
                )}
                {item.failureReason && (
                  <p className="text-sm text-red-800 dark:text-red-300">
                    {t(`media.reasons.${item.failureReason as 'processing_error'}`, {
                      defaultValue: t('media.reasons.processing_error'),
                    })}
                  </p>
                )}
                {item.status === 'ready' && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-sm text-gray-700 dark:text-gray-300">
                    <dt>{t('media.size')}:</dt>
                    <dd>{formatBytes(item.sizeBytes, i18n.language)}</dd>
                    {item.width && item.height && (
                      <>
                        <dt>{t('media.dimensions')}:</dt>
                        <dd>
                          <bdi dir="ltr">
                            {item.width}×{item.height}
                          </bdi>
                        </dd>
                      </>
                    )}
                    {item.durationMs !== null && (
                      <>
                        <dt>{t('media.duration')}:</dt>
                        <dd>
                          <bdi dir="ltr">{formatDuration(item.durationMs)}</bdi>
                        </dd>
                      </>
                    )}
                  </dl>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  {item.status === 'ready' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setPreviewing(item);
                      }}
                    >
                      {t('media.preview')}
                      <span className="sr-only">{` ${item.name}`}</span>
                    </Button>
                  )}
                  {canEdit && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          rename.reset();
                          setRenaming(item);
                        }}
                      >
                        {t('media.rename')}
                        <span className="sr-only">{` ${item.name}`}</span>
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setDeleting(item);
                        }}
                      >
                        {t('common.delete')}
                        <span className="sr-only">{` ${item.name}`}</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {list.hasNextPage && (
          <Button
            variant="secondary"
            className="mt-4"
            loading={list.isFetchingNextPage}
            onClick={() => {
              void list.fetchNextPage();
            }}
          >
            {t('common.loadMore')}
          </Button>
        )}
      </section>

      <Dialog
        open={previewing !== null}
        onClose={() => {
          setPreviewing(null);
        }}
        title={previewing?.name ?? ''}
      >
        {previewing?.fileUrl &&
          (previewing.kind === 'image' ? (
            <img
              src={previewing.fileUrl}
              alt={previewing.name}
              className="max-h-[70vh] w-full object-contain"
            />
          ) : (
            // Signage videos usually have no speech; captions can be added by the uploader in a later phase.
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={previewing.fileUrl}
              controls
              preload="metadata"
              className="max-h-[70vh] w-full"
            />
          ))}
      </Dialog>

      <Dialog
        open={renaming !== null}
        onClose={() => {
          setRenaming(null);
        }}
        title={t('media.renameTitle')}
        footer={<></>}
      >
        {renaming && (
          <Form
            errors={renameErrors}
            onSubmit={(data) => {
              rename.mutate({ id: renaming.id, name: value(data, 'name') });
            }}
          >
            <Field
              label={t('fields.name')}
              name="name"
              required
              defaultValue={renaming.name}
              error={renameErrors.fields.name}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setRenaming(null);
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={rename.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </Form>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        message={t('media.deleteConfirm', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
        onCancel={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </>
  );
}
