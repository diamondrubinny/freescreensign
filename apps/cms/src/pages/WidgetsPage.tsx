import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { isWidgetType } from '@rubinny/shared';
import { get } from '../api/client';
import type { WidgetItem, WidgetTypes } from '../api/types';
import { Alert } from '../components/Alert';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { useFormErrors } from '../lib/use-form-errors';
import { useOrgRole } from '../lib/use-org-role';

const linkClass = 'text-blue-700 underline dark:text-blue-300';

export function WidgetsPage() {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const canEdit = useOrgRole(orgId).allowed;
  const list = useQuery({
    queryKey: ['widgets', orgId],
    queryFn: () => get<{ widgets: WidgetItem[] }>(`/api/v1/orgs/${orgId}/widgets`),
  });
  const types = useQuery({
    queryKey: ['widget-types', orgId],
    queryFn: () => get<WidgetTypes>(`/api/v1/orgs/${orgId}/widget-types`),
    enabled: canEdit,
  });
  const errors = useFormErrors(list.error ?? types.error);
  const typeName = (type: string) => (isWidgetType(type) ? t(`widgets.types.${type}`) : type);

  return (
    <>
      <PageHeading title={t('widgets.title')} />
      <p className="mb-6 max-w-3xl">{t('widgets.intro')}</p>
      {errors.form && <Alert variant="error">{errors.form}</Alert>}

      {canEdit && types.data && (
        <section aria-labelledby="new-widget-heading" className="mb-8">
          <h2 id="new-widget-heading" className="mb-3 text-xl font-semibold">
            {t('widgets.create')}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {types.data.types.map(({ type, available }) =>
              isWidgetType(type) ? (
                <li
                  key={type}
                  className="flex flex-col gap-1 rounded-lg border border-gray-300 p-4 dark:border-gray-700"
                >
                  <h3 className="font-semibold">{t(`widgets.types.${type}`)}</h3>
                  <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                    {t(`widgets.descriptions.${type}`)}
                  </p>
                  {available ? (
                    <Link to={`/orgs/${orgId}/widgets/new/${type}`} className={linkClass}>
                      {t('widgets.choose')}
                      <span className="sr-only"> {t(`widgets.types.${type}`)}</span>
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{t('widgets.unavailable')}</p>
                  )}
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}

      <section aria-labelledby="widget-list-heading">
        <h2 id="widget-list-heading" className="mb-3 text-xl font-semibold">
          {t('widgets.title')}
        </h2>
        {list.isPending && <Loading />}
        {list.data?.widgets.length === 0 && <p>{t('widgets.empty')}</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.data?.widgets.map((widget) => (
            <li
              key={widget.id}
              className="rounded-lg border border-gray-300 p-4 dark:border-gray-700"
            >
              <h3 className="text-lg font-semibold" dir="auto">
                {widget.name}
              </h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {typeName(widget.type)} · {t('widgets.usage', { count: widget.usage })}
              </p>
              <Link
                to={`/orgs/${orgId}/widgets/${widget.id}`}
                className={`mt-2 inline-block ${linkClass}`}
              >
                {t('widgets.open')} <span className="sr-only">{widget.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
