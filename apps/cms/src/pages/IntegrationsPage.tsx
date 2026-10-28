// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  API_KEY_SCOPES,
  ATTRIBUTION,
  WEBHOOK_EVENTS,
  type ApiKeyScope,
  type WebhookEvent,
} from '@rubinny/shared';
import { Copy, KeyRound, Plus, Webhook } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { del, get, patch, post } from '../api/client';
import type { ApiKeyItem, WebhookDelivery, WebhookItem } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { TableRegion } from '../components/TableRegion';
import { Card, EmptyState, SectionHeading, StatusPill, linkClass } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { useFormErrors } from '../lib/use-form-errors';

const EXPIRY_DAYS = [null, 30, 90, 365] as const;

/** Translation keys cannot hold ":" or "." (i18next separators): "screens:read" → "screens_read". */
const scopeKey = (scope: string) =>
  `integrations.scope.${scope.replace(':', '_') as 'screens_read' | 'alerts_write' | 'widgets_write'}` as const;
const scopeHintKey = (scope: ApiKeyScope) =>
  `integrations.scopeHint.${scope.replace(':', '_') as 'screens_read' | 'alerts_write' | 'widgets_write'}` as const;
type EventKey =
  | 'ping'
  | 'screen_offline'
  | 'screen_online'
  | 'alert_started'
  | 'alert_ended'
  | 'approval_requested';
const eventKey = (event: string) =>
  `integrations.event.${event.replace('.', '_') as EventKey}` as const;
const DOCS_URL = `${ATTRIBUTION.sourceUrl}/blob/main/docs/INTEGRATIONS.md`;

/**
 * Integrations (docs/phases/19-integrations-api-webhooks.md), for admins: API keys for
 * other systems (shown once), and webhooks that tell them what happened.
 */
export function IntegrationsPage() {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  return (
    <>
      <PageHeading title={t('integrations.title')} description={t('integrations.intro')} />
      <p className="mb-8 max-w-3xl text-sm">
        <a href={DOCS_URL} className={linkClass} target="_blank" rel="noreferrer">
          {t('integrations.docs')}
        </a>
      </p>
      <ApiKeysSection orgId={orgId} />
      <WebhooksSection orgId={orgId} />
    </>
  );
}

/** A secret shown once, with a copy button and a clear warning. */
function OnceSecret({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const id = useId();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Alert variant="info">{t('integrations.shownOnce')}</Alert>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          dir="ltr"
          value={value}
          onFocus={(event) => {
            event.target.select();
          }}
          className="min-w-0 flex-1 rounded-lg border border-gray-400 bg-gray-50 px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-800"
        />
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
            });
          }}
        >
          <Copy aria-hidden="true" />
          {t('integrations.copy')}
        </Button>
      </div>
      <p aria-live="polite" className="text-sm empty:hidden">
        {copied ? t('integrations.copied') : ''}
      </p>
    </div>
  );
}

function ApiKeysSection({ orgId }: { orgId: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKeyItem | null>(null);
  const keys = useQuery({
    queryKey: ['api-keys', orgId],
    queryFn: () => get<{ keys: ApiKeyItem[] }>(`/api/v1/orgs/${orgId}/api-keys`),
  });
  const revoke = useMutation({
    mutationFn: (key: ApiKeyItem) => del(`/api/v1/orgs/${orgId}/api-keys/${key.id}`),
    onSuccess: () => {
      setRevoking(null);
      void queryClient.invalidateQueries({ queryKey: ['api-keys', orgId] });
    },
  });
  const errors = useFormErrors(keys.error ?? revoke.error);
  const when = (iso: string | null) => (iso ? formatDateTime(iso, i18n.language) : '—');

  return (
    <section aria-labelledby="api-keys-heading" className="mb-12">
      <SectionHeading
        id="api-keys-heading"
        title={t('integrations.keys')}
        description={t('integrations.keysHint')}
      >
        <Button
          onClick={() => {
            setCreating(true);
          }}
        >
          <Plus aria-hidden="true" />
          {t('integrations.newKey')}
        </Button>
      </SectionHeading>
      {errors.form && <Alert variant="error">{errors.form}</Alert>}
      {keys.isPending ? (
        <Loading />
      ) : (keys.data?.keys.length ?? 0) === 0 ? (
        <EmptyState icon={KeyRound} title={t('integrations.noKeys')} />
      ) : (
        <TableRegion label={t('integrations.keys')}>
          <table className="w-full text-start">
            <thead>
              <tr>
                <th scope="col">{t('integrations.name')}</th>
                <th scope="col">{t('integrations.key')}</th>
                <th scope="col">{t('integrations.scopes')}</th>
                <th scope="col">{t('integrations.lastUsed')}</th>
                <th scope="col">{t('integrations.expires')}</th>
                <th scope="col">{t('integrations.status')}</th>
                <th scope="col">
                  <span className="sr-only">{t('integrations.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.data?.keys.map((key) => (
                <tr key={key.id}>
                  <th scope="row">
                    <bdi>{key.name}</bdi>
                  </th>
                  <td>
                    <code dir="ltr">{key.prefix}…</code>
                  </td>
                  <td>{key.scopes.map((scope) => t(scopeKey(scope))).join(', ')}</td>
                  <td>
                    {when(key.lastUsedAt)}
                    {key.lastUsedIp && (
                      <span className="block text-sm text-gray-700 dark:text-gray-300" dir="ltr">
                        {key.lastUsedIp}
                      </span>
                    )}
                  </td>
                  <td>{key.expiresAt ? when(key.expiresAt) : t('integrations.never')}</td>
                  <td>
                    <StatusPill tone={key.active ? 'green' : 'gray'}>
                      {key.revokedAt
                        ? t('integrations.revoked')
                        : key.active
                          ? t('integrations.active')
                          : t('integrations.expired')}
                    </StatusPill>
                  </td>
                  <td>
                    {!key.revokedAt && (
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`${t('integrations.revoke')} ${key.name}`}
                        onClick={() => {
                          setRevoking(key);
                        }}
                      >
                        {t('integrations.revoke')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
      )}
      <NewKeyDialog
        orgId={orgId}
        open={creating}
        onClose={() => {
          setCreating(false);
          void queryClient.invalidateQueries({ queryKey: ['api-keys', orgId] });
        }}
      />
      <ConfirmDialog
        open={revoking !== null}
        message={t('integrations.revokeConfirm', { name: revoking?.name ?? '' })}
        confirmLabel={t('integrations.revoke')}
        loading={revoke.isPending}
        onConfirm={() => {
          if (revoking) revoke.mutate(revoking);
        }}
        onCancel={() => {
          setRevoking(null);
        }}
      />
    </section>
  );
}

function NewKeyDialog({
  orgId,
  open,
  onClose,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [expires, setExpires] = useState<number | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      post<{ token: string }>(`/api/v1/orgs/${orgId}/api-keys`, {
        name,
        scopes,
        expiresInDays: expires,
      }),
    onSuccess: (result) => {
      setToken(result.token);
    },
  });
  const errors = useFormErrors(create.error);
  const close = () => {
    setName('');
    setScopes([]);
    setExpires(null);
    setToken(null);
    create.reset();
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('integrations.newKey')}
      footer={
        token ? (
          <Button onClick={close}>{t('integrations.done')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form={formId} loading={create.isPending}>
              {t('integrations.create')}
            </Button>
          </>
        )
      }
    >
      {token ? (
        <OnceSecret label={t('integrations.key')} value={token} />
      ) : (
        <form
          id={formId}
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          {errors.form && <Alert variant="error">{errors.form}</Alert>}
          <Field
            label={t('integrations.name')}
            name="name"
            required
            maxLength={80}
            value={name}
            hint={t('integrations.keyNameHint')}
            error={errors.fields.name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <fieldset aria-describedby={errors.fields.scopes ? `${formId}-scopes` : undefined}>
            <legend className="mb-2 font-medium">{t('integrations.scopes')}</legend>
            <div className="flex flex-col gap-2">
              {API_KEY_SCOPES.map((scope) => (
                <div key={scope} className="flex items-start gap-2">
                  <input
                    id={`${formId}-${scope}`}
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    aria-describedby={`${formId}-${scope}-hint`}
                    checked={scopes.includes(scope)}
                    onChange={(event) => {
                      const on = event.target.checked;
                      setScopes((list) =>
                        on ? [...list, scope] : list.filter((s) => s !== scope),
                      );
                    }}
                  />
                  <div>
                    <label htmlFor={`${formId}-${scope}`} className="font-medium">
                      {t(scopeKey(scope))}
                    </label>
                    <p
                      id={`${formId}-${scope}-hint`}
                      className="text-sm text-gray-700 dark:text-gray-300"
                    >
                      {t(scopeHintKey(scope))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {errors.fields.scopes && (
              <p
                id={`${formId}-scopes`}
                className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300"
              >
                {errors.fields.scopes}
              </p>
            )}
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{t('integrations.expires')}</span>
            <select
              value={expires === null ? '' : String(expires)}
              onChange={(event) => {
                setExpires(event.target.value === '' ? null : Number(event.target.value));
              }}
              className="rounded-lg border border-gray-400 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900"
            >
              {EXPIRY_DAYS.map((days) => (
                <option key={String(days)} value={days === null ? '' : String(days)}>
                  {days === null
                    ? t('integrations.never')
                    : t('integrations.days', { count: days })}
                </option>
              ))}
            </select>
          </label>
        </form>
      )}
    </Dialog>
  );
}

function WebhooksSection({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const hooks = useQuery({
    queryKey: ['webhooks', orgId],
    queryFn: () => get<{ webhooks: WebhookItem[] }>(`/api/v1/orgs/${orgId}/webhooks`),
  });
  const errors = useFormErrors(hooks.error);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['webhooks', orgId] });
  };
  return (
    <section aria-labelledby="webhooks-heading" className="mb-12">
      <SectionHeading
        id="webhooks-heading"
        title={t('integrations.webhooks')}
        description={t('integrations.webhooksHint')}
      >
        <Button
          onClick={() => {
            setCreating(true);
          }}
        >
          <Plus aria-hidden="true" />
          {t('integrations.newWebhook')}
        </Button>
      </SectionHeading>
      <div className="mb-4 max-w-3xl">
        <Alert variant="info">{t('integrations.webhookPrivacy')}</Alert>
      </div>
      {errors.form && <Alert variant="error">{errors.form}</Alert>}
      {hooks.isPending ? (
        <Loading />
      ) : (hooks.data?.webhooks.length ?? 0) === 0 ? (
        <EmptyState icon={Webhook} title={t('integrations.noWebhooks')} />
      ) : (
        <ul className="flex flex-col gap-4">
          {hooks.data?.webhooks.map((hook) => (
            <WebhookCard key={hook.id} orgId={orgId} hook={hook} onChange={refresh} />
          ))}
        </ul>
      )}
      <WebhookDialog
        orgId={orgId}
        open={creating}
        onClose={() => {
          setCreating(false);
          refresh();
        }}
      />
    </section>
  );
}

function EventChoices({
  value,
  onChange,
  error,
}: {
  value: WebhookEvent[];
  onChange: (events: WebhookEvent[]) => void;
  error?: string | undefined;
}) {
  const { t } = useTranslation();
  const errorId = useId();
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2 font-medium">{t('integrations.events')}</legend>
      <div className="flex flex-col gap-2">
        {WEBHOOK_EVENTS.map((event) => (
          <label key={event} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={value.includes(event)}
              onChange={(change) => {
                onChange(
                  change.target.checked ? [...value, event] : value.filter((e) => e !== event),
                );
              }}
            />
            {t(eventKey(event))}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function WebhookDialog({
  orgId,
  open,
  onClose,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      post<{ secret: string }>(`/api/v1/orgs/${orgId}/webhooks`, { name, url, events }),
    onSuccess: (result) => {
      setSecret(result.secret);
    },
  });
  const errors = useFormErrors(create.error);
  const close = () => {
    setName('');
    setUrl('');
    setEvents([]);
    setSecret(null);
    create.reset();
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('integrations.newWebhook')}
      footer={
        secret ? (
          <Button onClick={close}>{t('integrations.done')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form={formId} loading={create.isPending}>
              {t('integrations.create')}
            </Button>
          </>
        )
      }
    >
      {secret ? (
        <OnceSecret label={t('integrations.secret')} value={secret} />
      ) : (
        <form
          id={formId}
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          {errors.form && <Alert variant="error">{errors.form}</Alert>}
          <Field
            label={t('integrations.name')}
            name="name"
            required
            maxLength={80}
            value={name}
            error={errors.fields.name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <Field
            label={t('integrations.url')}
            name="url"
            type="url"
            required
            dir="ltr"
            maxLength={2000}
            value={url}
            hint={t('integrations.urlHint')}
            error={errors.fields.url}
            onChange={(event) => {
              setUrl(event.target.value);
            }}
          />
          <EventChoices value={events} onChange={setEvents} error={errors.fields.events} />
        </form>
      )}
    </Dialog>
  );
}

function WebhookCard({
  orgId,
  hook,
  onChange,
}: {
  orgId: string;
  hook: WebhookItem;
  onChange: () => void;
}) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'secret' | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const base = `/api/v1/orgs/${orgId}/webhooks/${hook.id}`;

  const toggle = useMutation({
    mutationFn: () => patch(base, { enabled: !hook.enabled }),
    onSuccess: onChange,
  });
  const remove = useMutation({
    mutationFn: () => del(base),
    onSuccess: () => {
      setConfirm(null);
      onChange();
    },
  });
  const rotate = useMutation({
    mutationFn: () => post<{ secret: string }>(`${base}/secret`),
    onSuccess: (result) => {
      setConfirm(null);
      setNewSecret(result.secret);
    },
  });
  const test = useMutation({
    mutationFn: () =>
      post<{ ok: boolean; status: number | null; error: string | null }>(`${base}/test`),
    onSuccess: (result) => {
      setTestResult(
        result.ok
          ? t('integrations.testOk', { status: result.status ?? '' })
          : t('integrations.testFailed', { status: result.status ?? result.error ?? '' }),
      );
    },
  });
  const deliveries = useQuery({
    queryKey: ['webhook-deliveries', hook.id],
    queryFn: () => get<{ deliveries: WebhookDelivery[] }>(`${base}/deliveries`),
    enabled: showDeliveries,
  });
  const errors = useFormErrors(toggle.error ?? remove.error ?? rotate.error ?? test.error);

  return (
    <Card as="li" className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="text-lg font-bold">
            <bdi>{hook.name}</bdi>
          </h3>
          <p className="break-all text-sm" dir="ltr">
            {hook.url}
          </p>
        </div>
        <StatusPill
          tone={hook.enabled ? 'green' : hook.disabledReason === 'failures' ? 'red' : 'gray'}
        >
          {hook.enabled
            ? t('integrations.on')
            : hook.disabledReason === 'failures'
              ? t('integrations.offFailures')
              : t('integrations.off')}
        </StatusPill>
      </div>
      <p className="text-sm">
        {t('integrations.events')}: {hook.events.map((event) => t(eventKey(event))).join(', ')}
      </p>
      {errors.form && <Alert variant="error">{errors.form}</Alert>}
      <div aria-live="polite" className="empty:hidden">
        {testResult && <p className="text-sm font-medium">{testResult}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={test.isPending}
          aria-describedby={headingId}
          onClick={() => {
            setTestResult(null);
            test.mutate();
          }}
        >
          {t('integrations.test')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={toggle.isPending}
          aria-describedby={headingId}
          onClick={() => {
            toggle.mutate();
          }}
        >
          {hook.enabled ? t('integrations.turnOff') : t('integrations.turnOn')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-describedby={headingId}
          onClick={() => {
            setConfirm('secret');
          }}
        >
          {t('integrations.rotate')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={showDeliveries}
          aria-describedby={headingId}
          onClick={() => {
            setShowDeliveries((v) => !v);
          }}
        >
          {t('integrations.deliveries')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          aria-describedby={headingId}
          onClick={() => {
            setConfirm('delete');
          }}
        >
          {t('common.delete')}
        </Button>
      </div>
      {showDeliveries &&
        (deliveries.isPending ? (
          <Loading />
        ) : (deliveries.data?.deliveries.length ?? 0) === 0 ? (
          <p className="text-sm">{t('integrations.noDeliveries')}</p>
        ) : (
          <TableRegion label={`${t('integrations.deliveries')}: ${hook.name}`}>
            <table className="w-full text-start text-sm">
              <thead>
                <tr>
                  <th scope="col">{t('integrations.when')}</th>
                  <th scope="col">{t('integrations.event.title')}</th>
                  <th scope="col">{t('integrations.status')}</th>
                  <th scope="col">{t('integrations.attempts')}</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.data?.deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{formatDateTime(d.createdAt, i18n.language)}</td>
                    <td>{t(eventKey(d.event))}</td>
                    <td>
                      <StatusPill
                        tone={
                          d.status === 'delivered'
                            ? 'green'
                            : d.status === 'failed'
                              ? 'red'
                              : 'amber'
                        }
                      >
                        {t(`integrations.delivery.${d.status}`)}
                      </StatusPill>{' '}
                      {d.statusCode !== null && <span dir="ltr">HTTP {d.statusCode}</span>}
                      {d.error && (
                        <span className="block" dir="ltr">
                          {d.error}
                        </span>
                      )}
                    </td>
                    <td>{d.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
        ))}
      <ConfirmDialog
        open={confirm !== null}
        message={
          confirm === 'delete'
            ? t('integrations.deleteConfirm', { name: hook.name })
            : t('integrations.rotateConfirm', { name: hook.name })
        }
        confirmLabel={confirm === 'delete' ? t('common.delete') : t('integrations.rotate')}
        loading={remove.isPending || rotate.isPending}
        onConfirm={() => {
          if (confirm === 'delete') remove.mutate();
          else rotate.mutate();
        }}
        onCancel={() => {
          setConfirm(null);
        }}
      />
      <Dialog
        open={newSecret !== null}
        onClose={() => {
          setNewSecret(null);
        }}
        title={t('integrations.rotate')}
      >
        {newSecret && <OnceSecret label={t('integrations.secret')} value={newSecret} />}
      </Dialog>
    </Card>
  );
}
