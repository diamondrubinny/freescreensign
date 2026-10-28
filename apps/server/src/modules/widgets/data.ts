// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { createHash } from 'node:crypto';
import {
  parseWidgetConfig,
  type CalendarData,
  roomConfigSchema,
  type RoomStatusData,
  type RssData,
  type TableData,
  type WeatherData,
  type WidgetConfig,
} from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { safeFetch } from '../../lib/safe-fetch.js';
import { roomStatus } from '../rooms/service.js';
import { parseCalendar } from './calendar.js';
import { parseFeed } from './rss.js';
import { parseTable, tableSourceUrl } from './table.js';
import { parseWeather, weatherRequestUrl } from './weather.js';

/** How long fetched data counts as fresh, per widget type (tables: their own setting). */
const FRESH_SECONDS = { rss: 10 * 60, weather: 15 * 60, table: 5 * 60, calendar: 10 * 60 } as const;
/** Stale copies are kept this long and served when the source is down. */
const STALE_SECONDS = 24 * 60 * 60;
/** After a failure, the source is not retried for this long (protects both sides). */
const FAILURE_BACKOFF_SECONDS = 60;

export type DataWidgetType = keyof typeof FRESH_SECONDS;
type WidgetData = RssData | WeatherData | TableData | CalendarData;

function freshSeconds(type: DataWidgetType, config: Record<string, unknown>): number {
  if (type === 'table') return (config as WidgetConfig<'table'>).refreshMinutes * 60;
  return FRESH_SECONDS[type];
}

export interface WidgetDataResult {
  type: DataWidgetType;
  data: WidgetData;
  fetchedAt: string;
  /** True when the source failed and an older copy is served. */
  stale: boolean;
}

interface CachedEntry {
  fetchedAt: string;
  data: WidgetData;
}

export function isDataWidgetType(type: string): type is DataWidgetType {
  return type in FRESH_SECONDS;
}

export function weatherEnabled(ctx: AppContext): boolean {
  return Boolean(ctx.env.WEATHER_API_URL);
}

const upstreamFailed = () =>
  new HttpError(502, 'UPSTREAM_FAILED', 'The data source could not be loaded');

/** The cache key covers the source only, so widgets sharing a feed share one fetch. */
function cacheKey(type: DataWidgetType, source: Record<string, unknown>): string {
  return `widget-data:${type}:${createHash('sha256').update(JSON.stringify(source)).digest('hex')}`;
}

async function fetchFresh(
  ctx: AppContext,
  type: DataWidgetType,
  config: Record<string, unknown>,
): Promise<WidgetData> {
  if (type === 'rss') {
    const rss = config as WidgetConfig<'rss'>;
    const response = await safeFetch(rss.url, {
      allowPrivate: ctx.env.WIDGET_FETCH_ALLOW_PRIVATE,
      accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
    });
    return parseFeed(response.body.toString('utf8'), rss.maxItems);
  }
  if (type === 'calendar') {
    const calendar = config as WidgetConfig<'calendar'>;
    const response = await safeFetch(calendar.url, {
      allowPrivate: ctx.env.WIDGET_FETCH_ALLOW_PRIVATE,
      accept: 'text/calendar, text/plain;q=0.8',
      // Google and Microsoft answer calendar links with a redirect or two.
      maxRedirects: 3,
      maxBytes: 1024 * 1024,
    });
    return parseCalendar(response.body.toString('utf8'), calendar);
  }
  if (type === 'table') {
    const table = config as WidgetConfig<'table'>;
    const response = await safeFetch(tableSourceUrl(table.url, table.source), {
      allowPrivate: ctx.env.WIDGET_FETCH_ALLOW_PRIVATE,
      accept:
        table.source === 'json'
          ? 'application/json'
          : 'text/csv, text/plain;q=0.9, application/octet-stream;q=0.5',
      // Google Sheets answers its export link with a few redirects.
      maxRedirects: 5,
    });
    return parseTable(response.body.toString('utf8'), table);
  }
  const endpoint = ctx.env.WEATHER_API_URL;
  if (!endpoint) throw new HttpError(404, 'NOT_FOUND', 'Weather is not configured');
  const weather = config as WidgetConfig<'weather'>;
  const response = await safeFetch(weatherRequestUrl(endpoint, weather, ctx.env.WEATHER_API_KEY), {
    // The endpoint is chosen by the operator (it may be a self-hosted instance).
    allowPrivate: true,
    accept: 'application/json',
  });
  return parseWeather(JSON.parse(response.body.toString('utf8')) as unknown, weather);
}

function sourceOf(type: DataWidgetType, config: Record<string, unknown>) {
  if (type === 'rss') {
    const { url, maxItems } = config as WidgetConfig<'rss'>;
    return { url, maxItems };
  }
  if (type === 'table') {
    const { source, url, jsonPath, hasHeader, columns, maxRows } = config as WidgetConfig<'table'>;
    return { source, url, jsonPath, hasHeader, columns, maxRows };
  }
  if (type === 'calendar') {
    // The window moves with time: the cache entry is per source, refreshed every 10 minutes.
    const { url, days } = config as WidgetConfig<'calendar'>;
    return { url, days };
  }
  const { latitude, longitude, units, days } = config as WidgetConfig<'weather'>;
  return { latitude, longitude, units, days };
}

/**
 * Returns data for an RSS, weather, table or calendar widget: fresh from the cache, or fetched
 * through the SSRF-safe client, falling back to a stale copy when the source fails.
 */
export async function getWidgetData(
  ctx: AppContext,
  widget: { org_id: string; type: string; config: Record<string, unknown> },
): Promise<WidgetDataResult> {
  const { type } = widget;
  if (!isDataWidgetType(type)) throw new HttpError(404, 'NOT_FOUND', 'Widget has no data');
  const parsed = parseWidgetConfig(type, widget.config);
  if (!parsed.success) throw upstreamFailed();
  const config = parsed.config;
  const key = cacheKey(type, sourceOf(type, config));

  const cachedText = await ctx.cache.get(key);
  const cached = cachedText ? (JSON.parse(cachedText) as CachedEntry) : null;
  const age = cached ? (Date.now() - Date.parse(cached.fetchedAt)) / 1000 : Infinity;
  if (cached && age < freshSeconds(type, config)) {
    return { type, data: cached.data, fetchedAt: cached.fetchedAt, stale: false };
  }

  const serveStale = () => {
    if (!cached) throw upstreamFailed();
    return { type, data: cached.data, fetchedAt: cached.fetchedAt, stale: true };
  };

  if (await ctx.cache.get(`${key}:failed`)) return serveStale();
  try {
    await ctx.limiter.hit(LIMITS.widgetFetchOrg, widget.org_id);
  } catch (error) {
    if (cached) return serveStale();
    throw error;
  }

  let data: WidgetData;
  try {
    data = await fetchFresh(ctx, type, config);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    await ctx.cache.set(`${key}:failed`, '1', FAILURE_BACKOFF_SECONDS);
    return serveStale();
  }
  const entry: CachedEntry = { fetchedAt: new Date().toISOString(), data };
  await ctx.cache.set(key, JSON.stringify(entry), STALE_SECONDS);
  return { type, data, fetchedAt: entry.fetchedAt, stale: false };
}

export interface RoomWidgetDataResult {
  type: 'room';
  data: RoomStatusData;
  fetchedAt: string;
  stale: false;
}

/** A room widget's status, from the organization's own bookings (never cached). */
export async function roomWidgetData(
  ctx: AppContext,
  widget: { org_id: string; config: Record<string, unknown> },
): Promise<RoomWidgetDataResult> {
  const config = roomConfigSchema.safeParse(widget.config);
  if (!config.success) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
  const data = await roomStatus(
    ctx.db,
    widget.org_id,
    config.data.roomId,
    config.data.allowBooking,
  );
  return { type: 'room', data, fetchedAt: data.serverTime, stale: false };
}
