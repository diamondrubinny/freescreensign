import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ROLES, type Role } from '@rubinny/shared';
import { del, get, patch, post } from '../api/client';
import { useRefreshSession, useSession } from '../api/session';
import type { Invitation, Member } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { formatDate } from '../lib/format';
import { useFormErrors } from '../lib/use-form-errors';

export function MembersPage() {
  const { t, i18n } = useTranslation();
  const { orgId = '' } = useParams();
  const session = useSession().data;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const refreshSession = useRefreshSession();
  const myRole = session?.memberships.find((m) => m.orgId === orgId)?.role;
  const assignableRoles: readonly Role[] =
    myRole === 'OWNER' ? ROLES : ROLES.filter((r) => r !== 'OWNER');

  const members = useQuery({
    queryKey: ['members', orgId],
    queryFn: () => get<{ members: Member[] }>(`/api/v1/orgs/${orgId}/members`),
  });
  const invitations = useQuery({
    queryKey: ['invitations', orgId],
    queryFn: () => get<{ invitations: Invitation[] }>(`/api/v1/orgs/${orgId}/invitations`),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['members', orgId] }),
      queryClient.invalidateQueries({ queryKey: ['invitations', orgId] }),
    ]);

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      patch(`/api/v1/orgs/${orgId}/members/${userId}`, { role }),
    onSettled: refresh,
  });
  const [removing, setRemoving] = useState<Member | null>(null);
  const remove = useMutation({
    mutationFn: (userId: string) => del(`/api/v1/orgs/${orgId}/members/${userId}`),
    onSuccess: async (_data, userId) => {
      setRemoving(null);
      if (userId === session?.user.id) {
        await refreshSession();
        void navigate('/');
        return;
      }
      await refresh();
    },
  });
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const revoke = useMutation({
    mutationFn: (id: string) => del(`/api/v1/orgs/${orgId}/invitations/${id}`),
    onSuccess: () => {
      setRevoking(null);
      return refresh();
    },
  });
  const invite = useMutation({
    mutationFn: (body: { email: string; role: Role; locale: string }) =>
      post<{ invitation: Invitation; inviteUrl?: string }>(
        `/api/v1/orgs/${orgId}/invitations`,
        body,
      ),
    onSuccess: refresh,
  });

  const inviteErrors = useFormErrors(invite.error);
  const actionErrors = useFormErrors(changeRole.error ?? remove.error ?? revoke.error);
  const roleSelectId = useId();
  const listErrors = useFormErrors(members.error);

  return (
    <>
      <PageHeading title={t('members.title')} />
      {listErrors.form && <Alert variant="error">{listErrors.form}</Alert>}
      {actionErrors.form && <Alert variant="error">{actionErrors.form}</Alert>}
      {members.isPending && <Loading />}
      {members.data && (
        <div className="mb-10 overflow-x-auto">
          <table className="w-full border-collapse text-start">
            <caption className="sr-only">{t('members.title')}</caption>
            <thead>
              <tr className="border-b border-gray-400">
                <th scope="col" className="p-2 text-start">
                  {t('members.member')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {t('fields.role')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {t('members.mfa')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {t('members.joined')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {t('members.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {members.data.members.map((member) => {
                const self = member.userId === session?.user.id;
                const editable = myRole === 'OWNER' || member.role !== 'OWNER';
                return (
                  <tr key={member.userId} className="border-b border-gray-200 dark:border-gray-700">
                    <th scope="row" className="p-2 text-start font-normal">
                      <span className="font-semibold">{member.name}</span> {self && t('common.you')}
                      <br />
                      <span className="text-sm text-gray-700 dark:text-gray-300" dir="ltr">
                        {member.email}
                      </span>
                    </th>
                    <td className="p-2">
                      {editable ? (
                        <>
                          <label htmlFor={`${roleSelectId}-${member.userId}`} className="sr-only">
                            {t('members.changeRole', { name: member.name })}
                          </label>
                          <select
                            id={`${roleSelectId}-${member.userId}`}
                            value={member.role}
                            disabled={changeRole.isPending}
                            onChange={(event) => {
                              changeRole.mutate({
                                userId: member.userId,
                                role: event.target.value as Role,
                              });
                            }}
                            className="rounded-md border border-gray-400 bg-white px-2 py-1 dark:bg-gray-900"
                          >
                            {(member.role === 'OWNER' ? ROLES : assignableRoles).map((role) => (
                              <option key={role} value={role}>
                                {t(`roles.${role}`)}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        t(`roles.${member.role}`)
                      )}
                    </td>
                    <td className="p-2">{member.mfaEnabled ? t('common.yes') : t('common.no')}</td>
                    <td className="p-2">{formatDate(member.joinedAt, i18n.language)}</td>
                    <td className="p-2">
                      {(editable || self) && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setRemoving(member);
                          }}
                        >
                          {self ? t('members.leave') : t('members.remove')}
                          {!self && <span className="sr-only"> {member.name}</span>}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section aria-labelledby="invite-heading" className="mb-10 max-w-lg">
        <h2 id="invite-heading" className="mb-3 text-xl font-semibold">
          {t('members.inviteTitle')}
        </h2>
        <Form
          errors={inviteErrors}
          labelledBy="invite-heading"
          onSubmit={(data) => {
            invite.mutate({
              email: value(data, 'email'),
              role: value(data, 'role') as Role,
              locale: i18n.language,
            });
          }}
        >
          <Field
            label={t('fields.email')}
            name="email"
            type="email"
            required
            autoComplete="off"
            error={inviteErrors.fields.email}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="invite-role" className="font-medium">
              {t('fields.role')}
            </label>
            <select
              id="invite-role"
              name="role"
              defaultValue="EDITOR"
              className="rounded-md border border-gray-500 bg-white px-3 py-2 dark:bg-gray-900"
            >
              {assignableRoles.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" loading={invite.isPending}>
            {t('members.inviteSubmit')}
          </Button>
        </Form>
        {invite.isSuccess && (
          <div className="mt-4">
            {invite.data.inviteUrl ? (
              <Alert variant="info">
                <p>{t('members.inviteLink')}</p>
                <code className="block break-all" dir="ltr">
                  {invite.data.inviteUrl}
                </code>
              </Alert>
            ) : (
              <Alert variant="success">{t('members.invited')}</Alert>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="mb-3 text-xl font-semibold">
          {t('members.pending')}
        </h2>
        {invitations.data?.invitations.length === 0 && <p>{t('members.noPending')}</p>}
        <ul className="flex flex-col gap-2">
          {invitations.data?.invitations.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-300 p-3 dark:border-gray-700"
            >
              <span>
                <span dir="ltr">{inv.email}</span> · {t(`roles.${inv.role}`)} ·{' '}
                {t('members.expires')} {formatDate(inv.expiresAt, i18n.language)}
              </span>
              <Button
                variant="secondary"
                onClick={() => {
                  setRevoking(inv);
                }}
              >
                {t('members.revoke')}
                <span className="sr-only"> {inv.email}</span>
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <ConfirmDialog
        open={removing !== null}
        message={
          removing?.userId === session?.user.id
            ? t('members.leaveConfirm')
            : t('members.removeConfirm', { name: removing?.name ?? '' })
        }
        confirmLabel={
          removing?.userId === session?.user.id ? t('members.leave') : t('members.remove')
        }
        loading={remove.isPending}
        onCancel={() => {
          setRemoving(null);
        }}
        onConfirm={() => {
          if (removing) remove.mutate(removing.userId);
        }}
      />
      <ConfirmDialog
        open={revoking !== null}
        message={t('members.revokeConfirm', { email: revoking?.email ?? '' })}
        confirmLabel={t('members.revoke')}
        loading={revoke.isPending}
        onCancel={() => {
          setRevoking(null);
        }}
        onConfirm={() => {
          if (revoking) revoke.mutate(revoking.id);
        }}
      />
    </>
  );
}
