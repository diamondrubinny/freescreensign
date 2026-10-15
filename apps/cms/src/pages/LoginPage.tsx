import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ApiError, post } from '../api/client';
import { sessionKey, useSession, useSetupStatus } from '../api/session';
import type { LoginResult, SessionInfo } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Form, rawValue, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { safeNextPath } from '../lib/safe-redirect';
import { useFormErrors } from '../lib/use-form-errors';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const session = useSession();
  const setupStatus = useSetupStatus();
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const next = safeNextPath(params.get('next'));

  const finish = (info: SessionInfo) => {
    queryClient.setQueryData(sessionKey, info);
    void navigate(next, { replace: true });
  };

  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      post<LoginResult>('/api/v1/auth/login', body),
    onSuccess: (result) => {
      if (result.mfaRequired) setMfaToken(result.mfaToken);
      else finish(result);
    },
  });
  const resend = useMutation({
    mutationFn: () => post('/api/v1/auth/verify-email/resend', { email }),
  });
  const errors = useFormErrors(login.error);
  const unverified = login.error instanceof ApiError && login.error.code === 'EMAIL_NOT_VERIFIED';

  if (session.isPending || setupStatus.isPending) return <Loading />;
  if (setupStatus.data?.needsSetup) return <Navigate to="/setup" replace />;
  if (session.data) return <Navigate to={next} replace />;

  if (mfaToken) {
    return (
      <MfaStep
        mfaToken={mfaToken}
        onDone={finish}
        onExpired={() => {
          setMfaToken(null);
        }}
      />
    );
  }

  return (
    <>
      <PageHeading title={t('login.title')} />
      <Form
        errors={errors}
        onSubmit={(data) => {
          const address = value(data, 'email');
          setEmail(address);
          login.mutate({ email: address, password: rawValue(data, 'password') });
        }}
      >
        <Field
          label={t('fields.email')}
          name="email"
          type="email"
          required
          autoComplete="username"
          error={errors.fields.email}
        />
        <Field
          label={t('fields.password')}
          name="password"
          type="password"
          required
          autoComplete="current-password"
          error={errors.fields.password}
        />
        <Button type="submit" loading={login.isPending}>
          {t('login.submit')}
        </Button>
      </Form>
      {unverified && (
        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="secondary"
            loading={resend.isPending}
            onClick={() => {
              resend.mutate();
            }}
          >
            {t('login.resendVerification')}
          </Button>
          {resend.isSuccess && <Alert variant="success">{t('login.verificationSent')}</Alert>}
        </div>
      )}
      <div className="mt-6 flex flex-col gap-2">
        <Link to="/forgot-password" className="text-blue-700 underline dark:text-blue-300">
          {t('login.forgot')}
        </Link>
        <p>
          {t('login.noAccount')}{' '}
          <Link to="/register" className="text-blue-700 underline dark:text-blue-300">
            {t('login.register')}
          </Link>
        </p>
      </div>
    </>
  );
}

function MfaStep({
  mfaToken,
  onDone,
  onExpired,
}: {
  mfaToken: string;
  onDone: (info: SessionInfo) => void;
  onExpired: () => void;
}) {
  const { t } = useTranslation();
  const [useRecovery, setUseRecovery] = useState(false);
  const verify = useMutation({
    mutationFn: (body: { code?: string; recoveryCode?: string }) =>
      post<Extract<LoginResult, { mfaRequired: false }>>('/api/v1/auth/mfa/verify', {
        mfaToken,
        ...body,
      }),
    onSuccess: onDone,
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'INVALID_TOKEN') onExpired();
    },
  });
  const baseErrors = useFormErrors(verify.error);
  // On this step INVALID_CREDENTIALS means the code was wrong, not the password.
  const errors =
    verify.error instanceof ApiError && verify.error.code === 'INVALID_CREDENTIALS'
      ? { ...baseErrors, form: t('login.invalidCode') }
      : baseErrors;

  return (
    <>
      <PageHeading title={t('login.mfaTitle')} />
      <p className="mb-4">{t('login.mfaIntro')}</p>
      <Form
        errors={errors}
        onSubmit={(data) => {
          verify.mutate(
            useRecovery
              ? { recoveryCode: value(data, 'recoveryCode') }
              : { code: value(data, 'code') },
          );
        }}
      >
        {useRecovery ? (
          <Field
            key="recovery"
            label={t('fields.recoveryCode')}
            name="recoveryCode"
            required
            autoComplete="one-time-code"
            error={errors.fields.recoveryCode}
          />
        ) : (
          <Field
            key="code"
            label={t('fields.code')}
            name="code"
            required
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            hint={t('hints.code')}
            error={errors.fields.code}
          />
        )}
        <Button type="submit" loading={verify.isPending}>
          {t('login.mfaSubmit')}
        </Button>
      </Form>
      <Button
        variant="link"
        className="mt-4"
        onClick={() => {
          setUseRecovery((v) => !v);
          verify.reset();
        }}
      >
        {useRecovery ? t('login.useCode') : t('login.useRecovery')}
      </Button>
    </>
  );
}
