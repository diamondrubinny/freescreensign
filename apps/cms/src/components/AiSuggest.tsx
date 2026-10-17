import { useMutation, useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ApiError, get, post } from '../api/client';
import type { AiSettings } from '../api/types';
import { Alert } from './Alert';
import { Button } from './Button';

type Task = 'text' | 'alert' | 'translate';

/**
 * Writing suggestions with the organization's AI key (shown only when an admin turned it
 * on). The suggestion is shown first; nothing changes until the editor chooses to use it.
 */
export function AiSuggest({
  task,
  getText,
  onAccept,
  maxLength,
  controls,
}: {
  task: 'text' | 'alert';
  /** The field's current text (the prompt). */
  getText: () => string;
  onAccept: (text: string) => void;
  maxLength: number;
  /** Id of the field the suggestion goes into. */
  controls: string;
}) {
  const { t, i18n } = useTranslation();
  const { orgId = '' } = useParams();
  const id = useId();
  const [empty, setEmpty] = useState(false);
  const settings = useQuery({
    queryKey: ['ai', orgId],
    queryFn: () => get<{ ai: AiSettings }>(`/api/v1/orgs/${orgId}/ai`),
    staleTime: 60_000,
  });
  const suggest = useMutation({
    mutationFn: (kind: Task) =>
      post<{ suggestion: string }>(`/api/v1/orgs/${orgId}/ai/suggest`, {
        task: kind,
        prompt: getText().trim(),
        locale: i18n.language === 'en' ? 'en' : 'he',
      }),
  });
  if (!settings.data?.ai.enabled) return null;

  const run = (kind: Task) => {
    const text = getText().trim();
    setEmpty(!text);
    if (text) suggest.mutate(kind);
  };
  const reason =
    suggest.error instanceof ApiError
      ? (suggest.error.fields.find((field) => field.path === 'ai')?.reason ??
        (suggest.error.code === 'RATE_LIMITED' ? 'rate_limited' : 'unavailable'))
      : suggest.error
        ? 'unavailable'
        : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          aria-controls={controls}
          aria-describedby={`${id}-note`}
          loading={suggest.isPending && suggest.variables === task}
          onClick={() => {
            run(task);
          }}
        >
          <Sparkles aria-hidden="true" className="size-4" />
          {t('ai.suggest')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-controls={controls}
          aria-describedby={`${id}-note`}
          loading={suggest.isPending && suggest.variables === 'translate'}
          onClick={() => {
            run('translate');
          }}
        >
          {t(i18n.language === 'en' ? 'ai.translateToHebrew' : 'ai.translateToEnglish')}
        </Button>
      </div>
      <p id={`${id}-note`} className="text-sm text-gray-700 dark:text-gray-300">
        {t('ai.privacyNote')}
      </p>
      <div aria-live="polite" className="empty:hidden">
        {empty && <p className="text-sm font-medium">{t('ai.writeFirst')}</p>}
        {suggest.data && (
          <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2">
            <h3 id={`${id}-title`} className="text-sm font-semibold">
              {t('ai.suggestion')}
            </h3>
            <p
              dir="auto"
              className="whitespace-pre-wrap rounded-md bg-gray-50 p-2 dark:bg-gray-800"
            >
              {suggest.data.suggestion}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                aria-controls={controls}
                onClick={() => {
                  onAccept(suggest.data.suggestion.slice(0, maxLength));
                  suggest.reset();
                }}
              >
                {t('ai.use')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  suggest.reset();
                }}
              >
                {t('ai.dismiss')}
              </Button>
            </div>
          </section>
        )}
      </div>
      {reason && (
        <Alert variant="error">{t(`ai.errors.${reason}`, t('ai.errors.unavailable'))}</Alert>
      )}
    </div>
  );
}
