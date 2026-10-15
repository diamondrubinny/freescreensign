import {
  CalendarClock,
  Clock,
  CloudSun,
  Globe,
  Puzzle,
  QrCode,
  Rss,
  TextCursorInput,
  Type,
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
};

export const widgetIcon = (type: string) =>
  WIDGET_ICONS[type] ?? { icon: Puzzle, tone: 'brand' as const };
