// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { ColumnType, Generated, Insertable, Selectable } from 'kysely';
import type {
  ItemWindow,
  NowPlayingItem,
  PlayerCapability,
  PlayerPlatform,
  Role,
  Wall,
} from '@rubinny/shared';

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
  /** False for accounts created through SSO until a password is set. */
  password_login: Generated<boolean>;
  /** Operator of the installation: sees the server status page. */
  is_operator: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: NullableTimestamp;
}

export interface BackupRunsTable {
  id: Generated<string>;
  finished_at: Generated<Date>;
  size_bytes: ColumnType<string, number | string, number | string>;
  encrypted: boolean;
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
  require_approval: Generated<boolean>;
  offline_alerts: Generated<boolean>;
  offline_alert_minutes: Generated<number>;
  /** Writing suggestions: the organization's API key (encrypted), hint and model. */
  ai_key_enc: Buffer | null;
  ai_key_hint: string | null;
  ai_model: Generated<'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5'>;
  ai_enabled_at: NullableTimestamp;
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
  source_url: Generated<string | null>;
  attribution: Generated<string | null>;
}

export interface PlaylistsTable {
  id: Generated<string>;
  org_id: string;
  name: string;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PlaylistItemsTable {
  id: Generated<string>;
  playlist_id: string;
  position: number;
  media_id: string | null;
  widget_id: string | null;
  duration_ms: number | null;
  fit: Generated<'contain' | 'cover' | 'blur'>;
  /** When the item is shown; null: always (jsonb). */
  time_window: ColumnType<ItemWindow | null, string | null | undefined, string | null>;
}

export interface WidgetsTable {
  id: Generated<string>;
  org_id: string;
  type: string;
  name: string;
  /** Validated against the widget type's schema on write; jsonb. */
  config: ColumnType<Record<string, unknown>, string, string>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LayoutsTable {
  id: Generated<string>;
  org_id: string;
  name: string;
  width: number;
  height: number;
  background: Generated<string>;
  idle_seconds: Generated<number>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LayoutZonesTable {
  id: Generated<string>;
  layout_id: string;
  position: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: Generated<number>;
  playlist_id: string | null;
  action_type: 'layout' | 'back' | null;
  action_layout_id: string | null;
  label: string | null;
}

export type ScreenOrientation = 'landscape' | 'portrait' | 'landscape-flipped' | 'portrait-flipped';

export interface ScreenGroupsTable {
  id: Generated<string>;
  org_id: string;
  name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ScreenGroupMembersTable {
  org_id: string;
  group_id: string;
  screen_id: string;
}

export interface ScreensTable {
  id: Generated<string>;
  org_id: string;
  name: string;
  token_hash: string;
  playlist_id: string | null;
  layout_id: Generated<string | null>;
  schedule_id: Generated<string | null>;
  orientation: Generated<ScreenOrientation>;
  timezone: Generated<string>;
  last_seen_at: NullableTimestamp;
  player_version: string | null;
  resolution: string | null;
  manifest_version: string | null;
  /** Device clock minus server clock, as last measured by the player. */
  clock_offset_ms: number | null;
  current_layout_id: string | null;
  now_playing: ColumnType<NowPlayingItem[] | null, string | null | undefined, string | null>;
  offline_alerted_at: NullableTimestamp;
  platform: Generated<PlayerPlatform>;
  capabilities: Generated<PlayerCapability[]>;
  screenshot_request_id: string | null;
  screenshot_requested_at: NullableTimestamp;
  /** Video wall placement (shared `wallSchema`), or null. */
  wall: ColumnType<Wall | null, string | null | undefined, string | null>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SchedulesTable {
  id: Generated<string>;
  org_id: string;
  name: string;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ScheduleEntriesTable {
  id: Generated<string>;
  schedule_id: string;
  position: number;
  name: string;
  layout_id: string | null;
  playlist_id: string | null;
  /** PostgreSQL `date`: select it as `date_from::text` (YYYY-MM-DD); pg would build a local Date. */
  date_from: string | null;
  date_to: string | null;
  days_of_week: Generated<number[]>;
  time_from: string | null;
  time_to: string | null;
  enabled: Generated<boolean>;
}

export interface ScreenUptimeDaysTable {
  screen_id: string;
  day: string;
  slots: Generated<string>;
}

export interface ScreenScreenshotsTable {
  screen_id: string;
  image: Buffer;
  width: number;
  height: number;
  taken_at: Generated<Date>;
}

export type ApprovalStatus = 'pending' | 'applying' | 'approved' | 'rejected' | 'withdrawn';

export interface ApprovalSummary {
  kind: string;
  /** The name of the item when requested. */
  name: string | null;
  action: 'update' | 'items' | 'delete';
}

export interface ApprovalRequestsTable {
  id: Generated<string>;
  org_id: string;
  method: 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  /** The request body (JSON), or null for DELETE. */
  body: ColumnType<unknown, string | null, string | null>;
  summary: ColumnType<ApprovalSummary, string, string>;
  status: Generated<ApprovalStatus>;
  requested_by: string | null;
  requested_at: Generated<Date>;
  decided_by: string | null;
  decided_at: Date | null;
  note: string | null;
}

export interface UserIdentitiesTable {
  id: Generated<string>;
  user_id: string;
  issuer: string;
  subject: string;
  email: string;
  created_at: Generated<Date>;
  last_used_at: Generated<Date>;
}

export interface AlertsTable {
  id: Generated<string>;
  org_id: string;
  style: 'emergency' | 'notice';
  title: string;
  message: Generated<string>;
  screen_ids: string[] | null;
  starts_at: Generated<Date>;
  ends_at: Date | null;
  ended_at: Date | null;
  created_by: string | null;
  ended_by: string | null;
  created_at: Generated<Date>;
}

export interface PlayEventsTable {
  id: string;
  org_id: string;
  screen_id: string;
  media_id: string | null;
  widget_id: string | null;
  content_kind: 'media' | 'widget';
  content_name: string;
  zone_id: string;
  started_at: Timestamp;
  duration_ms: number;
  received_at: Generated<Date>;
}

export interface PairingCodesTable {
  code_hash: string;
  poll_token_hash: string;
  screen_id: string | null;
  device_token_enc: Buffer | null;
  expires_at: Timestamp;
  created_at: Generated<Date>;
}

export interface Database {
  users: UsersTable;
  backup_runs: BackupRunsTable;
  recovery_codes: RecoveryCodesTable;
  sessions: SessionsTable;
  user_tokens: UserTokensTable;
  organizations: OrganizationsTable;
  memberships: MembershipsTable;
  invitations: InvitationsTable;
  audit_logs: AuditLogsTable;
  media: MediaTable;
  playlists: PlaylistsTable;
  playlist_items: PlaylistItemsTable;
  screens: ScreensTable;
  screen_groups: ScreenGroupsTable;
  screen_group_members: ScreenGroupMembersTable;
  pairing_codes: PairingCodesTable;
  widgets: WidgetsTable;
  layouts: LayoutsTable;
  layout_zones: LayoutZonesTable;
  schedules: SchedulesTable;
  schedule_entries: ScheduleEntriesTable;
  screen_uptime_days: ScreenUptimeDaysTable;
  play_events: PlayEventsTable;
  screen_screenshots: ScreenScreenshotsTable;
  alerts: AlertsTable;
  user_identities: UserIdentitiesTable;
  approval_requests: ApprovalRequestsTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type Organization = Selectable<OrganizationsTable>;
export type Membership = Selectable<MembershipsTable>;

export type Media = Selectable<MediaTable>;
export type Screen = Selectable<ScreensTable>;
export type Playlist = Selectable<PlaylistsTable>;
export type Widget = Selectable<WidgetsTable>;
export type Layout = Selectable<LayoutsTable>;
export type LayoutZone = Selectable<LayoutZonesTable>;
export type Schedule = Selectable<SchedulesTable>;
export type ScheduleEntry = Selectable<ScheduleEntriesTable>;
