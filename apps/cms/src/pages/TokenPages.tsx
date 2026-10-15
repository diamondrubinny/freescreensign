import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { post } from '../api/client';
import { useRefreshSession, useSession } from '../api/session';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Form, rawValue, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { takeFragmentToken } from '../lib/fragment-token';
import { useFormErrors } from '../lib/use-form-errors';
import { clearInviteToken, peekInviteToken, rememberInviteToken } from '../lib/invite-token';

const linkClass = 'mt-4 inline-block text-brand-700 underline dark:text-brand-300';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [token] = useState(takeFragmentToken);
  const verify = useMutation({
    mutationFn: (value: string) => post('/api/v1/auth/verify-email', { token: value }),
  });
  const errors = useFormErrors(verify.error);
  const { mutate } = verify;

  useEffect(() => {
    if (token) mutate(token);
  }, [token, mutate]);

  return (
    <>
      <PageHeading title={t('verifyEmail.title')} />
      {!token && <Alert variant="error">{t('verifyEmail.missing')}</Alert>}
      {verify.isPending && <p role="status">{t('verifyEmail.verifying')}</p>}
      {errors.form && <Alert variant="error">{errors.form}</Alert>}
      {verify.isSuccess && <Alert variant="success">{t('verifyEmail.success')}</Alert>}
      <Link to="/login" className={linkClass}>
        {t('login.submit')}
      </Link>
    </>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const forgot = useMutation({
    mutationFn: (email: string) => post('/api/v1/auth/password/forgot', { email }),
  });
  const errors = useFormErrors(forgot.error);
  return (
    <>
      <PageHeading title={t('forgot.title')} />
      <p className="mb-4">{t('forgot.intro')}</p>
      {forgot.isSuccess ? (
        <Alert variant="success">{t('forgot.sent')}</Alert>
      ) : (
        <Form
          errors={errors}
          onSubmit={(data) => {
            forgot.mutate(value(data, 'email'));
          }}
        >
          <Field
            label={t('fields.email')}
            name="email"
            type="email"
            required
            autoComplete="email"
            error={errors.fields.email}
          />
          <Button type="submit" loading={forgot.isPending}>
            {t('forgot.submit')}
          </Button>
        </Form>
      )}
      <Link to="/login" className={linkClass}>
        {t('common.back')}
      </Link>
    </>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [token] = useState(takeFragmentToken);
  const reset = useMutation({
    mutationFn: (password: string) => post('/api/v1/auth/password/reset', { token, password }),
  });
  const errors = useFormErrors(reset.error);
  return (
    <>
      <PageHeading title={t('reset.title')} />
      {!token && <Alert variant="error">{t('verifyEmail.missing')}</Alert>}
      {reset.isSuccess ? (
        <Alert variant="success">{t('reset.success')}</Alert>
      ) : (
        token && (
          <Form
            errors={errors}
            onSubmit={(data) => {
              reset.mutate(rawValue(data, 'password'));
            }}
          >
            <Field
              label={t('fields.newPassword')}
              name="password"
              type="password"
              required
              autoComplete="new-password"
              hint={t('hints.password')}
              error={errors.fields.password}
            />
            <Button type="submit" loading={reset.isPending}>
              {t('reset.submit')}
            </Button>
          </Form>
        )
      )}
      <Link to="/login" className={linkClass}>
        {t('login.submit')}
      </Link>
    </>
  );
}

export function AcceptInvitationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const refresh = useRefreshSession();
  const [token] = useState(() => takeFragmentToken() ?? peekInviteToken());
  const accept = useMutation({
    mutationFn: () => post<{ orgId: string }>('/api/v1/invitations/accept', { token }),
    onSuccess: async ({ orgId }) => {
      clearInviteToken();
      await refresh();
      void navigate(`/?joined=${orgId}`);
    },
  });
  const errors = useFormErrors(accept.error);

  if (session.isPending) return <Loading />;

  return (
    <>
      <PageHeading title={t('invitation.title')} />
      {!token && <Alert variant="error">{t('verifyEmail.missing')}</Alert>}
      {token && session.data && (
        <div className="flex flex-col gap-4">
          {errors.form && <Alert variant="error">{errors.form}</Alert>}
          <Button
            loading={accept.isPending}
            onClick={() => {
              accept.mutate();
            }}
          >
            {t('invitation.accept')}
          </Button>
        </div>
      )}
      {token && !session.data && (
        <div className="flex flex-col gap-4">
          <p>{t('invitation.needAccount')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                rememberInviteToken(token);
                void navigate('/register');
              }}
            >
              {t('invitation.registerToAccept')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                // Come back here (token kept in memory) after signing in.
                rememberInviteToken(token);
                void navigate('/login?next=/accept-invitation');
              }}
            >
              {t('invitation.loginToAccept')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
