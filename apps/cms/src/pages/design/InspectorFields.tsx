// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  DESIGN_ENTER_ANIMATIONS,
  DESIGN_FONTS,
  DESIGN_FONT_FAMILIES,
  DESIGN_LOOP_ANIMATIONS,
  type DesignAnimation,
  type DesignFont,
  type DesignGradient,
  type DesignShadow,
} from '@rubinny/shared';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/ui';

export const small = `${inputClass} w-full px-2! py-1!`;

export function Row({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

export function NumberRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Row label={label}>
      {(id) => (
        <input
          id={id}
          type="number"
          dir="ltr"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (event.target.value !== '' && Number.isFinite(next)) {
              onChange(Math.min(max, Math.max(min, next)));
            }
          }}
          className={small}
        />
      )}
    </Row>
  );
}

/** "#rrggbb" or "#rrggbbaa" split into the color and its opacity (0-100). */
export function splitColor(value: string): { rgb: string; alpha: number } {
  const rgb = value.slice(0, 7);
  const alpha = value.length === 9 ? Math.round((parseInt(value.slice(7), 16) / 255) * 100) : 100;
  return { rgb, alpha };
}

export function joinColor(rgb: string, alpha: number): string {
  if (alpha >= 100) return rgb;
  const byte = Math.round((Math.max(0, alpha) / 100) * 255);
  return `${rgb}${byte.toString(16).padStart(2, '0')}`;
}

/**
 * A color, and (with `alpha`) its opacity as a number: the browser's color picker has no
 * transparency, and a number is also easier with a keyboard.
 */
export function ColorRow({
  label,
  value,
  alpha = false,
  onChange,
}: {
  label: string;
  value: string;
  alpha?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const parts = splitColor(value);
  return (
    <>
      <Row label={label}>
        {(id) => (
          <input
            id={id}
            type="color"
            value={parts.rgb}
            onChange={(event) => {
              onChange(alpha ? joinColor(event.target.value, parts.alpha) : event.target.value);
            }}
            className="h-9 w-full rounded-lg border border-gray-400 dark:border-gray-600"
          />
        )}
      </Row>
      {alpha && (
        <NumberRow
          label={t('designer.alphaOf', { label })}
          value={parts.alpha}
          min={0}
          max={100}
          onChange={(next) => {
            onChange(joinColor(parts.rgb, next));
          }}
        />
      )}
    </>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="size-5"
      />
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
    </div>
  );
}

/** A group of optional settings, shown once its box is checked. */
function Group({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-gray-300 p-2 dark:border-gray-700">
      <legend className="sr-only">{label}</legend>
      <Toggle label={label} checked={enabled} onChange={onToggle} />
      {enabled && <div className="grid grid-cols-2 gap-2">{children}</div>}
    </fieldset>
  );
}

export function FontRow({
  value,
  onChange,
}: {
  value: DesignFont;
  onChange: (font: DesignFont) => void;
}) {
  const { t } = useTranslation();
  return (
    <Row label={t('designer.font')}>
      {(id) => (
        <select
          id={id}
          value={value}
          onChange={(event) => {
            onChange(event.target.value as DesignFont);
          }}
          className={small}
          style={{ fontFamily: DESIGN_FONT_FAMILIES[value] }}
        >
          {DESIGN_FONTS.map((font) => (
            <option key={font} value={font} style={{ fontFamily: DESIGN_FONT_FAMILIES[font] }}>
              {t(`designer.fonts.${font}`)}
            </option>
          ))}
        </select>
      )}
    </Row>
  );
}

const DEFAULT_GRADIENT: DesignGradient = {
  type: 'linear',
  angle: 180,
  stops: [
    { color: '#4f46e5', at: 0 },
    { color: '#0f172a', at: 100 },
  ],
};

export function GradientFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DesignGradient | undefined;
  onChange: (gradient: DesignGradient | undefined) => void;
}) {
  const { t } = useTranslation();
  const setStop = (index: number, patch: Partial<DesignGradient['stops'][number]>) => {
    if (!value) return;
    onChange({
      ...value,
      stops: value.stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)),
    });
  };
  return (
    <Group
      label={label}
      enabled={value !== undefined}
      onToggle={(enabled) => {
        onChange(enabled ? DEFAULT_GRADIENT : undefined);
      }}
    >
      {value && (
        <>
          <Row label={t('designer.gradientType')}>
            {(id) => (
              <select
                id={id}
                value={value.type}
                onChange={(event) => {
                  onChange({ ...value, type: event.target.value as 'linear' | 'radial' });
                }}
                className={small}
              >
                <option value="linear">{t('designer.gradientTypes.linear')}</option>
                <option value="radial">{t('designer.gradientTypes.radial')}</option>
              </select>
            )}
          </Row>
          {value.type === 'linear' ? (
            <NumberRow
              label={t('designer.gradientAngle')}
              value={value.angle}
              min={0}
              max={360}
              onChange={(angle) => {
                onChange({ ...value, angle });
              }}
            />
          ) : (
            <span />
          )}
          {value.stops.map((stop, index) => (
            <div key={index} className="col-span-2 grid grid-cols-2 gap-2">
              <ColorRow
                label={t('designer.gradientStop', { n: index + 1 })}
                value={stop.color}
                alpha
                onChange={(color) => {
                  setStop(index, { color });
                }}
              />
              <NumberRow
                label={t('designer.gradientAt', { n: index + 1 })}
                value={stop.at}
                min={0}
                max={100}
                onChange={(at) => {
                  setStop(index, { at });
                }}
              />
            </div>
          ))}
          <div className="col-span-2 flex flex-wrap gap-2">
            {value.stops.length < 4 && (
              <Button
                variant="secondary"
                onClick={() => {
                  onChange({ ...value, stops: [...value.stops, { color: '#ffffff', at: 100 }] });
                }}
              >
                {t('designer.addStop')}
              </Button>
            )}
            {value.stops.length > 2 && (
              <Button
                variant="secondary"
                onClick={() => {
                  onChange({ ...value, stops: value.stops.slice(0, -1) });
                }}
              >
                {t('designer.removeStop', { n: value.stops.length })}
              </Button>
            )}
          </div>
        </>
      )}
    </Group>
  );
}

const DEFAULT_SHADOW: DesignShadow = { x: 0, y: 12, blur: 32, color: '#00000080' };

export function ShadowFields({
  value,
  onChange,
}: {
  value: DesignShadow | undefined;
  onChange: (shadow: DesignShadow | undefined) => void;
}) {
  const { t } = useTranslation();
  return (
    <Group
      label={t('designer.shadow')}
      enabled={value !== undefined}
      onToggle={(enabled) => {
        onChange(enabled ? DEFAULT_SHADOW : undefined);
      }}
    >
      {value && (
        <>
          <NumberRow
            label={t('designer.shadowX')}
            value={value.x}
            min={-200}
            max={200}
            onChange={(x) => {
              onChange({ ...value, x });
            }}
          />
          <NumberRow
            label={t('designer.shadowY')}
            value={value.y}
            min={-200}
            max={200}
            onChange={(y) => {
              onChange({ ...value, y });
            }}
          />
          <NumberRow
            label={t('designer.shadowBlur')}
            value={value.blur}
            min={0}
            max={300}
            onChange={(blur) => {
              onChange({ ...value, blur });
            }}
          />
          <span />
          <ColorRow
            label={t('designer.shadowColor')}
            value={value.color}
            alpha
            onChange={(color) => {
              onChange({ ...value, color });
            }}
          />
        </>
      )}
    </Group>
  );
}

const DEFAULT_ANIMATION: DesignAnimation = { enter: 'fade', delay: 0, duration: 700, loop: 'none' };

export function AnimationFields({
  value,
  onChange,
}: {
  value: DesignAnimation | undefined;
  onChange: (animation: DesignAnimation | undefined) => void;
}) {
  const { t } = useTranslation();
  return (
    <Group
      label={t('designer.animation')}
      enabled={value !== undefined}
      onToggle={(enabled) => {
        onChange(enabled ? DEFAULT_ANIMATION : undefined);
      }}
    >
      {value && (
        <>
          <Row label={t('designer.enter')}>
            {(id) => (
              <select
                id={id}
                value={value.enter}
                onChange={(event) => {
                  onChange({ ...value, enter: event.target.value as DesignAnimation['enter'] });
                }}
                className={small}
              >
                {DESIGN_ENTER_ANIMATIONS.map((enter) => (
                  <option key={enter} value={enter}>
                    {t(`designer.enters.${enter}`)}
                  </option>
                ))}
              </select>
            )}
          </Row>
          <Row label={t('designer.loop')}>
            {(id) => (
              <select
                id={id}
                value={value.loop}
                onChange={(event) => {
                  onChange({ ...value, loop: event.target.value as DesignAnimation['loop'] });
                }}
                className={small}
              >
                {DESIGN_LOOP_ANIMATIONS.map((loop) => (
                  <option key={loop} value={loop}>
                    {t(`designer.loops.${loop}`)}
                  </option>
                ))}
              </select>
            )}
          </Row>
          <NumberRow
            label={t('designer.delay')}
            value={value.delay}
            min={0}
            max={10_000}
            step={100}
            onChange={(delay) => {
              onChange({ ...value, delay });
            }}
          />
          <NumberRow
            label={t('designer.duration')}
            value={value.duration}
            min={100}
            max={5000}
            step={100}
            onChange={(duration) => {
              onChange({ ...value, duration });
            }}
          />
        </>
      )}
    </Group>
  );
}

export function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <Toggle label={label} checked={checked} onChange={onChange} />;
}

/** Thin outline around letters. */
export function OutlineFields({
  value,
  onChange,
}: {
  value: { color: string; width: number } | undefined;
  onChange: (outline: { color: string; width: number } | undefined) => void;
}) {
  const { t } = useTranslation();
  return (
    <Group
      label={t('designer.outline')}
      enabled={value !== undefined}
      onToggle={(enabled) => {
        onChange(enabled ? { color: '#000000', width: 3 } : undefined);
      }}
    >
      {value && (
        <>
          <ColorRow
            label={t('designer.outlineColor')}
            value={value.color}
            onChange={(color) => {
              onChange({ ...value, color });
            }}
          />
          <NumberRow
            label={t('designer.outlineWidth')}
            value={value.width}
            min={0.5}
            max={20}
            step={0.5}
            onChange={(width) => {
              onChange({ ...value, width });
            }}
          />
        </>
      )}
    </Group>
  );
}
