// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMutation, useQuery } from '@tanstack/react-query';
import { LayoutTemplate, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  LAYOUT_TEMPLATE_IDS,
  templatePreview,
  templateZones,
  type LayoutTemplateId,
} from '@rubinny/shared';
import { get, post } from '../api/client';
import type { LayoutDetail, LayoutSummary } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { LayoutThumb } from '../components/LayoutThumb';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { Card, EmptyState, SectionHeading, inputClass, linkClass } from '../components/ui';
import type { Messages } from '../i18n/locales/he';
import { useFormErrors } from '../lib/use-form-errors';
import { useOrgRole } from '../lib/use-org-role';

type ZoneNameKey = keyof Messages['layouts']['zoneNames'];

const CANVAS = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
} as const;

/**
 * Starter kits (content lives on the server; see apps/server/src/modules/kits). Each has a
 * picture of it on a screen in public/kits (made by scripts/showcase).
 */
const KITS = [
  { id: 'restaurant', template: 'showcase', trade: true },
  { id: 'cafe', template: 'showcase', trade: true },
  { id: 'cinema', template: 'showcase', trade: true },
  { id: 'retail', template: 'l-bar', trade: true },
  { id: 'office', template: 'l-bar', trade: true },
  { id: 'hotel', template: 'showcase', trade: true },
  { id: 'community', template: 'header-main-footer', trade: true },
  { id: 'lobby', template: 'l-bar', trade: false },
  { id: 'menu', template: 'grid-2x2', trade: false },
  { id: 'info', template: 'header-main-footer', trade: false },
] as const;
type Kit = (typeof KITS)[number];

/** Template zones in percent → a 160×90 thumbnail. */
function TemplateThumb({
  template,
  portrait = false,
}: {
  template: LayoutTemplateId;
  portrait?: boolean;
}) {
  const [w, h] = portrait ? [90, 160] : [160, 90];
  return (
    <LayoutThumb
      width={w}
      height={h}
      zones={templatePreview(template).map((z) => ({
        x: (z.x / 100) * w,
        y: (z.y / 100) * h,
        w: (z.w / 100) * w,
        h: (z.h / 100) * h,
      }))}
    />
  );
}

/** A kit with its picture on a screen (or its zones when there is no picture). */
function KitCard({
  kit,
  loading,
  disabled,
  onCreate,
}: {
  kit: Kit;
  loading: boolean;
  disabled: boolean;
  onCreate: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [noPicture, setNoPicture] = useState(false);
  const name = t(`layouts.kits.${kit.id}.name`);
  return (
    <Card as="li" className="flex flex-col overflow-hidden">
      {noPicture ? (
        <div className="bg-gradient-to-br from-brand-900 to-gray-900 p-4">
          <TemplateThumb template={kit.template} />
        </div>
      ) : (
        <img
          src={`/kits/${kit.id}-${i18n.language === 'en' ? 'en' : 'he'}.webp`}
          alt={t('layouts.kitPreview', { name })}
          width={640}
          height={360}
          loading="lazy"
          className="aspect-video w-full bg-gray-900 object-cover"
          onError={() => {
            setNoPicture(true);
          }}
        />
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h4 className="flex items-center gap-2 text-lg font-bold">
          <Sparkles aria-hidden="true" className="size-4 text-amber-600 dark:text-amber-400" />
          {name}
        </h4>
        <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">
          {t(`layouts.kits.${kit.id}.description`)}
        </p>
        <Button
          loading={loading}
          disabled={disabled}
          aria-label={`${t('layouts.createKit')} ${name}`}
          onClick={onCreate}
        >
          {t('layouts.createKit')}
        </Button>
      </div>
    </Card>
  );
}

export function LayoutsPage() {
  const { t, i18n } = useTranslation();
  const { orgId = '' } = useParams();
  const navigate = useNavigate();
  const canEdit = useOrgRole(orgId).allowed;
  const [template, setTemplate] = useState<LayoutTemplateId>('main-ticker');
  const [orientation, setOrientation] = useState<keyof typeof CANVAS>('landscape');

  const list = useQuery({
    queryKey: ['layouts', orgId],
    queryFn: () => get<{ layouts: LayoutSummary[] }>(`/api/v1/orgs/${orgId}/layouts`),
  });
  const create = useMutation({
    mutationFn: (name: string) => {
      const canvas = CANVAS[orientation];
      const zones = templateZones(template, canvas).map((zone) => ({
        ...zone,
        name: t(`layouts.zoneNames.${zone.name as ZoneNameKey}`),
      }));
      return post<{ layout: LayoutDetail }>(`/api/v1/orgs/${orgId}/layouts`, {
        name,
        ...canvas,
        background: '#000000',
        zones,
      });
    },
    onSuccess: ({ layout }) => {
      void navigate(`/orgs/${orgId}/layouts/${layout.id}`);
    },
  });
  const kit = useMutation({
    mutationFn: (kitId: string) =>
      post<{ layout: { id: string } }>(`/api/v1/orgs/${orgId}/starter-kits/${kitId}`, {
        locale: i18n.language === 'en' ? 'en' : 'he',
      }),
    onSuccess: ({ layout }) => {
      void navigate(`/orgs/${orgId}/layouts/${layout.id}`);
    },
  });
  const errors = useFormErrors(create.error);
  const listErrors = useFormErrors(list.error ?? kit.error);

  return (
    <>
      <PageHeading title={t('layouts.title')} description={t('layouts.intro')} />
      {listErrors.form && (
        <div className="mb-6">
          <Alert variant="error">{listErrors.form}</Alert>
        </div>
      )}

      {canEdit && (
        <section aria-labelledby="kits-heading" className="mb-10">
          <SectionHeading
            id="kits-heading"
            title={t('layouts.kitsTitle')}
            description={t('layouts.kitsIntro')}
          />
          {[true, false].map((trade) => (
            <div key={String(trade)} className="mb-6">
              <h3 className="mb-3 text-lg font-bold">
                {t(trade ? 'layouts.kitsTradeTitle' : 'layouts.kitsGeneralTitle')}
              </h3>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {KITS.filter((k) => k.trade === trade).map((k) => (
                  <KitCard
                    key={k.id}
                    kit={k}
                    loading={kit.isPending && kit.variables === k.id}
                    disabled={kit.isPending}
                    onCreate={() => {
                      kit.mutate(k.id);
                    }}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {canEdit && (
        <section aria-labelledby="create-layout-heading" className="mb-10">
          <SectionHeading id="create-layout-heading" title={t('layouts.templateTitle')} />
          <Card className="p-5">
            <Form
              errors={errors}
              labelledBy="create-layout-heading"
              onSubmit={(data) => {
                create.mutate(value(data, 'name'));
              }}
            >
              <fieldset>
                <legend className="mb-2 font-medium">{t('layouts.template')}</legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
                  {LAYOUT_TEMPLATE_IDS.map((id) => (
                    <label
                      key={id}
                      className="flex cursor-pointer flex-col gap-2 rounded-lg border-2 border-gray-200 p-2 text-sm font-medium has-checked:border-brand-600 has-checked:bg-brand-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-700 dark:border-gray-700 dark:has-checked:bg-brand-950"
                    >
                      <input
                        type="radio"
                        name="template"
                        value={id}
                        checked={template === id}
                        onChange={() => {
                          setTemplate(id);
                        }}
                        className="sr-only"
                      />
                      <TemplateThumb template={id} portrait={orientation === 'portrait'} />
                      <span>{t(`layouts.templates.${id}`)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('layouts.name')} name="name" required error={errors.fields.name} />
                <div className="flex flex-col gap-1">
                  <label htmlFor="layout-orientation" className="font-medium">
                    {t('layouts.orientation')}
                  </label>
                  <select
                    id="layout-orientation"
                    name="orientation"
                    value={orientation}
                    onChange={(event) => {
                      setOrientation(event.target.value === 'portrait' ? 'portrait' : 'landscape');
                    }}
                    className={inputClass}
                  >
                    <option value="landscape">{t('layouts.landscape')}</option>
                    <option value="portrait">{t('layouts.portrait')}</option>
                  </select>
                </div>
              </div>
              <div>
                <Button type="submit" loading={create.isPending}>
                  {t('layouts.create')}
                </Button>
              </div>
            </Form>
          </Card>
        </section>
      )}

      <section aria-labelledby="layout-list-heading">
        <SectionHeading id="layout-list-heading" title={t('layouts.title')} />
        {list.isPending && <Loading />}
        {list.data?.layouts.length === 0 && (
          <EmptyState icon={LayoutTemplate} title={t('layouts.empty')} />
        )}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data?.layouts.map((layout) => (
            <Card as="li" key={layout.id} className="flex flex-col overflow-hidden">
              <div className="bg-gray-100 p-4 dark:bg-gray-800">
                <div className={layout.height > layout.width ? 'mx-auto w-1/3' : ''}>
                  <LayoutThumb width={layout.width} height={layout.height} zones={layout.zones} />
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <h3 className="text-lg font-bold" dir="auto">
                  {layout.name}
                </h3>
                <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                  {t('layouts.summary', {
                    width: layout.width,
                    height: layout.height,
                    zones: layout.zoneCount,
                    screens: layout.screenCount,
                  })}
                </p>
                <Link to={`/orgs/${orgId}/layouts/${layout.id}`} className={linkClass}>
                  {t('layouts.open')} <span className="sr-only">{layout.name}</span>
                </Link>
              </div>
            </Card>
          ))}
        </ul>
      </section>
    </>
  );
}
