// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { MENU_MAX_ITEMS, MENU_TAGS, type MenuTag } from '@rubinny/shared';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/ui';

export interface MenuItemDraft {
  name: string;
  description?: string;
  price?: string;
  tags: MenuTag[];
}
export interface MenuSectionDraft {
  title: string;
  items: MenuItemDraft[];
}

const emptyItem = (): MenuItemDraft => ({ name: '', price: '', description: '', tags: [] });

function toDrafts(initial: unknown): MenuSectionDraft[] {
  if (!Array.isArray(initial) || initial.length === 0) {
    return [{ title: '', items: [emptyItem()] }];
  }
  return (initial as Partial<MenuSectionDraft>[]).map((section) => ({
    title: section.title ?? '',
    items: (section.items ?? []).map((item) => ({ ...emptyItem(), ...item })),
  }));
}

/** Empty optional texts are left out, so the server sees only what was written. */
export function menuSectionsValue(sections: MenuSectionDraft[]): unknown[] {
  return sections.map((section) => ({
    title: section.title.trim(),
    items: section.items.map((item) => ({
      name: item.name.trim(),
      ...(item.description?.trim() ? { description: item.description.trim() } : {}),
      ...(item.price?.trim() ? { price: item.price.trim() } : {}),
      tags: item.tags,
    })),
  }));
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(index, 1);
  if (moved !== undefined) next.splice(target, 0, moved);
  return next;
}

function TextInput({
  label,
  value,
  maxLength,
  required,
  error,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  maxLength: number;
  required?: boolean;
  error?: string | undefined;
  hint?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const describedBy =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        dir="auto"
        value={value}
        maxLength={maxLength}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={inputClass}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-gray-700 dark:text-gray-300">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Sections and items of a menu widget. Plain form controls with buttons to add, remove and
 * reorder (no drag only), so it works with a keyboard and a screen reader. The value travels
 * with the widget form as JSON in a hidden field named `name`.
 */
export function MenuSectionsEditor({
  name,
  initial,
  errors,
}: {
  name: string;
  initial: unknown;
  /** Server errors by path under the field, e.g. "0.items.1.name". */
  errors: Record<string, string>;
}) {
  const { t } = useTranslation();
  const [sections, setSections] = useState(() => toDrafts(initial));
  const total = sections.reduce((count, section) => count + section.items.length, 0);
  const full = total >= MENU_MAX_ITEMS;

  const updateSection = (index: number, patch: Partial<MenuSectionDraft>) => {
    setSections((current) =>
      current.map((section, i) => (i === index ? { ...section, ...patch } : section)),
    );
  };
  const updateItem = (sectionIndex: number, itemIndex: number, patch: Partial<MenuItemDraft>) => {
    setSections((current) =>
      current.map((section, i) =>
        i === sectionIndex
          ? {
              ...section,
              items: section.items.map((item, j) =>
                j === itemIndex ? { ...item, ...patch } : item,
              ),
            }
          : section,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name={name} value={JSON.stringify(menuSectionsValue(sections))} />
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {t('widgets.menu.limit', { count: MENU_MAX_ITEMS })}
      </p>
      {errors[''] && (
        <p className="text-sm font-semibold text-red-700 dark:text-red-300">{errors['']}</p>
      )}
      {sections.map((section, sectionIndex) => {
        const sectionName =
          section.title.trim() || t('widgets.menu.section', { n: sectionIndex + 1 });
        return (
          <fieldset
            key={sectionIndex}
            className="flex flex-col gap-3 rounded-xl border border-gray-300 p-3 dark:border-gray-700"
          >
            <legend className="px-1 font-bold">
              <span dir="auto">{sectionName}</span>
            </legend>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <TextInput
                  label={t('widgets.menu.sectionTitle')}
                  value={section.title}
                  maxLength={80}
                  error={errors[`${String(sectionIndex)}.title`]}
                  onChange={(title) => {
                    updateSection(sectionIndex, { title });
                  }}
                />
              </div>
              <Button
                variant="secondary"
                className="px-2!"
                disabled={sectionIndex === 0}
                aria-label={t('widgets.menu.moveUp', { name: sectionName })}
                onClick={() => {
                  setSections((current) => move(current, sectionIndex, -1));
                }}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                variant="secondary"
                className="px-2!"
                disabled={sectionIndex === sections.length - 1}
                aria-label={t('widgets.menu.moveDown', { name: sectionName })}
                onClick={() => {
                  setSections((current) => move(current, sectionIndex, 1));
                }}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                variant="secondary"
                className="px-2!"
                disabled={sections.length === 1}
                aria-label={t('widgets.menu.remove', { name: sectionName })}
                onClick={() => {
                  setSections((current) => current.filter((_, i) => i !== sectionIndex));
                }}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>

            <ol className="flex flex-col gap-3">
              {section.items.map((item, itemIndex) => {
                const path = `${String(sectionIndex)}.items.${String(itemIndex)}`;
                const itemName = item.name.trim() || t('widgets.menu.item', { n: itemIndex + 1 });
                return (
                  <li
                    key={itemIndex}
                    className="flex flex-col gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60"
                  >
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                      <TextInput
                        label={t('widgets.menu.name')}
                        value={item.name}
                        maxLength={80}
                        required
                        error={errors[`${path}.name`]}
                        onChange={(value) => {
                          updateItem(sectionIndex, itemIndex, { name: value });
                        }}
                      />
                      <TextInput
                        label={t('widgets.menu.price')}
                        value={item.price ?? ''}
                        maxLength={40}
                        error={errors[`${path}.price`]}
                        onChange={(value) => {
                          updateItem(sectionIndex, itemIndex, { price: value });
                        }}
                      />
                    </div>
                    <TextInput
                      label={t('widgets.menu.description')}
                      value={item.description ?? ''}
                      maxLength={200}
                      error={errors[`${path}.description`]}
                      onChange={(value) => {
                        updateItem(sectionIndex, itemIndex, { description: value });
                      }}
                    />
                    <fieldset>
                      <legend className="text-sm font-medium">{t('widgets.menu.tags')}</legend>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        {MENU_TAGS.map((tag) => (
                          <label key={tag} className="flex items-center gap-1.5 text-sm">
                            <input
                              type="checkbox"
                              className="size-4"
                              checked={item.tags.includes(tag)}
                              disabled={!item.tags.includes(tag) && item.tags.length >= 4}
                              onChange={(event) => {
                                updateItem(sectionIndex, itemIndex, {
                                  tags: event.target.checked
                                    ? [...item.tags, tag]
                                    : item.tags.filter((other) => other !== tag),
                                });
                              }}
                            />
                            {t(`widgets.menu.tagNames.${tag}`)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="px-2!"
                        disabled={itemIndex === 0}
                        aria-label={t('widgets.menu.moveUp', { name: itemName })}
                        onClick={() => {
                          updateSection(sectionIndex, {
                            items: move(section.items, itemIndex, -1),
                          });
                        }}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-2!"
                        disabled={itemIndex === section.items.length - 1}
                        aria-label={t('widgets.menu.moveDown', { name: itemName })}
                        onClick={() => {
                          updateSection(sectionIndex, {
                            items: move(section.items, itemIndex, 1),
                          });
                        }}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-2!"
                        aria-label={t('widgets.menu.remove', { name: itemName })}
                        onClick={() => {
                          updateSection(sectionIndex, {
                            items: section.items.filter((_, j) => j !== itemIndex),
                          });
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div>
              <Button
                variant="secondary"
                disabled={full || section.items.length >= 40}
                onClick={() => {
                  updateSection(sectionIndex, { items: [...section.items, emptyItem()] });
                }}
              >
                <Plus aria-hidden="true" />
                {t('widgets.menu.addItem', { section: sectionName })}
              </Button>
            </div>
          </fieldset>
        );
      })}
      <div>
        <Button
          variant="secondary"
          disabled={sections.length >= 8 || full}
          onClick={() => {
            setSections((current) => [...current, { title: '', items: [emptyItem()] }]);
          }}
        >
          <Plus aria-hidden="true" />
          {t('widgets.menu.addSection')}
        </Button>
      </div>
    </div>
  );
}
