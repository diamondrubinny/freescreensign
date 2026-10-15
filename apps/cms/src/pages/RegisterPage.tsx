import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { post } from '../api/client';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Form, rawValue, value } from '../components/Form';
import { PageHeading } from '../components/PageHeading';
import { takeFragmentToken } from '../lib/fragment-token';
import { clearInviteToken, peekInviteToken } from '../lib/invite-token';
import { useFormErrors } from '../lib/use-form-errors';

export function RegisterPage() {
  const { t, i18n } = useTranslation();
  const [inviteToken] = useState(() => takeFragmentToken() ?? peekInviteToken());
  const register = useMutation({
    mutationFn: (body: Record<string, string>) =>
      post<{ status: string }>('/api/v1/auth/register', body),
    onSuccess: clearInviteToken,
  });
  const errors = useFormErrors(register.error);

  if (register.isSuccess) {
    const verified = register.data.status === 'registered';
    return (
      <>
        <PageHeading title={t('register.title')} />
        <Alert variant="success">
          {verified ? t('register.registered') : t('register.checkEmail')}
        </Alert>
        <Link to="/login" className="mt-4 inline-block text-blue-700 underline dark:text-blue-300">
          {t('login.submit')}
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeading title={t('register.title')} />
      {inviteToken && <p className="mb-4">{t('register.invited')}</p>}
      <Form
        errors={errors}
        onSubmit={(data) => {
          register.mutate({
            name: value(data, 'name'),
            email: value(data, 'email'),
            password: rawValue(data, 'password'),
            locale: i18n.language,
            ...(inviteToken ? { inviteToken } : {}),
          });
        }}
      >
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
        <p className="text-sm">
          <Trans
            i18nKey="register.consent"
            components={{
              terms: <Link to="/terms" className="text-blue-700 underline dark:text-blue-300" />,
              privacy: (
                <Link to="/privacy" className="text-blue-700 underline dark:text-blue-300" />
              ),
            }}
          />
        </p>
        <Button type="submit" loading={register.isPending}>
          {t('register.submit')}
        </Button>
      </Form>
      <p className="mt-6">
        {t('register.haveAccount')}{' '}
        <Link to="/login" className="text-blue-700 underline dark:text-blue-300">
          {t('login.submit')}
        </Link>
      </p>
    </>
  );
}
