// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { z } from 'zod';

/**
 * Client-side contract for an Openverse-compatible image API
 * (https://api.openverse.org/v1). Only public-domain/CC0 images are requested,
 * so no attribution is legally required; we still keep the credit line.
 * Parameter and field names follow the public Openverse API — verify against
 * the official documentation when upgrading.
 */
export const STOCK_LICENSES = 'cc0,pdm';
export const STOCK_PAGE_SIZE = 24;
const IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'webp']);

const resultSchema = z.object({
  id: z.uuid(),
  title: z.string().nullish(),
  url: z.url({ protocol: /^https?$/ }),
  creator: z.string().nullish(),
  license: z.string(),
  license_version: z.string().nullish(),
  license_url: z.string().nullish(),
  provider: z.string().nullish(),
  source: z.string().nullish(),
  foreign_landing_url: z.string().nullish(),
  width: z.number().int().positive().nullish(),
  height: z.number().int().positive().nullish(),
  filetype: z.string().nullish(),
  mature: z.boolean().nullish(),
});

const searchSchema = z.object({
  result_count: z.number().int().nonnegative(),
  page_count: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  results: z.array(z.unknown()),
});

export type StockImage = z.infer<typeof resultSchema>;

export interface StockResult {
  id: string;
  title: string;
  creator: string | null;
  license: string;
  provider: string | null;
  width: number | null;
  height: number | null;
  landingUrl: string | null;
}

const clean = (text: string | null | undefined, max: number) =>
  (text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Accepts only public-domain, non-mature, still images. */
export function parseStockImage(input: unknown): StockImage | null {
  const parsed = resultSchema.safeParse(input);
  if (!parsed.success) return null;
  const image = parsed.data;
  if (!['cc0', 'pdm'].includes(image.license.toLowerCase())) return null;
  if (image.mature) return null;
  if (image.filetype && !IMAGE_TYPES.has(image.filetype.toLowerCase())) return null;
  return image;
}

export function toResult(image: StockImage): StockResult {
  return {
    id: image.id,
    title: clean(image.title, 200),
    creator: clean(image.creator, 200) || null,
    license: image.license.toLowerCase(),
    provider: clean(image.provider ?? image.source, 100) || null,
    width: image.width ?? null,
    height: image.height ?? null,
    landingUrl: image.foreign_landing_url?.startsWith('https://')
      ? image.foreign_landing_url
      : null,
  };
}

export function parseSearch(input: unknown): { pageCount: number; results: StockResult[] } {
  const parsed = searchSchema.parse(input);
  return {
    pageCount: parsed.page_count,
    results: parsed.results.flatMap((raw) => {
      const image = parseStockImage(raw);
      return image ? [toResult(image)] : [];
    }),
  };
}

/** A short credit line stored with imported files, e.g. "Sunset — Jane Doe (CC0, via Flickr)". */
export function attributionOf(image: StockImage): string {
  const result = toResult(image);
  const license = result.license === 'pdm' ? 'Public Domain' : result.license.toUpperCase();
  const who = result.creator ? ` — ${result.creator}` : '';
  const via = result.provider ? `, via ${result.provider}` : '';
  return `${result.title || 'Untitled'}${who} (${license}${via})`.slice(0, 500);
}

export function searchUrl(base: string, query: string, page: number): string {
  const url = new URL(`${base.replace(/\/+$/, '')}/images/`);
  url.searchParams.set('q', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(STOCK_PAGE_SIZE));
  url.searchParams.set('license', STOCK_LICENSES);
  url.searchParams.set('mature', 'false');
  return url.toString();
}

export const detailUrl = (base: string, id: string) =>
  `${base.replace(/\/+$/, '')}/images/${encodeURIComponent(id)}/`;
export const thumbUrl = (base: string, id: string) =>
  `${base.replace(/\/+$/, '')}/images/${encodeURIComponent(id)}/thumb/`;
