import { describe, expect, it } from 'vitest';
import { tableConfigSchema } from '@rubinny/shared';
import {
  MAX_COLUMNS,
  TableParseError,
  cellText,
  detectDelimiter,
  parseCsv,
  parseTable,
  tableSourceUrl,
} from '../../src/modules/widgets/table.js';

const options = (overrides: Record<string, unknown> = {}) =>
  tableConfigSchema.parse({ url: 'https://example.com/data.csv', ...overrides });

describe('parseCsv', () => {
  it('reads quoted fields, escaped quotes and line breaks inside quotes', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n"two\nlines",z', 10)).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['two\nlines', 'z'],
    ]);
  });

  it('detects semicolons and tabs, strips a BOM and skips empty rows', () => {
    expect(parseCsv('﻿שם;מחיר\n\nפלאפל;20\n', 10)).toEqual([
      ['שם', 'מחיר'],
      ['פלאפל', '20'],
    ]);
    expect(parseCsv('a\tb\n1\t2', 10)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(detectDelimiter('"a;b",c,d\n')).toBe(',');
  });

  it('stops after the requested number of rows', () => {
    const big = Array.from({ length: 10_000 }, (_, i) => `${String(i)},x`).join('\n');
    expect(parseCsv(big, 3)).toHaveLength(3);
  });
});

describe('parseTable', () => {
  it('chooses columns by name, in order, and pads short rows', () => {
    const table = parseTable(
      'Name,Price,Notes\nFalafel,20\nSabich,25,Spicy',
      options({ columns: 'notes, Name' }),
    );
    expect(table).toEqual({
      columns: ['Notes', 'Name'],
      rows: [
        ['', 'Falafel'],
        ['Spicy', 'Sabich'],
      ],
      truncated: false,
    });
  });

  it('numbers the columns when there is no header, and caps rows and columns', () => {
    const wide = Array.from({ length: 30 }, (_, i) => String(i)).join(',');
    const table = parseTable(
      `${wide}\n${wide}\n${wide}`,
      options({ hasHeader: false, maxRows: 2 }),
    );
    expect(table.columns).toHaveLength(MAX_COLUMNS);
    expect(table.columns[0]).toBe('1');
    expect(table.rows).toHaveLength(2);
    expect(table.truncated).toBe(true);
  });

  it('falls back to all columns when none of the requested ones exist', () => {
    expect(parseTable('a,b\n1,2', options({ columns: 'missing' })).columns).toEqual(['a', 'b']);
  });

  it('reads JSON arrays of objects and arrays of rows at a path', () => {
    const objects = JSON.stringify({
      data: {
        items: [
          { a: 1, b: true },
          { b: 'x', c: null },
        ],
      },
    });
    expect(parseTable(objects, options({ source: 'json', jsonPath: 'data.items' }))).toEqual({
      columns: ['a', 'b', 'c'],
      rows: [
        ['1', 'true', ''],
        ['', 'x', ''],
      ],
      truncated: false,
    });
    const rows = JSON.stringify([
      ['h1', 'h2'],
      ['v1', { nested: 1 }],
    ]);
    expect(parseTable(rows, options({ source: 'json' }))).toMatchObject({
      columns: ['h1', 'h2'],
      rows: [['v1', '']],
    });
    expect(parseTable('[]', options({ source: 'json' })).rows).toEqual([]);
  });

  it('rejects documents that are not tables', () => {
    expect(() => parseTable('{"a":1}', options({ source: 'json' }))).toThrow(TableParseError);
    expect(() => parseTable('not json', options({ source: 'json' }))).toThrow(TableParseError);
    expect(() => parseTable('{"a":[1]}', options({ source: 'json', jsonPath: 'b' }))).toThrow(
      TableParseError,
    );
    expect(() => parseTable('[1, 2]', options({ source: 'json' }))).toThrow(TableParseError);
    expect(() => parseTable('<!doctype html><p>Sign in', options())).toThrow(TableParseError);
    // Inherited properties are never followed.
    expect(() =>
      parseTable('{"a":[]}', options({ source: 'json', jsonPath: 'constructor.prototype' })),
    ).toThrow(TableParseError);
  });
});

describe('cellText', () => {
  it('keeps text plain, single-line and short', () => {
    expect(cellText(' a\u0000b\n\tc ')).toBe('a b c');
    expect(cellText('<b>x</b>')).toBe('<b>x</b>'); // shown with textContent, never as HTML
    expect(cellText('x'.repeat(400))).toHaveLength(300);
    expect(cellText(Number.NaN)).toBe('');
    expect(cellText({})).toBe('');
  });
});

describe('table config', () => {
  it('accepts dot paths only', () => {
    expect(tableConfigSchema.safeParse({ url: 'https://e.com', jsonPath: 'a.b_c.0' }).success).toBe(
      true,
    );
    for (const path of ['../x', 'a..b', 'a[0]', '.a', 'a b']) {
      expect(tableConfigSchema.safeParse({ url: 'https://e.com', jsonPath: path }).success).toBe(
        false,
      );
    }
  });
});

describe('tableSourceUrl', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-ab';
  it('turns Google Sheets edit links into CSV export links', () => {
    expect(tableSourceUrl(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=42`, 'csv')).toBe(
      `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=42`,
    );
    expect(
      tableSourceUrl(`https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing`, 'csv'),
    ).toBe(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv`);
  });

  it('leaves published, other and JSON links alone', () => {
    const published = `https://docs.google.com/spreadsheets/d/e/2PACX-${id}/pub?output=csv`;
    expect(tableSourceUrl(published, 'csv')).toBe(published);
    expect(tableSourceUrl('https://example.com/a.csv', 'csv')).toBe('https://example.com/a.csv');
    const sheet = `https://docs.google.com/spreadsheets/d/${id}/edit`;
    expect(tableSourceUrl(sheet, 'json')).toBe(sheet);
  });
});
