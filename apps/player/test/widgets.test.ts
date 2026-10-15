import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ManifestLayout, ManifestWidget } from '@rubinny/shared';
import { defineWidget } from '@rubinny/widget-sdk';
import { DomRenderer } from '../src/renderer';
import type { PlayableItem } from '../src/sequence';
import { WidgetDataClient } from '../src/widget-data';
import { BUILT_IN_WIDGETS } from '../src/widgets';
import { WidgetRuntime } from '../src/widgets/runtime';
import { weatherCondition } from '../src/widgets/weather';

const NOW = new Date('2026-10-13T09:05:07Z'); // 2 Cheshvan 5787, 12:05:07 in Jerusalem

function runtime(
  options: { fetchData?: (id: string) => Promise<unknown>; reducedMotion?: boolean } = {},
  registry = BUILT_IN_WIDGETS,
) {
  return new WidgetRuntime({
    registry,
    fetchData: options.fetchData ?? (() => Promise.reject(new Error('offline'))),
    timezone: () => 'Asia/Jerusalem',
    now: () => NOW,
    reducedMotion: () => options.reducedMotion ?? false,
  });
}

function mount(widget: ManifestWidget, rt = runtime()) {
  const container = document.createElement('div');
  document.body.append(container);
  const controller = new AbortController();
  const ok = rt.mount(widget, container, controller.signal);
  return { container, controller, ok };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('built-in widgets', () => {
  it('clock: time in the screen time zone, Gregorian and Hebrew dates', () => {
    const { container, controller, ok } = mount({
      id: 'c',
      type: 'clock',
      config: { showSeconds: true, locale: 'he' },
    });
    expect(ok).toBe(true);
    expect(container.querySelector('.w-clock-time')?.textContent).toBe('12:05:07');
    expect(container.querySelector('.w-clock-hebrew')?.textContent).toBe('ב׳ בחשוון תשפ״ז');
    expect(container.querySelector('.w-clock-date')?.textContent).toContain('2026');
    controller.abort();
    expect(container.childElementCount).toBe(0);
  });

  it('clock: 12-hour English in an explicit time zone', () => {
    const { container } = mount({
      id: 'c',
      type: 'clock',
      config: { format: '12h', locale: 'en', timezone: 'America/New_York', showHebrewDate: false },
    });
    expect(container.querySelector('.w-clock-time')?.textContent).toMatch(/^05:05\sAM$/);
    expect(container.querySelector('.w-clock-hebrew')).toBeNull();
  });

  it('ticker: direction follows the text, static with reduced motion', () => {
    const he = mount({ id: 't', type: 'ticker', config: { text: 'ברוכים הבאים ל-Rubinny' } });
    expect(he.container.querySelector('.w-ticker')?.getAttribute('dir')).toBe('rtl');
    const en = mount({ id: 't', type: 'ticker', config: { text: 'Welcome' } });
    expect(en.container.querySelector('.w-ticker')?.getAttribute('dir')).toBe('ltr');
    const still = mount(
      { id: 't', type: 'ticker', config: { text: 'Welcome' } },
      runtime({ reducedMotion: true }),
    );
    expect(still.container.querySelector('.w-ticker-static')).not.toBeNull();
  });

  it('text: renders as text, never as HTML', () => {
    const { container } = mount({
      id: 'x',
      type: 'text',
      config: { text: '<img src=x onerror=alert(1)>', align: 'start' },
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.w-text-body')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });

  it('qr: generated locally as an SVG data URL', async () => {
    const { container } = mount({
      id: 'q',
      type: 'qr',
      config: { url: 'https://example.org/menu', label: 'תפריט' },
    });
    await vi.waitUntil(() => container.querySelector('img')?.getAttribute('src'));
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(img.alt).toBe('תפריט');
    expect(container.querySelector('figcaption')?.textContent).toBe('תפריט');
  });

  it('rss: rotates server-provided headlines', async () => {
    vi.useFakeTimers();
    const fetchData = vi.fn().mockResolvedValue({
      title: 'חדשות',
      items: [
        { title: 'כותרת ראשונה', published: null },
        { title: 'Second', published: null },
      ],
    });
    const { container } = mount(
      { id: 'r', type: 'rss', config: { url: 'https://example.org/feed', itemDurationMs: 3000 } },
      runtime({ fetchData }),
    );
    await vi.advanceTimersByTimeAsync(0);
    const title = () => container.querySelector('.w-rss-title');
    expect(title()?.textContent).toBe('כותרת ראשונה');
    expect(title()?.getAttribute('dir')).toBe('rtl');
    expect(container.querySelector('.w-rss-source')?.textContent).toBe('חדשות');
    await vi.advanceTimersByTimeAsync(3000);
    expect(title()?.textContent).toBe('Second');
    expect(fetchData).toHaveBeenCalledWith('r');
  });

  it('weather: current conditions, forecast and attribution', async () => {
    const fetchData = vi.fn().mockResolvedValue({
      units: 'metric',
      current: { temperature: 24, weatherCode: 0 },
      daily: [{ date: '2026-10-13', min: 18, max: 27, weatherCode: 61 }],
      attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
    });
    const { container } = mount(
      {
        id: 'w',
        type: 'weather',
        config: { latitude: 32, longitude: 34.8, locationName: 'תל אביב' },
      },
      runtime({ fetchData }),
    );
    await flush();
    expect(container.querySelector('.w-weather-temp')?.textContent).toBe('24°C');
    expect(container.querySelector('.w-weather-desc')?.textContent).toBe('בהיר');
    expect(container.querySelectorAll('.w-weather-days li')).toHaveLength(1);
    expect(container.querySelector('.w-weather-credit')?.textContent).toContain('Open-Meteo');
    expect(weatherCondition(95).en).toBe('Thunderstorm');
  });

  it('webpage: sandboxed frame; the player origin is refused', () => {
    const { container } = mount({
      id: 'p',
      type: 'webpage',
      config: { url: 'https://example.org/board' },
    });
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(frame.referrerPolicy).toBe('no-referrer');
    expect(frame.src).toBe('https://example.org/board');

    vi.stubGlobal('location', new URL('https://signage.example.com/player/'));
    try {
      const own = mount({
        id: 'p',
        type: 'webpage',
        config: { url: 'https://signage.example.com/api/v1/me' },
      });
      expect(own.container.querySelector('iframe')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('countdown: days to seconds in the screen time zone, then the done text', async () => {
    vi.useFakeTimers();
    let now = new Date('2026-12-14T15:58:58Z'); // 17:58:58 in Jerusalem
    const rt = new WidgetRuntime({
      registry: BUILT_IN_WIDGETS,
      fetchData: () => Promise.reject(new Error('none')),
      timezone: () => 'Asia/Jerusalem',
      now: () => now,
      reducedMotion: () => false,
    });
    const { container } = mount(
      {
        id: 'c',
        type: 'countdown',
        config: { title: 'נר ראשון', target: '2026-12-15T18:00', doneText: 'חג שמח!' },
      },
      rt,
    );
    const values = () =>
      [...container.querySelectorAll('.w-countdown-value')].map((n) => n.textContent);
    expect(values()).toEqual(['1', '00', '01', '02']);
    expect(container.querySelectorAll('.w-countdown-label')[0]?.textContent).toBe('ימים');
    now = new Date('2026-12-15T16:00:01Z');
    await vi.advanceTimersByTimeAsync(1000);
    expect(container.querySelector('.w-countdown-done')?.textContent).toBe('חג שמח!');
    expect(container.querySelector('.w-countdown-units')).toBeNull();
  });

  it('ticker label and text title are rendered as text', () => {
    const ticker = mount({ id: 't', type: 'ticker', config: { text: 'שלום', label: 'עדכונים' } });
    expect(ticker.container.querySelector('.w-ticker-label')?.textContent).toBe('עדכונים');
    expect(ticker.container.querySelector('.w-ticker-viewport .w-ticker-text')).not.toBeNull();
    const text = mount({ id: 'x', type: 'text', config: { title: 'הודעה', text: 'גוף' } });
    expect(text.container.querySelector('h2.w-text-title')?.textContent).toBe('הודעה');
  });

  it('rejects invalid configuration and unknown types without throwing', () => {
    expect(mount({ id: 'x', type: 'qr', config: { url: 'javascript:alert(1)' } }).ok).toBe(false);
    expect(mount({ id: 'x', type: 'nope', config: {} }).ok).toBe(false);
  });

  it('isolates crashing community widgets', () => {
    const broken = defineWidget<null>({
      type: 'broken',
      parseConfig: () => null,
      render() {
        throw new Error('boom');
      },
    });
    const rt = runtime({}, new Map([['broken', broken as never]]));
    expect(mount({ id: 'b', type: 'broken', config: {} }, rt).ok).toBe(false);
  });
});

describe('WidgetDataClient', () => {
  it('keeps the last good data for offline playback', async () => {
    const saved = new Map<string, unknown>();
    const store = {
      widgetData: (id: string) => saved.get(id) ?? null,
      setWidgetData: (id: string, data: unknown) => saved.set(id, data),
    };
    const widgetData = vi
      .fn()
      .mockResolvedValueOnce({ title: 'fresh' })
      .mockRejectedValue(new TypeError('Failed to fetch'));
    const client = new WidgetDataClient({ widgetData }, () => 'token', store);
    expect(await client.get('w1')).toEqual({ title: 'fresh' });
    expect(await client.get('w1')).toEqual({ title: 'fresh' });
    await expect(client.get('w2')).rejects.toThrow('Failed to fetch');
  });
});

describe('DomRenderer', () => {
  const layout: ManifestLayout = {
    id: 'l',
    width: 1920,
    height: 1080,
    background: '#102030',
    zones: [
      { id: 'main', x: 0, y: 0, w: 1920, h: 960, z: 0, playlistId: 'p' },
      { id: 'ticker', x: 0, y: 960, w: 1920, h: 120, z: 1, playlistId: 'p' },
    ],
  };

  function renderer() {
    const root = document.createElement('div');
    document.body.append(root);
    const r = new DomRenderer(root, runtime());
    const stage = root.querySelector<HTMLElement>('.stage')!;
    // jsdom has no layout: give the stage a 4:3 size to test letterboxing.
    Object.defineProperty(stage, 'clientWidth', { value: 1000 });
    Object.defineProperty(stage, 'clientHeight', { value: 750 });
    return { r, root };
  }

  it('letterboxes the canvas and positions zones', () => {
    const { r, root } = renderer();
    r.mountLayout(layout);
    const canvas = root.querySelector<HTMLElement>('.canvas')!;
    // 1920x1080 into 1000x750 → scale 0.5208…, height 562.5, centered vertically.
    expect(canvas.style.width).toBe('1000px');
    expect(canvas.style.height).toBe('562.5px');
    expect(canvas.style.top).toBe('93.75px');
    const ticker = root.querySelector<HTMLElement>('[data-zone="ticker"]')!;
    expect(ticker.style.top).toBe('500px');
    expect(ticker.style.height).toBe('62.5px');
    expect(ticker.style.getPropertyValue('--zone-h')).toBe('62.5px');
    expect(ticker.style.zIndex).toBe('1');
  });

  it('keeps an unchanged widget on screen instead of re-rendering it', async () => {
    const { r, root } = renderer();
    r.mountLayout(layout);
    const item: PlayableItem = {
      kind: 'widget',
      widget: { id: 'c', type: 'clock', config: {} },
      durationMs: 5,
      transition: 'none',
    };
    const signal = new AbortController().signal;
    await r.play('ticker', item, null, signal);
    const first = root.querySelector('[data-zone="ticker"] .layer');
    await r.play('ticker', item, null, signal);
    expect(root.querySelector('[data-zone="ticker"] .layer')).toBe(first);
    // A changed configuration is new content.
    await r.play(
      'ticker',
      { ...item, widget: { ...item.widget, config: { format: '12h' } } },
      null,
      signal,
    );
    expect(root.querySelector('[data-zone="ticker"] .layer:last-child')).not.toBe(first);
  });

  it('fits media: cover, and blur with a backdrop copy', async () => {
    const { r, root } = renderer();
    r.mountLayout(layout);
    const media = { id: 'm', mime: 'image/png' as const, sizeBytes: 1, sha256: 'a'.repeat(64) };
    const signal = new AbortController().signal;
    await r.play(
      'main',
      { kind: 'media', media, durationMs: 1, transition: 'none', fit: 'blur' },
      'blob:x',
      signal,
    );
    const layer = root.querySelector<HTMLElement>('[data-zone="main"] .layer')!;
    expect(layer.dataset.fit).toBe('blur');
    expect(layer.querySelectorAll('img')).toHaveLength(2);
    expect(layer.querySelector('img.backdrop')).not.toBeNull();
    await r.play(
      'main',
      { kind: 'media', media, durationMs: 1, transition: 'none', fit: 'cover' },
      'blob:x',
      signal,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const last = root.querySelector<HTMLElement>('[data-zone="main"] .layer:last-child')!;
    expect(last.dataset.fit).toBe('cover');
    expect(last.querySelector('img.backdrop')).toBeNull();
  });

  it('keeps unchanged zones when remounting the same layout', () => {
    const { r, root } = renderer();
    r.mountLayout(layout);
    const main = root.querySelector('[data-zone="main"]');
    r.mountLayout({ ...layout, background: '#000000' });
    expect(root.querySelector('[data-zone="main"]')).toBe(main);
    r.mountLayout({ ...layout, zones: [{ ...layout.zones[0]!, h: 1080 }] });
    expect(root.querySelector('[data-zone="main"]')).not.toBe(main);
    expect(root.querySelector('[data-zone="ticker"]')).toBeNull();
  });
});
