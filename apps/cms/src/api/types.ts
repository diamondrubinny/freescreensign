import type { ItemWindow, Locale, Role } from '@rubinny/shared';

export interface User {
  id: string;
  email: string;
  name: string;
  locale: Locale;
  emailVerified: boolean;
  mfaEnabled: boolean;
  /** False for accounts created through SSO that have not set a password. */
  hasPassword: boolean;
  createdAt: string;
}

export interface LinkedIdentity {
  id: string;
  issuer: string;
  email: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface MembershipSummary {
  orgId: string;
  name: string;
  role: Role;
  requireAdminMfa: boolean;
  /** Editors' changes wait for an admin (shows the approvals page). */
  requireApproval: boolean;
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
  /** Editors' changes to what screens show wait for an admin. */
  requireApproval: boolean;
  /** E-mail owners and admins when a screen stays offline. */
  offlineAlerts: boolean;
  offlineAlertMinutes: number;
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
  /** When set, the schedule switches content at set times. */
  scheduleId: string | null;
  scheduleName: string | null;
  orientation: Orientation;
  timezone: string;
  online: boolean;
  lastSeenAt: string | null;
  playerVersion: string | null;
  resolution: string | null;
  /** Device clock minus server clock (ms), as last measured by the player. */
  clockOffsetMs: number | null;
  /** Place in a video wall (0-based cell), or null. */
  wall: ScreenWall | null;
  /** The groups the screen is in (in the list of screens). */
  groupIds?: string[];
}

export interface ScreenGroup {
  id: string;
  name: string;
  screenIds: string[];
}

export interface ScreenWall {
  columns: number;
  rows: number;
  column: number;
  row: number;
  bezelX: number;
  bezelY: number;
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
      /** When the item is shown; null: always. */
      window: ItemWindow | null;
    }
  | {
      kind: 'widget';
      widgetId: string;
      widgetType: string;
      name: string;
      durationMs: number | null;
      effectiveDurationMs: number;
      window: ItemWindow | null;
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

export interface ApprovalItem {
  id: string;
  status: 'pending' | 'applying' | 'approved' | 'rejected' | 'withdrawn';
  summary: {
    kind: 'playlist' | 'widget' | 'layout' | 'schedule' | 'screen' | 'media';
    name: string | null;
    action: 'update' | 'items' | 'delete';
  };
  requestedBy: string | null;
  requestedById: string | null;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
}

export interface AlertItem {
  id: string;
  style: 'emergency' | 'notice';
  title: string;
  message: string;
  /** null: every screen of the organization. */
  screenIds: string[] | null;
  startsAt: string;
  endsAt: string | null;
  endedAt: string | null;
  active: boolean;
  createdBy: string | null;
  endedBy: string | null;
  createdAt: string;
}

export interface WidgetTypes {
  types: { type: string; available: boolean; serverData: boolean }[];
  weather: { enabled: boolean; attribution: string };
}

export interface WidgetData {
  type: 'rss' | 'weather' | 'table';
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
  action?: ZoneAction | null;
  label?: string | null;
}

/** Writing suggestions with the organization's own AI key. */
export interface AiSettings {
  enabled: boolean;
  model: string;
  models: string[];
  /** Admins only: the last characters of the key. */
  keyHint?: string | null;
  enabledAt?: string | null;
}

/** Touch screens: what a tap on a zone does. */
export type ZoneAction = { type: 'layout'; layoutId: string } | { type: 'back' };

export interface LayoutDetail {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  idleSeconds: number;
  updatedAt: string;
  screens: { id: string; name: string }[];
  zones: LayoutZone[];
}

export interface ScheduleSummary {
  id: string;
  name: string;
  entryCount: number;
  screenCount: number;
  updatedAt: string;
}

/** One schedule entry as the API accepts it (position in the list = priority). */
export interface ScheduleEntryInput {
  name: string;
  layoutId: string | null;
  playlistId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  daysOfWeek: number[];
  timeFrom: string | null;
  timeTo: string | null;
  enabled: boolean;
}

export interface ScheduleEntry extends ScheduleEntryInput {
  id: string;
  layoutName: string | null;
  playlistName: string | null;
}

export interface ScheduleDetail {
  id: string;
  name: string;
  updatedAt: string;
  screens: { id: string; name: string; timezone: string }[];
  entries: ScheduleEntry[];
}

export type NowPlayingEntry =
  | {
      zoneId: string;
      kind: 'media';
      id: string;
      name: string;
      mediaKind: 'image' | 'video';
      thumbnailUrl: string | null;
    }
  | { zoneId: string; kind: 'widget'; id: string; name: string; widgetType: string };

export interface ScreenStatus {
  online: boolean;
  lastSeenAt: string | null;
  clockOffsetMs: number | null;
  clockOk: boolean | null;
  uptime: { day: number | null; week: number | null; hours: (number | null)[] };
  layout: { kind: 'layout' | 'playlist' | 'default'; name: string | null } | null;
  nowPlaying: NowPlayingEntry[];
  /** Where the player runs: a browser or a native wrapper. */
  platform: 'web' | 'electron' | 'android';
  capabilities: string[];
  screenshot: { takenAt: string; width: number; height: number } | null;
  screenshotPending: boolean;
}

export interface PlayReportItem {
  kind: 'media' | 'widget';
  /** Null when the content was deleted (the name is kept). */
  contentId: string | null;
  name: string;
  plays: number;
  durationMs: number;
  screens: number;
}

export interface PlayReport {
  from: string;
  to: string;
  timeZone: string;
  totals: { plays: number; durationMs: number };
  items: PlayReportItem[];
}
