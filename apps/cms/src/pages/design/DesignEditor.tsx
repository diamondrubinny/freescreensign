// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  ArrowDown,
  ArrowUp,
  Circle,
  Copy,
  ImagePlus,
  Play,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaItem } from '../../api/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/ui';
import { DesignCanvas } from './DesignCanvas';
import { DesignPreview } from './DesignPreview';
import { useHistory } from './history';
import { ImagePicker } from './ImagePicker';
import { Inspector } from './Inspector';
import {
  imageElement,
  moveLayer,
  newId,
  shapeElement,
  textElement,
  type Design,
  type Element,
} from './model';

const toolButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 [&>svg]:size-4';

/**
 * Free-form slide editor: toolbar, canvas, layers and properties. The parent saves
 * `onChange` output (the full design) with the widget.
 */
export function DesignEditor({
  orgId,
  initial,
  readOnly,
  onDirtyChange,
  value,
}: {
  orgId: string;
  initial: Design;
  readOnly: boolean;
  onDirtyChange: (dirty: boolean) => void;
  /** Receives the current design whenever it changes. */
  value: (design: Design) => void;
}) {
  const { t } = useTranslation();
  const history = useHistory<Design>(initial);
  const design = history.value;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picker, setPicker] = useState<'add' | 'replace' | 'background' | null>(null);
  /** Each click replays the animated preview (a new key remounts it). */
  const [replay, setReplay] = useState(0);
  const animated = design.animate && design.elements.some((element) => element.animation);
  const selected = design.elements.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    value(design);
    onDirtyChange(design !== initial);
  }, [design, initial, value, onDirtyChange]);

  const elementLabel = (element: Element) => {
    const kind = t(`designer.kinds.${element.kind}`);
    if (element.kind === 'text') return `${kind}: ${element.text.slice(0, 40) || '…'}`;
    if (element.kind === 'shape') return `${kind}: ${t(`designer.shapes.${element.shape}`)}`;
    return kind;
  };

  const setElements = (elements: Element[], transient = false) => {
    history.set({ ...design, elements }, transient);
  };
  const add = (element: Element) => {
    setElements([...design.elements, element]);
    setSelectedId(element.id);
  };
  const updateSelected = (patch: Partial<Element>, transient = false) => {
    if (!selected) return;
    setElements(
      design.elements.map((e) => (e.id === selected.id ? ({ ...e, ...patch } as Element) : e)),
      transient,
    );
  };
  const remove = (id: string) => {
    setElements(design.elements.filter((e) => e.id !== id));
    setSelectedId(null);
  };

  const onPick = (media: MediaItem) => {
    if (picker === 'background') {
      history.set({ ...design, backgroundMediaId: media.id });
    } else if (picker === 'replace' && selected?.kind === 'image') {
      updateSelected({ mediaId: media.id });
    } else {
      add(imageElement(design, media.id, media));
    }
    setPicker(null);
  };

  // Undo/redo shortcuts (outside text fields, which keep their own undo).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [history]);

  return (
    <div className="flex flex-col gap-4">
      {!readOnly && (
        <div role="toolbar" aria-label={t('designer.toolbar')} className="flex flex-wrap gap-2">
          <button
            type="button"
            className={toolButton}
            onClick={() => {
              add(textElement(design, t('designer.newText')));
            }}
          >
            <Type aria-hidden="true" />
            {t('designer.addText')}
          </button>
          <button
            type="button"
            className={toolButton}
            onClick={() => {
              setPicker('add');
            }}
          >
            <ImagePlus aria-hidden="true" />
            {t('designer.addImage')}
          </button>
          <button
            type="button"
            className={toolButton}
            onClick={() => {
              add(shapeElement(design, 'rect'));
            }}
          >
            <Square aria-hidden="true" />
            {t('designer.addRect')}
          </button>
          <button
            type="button"
            className={toolButton}
            onClick={() => {
              add(shapeElement(design, 'ellipse'));
            }}
          >
            <Circle aria-hidden="true" />
            {t('designer.addEllipse')}
          </button>
          <span
            className="mx-1 w-px self-stretch bg-gray-300 dark:bg-gray-600"
            aria-hidden="true"
          />
          <button
            type="button"
            className={toolButton}
            disabled={!history.canUndo}
            onClick={history.undo}
          >
            <Undo2 aria-hidden="true" />
            {t('designer.undo')}
          </button>
          <button
            type="button"
            className={toolButton}
            disabled={!history.canRedo}
            onClick={history.redo}
          >
            <Redo2 aria-hidden="true" />
            {t('designer.redo')}
          </button>
          <span
            className="mx-1 w-px self-stretch bg-gray-300 dark:bg-gray-600"
            aria-hidden="true"
          />
          <button
            type="button"
            className={toolButton}
            disabled={!selected}
            onClick={() => {
              if (selected)
                add({ ...selected, id: newId(), x: selected.x + 30, y: selected.y + 30 });
            }}
          >
            <Copy aria-hidden="true" />
            {t('designer.duplicate')}
          </button>
          <button
            type="button"
            className={toolButton}
            disabled={!selected}
            onClick={() => {
              if (selected) remove(selected.id);
            }}
          >
            <Trash2 aria-hidden="true" />
            {t('designer.delete')}
          </button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-2">
          <DesignCanvas
            orgId={orgId}
            design={design}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={(next, transient) => {
              if (!readOnly) history.set(next, transient);
            }}
            onCommit={history.commit}
            onDelete={(id) => {
              if (!readOnly) remove(id);
            }}
            elementLabel={elementLabel}
          />
          <p className="text-sm text-gray-700 dark:text-gray-300">{t('designer.keyboardHint')}</p>
          {animated && (
            <div className="flex flex-col gap-2">
              <div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setReplay((count) => count + 1);
                  }}
                >
                  <Play aria-hidden="true" />
                  {t('designer.playPreview')}
                </Button>
              </div>
              {replay > 0 && (
                <DesignPreview
                  key={replay}
                  design={design}
                  orgId={orgId}
                  animate
                  label={t('designer.playPreview')}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <fieldset disabled={readOnly}>
              <legend className="sr-only">{t('designer.properties')}</legend>
              <Inspector
                design={design}
                element={selected}
                onDesign={(patch) => {
                  history.set({ ...design, ...patch });
                }}
                onElement={updateSelected}
                onCommit={history.commit}
                onPickBackground={() => {
                  setPicker('background');
                }}
                onRemoveBackground={() => {
                  const rest = { ...design };
                  delete rest.backgroundMediaId;
                  history.set(rest);
                }}
                onPickImage={() => {
                  setPicker('replace');
                }}
              />
            </fieldset>
          </Card>

          <Card className="p-4">
            <h3 id="layers-heading" className="mb-2 font-bold">
              {t('designer.layers')}
            </h3>
            {design.elements.length === 0 ? (
              <p className="text-sm">{t('designer.noElements')}</p>
            ) : (
              <ol aria-labelledby="layers-heading" className="flex flex-col gap-1">
                {[...design.elements].reverse().map((element) => {
                  const index = design.elements.indexOf(element);
                  const label = elementLabel(element);
                  return (
                    <li key={element.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-pressed={element.id === selectedId}
                        onClick={() => {
                          setSelectedId(element.id);
                        }}
                        className={`min-w-0 flex-1 truncate rounded-md px-2 py-1 text-start text-sm ${
                          element.id === selectedId
                            ? 'bg-brand-100 font-semibold text-brand-900 dark:bg-brand-950 dark:text-brand-100'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        <span dir="auto">{label}</span>
                      </button>
                      {!readOnly && (
                        <>
                          <Button
                            variant="secondary"
                            className="px-2! py-1!"
                            disabled={index === design.elements.length - 1}
                            aria-label={t('designer.bringForward', { name: label })}
                            onClick={() => {
                              setElements(moveLayer(design.elements, index, 1));
                            }}
                          >
                            <ArrowUp aria-hidden="true" />
                          </Button>
                          <Button
                            variant="secondary"
                            className="px-2! py-1!"
                            disabled={index === 0}
                            aria-label={t('designer.sendBackward', { name: label })}
                            onClick={() => {
                              setElements(moveLayer(design.elements, index, -1));
                            }}
                          >
                            <ArrowDown aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <ImagePicker
        orgId={orgId}
        open={picker !== null}
        onClose={() => {
          setPicker(null);
        }}
        onPick={onPick}
      />
      <span className="sr-only" aria-live="polite">
        {selected ? elementLabel(selected) : ''}
      </span>
    </div>
  );
}
