// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomBookingItem, RoomItem } from '../src/api/types';
import { RoomsPage } from '../src/pages/RoomsPage';
import { mockApi, renderRoutes } from './render';

const ORG = '11111111-1111-4111-8111-111111111111';
const session = (role: string) => ({
  user: {
    id: 'u1',
    email: 'dana@example.com',
    name: 'Dana',
    locale: 'he',
    emailVerified: true,
    mfaEnabled: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  memberships: [{ orgId: ORG, orgName: 'Org', role }],
});
const room: RoomItem = {
  id: 'r1',
  name: 'חדר ישיבות גדול',
  location: 'קומה 3',
  capacity: 12,
  showTitles: false,
};

/** Today at hh:mm local time, as ISO. */
const today = (hh: number, mm = 0) => {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};

/** Handlers by method and path; the bookings listing matches whatever its query string. */
function api(handlers: Record<string, (body: unknown) => { status: number; body?: unknown }>) {
  return mockApi(
    new Proxy(handlers, {
      get: (target, key: string) =>
        target[key] ??
        (key.startsWith(`GET /api/v1/orgs/${ORG}/room-bookings?`)
          ? target[`GET /api/v1/orgs/${ORG}/room-bookings`]
          : undefined),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('meeting rooms page', () => {
  it('lists the day’s bookings and lets a member book, with a clear message when busy', async () => {
    const existing: RoomBookingItem = {
      id: 'b1',
      roomId: 'r1',
      startsAt: today(10),
      endsAt: today(11),
      title: 'סנכרון שבועי',
      bookedBy: { id: 'u2', name: 'Avi' },
      atScreen: false,
      canEdit: false,
    };
    let busy = true;
    const calls = api({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('VIEWER') }),
      [`GET /api/v1/orgs/${ORG}/rooms`]: () => ({
        status: 200,
        body: { rooms: [room], pinSet: false },
      }),
      [`GET /api/v1/orgs/${ORG}/room-bookings`]: () => ({
        status: 200,
        body: { bookings: [existing] },
      }),
      [`POST /api/v1/orgs/${ORG}/room-bookings`]: () => {
        if (busy) {
          busy = false;
          return {
            status: 409,
            body: {
              error: {
                code: 'ROOM_BUSY',
                message: 'busy',
                fields: [{ path: 'startsAt', reason: 'overlap' }],
              },
            },
          };
        }
        return { status: 201, body: { booking: { ...existing, id: 'b2' } } };
      },
    });
    renderRoutes([{ path: '/orgs/:orgId/rooms', element: <RoomsPage /> }], `/orgs/${ORG}/rooms`);
    const user = userEvent.setup();

    expect(await screen.findByText('סנכרון שבועי', {}, { timeout: 5000 })).toBeVisible();
    expect(screen.getByText('הוזמן על ידי Avi')).toBeVisible();
    expect(screen.getByText('קומה 3 · 12 מקומות')).toBeVisible();
    // Someone else's booking: no edit or cancel for a member.
    expect(screen.queryByRole('button', { name: /^ביטול ההזמנה/ })).toBeNull();
    // Members do not manage rooms or the PIN.
    expect(screen.queryByRole('heading', { name: 'ניהול חדרים' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'הזמנה מהמסך' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'הזמנת חדר ישיבות גדול' }));
    const dialog = await screen.findByRole('dialog', { name: 'הזמנת חדר' });
    const from = within(dialog).getByLabelText(/^משעה/);
    const to = within(dialog).getByLabelText(/^עד שעה/);
    await user.clear(from);
    await user.type(from, '10:30');
    await user.clear(to);
    await user.type(to, '10:00');
    await user.click(within(dialog).getByRole('button', { name: 'שמירה' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('שעת הסיום צריכה להיות אחרי');

    await user.clear(to);
    await user.type(to, '11:30');
    await user.type(within(dialog).getByRole('textbox', { name: /^כותרת/ }), 'ראיון');
    await user.click(within(dialog).getByRole('button', { name: 'שמירה' }));
    expect(await within(dialog).findByText(/החדר כבר מוזמן בשעה הזאת/)).toBeVisible();
    const sent = calls.find((c) => c.key === `POST /api/v1/orgs/${ORG}/room-bookings`)?.body as {
      roomId: string;
      startsAt: string;
      endsAt: string;
      title: string;
    };
    expect(sent.roomId).toBe('r1');
    expect(sent.title).toBe('ראיון');
    expect(Date.parse(sent.endsAt) - Date.parse(sent.startsAt)).toBe(60 * 60_000);
    expect(new Date(sent.startsAt).getHours()).toBe(10);
    expect(new Date(sent.startsAt).getMinutes()).toBe(30);

    await user.click(within(dialog).getByRole('button', { name: 'שמירה' }));
    expect(await screen.findByText('החדר הוזמן.')).toBeVisible();
  });

  it('lets an admin add a room and set the PIN for booking at screens', async () => {
    let rooms: RoomItem[] = [];
    let pinSet = false;
    const calls = api({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('ADMIN') }),
      [`GET /api/v1/orgs/${ORG}/rooms`]: () => ({ status: 200, body: { rooms, pinSet } }),
      [`GET /api/v1/orgs/${ORG}/room-bookings`]: () => ({ status: 200, body: { bookings: [] } }),
      [`POST /api/v1/orgs/${ORG}/rooms`]: (body) => {
        rooms = [{ ...room, ...(body as object), id: 'r9' }];
        return { status: 201, body: { room: rooms[0] } };
      },
      [`PUT /api/v1/orgs/${ORG}/settings/room-pin`]: (body) => {
        pinSet = (body as { pin: string | null }).pin !== null;
        return { status: 200, body: { pinSet } };
      },
    });
    renderRoutes([{ path: '/orgs/:orgId/rooms', element: <RoomsPage /> }], `/orgs/${ORG}/rooms`);
    const user = userEvent.setup();

    expect(await screen.findByText('עדיין אין חדרים', {}, { timeout: 5000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'הוספת חדר' }));
    const dialog = await screen.findByRole('dialog', { name: 'הוספת חדר' });
    await user.type(within(dialog).getByRole('textbox', { name: /^שם החדר/ }), 'חדר קטן');
    await user.type(within(dialog).getByRole('spinbutton', { name: /^מספר מקומות/ }), '4');
    await user.click(within(dialog).getByRole('button', { name: 'שמירה' }));
    expect(await screen.findByText('החדר נשמר.')).toBeVisible();
    expect(calls.find((c) => c.key === `POST /api/v1/orgs/${ORG}/rooms`)?.body).toEqual({
      name: 'חדר קטן',
      location: null,
      capacity: 4,
      showTitles: false,
    });

    expect(screen.getByText('כבוי: אין קוד, ולכן אי אפשר להזמין מהמסך.')).toBeVisible();
    const pin = screen.getByLabelText(/^קוד חדש/);
    expect(pin).toHaveAttribute('type', 'password');
    expect(pin).toHaveAttribute('inputmode', 'numeric');
    await user.type(pin, '12a');
    expect(pin).toHaveValue('12');
    await user.click(screen.getByRole('button', { name: 'שמירת הקוד' }));
    expect(screen.getByText('יש להקליד 6 עד 8 ספרות.')).toBeVisible();
    await user.type(pin, '3456');
    await user.click(screen.getByRole('button', { name: 'שמירת הקוד' }));
    expect(await screen.findByText('הקוד נשמר.')).toBeVisible();
    await waitFor(() => {
      expect(screen.getByText('פעיל: יש קוד להזמנה מהמסך.')).toBeVisible();
    });
    expect(calls.find((c) => c.key === `PUT /api/v1/orgs/${ORG}/settings/room-pin`)?.body).toEqual({
      pin: '123456',
    });
  });
});
