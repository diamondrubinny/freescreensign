import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { get, patch } from '../api/client';
import { useRefreshSession } from '../api/session';
import type { Org } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { useFormErrors } from '../lib/use-form-errors';

export function OrgSettingsPage() {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const queryClient = useQueryClient();
  const refreshSession = useRefreshSession();
  const org = useQuery({
    queryKey: ['org', orgId],
    queryFn: () => get<{ org: Org }>(`/api/v1/orgs/${orgId}`),
  });
  const save = useMutation({
    mutationFn: (body: Partial<{ name: string; requireAdminMfa: boolean }>) =>
      patch<{ org: Org }>(`/api/v1/orgs/${orgId}`, body),
    onSuccess: async (data) => {
      queryClient.setQueryData(['org', orgId], data);
      await refreshSession();
    },
  });
  const errors = useFormErrors(save.error);

  if (org.isPending) return <Loading />;
  if (!org.data) return <Alert variant="error">{t('errors.NOT_FOUND')}</Alert>;
  const isOwner = org.data.org.role === 'OWNER';

  return (
    <>
      <PageHeading title={t('orgSettings.title')} />
      <Form
        errors={errors}
        className="max-w-lg"
        onSubmit={(data) => {
          save.mutate({
            name: value(data, 'name'),
            ...(isOwner ? { requireAdminMfa: data.get('requireAdminMfa') === 'on' } : {}),
          });
        }}
      >
        <Field
          label={t('fields.orgName')}
          name="name"
          required
          defaultValue={org.data.org.name}
          error={errors.fields.name}
        />
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              name="requireAdminMfa"
              className="size-4"
              defaultChecked={org.data.org.requireAdminMfa}
              disabled={!isOwner}
              aria-describedby="mfa-policy-hint"
            />
            {t('orgSettings.requireAdminMfa')}
          </label>
          <p id="mfa-policy-hint" className="text-sm text-gray-700 dark:text-gray-300">
            {t('orgSettings.requireAdminMfaHint')} {!isOwner && t('orgSettings.ownerOnly')}
          </p>
        </div>
        <Button type="submit" loading={save.isPending}>
          {t('common.save')}
        </Button>
        {save.isSuccess && <Alert variant="success">{t('common.saved')}</Alert>}
      </Form>
    </>
  );
}
