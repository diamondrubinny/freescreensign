import { describe, expect, it } from 'vitest';
import { activeLayoutId, entryActive, localTime } from '../src/schedule';
import { flattenPlaylist, activeLayout } from '../src/sequence';
import { manifest } from './fixtures';

describe('localTime', () => {
  it('uses the screen time zone', () => {
    // 2026-10-15 is a Thursday. 21:30 UTC = 00:30 Friday in Jerusalem (UTC+3).
    const now = new Date('2026-10-15T21:30:00Z');
    expect(localTime(now, 'UTC')).toEqual({ day: 4, minutes: 21 * 60 + 30 });
    expect(localTime(now, 'Asia/Jerusalem')).toEqual({ day: 5, minutes: 30 });
  });

  it('falls back to the device clock for unknown zones', () => {
    expect(() => localTime(new Date(), 'Not/AZone')).not.toThrow();
  });
});

describe('entryActive', () => {
  const base = { id: 'e', layoutId: 'l', priority: 1 };
  const at = (iso: string) => new Date(iso);

  it('handles day and time windows', () => {
    const entry = { ...base, daysOfWeek: [0, 1, 2, 3, 4], timeFrom: '08:00', timeTo: '12:00' };
    expect(entryActive(entry, at('2026-10-15T06:00:00Z'), 'Asia/Jerusalem')).toBe(true); // Thu 09:00
    expect(entryActive(entry, at('2026-10-15T10:00:00Z'), 'Asia/Jerusalem')).toBe(false); // Thu 13:00
    expect(entryActive(entry, at('2026-10-16T06:00:00Z'), 'Asia/Jerusalem')).toBe(false); // Friday
  });

  it('handles windows crossing midnight', () => {
    const entry = { ...base, timeFrom: '22:00', timeTo: '02:00' };
    expect(entryActive(entry, at('2026-10-15T23:30:00Z'), 'UTC')).toBe(true);
    expect(entryActive(entry, at('2026-10-15T01:00:00Z'), 'UTC')).toBe(true);
    expect(entryActive(entry, at('2026-10-15T12:00:00Z'), 'UTC')).toBe(false);
  });

  it('honours date ranges', () => {
    const entry = { ...base, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-31T00:00:00Z' };
    expect(entryActive(entry, at('2026-10-15T00:00:00Z'), 'UTC')).toBe(true);
    expect(entryActive(entry, at('2026-11-01T00:00:00Z'), 'UTC')).toBe(false);
  });
});

describe('activeLayoutId', () => {
  it('picks the highest-priority active entry, else the default', () => {
    const m = manifest({
      layouts: [
        {
          id: 'default',
          width: 10,
          height: 10,
          zones: [{ id: 'z', x: 0, y: 0, w: 10, h: 10, z: 0, playlistId: null }],
        },
        {
          id: 'morning',
          width: 10,
          height: 10,
          zones: [{ id: 'z', x: 0, y: 0, w: 10, h: 10, z: 0, playlistId: null }],
        },
        {
          id: 'promo',
          width: 10,
          height: 10,
          zones: [{ id: 'z', x: 0, y: 0, w: 10, h: 10, z: 0, playlistId: null }],
        },
      ],
      schedule: {
        defaultLayoutId: 'default',
        entries: [
          { id: 'a', layoutId: 'morning', priority: 1, timeFrom: '06:00', timeTo: '12:00' },
          { id: 'b', layoutId: 'promo', priority: 5, timeFrom: '09:00', timeTo: '10:00' },
        ],
      },
    });
    m.screen.timezone = 'UTC';
    expect(activeLayoutId(m, new Date('2026-10-15T07:00:00Z'))).toBe('morning');
    expect(activeLayoutId(m, new Date('2026-10-15T09:30:00Z'))).toBe('promo');
    expect(activeLayoutId(m, new Date('2026-10-15T15:00:00Z'))).toBe('default');
  });
});

describe('flattenPlaylist', () => {
  it('expands nested playlists, widgets, and skips missing references', () => {
    const m = manifest({
      widgets: [{ id: 'w1', type: 'clock', config: {} }],
      playlists: [
        {
          id: 'outer',
          items: [
            { kind: 'media', ref: 'm1', durationMs: 1000, transition: 'none' },
            { kind: 'playlist', ref: 'inner', durationMs: 1, transition: 'none' },
            { kind: 'widget', ref: 'w1', durationMs: 1000, transition: 'none' },
            { kind: 'widget', ref: 'gone', durationMs: 1000, transition: 'none' },
          ],
        },
        {
          id: 'inner',
          items: [{ kind: 'media', ref: 'm2', durationMs: 2000, transition: 'fade' }],
        },
      ],
    });
    expect(
      flattenPlaylist(m, 'outer').map((i) => [
        i.kind === 'media' ? i.media.id : i.widget.id,
        i.durationMs,
      ]),
    ).toEqual([
      ['m1', 1000],
      ['m2', 2000],
      ['w1', 1000],
    ]);
    expect(flattenPlaylist(m, null)).toEqual([]);
    expect(flattenPlaylist(m, 'missing')).toEqual([]);
  });

  it('resolves the active layout from the schedule', () => {
    const m = manifest();
    expect(activeLayout(m, new Date())?.id).toBe('default');
    expect(
      activeLayout({ ...m, schedule: { defaultLayoutId: null, entries: [] } }, new Date()),
    ).toBeNull();
  });
});
