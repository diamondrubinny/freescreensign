// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { ZMANIM_KEYS, type ZmanKey } from '@rubinny/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Messages } from '../../i18n/locales/he';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/ui';
import { Labelled } from './Labelled';

/**
 * Places to start from (coordinates from GeoNames, city centers). Synagogues should check
 * them, and the times, with their rabbi.
 */
export const ZMANIM_CITIES = [
  {
    he: 'ירושלים',
    en: 'Jerusalem',
    latitude: 31.76904,
    longitude: 35.21633,
    timezone: 'Asia/Jerusalem',
    israel: true,
  },
  {
    he: 'תל אביב-יפו',
    en: 'Tel Aviv-Yafo',
    latitude: 32.08088,
    longitude: 34.78057,
    timezone: 'Asia/Jerusalem',
    israel: true,
  },
  {
    he: 'חיפה',
    en: 'Haifa',
    latitude: 32.81841,
    longitude: 34.9885,
    timezone: 'Asia/Jerusalem',
    israel: true,
  },
  {
    he: 'באר שבע',
    en: "Be'er Sheva",
    latitude: 31.25181,
    longitude: 34.7913,
    timezone: 'Asia/Jerusalem',
    israel: true,
  },
  {
    he: 'בני ברק',
    en: 'Bnei Brak',
    latitude: 32.08074,
    longitude: 34.8338,
    timezone: 'Asia/Jerusalem',
    israel: true,
  },
  {
    he: 'פתח תקווה',
    en: 'Petah Tikva',
    latitude: 32.08707,
    longitude: 34.88747,
    timezone: 'Asia/Jerusalem',
    israel: true,
  },
  {
    he: 'נתניה',
    en: 'Netanya',
    latitude: 32.33291,
    longitude: 34.85992,
    timezone: 'Asia/Jerusalem',
    israel: true,
  },
  {
    he: 'אשדוד',
    en: 'Ashdod',
    latitude: 31.79213,
    longitude: 34.64966,
    timezone: 'Asia/Jerusalem',
    israel: true,
  },
  {
    he: 'בית שמש',
    en: 'Beit Shemesh',
    latitude: 31.73072,
    longitude: 34.99293,
    timezone: 'Asia/Jerusalem',
    israel: true,
  },
  {
    he: 'צפת',
    en: 'Safed',
    latitude: 32.96465,
    longitude: 35.496,
    timezone: 'Asia/Jerusalem',
    israel: true,
  },
  {
    he: 'ניו יורק',
    en: 'New York',
    latitude: 40.71427,
    longitude: -74.00597,
    timezone: 'America/New_York',
    israel: false,
  },
  {
    he: 'לוס אנג׳לס',
    en: 'Los Angeles',
    latitude: 34.05223,
    longitude: -118.24368,
    timezone: 'America/Los_Angeles',
    israel: false,
  },
  {
    he: 'טורונטו',
    en: 'Toronto',
    latitude: 43.70011,
    longitude: -79.4163,
    timezone: 'America/Toronto',
    israel: false,
  },
  {
    he: 'לונדון',
    en: 'London',
    latitude: 51.50853,
    longitude: -0.12574,
    timezone: 'Europe/London',
    israel: false,
  },
  {
    he: 'פריז',
    en: 'Paris',
    latitude: 48.85341,
    longitude: 2.3488,
    timezone: 'Europe/Paris',
    israel: false,
  },
  {
    he: 'אנטוורפן',
    en: 'Antwerp',
    latitude: 51.21989,
    longitude: 4.40346,
    timezone: 'Europe/Brussels',
    israel: false,
  },
] as const;

interface PlaceDraft {
  name: string;
  latitude: string;
  longitude: string;
  elevation: string;
  timezone: string;
  israel: boolean;
}
interface PrayerDraft {
  name: string;
  days: number[];
  mode: 'time' | 'zman';
  time: string;
  zman: ZmanKey;
  offset: string;
}
interface Drafts {
  place: PlaceDraft;
  times: ZmanKey[];
  prayers: PrayerDraft[];
}

const DEFAULT_TIMES: ZmanKey[] = [
  'alotHaShachar',
  'sunrise',
  'sofZmanShma',
  'sofZmanTfilla',
  'chatzot',
  'minchaGedola',
  'plagHaMincha',
  'sunset',
  'tzeit',
];

const numberText = (value: unknown) => (typeof value === 'number' ? String(value) : '');

function toDrafts(initial: unknown): Drafts {
  const config = (initial ?? {}) as {
    place?: Partial<{
      name: string;
      latitude: number;
      longitude: number;
      elevation: number;
      timezone: string;
      israel: boolean;
    }>;
    times?: ZmanKey[];
    prayers?: Partial<{
      name: string;
      days: number[];
      time: string;
      zman: ZmanKey;
      offset: number;
    }>[];
  };
  const place = config.place ?? {};
  return {
    place: {
      name: place.name ?? '',
      latitude: numberText(place.latitude),
      longitude: numberText(place.longitude),
      elevation: numberText(place.elevation),
      timezone: place.timezone ?? 'Asia/Jerusalem',
      israel: place.israel ?? true,
    },
    times: config.times ?? DEFAULT_TIMES,
    prayers: (config.prayers ?? []).map((p) => ({
      name: p.name ?? '',
      days: p.days ?? [],
      mode: p.zman ? 'zman' : 'time',
      time: p.time ?? '',
      zman: p.zman ?? 'sunset',
      offset: numberText(p.offset ?? 0),
    })),
  };
}

/** A number when the text is one; otherwise the text, for the server to report. */
const toNumber = (text: string): number | string => {
  const trimmed = text.trim();
  return trimmed !== '' && Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed;
};

/** The settings as the widget configuration expects them. */
export function zmanimValue(drafts: Drafts) {
  const { place } = drafts;
  return {
    place: {
      name: place.name.trim(),
      latitude: toNumber(place.latitude),
      longitude: toNumber(place.longitude),
      ...(place.elevation.trim() ? { elevation: toNumber(place.elevation) } : {}),
      timezone: place.timezone.trim(),
      israel: place.israel,
    },
    // In the order of the day, whatever order they were ticked in.
    times: ZMANIM_KEYS.filter((key) => drafts.times.includes(key)),
    prayers: drafts.prayers.map((p) => ({
      name: p.name.trim(),
      days: [...p.days].sort(),
      ...(p.mode === 'time' ? { time: p.time } : { zman: p.zman, offset: toNumber(p.offset) }),
    })),
  };
}

/**
 * The place (with a list of cities to start from), the times of the day to show and the
 * congregation's prayers, with plain form controls (keyboard and screen reader friendly).
 * The settings travel with the widget form as one JSON value in a hidden field named `name`.
 */
export function ZmanimEditor({
  name,
  initial,
  errors,
}: {
  name: string;
  initial: unknown;
  /** Server errors by path, e.g. "place.latitude" or "prayers.0.time". */
  errors: Record<string, string>;
}) {
  const { t, i18n } = useTranslation();
  const [drafts, setDrafts] = useState(() => toDrafts(initial));
  const z = (key: Exclude<keyof Messages['widgets']['zmanim'], 'labels' | 'weekdays'>): string =>
    t(`widgets.zmanim.${key}`);
  const label = (key: ZmanKey) => t(`widgets.zmanim.labels.${key}`);
  const weekdays = t('widgets.zmanim.weekdays', { returnObjects: true });
  const he = i18n.language.startsWith('he');

  const setPlace = (patch: Partial<PlaceDraft>) => {
    setDrafts((d) => ({ ...d, place: { ...d.place, ...patch } }));
  };
  const setPrayer = (index: number, patch: Partial<PrayerDraft>) => {
    setDrafts((d) => ({
      ...d,
      prayers: d.prayers.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  };

  return (
    <div className="flex flex-col gap-6">
      <input type="hidden" name={name} value={JSON.stringify(zmanimValue(drafts))} />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-bold">{z('place')}</legend>
        <Labelled label={z('city')}>
          {(props) => (
            <select
              {...props}
              value=""
              onChange={(event) => {
                const city = ZMANIM_CITIES[Number(event.target.value)];
                if (!city) return;
                setPlace({
                  name: he ? city.he : city.en,
                  latitude: String(city.latitude),
                  longitude: String(city.longitude),
                  elevation: '',
                  timezone: city.timezone,
                  israel: city.israel,
                });
              }}
              className={`${inputClass} bg-white sm:w-72`}
            >
              <option value="">{z('cityChoose')}</option>
              {ZMANIM_CITIES.map((city, index) => (
                <option key={city.en} value={String(index)}>
                  {he ? city.he : city.en}
                </option>
              ))}
            </select>
          )}
        </Labelled>
        <p className="text-sm text-gray-700 dark:text-gray-300">{z('coordsHint')}</p>
        <div className="flex flex-wrap items-start gap-3">
          <Labelled label={z('placeName')} error={errors['place.name']}>
            {(props) => (
              <input
                {...props}
                dir="auto"
                maxLength={60}
                required
                value={drafts.place.name}
                onChange={(event) => {
                  setPlace({ name: event.target.value });
                }}
                className={`${inputClass} w-56`}
              />
            )}
          </Labelled>
          <Labelled label={z('latitude')} error={errors['place.latitude']}>
            {(props) => (
              <input
                {...props}
                dir="ltr"
                inputMode="decimal"
                required
                value={drafts.place.latitude}
                onChange={(event) => {
                  setPlace({ latitude: event.target.value });
                }}
                className={`${inputClass} w-32`}
              />
            )}
          </Labelled>
          <Labelled label={z('longitude')} error={errors['place.longitude']}>
            {(props) => (
              <input
                {...props}
                dir="ltr"
                inputMode="decimal"
                required
                value={drafts.place.longitude}
                onChange={(event) => {
                  setPlace({ longitude: event.target.value });
                }}
                className={`${inputClass} w-32`}
              />
            )}
          </Labelled>
          <Labelled label={z('elevation')} error={errors['place.elevation']}>
            {(props) => (
              <input
                {...props}
                dir="ltr"
                inputMode="numeric"
                value={drafts.place.elevation}
                onChange={(event) => {
                  setPlace({ elevation: event.target.value });
                }}
                className={`${inputClass} w-28`}
              />
            )}
          </Labelled>
          <Labelled label={z('timezone')} error={errors['place.timezone']}>
            {(props) => (
              <input
                {...props}
                dir="ltr"
                maxLength={64}
                required
                value={drafts.place.timezone}
                onChange={(event) => {
                  setPlace({ timezone: event.target.value });
                }}
                className={`${inputClass} w-48`}
              />
            )}
          </Labelled>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300">{z('elevationHint')}</p>
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={drafts.place.israel}
            onChange={(event) => {
              setPlace({ israel: event.target.checked });
            }}
          />
          {z('israel')}
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-bold">{z('times')}</legend>
        {errors.times && (
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{errors.times}</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {ZMANIM_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={drafts.times.includes(key)}
                onChange={(event) => {
                  const on = event.target.checked;
                  setDrafts((d) => ({
                    ...d,
                    times: on ? [...d.times, key] : d.times.filter((k) => k !== key),
                  }));
                }}
              />
              {label(key)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-bold">
          {z('prayers')} ({drafts.prayers.length}/20)
        </legend>
        <p className="text-sm text-gray-700 dark:text-gray-300">{z('prayersHint')}</p>
        <ol className="flex flex-col gap-4">
          {drafts.prayers.map((prayer, index) => {
            const at = (key: string) => errors[`prayers.${String(index)}.${key}`];
            return (
              <li
                key={String(index)}
                className="flex flex-col gap-3 rounded border border-gray-300 p-3 dark:border-gray-600"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <Labelled label={z('prayerName')} error={at('name')}>
                    {(props) => (
                      <input
                        {...props}
                        dir="auto"
                        maxLength={40}
                        required
                        value={prayer.name}
                        onChange={(event) => {
                          setPrayer(index, { name: event.target.value });
                        }}
                        className={`${inputClass} w-48`}
                      />
                    )}
                  </Labelled>
                  <Labelled label={z('mode')}>
                    {(props) => (
                      <select
                        {...props}
                        value={prayer.mode}
                        onChange={(event) => {
                          setPrayer(index, {
                            mode: event.target.value === 'zman' ? 'zman' : 'time',
                          });
                        }}
                        className={`${inputClass} bg-white`}
                      >
                        <option value="time">{z('fixed')}</option>
                        <option value="zman">{z('relative')}</option>
                      </select>
                    )}
                  </Labelled>
                  {prayer.mode === 'time' ? (
                    <Labelled label={z('time')} error={at('time')}>
                      {(props) => (
                        <input
                          {...props}
                          type="time"
                          dir="ltr"
                          required
                          value={prayer.time}
                          onChange={(event) => {
                            setPrayer(index, { time: event.target.value });
                          }}
                          className={inputClass}
                        />
                      )}
                    </Labelled>
                  ) : (
                    <>
                      <Labelled label={z('zman')} error={at('zman')}>
                        {(props) => (
                          <select
                            {...props}
                            value={prayer.zman}
                            onChange={(event) => {
                              setPrayer(index, { zman: event.target.value as ZmanKey });
                            }}
                            className={`${inputClass} bg-white`}
                          >
                            {ZMANIM_KEYS.map((key) => (
                              <option key={key} value={key}>
                                {label(key)}
                              </option>
                            ))}
                          </select>
                        )}
                      </Labelled>
                      <Labelled label={z('offset')} error={at('offset')}>
                        {(props) => (
                          <input
                            {...props}
                            type="number"
                            dir="ltr"
                            min={-180}
                            max={180}
                            step={1}
                            value={prayer.offset}
                            onChange={(event) => {
                              setPrayer(index, { offset: event.target.value });
                            }}
                            className={`${inputClass} w-24`}
                          />
                        )}
                      </Labelled>
                    </>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="self-end"
                    aria-label={`${z('removePrayer')} ${prayer.name}`}
                    onClick={() => {
                      setDrafts((d) => ({
                        ...d,
                        prayers: d.prayers.filter((_, i) => i !== index),
                      }));
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <fieldset>
                  <legend className="text-sm font-medium">{z('days')}</legend>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {weekdays.map((day, weekday) => (
                      <label key={day} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={prayer.days.includes(weekday)}
                          onChange={(event) => {
                            const on = event.target.checked;
                            setPrayer(index, {
                              days: on
                                ? [...prayer.days, weekday]
                                : prayer.days.filter((d) => d !== weekday),
                            });
                          }}
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{z('daysHint')}</p>
                </fieldset>
              </li>
            );
          })}
        </ol>
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={drafts.prayers.length >= 20}
            onClick={() => {
              setDrafts((d) => ({
                ...d,
                prayers: [
                  ...d.prayers,
                  { name: '', days: [], mode: 'time', time: '', zman: 'sunset', offset: '0' },
                ],
              }));
            }}
          >
            <Plus aria-hidden="true" />
            {z('addPrayer')}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
