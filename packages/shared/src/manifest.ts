// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { z } from 'zod';
import { wallSchema } from './layouts.js';
import { itemWindowSchema, localDateSchema, localTime, ruleActiveAt } from './schedule.js';

/**
 * Player manifest, schema version 1.
 *
 * The manifest is a declarative description of everything a screen needs to
 * play: media, widgets, playlists, layouts and schedule. It never contains
 * executable code. Players must validate it with `parseManifest` before use.
 */

const id = z.string().min(1).max(64);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, 'Expected a lowercase sha256 hex digest');
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM (24h)');
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();

/** Maximum item duration: 24 hours. */
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_CANVAS = 16384;

export const MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
] as const;

export const mediaSchema = z.object({
  id,
  mime: z.enum(MEDIA_MIME_TYPES),
  sizeBytes: nonNegativeInt,
  sha256: sha256Hex,
  width: positiveInt.optional(),
  height: positiveInt.optional(),
  durationMs: positiveInt.max(MAX_DURATION_MS).optional(),
});

export const widgetSchema = z.object({
  id,
  type: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/, 'Expected a kebab-case widget type'),
  /** Validated by the widget's own schema on the player side. */
  config: z.record(z.string(), z.unknown()),
});

export const TRANSITIONS = ['none', 'fade', 'slide'] as const;

/** How media fills its zone: whole image, cropped to fill, or whole image over a blurred copy. */
export const MEDIA_FITS = ['contain', 'cover', 'blur'] as const;
export type MediaFit = (typeof MEDIA_FITS)[number];

export const playlistItemSchema = z.object({
  kind: z.enum(['media', 'widget', 'playlist']),
  ref: id,
  durationMs: positiveInt.max(MAX_DURATION_MS),
  transition: z.enum(TRANSITIONS).default('none'),
  /** Media only; players that predate it use "contain". */
  fit: z.enum(MEDIA_FITS).optional(),
  /** Shown only in this window (screen's wall clock); players before 0.6 ignore it. */
  window: itemWindowSchema.optional(),
});

export const playlistSchema = z.object({
  id,
  items: z.array(playlistItemSchema).max(1000),
});

/** A tap on the zone opens another layout of the manifest, or goes back. */
export const manifestZoneActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('layout'), layoutId: id }),
  z.object({ type: z.literal('back') }),
]);
export type ManifestZoneAction = z.infer<typeof manifestZoneActionSchema>;

export const zoneSchema = z.object({
  id,
  x: nonNegativeInt,
  y: nonNegativeInt,
  w: positiveInt,
  h: positiveInt,
  z: z.number().int().min(0).max(100),
  playlistId: id.nullable(),
  /** Touch screens; optional so older players ignore it. */
  action: manifestZoneActionSchema.optional(),
  /** Accessible name of a zone with an action. */
  label: z.string().min(1).max(100).optional(),
});

export const layoutSchema = z.object({
  id,
  width: positiveInt.max(MAX_CANVAS),
  height: positiveInt.max(MAX_CANVAS),
  background: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  zones: z.array(zoneSchema).min(1).max(32),
  /** After a tap opened this layout: seconds without a touch before scheduled content returns. */
  idleSeconds: z.number().int().min(10).max(600).optional(),
});

export const scheduleEntrySchema = z
  .object({
    id,
    layoutId: id,
    priority: z.number().int().min(0).max(1000),
    startsAt: z.iso.datetime({ offset: true }).optional(),
    endsAt: z.iso.datetime({ offset: true }).optional(),
    /** Inclusive local dates (YYYY-MM-DD) on the screen's wall clock. */
    dateFrom: localDateSchema.optional(),
    dateTo: localDateSchema.optional(),
    /** 0 = Sunday … 6 = Saturday. Empty or missing means every day. */
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    timeFrom: timeOfDay.optional(),
    timeTo: timeOfDay.optional(),
  })
  .refine((e) => !e.startsAt || !e.endsAt || Date.parse(e.startsAt) < Date.parse(e.endsAt), {
    message: 'startsAt must be before endsAt',
    path: ['endsAt'],
  })
  .refine((e) => !e.dateFrom || !e.dateTo || e.dateFrom <= e.dateTo, {
    message: 'dateFrom must not be after dateTo',
    path: ['dateTo'],
  })
  .refine((e) => (e.timeFrom === undefined) === (e.timeTo === undefined), {
    message: 'timeFrom and timeTo must be provided together',
    path: ['timeTo'],
  });

export const ALERT_STYLES = ['emergency', 'notice'] as const;
export type AlertStyle = (typeof ALERT_STYLES)[number];

/** An emergency or urgent notice, shown over everything until `endsAt` or until ended. */
export const manifestAlertSchema = z.object({
  id,
  style: z.enum(ALERT_STYLES),
  title: z.string().min(1).max(120),
  message: z.string().max(500),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
});
export type ManifestAlert = z.infer<typeof manifestAlertSchema>;

/** Which alert a screen shows: the newest emergency, otherwise the newest notice. */
export function pickAlert<T extends { style: AlertStyle; startsAt: Date }>(
  alerts: readonly T[],
): T | null {
  let best: T | null = null;
  for (const alert of alerts) {
    if (
      !best ||
      (alert.style === 'emergency' && best.style !== 'emergency') ||
      (alert.style === best.style && alert.startsAt > best.startsAt)
    )
      best = alert;
  }
  return best;
}

/** True while an alert should be on screen (`now` on the server's clock). */
export function alertActive(alert: ManifestAlert | null | undefined, now: Date): boolean {
  return Boolean(alert && (alert.endsAt === null || Date.parse(alert.endsAt) > now.getTime()));
}

export const manifestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    /** Opaque content version; changes whenever any content changes. */
    version: z.string().min(1).max(128),
    generatedAt: z.iso.datetime({ offset: true }),
    screen: z.object({
      id,
      name: z.string().min(1).max(200),
      timezone: z.string().min(1).max(64),
      orientation: z.enum(['landscape', 'portrait', 'landscape-flipped', 'portrait-flipped']),
      /** Part of a video wall; optional so older players ignore it. */
      wall: wallSchema.optional(),
    }),
    media: z.array(mediaSchema).max(10000),
    widgets: z.array(widgetSchema).max(1000),
    playlists: z.array(playlistSchema).max(1000),
    layouts: z.array(layoutSchema).max(500),
    schedule: z.object({
      defaultLayoutId: id.nullable(),
      entries: z.array(scheduleEntrySchema).max(1000),
    }),
    /** Optional, so players and servers of different versions still understand each other. */
    alert: manifestAlertSchema.nullable().optional(),
  })
  .superRefine((manifest, ctx) => {
    const report = (message: string, path: (string | number)[]) => {
      ctx.addIssue({ code: 'custom', message, path });
    };

    const checkUnique = (items: { id: string }[], key: string) => {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.id)) report(`Duplicate id "${item.id}"`, [key, index, 'id']);
        seen.add(item.id);
      });
      return seen;
    };

    const mediaIds = checkUnique(manifest.media, 'media');
    const widgetIds = checkUnique(manifest.widgets, 'widgets');
    const playlistIds = checkUnique(manifest.playlists, 'playlists');
    const layoutIds = checkUnique(manifest.layouts, 'layouts');

    const refSets = { media: mediaIds, widget: widgetIds, playlist: playlistIds } as const;

    manifest.playlists.forEach((playlist, pIndex) => {
      playlist.items.forEach((item, iIndex) => {
        if (!refSets[item.kind].has(item.ref)) {
          report(`Unknown ${item.kind} "${item.ref}"`, [
            'playlists',
            pIndex,
            'items',
            iIndex,
            'ref',
          ]);
        }
      });
    });

    const cycle = findPlaylistCycle(manifest.playlists);
    if (cycle) report(`Playlist cycle detected: ${cycle.join(' -> ')}`, ['playlists']);

    manifest.layouts.forEach((layout, lIndex) => {
      layout.zones.forEach((zone, zIndex) => {
        const path = ['layouts', lIndex, 'zones', zIndex];
        if (zone.x + zone.w > layout.width || zone.y + zone.h > layout.height) {
          report('Zone exceeds layout bounds', path);
        }
        if (zone.playlistId !== null && !playlistIds.has(zone.playlistId)) {
          report(`Unknown playlist "${zone.playlistId}"`, [...path, 'playlistId']);
        }
        if (zone.action?.type === 'layout' && !layoutIds.has(zone.action.layoutId)) {
          report(`Unknown layout "${zone.action.layoutId}"`, [...path, 'action', 'layoutId']);
        }
      });
    });

    const { defaultLayoutId, entries } = manifest.schedule;
    if (defaultLayoutId !== null && !layoutIds.has(defaultLayoutId)) {
      report(`Unknown layout "${defaultLayoutId}"`, ['schedule', 'defaultLayoutId']);
    }
    entries.forEach((entry, index) => {
      if (!layoutIds.has(entry.layoutId)) {
        report(`Unknown layout "${entry.layoutId}"`, ['schedule', 'entries', index, 'layoutId']);
      }
    });
  });

export type ManifestV1 = z.infer<typeof manifestV1Schema>;
export type ManifestMedia = z.infer<typeof mediaSchema>;
export type ManifestWidget = z.infer<typeof widgetSchema>;
export type ManifestPlaylist = z.infer<typeof playlistSchema>;
export type ManifestLayout = z.infer<typeof layoutSchema>;
export type ManifestScheduleEntry = z.infer<typeof scheduleEntrySchema>;

/** Returns the first nested-playlist cycle found (as a list of ids), or null. */
export function findPlaylistCycle(playlists: readonly ManifestPlaylist[]): string[] | null {
  const children = new Map(
    playlists.map((p) => [
      p.id,
      p.items.filter((item) => item.kind === 'playlist').map((item) => item.ref),
    ]),
  );
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (node: string): string[] | null => {
    const current = state.get(node);
    if (current === 'done') return null;
    if (current === 'visiting') return [...stack.slice(stack.indexOf(node)), node];
    state.set(node, 'visiting');
    stack.push(node);
    for (const child of children.get(node) ?? []) {
      const found = visit(child);
      if (found) return found;
    }
    stack.pop();
    state.set(node, 'done');
    return null;
  };

  for (const playlist of playlists) {
    const found = visit(playlist.id);
    if (found) return found;
  }
  return null;
}

export type ManifestParseResult =
  | { success: true; manifest: ManifestV1 }
  | { success: false; issues: { path: string; message: string }[] };

/** Validates untrusted manifest JSON. Never throws. */
export function parseManifest(input: unknown): ManifestParseResult {
  const result = manifestV1Schema.safeParse(input);
  if (result.success) return { success: true, manifest: result.data };
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  };
}

/** Whether a schedule entry applies at `now` on a screen in `timeZone`. */
export function scheduleEntryActive(
  entry: ManifestScheduleEntry,
  now: Date,
  timeZone: string,
): boolean {
  if (entry.startsAt && now < new Date(entry.startsAt)) return false;
  if (entry.endsAt && now >= new Date(entry.endsAt)) return false;
  return ruleActiveAt(entry, localTime(now, timeZone));
}

/**
 * The layout to show now: the highest-priority active entry (earlier entries win ties),
 * else the default layout.
 */
export function activeLayoutId(manifest: ManifestV1, now: Date): string | null {
  let best: ManifestScheduleEntry | undefined;
  for (const entry of manifest.schedule.entries) {
    if (
      (!best || entry.priority > best.priority) &&
      scheduleEntryActive(entry, now, manifest.screen.timezone)
    ) {
      best = entry;
    }
  }
  return best?.layoutId ?? manifest.schedule.defaultLayoutId;
}
