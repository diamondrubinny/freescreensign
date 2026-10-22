// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { SUPPORTED_LOCALES, type Locale } from '@rubinny/shared';
import { ApiError, del, get, patch, post } from '../api/client';
import { sessionKey, useRefreshSession, useSession } from '../api/session';
import type { LinkedIdentity, User, UserSession } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Form, rawValue, value } from '../components/Form';
import { PageHeading } from '../components/PageHeading';
import { changeLocale } from '../i18n';
import { formatDateTime } from '../lib/format';
import { useFormErrors } from '../lib/use-form-errors';

const sectionClass = 'mb-10 max-w-2xl';
const h2Class = 'mb-3 text-xl font-semibold';

export function AccountPage() {
  const { t } = useTranslation();
  const user = useSession().data?.user;
  if (!user) return null;
  return (
    <>
      <PageHeading title={t('account.title')} />
      <ProfileSection user={user} />
      <h2 className="mb-4 text-2xl font-bold">{t('account.security')}</h2>
      <IdentitiesSection user={user} />
      {user.hasPassword ? (
        <>
          <MfaSection user={user} />
          <PasswordSection />
        </>
      ) : (
        <section aria-labelledby="password-heading" className={sectionClass}>
          <h3 id="password-heading" className={h2Class}>
            {t('account.changePassword')}
          </h3>
          <p>
            {t('account.noPassword')}{' '}
            <Link to="/forgot-password" className="text-brand-700 underline dark:text-brand-300">
              {t('account.setPassword')}
            </Link>
          </p>
        </section>
      )}
      <SessionsSection />
      <DataSection user={user} />
    </>
  );
}

function ProfileSection({ user }: { user: User }) {
  const { t } = useTranslation();
  const refresh = useRefreshSession();
  const save = useMutation({
    mutationFn: (body: { name: string; locale: Locale }) => patch('/api/v1/me', body),
    onSuccess: async (_data, body) => {
      await changeLocale(body.locale);
      await refresh();
    },
  });
  const errors = useFormErrors(save.error);
  return (
    <section aria-labelledby="profile-heading" className={sectionClass}>
      <h2 id="profile-heading" className={h2Class}>
        {t('account.profile')}
      </h2>
      <Form
        errors={errors}
        labelledBy="profile-heading"
        onSubmit={(data) => {
          save.mutate({ name: value(data, 'name'), locale: value(data, 'locale') as Locale });
        }}
      >
        <Field
          label={t('fields.email')}
          name="email"
          type="email"
          value={user.email}
          readOnly
          dir="ltr"
        />
        <Field
          label={t('fields.name')}
          name="name"
          required
          defaultValue={user.name}
          autoComplete="name"
          error={errors.fields.name}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="profile-locale" className="font-medium">
            {t('fields.locale')}
          </label>
          <select
            id="profile-locale"
            name="locale"
            defaultValue={user.locale}
            className="rounded-md border border-gray-500 bg-white px-3 py-2 dark:bg-gray-900"
          >
            {SUPPORTED_LOCALES.map((locale) => (
              <option key={locale} value={locale} lang={locale}>
                {locale === 'he' ? 'עברית' : 'English'}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" loading={save.isPending}>
          {t('common.save')}
        </Button>
        {save.isSuccess && <Alert variant="success">{t('common.saved')}</Alert>}
      </Form>
    </section>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 rounded-md border border-amber-700 p-4">
      <h3 className="font-semibold">{t('account.recoveryTitle')}</h3>
      <p>{t('account.recoveryIntro')}</p>
      <ul className="grid grid-cols-2 gap-1 font-mono" dir="ltr" data-testid="recovery-codes">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Button variant="secondary" onClick={onDone}>
        {t('account.recoveryDone')}
      </Button>
    </div>
  );
}

function MfaSection({ user }: { user: User }) {
  const { t } = useTranslation();
  const refresh = useRefreshSession();
  const [pending, setPending] = useState<{ secret: string; otpauthUri: string } | null>(null);
  // QR image for a given otpauth URI; stale images are ignored by comparing the URI.
  const [qr, setQr] = useState<{ uri: string; dataUrl: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [disabled, setDisabled] = useState(false);

  const setup = useMutation({
    mutationFn: (password: string) =>
      post<{ secret: string; otpauthUri: string }>('/api/v1/auth/mfa/totp/setup', { password }),
    onSuccess: setPending,
  });
  const enable = useMutation({
    mutationFn: (code: string) =>
      post<{ recoveryCodes: string[] }>('/api/v1/auth/mfa/totp/enable', { code }),
    onSuccess: async (data) => {
      setPending(null);
      setCodes(data.recoveryCodes);
      await refresh();
    },
  });
  const disable = useMutation({
    mutationFn: (body: { password: string; code: string }) =>
      post('/api/v1/auth/mfa/totp/disable', body),
    onSuccess: async () => {
      setDisabled(true);
      await refresh();
    },
  });
  const regenerate = useMutation({
    mutationFn: (code: string) =>
      post<{ recoveryCodes: string[] }>('/api/v1/auth/mfa/recovery-codes', { code }),
    onSuccess: (data) => {
      setCodes(data.recoveryCodes);
    },
  });

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    const uri = pending.otpauthUri;
    void QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((svg) => {
      if (!cancelled)
        setQr({ uri, dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
    });
    return () => {
      cancelled = true;
    };
  }, [pending]);
  const qrSrc = pending && qr?.uri === pending.otpauthUri ? qr.dataUrl : null;

  const setupErrors = useFormErrors(setup.error);
  const enableErrors = useFormErrors(enable.error);
  const disableErrors = useFormErrors(disable.error);
  const regenErrors = useFormErrors(regenerate.error);

  return (
    <section aria-labelledby="mfa-heading" className={sectionClass}>
      <h3 id="mfa-heading" className={h2Class}>
        {t('account.mfa')}
      </h3>
      <p className="mb-4 font-medium">
        {user.mfaEnabled ? t('account.mfaOn') : t('account.mfaOff')}
      </p>
      {disabled && !user.mfaEnabled && <Alert variant="success">{t('account.mfaDisabled')}</Alert>}
      {codes && (
        <RecoveryCodes
          codes={codes}
          onDone={() => {
            setCodes(null);
          }}
        />
      )}

      {!user.mfaEnabled && !pending && (
        <Form
          errors={setupErrors}
          onSubmit={(data) => {
            setup.mutate(rawValue(data, 'password'));
          }}
        >
          <Field
            label={t('fields.currentPassword')}
            name="password"
            type="password"
            required
            autoComplete="current-password"
            error={setupErrors.fields.password}
          />
          <Button type="submit" loading={setup.isPending}>
            {t('account.mfaStart')}
          </Button>
        </Form>
      )}

      {pending && (
        <div className="flex flex-col gap-4">
          <p>{t('account.mfaScan')}</p>
          {qrSrc && (
            <img src={qrSrc} alt={t('account.mfaQrAlt')} className="size-48 rounded bg-white p-2" />
          )}
          <div>
            <p className="font-medium">{t('account.mfaSecret')}</p>
            <code className="break-all text-lg" dir="ltr" data-testid="mfa-secret">
              {pending.secret}
            </code>
          </div>
          <Form
            errors={enableErrors}
            onSubmit={(data) => {
              enable.mutate(value(data, 'code'));
            }}
          >
            <Field
              label={t('fields.code')}
              name="code"
              required
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              error={enableErrors.fields.code}
            />
            <Button type="submit" loading={enable.isPending}>
              {t('account.mfaConfirm')}
            </Button>
          </Form>
        </div>
      )}

      {user.mfaEnabled && (
        <div className="flex flex-col gap-6">
          <Form
            errors={regenErrors}
            onSubmit={(data) => {
              regenerate.mutate(value(data, 'code'));
            }}
          >
            <Field
              label={t('fields.code')}
              name="code"
              required
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              error={regenErrors.fields.code}
            />
            <Button type="submit" variant="secondary" loading={regenerate.isPending}>
              {t('account.recoveryRegenerate')}
            </Button>
          </Form>
          <Form
            errors={disableErrors}
            onSubmit={(data) => {
              disable.mutate({ password: rawValue(data, 'password'), code: value(data, 'code') });
            }}
          >
            <Field
              label={t('fields.currentPassword')}
              name="password"
              type="password"
              required
              autoComplete="current-password"
              error={disableErrors.fields.password}
            />
            <Field
              label={t('fields.code')}
              name="code"
              required
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              error={disableErrors.fields.code}
            />
            <Button type="submit" variant="danger" loading={disable.isPending}>
              {t('account.mfaDisable')}
            </Button>
          </Form>
        </div>
      )}
    </section>
  );
}

function PasswordSection() {
  const { t } = useTranslation();
  const change = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      post('/api/v1/auth/password/change', body),
  });
  const errors = useFormErrors(change.error);
  return (
    <section aria-labelledby="password-heading" className={sectionClass}>
      <h3 id="password-heading" className={h2Class}>
        {t('account.changePassword')}
      </h3>
      <Form
        errors={errors}
        labelledBy="password-heading"
        onSubmit={(data) => {
          change.mutate({
            currentPassword: rawValue(data, 'currentPassword'),
            newPassword: rawValue(data, 'newPassword'),
          });
        }}
      >
        <Field
          label={t('fields.currentPassword')}
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          error={errors.fields.currentPassword}
        />
        <Field
          label={t('fields.newPassword')}
          name="newPassword"
          type="password"
          required
          autoComplete="new-password"
          hint={t('hints.password')}
          error={errors.fields.newPassword}
        />
        <Button type="submit" loading={change.isPending}>
          {t('account.changePassword')}
        </Button>
        {change.isSuccess && <Alert variant="success">{t('account.passwordChanged')}</Alert>}
      </Form>
    </section>
  );
}

function SessionsSection() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sessions = useQuery({
    queryKey: ['my-sessions'],
    queryFn: () => get<{ sessions: UserSession[] }>('/api/v1/me/sessions'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => del(`/api/v1/me/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-sessions'] }),
  });
  const logoutAll = useMutation({
    mutationFn: () => post('/api/v1/auth/logout-all'),
    onSuccess: () => {
      queryClient.clear();
      void navigate('/login');
    },
  });
  return (
    <section aria-labelledby="sessions-heading" className={sectionClass}>
      <h3 id="sessions-heading" className={h2Class}>
        {t('account.sessions')}
      </h3>
      <ul className="mb-4 flex flex-col gap-2">
        {sessions.data?.sessions.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white shadow-sm p-3 dark:border-gray-800 dark:bg-gray-900"
          >
            <span>
              <span className="block" dir="ltr">
                {s.userAgent ?? t('account.unknownDevice')}
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {s.current
                  ? t('account.sessionCurrent')
                  : `${t('account.sessionLastSeen')}: ${formatDateTime(s.lastSeenAt, i18n.language)}`}
              </span>
            </span>
            {!s.current && (
              <Button
                variant="secondary"
                loading={revoke.isPending && revoke.variables === s.id}
                onClick={() => {
                  revoke.mutate(s.id);
                }}
              >
                {t('account.sessionRevoke')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        loading={logoutAll.isPending}
        onClick={() => {
          logoutAll.mutate();
        }}
      >
        {t('account.logoutAll')}
      </Button>
    </section>
  );
}

function IdentitiesSection({ user }: { user: User }) {
  const { t, i18n } = useTranslation();
  const identities = useQuery({
    queryKey: ['me', 'identities'],
    queryFn: () => get<{ identities: LinkedIdentity[] }>('/api/v1/me/identities'),
  });
  const unlink = useMutation({
    mutationFn: (id: string) => del(`/api/v1/me/identities/${id}`),
    onSuccess: () => identities.refetch(),
  });
  const errors = useFormErrors(unlink.error);
  const list = identities.data?.identities ?? [];
  if (list.length === 0) return null;
  return (
    <section aria-labelledby="identities-heading" className={sectionClass}>
      <h3 id="identities-heading" className={h2Class}>
        {t('account.identities')}
      </h3>
      <p className="mb-3">{t('account.identitiesHint')}</p>
      {errors.form && (
        <div className="mb-3">
          <Alert variant="error">
            {unlink.error instanceof ApiError && unlink.error.code === 'CONFLICT'
              ? t('account.identityLast')
              : errors.form}
          </Alert>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {list.map((identity) => (
          <li
            key={identity.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800"
          >
            <div>
              <p className="font-medium">
                <bdi>{identity.email}</bdi>
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <bdi dir="ltr">{new URL(identity.issuer).host}</bdi> ·{' '}
                {t('account.identityLastUsed', {
                  when: formatDateTime(identity.lastUsedAt, i18n.language),
                })}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={unlink.isPending && unlink.variables === identity.id}
              disabled={!user.hasPassword && list.length === 1}
              aria-label={`${t('account.identityUnlink')}: ${identity.email}`}
              onClick={() => {
                unlink.mutate(identity.id);
              }}
            >
              {t('account.identityUnlink')}
            </Button>
          </li>
        ))}
      </ul>
      {!user.hasPassword && list.length === 1 && (
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{t('account.identityLast')}</p>
      )}
    </section>
  );
}

function DataSection({ user }: { user: User }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: (password: string) => del('/api/v1/me', user.hasPassword ? { password } : {}),
    onSuccess: () => {
      queryClient.setQueryData(sessionKey, null);
      queryClient.clear();
      void navigate('/login');
    },
  });
  const baseErrors = useFormErrors(remove.error);
  // Accounts without a password confirm by a recent sign-in instead.
  const errors =
    !user.hasPassword &&
    remove.error instanceof ApiError &&
    remove.error.code === 'INVALID_CREDENTIALS'
      ? { ...baseErrors, form: t('account.deleteReauth') }
      : baseErrors;
  return (
    <section aria-labelledby="data-heading" className={sectionClass}>
      <h2 id="data-heading" className={h2Class}>
        {t('account.data')}
      </h2>
      <p className="mb-2">{t('account.exportHint')}</p>
      <a
        href="/api/v1/me/export"
        download
        className="mb-8 inline-block rounded-md border border-gray-400 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        {t('account.exportData')}
      </a>
      <h3 className="mb-2 text-lg font-semibold">{t('account.deleteAccount')}</h3>
      <p className="mb-2">{t('account.deleteHint')}</p>
      <Button
        variant="danger"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('account.deleteAccount')}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={t('account.deleteAccount')}
        footer={<></>}
      >
        <Form
          errors={errors}
          onSubmit={(data) => {
            remove.mutate(rawValue(data, 'password'));
          }}
        >
          <p>{user.hasPassword ? t('account.deleteConfirm') : t('account.deleteConfirmSso')}</p>
          {user.hasPassword && (
            <Field
              label={t('fields.password')}
              name="password"
              type="password"
              required
              autoComplete="current-password"
              error={errors.fields.password}
            />
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="danger" loading={remove.isPending}>
              {t('common.delete')}
            </Button>
          </div>
        </Form>
      </Dialog>
    </section>
  );
}
