import { useMutation, useQueryClient } from '@tanstack/react-query';
import { designConfigSchema } from '@rubinny/shared';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { patch, post } from '../../api/client';
import type { WidgetItem } from '../../api/types';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Card, SectionHeading } from '../../components/ui';
import { useFormErrors } from '../../lib/use-form-errors';
import { DesignEditor } from './DesignEditor';
import { DesignPreview } from './DesignPreview';
import type { Design } from './model';
import { DESIGN_TEMPLATES, designTemplate, type DesignTemplate } from './templates';

/** Creating or editing a design widget: template choice (new), name, editor, save. */
export function DesignPage({
  orgId,
  widget,
  canEdit,
}: {
  orgId: string;
  widget: WidgetItem | undefined;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const existing = widget ? designConfigSchema.safeParse(widget.config) : null;
  const [initial, setInitial] = useState<Design | null>(existing?.success ? existing.data : null);
  const [name, setName] = useState(widget?.name ?? '');
  const [dirty, setDirty] = useState(false);
  const current = useRef<Design | null>(initial);
  const onValue = useCallback((design: Design) => {
    current.current = design;
  }, []);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), config: current.current };
      return widget
        ? patch<{ widget: WidgetItem }>(`/api/v1/orgs/${orgId}/widgets/${widget.id}`, body)
        : post<{ widget: WidgetItem }>(`/api/v1/orgs/${orgId}/widgets`, {
            ...body,
            type: 'design',
          });
    },
    onSuccess: async ({ widget: saved }) => {
      await queryClient.invalidateQueries({ queryKey: ['widgets', orgId] });
      setDirty(false);
      if (!widget) {
        void navigate(`/orgs/${orgId}/widgets/${saved.id}`, { state: { created: true } });
      } else {
        queryClient.setQueryData(['widget', orgId, saved.id], { widget: saved });
      }
    },
  });
  const errors = useFormErrors(save.error);

  if (!initial) {
    return (
      <section aria-labelledby="design-templates-heading">
        <SectionHeading
          id="design-templates-heading"
          title={t('designer.chooseTemplate')}
          description={t('designer.chooseTemplateText')}
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DESIGN_TEMPLATES.map((id: DesignTemplate) => {
            const design = designTemplate(id, t);
            return (
              <Card as="li" key={id} className="flex flex-col overflow-hidden">
                <DesignPreview design={design} label={t(`designer.templates.${id}`)} />
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <h3 className="font-bold">{t(`designer.templates.${id}`)}</h3>
                  <Button
                    variant="secondary"
                    className="mt-auto"
                    aria-label={`${t('designer.useTemplate')} ${t(`designer.templates.${id}`)}`}
                    onClick={() => {
                      const chosen = designTemplate(id, t);
                      current.current = chosen;
                      setName(t(`designer.templates.${id}`));
                      setInitial(chosen);
                    }}
                  >
                    {t('designer.useTemplate')}
                  </Button>
                </div>
              </Card>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {errors.form && <Alert variant="error">{errors.form}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label={t('widgets.name')}
          name="name"
          required
          maxLength={200}
          value={name}
          disabled={!canEdit}
          onChange={(event) => {
            setName(event.target.value);
          }}
          error={errors.fields.name}
          className="min-w-64 flex-1"
        />
        {canEdit && (
          <Button
            loading={save.isPending}
            onClick={() => {
              save.mutate();
            }}
          >
            {widget ? t('widgets.save') : t('widgets.create')}
          </Button>
        )}
        <span role="status" className="text-sm">
          {dirty ? t('designer.unsaved') : save.isSuccess ? t('widgets.saved') : ''}
        </span>
      </div>
      <DesignEditor
        orgId={orgId}
        initial={initial}
        readOnly={!canEdit}
        onDirtyChange={setDirty}
        value={onValue}
      />
    </div>
  );
}
