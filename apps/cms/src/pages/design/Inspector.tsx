import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/ui';
import { CANVAS_PRESETS, type Design, type Element } from './model';

const small = `${inputClass} w-full px-2! py-1!`;

function Row({ label, children }: { label: string; children: (id: string) => ReactNode }) {
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

function NumberRow({
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

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Row label={label}>
      {(id) => (
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className="h-9 w-full rounded-lg border border-gray-400 dark:border-gray-600"
        />
      )}
    </Row>
  );
}

/**
 * Properties of the selected element (or of the canvas when nothing is selected).
 * This form is the keyboard and screen-reader alternative to dragging.
 */
export function Inspector({
  design,
  element,
  onDesign,
  onElement,
  onCommit,
  onPickBackground,
  onRemoveBackground,
  onPickImage,
}: {
  design: Design;
  element: Element | null;
  onDesign: (patch: Partial<Design>) => void;
  /** transient: typing in progress (committed on blur). */
  onElement: (patch: Partial<Element>, transient?: boolean) => void;
  onCommit: () => void;
  onPickBackground: () => void;
  onRemoveBackground: () => void;
  onPickImage: () => void;
}) {
  const { t } = useTranslation();

  if (!element) {
    const preset = Object.entries(CANVAS_PRESETS).find(
      ([, size]) => size.width === design.width && size.height === design.height,
    )?.[0];
    return (
      <div className="flex flex-col gap-3">
        <h3 className="font-bold">{t('designer.canvas')}</h3>
        <Row label={t('designer.canvasSize')}>
          {(id) => (
            <select
              id={id}
              value={preset ?? 'custom'}
              onChange={(event) => {
                const size = CANVAS_PRESETS[event.target.value as keyof typeof CANVAS_PRESETS] as
                  { width: number; height: number } | undefined;
                if (size) onDesign(size);
              }}
              className={small}
            >
              <option value="landscape">{t('designer.sizes.landscape')}</option>
              <option value="portrait">{t('designer.sizes.portrait')}</option>
              <option value="square">{t('designer.sizes.square')}</option>
              {!preset && (
                <option value="custom">{`${String(design.width)}×${String(design.height)}`}</option>
              )}
            </select>
          )}
        </Row>
        <ColorRow
          label={t('designer.background')}
          value={design.background}
          onChange={(background) => {
            onDesign({ background });
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onPickBackground}>
            {t('designer.backgroundImage')}
          </Button>
          {design.backgroundMediaId && (
            <Button variant="secondary" onClick={onRemoveBackground}>
              {t('designer.removeBackground')}
            </Button>
          )}
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300">{t('designer.selectHint')}</p>
      </div>
    );
  }

  const geometry = (
    <div className="grid grid-cols-2 gap-2">
      <NumberRow
        label="X"
        value={element.x}
        min={-16384}
        max={16384}
        onChange={(x) => {
          onElement({ x });
        }}
      />
      <NumberRow
        label="Y"
        value={element.y}
        min={-16384}
        max={16384}
        onChange={(y) => {
          onElement({ y });
        }}
      />
      <NumberRow
        label={t('designer.width')}
        value={element.w}
        min={1}
        max={16384}
        onChange={(w) => {
          onElement({ w });
        }}
      />
      <NumberRow
        label={t('designer.height')}
        value={element.h}
        min={1}
        max={16384}
        onChange={(h) => {
          onElement({ h });
        }}
      />
      <NumberRow
        label={t('designer.rotation')}
        value={element.rotation}
        min={-360}
        max={360}
        onChange={(rotation) => {
          onElement({ rotation });
        }}
      />
      <NumberRow
        label={t('designer.opacity')}
        value={Math.round(element.opacity * 100)}
        min={0}
        max={100}
        onChange={(value) => {
          onElement({ opacity: value / 100 });
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-bold">{t(`designer.kinds.${element.kind}`)}</h3>
      {element.kind === 'text' && (
        <>
          <Row label={t('designer.text')}>
            {(id) => (
              <textarea
                id={id}
                dir="auto"
                rows={3}
                maxLength={2000}
                value={element.text}
                onChange={(event) => {
                  onElement({ text: event.target.value }, true);
                }}
                onBlur={onCommit}
                className={small}
              />
            )}
          </Row>
          <div className="grid grid-cols-2 gap-2">
            <NumberRow
              label={t('designer.fontSize')}
              value={element.fontSize}
              min={6}
              max={1000}
              onChange={(fontSize) => {
                onElement({ fontSize });
              }}
            />
            <Row label={t('designer.fontWeight')}>
              {(id) => (
                <select
                  id={id}
                  value={element.fontWeight}
                  onChange={(event) => {
                    onElement({ fontWeight: Number(event.target.value) as 400 | 600 | 800 });
                  }}
                  className={small}
                >
                  <option value={400}>{t('designer.weights.regular')}</option>
                  <option value={600}>{t('designer.weights.semibold')}</option>
                  <option value={800}>{t('designer.weights.bold')}</option>
                </select>
              )}
            </Row>
            <ColorRow
              label={t('designer.color')}
              value={element.color}
              onChange={(color) => {
                onElement({ color });
              }}
            />
            <Row label={t('designer.align')}>
              {(id) => (
                <select
                  id={id}
                  value={element.align}
                  onChange={(event) => {
                    onElement({ align: event.target.value as 'start' | 'center' | 'end' });
                  }}
                  className={small}
                >
                  <option value="start">{t('widgets.fields.alignStart')}</option>
                  <option value="center">{t('widgets.fields.alignCenter')}</option>
                  <option value="end">{t('widgets.fields.alignEnd')}</option>
                </select>
              )}
            </Row>
            <NumberRow
              label={t('designer.lineHeight')}
              value={element.lineHeight}
              min={0.8}
              max={3}
              step={0.1}
              onChange={(lineHeight) => {
                onElement({ lineHeight });
              }}
            />
            <Row label={t('designer.italic')}>
              {(id) => (
                <input
                  id={id}
                  type="checkbox"
                  checked={element.italic}
                  onChange={(event) => {
                    onElement({ italic: event.target.checked });
                  }}
                  className="size-5"
                />
              )}
            </Row>
          </div>
          <Row label={t('designer.textBackground')}>
            {(id) => (
              <div className="flex items-center gap-2">
                <input
                  id={id}
                  type="checkbox"
                  checked={element.background !== undefined}
                  onChange={(event) => {
                    onElement({ background: event.target.checked ? '#000000' : undefined });
                  }}
                  className="size-5"
                />
                {element.background !== undefined && (
                  <input
                    type="color"
                    aria-label={t('designer.textBackgroundColor')}
                    value={element.background}
                    onChange={(event) => {
                      onElement({ background: event.target.value });
                    }}
                    className="h-9 flex-1 rounded-lg border border-gray-400"
                  />
                )}
              </div>
            )}
          </Row>
        </>
      )}
      {element.kind === 'image' && (
        <>
          <Button variant="secondary" onClick={onPickImage}>
            {t('designer.replaceImage')}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Row label={t('designer.fit')}>
              {(id) => (
                <select
                  id={id}
                  value={element.fit}
                  onChange={(event) => {
                    onElement({ fit: event.target.value as 'cover' | 'contain' });
                  }}
                  className={small}
                >
                  <option value="cover">{t('playlists.fits.cover')}</option>
                  <option value="contain">{t('playlists.fits.contain')}</option>
                </select>
              )}
            </Row>
            <NumberRow
              label={t('designer.radius')}
              value={element.radius}
              min={0}
              max={8192}
              onChange={(radius) => {
                onElement({ radius });
              }}
            />
          </div>
        </>
      )}
      {element.kind === 'shape' && (
        <div className="grid grid-cols-2 gap-2">
          <Row label={t('designer.shape')}>
            {(id) => (
              <select
                id={id}
                value={element.shape}
                onChange={(event) => {
                  onElement({ shape: event.target.value as 'rect' | 'ellipse' });
                }}
                className={small}
              >
                <option value="rect">{t('designer.shapes.rect')}</option>
                <option value="ellipse">{t('designer.shapes.ellipse')}</option>
              </select>
            )}
          </Row>
          <ColorRow
            label={t('designer.fill')}
            value={element.fill}
            onChange={(fill) => {
              onElement({ fill });
            }}
          />
          <NumberRow
            label={t('designer.radius')}
            value={element.radius}
            min={0}
            max={8192}
            onChange={(radius) => {
              onElement({ radius });
            }}
          />
          <NumberRow
            label={t('designer.strokeWidth')}
            value={element.strokeWidth}
            min={0}
            max={200}
            onChange={(strokeWidth) => {
              onElement({ strokeWidth, stroke: element.stroke ?? '#ffffff' });
            }}
          />
        </div>
      )}
      {geometry}
    </div>
  );
}
