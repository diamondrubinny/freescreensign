// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { del, get, put } from '../api/client';
import type { AiSettings } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { useFormErrors } from '../lib/use-form-errors';

/** Admins: turn writing suggestions on with the organization's own key (opt-in). */
export function AiSettingsSection({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const settings = useQuery({
    queryKey: ['ai', orgId],
    queryFn: () => get<{ ai: AiSettings }>(`/api/v1/orgs/${orgId}/ai`),
  });
  const save = useMutation({
    mutationFn: (body: { apiKey?: string; model: string }) =>
      put<{ ai: AiSettings }>(`/api/v1/orgs/${orgId}/ai`, body),
    onSuccess: (data) => {
      queryClient.setQueryData(['ai', orgId], data);
      setMessage(t('ai.saved'));
    },
  });
  const disable = useMutation({
    mutationFn: () => del(`/api/v1/orgs/${orgId}/ai`),
    onSuccess: async () => {
      setConfirming(false);
      setMessage(t('ai.disabled'));
      await queryClient.invalidateQueries({ queryKey: ['ai', orgId] });
    },
  });
  const errors = useFormErrors(save.error ?? disable.error);
  const ai = settings.data?.ai;
  if (!ai) return null;

  return (
    <section aria-labelledby="ai-heading" className="mt-10 max-w-lg">
      <h2 id="ai-heading" className="mb-2 text-xl font-semibold">
        {t('ai.title')}
      </h2>
      <p className="mb-2">{t('ai.intro')}</p>
      <p className="mb-2 font-medium">
        {ai.enabled ? t('ai.status', { hint: ai.keyHint ?? '' }) : t('ai.statusOff')}
      </p>
      <div className="mb-4">
        <Alert variant="info">{t('ai.providerNotice')}</Alert>
      </div>
      <div aria-live="polite" className="mb-4 empty:hidden">
        {message && <Alert variant="success">{message}</Alert>}
      </div>
      <Form
        errors={errors}
        labelledBy="ai-heading"
        onSubmit={(data) => {
          setMessage(null);
          const apiKey = value(data, 'apiKey');
          save.mutate({ ...(apiKey ? { apiKey } : {}), model: value(data, 'model') });
        }}
      >
        <Field
          label={t('ai.apiKey')}
          name="apiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          required={!ai.enabled}
          maxLength={300}
          hint={ai.enabled ? t('ai.apiKeyHintSet') : t('ai.apiKeyHint')}
          error={errors.fields.apiKey}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="ai-model" className="font-medium">
            {t('ai.model')}
          </label>
          <select
            id="ai-model"
            name="model"
            defaultValue={ai.model}
            aria-invalid={errors.fields.model ? true : undefined}
            aria-describedby={errors.fields.model ? 'ai-model-error' : undefined}
            className="rounded-md border border-gray-500 bg-white px-3 py-2 dark:bg-gray-900"
          >
            {ai.models.map((model) => (
              <option key={model} value={model}>
                {t(`ai.models.${model}`, model)}
              </option>
            ))}
          </select>
          {errors.fields.model && (
            <p id="ai-model-error" className="text-sm font-medium text-red-800 dark:text-red-300">
              {errors.fields.model}
            </p>
          )}
        </div>
        {!ai.enabled && (
          <label className="flex items-start gap-2">
            <input type="checkbox" name="consent" required className="mt-1 size-4" />
            <span>{t('ai.consent')}</span>
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={save.isPending}>
            {t('ai.save')}
          </Button>
          {ai.enabled && (
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(true);
              }}
            >
              {t('ai.disable')}
            </Button>
          )}
        </div>
      </Form>
      <ConfirmDialog
        open={confirming}
        message={t('ai.disableConfirm')}
        confirmLabel={t('ai.disable')}
        loading={disable.isPending}
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          disable.mutate();
        }}
      />
    </section>
  );
}
