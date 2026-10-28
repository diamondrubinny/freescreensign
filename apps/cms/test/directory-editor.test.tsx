// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { changeLocale } from '../src/i18n';
import { readWidgetConfig } from '../src/pages/widget-fields';
import { DirectoryEditor } from '../src/pages/widgets/DirectoryEditor';
import { mockApi, renderRoutes } from './render';

const ORG = '11111111-1111-4111-8111-111111111111';
const MAP = '7d3e3b0e-8c43-4f43-9a52-2b2b3c1f0a11';

const value = (): Record<string, unknown> => {
  const hidden = document.querySelector<HTMLInputElement>('input[type="hidden"][name="lists"]')!;
  return JSON.parse(hidden.value) as Record<string, unknown>;
};

function mount(initial?: unknown, errors: Record<string, string> = {}) {
  mockApi({
    [`GET /api/v1/orgs/${ORG}/media?kind=image`]: () => ({
      status: 200,
      body: {
        media: [
          { id: MAP, name: 'Floor 2 map', status: 'ready', kind: 'image' },
          { id: 'pending', name: 'Still checking', status: 'scanning', kind: 'image' },
        ],
        nextCursor: null,
      },
    }),
  });
  renderRoutes(
    [
      {
        path: '/orgs/:orgId/widgets/new/directory',
        element: <DirectoryEditor name="lists" initial={initial} errors={errors} />,
      },
    ],
    `/orgs/${ORG}/widgets/new/directory`,
  );
}

describe('directory editor', () => {
  beforeAll(async () => {
    await act(async () => {
      await changeLocale('en');
    });
  });
  afterAll(async () => {
    await act(async () => {
      await changeLocale('he');
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('edits floors (with a map), categories and entries, and sends what was written', async () => {
    const user = userEvent.setup();
    mount();
    // Starts with floor "1" and one empty entry on it.
    expect(screen.getByLabelText('Floor name')).toHaveValue('1');
    await user.click(screen.getByRole('button', { name: 'Add floor' }));
    await user.type(screen.getAllByLabelText('Floor name')[1]!, '2');
    // Only ready images can be maps.
    const maps = screen.getAllByLabelText('Floor map (optional)');
    expect(await within(maps[1]!).findByRole('option', { name: 'Floor 2 map' })).toBeVisible();
    expect(within(maps[1]!).queryByRole('option', { name: 'Still checking' })).toBeNull();
    await user.selectOptions(maps[1]!, 'Floor 2 map');
    await user.click(screen.getByRole('button', { name: 'Add category' }));
    await user.type(screen.getByLabelText('Category name'), 'Medical');

    await user.type(screen.getByLabelText('Name (company, department or service)'), 'Clinic');
    await user.selectOptions(screen.getByLabelText('Floor'), '2');
    await user.type(screen.getByLabelText('Room (optional)'), '204');
    await user.selectOptions(screen.getByLabelText('Category'), 'Medical');
    await user.selectOptions(screen.getByLabelText('Direction'), 'Left');
    expect(value()).toEqual({
      floors: [{ name: '1' }, { name: '2', mapMediaId: MAP }],
      categories: ['Medical'],
      entries: [
        { name: 'Clinic', floor: '2', room: '204', category: 'Medical', direction: 'left' },
      ],
    });

    // The form reads the lists as configuration keys.
    const data = new FormData();
    data.set('lists', JSON.stringify(value()));
    data.set('idleSeconds', '30');
    expect(readWidgetConfig('directory', data)).toMatchObject({
      floors: [{ name: '1' }, { name: '2', mapMediaId: MAP }],
      categories: ['Medical'],
      idleSeconds: 30,
    });
  });

  it('shows server errors next to the entry they belong to', () => {
    mount(
      { floors: [{ name: '1' }], entries: [{ name: 'X', floor: '7' }] },
      { 'entries.0.floor': 'Unknown floor' },
    );
    const floor = screen.getByLabelText('Floor');
    expect(floor).toHaveAttribute('aria-invalid', 'true');
    expect(floor).toHaveAccessibleDescription('Unknown floor');
    // The unknown floor stays visible, so the problem can be seen and fixed.
    expect(floor).toHaveValue('7');
  });
});
