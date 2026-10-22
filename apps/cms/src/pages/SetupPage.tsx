// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { post } from '../api/client';
import { sessionKey, useSetupStatus } from '../api/session';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Form, rawValue, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { useFormErrors } from '../lib/use-form-errors';

export function SetupPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useSetupStatus();
  const setup = useMutation({
    mutationFn: (body: Record<string, string>) => post('/api/v1/setup', body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionKey });
      await queryClient.invalidateQueries({ queryKey: ['setup-status'] });
      void navigate('/account?setupMfa=1');
    },
  });
  const errors = useFormErrors(setup.error);

  if (status.isPending) return <Loading />;
  if (status.data && !status.data.needsSetup && !setup.isSuccess)
    return <Navigate to="/login" replace />;

  return (
    <>
      <PageHeading title={t('setup.title')} />
      <p className="mb-6">{t('setup.intro')}</p>
      <Form
        errors={errors}
        onSubmit={(data) => {
          setup.mutate({
            ...(status.data?.setupTokenRequired ? { setupToken: value(data, 'setupToken') } : {}),
            name: value(data, 'name'),
            email: value(data, 'email'),
            password: rawValue(data, 'password'),
            orgName: value(data, 'orgName'),
            locale: i18n.language,
          });
        }}
      >
        {status.data?.setupTokenRequired && (
          <Field
            label={t('fields.setupToken')}
            name="setupToken"
            required
            autoComplete="off"
            hint={t('hints.setupToken')}
            error={errors.fields.setupToken}
          />
        )}
        <Field
          label={t('fields.name')}
          name="name"
          required
          autoComplete="name"
          error={errors.fields.name}
        />
        <Field
          label={t('fields.email')}
          name="email"
          type="email"
          required
          autoComplete="email"
          error={errors.fields.email}
        />
        <Field
          label={t('fields.password')}
          name="password"
          type="password"
          required
          autoComplete="new-password"
          hint={t('hints.password')}
          error={errors.fields.password}
        />
        <Field
          label={t('fields.orgName')}
          name="orgName"
          required
          autoComplete="organization"
          error={errors.fields.orgName}
        />
        <Button type="submit" loading={setup.isPending}>
          {t('setup.submit')}
        </Button>
        {setup.isSuccess && <Alert variant="success">{t('setup.done')}</Alert>}
      </Form>
    </>
  );
}
