import type { Kysely, Selectable } from 'kysely';
import type { AppContext } from '../../context.js';
import type { Database, InvitationsTable } from '../../db/schema.js';
import { sha256Hex } from '../../lib/crypto.js';

export type Invitation = Selectable<InvitationsTable>;

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function findValidInvitation(
  ctx: AppContext,
  token: string,
): Promise<Invitation | undefined> {
  return ctx.db
    .selectFrom('invitations')
    .innerJoin('organizations', 'organizations.id', 'invitations.org_id')
    .selectAll('invitations')
    .where('invitations.token_hash', '=', sha256Hex(token))
    .where('invitations.accepted_at', 'is', null)
    .where('invitations.revoked_at', 'is', null)
    .where('invitations.expires_at', '>', new Date())
    .where('organizations.deleted_at', 'is', null)
    .executeTakeFirst();
}

/**
 * Marks the invitation accepted (only once, atomically) and adds the membership.
 * Returns false if the invitation was already used concurrently.
 */
export async function acceptInvitation(
  trx: Kysely<Database>,
  invitation: Invitation,
  userId: string,
): Promise<boolean> {
  const marked = await trx
    .updateTable('invitations')
    .set({ accepted_at: new Date() })
    .where('id', '=', invitation.id)
    .where('accepted_at', 'is', null)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  if (marked.numUpdatedRows === 0n) return false;
  await trx
    .insertInto('memberships')
    .values({ org_id: invitation.org_id, user_id: userId, role: invitation.role })
    .onConflict((oc) => oc.columns(['org_id', 'user_id']).doNothing())
    .execute();
  return true;
}
