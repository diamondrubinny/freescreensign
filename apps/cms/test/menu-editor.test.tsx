import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { changeLocale } from '../src/i18n';
import { readWidgetConfig } from '../src/pages/widget-fields';
import { MenuSectionsEditor } from '../src/pages/widgets/MenuSectionsEditor';

const value = (container: HTMLElement): unknown => {
  const hidden = container.querySelector<HTMLInputElement>(
    'input[type="hidden"][name="sections"]',
  )!;
  return JSON.parse(hidden.value);
};

describe('menu editor', () => {
  beforeAll(async () => {
    await act(async () => {
      await changeLocale('en');
    });
  });

  it('edits sections and items with labelled controls, and sends only what was written', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MenuSectionsEditor name="sections" initial={undefined} errors={{}} />,
    );
    await user.type(screen.getByLabelText('Section title'), 'Mains');
    await user.type(screen.getByLabelText('Name'), 'Pasta');
    await user.type(screen.getByLabelText('Price or time'), '58');
    await user.click(screen.getByLabelText('Vegan'));
    expect(value(container)).toEqual([
      { title: 'Mains', items: [{ name: 'Pasta', price: '58', tags: ['vegan'] }] },
    ]);

    await user.click(screen.getByRole('button', { name: 'Add an item to Mains' }));
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    await user.type(within(items[1]!).getByLabelText('Name'), 'Salad');
    await user.click(screen.getByRole('button', { name: 'Move Salad up' }));
    expect(
      (value(container) as { items: { name: string }[] }[])[0]?.items.map((i) => i.name),
    ).toEqual(['Salad', 'Pasta']);
    await user.click(screen.getByRole('button', { name: 'Remove Pasta' }));
    await user.click(screen.getByRole('button', { name: 'Add a section' }));
    expect(screen.getAllByRole('group', { name: /Mains|Section 2/ }).length).toBeGreaterThanOrEqual(
      2,
    );
    expect((value(container) as unknown[]).length).toBe(2);
  });

  it('allows at most four tags per item', async () => {
    const user = userEvent.setup();
    render(<MenuSectionsEditor name="sections" initial={undefined} errors={{}} />);
    for (const tag of ['Vegan', 'Spicy', 'New', "Chef's pick"]) {
      await user.click(screen.getByLabelText(tag));
    }
    expect(screen.getByLabelText('Gluten free')).toBeDisabled();
  });

  it('shows server errors next to the field they belong to', () => {
    render(
      <MenuSectionsEditor
        name="sections"
        initial={[{ title: 'Mains', items: [{ name: '', tags: [] }] }]}
        errors={{ '0.items.0.name': 'Too small: expected string to have >=1 characters' }}
      />,
    );
    const name = screen.getByLabelText('Name');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(/Too small/);
  });

  it('is read back from the form as JSON', () => {
    const data = new FormData();
    data.set('sections', JSON.stringify([{ title: 'A', items: [] }]));
    data.set('currency', 'USD');
    data.set('columns', '3');
    expect(readWidgetConfig('menu', data)).toMatchObject({
      sections: [{ title: 'A', items: [] }],
      currency: 'USD',
      columns: 3,
    });
  });
});
