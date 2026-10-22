// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * Hebrew numerals (gematria) for Hebrew-calendar dates, e.g. 5787 → "תשפ״ז",
 * 15 → "ט״ו", 16 → "ט״ז" (the traditional forms avoid spelling divine names).
 */
const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];

export function hebrewNumeral(value: number): string {
  if (!Number.isInteger(value) || value <= 0 || value >= 1000) {
    throw new RangeError('hebrewNumeral supports 1–999');
  }
  let n = value;
  let letters = '';
  while (n >= 400) {
    letters += 'ת';
    n -= 400;
  }
  letters += HUNDREDS[Math.floor(n / 100)] ?? '';
  n %= 100;
  if (n === 15) letters += 'טו';
  else if (n === 16) letters += 'טז';
  else letters += (TENS[Math.floor(n / 10)] ?? '') + (ONES[n % 10] ?? '');

  // Geresh for a single letter, gershayim before the last letter otherwise.
  return letters.length === 1 ? `${letters}׳` : `${letters.slice(0, -1)}״${letters.slice(-1)}`;
}

/**
 * Formats a date in the Hebrew calendar with Hebrew numerals, e.g. "ד׳ בחשוון תשפ״ז".
 * Month names come from Intl (CLDR); thousands are omitted as is customary.
 */
export function formatHebrewDate(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('he-u-ca-hebrew', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  // Keep ICU's own ordering and literals (e.g. the "ב" before the month);
  // only replace the digits with Hebrew numerals.
  return parts
    .map((part) => {
      if (part.type === 'day') return hebrewNumeral(Number(part.value));
      if (part.type === 'year') return hebrewNumeral(Number(part.value) % 1000);
      return part.value;
    })
    .join('')
    .trim();
}
