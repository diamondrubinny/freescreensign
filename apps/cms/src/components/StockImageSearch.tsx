import { useMutation, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post } from '../api/client';
import type { MediaItem } from '../api/types';
import { useFormErrors } from '../lib/use-form-errors';
import { Alert } from './Alert';
import { Button } from './Button';
import { inputClass } from './ui';

export interface StockResult {
  id: string;
  title: string;
  creator: string | null;
  license: string;
  provider: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Search free (public-domain/CC0) images and import them into the media library.
 * Searches, thumbnails and downloads all go through the Rubinny server.
 */
export function StockImageSearch({
  orgId,
  onImported,
}: {
  orgId: string;
  onImported: (media: MediaItem) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const search = useQuery({
    queryKey: ['stock', orgId, query, page],
    queryFn: () =>
      get<{ page: number; pageCount: number; results: StockResult[] }>(
        `/api/v1/orgs/${orgId}/stock/images?q=${encodeURIComponent(query)}&page=${String(page)}`,
      ),
    enabled: query.length > 0,
    staleTime: 10 * 60 * 1000,
  });
  const importImage = useMutation({
    mutationFn: (id: string) =>
      post<{ media: MediaItem }>(`/api/v1/orgs/${orgId}/stock/images/${id}/import`),
    onSuccess: ({ media }) => {
      onImported(media);
    },
  });
  const errors = useFormErrors(search.error ?? importImage.error);
  const results = search.data?.results ?? [];

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQuery(draft.trim());
        }}
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor={inputId} className="font-medium">
            {t('stock.search')}
          </label>
          <input
            id={inputId}
            type="search"
            value={draft}
            maxLength={100}
            placeholder={t('stock.placeholder')}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            className={inputClass}
          />
        </div>
        <Button type="submit" loading={search.isFetching}>
          <Search aria-hidden="true" />
          {t('stock.searchButton')}
        </Button>
      </form>
      <p className="text-sm text-gray-700 dark:text-gray-300">{t('stock.notice')}</p>
      {errors.form && <Alert variant="error">{errors.form}</Alert>}
      <div aria-live="polite" className="sr-only">
        {search.isSuccess ? t('stock.resultCount', { count: results.length }) : ''}
      </div>
      {search.isSuccess && results.length === 0 && <p>{t('stock.noResults')}</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {results.map((image) => (
          <li
            key={image.id}
            className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
          >
            <img
              src={`/api/v1/orgs/${orgId}/stock/images/${image.id}/thumb`}
              alt={image.title}
              loading="lazy"
              className="aspect-video w-full bg-gray-100 object-cover dark:bg-gray-800"
            />
            <div className="flex flex-1 flex-col gap-1 p-2 text-sm">
              <span className="line-clamp-2 font-medium" dir="auto">
                {image.title || t('stock.untitled')}
              </span>
              {image.creator && (
                <span className="text-gray-700 dark:text-gray-300" dir="auto">
                  {t('stock.by', { creator: image.creator })}
                </span>
              )}
              <Button
                variant="secondary"
                className="mt-auto"
                loading={importImage.isPending && importImage.variables === image.id}
                disabled={importImage.isPending}
                aria-label={`${t('stock.import')} ${image.title || t('stock.untitled')}`}
                onClick={() => {
                  importImage.mutate(image.id);
                }}
              >
                {t('stock.import')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {search.data && search.data.pageCount > 1 && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => {
              setPage((p) => p - 1);
            }}
          >
            {t('stock.previous')}
          </Button>
          <Button
            variant="secondary"
            disabled={page >= Math.min(search.data.pageCount, 20)}
            onClick={() => {
              setPage((p) => p + 1);
            }}
          >
            {t('stock.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
