import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { hasRole } from '@rubinny/shared';
import { post } from '../api/client';
import { useRefreshSession, useSession } from '../api/session';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { PageHeading } from '../components/PageHeading';
import { useFormErrors } from '../lib/use-form-errors';

export function DashboardPage() {
  const { t } = useTranslation();
  const session = useSession().data;
  const refresh = useRefreshSession();
  const [showCreate, setShowCreate] = useState(false);
  const create = useMutation({
    mutationFn: (name: string) => post('/api/v1/orgs', { name }),
    onSuccess: async () => {
      setShowCreate(false);
      await refresh();
    },
  });
  const errors = useFormErrors(create.error);
  if (!session) return null;

  return (
    <>
      <PageHeading title={t('dashboard.title')} />
      <p className="mb-6 text-lg">{t('dashboard.welcome', { name: session.user.name })}</p>

      {!session.user.mfaEnabled && (
        <div className="mb-6">
          <Alert variant="warning">
            <p>{t('dashboard.mfaWarning')}</p>
            <Link to="/account" className="font-semibold underline">
              {t('dashboard.enableMfa')}
            </Link>
          </Alert>
        </div>
      )}

      <section aria-labelledby="orgs-heading" className="mb-8">
        <h2 id="orgs-heading" className="mb-3 text-xl font-semibold">
          {t('dashboard.myOrgs')}
        </h2>
        {session.memberships.length === 0 ? (
          <p>{t('dashboard.noOrgs')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {session.memberships.map((org) => (
              <li
                key={org.orgId}
                className="rounded-lg border border-gray-300 p-4 dark:border-gray-700"
              >
                <h3 className="text-lg font-semibold">{org.name}</h3>
                <p className="text-gray-700 dark:text-gray-300">
                  {t('fields.role')}: {t(`roles.${org.role}`)}
                </p>
                {hasRole(org.role, 'ADMIN') && (
                  <Link
                    to={`/orgs/${org.orgId}/members`}
                    className="mt-2 inline-block text-blue-700 underline dark:text-blue-300"
                  >
                    {t('dashboard.open')} <span className="sr-only">{org.name}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          {showCreate ? (
            <Form
              errors={errors}
              onSubmit={(data) => {
                create.mutate(value(data, 'name'));
              }}
              className="max-w-md"
            >
              <Field label={t('fields.orgName')} name="name" required error={errors.fields.name} />
              <div className="flex gap-2">
                <Button type="submit" loading={create.isPending}>
                  {t('dashboard.createOrg')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCreate(false);
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </Form>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreate(true);
              }}
            >
              {t('dashboard.createOrg')}
            </Button>
          )}
        </div>
      </section>

      <section aria-labelledby="next-heading">
        <h2 id="next-heading" className="mb-2 text-xl font-semibold">
          {t('dashboard.nextSteps')}
        </h2>
        <p>{t('dashboard.nextStepsText')}</p>
      </section>
    </>
  );
}
