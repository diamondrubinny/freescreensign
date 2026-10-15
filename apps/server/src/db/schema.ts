import type { ColumnType, Generated, Insertable, Selectable } from 'kysely';
import type { Role } from '@rubinny/shared';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;

export interface UsersTable {
  id: Generated<string>;
  email: string;
  name: string;
  password_hash: string;
  email_verified_at: NullableTimestamp;
  locale: Generated<string>;
  mfa_secret_enc: Buffer | null;
  mfa_pending_secret_enc: Buffer | null;
  mfa_enabled_at: NullableTimestamp;
  /** Last accepted TOTP time step, for replay protection. Stored as bigint; returned as string by pg. */
  mfa_last_step: ColumnType<
    string | null,
    number | string | null | undefined,
    number | string | null
  >;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: NullableTimestamp;
}

export interface RecoveryCodesTable {
  id: Generated<string>;
  user_id: string;
  code_hash: string;
  used_at: NullableTimestamp;
  created_at: Generated<Date>;
}

export interface SessionsTable {
  id_hash: string;
  user_id: string;
  created_at: Generated<Date>;
  expires_at: Timestamp;
  absolute_expires_at: Timestamp;
  last_seen_at: Timestamp;
  ip_hmac: string | null;
  user_agent: string | null;
}

export type TokenPurpose = 'verify_email' | 'reset_password' | 'mfa_challenge';

export interface UserTokensTable {
  token_hash: string;
  user_id: string;
  purpose: TokenPurpose;
  expires_at: Timestamp;
  used_at: NullableTimestamp;
  attempts: Generated<number>;
  created_at: Generated<Date>;
}

export interface OrganizationsTable {
  id: Generated<string>;
  name: string;
  require_admin_mfa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: NullableTimestamp;
}

export interface MembershipsTable {
  id: Generated<string>;
  org_id: string;
  user_id: string;
  role: Role;
  created_at: Generated<Date>;
}

export interface InvitationsTable {
  id: Generated<string>;
  org_id: string;
  email: string;
  role: Role;
  token_hash: string;
  invited_by: string | null;
  delivered_by_email: boolean;
  expires_at: Timestamp;
  accepted_at: NullableTimestamp;
  revoked_at: NullableTimestamp;
  created_at: Generated<Date>;
}

export interface AuditLogsTable {
  id: Generated<string>;
  org_id: string | null;
  actor_user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip_hmac: string | null;
  meta: ColumnType<Record<string, unknown>, string | undefined, string>;
  created_at: Generated<Date>;
}

export interface MediaTable {
  id: Generated<string>;
  org_id: string;
  name: string;
  original_filename: string;
  kind: 'image' | 'video';
  mime: string;
  /** bigint: returned as string by pg. */
  size_bytes: ColumnType<string, number | string | undefined, number | string>;
  sha256: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  status: 'uploading' | 'queued' | 'processing' | 'ready' | 'blocked' | 'failed';
  failure_reason: string | null;
  quarantine_key: string | null;
  storage_key: string | null;
  thumbnail_key: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: NullableTimestamp;
}

export interface Database {
  users: UsersTable;
  recovery_codes: RecoveryCodesTable;
  sessions: SessionsTable;
  user_tokens: UserTokensTable;
  organizations: OrganizationsTable;
  memberships: MembershipsTable;
  invitations: InvitationsTable;
  audit_logs: AuditLogsTable;
  media: MediaTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type Organization = Selectable<OrganizationsTable>;
export type Membership = Selectable<MembershipsTable>;

export type Media = Selectable<MediaTable>;
