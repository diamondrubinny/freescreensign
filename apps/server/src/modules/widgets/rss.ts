// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { XMLParser } from 'fast-xml-parser';
import type { RssData } from '@rubinny/shared';

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedParseError';
  }
}

const MAX_TITLE_LENGTH = 300;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decodes the HTML entities commonly found in feed titles (after XML decoding). */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Characters of one field looked at, at most (the result keeps MAX_TITLE_LENGTH). */
const MAX_SOURCE_LENGTH = 8192;

/**
 * Plain text only: removes markup and control characters and collapses whitespace.
 * The player renders with textContent anyway; this keeps the output tidy.
 */
export function toPlainText(value: unknown): string {
  let text: string;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number') text = String(value);
  else if (value && typeof value === 'object' && '#text' in value)
    return toPlainText(value['#text']);
  else return '';
  // Bounded before any pattern runs: a feed may put a megabyte in one title (security
  // review, finding E1). A tag cannot contain "<", so the pattern stays linear on "<<<<".
  text = text.slice(0, MAX_SOURCE_LENGTH);
  text = decodeEntities(text.replace(/<[^<>]*>/g, ' '));
  text = text.replace(/<[^<>]*>/g, ' ');
  // eslint-disable-next-line no-control-regex -- stripping control characters on purpose
  text = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1)}…` : text;
}

function toIsoDate(value: unknown): string | null {
  const text = toPlainText(value);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function field(node: unknown, key: string): unknown {
  return node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined;
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  htmlEntities: false,
  processEntities: true,
});

/** Parses RSS 2.0, RSS 1.0 (RDF) and Atom feeds into titles and dates. */
export function parseFeed(xml: string, maxItems: number): RssData {
  // No DTDs at all: rules out entity expansion and external entity tricks.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new FeedParseError('Feeds with a DTD are not supported');
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new FeedParseError('Malformed XML');
  }

  const rss = field(doc, 'rss');
  const rdf = field(doc, 'RDF');
  const atom = field(doc, 'feed');

  let title: unknown;
  let entries: unknown[];
  let dateKeys: string[];
  if (rss !== undefined) {
    const channel = field(rss, 'channel');
    title = field(channel, 'title');
    entries = asArray(field(channel, 'item'));
    dateKeys = ['pubDate', 'date', 'updated'];
  } else if (rdf !== undefined) {
    title = field(field(rdf, 'channel'), 'title');
    entries = asArray(field(rdf, 'item'));
    dateKeys = ['date', 'pubDate'];
  } else if (atom !== undefined) {
    title = field(atom, 'title');
    entries = asArray(field(atom, 'entry'));
    dateKeys = ['published', 'updated'];
  } else {
    throw new FeedParseError('Not an RSS or Atom feed');
  }

  const items: RssData['items'] = [];
  for (const entry of entries) {
    if (items.length >= maxItems) break;
    const itemTitle = toPlainText(field(entry, 'title'));
    if (!itemTitle) continue;
    const dateKey = dateKeys.find((key) => field(entry, key) !== undefined);
    items.push({
      title: itemTitle,
      published: dateKey ? toIsoDate(field(entry, dateKey)) : null,
    });
  }
  return { title: toPlainText(title) || null, items };
}
