// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HAVDALAH_METHODS, SACRED_LIMITS, type SacredSettings } from '@rubinny/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { put } from '../api/client';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { inputClass } from '../components/ui';
import { useFormErrors } from '../lib/use-form-errors';
import { useOrgRole } from '../lib/use-org-role';
import { periodLabel, useSacredSettings, useSacredTimes } from '../lib/use-sacred';
import { Labelled } from './widgets/Labelled';
import { ZMANIM_CITIES } from './widgets/ZmanimEditor';

interface Draft {
  name: string;
  latitude: string;
  longitude: string;
  elevation: string;
  timezone: string;
  israel: boolean;
  candleMinutes: string;
  havdalah: SacredSettings['havdalah'];
  startOffsetMinutes: string;
  endOffsetMinutes: string;
}

const text = (value: number | undefined) => (value === undefined ? '' : String(value));

function toDraft(settings: SacredSettings | null): Draft {
  return {
    name: settings?.place.name ?? '',
    latitude: text(settings?.place.latitude),
    longitude: text(settings?.place.longitude),
    elevation: text(settings?.place.elevation),
    timezone: settings?.place.timezone ?? 'Asia/Jerusalem',
    israel: settings?.place.israel ?? true,
    candleMinutes: text(settings?.candleMinutes ?? 18),
    havdalah: settings?.havdalah ?? 'tzeit',
    startOffsetMinutes: text(settings?.startOffsetMinutes ?? 0),
    endOffsetMinutes: text(settings?.endOffsetMinutes ?? 0),
  };
}

/** A number when the text is one; otherwise the text, for the server to report. */
const toNumber = (value: string): number | string => {
  const trimmed = value.trim();
  return trimmed !== '' && Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed;
};

const toBody = (draft: Draft) => ({
  place: {
    name: draft.name.trim(),
    latitude: toNumber(draft.latitude),
    longitude: toNumber(draft.longitude),
    ...(draft.elevation.trim() ? { elevation: toNumber(draft.elevation) } : {}),
    timezone: draft.timezone.trim(),
    israel: draft.israel,
  },
  candleMinutes: toNumber(draft.candleMinutes),
  havdalah: draft.havdalah,
  startOffsetMinutes: toNumber(draft.startOffsetMinutes),
  endOffsetMinutes: toNumber(draft.endOffsetMinutes),
});

/**
 * Shabbat and holidays: the organization's place and method, from which the server computes
 * when they begin and end (for rules "only on" / "not on" Shabbat and holidays).
 */
export function SacredSettingsSection({ orgId }: { orgId: string }) {
  const settings = useSacredSettings(orgId);
  if (!settings.data) return null;
  // Mounted once the saved values are known: the form keeps its own draft from then on.
  return <SacredForm orgId={orgId} settings={settings.data.settings} />;
}

function SacredForm({ orgId, settings }: { orgId: string; settings: SacredSettings | null }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const canEdit = useOrgRole(orgId, 'ADMIN').allowed;
  const [draft, setDraft] = useState(() => toDraft(settings));
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const he = i18n.language.startsWith('he');

  const save = useMutation({
    mutationFn: (body: ReturnType<typeof toBody> | null) =>
      put<{ settings: SacredSettings | null }>(`/api/v1/orgs/${orgId}/settings/sacred`, {
        settings: body,
      }),
    onSuccess: async (data) => {
      setConfirming(false);
      setMessage(data.settings ? t('sacred.saved') : t('sacred.removed'));
      queryClient.setQueryData(['sacred', orgId], data);
      await queryClient.invalidateQueries({ queryKey: ['sacred-times', orgId] });
    },
  });
  const errors = useFormErrors(save.error);
  const upcoming = useSacredTimes(orgId, null, 14, settings !== null);
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  };
  const field = (path: string) => errors.fields[path] ?? errors.fields[`settings.${path}`];

  const zone = upcoming.data?.timeZone ?? undefined;
  const when = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(zone ? { timeZone: zone } : {}),
  });
  // Without the one that has just ended (the server also sends it, for screens).
  const periods = upcoming.data?.times?.periods.filter(
    (p) => Date.parse(p.end) > upcoming.dataUpdatedAt,
  );
  const labels = { shabbat: t('sacred.shabbat'), holiday: t('sacred.holiday') };

  const numberField = (
    key: 'candleMinutes' | 'startOffsetMinutes' | 'endOffsetMinutes',
    label: string,
    hint: string,
    max: number,
  ) => (
    <Labelled label={label} error={field(key)}>
      {(props) => (
        <>
          <input
            {...props}
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            required
            dir="ltr"
            value={draft[key]}
            aria-describedby={[props['aria-describedby'], `${props.id}-hint`]
              .filter(Boolean)
              .join(' ')}
            onChange={(event) => {
              set({ [key]: event.target.value });
            }}
            className={`${inputClass} w-28`}
          />
          <p id={`${props.id}-hint`} className="text-sm text-gray-700 dark:text-gray-300">
            {hint}
          </p>
        </>
      )}
    </Labelled>
  );

  return (
    <section aria-labelledby="sacred-heading" className="mt-10 max-w-2xl">
      <h2 id="sacred-heading" className="mb-2 text-xl font-semibold">
        {t('sacred.title')}
      </h2>
      <p className="mb-2">{t('sacred.intro')}</p>
      <p className="mb-2 font-medium">
        {settings ? t('sacred.statusOn', { place: settings.place.name }) : t('sacred.statusOff')}
      </p>
      <div className="mb-4">
        <Alert variant="info">{t('sacred.disclaimer')}</Alert>
      </div>
      <div aria-live="polite" className="mb-4 empty:hidden">
        {message && <Alert variant="success">{message}</Alert>}
      </div>
      {(errors.form ?? Object.keys(errors.fields).length > 0) && (
        <div className="mb-4">
          <Alert variant={errors.form ? errors.variant : 'error'}>
            {errors.form ?? t('validation.summary')}
          </Alert>
        </div>
      )}
      <form
        noValidate
        aria-labelledby="sacred-heading"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          save.mutate(toBody(draft));
        }}
      >
        <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-4">
          <legend className="sr-only">{t('sacred.title')}</legend>
          <Labelled label={t('widgets.zmanim.city')}>
            {(props) => (
              <select
                {...props}
                value=""
                onChange={(event) => {
                  const city = ZMANIM_CITIES[Number(event.target.value)];
                  if (!city) return;
                  set({
                    name: he ? city.he : city.en,
                    latitude: String(city.latitude),
                    longitude: String(city.longitude),
                    elevation: '',
                    timezone: city.timezone,
                    israel: city.israel,
                  });
                }}
                className={`${inputClass} max-w-full bg-white sm:w-72`}
              >
                <option value="">{t('widgets.zmanim.cityChoose')}</option>
                {ZMANIM_CITIES.map((city, index) => (
                  <option key={city.en} value={String(index)}>
                    {he ? city.he : city.en}
                  </option>
                ))}
              </select>
            )}
          </Labelled>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {t('widgets.zmanim.coordsHint')}
          </p>
          <div className="flex flex-wrap items-start gap-3">
            <Labelled label={t('widgets.zmanim.placeName')} error={field('place.name')}>
              {(props) => (
                <input
                  {...props}
                  dir="auto"
                  maxLength={60}
                  required
                  value={draft.name}
                  onChange={(event) => {
                    set({ name: event.target.value });
                  }}
                  className={`${inputClass} w-56`}
                />
              )}
            </Labelled>
            <Labelled label={t('widgets.zmanim.latitude')} error={field('place.latitude')}>
              {(props) => (
                <input
                  {...props}
                  dir="ltr"
                  inputMode="decimal"
                  required
                  value={draft.latitude}
                  onChange={(event) => {
                    set({ latitude: event.target.value });
                  }}
                  className={`${inputClass} w-32`}
                />
              )}
            </Labelled>
            <Labelled label={t('widgets.zmanim.longitude')} error={field('place.longitude')}>
              {(props) => (
                <input
                  {...props}
                  dir="ltr"
                  inputMode="decimal"
                  required
                  value={draft.longitude}
                  onChange={(event) => {
                    set({ longitude: event.target.value });
                  }}
                  className={`${inputClass} w-32`}
                />
              )}
            </Labelled>
            <Labelled label={t('widgets.zmanim.elevation')} error={field('place.elevation')}>
              {(props) => (
                <input
                  {...props}
                  dir="ltr"
                  inputMode="numeric"
                  value={draft.elevation}
                  onChange={(event) => {
                    set({ elevation: event.target.value });
                  }}
                  className={`${inputClass} w-28`}
                />
              )}
            </Labelled>
            <Labelled label={t('widgets.zmanim.timezone')} error={field('place.timezone')}>
              {(props) => (
                <input
                  {...props}
                  dir="ltr"
                  maxLength={64}
                  required
                  value={draft.timezone}
                  onChange={(event) => {
                    set({ timezone: event.target.value });
                  }}
                  className={`${inputClass} w-48`}
                />
              )}
            </Labelled>
          </div>
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              className="size-4"
              checked={draft.israel}
              onChange={(event) => {
                set({ israel: event.target.checked });
              }}
            />
            {t('widgets.zmanim.israel')}
          </label>
          <div className="flex flex-wrap items-start gap-4">
            {numberField(
              'candleMinutes',
              t('widgets.fields.candleMinutes'),
              t('widgets.fields.candleMinutesHint'),
              60,
            )}
            <Labelled label={t('widgets.fields.havdalah')} error={field('havdalah')}>
              {(props) => (
                <select
                  {...props}
                  value={draft.havdalah}
                  onChange={(event) => {
                    set({ havdalah: event.target.value as Draft['havdalah'] });
                  }}
                  className={`${inputClass} max-w-full bg-white sm:w-72`}
                >
                  {HAVDALAH_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method === 'tzeit'
                        ? t('widgets.fields.havdalahTzeit')
                        : t(`widgets.fields.havdalah${method}`)}
                    </option>
                  ))}
                </select>
              )}
            </Labelled>
          </div>
          <div className="flex flex-wrap items-start gap-4">
            {numberField(
              'startOffsetMinutes',
              t('sacred.startOffset'),
              t('sacred.startOffsetHint'),
              SACRED_LIMITS.maxOffsetMinutes,
            )}
            {numberField(
              'endOffsetMinutes',
              t('sacred.endOffset'),
              t('sacred.endOffsetHint'),
              SACRED_LIMITS.maxOffsetMinutes,
            )}
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={save.isPending && !confirming}>
                {t('sacred.save')}
              </Button>
              {settings && (
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirming(true);
                  }}
                >
                  {t('sacred.remove')}
                </Button>
              )}
            </div>
          )}
        </fieldset>
      </form>

      {periods && (
        <div className="mt-6">
          <h3 className="mb-2 font-semibold">{t('sacred.upcoming', { zone: zone ?? '' })}</h3>
          {periods.length === 0 ? (
            <p>{t('sacred.upcomingEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {periods.map((period) => (
                <li key={period.start}>
                  <span className="font-medium" dir="auto">
                    {periodLabel(period, labels)}
                  </span>
                  {': '}
                  {t('sacred.range', {
                    from: when.format(new Date(period.start)),
                    to: when.format(new Date(period.end)),
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        message={t('sacred.removeConfirm')}
        confirmLabel={t('sacred.remove')}
        loading={save.isPending}
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          setMessage(null);
          save.mutate(null);
        }}
      />
    </section>
  );
}
