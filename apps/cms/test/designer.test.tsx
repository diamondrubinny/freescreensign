import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { snap } from '../src/pages/design/model';
import { WidgetEditorPage } from '../src/pages/WidgetEditorPage';
import { mockApi, renderRoutes } from './render';

const ORG = '11111111-1111-4111-8111-111111111111';
const session = {
  user: {
    id: 'u1',
    email: 'dana@example.com',
    name: 'Dana',
    locale: 'he',
    emailVerified: true,
    mfaEnabled: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  memberships: [{ orgId: ORG, orgName: 'Org', role: 'EDITOR' }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('snapping', () => {
  it('snaps to the canvas center and edges within the threshold', () => {
    const design = { width: 1000, height: 500, background: '#000000', elements: [], animate: true };
    expect(snap({ x: 446, y: 3, w: 100, h: 50 }, design, [], 8)).toEqual({
      x: 450,
      y: 0,
      guides: { v: [500], h: [0] },
    });
    expect(snap({ x: 300, y: 100, w: 100, h: 50 }, design, [], 8).guides).toEqual({ v: [], h: [] });
  });
});

describe('design editor', () => {
  it('creates a design from a template, edits it with the keyboard and saves', async () => {
    const calls = mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session }),
      [`GET /api/v1/orgs/${ORG}/widget-types`]: () => ({
        status: 200,
        body: { types: [], weather: { enabled: false, attribution: '' } },
      }),
      [`POST /api/v1/orgs/${ORG}/widgets`]: () => ({
        status: 201,
        body: {
          widget: { id: 'w1', type: 'design', name: 'x', config: {}, usage: 0, updatedAt: '' },
        },
      }),
    });
    const { router } = renderRoutes(
      [
        { path: '/orgs/:orgId/widgets/new/:type', element: <WidgetEditorPage /> },
        { path: '/orgs/:orgId/widgets/:widgetId', element: <p>saved</p> },
      ],
      `/orgs/${ORG}/widgets/new/design`,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'התחלה ריק' }, { timeout: 5000 }));

    await user.click(screen.getByRole('button', { name: 'טקסט' }));
    // The canvas element (the layers list has a button with the same name).
    const element = document.querySelector<HTMLElement>('[data-element]')!;
    expect(element).toHaveAccessibleName('טקסט: טקסט חדש');
    expect(element).toHaveAttribute('aria-pressed', 'true');
    const x = screen.getByLabelText('X');
    const startX = Number((x as HTMLInputElement).value);

    element.focus();
    fireEvent.keyDown(element, { key: 'ArrowRight', shiftKey: true });
    expect(Number(screen.getByLabelText<HTMLInputElement>('X').value)).toBe(startX + 10);

    await user.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(Number(screen.getByLabelText<HTMLInputElement>('X').value)).toBe(startX);

    const text = screen.getByLabelText('טקסט', { selector: 'textarea' });
    await user.clear(text);
    await user.type(text, 'מבצע');
    expect(screen.getAllByRole('button', { name: 'טקסט: מבצע' })).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('יש שינויים שלא נשמרו.');

    await user.click(screen.getByRole('button', { name: 'Widget חדש' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/orgs/${ORG}/widgets/w1`);
    });
    const body = calls.find((c) => c.key.startsWith('POST'))?.body as {
      type: string;
      name: string;
      config: { width: number; elements: { kind: string; text?: string }[] };
    };
    expect(body).toMatchObject({ type: 'design', name: 'ריק', config: { width: 1920 } });
    expect(body.config.elements).toMatchObject([{ kind: 'text', text: 'מבצע' }]);
  });
});
