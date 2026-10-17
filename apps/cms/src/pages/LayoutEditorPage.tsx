import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { LAYOUT_LIMITS, TOUCH_LIMITS } from '@rubinny/shared';
import { del, get, patch } from '../api/client';
import type {
  LayoutDetail,
  LayoutSummary,
  LayoutZone,
  PlaylistSummary,
  ZoneAction,
} from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { useFormErrors } from '../lib/use-form-errors';
import { useDuplicate } from '../lib/use-duplicate';
import { useOrgRole } from '../lib/use-org-role';

interface Draft {
  name: string;
  width: number;
  height: number;
  background: string;
  idleSeconds: number;
  zones: LayoutZone[];
}

/** Select value of a zone's tap action. */
function actionValue(action: ZoneAction | null | undefined): string {
  if (!action) return '';
  return action.type === 'back' ? 'back' : `layout:${action.layoutId}`;
}

function parseAction(value: string): ZoneAction | null {
  if (value === 'back') return { type: 'back' };
  if (value.startsWith('layout:')) return { type: 'layout', layoutId: value.slice(7) };
  return null;
}

const inputClass =
  'rounded-md border px-2 py-1 text-gray-900 dark:bg-gray-900 dark:text-gray-100 border-gray-500';

function NumberInput(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  error: string | undefined;
  describedBy?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.id} className="text-sm font-medium">
        {props.label}
      </label>
      <input
        id={props.id}
        type="number"
        inputMode="numeric"
        min={props.min}
        max={props.max}
        step={1}
        dir="ltr"
        value={Number.isFinite(props.value) ? props.value : ''}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={
          [props.error ? `${props.id}-error` : '', props.describedBy ?? '']
            .filter(Boolean)
            .join(' ') || undefined
        }
        onChange={(event) => {
          props.onChange(event.target.value === '' ? Number.NaN : Number(event.target.value));
        }}
        className={`${inputClass} w-28 ${props.error ? 'border-red-700 dark:border-red-400' : ''}`}
      />
      {props.error && (
        <p id={`${props.id}-error`} className="text-sm font-medium text-red-800 dark:text-red-300">
          {props.error}
        </p>
      )}
    </div>
  );
}

/** Visual aid only; all editing happens in the form, which is keyboard and screen-reader friendly. */
function LayoutPreview({ draft }: { draft: Draft }) {
  const { t } = useTranslation();
  const valid = draft.width > 0 && draft.height > 0;
  const percent = (value: number, total: number) => `${String((value / total) * 100)}%`;
  return (
    <figure className="mb-6">
      <figcaption className="mb-2 font-semibold">{t('layouts.preview')}</figcaption>
      <div
        role="img"
        aria-label={t('layouts.previewLabel', {
          zones: draft.zones.map((zone) => zone.name).join(', '),
        })}
        dir="ltr"
        className="relative w-full max-w-xl overflow-hidden border border-gray-500"
        style={{
          aspectRatio: valid ? `${String(draft.width)} / ${String(draft.height)}` : '16 / 9',
          background: draft.background,
          maxHeight: '28rem',
        }}
      >
        {valid &&
          draft.zones.map((zone, index) => (
            <div
              key={String(index)}
              className="absolute flex items-center justify-center overflow-hidden border-2 border-dashed border-yellow-300 bg-brand-900/60 p-1 text-center text-xs font-semibold text-white"
              style={{
                left: percent(zone.x, draft.width),
                top: percent(zone.y, draft.height),
                width: percent(zone.w, draft.width),
                height: percent(zone.h, draft.height),
                zIndex: zone.z,
              }}
            >
              <span dir="auto">
                {index + 1}. {zone.name}
              </span>
            </div>
          ))}
      </div>
    </figure>
  );
}

export function LayoutEditorPage() {
  const { t } = useTranslation();
  const { orgId = '', layoutId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEdit = useOrgRole(orgId).allowed;

  const detail = useQuery({
    queryKey: ['layout', orgId, layoutId],
    queryFn: () => get<{ layout: LayoutDetail }>(`/api/v1/orgs/${orgId}/layouts/${layoutId}`),
  });
  const playlists = useQuery({
    queryKey: ['playlists', orgId],
    queryFn: () => get<{ playlists: PlaylistSummary[] }>(`/api/v1/orgs/${orgId}/playlists`),
  });
  const layouts = useQuery({
    queryKey: ['layouts', orgId],
    queryFn: () => get<{ layouts: LayoutSummary[] }>(`/api/v1/orgs/${orgId}/layouts`),
  });

  // Local editable copy (null = show the server version); saved in one PATCH.
  const [edited, setEdited] = useState<Draft | null>(null);
  const save = useMutation({
    mutationFn: (draft: Draft) =>
      patch<{ layout: LayoutDetail }>(`/api/v1/orgs/${orgId}/layouts/${layoutId}`, {
        name: draft.name,
        width: draft.width,
        height: draft.height,
        background: draft.background,
        idleSeconds: draft.idleSeconds,
        zones: draft.zones.map(({ name, x, y, w, h, z, playlistId, action, label }) => ({
          name,
          x,
          y,
          w,
          h,
          z,
          playlistId,
          action: action ?? null,
          label: action ? label?.trim() || null : null,
        })),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['layout', orgId, layoutId], data);
      setEdited(null);
      void queryClient.invalidateQueries({ queryKey: ['layouts', orgId] });
    },
  });
  const [deleting, setDeleting] = useState(false);
  const remove = useMutation({
    mutationFn: () => del(`/api/v1/orgs/${orgId}/layouts/${layoutId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['layouts', orgId] });
      void navigate(`/orgs/${orgId}/layouts`);
    },
  });
  const duplicate = useDuplicate(orgId, 'layouts', layoutId);
  const errors = useFormErrors(save.error);
  const loadErrors = useFormErrors(detail.error ?? remove.error ?? duplicate.error);

  if (detail.isPending) return <Loading />;
  if (!detail.data)
    return <Alert variant="error">{loadErrors.form ?? t('errors.NOT_FOUND')}</Alert>;
  const layout = detail.data.layout;
  const draft: Draft = edited ?? {
    name: layout.name,
    width: layout.width,
    height: layout.height,
    background: layout.background,
    idleSeconds: layout.idleSeconds,
    zones: layout.zones,
  };
  const dirty = edited !== null;
  const update = (patchDraft: Partial<Draft>) => {
    setEdited({ ...draft, ...patchDraft });
  };
  const updateZone = (index: number, patchZone: Partial<LayoutZone>) => {
    update({
      zones: draft.zones.map((zone, i) => (i === index ? { ...zone, ...patchZone } : zone)),
    });
  };
  const fieldError = (path: string) => errors.fields[path];

  return (
    <>
      <PageHeading title={`${t('layouts.editorTitle')}: ${layout.name}`} />
      <p className="mb-6">
        <Link
          to={`/orgs/${orgId}/layouts`}
          className="text-brand-700 underline dark:text-brand-300"
        >
          {t('layouts.title')}
        </Link>
      </p>
      {layout.screens.length > 0 && (
        <p className="mb-6">
          {t('layouts.screens')}: {layout.screens.map((s) => s.name).join(', ')}
        </p>
      )}

      <LayoutPreview draft={draft} />

      <form
        noValidate
        aria-labelledby="layout-form-heading"
        className="mb-8 flex max-w-4xl flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(draft);
        }}
      >
        <h2 id="layout-form-heading" className="sr-only">
          {t('layouts.editorTitle')}
        </h2>
        {(errors.form ?? Object.keys(errors.fields).length > 0) && (
          <Alert variant={errors.form ? errors.variant : 'error'}>
            {errors.form ?? t('validation.summary')}
          </Alert>
        )}
        <fieldset disabled={!canEdit} className="flex flex-col gap-6">
          <legend className="sr-only">{t('layouts.editorTitle')}</legend>
          <div className="flex flex-col gap-1">
            <label htmlFor="layout-name" className="font-medium">
              {t('layouts.name')}
            </label>
            <input
              id="layout-name"
              required
              maxLength={200}
              dir="auto"
              value={draft.name}
              aria-invalid={fieldError('name') ? true : undefined}
              aria-describedby={fieldError('name') ? 'layout-name-error' : undefined}
              onChange={(event) => {
                update({ name: event.target.value });
              }}
              className={`${inputClass} max-w-lg py-2`}
            />
            {fieldError('name') && (
              <p
                id="layout-name-error"
                className="text-sm font-medium text-red-800 dark:text-red-300"
              >
                {fieldError('name')}
              </p>
            )}
          </div>

          <fieldset className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4 dark:border-gray-800 dark:bg-gray-900">
            <legend className="px-1 font-semibold">{t('layouts.canvas')}</legend>
            <NumberInput
              id="layout-width"
              label={t('layouts.width')}
              value={draft.width}
              min={1}
              max={LAYOUT_LIMITS.maxCanvas}
              error={fieldError('width')}
              onChange={(width) => {
                update({ width });
              }}
            />
            <NumberInput
              id="layout-height"
              label={t('layouts.height')}
              value={draft.height}
              min={1}
              max={LAYOUT_LIMITS.maxCanvas}
              error={fieldError('height')}
              onChange={(height) => {
                update({ height });
              }}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="layout-background" className="text-sm font-medium">
                {t('layouts.background')}
              </label>
              <input
                id="layout-background"
                type="color"
                value={draft.background}
                onChange={(event) => {
                  update({ background: event.target.value });
                }}
                className="h-9 w-20 rounded-md border border-gray-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <NumberInput
                id="layout-idle"
                label={t('layouts.idleSeconds')}
                value={draft.idleSeconds}
                min={TOUCH_LIMITS.minIdleSeconds}
                max={TOUCH_LIMITS.maxIdleSeconds}
                error={fieldError('idleSeconds')}
                describedBy="layout-idle-hint"
                onChange={(idleSeconds) => {
                  update({ idleSeconds });
                }}
              />
              <p id="layout-idle-hint" className="text-sm text-gray-700 dark:text-gray-300">
                {t('layouts.idleHint')}
              </p>
            </div>
          </fieldset>

          <section aria-labelledby="zones-heading" className="flex flex-col gap-4">
            <h2 id="zones-heading" className="text-xl font-semibold">
              {t('layouts.zones')}
            </h2>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('layouts.coordinatesHint')}
            </p>
            {draft.zones.map((zone, index) => {
              const prefix = `zones.${String(index)}`;
              const id = (key: string) => `zone-${String(index)}-${key}`;
              return (
                <fieldset
                  key={String(index)}
                  className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4 dark:border-gray-800 dark:bg-gray-900"
                >
                  <legend className="px-1 font-semibold">
                    {t('layouts.zone', { index: index + 1 })}: <span dir="auto">{zone.name}</span>
                  </legend>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={id('name')} className="text-sm font-medium">
                      {t('layouts.zoneName')}
                    </label>
                    <input
                      id={id('name')}
                      maxLength={100}
                      dir="auto"
                      value={zone.name}
                      aria-invalid={fieldError(`${prefix}.name`) ? true : undefined}
                      onChange={(event) => {
                        updateZone(index, { name: event.target.value });
                      }}
                      className={`${inputClass} w-40`}
                    />
                  </div>
                  {(['x', 'y', 'w', 'h'] as const).map((key) => (
                    <NumberInput
                      key={key}
                      id={id(key)}
                      label={t(`layouts.${key}`)}
                      value={zone[key]}
                      min={key === 'w' || key === 'h' ? 1 : 0}
                      max={LAYOUT_LIMITS.maxCanvas}
                      error={fieldError(`${prefix}.${key}`)}
                      onChange={(next) => {
                        updateZone(index, { [key]: next });
                      }}
                    />
                  ))}
                  <NumberInput
                    id={id('z')}
                    label={t('layouts.z')}
                    value={zone.z}
                    min={0}
                    max={LAYOUT_LIMITS.maxZ}
                    error={fieldError(`${prefix}.z`)}
                    onChange={(z) => {
                      updateZone(index, { z });
                    }}
                  />
                  <div className="flex flex-col gap-1">
                    <label htmlFor={id('playlist')} className="text-sm font-medium">
                      {t('layouts.playlist')}
                    </label>
                    <select
                      id={id('playlist')}
                      value={zone.playlistId ?? ''}
                      aria-invalid={fieldError(`${prefix}.playlistId`) ? true : undefined}
                      onChange={(event) => {
                        updateZone(index, { playlistId: event.target.value || null });
                      }}
                      className={`${inputClass} bg-white py-1.5`}
                    >
                      <option value="">{t('layouts.noPlaylist')}</option>
                      {playlists.data?.playlists.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={id('action')} className="text-sm font-medium">
                      {t('layouts.onTap')}
                    </label>
                    <select
                      id={id('action')}
                      value={actionValue(zone.action)}
                      aria-invalid={fieldError(`${prefix}.action.layoutId`) ? true : undefined}
                      aria-describedby={
                        fieldError(`${prefix}.action.layoutId`) ? id('action-error') : undefined
                      }
                      onChange={(event) => {
                        updateZone(index, { action: parseAction(event.target.value) });
                      }}
                      className={`${inputClass} bg-white py-1.5`}
                    >
                      <option value="">{t('layouts.tapNone')}</option>
                      <option value="back">{t('layouts.tapBack')}</option>
                      {layouts.data?.layouts
                        .filter((l) => l.id !== layoutId)
                        .map((l) => (
                          <option key={l.id} value={`layout:${l.id}`}>
                            {t('layouts.tapOpen', { name: l.name })}
                          </option>
                        ))}
                    </select>
                    {fieldError(`${prefix}.action.layoutId`) && (
                      <p
                        id={id('action-error')}
                        className="text-sm font-medium text-red-800 dark:text-red-300"
                      >
                        {fieldError(`${prefix}.action.layoutId`)}
                      </p>
                    )}
                  </div>
                  {zone.action && (
                    <div className="flex flex-col gap-1">
                      <label htmlFor={id('label')} className="text-sm font-medium">
                        {t('layouts.tapLabel')}
                      </label>
                      <input
                        id={id('label')}
                        maxLength={100}
                        dir="auto"
                        value={zone.label ?? ''}
                        aria-describedby={id('label-hint')}
                        onChange={(event) => {
                          updateZone(index, { label: event.target.value });
                        }}
                        className={`${inputClass} w-48`}
                      />
                      <p id={id('label-hint')} className="text-sm text-gray-700 dark:text-gray-300">
                        {t('layouts.tapLabelHint')}
                      </p>
                    </div>
                  )}
                  {zone.action && Math.min(zone.w, zone.h) < TOUCH_LIMITS.minTargetPx * 2 && (
                    <p className="basis-full text-sm font-medium text-amber-900 dark:text-amber-200">
                      {t('layouts.tapSmall')}
                    </p>
                  )}
                  {canEdit && draft.zones.length > 1 && (
                    <Button
                      variant="secondary"
                      aria-label={t('layouts.removeZone', { name: zone.name })}
                      onClick={() => {
                        update({ zones: draft.zones.filter((_, i) => i !== index) });
                      }}
                    >
                      <span aria-hidden="true">✕</span>
                    </Button>
                  )}
                </fieldset>
              );
            })}
            {canEdit && draft.zones.length < LAYOUT_LIMITS.maxZones && (
              <div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const size = (total: number) =>
                      Number.isFinite(total) && total > 1 ? Math.round(total / 4) : 1;
                    update({
                      zones: [
                        ...draft.zones,
                        {
                          name: t('layouts.zone', { index: draft.zones.length + 1 }),
                          x: 0,
                          y: 0,
                          w: size(draft.width),
                          h: size(draft.height),
                          z: Math.min(draft.zones.length, LAYOUT_LIMITS.maxZ),
                          playlistId: null,
                        },
                      ],
                    });
                  }}
                >
                  {t('layouts.addZone')}
                </Button>
              </div>
            )}
          </section>
        </fieldset>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={save.isPending} disabled={!dirty}>
              {t('layouts.save')}
            </Button>
            {dirty && <span role="status">{t('layouts.unsaved')}</span>}
            {save.isSuccess && !dirty && <Alert variant="success">{t('layouts.saved')}</Alert>}
          </div>
        )}
      </form>

      {canEdit && (
        <>
          {loadErrors.form && <Alert variant={loadErrors.variant}>{loadErrors.form}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={duplicate.isPending}
              onClick={() => {
                duplicate.mutate(layout.name);
              }}
            >
              {t('layouts.duplicate')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDeleting(true);
              }}
            >
              {t('layouts.delete')}
            </Button>
          </div>
          <ConfirmDialog
            open={deleting}
            message={t('layouts.deleteConfirm', { name: layout.name })}
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
