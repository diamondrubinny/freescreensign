import { useTranslation } from 'react-i18next';
import { localTime, windowEnded, type ItemWindow } from '@rubinny/shared';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/ui';

const small = `${inputClass} px-2! py-1.5!`;

export const ALWAYS: ItemWindow = {
  dateFrom: null,
  dateTo: null,
  daysOfWeek: [],
  timeFrom: null,
  timeTo: null,
};

/** Short day names, Sunday first, in the interface language. */
export function useDayLabels(): string[] {
  const { i18n } = useTranslation();
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' });
  // 2026-10-11 is a Sunday.
  return Array.from({ length: 7 }, (_, day) =>
    weekday.format(new Date(Date.UTC(2026, 9, 11 + day))),
  );
}

/**
 * The item's window in words ("Sun, Thu · 08:00–14:00 · until 20/10/2026"), and whether it
 * is over (by this computer's date: screens in other time zones may differ by a day).
 */
export function useWindowSummary() {
  const { t, i18n } = useTranslation();
  const days = useDayLabels();
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeZone: 'UTC' });
  const formatDate = (value: string) => date.format(new Date(`${value}T00:00:00Z`));
  return (window: ItemWindow | null) => {
    if (!window) return null;
    const parts: string[] = [];
    if (window.daysOfWeek.length > 0) parts.push(window.daysOfWeek.map((d) => days[d]).join(', '));
    if (window.timeFrom && window.timeTo) parts.push(`${window.timeFrom}–${window.timeTo}`);
    if (window.dateFrom && window.dateTo) {
      parts.push(`${formatDate(window.dateFrom)}–${formatDate(window.dateTo)}`);
    } else if (window.dateFrom) {
      parts.push(t('playlists.window.from', { date: formatDate(window.dateFrom) }));
    } else if (window.dateTo) {
      parts.push(t('playlists.window.until', { date: formatDate(window.dateTo) }));
    }
    const today = localTime(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone).date;
    return { text: parts.join(' · '), ended: windowEnded(window, today) };
  };
}

/** Dates, days and hours in which one playlist item is shown. */
export function ItemWindowFields({
  idPrefix,
  name,
  window,
  onChange,
  fieldError,
}: {
  idPrefix: string;
  /** The item's name, for accessible labels. */
  name: string;
  window: ItemWindow;
  onChange: (window: ItemWindow) => void;
  /** Error message for a field of this window (`dateTo`, `timeTo`, ...). */
  fieldError: (field: keyof ItemWindow) => string | undefined;
}) {
  const { t } = useTranslation();
  const days = useDayLabels();
  const id = (part: string) => `${idPrefix}-${part}`;
  const update = (patch: Partial<ItemWindow>) => {
    onChange({ ...window, ...patch });
  };
  const allDay = window.timeFrom === null;
  const error = (field: keyof ItemWindow) => {
    const message = fieldError(field);
    return message ? (
      <p id={id(`${field}-error`)} className="text-sm font-medium text-red-800 dark:text-red-300">
        {message}
      </p>
    ) : null;
  };

  return (
    <fieldset
      id={id('fields')}
      aria-describedby={id('hint')}
      className="flex basis-full flex-col gap-3 rounded-lg border border-gray-300 p-3 dark:border-gray-700"
    >
      <legend className="px-1 font-medium">{t('playlists.window.legend', { name })}</legend>
      <p id={id('hint')} className="text-sm text-gray-700 dark:text-gray-300">
        {t('playlists.window.hint')}
      </p>

      <fieldset>
        <legend className="text-sm font-medium">{t('schedules.days')}</legend>
        <p className="mb-1 text-sm text-gray-700 dark:text-gray-300">{t('schedules.daysHint')}</p>
        <div className="flex flex-wrap gap-2">
          {days.map((label, day) => (
            <label
              key={day}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 has-checked:border-brand-600 has-checked:bg-brand-50 has-focus-visible:outline-2 has-focus-visible:outline-brand-700 dark:border-gray-600 dark:has-checked:bg-brand-950"
            >
              <input
                type="checkbox"
                checked={window.daysOfWeek.includes(day)}
                onChange={(event) => {
                  update({
                    daysOfWeek: event.target.checked
                      ? [...window.daysOfWeek, day].sort((a, b) => a - b)
                      : window.daysOfWeek.filter((d) => d !== day),
                  });
                }}
                className="size-4"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end gap-4">
        <label className="inline-flex min-h-11 items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(event) => {
              update(
                event.target.checked
                  ? { timeFrom: null, timeTo: null }
                  : { timeFrom: '08:00', timeTo: '12:00' },
              );
            }}
            className="size-4"
          />
          {t('schedules.allDay')}
        </label>
        {!allDay && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor={id('time-from')} className="text-sm font-medium">
                {t('schedules.timeFrom')}
              </label>
              <input
                id={id('time-from')}
                type="time"
                dir="ltr"
                required
                value={window.timeFrom ?? ''}
                onChange={(event) => {
                  update({ timeFrom: event.target.value || null });
                }}
                className={small}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={id('time-to')} className="text-sm font-medium">
                {t('schedules.timeTo')}
              </label>
              <input
                id={id('time-to')}
                type="time"
                dir="ltr"
                required
                value={window.timeTo ?? ''}
                aria-invalid={fieldError('timeTo') ? true : undefined}
                aria-describedby={`${id('time-hint')}${fieldError('timeTo') ? ` ${id('timeTo-error')}` : ''}`}
                onChange={(event) => {
                  update({ timeTo: event.target.value || null });
                }}
                className={small}
              />
            </div>
            <p id={id('time-hint')} className="basis-full text-sm text-gray-700 dark:text-gray-300">
              {t('schedules.timeHint')}
            </p>
            {error('timeTo')}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={id('date-from')} className="text-sm font-medium">
            {t('schedules.dateFrom')}
          </label>
          <input
            id={id('date-from')}
            type="date"
            dir="ltr"
            value={window.dateFrom ?? ''}
            aria-invalid={fieldError('dateFrom') ? true : undefined}
            aria-describedby={fieldError('dateFrom') ? id('dateFrom-error') : undefined}
            onChange={(event) => {
              update({ dateFrom: event.target.value || null });
            }}
            className={small}
          />
          {error('dateFrom')}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={id('date-to')} className="text-sm font-medium">
            {t('schedules.dateTo')}
          </label>
          <input
            id={id('date-to')}
            type="date"
            dir="ltr"
            value={window.dateTo ?? ''}
            aria-invalid={fieldError('dateTo') ? true : undefined}
            aria-describedby={fieldError('dateTo') ? id('dateTo-error') : undefined}
            onChange={(event) => {
              update({ dateTo: event.target.value || null });
            }}
            className={small}
          />
          {error('dateTo')}
        </div>
      </div>

      <div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            onChange(ALWAYS);
          }}
        >
          {t('playlists.window.always')}
        </Button>
      </div>
    </fieldset>
  );
}
