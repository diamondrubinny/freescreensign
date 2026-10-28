// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useQuery } from '@tanstack/react-query';
import {
  DIRECTORY_DIRECTIONS,
  DIRECTORY_MAX_ENTRIES,
  type DirectoryDirection,
} from '@rubinny/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { get } from '../../api/client';
import type { Messages } from '../../i18n/locales/he';
import type { MediaItem } from '../../api/types';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/ui';
import { Labelled } from './Labelled';

interface FloorDraft {
  name: string;
  mapMediaId: string;
}
interface EntryDraft {
  name: string;
  floor: string;
  room: string;
  category: string;
  direction: DirectoryDirection;
  note: string;
}
interface Drafts {
  floors: FloorDraft[];
  categories: string[];
  entries: EntryDraft[];
}

function toDrafts(initial: unknown): Drafts {
  const config = (initial ?? {}) as {
    floors?: { name?: string; mapMediaId?: string }[];
    categories?: string[];
    entries?: Partial<EntryDraft>[];
  };
  const floors = (config.floors ?? []).map((f) => ({
    name: f.name ?? '',
    mapMediaId: f.mapMediaId ?? '',
  }));
  return {
    floors: floors.length > 0 ? floors : [{ name: '1', mapMediaId: '' }],
    categories: config.categories ?? [],
    entries: (config.entries ?? [{}]).map((e) => ({
      name: e.name ?? '',
      floor: e.floor ?? floors[0]?.name ?? '1',
      room: e.room ?? '',
      category: e.category ?? '',
      direction: e.direction ?? 'none',
      note: e.note ?? '',
    })),
  };
}

/** The lists as the widget configuration expects them; empty optional texts left out. */
export function directoryValue(drafts: Drafts) {
  return {
    floors: drafts.floors.map((f) => ({
      name: f.name.trim(),
      ...(f.mapMediaId ? { mapMediaId: f.mapMediaId } : {}),
    })),
    categories: drafts.categories.map((c) => c.trim()).filter(Boolean),
    entries: drafts.entries.map((e) => ({
      name: e.name.trim(),
      floor: e.floor.trim(),
      ...(e.room.trim() ? { room: e.room.trim() } : {}),
      ...(e.category ? { category: e.category } : {}),
      direction: e.direction,
      ...(e.note.trim() ? { note: e.note.trim() } : {}),
    })),
  };
}

/**
 * Floors (with an optional map image), categories and entries of a building directory, with
 * plain form controls and add/remove buttons (keyboard and screen reader friendly). The lists
 * travel with the widget form as one JSON value in a hidden field named `name`.
 */
export function DirectoryEditor({
  name,
  initial,
  errors,
}: {
  name: string;
  initial: unknown;
  /** Server errors by path, e.g. "entries.0.floor". */
  errors: Record<string, string>;
}) {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const [drafts, setDrafts] = useState(() => toDrafts(initial));
  const images = useQuery({
    queryKey: ['media', orgId, 'directory-maps'],
    queryFn: () =>
      get<{ media: MediaItem[] }>(`/api/v1/orgs/${orgId}/media?kind=image`).then((r) =>
        r.media.filter((m) => m.status === 'ready'),
      ),
  });
  const f = (key: Exclude<keyof Messages['widgets']['directory'], 'directions'>) =>
    t(`widgets.directory.${key}`);
  const floorNames = drafts.floors.map((x) => x.name.trim()).filter(Boolean);

  const update = (patch: (d: Drafts) => Drafts) => {
    setDrafts((current) => patch(current));
  };

  return (
    <div className="flex flex-col gap-6">
      <input type="hidden" name={name} value={JSON.stringify(directoryValue(drafts))} />
      {errors[''] && (
        <p className="font-semibold text-red-700 dark:text-red-300" role="alert">
          {errors['']}
        </p>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-bold">{f('floors')}</legend>
        {drafts.floors.map((floor, index) => (
          <div key={String(index)} className="flex flex-wrap items-end gap-3">
            <Labelled label={f('floorName')} error={errors[`floors.${String(index)}.name`]}>
              {(props) => (
                <input
                  {...props}
                  dir="auto"
                  maxLength={40}
                  value={floor.name}
                  onChange={(event) => {
                    update((d) => ({
                      ...d,
                      floors: d.floors.map((x, i) =>
                        i === index ? { ...x, name: event.target.value } : x,
                      ),
                    }));
                  }}
                  className={`${inputClass} w-32`}
                />
              )}
            </Labelled>
            <Labelled label={f('floorMap')}>
              {(props) => (
                <select
                  {...props}
                  value={floor.mapMediaId}
                  onChange={(event) => {
                    update((d) => ({
                      ...d,
                      floors: d.floors.map((x, i) =>
                        i === index ? { ...x, mapMediaId: event.target.value } : x,
                      ),
                    }));
                  }}
                  className={`${inputClass} bg-white`}
                >
                  <option value="">{f('noMap')}</option>
                  {(images.data ?? []).map((image) => (
                    <option key={image.id} value={image.id}>
                      {image.name}
                    </option>
                  ))}
                </select>
              )}
            </Labelled>
            <Button
              variant="secondary"
              size="sm"
              disabled={drafts.floors.length <= 1}
              aria-label={`${f('removeFloor')} ${floor.name}`}
              onClick={() => {
                update((d) => ({ ...d, floors: d.floors.filter((_, i) => i !== index) }));
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={drafts.floors.length >= 60}
            onClick={() => {
              update((d) => ({ ...d, floors: [...d.floors, { name: '', mapMediaId: '' }] }));
            }}
          >
            <Plus aria-hidden="true" />
            {f('addFloor')}
          </Button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-bold">{f('categories')}</legend>
        <p className="text-sm text-gray-700 dark:text-gray-300">{f('categoriesHint')}</p>
        {drafts.categories.map((category, index) => (
          <div key={String(index)} className="flex flex-wrap items-end gap-3">
            <Labelled label={f('categoryName')} error={errors[`categories.${String(index)}`]}>
              {(props) => (
                <input
                  {...props}
                  dir="auto"
                  maxLength={40}
                  value={category}
                  onChange={(event) => {
                    update((d) => ({
                      ...d,
                      categories: d.categories.map((x, i) =>
                        i === index ? event.target.value : x,
                      ),
                    }));
                  }}
                  className={inputClass}
                />
              )}
            </Labelled>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`${f('removeCategory')} ${category}`}
              onClick={() => {
                update((d) => ({ ...d, categories: d.categories.filter((_, i) => i !== index) }));
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={drafts.categories.length >= 30}
            onClick={() => {
              update((d) => ({ ...d, categories: [...d.categories, ''] }));
            }}
          >
            <Plus aria-hidden="true" />
            {f('addCategory')}
          </Button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-bold">
          {f('entries')} ({drafts.entries.length}/{DIRECTORY_MAX_ENTRIES})
        </legend>
        <p className="text-sm text-gray-700 dark:text-gray-300">{f('entriesHint')}</p>
        <ol className="flex flex-col gap-4">
          {drafts.entries.map((entry, index) => {
            const at = (key: string) => errors[`entries.${String(index)}.${key}`];
            const set = (patch: Partial<EntryDraft>) => {
              update((d) => ({
                ...d,
                entries: d.entries.map((x, i) => (i === index ? { ...x, ...patch } : x)),
              }));
            };
            return (
              <li
                key={String(index)}
                className="grid gap-3 rounded-lg border border-gray-300 p-3 sm:grid-cols-2 lg:grid-cols-3 dark:border-gray-700"
              >
                <Labelled label={f('entryName')} error={at('name')}>
                  {(props) => (
                    <input
                      {...props}
                      dir="auto"
                      maxLength={80}
                      required
                      value={entry.name}
                      onChange={(event) => {
                        set({ name: event.target.value });
                      }}
                      className={inputClass}
                    />
                  )}
                </Labelled>
                <Labelled label={f('floor')} error={at('floor')}>
                  {(props) => (
                    <select
                      {...props}
                      value={entry.floor}
                      onChange={(event) => {
                        set({ floor: event.target.value });
                      }}
                      className={`${inputClass} bg-white`}
                    >
                      {!floorNames.includes(entry.floor) && (
                        <option value={entry.floor}>{entry.floor}</option>
                      )}
                      {floorNames.map((floor) => (
                        <option key={floor} value={floor}>
                          {floor}
                        </option>
                      ))}
                    </select>
                  )}
                </Labelled>
                <Labelled label={f('room')} error={at('room')}>
                  {(props) => (
                    <input
                      {...props}
                      dir="auto"
                      maxLength={40}
                      value={entry.room}
                      onChange={(event) => {
                        set({ room: event.target.value });
                      }}
                      className={inputClass}
                    />
                  )}
                </Labelled>
                <Labelled label={f('category')} error={at('category')}>
                  {(props) => (
                    <select
                      {...props}
                      value={entry.category}
                      onChange={(event) => {
                        set({ category: event.target.value });
                      }}
                      className={`${inputClass} bg-white`}
                    >
                      <option value="">{f('noCategory')}</option>
                      {drafts.categories
                        .map((c) => c.trim())
                        .filter(Boolean)
                        .map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                    </select>
                  )}
                </Labelled>
                <Labelled label={f('direction')} error={at('direction')}>
                  {(props) => (
                    <select
                      {...props}
                      value={entry.direction}
                      onChange={(event) => {
                        set({ direction: event.target.value as DirectoryDirection });
                      }}
                      className={`${inputClass} bg-white`}
                    >
                      {DIRECTORY_DIRECTIONS.map((d) => (
                        <option key={d} value={d}>
                          {t(`widgets.directory.directions.${d}`)}
                        </option>
                      ))}
                    </select>
                  )}
                </Labelled>
                <Labelled label={f('note')} error={at('note')}>
                  {(props) => (
                    <input
                      {...props}
                      dir="auto"
                      maxLength={120}
                      value={entry.note}
                      onChange={(event) => {
                        set({ note: event.target.value });
                      }}
                      className={inputClass}
                    />
                  )}
                </Labelled>
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={drafts.entries.length <= 1}
                    aria-label={`${f('removeEntry')} ${entry.name}`}
                    onClick={() => {
                      update((d) => ({ ...d, entries: d.entries.filter((_, i) => i !== index) }));
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                    {f('removeEntry')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={drafts.entries.length >= DIRECTORY_MAX_ENTRIES}
            onClick={() => {
              update((d) => ({
                ...d,
                entries: [
                  ...d.entries,
                  {
                    name: '',
                    floor: floorNames[0] ?? '',
                    room: '',
                    category: '',
                    direction: 'none',
                    note: '',
                  },
                ],
              }));
            }}
          >
            <Plus aria-hidden="true" />
            {f('addEntry')}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
