// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { TableData, WidgetConfig } from '@rubinny/shared';

export class TableParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TableParseError';
  }
}

/** Columns shown at most (a screen cannot show more legibly). */
export const MAX_COLUMNS = 12;
/** Columns read from the source before choosing which to show. */
const MAX_SOURCE_COLUMNS = 50;
const MAX_CELL_LENGTH = 300;

type TableOptions = Pick<
  WidgetConfig<'table'>,
  'source' | 'jsonPath' | 'hasHeader' | 'columns' | 'maxRows'
>;

/** Plain, single-line text: control characters removed, whitespace collapsed, length capped. */
export function cellText(value: unknown): string {
  let text: string;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number' && Number.isFinite(value)) text = String(value);
  else if (typeof value === 'boolean') text = String(value);
  else return '';
  // eslint-disable-next-line no-control-regex -- stripping control characters on purpose
  text = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > MAX_CELL_LENGTH ? `${text.slice(0, MAX_CELL_LENGTH - 1)}…` : text;
}

/** Picks the delimiter used most often (outside quotes) on the first line: comma, semicolon or tab. */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>([
    [',', 0],
    [';', 0],
    ['\t', 0],
  ]);
  let quoted = false;
  for (let i = 0; i < text.length && i < 4096; i++) {
    const char = text[i] ?? '';
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let best = ',';
  for (const [delimiter, count] of counts) {
    if (count > (counts.get(best) ?? 0)) best = delimiter;
  }
  return best;
}

/**
 * Parses CSV (RFC 4180: quoted fields, "" escapes, line breaks inside quotes, CRLF or LF),
 * reading at most `maxRows` non-empty rows of at most MAX_SOURCE_COLUMNS fields.
 */
export function parseCsv(input: string, maxRows: number): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = () => {
    if (row.length < MAX_SOURCE_COLUMNS) row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.some((value) => value.trim() !== '')) rows.push(row);
    row = [];
  };

  while (i < text.length && rows.length < maxRows) {
    const char = text[i] ?? '';
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += char;
      }
      i++;
      continue;
    }
    if (char === '"' && field.trim() === '') {
      field = '';
      quoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\n' || char === '\r') {
      endRow();
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += char;
    }
    i++;
  }
  if (rows.length < maxRows && (field !== '' || row.length > 0)) endRow();
  return rows;
}

/** Follows a dot path ("data.items") into parsed JSON. */
function atPath(document: unknown, path: string | undefined): unknown {
  if (!path) return document;
  let node = document;
  for (const key of path.split('.')) {
    if (Array.isArray(node) && /^\d+$/.test(key)) node = node[Number(key)];
    else if (node && typeof node === 'object' && Object.hasOwn(node, key))
      node = (node as Record<string, unknown>)[key];
    else return undefined;
  }
  return node;
}

/** Turns a JSON array (of objects or of arrays) into a header row plus rows. */
function jsonRows(
  document: unknown,
  options: TableOptions,
): { header: string[] | null; rows: unknown[][]; total: number } {
  const list = atPath(document, options.jsonPath);
  if (!Array.isArray(list)) throw new TableParseError('No array at the given path');
  const items = list.slice(0, options.maxRows + 1);
  if (items.length > 0 && items.every((item) => Array.isArray(item))) {
    const rows = (items as unknown[][]).map((item) => item.slice(0, MAX_SOURCE_COLUMNS));
    if (!options.hasHeader) return { header: null, rows, total: list.length };
    const [first = [], ...rest] = rows;
    return { header: first.map(cellText), rows: rest, total: list.length - 1 };
  }
  const objects = items.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  );
  const keys: string[] = [];
  for (const item of objects) {
    for (const key of Object.keys(item)) {
      if (keys.length >= MAX_SOURCE_COLUMNS) break;
      if (!keys.includes(key)) keys.push(key);
    }
  }
  if (keys.length === 0 && list.length > 0)
    throw new TableParseError('The array has no objects or rows');
  const rows = objects.map((item) =>
    keys.map((key) => (Object.hasOwn(item, key) ? item[key] : '')),
  );
  return { header: keys, rows, total: list.length };
}

/** Indexes of the requested columns ("Name, Price"), or all columns when none match. */
function chooseColumns(header: string[], wanted: string | undefined): number[] {
  const names = (wanted ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const lower = header.map((name) => name.trim().toLowerCase());
  const chosen = names.map((name) => lower.indexOf(name)).filter((index) => index !== -1);
  const indexes = chosen.length > 0 ? chosen : header.map((_, index) => index);
  return indexes.slice(0, MAX_COLUMNS);
}

/** Parses a CSV or JSON document into the table the player shows. */
export function parseTable(body: string, options: TableOptions): TableData {
  let header: string[] | null;
  let rows: unknown[][];
  let total: number;
  if (options.source === 'json') {
    let document: unknown;
    try {
      document = JSON.parse(body.charCodeAt(0) === 0xfeff ? body.slice(1) : body);
    } catch {
      throw new TableParseError('Malformed JSON');
    }
    ({ header, rows, total } = jsonRows(document, options));
  } else {
    if (/^\s*</.test(body)) throw new TableParseError('Not a CSV file (looks like a web page)');
    const extra = options.hasHeader ? 1 : 0;
    // One row more than shown, to know whether the source was cut.
    const parsed = parseCsv(body, options.maxRows + extra + 1);
    header = options.hasHeader ? (parsed[0] ?? []).map(cellText) : null;
    rows = parsed.slice(extra);
    total = rows.length;
  }
  rows = rows.slice(0, options.maxRows);

  const width = Math.max(header?.length ?? 0, ...rows.map((row) => row.length));
  const names = Array.from({ length: width }, (_, index) => header?.[index] || String(index + 1));
  const indexes = chooseColumns(names, options.columns);
  return {
    columns: indexes.map((index) => names[index] ?? ''),
    rows: rows.map((row) => indexes.map((index) => cellText(row[index]))),
    truncated: total > options.maxRows,
  };
}

/**
 * Google Sheets edit/view links become their CSV export link (works for sheets shared as
 * "anyone with the link"). Published links (/d/e/…/pub?output=csv) are used as they are.
 * The export format requires verification against Google's documentation.
 */
export function tableSourceUrl(url: string, source: 'csv' | 'json'): string {
  if (source !== 'csv') return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.hostname !== 'docs.google.com') return url;
  const match = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:\/(?:edit|view|htmlview)?)?$/.exec(
    parsed.pathname,
  );
  if (!match?.[1]) return url;
  const gid = /(?:^|[#&?])gid=(\d+)/.exec(`${parsed.search}${parsed.hash}`)?.[1];
  const target = new URL(`https://docs.google.com/spreadsheets/d/${match[1]}/export`);
  target.searchParams.set('format', 'csv');
  if (gid) target.searchParams.set('gid', gid);
  return target.toString();
}
