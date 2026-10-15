import type { Locale, Role } from '@rubinny/shared';

export interface User {
  id: string;
  email: string;
  name: string;
  locale: Locale;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

export interface MembershipSummary {
  orgId: string;
  name: string;
  role: Role;
  requireAdminMfa: boolean;
}

export interface SessionInfo {
  user: User;
  memberships: MembershipSummary[];
}

export type LoginResult =
  ({ mfaRequired: false } & SessionInfo) | { mfaRequired: true; mfaToken: string };

export interface Org {
  id: string;
  name: string;
  role: Role;
  requireAdminMfa: boolean;
}

export interface Member {
  userId: string;
  email: string;
  name: string;
  role: Role;
  mfaEnabled: boolean;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  deliveredByEmail: boolean;
  expiresAt: string;
  createdAt?: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface UserSession {
  id: string;
  current: boolean;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export type MediaStatus = 'uploading' | 'queued' | 'processing' | 'ready' | 'blocked' | 'failed';

export interface MediaItem {
  id: string;
  name: string;
  originalFilename: string;
  kind: 'image' | 'video';
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  status: MediaStatus;
  failureReason: string | null;
  createdAt: string;
  fileUrl?: string;
  thumbnailUrl?: string | null;
}
