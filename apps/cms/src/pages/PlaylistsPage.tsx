// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { hasRole } from '@rubinny/shared';
import { get, post } from '../api/client';
import { useSession } from '../api/session';
import type { PlaylistDetail, PlaylistSummary } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { useFormErrors } from '../lib/use-form-errors';

export function PlaylistsPage() {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const navigate = useNavigate();
  const session = useSession().data;
  const role = session?.memberships.find((m) => m.orgId === orgId)?.role;
  const canEdit = role ? hasRole(role, 'EDITOR') : false;
  const list = useQuery({
    queryKey: ['playlists', orgId],
    queryFn: () => get<{ playlists: PlaylistSummary[] }>(`/api/v1/orgs/${orgId}/playlists`),
  });
  const create = useMutation({
    mutationFn: (name: string) =>
      post<{ playlist: PlaylistDetail }>(`/api/v1/orgs/${orgId}/playlists`, { name }),
    onSuccess: ({ playlist }) => {
      void navigate(`/orgs/${orgId}/playlists/${playlist.id}`);
    },
  });
  const errors = useFormErrors(create.error);
  const listErrors = useFormErrors(list.error);

  return (
    <>
      <PageHeading title={t('playlists.title')} />
      {listErrors.form && <Alert variant="error">{listErrors.form}</Alert>}
      {canEdit && (
        <section aria-labelledby="create-playlist-heading" className="mb-8 max-w-lg">
          <h2 id="create-playlist-heading" className="mb-3 text-xl font-semibold">
            {t('playlists.create')}
          </h2>
          <Form
            errors={errors}
            labelledBy="create-playlist-heading"
            onSubmit={(data) => {
              create.mutate(value(data, 'name'));
            }}
          >
            <Field label={t('playlists.name')} name="name" required error={errors.fields.name} />
            <Button type="submit" loading={create.isPending}>
              {t('playlists.create')}
            </Button>
          </Form>
        </section>
      )}
      {list.isPending && <Loading />}
      {list.data?.playlists.length === 0 && <p>{t('playlists.empty')}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.data?.playlists.map((p) => (
          <li
            key={p.id}
            className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 dark:border-gray-800 dark:bg-gray-900"
          >
            <h3 className="text-lg font-semibold" dir="auto">
              {p.name}
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('playlists.items', { count: p.itemCount })} ·{' '}
              {t('playlists.usedBy', { count: p.screenCount })}
            </p>
            <Link
              to={`/orgs/${orgId}/playlists/${p.id}`}
              className="mt-2 inline-block text-brand-700 underline dark:text-brand-300"
            >
              {t('playlists.open')} <span className="sr-only">{p.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
