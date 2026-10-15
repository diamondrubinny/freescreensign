import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_A11Y,
  applyA11yPrefs,
  loadA11yPrefs,
  saveA11yPrefs,
  type A11yPrefs,
} from '../lib/a11y-prefs';

type Toggle = 'contrast' | 'underlineLinks' | 'readableFont' | 'stopAnimations';
const TOGGLES: Toggle[] = ['contrast', 'underlineLinks', 'readableFont', 'stopAnimations'];

/**
 * Disclosure-pattern menu of assistive adjustments. It complements, and never
 * replaces, the accessible markup of the application itself.
 */
export function AccessibilityMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<A11yPrefs>(loadA11yPrefs);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyA11yPrefs(prefs);
    saveA11yPrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target))
        setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const update = (patch: Partial<A11yPrefs>) => {
    setPrefs((current) => ({ ...current, ...patch }));
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="inline-flex items-center gap-2 rounded-md border border-gray-400 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
          <circle cx="12" cy="4" r="2" />
          <path d="M4 7.5 12 9l8-1.5.4 2L14 11v3l2.5 7-1.9.7L12 15.5l-2.6 6.2-1.9-.7L10 14v-3L3.6 9.5z" />
        </svg>
        <span>{t('a11y.menu')}</span>
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="absolute end-0 z-20 mt-2 w-72 rounded-lg border border-gray-300 bg-white p-4 shadow-lg dark:border-gray-600 dark:bg-gray-900"
        >
          <fieldset className="mb-3">
            <legend className="mb-2 font-semibold">
              {t('a11y.fontSize')}: {prefs.fontScale}%
            </legend>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-400 px-3 py-1"
                aria-label={t('a11y.decrease')}
                disabled={prefs.fontScale <= 100}
                onClick={() => {
                  update({ fontScale: Math.max(100, prefs.fontScale - 25) });
                }}
              >
                A−
              </button>
              <button
                type="button"
                className="rounded-md border border-gray-400 px-3 py-1"
                aria-label={t('a11y.increase')}
                disabled={prefs.fontScale >= 200}
                onClick={() => {
                  update({ fontScale: Math.min(200, prefs.fontScale + 25) });
                }}
              >
                A+
              </button>
            </div>
          </fieldset>
          <ul className="flex flex-col gap-2">
            {TOGGLES.map((key) => (
              <li key={key}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={prefs[key]}
                    onChange={(event) => {
                      update({ [key]: event.target.checked });
                    }}
                  />
                  {t(`a11y.${key}`)}
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-3 text-brand-700 underline dark:text-brand-300"
            onClick={() => {
              setPrefs(DEFAULT_A11Y);
            }}
          >
            {t('a11y.reset')}
          </button>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{t('a11y.note')}</p>
        </div>
      )}
    </div>
  );
}
