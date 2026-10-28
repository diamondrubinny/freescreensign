// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  CalendarClock,
  CalendarDays,
  Clock,
  CloudSun,
  DoorOpen,
  Globe,
  Signpost,
  Sunset,
  Palette,
  Puzzle,
  QrCode,
  Rss,
  Table2,
  TextCursorInput,
  Type,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

/** Decorative icon per widget type. */
export const WIDGET_ICONS: Record<
  string,
  { icon: LucideIcon; tone: 'brand' | 'green' | 'amber' | 'rose' | 'sky' }
> = {
  clock: { icon: Clock, tone: 'brand' },
  text: { icon: Type, tone: 'sky' },
  ticker: { icon: TextCursorInput, tone: 'rose' },
  qr: { icon: QrCode, tone: 'green' },
  rss: { icon: Rss, tone: 'amber' },
  weather: { icon: CloudSun, tone: 'sky' },
  webpage: { icon: Globe, tone: 'green' },
  countdown: { icon: CalendarClock, tone: 'amber' },
  table: { icon: Table2, tone: 'green' },
  menu: { icon: UtensilsCrossed, tone: 'amber' },
  design: { icon: Palette, tone: 'rose' },
  room: { icon: DoorOpen, tone: 'green' },
  calendar: { icon: CalendarDays, tone: 'sky' },
  directory: { icon: Signpost, tone: 'amber' },
  zmanim: { icon: Sunset, tone: 'rose' },
};

export const widgetIcon = (type: string) =>
  WIDGET_ICONS[type] ?? { icon: Puzzle, tone: 'brand' as const };
