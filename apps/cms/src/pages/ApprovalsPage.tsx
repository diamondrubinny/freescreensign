// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ApiError, get, post } from '../api/client';
import type { ApprovalItem } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { TableRegion } from '../components/TableRegion';
import { EmptyState, SectionHeading, StatusPill, inputClass } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { useFormErrors } from '../lib/use-form-errors';
import { useOrgRole } from '../lib/use-org-role';

const STATUS_TONES = {
  pending: 'amber',
  applying: 'brand',
  approved: 'green',
  rejected: 'red',
  withdrawn: 'gray',
} as const;

export function ApprovalsPage() {
  const { t, i18n } = useTranslation();
  const { orgId = '' } = useParams();
  const isAdmin = useOrgRole(orgId, 'ADMIN').allowed;
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<ApprovalItem | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const pending = useQuery({
    queryKey: ['approvals', orgId, 'pending'],
    queryFn: () => get<{ approvals: ApprovalItem[] }>(`/api/v1/orgs/${orgId}/approvals`),
  });
  const decided = useQuery({
    queryKey: ['approvals', orgId, 'decided'],
    queryFn: () =>
      get<{ approvals: ApprovalItem[] }>(`/api/v1/orgs/${orgId}/approvals?status=decided`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['approvals', orgId] });

  const decide = useMutation({
    mutationFn: ({
      item,
      action,
    }: {
      item: ApprovalItem;
      action: 'approve' | 'reject' | 'withdraw';
    }) =>
      post<{ approval: ApprovalItem }>(
        `/api/v1/orgs/${orgId}/approvals/${item.id}/${action}`,
        action === 'reject' ? { note: note.trim() || undefined } : {},
      ),
    onSuccess: (_, { action }) => {
      setRejecting(null);
      setNote('');
      setMessage(
        t(
          action === 'approve'
            ? 'approvals.approved'
            : action === 'reject'
              ? 'approvals.rejected'
              : 'approvals.withdrawn',
        ),
      );
      void refresh();
      // Approved content changed: lists elsewhere must reload.
      if (action === 'approve') void queryClient.invalidateQueries();
    },
  });
  const baseErrors = useFormErrors(decide.error);
  const errorText =
    decide.error instanceof ApiError &&
    decide.error.code === 'CONFLICT' &&
    decide.error.fields.some((field) => field.path === 'approval')
      ? t('approvals.stale')
      : baseErrors.form;

  const describe = (item: ApprovalItem) =>
    `${t(`approvals.kinds.${item.summary.kind}`)}${item.summary.name ? `: ${item.summary.name}` : ''}`;

  const table = (items: ApprovalItem[], withActions: boolean, label: string) => (
    <TableRegion label={label}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-300 dark:border-gray-700">
            <th scope="col" className="px-2 py-2 text-start">
              {t('approvals.item')}
            </th>
            <th scope="col" className="px-2 py-2 text-start">
              {t('approvals.change')}
            </th>
            <th scope="col" className="px-2 py-2 text-start">
              {t('approvals.requestedBy')}
            </th>
            <th scope="col" className="px-2 py-2 text-start">
              {t('approvals.requestedAt')}
            </th>
            <th scope="col" className="px-2 py-2 text-start">
              {t('approvals.status')}
            </th>
            {withActions && (
              <th scope="col" className="px-2 py-2 text-start">
                {t('approvals.actions')}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-gray-200 align-top dark:border-gray-800">
              <td className="px-2 py-2">
                <bdi>{describe(item)}</bdi>
              </td>
              <td className="px-2 py-2">{t(`approvals.actionsLabel.${item.summary.action}`)}</td>
              <td className="px-2 py-2">
                <bdi>{item.requestedBy ?? '—'}</bdi>
              </td>
              <td className="px-2 py-2 whitespace-nowrap">
                {formatDateTime(item.requestedAt, i18n.language)}
              </td>
              <td className="px-2 py-2">
                <StatusPill tone={STATUS_TONES[item.status]}>
                  {t(`approvals.statuses.${item.status}`)}
                </StatusPill>
                {item.note && (
                  <p className="mt-1 text-gray-700 dark:text-gray-300" dir="auto">
                    {item.note}
                  </p>
                )}
              </td>
              {withActions && (
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-2">
                    {item.status === 'applying' ? null : isAdmin ? (
                      <>
                        <Button
                          size="sm"
                          aria-label={`${t('approvals.approve')}: ${describe(item)}`}
                          loading={
                            decide.isPending &&
                            decide.variables.item.id === item.id &&
                            decide.variables.action === 'approve'
                          }
                          onClick={() => {
                            decide.mutate({ item, action: 'approve' });
                          }}
                        >
                          {t('approvals.approve')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={`${t('approvals.reject')}: ${describe(item)}`}
                          onClick={() => {
                            setRejecting(item);
                          }}
                        >
                          {t('approvals.reject')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`${t('approvals.withdraw')}: ${describe(item)}`}
                        onClick={() => {
                          decide.mutate({ item, action: 'withdraw' });
                        }}
                      >
                        {t('approvals.withdraw')}
                      </Button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </TableRegion>
  );

  return (
    <>
      <PageHeading
        title={t('approvals.title')}
        description={isAdmin ? t('approvals.introAdmin') : t('approvals.introEditor')}
      />
      <div aria-live="polite" className="mb-4 empty:hidden">
        {message && <Alert variant="success">{message}</Alert>}
      </div>
      {errorText && !rejecting && (
        <div className="mb-4">
          <Alert variant="error">{errorText}</Alert>
        </div>
      )}

      <section aria-labelledby="pending-heading" className="mb-10">
        <SectionHeading id="pending-heading" title={t('approvals.pending')} />
        {pending.isPending && <Loading />}
        {pending.data?.approvals.length === 0 && (
          <EmptyState
            icon={ClipboardCheck}
            title={t('approvals.none')}
            text={t('approvals.noneText')}
          />
        )}
        {pending.data &&
          pending.data.approvals.length > 0 &&
          table(pending.data.approvals, true, t('approvals.pending'))}
      </section>

      <section aria-labelledby="decided-heading">
        <SectionHeading id="decided-heading" title={t('approvals.decided')} />
        {decided.data?.approvals.length === 0 && <p>{t('approvals.noneDecided')}</p>}
        {decided.data &&
          decided.data.approvals.length > 0 &&
          table(decided.data.approvals, false, t('approvals.decided'))}
      </section>

      <Dialog
        open={rejecting !== null}
        onClose={() => {
          setRejecting(null);
        }}
        title={t('approvals.rejectTitle')}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setRejecting(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={decide.isPending}
              onClick={() => {
                if (rejecting) decide.mutate({ item: rejecting, action: 'reject' });
              }}
            >
              {t('approvals.reject')}
            </Button>
          </>
        }
      >
        {rejecting && (
          <p className="mb-3">
            <bdi>{describe(rejecting)}</bdi>
          </p>
        )}
        {errorText && rejecting && <Alert variant="error">{errorText}</Alert>}
        <label htmlFor="reject-note" className="mb-1 block font-medium">
          {t('approvals.rejectNote')}
        </label>
        <textarea
          id="reject-note"
          rows={3}
          maxLength={500}
          dir="auto"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
          className={`${inputClass} w-full`}
        />
      </Dialog>
    </>
  );
}
