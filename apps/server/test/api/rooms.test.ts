// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoomStatusData } from '@rubinny/shared';
import { runMaintenance } from '../../src/lib/maintenance.js';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

interface Booking {
  id: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  title: string | null;
  bookedBy: { id: string; name: string | null } | null;
  atScreen: boolean;
  canEdit: boolean;
}

const HOUR = 3_600_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

describe.runIf(integrationEnabled)('meeting rooms', () => {
  let h: Harness;
  let orgId: string;
  let admin: Client;
  let viewer: Client;
  let other: Client;
  let viewerId: string;
  let events: string[];

  const api = (path = '', org = orgId) => `/api/v1/orgs/${org}${path}`;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  beforeEach(async () => {
    h = await createHarness();
    orgId = await insertOrg(h.db, await insertUser(h.db, 'admin@office.example'), 'Office', false);
    viewerId = await insertUser(h.db, 'viewer@office.example', { name: 'Dana' });
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: viewerId, role: 'VIEWER' })
      .execute();
    const otherId = await insertUser(h.db, 'other@office.example', { name: 'Avi' });
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: otherId, role: 'EDITOR' })
      .execute();
    admin = await login(h.app, 'admin@office.example');
    viewer = await login(h.app, 'viewer@office.example');
    other = await login(h.app, 'other@office.example');
    events = [];
    h.events.onEvent((screenId, event) => {
      events.push(`${screenId}:${event.type}:${'roomId' in event ? event.roomId : ''}`);
    });
  });
  afterEach(() => h.close());

  async function createRoom(name: string, extra: object = {}) {
    const res = await admin.post(api('/rooms'), { name, ...extra });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ room: { id: string } }>().room.id;
  }

  async function book(client: Client, roomId: string, from: number, to: number, title?: string) {
    return client.post(api('/room-bookings'), {
      roomId,
      startsAt: at(from),
      endsAt: at(to),
      ...(title !== undefined ? { title } : {}),
    });
  }

  /** A paired screen whose playlist shows a room widget; returns its player calls. */
  async function roomScreen(roomId: string, config: object = {}, client = admin, org = orgId) {
    const widget = await client.post(api('/widgets', org), {
      type: 'room',
      name: 'Room door',
      config: { roomId, ...config },
    });
    expect(widget.statusCode, widget.body).toBe(201);
    const widgetId = widget.json<{ widget: { id: string } }>().widget.id;
    const playlist = (await client.post(api('/playlists', org), { name: 'Door' })).json<{
      playlist: { id: string };
    }>().playlist.id;
    await client.put(api(`/playlists/${playlist}/items`, org), {
      items: [{ widgetId, durationMs: null }],
    });
    const player = new Client(h.app, '203.0.113.60');
    const start = (await player.post('/player/v1/pair/start')).json<{
      code: string;
      pollToken: string;
    }>();
    const screen = await client.post(api('/screens', org), { code: start.code, name: 'Door' });
    expect(screen.statusCode, screen.body).toBe(201);
    const screenId = screen.json<{ screen: { id: string } }>().screen.id;
    await client.patch(api(`/screens/${screenId}`, org), { playlistId: playlist });
    const { deviceToken } = (
      await player.post('/player/v1/pair/status', { pollToken: start.pollToken })
    ).json<{ deviceToken: string }>();
    const call = (method: 'GET' | 'POST', url: string, payload?: object) =>
      h.app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${deviceToken}` },
        ...(payload ? { payload } : {}),
      });
    return {
      screenId,
      widgetId,
      status: async () => {
        const res = await call('GET', `/player/v1/widgets/${widgetId}/data`);
        expect(res.statusCode, res.body).toBe(200);
        return res.json<{ type: string; data: RoomStatusData }>().data;
      },
      book: (minutes: number, pin: string, room = roomId) =>
        call('POST', `/player/v1/rooms/${room}/bookings`, { minutes, pin }),
      end: (bookingId: string, pin: string) =>
        call('POST', `/player/v1/rooms/${roomId}/bookings/${bookingId}/end`, { pin }),
    };
  }

  it('lets admins manage rooms, with unique names, and members only look', async () => {
    const big = await createRoom('Big room', { location: 'Floor 3', capacity: 12 });
    expect((await admin.post(api('/rooms'), { name: 'big ROOM' })).statusCode).toBe(409);
    expect((await viewer.post(api('/rooms'), { name: 'Small' })).statusCode).toBe(403);
    expect((await other.patch(api(`/rooms/${big}`), { name: 'X' })).statusCode).toBe(403);
    const listed: unknown = (await viewer.get(api('/rooms'))).json();
    expect(listed).toEqual({
      rooms: [{ id: big, name: 'Big room', location: 'Floor 3', capacity: 12, showTitles: false }],
      pinSet: false,
    });
    const renamed = await admin.patch(api(`/rooms/${big}`), {
      name: 'Board room',
      showTitles: true,
    });
    expect(renamed.json()).toMatchObject({ room: { name: 'Board room', showTitles: true } });
  });

  it('books rooms without overlaps, even at the same moment', async () => {
    const room = await createRoom('Big room');
    const first = await book(viewer, room, HOUR, 2 * HOUR, 'Weekly sync');
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json<{ booking: Booking }>().booking).toMatchObject({
      roomId: room,
      title: 'Weekly sync',
      bookedBy: { id: viewerId, name: 'Dana' },
      atScreen: false,
      canEdit: true,
    });

    const overlap = await book(other, room, 1.5 * HOUR, 3 * HOUR);
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json()).toMatchObject({ error: { code: 'ROOM_BUSY' } });
    // Back to back is fine (a booking ends when the next starts).
    expect((await book(other, room, 2 * HOUR, 3 * HOUR)).statusCode).toBe(201);

    // Two requests for the same slot at once: exactly one wins.
    const both = await Promise.all([
      book(viewer, room, 5 * HOUR, 6 * HOUR),
      book(other, room, 5.5 * HOUR, 6.5 * HOUR),
    ]);
    expect(both.map((r) => r.statusCode).sort()).toEqual([201, 409]);

    // Another room is independent.
    const small = await createRoom('Small room');
    expect((await book(other, small, HOUR, 2 * HOUR)).statusCode).toBe(201);
  });

  it('checks the times of a booking', async () => {
    const room = await createRoom('Big room');
    const invalid = async (from: number, to: number) => {
      const res = await book(viewer, room, from, to);
      expect(res.statusCode, res.body).toBe(400);
    };
    await invalid(-HOUR, HOUR); // in the past
    await invalid(HOUR, HOUR); // empty
    await invalid(2 * HOUR, HOUR); // backwards
    await invalid(HOUR, 14 * HOUR); // longer than 12 hours
    await invalid(400 * 24 * HOUR, 400 * 24 * HOUR + HOUR); // more than a year ahead
    const foreignOrg = await insertOrg(
      h.db,
      await insertUser(h.db, 'x@else.example'),
      'Else',
      false,
    );
    const elsewhere = await login(h.app, 'x@else.example');
    const theirRoom = (await elsewhere.post(api('/rooms', foreignOrg), { name: 'Theirs' })).json<{
      room: { id: string };
    }>().room.id;
    expect((await book(viewer, theirRoom, HOUR, 2 * HOUR)).statusCode).toBe(404);
  });

  it('lets members change their own bookings, and admins anyone’s', async () => {
    const room = await createRoom('Big room');
    const mine = (await book(viewer, room, HOUR, 2 * HOUR, 'Mine')).json<{ booking: Booking }>()
      .booking;
    const theirs = (await book(other, room, 3 * HOUR, 4 * HOUR, 'Theirs')).json<{
      booking: Booking;
    }>().booking;

    const listed = (
      await viewer.get(
        api(
          `/room-bookings?from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(24 * HOUR))}`,
        ),
      )
    ).json<{ bookings: Booking[] }>().bookings;
    expect(listed.map((b) => [b.title, b.canEdit])).toEqual([
      ['Mine', true],
      ['Theirs', false],
    ]);
    const onlyMine = (
      await viewer.get(
        api(
          `/room-bookings?from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(24 * HOUR))}&mine=true`,
        ),
      )
    ).json<{ bookings: Booking[] }>().bookings;
    expect(onlyMine.map((b) => b.title)).toEqual(['Mine']);
    // A range longer than 31 days is refused.
    expect(
      (
        await viewer.get(
          api(
            `/room-bookings?from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(40 * 24 * HOUR))}`,
          ),
        )
      ).statusCode,
    ).toBe(400);

    expect(
      (await viewer.patch(api(`/room-bookings/${theirs.id}`), { title: 'X' })).statusCode,
    ).toBe(403);
    expect((await viewer.delete(api(`/room-bookings/${theirs.id}`))).statusCode).toBe(403);
    const moved = await viewer.patch(api(`/room-bookings/${mine.id}`), {
      startsAt: at(5 * HOUR),
      endsAt: at(6 * HOUR),
    });
    expect(moved.statusCode, moved.body).toBe(200);
    // Moving onto another booking is refused.
    const clash = await viewer.patch(api(`/room-bookings/${mine.id}`), {
      startsAt: at(3.5 * HOUR),
      endsAt: at(4.5 * HOUR),
    });
    expect(clash.statusCode).toBe(409);
    expect((await admin.delete(api(`/room-bookings/${theirs.id}`))).statusCode).toBe(204);
    expect((await viewer.delete(api(`/room-bookings/${mine.id}`))).statusCode).toBe(204);
  });

  it('shows a room’s screen free or busy, without who booked, and titles only when allowed', async () => {
    const room = await createRoom('Big room', { location: 'Floor 3' });
    const door = await roomScreen(room);
    let status = await door.status();
    expect(status).toMatchObject({
      room: { name: 'Big room', location: 'Floor 3', capacity: null },
      current: null,
      upcoming: [],
      bookingEnabled: false,
    });

    // A meeting now (inserted directly: the API refuses past starts) and one later.
    await h.db
      .insertInto('room_bookings')
      .values({
        org_id: orgId,
        room_id: room,
        starts_at: new Date(Date.now() - 10 * 60_000),
        ends_at: new Date(Date.now() + 20 * 60_000),
        title: 'Interview',
        booked_by: viewerId,
      })
      .execute();
    await book(other, room, HOUR, 2 * HOUR, 'Planning');
    status = await door.status();
    expect(status.current).toMatchObject({ title: null, screenBookingId: null });
    expect(status.upcoming).toHaveLength(1);
    expect(status.upcoming[0]?.title).toBeNull();
    expect(JSON.stringify(status)).not.toMatch(/Dana|Avi|viewer@|Interview|Planning/);

    await admin.patch(api(`/rooms/${room}`), { showTitles: true });
    status = await door.status();
    expect(status.current?.title).toBe('Interview');
    expect(status.upcoming[0]?.title).toBe('Planning');
    expect(JSON.stringify(status)).not.toMatch(/Dana|Avi|viewer@/);
  });

  it('books at the screen with the organization’s PIN, within limits', async () => {
    const room = await createRoom('Big room');
    const door = await roomScreen(room);

    // No PIN yet: booking at screens is off.
    let res = await door.book(30, '123456');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'BOOKING_DISABLED' } });

    expect((await other.put(api('/settings/room-pin'), { pin: '123456' })).statusCode).toBe(403);
    expect((await admin.put(api('/settings/room-pin'), { pin: '12' })).statusCode).toBe(400);
    expect((await admin.put(api('/settings/room-pin'), { pin: '123456' })).json()).toEqual({
      pinSet: true,
    });
    expect((await door.status()).bookingEnabled).toBe(true);
    const stored = await h.db
      .selectFrom('organizations')
      .select('room_pin_hash')
      .where('id', '=', orgId)
      .executeTakeFirstOrThrow();
    expect(stored.room_pin_hash).toMatch(/^\$argon2id\$/);

    res = await door.book(30, '000000');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'WRONG_PIN' } });
    const failures = await h.db
      .selectFrom('audit_logs')
      .select('action')
      .where('org_id', '=', orgId)
      .where('action', '=', 'room.pin_failed')
      .execute();
    expect(failures).toHaveLength(1);

    await settle();
    events.length = 0;
    res = await door.book(30, '123456');
    expect(res.statusCode, res.body).toBe(201);
    const booking = res.json<{ booking: { id: string; startsAt: string; endsAt: string } }>()
      .booking;
    expect(Date.parse(booking.endsAt) - Date.parse(booking.startsAt)).toBeGreaterThanOrEqual(
      29 * 60_000,
    );
    await settle();
    expect(events).toContain(`${door.screenId}:room.changed:${room}`);
    const status = await door.status();
    expect(status.current?.screenBookingId).toBe(booking.id);

    // The room is now busy.
    res = await door.book(15, '123456');
    expect(res.statusCode).toBe(409);

    // The dashboard shows it as booked at a screen, with no person.
    const listed = (
      await viewer.get(
        api(
          `/room-bookings?from=${encodeURIComponent(at(-HOUR))}&to=${encodeURIComponent(at(HOUR))}`,
        ),
      )
    ).json<{ bookings: Booking[] }>().bookings;
    expect(listed).toMatchObject([{ atScreen: true, bookedBy: null }]);

    // Ending it frees the room.
    expect((await door.end(booking.id, '000000')).statusCode).toBe(403);
    expect((await door.end(booking.id, '123456')).statusCode).toBe(204);
    expect((await door.status()).current).toBeNull();

    // Only bookings made at a screen can be ended there.
    const meeting = (await book(viewer, room, HOUR, 2 * HOUR)).json<{ booking: Booking }>().booking;
    expect((await door.end(meeting.id, '123456')).statusCode).toBe(404);

    // Clearing the PIN turns booking at screens off again.
    await admin.put(api('/settings/room-pin'), { pin: null });
    expect((await door.status()).bookingEnabled).toBe(false);
  });

  it('locks the PIN after five wrong tries, even for the right PIN', async () => {
    const room = await createRoom('Big room');
    const door = await roomScreen(room);
    await admin.put(api('/settings/room-pin'), { pin: '4321' });
    for (let i = 0; i < 5; i++) {
      expect((await door.book(15, '9999')).statusCode).toBe(403);
    }
    expect((await door.book(15, '4321')).statusCode).toBe(429);
  });

  it('refuses booking for rooms the screen does not show, or does not allow', async () => {
    const shown = await createRoom('Shown');
    const hidden = await createRoom('Hidden');
    const door = await roomScreen(shown);
    await admin.put(api('/settings/room-pin'), { pin: '123456' });
    expect((await door.book(15, '123456', hidden)).statusCode).toBe(404);
    expect((await door.book(15, '123456', '00000000-0000-4000-8000-000000000009')).statusCode).toBe(
      404,
    );

    const readOnly = await createRoom('Read only');
    const lobby = await roomScreen(readOnly, { allowBooking: false });
    expect((await lobby.status()).bookingEnabled).toBe(false);
    expect((await lobby.book(15, '123456')).statusCode).toBe(404);

    // Another organization's screen cannot book this organization's room.
    const elseOrg = await insertOrg(h.db, await insertUser(h.db, 'x@else.example'), 'Else', false);
    const elsewhere = await login(h.app, 'x@else.example');
    const theirRoom = (await elsewhere.post(api('/rooms', elseOrg), { name: 'Theirs' })).json<{
      room: { id: string };
    }>().room.id;
    const theirDoor = await roomScreen(theirRoom, {}, elsewhere, elseOrg);
    expect((await theirDoor.book(15, '123456', shown)).statusCode).toBe(404);
  });

  it('only lets a room widget show a room of the same organization', async () => {
    const elseOrg = await insertOrg(h.db, await insertUser(h.db, 'x@else.example'), 'Else', false);
    const elsewhere = await login(h.app, 'x@else.example');
    const theirRoom = (await elsewhere.post(api('/rooms', elseOrg), { name: 'Theirs' })).json<{
      room: { id: string };
    }>().room.id;
    const res = await admin.post(api('/widgets'), {
      type: 'room',
      name: 'Door',
      config: { roomId: theirRoom },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { fields: [{ path: 'config.roomId', reason: 'invalid' }] },
    });
  });

  it('deletes a room with its bookings, and old bookings after 90 days', async () => {
    const room = await createRoom('Big room');
    await book(viewer, room, HOUR, 2 * HOUR);
    await h.db
      .insertInto('room_bookings')
      .values({
        org_id: orgId,
        room_id: room,
        starts_at: new Date(Date.now() - 100 * 24 * HOUR),
        ends_at: new Date(Date.now() - 100 * 24 * HOUR + HOUR),
      })
      .execute();
    expect((await runMaintenance(h.db, 365)).roomBookings).toBe(1);
    expect((await admin.delete(api(`/rooms/${room}`))).statusCode).toBe(204);
    const left = await h.db.selectFrom('room_bookings').select('id').execute();
    expect(left).toEqual([]);
  });
});
