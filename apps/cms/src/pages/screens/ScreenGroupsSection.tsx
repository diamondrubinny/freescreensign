// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { del, get, patch, post, put } from '../../api/client';
import type { ScreenGroup, ScreenItem } from '../../api/types';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ConfirmDialog, Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { Form, value } from '../../components/Form';
import { useFormErrors } from '../../lib/use-form-errors';
import { ContentSelect, KEEP } from './ContentSelect';

type Option = { id: string; name: string };

/** Checkboxes for the screens of a group (a named fieldset; keyboard and screen reader). */
function ScreenChoices({
  screens,
  selected,
  error,
}: {
  screens: ScreenItem[];
  selected: string[];
  error: string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <fieldset aria-describedby={error ? 'group-screens-error' : undefined}>
      <legend className="font-medium">{t('screenGroups.screens')}</legend>
      {screens.length === 0 ? (
        <p className="text-sm">{t('screenGroups.noScreens')}</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-2">
          {screens.map((screen) => (
            <label
              key={screen.id}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 has-checked:border-brand-600 has-checked:bg-brand-50 has-focus-visible:outline-2 has-focus-visible:outline-brand-700 dark:border-gray-600 dark:has-checked:bg-brand-950"
            >
              <input
                type="checkbox"
                name="screenIds"
                value={screen.id}
                defaultChecked={selected.includes(screen.id)}
                className="size-4"
              />
              <span dir="auto">{screen.name}</span>
            </label>
          ))}
        </div>
      )}
      {error && (
        <p id="group-screens-error" className="text-sm font-medium text-red-800 dark:text-red-300">
          {error}
        </p>
      )}
    </fieldset>
  );
}

const screenError = (fields: Record<string, string>) =>
  Object.entries(fields).find(([path]) => path.startsWith('screenIds'))?.[1];

/**
 * Screen groups ("Floor 2"): many screens get the same layout, playlist or schedule at once.
 * Naming a group and choosing its screens changes nothing on screen.
 */
export function ScreenGroupsSection({
  orgId,
  screens,
  canEdit,
  playlists,
  layouts,
  schedules,
  onContentChanged,
}: {
  orgId: string;
  screens: ScreenItem[];
  canEdit: boolean;
  playlists: Option[];
  layouts: Option[];
  schedules: Option[];
  onContentChanged: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const groups = useQuery({
    queryKey: ['screen-groups', orgId],
    queryFn: () => get<{ groups: ScreenGroup[] }>(`/api/v1/orgs/${orgId}/screen-groups`),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['screen-groups', orgId] });
    await queryClient.invalidateQueries({ queryKey: ['screens', orgId] });
  };
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ScreenGroup | null>(null);
  const [assigning, setAssigning] = useState<ScreenGroup | null>(null);
  const [removing, setRemoving] = useState<ScreenGroup | null>(null);

  const create = useMutation({
    mutationFn: (body: { name: string; screenIds: string[] }) =>
      post(`/api/v1/orgs/${orgId}/screen-groups`, body),
    onSuccess: async () => {
      setCreating(false);
      await refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; screenIds: string[] }) =>
      patch(`/api/v1/orgs/${orgId}/screen-groups/${id}`, body),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const assign = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, string | null>) =>
      put<{ updated: number }>(`/api/v1/orgs/${orgId}/screen-groups/${id}/content`, body),
    onSuccess: async () => {
      setAssigning(null);
      await onContentChanged();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/v1/orgs/${orgId}/screen-groups/${id}`),
    onSuccess: async () => {
      setRemoving(null);
      await refresh();
    },
  });
  const createErrors = useFormErrors(create.error);
  const updateErrors = useFormErrors(update.error);
  const assignErrors = useFormErrors(assign.error);
  const listErrors = useFormErrors(groups.error ?? remove.error);
  const nameOf = new Map(screens.map((screen) => [screen.id, screen.name]));

  return (
    <section aria-labelledby="screen-groups-heading" className="mb-8">
      <h2 id="screen-groups-heading" className="mb-1 text-xl font-semibold">
        {t('screenGroups.title')}
      </h2>
      <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">{t('screenGroups.intro')}</p>
      {listErrors.form && <Alert variant={listErrors.variant}>{listErrors.form}</Alert>}
      {assign.isSuccess && (
        <Alert variant="success">
          {t('screenGroups.assigned', { count: assign.data.updated })}
        </Alert>
      )}
      {groups.data?.groups.length === 0 && <p>{t('screenGroups.empty')}</p>}
      {groups.data && groups.data.groups.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {groups.data.groups.map((group) => (
            <li
              key={group.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <span className="flex min-w-40 flex-1 flex-col">
                <span className="font-semibold" dir="auto">
                  {group.name}
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300" dir="auto">
                  {group.screenIds.length === 0
                    ? t('screenGroups.noMembers')
                    : t('screenGroups.members', {
                        count: group.screenIds.length,
                        names: group.screenIds.map((id) => nameOf.get(id) ?? '').join(', '),
                      })}
                </span>
              </span>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={group.screenIds.length === 0}
                    onClick={() => {
                      assign.reset();
                      setAssigning(group);
                    }}
                  >
                    {t('screenGroups.assign')}
                    <span className="sr-only">{` ${group.name}`}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      update.reset();
                      setEditing(group);
                    }}
                  >
                    {t('screenGroups.edit')}
                    <span className="sr-only">{` ${group.name}`}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      remove.reset();
                      setRemoving(group);
                    }}
                  >
                    {t('screenGroups.delete')}
                    <span className="sr-only">{` ${group.name}`}</span>
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <Button
          variant="secondary"
          onClick={() => {
            create.reset();
            setCreating(true);
          }}
        >
          {t('screenGroups.create')}
        </Button>
      )}

      <Dialog
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? t('screenGroups.editTitle') : t('screenGroups.createTitle')}
        footer={<></>}
      >
        {(creating || editing) && (
          <Form
            errors={editing ? updateErrors : createErrors}
            onSubmit={(data) => {
              const body = {
                name: value(data, 'name'),
                screenIds: data.getAll('screenIds').map(String),
              };
              if (editing) update.mutate({ id: editing.id, ...body });
              else create.mutate(body);
            }}
          >
            <Field
              label={t('screenGroups.name')}
              name="name"
              required
              maxLength={100}
              defaultValue={editing?.name ?? ''}
              error={(editing ? updateErrors : createErrors).fields.name}
            />
            <ScreenChoices
              screens={screens}
              selected={editing?.screenIds ?? []}
              error={screenError((editing ? updateErrors : createErrors).fields)}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={create.isPending || update.isPending}>
                {t('screenGroups.save')}
              </Button>
            </div>
          </Form>
        )}
      </Dialog>

      <Dialog
        open={assigning !== null}
        onClose={() => {
          setAssigning(null);
        }}
        title={assigning ? t('screenGroups.assignTitle', { name: assigning.name }) : ''}
        footer={<></>}
      >
        {assigning && (
          <Form
            errors={assignErrors}
            onSubmit={(data) => {
              const body: Record<string, string | null> = {};
              for (const key of ['layoutId', 'playlistId', 'scheduleId']) {
                const chosen = value(data, key);
                if (chosen !== KEEP) body[key] = chosen || null;
              }
              assign.mutate({ id: assigning.id, ...body });
            }}
          >
            <p className="text-sm">
              {t('screenGroups.assignHint', { count: assigning.screenIds.length })}
            </p>
            <ContentSelect
              id="group-layout"
              name="layoutId"
              label={t('screens.layout')}
              emptyLabel={t('screens.noLayout')}
              keepLabel={t('screenGroups.keep')}
              options={layouts}
              defaultValue={null}
            />
            <ContentSelect
              id="group-playlist"
              name="playlistId"
              label={t('screens.playlist')}
              emptyLabel={t('screens.noPlaylist')}
              keepLabel={t('screenGroups.keep')}
              options={playlists}
              defaultValue={null}
            />
            <ContentSelect
              id="group-schedule"
              name="scheduleId"
              label={t('screens.schedule')}
              emptyLabel={t('screens.noSchedule')}
              keepLabel={t('screenGroups.keep')}
              options={schedules}
              defaultValue={null}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setAssigning(null);
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={assign.isPending}>
                {t('screenGroups.assignSave')}
              </Button>
            </div>
          </Form>
        )}
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        message={removing ? t('screenGroups.deleteConfirm', { name: removing.name }) : ''}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
        onCancel={() => {
          setRemoving(null);
        }}
        onConfirm={() => {
          if (removing) remove.mutate(removing.id);
        }}
      />
    </section>
  );
}
