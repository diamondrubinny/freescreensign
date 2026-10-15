import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import type { MediaItem } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { StockImageSearch } from '../../components/StockImageSearch';

/** Choose an image: from the organization's library, or import a free stock image. */
export function ImagePicker({
  orgId,
  open,
  onClose,
  onPick,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
  onPick: (media: MediaItem) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'library' | 'stock'>('library');
  const library = useQuery({
    queryKey: ['media', orgId, 'images-picker'],
    queryFn: () => get<{ media: MediaItem[] }>(`/api/v1/orgs/${orgId}/media?kind=image`),
    enabled: open,
  });
  const images = (library.data?.media ?? []).filter((m) => m.status === 'ready');
  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-2 font-medium ${active ? 'bg-brand-700 text-white' : 'border border-gray-300 dark:border-gray-600'}`;

  return (
    <Dialog open={open} onClose={onClose} title={t('designer.chooseImage')} wide>
      <div className="mb-4 flex gap-2" role="group" aria-label={t('designer.imageSource')}>
        <button
          type="button"
          aria-pressed={tab === 'library'}
          className={tabClass(tab === 'library')}
          onClick={() => {
            setTab('library');
          }}
        >
          {t('designer.fromLibrary')}
        </button>
        <button
          type="button"
          aria-pressed={tab === 'stock'}
          className={tabClass(tab === 'stock')}
          onClick={() => {
            setTab('stock');
          }}
        >
          {t('designer.fromStock')}
        </button>
      </div>
      {tab === 'library' ? (
        images.length === 0 ? (
          <p>{t('designer.noImages')}</p>
        ) : (
          <ul className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {images.map((m) => (
              <li key={m.id}>
                <Button
                  variant="secondary"
                  className="flex w-full flex-col gap-1 p-2!"
                  aria-label={`${t('designer.useImage')} ${m.name}`}
                  onClick={() => {
                    onPick(m);
                  }}
                >
                  {m.thumbnailUrl && (
                    <img
                      src={m.thumbnailUrl}
                      alt=""
                      className="aspect-video w-full rounded object-cover"
                    />
                  )}
                  <span className="w-full truncate text-sm" dir="auto">
                    {m.name}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <StockImageSearch orgId={orgId} onImported={onPick} />
        </div>
      )}
    </Dialog>
  );
}
