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
  attribution?: string | null;
  sourceUrl?: string | null;
  createdAt: string;
  fileUrl?: string;
  thumbnailUrl?: string | null;
}

export type Orientation = 'landscape' | 'portrait' | 'landscape-flipped' | 'portrait-flipped';

export interface ScreenItem {
  id: string;
  name: string;
  playlistId: string | null;
  playlistName: string | null;
  /** When set, the layout replaces the playlist. */
  layoutId: string | null;
  layoutName: string | null;
  orientation: Orientation;
  online: boolean;
  lastSeenAt: string | null;
  playerVersion: string | null;
  resolution: string | null;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  itemCount: number;
  screenCount: number;
  updatedAt: string;
}

export type PlaylistEntry =
  | {
      kind: 'media';
      mediaId: string;
      name: string;
      mediaKind: 'image' | 'video';
      status: string | null;
      fit: 'contain' | 'cover' | 'blur';
      durationMs: number | null;
      effectiveDurationMs: number;
      thumbnailUrl: string | null;
    }
  | {
      kind: 'widget';
      widgetId: string;
      widgetType: string;
      name: string;
      durationMs: number | null;
      effectiveDurationMs: number;
    };

export interface PlaylistDetail {
  id: string;
  name: string;
  updatedAt: string;
  screens: { id: string; name: string }[];
  items: PlaylistEntry[];
}

export interface WidgetItem {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  /** Number of playlists using the widget. */
  usage: number;
  updatedAt: string;
}

export interface WidgetTypes {
  types: { type: string; available: boolean; serverData: boolean }[];
  weather: { enabled: boolean; attribution: string };
}

export interface WidgetData {
  type: 'rss' | 'weather';
  data: unknown;
  fetchedAt: string;
  stale: boolean;
}

export interface LayoutSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  zones: { x: number; y: number; w: number; h: number }[];
  zoneCount: number;
  screenCount: number;
  updatedAt: string;
}

export interface LayoutZone {
  id?: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  playlistId: string | null;
  playlistName?: string | null;
}

export interface LayoutDetail {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  updatedAt: string;
  screens: { id: string; name: string }[];
  zones: LayoutZone[];
}
