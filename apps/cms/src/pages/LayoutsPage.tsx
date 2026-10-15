import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { LAYOUT_TEMPLATE_IDS, templateZones, type LayoutTemplateId } from '@rubinny/shared';
import { get, post } from '../api/client';
import type { LayoutDetail, LayoutSummary } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { useFormErrors } from '../lib/use-form-errors';
import type { Messages } from '../i18n/locales/he';
import { useOrgRole } from '../lib/use-org-role';

type ZoneNameKey = keyof Messages['layouts']['zoneNames'];

const CANVAS = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
} as const;

const selectClass = 'rounded-md border border-gray-500 bg-white px-3 py-2 dark:bg-gray-900';

export function LayoutsPage() {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const navigate = useNavigate();
  const canEdit = useOrgRole(orgId).allowed;
  const list = useQuery({
    queryKey: ['layouts', orgId],
    queryFn: () => get<{ layouts: LayoutSummary[] }>(`/api/v1/orgs/${orgId}/layouts`),
  });
  const create = useMutation({
    mutationFn: (input: {
      name: string;
      template: LayoutTemplateId;
      orientation: keyof typeof CANVAS;
    }) => {
      const canvas = CANVAS[input.orientation];
      const zones = templateZones(input.template, canvas).map((zone) => ({
        ...zone,
        name: t(`layouts.zoneNames.${zone.name as ZoneNameKey}`),
      }));
      return post<{ layout: LayoutDetail }>(`/api/v1/orgs/${orgId}/layouts`, {
        name: input.name,
        ...canvas,
        background: '#000000',
        zones,
      });
    },
    onSuccess: ({ layout }) => {
      void navigate(`/orgs/${orgId}/layouts/${layout.id}`);
    },
  });
  const errors = useFormErrors(create.error);
  const listErrors = useFormErrors(list.error);

  return (
    <>
      <PageHeading title={t('layouts.title')} />
      <p className="mb-6 max-w-3xl">{t('layouts.intro')}</p>
      {listErrors.form && <Alert variant="error">{listErrors.form}</Alert>}

      {canEdit && (
        <section aria-labelledby="create-layout-heading" className="mb-8 max-w-lg">
          <h2 id="create-layout-heading" className="mb-3 text-xl font-semibold">
            {t('layouts.create')}
          </h2>
          <Form
            errors={errors}
            labelledBy="create-layout-heading"
            onSubmit={(data) => {
              create.mutate({
                name: value(data, 'name'),
                template: value(data, 'template') as LayoutTemplateId,
                orientation: value(data, 'orientation') === 'portrait' ? 'portrait' : 'landscape',
              });
            }}
          >
            <Field label={t('layouts.name')} name="name" required error={errors.fields.name} />
            <div className="flex flex-col gap-1">
              <label htmlFor="layout-template" className="font-medium">
                {t('layouts.template')}
              </label>
              <select
                id="layout-template"
                name="template"
                defaultValue="main-ticker"
                className={selectClass}
              >
                {LAYOUT_TEMPLATE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {t(`layouts.templates.${id}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="layout-orientation" className="font-medium">
                {t('layouts.orientation')}
              </label>
              <select
                id="layout-orientation"
                name="orientation"
                defaultValue="landscape"
                className={selectClass}
              >
                <option value="landscape">{t('layouts.landscape')}</option>
                <option value="portrait">{t('layouts.portrait')}</option>
              </select>
            </div>
            <Button type="submit" loading={create.isPending}>
              {t('layouts.create')}
            </Button>
          </Form>
        </section>
      )}

      {list.isPending && <Loading />}
      {list.data?.layouts.length === 0 && <p>{t('layouts.empty')}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.data?.layouts.map((layout) => (
          <li
            key={layout.id}
            className="rounded-lg border border-gray-300 p-4 dark:border-gray-700"
          >
            <h3 className="text-lg font-semibold" dir="auto">
              {layout.name}
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('layouts.summary', {
                width: layout.width,
                height: layout.height,
                zones: layout.zoneCount,
                screens: layout.screenCount,
              })}
            </p>
            <Link
              to={`/orgs/${orgId}/layouts/${layout.id}`}
              className="mt-2 inline-block text-blue-700 underline dark:text-blue-300"
            >
              {t('layouts.open')} <span className="sr-only">{layout.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
