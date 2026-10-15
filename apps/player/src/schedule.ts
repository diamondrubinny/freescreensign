import type { ManifestScheduleEntry, ManifestV1 } from '@rubinny/shared';

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Day of week (0 = Sunday) and minutes since midnight in the screen's time zone. */
export function localTime(now: Date, timeZone: string): { day: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    // Unknown time zone: fall back to the device clock.
    return { day: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: WEEKDAYS[get('weekday')] ?? now.getDay(),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function entryActive(entry: ManifestScheduleEntry, now: Date, timeZone: string): boolean {
  if (entry.startsAt && now < new Date(entry.startsAt)) return false;
  if (entry.endsAt && now >= new Date(entry.endsAt)) return false;
  const { day, minutes } = localTime(now, timeZone);
  if (entry.daysOfWeek && entry.daysOfWeek.length > 0 && !entry.daysOfWeek.includes(day))
    return false;
  if (entry.timeFrom && entry.timeTo) {
    const from = toMinutes(entry.timeFrom);
    const to = toMinutes(entry.timeTo);
    // Windows may cross midnight (e.g. 22:00–02:00).
    const inside = from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
    if (!inside) return false;
  }
  return true;
}

/** The layout to show now: highest-priority active entry, else the default layout. */
export function activeLayoutId(manifest: ManifestV1, now: Date): string | null {
  const active = manifest.schedule.entries
    .filter((entry) => entryActive(entry, now, manifest.screen.timezone))
    .sort((a, b) => b.priority - a.priority);
  return active[0]?.layoutId ?? manifest.schedule.defaultLayoutId;
}
