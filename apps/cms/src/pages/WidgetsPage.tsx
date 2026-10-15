import { useQuery } from '@tanstack/react-query';
import { Blocks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { isWidgetType } from '@rubinny/shared';
import { get } from '../api/client';
import type { WidgetItem, WidgetTypes } from '../api/types';
import { Alert } from '../components/Alert';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { Card, EmptyState, IconTile, SectionHeading, linkClass } from '../components/ui';
import { widgetIcon } from '../components/widget-icons';
import { useFormErrors } from '../lib/use-form-errors';
import { useOrgRole } from '../lib/use-org-role';

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
      <PageHeading title={t('widgets.title')} description={t('widgets.intro')} />
      {errors.form && (
        <div className="mb-6">
          <Alert variant="error">{errors.form}</Alert>
        </div>
      )}

      {canEdit && types.data && (
        <section aria-labelledby="new-widget-heading" className="mb-10">
          <SectionHeading id="new-widget-heading" title={t('widgets.create')} />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {types.data.types.map(({ type, available }) => {
              if (!isWidgetType(type)) return null;
              const { icon, tone } = widgetIcon(type);
              return (
                <Card
                  as="li"
                  key={type}
                  className={`relative flex flex-col gap-2 p-4 ${available ? 'transition-shadow focus-within:shadow-md hover:shadow-md' : 'opacity-75'}`}
                >
                  <IconTile icon={icon} tone={tone} />
                  <h3 className="font-bold">{t(`widgets.types.${type}`)}</h3>
                  <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                    {t(`widgets.descriptions.${type}`)}
                  </p>
                  {available ? (
                    <Link
                      to={`/orgs/${orgId}/widgets/new/${type}`}
                      className={`${linkClass} after:absolute after:inset-0 after:content-['']`}
                    >
                      {t('widgets.choose')}
                      <span className="sr-only">{` ${t(`widgets.types.${type}`)}`}</span>
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{t('widgets.unavailable')}</p>
                  )}
                </Card>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="widget-list-heading">
        <SectionHeading id="widget-list-heading" title={t('widgets.title')} />
        {list.isPending && <Loading />}
        {list.data?.widgets.length === 0 && <EmptyState icon={Blocks} title={t('widgets.empty')} />}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data?.widgets.map((widget) => {
            const { icon, tone } = widgetIcon(widget.type);
            return (
              <Card as="li" key={widget.id} className="flex items-start gap-4 p-4">
                <IconTile icon={icon} tone={tone} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-bold" dir="auto">
                    {widget.name}
                  </h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {typeName(widget.type)} · {t('widgets.usage', { count: widget.usage })}
                  </p>
                  <Link
                    to={`/orgs/${orgId}/widgets/${widget.id}`}
                    className={`mt-1 inline-block ${linkClass}`}
                  >
                    {t('widgets.open')} <span className="sr-only">{widget.name}</span>
                  </Link>
                </div>
              </Card>
            );
          })}
        </ul>
      </section>
    </>
  );
}
