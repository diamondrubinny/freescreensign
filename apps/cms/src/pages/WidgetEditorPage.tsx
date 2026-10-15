import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { isWidgetType, type RssData, type WeatherData, type WidgetType } from '@rubinny/shared';
import { del, get, patch, post } from '../api/client';
import type { WidgetData, WidgetItem, WidgetTypes } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import type { FormErrors } from '../lib/api-errors';
import { formatDateTime } from '../lib/format';
import { useFormErrors } from '../lib/use-form-errors';
import { useDuplicate } from '../lib/use-duplicate';
import { useOrgRole } from '../lib/use-org-role';
import { DesignPage } from './design/DesignPage';
import {
  WIDGET_FIELDS,
  readWidgetConfig,
  widgetDefaults,
  type WidgetFieldSpec,
} from './widget-fields';

const inputClass =
  'rounded-md border px-3 py-2 text-gray-900 dark:bg-gray-900 dark:text-gray-100 border-gray-500';

function ConfigField({
  field,
  initial,
  error,
}: {
  field: WidgetFieldSpec;
  initial: unknown;
  error: string | undefined;
}) {
  const { t } = useTranslation();
  const id = useId();
  const label = t(`widgets.fields.${field.label}`);
  const hint = field.hint ? t(`widgets.fields.${field.hint}`) : undefined;
  const describedBy =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    name: field.key,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  } as const;
  const text = typeof initial === 'string' || typeof initial === 'number' ? String(initial) : '';

  if (field.kind === 'checkbox') {
    return (
      <div className="flex items-center gap-2">
        <input {...common} type="checkbox" defaultChecked={initial === true} className="h-5 w-5" />
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
      </div>
    );
  }

  let control;
  if (field.kind === 'select') {
    control = (
      <select {...common} defaultValue={text} className={`${inputClass} bg-white`}>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {t(`widgets.fields.${option.label}`)}
          </option>
        ))}
      </select>
    );
  } else if (field.kind === 'textarea') {
    control = (
      <textarea
        {...common}
        required={field.required}
        maxLength={field.maxLength}
        rows={3}
        dir="auto"
        defaultValue={text}
        className={inputClass}
      />
    );
  } else if (field.kind === 'number') {
    const scaled = typeof initial === 'number' ? String(initial / (field.scale ?? 1)) : text;
    control = (
      <input
        {...common}
        type="number"
        inputMode="decimal"
        min={field.min}
        max={field.max}
        step={field.step}
        required={field.required}
        defaultValue={scaled}
        dir="ltr"
        className={`${inputClass} max-w-40`}
      />
    );
  } else if (field.kind === 'color') {
    control = (
      <input
        {...common}
        type="color"
        defaultValue={text || '#000000'}
        className="h-10 w-20 rounded-md border border-gray-500"
      />
    );
  } else {
    control = (
      <input
        {...common}
        type={field.kind === 'url' ? 'url' : field.kind === 'datetime' ? 'datetime-local' : 'text'}
        required={field.required}
        maxLength={field.maxLength}
        dir={field.ltr ? 'ltr' : 'auto'}
        defaultValue={text}
        className={inputClass}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
        {'required' in field && field.required && (
          <span aria-hidden="true" className="text-red-700 dark:text-red-400">
            {' '}
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-gray-700 dark:text-gray-300">
          {hint}
        </p>
      )}
      {control}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-red-800 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

function DataPreview({ orgId, widget }: { orgId: string; widget: WidgetItem }) {
  const { t, i18n } = useTranslation();
  const preview = useQuery({
    queryKey: ['widget-data', orgId, widget.id, widget.updatedAt],
    queryFn: () => get<WidgetData>(`/api/v1/orgs/${orgId}/widgets/${widget.id}/data`),
    enabled: false,
    retry: false,
  });
  const errors = useFormErrors(preview.error);
  const result = preview.data;

  return (
    <section aria-labelledby="preview-heading" className="mb-8 max-w-2xl">
      <h2 id="preview-heading" className="mb-1 text-xl font-semibold">
        {t('widgets.preview')}
      </h2>
      <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">{t('widgets.previewHint')}</p>
      <Button
        variant="secondary"
        loading={preview.isFetching}
        onClick={() => {
          void preview.refetch();
        }}
      >
        {t('widgets.previewLoad')}
      </Button>
      <div aria-live="polite" className="mt-3">
        {errors.form && <Alert variant="error">{errors.form}</Alert>}
        {result && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="mb-2 text-sm">
              {result.stale
                ? t('widgets.stale', { when: formatDateTime(result.fetchedAt, i18n.language) })
                : t('widgets.fetchedAt', { when: formatDateTime(result.fetchedAt, i18n.language) })}
            </p>
            {result.type === 'rss' ? (
              <RssPreview data={result.data as RssData} />
            ) : (
              <WeatherPreview data={result.data as WeatherData} />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function RssPreview({ data }: { data: RssData }) {
  const { t } = useTranslation();
  return (
    <>
      {data.title && (
        <p className="font-semibold" dir="auto">
          {data.title}
        </p>
      )}
      {data.items.length === 0 ? (
        <p>{t('widgets.noHeadlines')}</p>
      ) : (
        <ul className="list-disc ps-6">
          {data.items.map((item, index) => (
            <li key={String(index)} dir="auto">
              {item.title}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function WeatherPreview({ data }: { data: WeatherData }) {
  const { t } = useTranslation();
  const unit = data.units === 'imperial' ? '°F' : '°C';
  return (
    <>
      <p>
        {t('widgets.weatherNow', { temperature: `${String(data.current.temperature)}${unit}` })}
      </p>
      <ul className="ps-6">
        {data.daily.map((day) => (
          <li key={day.date}>
            <span dir="ltr">
              {day.date}: {day.max}° / {day.min}°
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm" dir="ltr">
        {data.attribution}
      </p>
    </>
  );
}

function configErrors(errors: FormErrors): Record<string, string> {
  return Object.fromEntries(
    Object.entries(errors.fields)
      .filter(([path]) => path.startsWith('config.'))
      .map(([path, message]) => [path.slice('config.'.length), message]),
  );
}

export function WidgetEditorPage() {
  const { t } = useTranslation();
  const { orgId = '', widgetId, type: newType } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEdit = useOrgRole(orgId).allowed;
  const isNew = widgetId === undefined;
  const location = useLocation();
  const justCreated = (location.state as { created?: boolean } | null)?.created === true;

  const existing = useQuery({
    queryKey: ['widget', orgId, widgetId],
    queryFn: () => get<{ widget: WidgetItem }>(`/api/v1/orgs/${orgId}/widgets/${widgetId ?? ''}`),
    enabled: !isNew,
  });
  const types = useQuery({
    queryKey: ['widget-types', orgId],
    queryFn: () => get<WidgetTypes>(`/api/v1/orgs/${orgId}/widget-types`),
  });

  const save = useMutation({
    mutationFn: (body: { name: string; config: Record<string, unknown> }) =>
      isNew
        ? post<{ widget: WidgetItem }>(`/api/v1/orgs/${orgId}/widgets`, { ...body, type: newType })
        : patch<{ widget: WidgetItem }>(`/api/v1/orgs/${orgId}/widgets/${widgetId}`, body),
    onSuccess: async ({ widget }) => {
      await queryClient.invalidateQueries({ queryKey: ['widgets', orgId] });
      queryClient.setQueryData(['widget', orgId, widget.id], { widget });
      if (isNew) void navigate(`/orgs/${orgId}/widgets/${widget.id}`, { state: { created: true } });
    },
  });
  const [deleting, setDeleting] = useState(false);
  const remove = useMutation({
    mutationFn: () => del(`/api/v1/orgs/${orgId}/widgets/${widgetId ?? ''}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['widgets', orgId] });
      void navigate(`/orgs/${orgId}/widgets`);
    },
  });

  const duplicate = useDuplicate(orgId, 'widgets', widgetId ?? '');
  const errors = useFormErrors(save.error);
  const loadErrors = useFormErrors(existing.error ?? remove.error ?? duplicate.error);

  if (!isNew && existing.isPending) return <Loading />;
  const widget = existing.data?.widget;
  const type = isNew ? newType : widget?.type;
  if (!type || !isWidgetType(type)) {
    return <Alert variant="error">{loadErrors.form ?? t('errors.NOT_FOUND')}</Alert>;
  }
  const widgetType: WidgetType = type;
  if (widgetType === 'design') {
    return (
      <>
        <PageHeading
          title={
            isNew
              ? t('widgets.createTitle', { type: t('widgets.types.design') })
              : `${t('widgets.editTitle')}: ${widget?.name ?? ''}`
          }
        />
        <p className="mb-6">
          <Link
            to={`/orgs/${orgId}/widgets`}
            className="text-brand-700 underline dark:text-brand-300"
          >
            {t('widgets.back')}
          </Link>
        </p>
        <DesignPage orgId={orgId} widget={widget} canEdit={canEdit} key={widget?.id ?? 'new'} />
      </>
    );
  }
  const initial = widget?.config ?? widgetDefaults(widgetType);
  const fieldErrors = configErrors(errors);
  const typeLabel = t(`widgets.types.${widgetType}`);

  return (
    <>
      <PageHeading
        title={
          isNew
            ? t('widgets.createTitle', { type: typeLabel })
            : `${t('widgets.editTitle')}: ${widget?.name ?? ''}`
        }
      />
      <p className="mb-6">
        <Link
          to={`/orgs/${orgId}/widgets`}
          className="text-brand-700 underline dark:text-brand-300"
        >
          {t('widgets.back')}
        </Link>
      </p>
      {widgetType === 'weather' && (
        <div className="mb-4 max-w-2xl">
          <Alert variant="info">
            {types.data?.weather.enabled
              ? t('widgets.weatherAttribution')
              : t('widgets.weatherDisabled')}
          </Alert>
        </div>
      )}
      {widgetType === 'rss' && <p className="mb-4 max-w-2xl text-sm">{t('widgets.rssPrivacy')}</p>}

      <Form
        key={widget?.updatedAt ?? 'new'}
        errors={errors}
        className="mb-8 max-w-2xl"
        onSubmit={(data) => {
          save.mutate({ name: value(data, 'name'), config: readWidgetConfig(widgetType, data) });
        }}
      >
        <fieldset disabled={!canEdit} className="flex flex-col gap-4">
          <legend className="sr-only">{typeLabel}</legend>
          <Field
            label={t('widgets.name')}
            name="name"
            required
            maxLength={200}
            defaultValue={widget?.name ?? typeLabel}
            error={errors.fields.name}
          />
          {WIDGET_FIELDS[widgetType].map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              initial={initial[field.key]}
              error={fieldErrors[field.key]}
            />
          ))}
        </fieldset>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={save.isPending}>
              {isNew ? t('widgets.create') : t('widgets.save')}
            </Button>
            {(save.isSuccess || justCreated) && !isNew && (
              <Alert variant="success">{t('widgets.saved')}</Alert>
            )}
          </div>
        )}
      </Form>

      {widget && (widget.type === 'rss' || widget.type === 'weather') && (
        <DataPreview orgId={orgId} widget={widget} />
      )}

      {widget && canEdit && (
        <>
          {loadErrors.form && <Alert variant="error">{loadErrors.form}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={duplicate.isPending}
              onClick={() => {
                duplicate.mutate(widget.name);
              }}
            >
              {t('widgets.duplicate')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDeleting(true);
              }}
            >
              {t('widgets.delete')}
            </Button>
          </div>
          <ConfirmDialog
            open={deleting}
            message={t('widgets.deleteConfirm', { name: widget.name })}
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
