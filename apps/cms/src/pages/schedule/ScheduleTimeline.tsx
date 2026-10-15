import {
  addDays,
  formatMinutes,
  localTime,
  unusedRules,
  weekStart,
  weekTimeline,
  winningRule,
  type ScheduleRule,
} from '@rubinny/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/ui';

/** Decorative entry colors (the entry name is always shown as text too). */
export const ENTRY_COLORS = [
  '#2563eb',
  '#d97706',
  '#059669',
  '#db2777',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#65a30d',
] as const;

export const entryColor = (index: number) => ENTRY_COLORS[index % ENTRY_COLORS.length];

const percent = (minutes: number) => `${String((minutes / 1440) * 100)}%`;

/** Parses YYYY-MM-DD as a UTC date, so formatting never shifts the day. */
const utcDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};

/**
 * The week as it will play: one row per day with a decorative bar and, below it, the same
 * information as text. Uses the shared scheduling rules, so it matches the player exactly.
 */
export function ScheduleTimeline({
  rules,
  names,
  timeZone,
}: {
  rules: readonly (ScheduleRule & { enabled: boolean })[];
  names: readonly string[];
  timeZone: string;
}) {
  const { t, i18n } = useTranslation();
  const [weekOffset, setWeekOffset] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const local = localTime(now, timeZone);
  const start = addDays(weekStart(local.date), weekOffset * 7);
  const days = weekTimeline(rules, start);
  const unused = unusedRules(rules, days);
  const nameOf = (rule: number | null) =>
    rule === null ? t('schedules.defaultContent') : names[rule] || t('schedules.unnamed');
  const current = winningRule(rules, local);

  const dayName = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' });
  const shortDate = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="timeline-heading" className="text-xl font-semibold">
            {t('schedules.timeline')}
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {t('schedules.timelineHint', { zone: timeZone })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setWeekOffset(weekOffset - 1);
            }}
          >
            {t('schedules.previousWeek')}
          </Button>
          <Button
            variant="secondary"
            disabled={weekOffset === 0}
            onClick={() => {
              setWeekOffset(0);
            }}
          >
            {t('schedules.thisWeek')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setWeekOffset(weekOffset + 1);
            }}
          >
            {t('schedules.nextWeek')}
          </Button>
        </div>
      </div>

      <p className="font-semibold" aria-live="polite">
        {t('schedules.weekOf', {
          from: shortDate.format(utcDate(start)),
          to: shortDate.format(utcDate(addDays(start, 6))),
        })}
      </p>

      <p className="rounded-lg bg-brand-50 px-3 py-2 font-medium text-brand-900 dark:bg-brand-950 dark:text-brand-100">
        {t('schedules.nowShowing', { name: nameOf(current) })}
      </p>

      {unused.length > 0 && (
        <Alert variant="warning">
          <p>{t('schedules.unused')}</p>
          <ul className="list-disc ps-5">
            {unused.map((index) => (
              <li key={index} dir="auto">
                {nameOf(index)}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <Card className="p-4">
        {/* Hour scale for the bars (decorative). It follows the page direction like the bars:
            in Hebrew, time runs from right to left. */}
        <div
          aria-hidden="true"
          className="relative mb-1 ms-32 hidden h-4 text-xs text-gray-600 sm:block dark:text-gray-400"
        >
          {[0, 6, 12, 18].map((hour) => (
            <span key={hour} className="absolute" style={{ insetInlineStart: percent(hour * 60) }}>
              {formatMinutes(hour * 60)}
            </span>
          ))}
        </div>
        <ol className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
          {days.map((day) => {
            const isToday = day.date === local.date;
            const scheduled = day.segments.filter((segment) => segment.rule !== null);
            return (
              <li key={day.date} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start">
                <p className="w-32 shrink-0 font-medium">
                  {dayName.format(utcDate(day.date))}{' '}
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {shortDate.format(utcDate(day.date))}
                  </span>
                  {isToday && (
                    <span className="ms-1 rounded bg-brand-700 px-1.5 text-xs font-bold text-white">
                      {t('schedules.today')}
                    </span>
                  )}
                </p>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div
                    aria-hidden="true"
                    className="relative h-6 overflow-hidden rounded bg-gray-100 dark:bg-gray-800"
                  >
                    {scheduled.map((segment) => (
                      <div
                        key={segment.from}
                        className="absolute inset-y-0 border-x border-white/60"
                        style={{
                          insetInlineStart: percent(segment.from),
                          width: percent(segment.to - segment.from),
                          background: entryColor(segment.rule ?? 0),
                        }}
                      />
                    ))}
                    {isToday && (
                      <div
                        className="absolute inset-y-0 w-0.5 bg-gray-950 dark:bg-white"
                        style={{ insetInlineStart: percent(local.minutes) }}
                      />
                    )}
                  </div>
                  <ul className="text-sm">
                    {scheduled.length === 0 && (
                      <li className="text-gray-700 dark:text-gray-300">
                        {t('schedules.defaultAllDay')}
                      </li>
                    )}
                    {scheduled.map((segment) => (
                      <li key={segment.from} className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-2.5 shrink-0 rounded-sm"
                          style={{ background: entryColor(segment.rule ?? 0) }}
                        />
                        <span dir="auto">
                          {t('schedules.segment', {
                            from: formatMinutes(segment.from),
                            to: formatMinutes(segment.to),
                            name: nameOf(segment.rule),
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </section>
  );
}
