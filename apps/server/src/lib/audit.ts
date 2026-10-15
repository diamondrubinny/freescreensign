import type { Db } from '../db/database.js';

export type AuditAction =
  | 'setup.completed'
  | 'auth.register'
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'auth.email_verified'
  | 'auth.password_reset_requested'
  | 'auth.password_reset'
  | 'auth.password_changed'
  | 'auth.mfa.enabled'
  | 'auth.mfa.disabled'
  | 'auth.mfa.failure'
  | 'auth.mfa.recovery_code_used'
  | 'auth.mfa.recovery_codes_regenerated'
  | 'user.updated'
  | 'user.deleted'
  | 'user.exported'
  | 'user.session_revoked'
  | 'org.created'
  | 'org.updated'
  | 'member.role_changed'
  | 'member.removed'
  | 'invitation.created'
  | 'invitation.revoked'
  | 'invitation.accepted'
  | 'media.uploaded'
  | 'media.blocked'
  | 'media.renamed'
  | 'media.deleted'
  | 'screen.paired'
  | 'screen.updated'
  | 'screen.reloaded'
  | 'screen.removed'
  | 'playlist.created'
  | 'playlist.updated'
  | 'playlist.deleted'
  | 'widget.created'
  | 'widget.updated'
  | 'widget.deleted'
  | 'layout.created'
  | 'layout.updated'
  | 'layout.deleted'
  | 'schedule.created'
  | 'schedule.updated'
  | 'schedule.deleted';

export interface AuditEvent {
  action: AuditAction;
  orgId?: string | null;
  actorUserId?: string | null;
  targetType?: string;
  targetId?: string;
  ipHmac?: string | null;
  /** Never put secrets or unnecessary personal data here. */
  meta?: Record<string, unknown>;
}

export async function audit(db: Db, event: AuditEvent): Promise<void> {
  await db
    .insertInto('audit_logs')
    .values({
      action: event.action,
      org_id: event.orgId ?? null,
      actor_user_id: event.actorUserId ?? null,
      target_type: event.targetType ?? null,
      target_id: event.targetId ?? null,
      ip_hmac: event.ipHmac ?? null,
      meta: JSON.stringify(event.meta ?? {}),
    })
    .execute();
}
