import { describe, expect, it } from 'vitest';
import { findPlaylistCycle, parseManifest, type ManifestV1 } from '../src/manifest.js';

const sha = 'a'.repeat(64);

function validManifest(): ManifestV1 {
  return {
    schemaVersion: 1,
    version: 'v1',
    generatedAt: '2026-10-15T10:00:00Z',
    screen: { id: 's1', name: 'Lobby', timezone: 'Asia/Jerusalem', orientation: 'landscape' },
    media: [
      { id: 'm1', mime: 'image/png', sizeBytes: 1024, sha256: sha, width: 1920, height: 1080 },
    ],
    widgets: [{ id: 'w1', type: 'clock', config: { format: '24h' } }],
    playlists: [
      {
        id: 'p1',
        items: [
          { kind: 'media', ref: 'm1', durationMs: 10000, transition: 'fade' },
          { kind: 'widget', ref: 'w1', durationMs: 5000, transition: 'none' },
        ],
      },
    ],
    layouts: [
      {
        id: 'l1',
        width: 1920,
        height: 1080,
        zones: [{ id: 'z1', x: 0, y: 0, w: 1920, h: 1080, z: 0, playlistId: 'p1' }],
      },
    ],
    schedule: {
      defaultLayoutId: 'l1',
      entries: [
        {
          id: 'e1',
          layoutId: 'l1',
          priority: 10,
          daysOfWeek: [0, 1, 2, 3, 4],
          timeFrom: '08:00',
          timeTo: '12:00',
        },
      ],
    },
  };
}

function messages(input: unknown): string[] {
  const result = parseManifest(input);
  return result.success ? [] : result.issues.map((i) => i.message);
}

describe('parseManifest', () => {
  it('accepts a valid manifest', () => {
    const result = parseManifest(validManifest());
    expect(result.success).toBe(true);
  });

  it('applies defaults', () => {
    const input = validManifest() as unknown as { playlists: { items: object[] }[] };
    input.playlists[0]!.items[0] = { kind: 'media', ref: 'm1', durationMs: 1000 };
    const result = parseManifest(input);
    expect(result.success && result.manifest.playlists[0]!.items[0]!.transition).toBe('none');
  });

  it('rejects unknown schema versions and garbage input without throwing', () => {
    expect(parseManifest({ ...validManifest(), schemaVersion: 2 }).success).toBe(false);
    expect(parseManifest(null).success).toBe(false);
    expect(parseManifest('{}').success).toBe(false);
  });

  it('rejects dangling references', () => {
    const m = validManifest();
    m.playlists[0]!.items.push({
      kind: 'media',
      ref: 'missing',
      durationMs: 1000,
      transition: 'none',
    });
    m.layouts[0]!.zones[0]!.playlistId = 'nope';
    m.schedule.defaultLayoutId = 'ghost';
    const errors = messages(m);
    expect(errors).toContain('Unknown media "missing"');
    expect(errors).toContain('Unknown playlist "nope"');
    expect(errors).toContain('Unknown layout "ghost"');
  });

  it('rejects duplicate ids', () => {
    const m = validManifest();
    m.media.push({ ...m.media[0]! });
    expect(messages(m)).toContain('Duplicate id "m1"');
  });

  it('rejects zones outside the layout', () => {
    const m = validManifest();
    m.layouts[0]!.zones[0]!.w = 1921;
    expect(messages(m)).toContain('Zone exceeds layout bounds');
  });

  it('rejects disallowed MIME types', () => {
    const m = validManifest() as unknown as { media: { mime: string }[] };
    m.media[0]!.mime = 'text/html';
    expect(parseManifest(m).success).toBe(false);
  });

  it('rejects invalid schedule windows', () => {
    const m = validManifest();
    m.schedule.entries[0]!.startsAt = '2026-10-16T00:00:00Z';
    m.schedule.entries[0]!.endsAt = '2026-10-15T00:00:00Z';
    delete m.schedule.entries[0]!.timeTo;
    const errors = messages(m);
    expect(errors).toContain('startsAt must be before endsAt');
    expect(errors).toContain('timeFrom and timeTo must be provided together');
  });

  it('rejects playlist cycles', () => {
    const m = validManifest();
    m.playlists.push({
      id: 'p2',
      items: [{ kind: 'playlist', ref: 'p1', durationMs: 1000, transition: 'none' }],
    });
    m.playlists[0]!.items.push({
      kind: 'playlist',
      ref: 'p2',
      durationMs: 1000,
      transition: 'none',
    });
    expect(messages(m).some((e) => e.startsWith('Playlist cycle detected'))).toBe(true);
  });
});

describe('findPlaylistCycle', () => {
  it('returns null for acyclic graphs', () => {
    expect(
      findPlaylistCycle([
        { id: 'a', items: [{ kind: 'playlist', ref: 'b', durationMs: 1, transition: 'none' }] },
        { id: 'b', items: [] },
      ]),
    ).toBeNull();
  });

  it('detects self references', () => {
    expect(
      findPlaylistCycle([
        { id: 'a', items: [{ kind: 'playlist', ref: 'a', durationMs: 1, transition: 'none' }] },
      ]),
    ).toEqual(['a', 'a']);
  });
});
