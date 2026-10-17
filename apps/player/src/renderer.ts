import type { ManifestAlert, ManifestLayout, ManifestZoneAction, Wall } from '@rubinny/shared';
import { itemKey, type PlayableItem } from './sequence';
import type { WidgetRuntime } from './widgets/runtime';

export interface Renderer {
  setOrientation(orientation: string): void;
  /** Video walls: this screen shows its part of a layout spread over the whole wall. */
  setWall(wall: Wall | null): void;
  showMessage(message: { title: string; lines: string[]; code?: string }): void;
  /** Shows an alert over everything (content keeps playing underneath), or removes it. */
  showAlert(alert: ManifestAlert | null): void;
  /**
   * Prepares the stage for a layout. Zones that did not change keep their content. Zones with
   * an action react to taps (and Enter/Space) through `touch`.
   */
  mountLayout(layout: ManifestLayout, touch?: TouchHandlers): void;
  /** Shows one item in a zone; resolves when it should be replaced. `url` is set for media. */
  play(zoneId: string, item: PlayableItem, url: string | null, signal: AbortSignal): Promise<void>;
  clear(): void;
}

/** Touch screens: a zone's action was triggered; any touch or key counts as activity. */
export interface TouchHandlers {
  onAction(action: ManifestZoneAction): void;
  onActivity(): void;
}

const VIDEO_START_TIMEOUT_MS = 10_000;

/** CSS pixels, rounded to avoid float noise like 1000.0000000000001px. */
const px = (value: number) => `${String(Math.round(value * 100) / 100)}px`;
const FADE_MS = 600;

export function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

interface Layer {
  element: HTMLElement;
  key: string;
  /** Aborted when the layer is removed (stops widgets, pauses video). */
  lifetime: AbortController;
}

interface Zone {
  element: HTMLElement;
  geometry: string;
  current: Layer | null;
  action: ManifestZoneAction | null;
}

/**
 * DOM renderer. A layout is drawn on a canvas scaled to fit the screen
 * (letterboxed, aspect ratio kept); each zone stacks layers that cross-fade.
 */
export class DomRenderer implements Renderer {
  readonly #stage: HTMLElement;
  #canvas: HTMLElement | null = null;
  #layout: ManifestLayout | null = null;
  readonly #zones = new Map<string, Zone>();
  #message: HTMLElement | null = null;
  readonly #root: HTMLElement;
  #alertLayer: HTMLElement | null = null;
  #touch: TouchHandlers | null = null;
  #wall: Wall | null = null;

  constructor(
    root: HTMLElement,
    private readonly widgets: WidgetRuntime,
  ) {
    this.#root = root;
    this.#stage = document.createElement('div');
    this.#stage.className = 'stage';
    root.replaceChildren(this.#stage);
    // Any touch or key resets the idle timer of a layout opened by a tap.
    for (const type of ['pointerdown', 'keydown'] as const) {
      root.addEventListener(type, () => this.#touch?.onActivity(), { passive: true });
    }
    window.addEventListener('resize', () => {
      this.#resize();
    });
  }

  setOrientation(orientation: string) {
    if (this.#stage.dataset.orientation === orientation) return;
    this.#stage.dataset.orientation = orientation;
    if (this.#alertLayer) this.#alertLayer.dataset.orientation = orientation;
    this.#resize();
  }

  setWall(wall: Wall | null) {
    if (JSON.stringify(wall) === JSON.stringify(this.#wall)) return;
    this.#wall = wall;
    this.#resize();
  }

  showAlert(alert: ManifestAlert | null) {
    this.#alertLayer?.remove();
    this.#alertLayer = null;
    if (!alert) return;
    const layer = document.createElement('div');
    layer.className = 'stage alert-layer';
    layer.dataset.orientation = this.#stage.dataset.orientation ?? 'landscape';
    layer.dataset.style = alert.style;
    const panel = document.createElement('section');
    panel.className = 'alert';
    panel.setAttribute('role', 'alert');
    panel.append(alertIcon(alert.style));
    const title = document.createElement('h1');
    title.textContent = alert.title;
    title.dir = 'auto';
    panel.append(title);
    if (alert.message) {
      const message = document.createElement('p');
      message.textContent = alert.message;
      message.dir = 'auto';
      panel.append(message);
    }
    layer.append(panel);
    this.#root.append(layer);
    this.#alertLayer = layer;
  }

  showMessage(message: { title: string; lines: string[]; code?: string }) {
    this.clear();
    const panel = document.createElement('section');
    panel.className = 'message';
    panel.append(brandMark());
    const title = document.createElement('h1');
    title.textContent = message.title;
    panel.append(title);
    if (message.code) {
      const code = document.createElement('p');
      code.className = 'code';
      code.dir = 'ltr';
      code.setAttribute('data-testid', 'pairing-code');
      code.textContent = message.code;
      panel.append(code);
      // Waiting for the code to be entered in the dashboard (decorative).
      const waiting = document.createElement('div');
      waiting.className = 'waiting';
      waiting.setAttribute('aria-hidden', 'true');
      waiting.append(
        document.createElement('span'),
        document.createElement('span'),
        document.createElement('span'),
      );
      panel.append(waiting);
    }
    for (const line of message.lines) {
      const p = document.createElement('p');
      p.textContent = line;
      p.dir = 'auto';
      panel.append(p);
    }
    this.#stage.append(panel);
    this.#message = panel;
  }

  clear() {
    for (const zone of this.#zones.values()) zone.current?.lifetime.abort();
    this.#zones.clear();
    this.#canvas = null;
    this.#layout = null;
    this.#message = null;
    this.#stage.replaceChildren();
  }

  mountLayout(layout: ManifestLayout, touch?: TouchHandlers) {
    if (this.#message) this.clear();
    this.#touch = touch ?? null;
    if (!this.#canvas) {
      this.#canvas = document.createElement('div');
      this.#canvas.className = 'canvas';
      this.#stage.append(this.#canvas);
    }
    this.#canvas.style.background = layout.background ?? '#000000';
    this.#layout = layout;

    const wanted = new Set(layout.zones.map((zone) => zone.id));
    for (const [id, zone] of this.#zones) {
      if (!wanted.has(id)) {
        zone.current?.lifetime.abort();
        zone.element.remove();
        this.#zones.delete(id);
      }
    }
    for (const spec of layout.zones) {
      const geometry = [spec.x, spec.y, spec.w, spec.h, spec.z, layout.width, layout.height].join();
      const existing = this.#zones.get(spec.id);
      if (existing?.geometry === geometry) {
        this.#applyAction(existing, spec);
        continue;
      }
      if (existing) {
        existing.current?.lifetime.abort();
        existing.element.remove();
      }
      const element = document.createElement('div');
      element.className = 'zone';
      element.dataset.zone = spec.id;
      element.style.zIndex = String(spec.z);
      const zone: Zone = { element, geometry, current: null, action: null };
      element.addEventListener('click', () => {
        this.#activate(zone);
      });
      element.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.#activate(zone);
      });
      this.#applyAction(zone, spec);
      this.#canvas.append(element);
      this.#zones.set(spec.id, zone);
    }
    this.#resize();
  }

  /** A zone with an action is a button: focusable, named, and activated by tap or key. */
  #applyAction(zone: Zone, spec: ManifestLayout['zones'][number]) {
    const action = spec.action ?? null;
    zone.action = action;
    const { element } = zone;
    element.classList.toggle('touch', action !== null);
    if (action) {
      element.setAttribute('role', 'button');
      element.tabIndex = 0;
      element.setAttribute('aria-label', spec.label ?? '');
    } else {
      element.removeAttribute('role');
      element.removeAttribute('tabindex');
      element.removeAttribute('aria-label');
    }
  }

  #activate(zone: Zone) {
    if (zone.action) this.#touch?.onAction(zone.action);
  }

  /** Scales the canvas into the stage and positions zones in pixels. */
  #resize() {
    const layout = this.#layout;
    const canvas = this.#canvas;
    if (!layout || !canvas) return;
    const stageWidth = this.#stage.clientWidth;
    const stageHeight = this.#stage.clientHeight;
    // A video wall is one big area of columns × rows screens with frames between them; this
    // screen is a window onto its cell. A single screen is a wall of one.
    const wall = this.#wall ?? { columns: 1, rows: 1, column: 0, row: 0, bezelX: 0, bezelY: 0 };
    const areaWidth = stageWidth * wall.columns + wall.bezelX * (wall.columns - 1);
    const areaHeight = stageHeight * wall.rows + wall.bezelY * (wall.rows - 1);
    const scale = Math.min(areaWidth / layout.width, areaHeight / layout.height) || 0;
    const width = layout.width * scale;
    const height = layout.height * scale;
    Object.assign(canvas.style, {
      width: px(width),
      height: px(height),
      left: px((areaWidth - width) / 2 - wall.column * (stageWidth + wall.bezelX)),
      top: px((areaHeight - height) / 2 - wall.row * (stageHeight + wall.bezelY)),
    });
    for (const spec of layout.zones) {
      const zone = this.#zones.get(spec.id);
      if (!zone) continue;
      const w = spec.w * scale;
      const h = spec.h * scale;
      Object.assign(zone.element.style, {
        left: px(spec.x * scale),
        top: px(spec.y * scale),
        width: px(w),
        height: px(h),
      });
      zone.element.style.setProperty('--zone-w', px(w));
      zone.element.style.setProperty('--zone-h', px(h));
    }
  }

  async play(
    zoneId: string,
    item: PlayableItem,
    url: string | null,
    signal: AbortSignal,
  ): Promise<void> {
    const zone = this.#zones.get(zoneId);
    if (!zone) {
      await wait(item.durationMs, signal);
      return;
    }
    const key = itemKey(item);
    const isVideo = item.kind === 'media' && item.media.mime.startsWith('video/');
    // Same content as on screen (e.g. a single-item zone): keep it, don't re-render.
    if (zone.current?.key === key && !isVideo) {
      await wait(item.durationMs, signal);
      return;
    }

    const lifetime = new AbortController();
    const element = document.createElement('div');
    element.className = `layer${item.transition === 'none' ? '' : ' fade'}`;
    if (item.kind === 'media')
      element.dataset.fit =
        item.media.mime.startsWith('video/') && item.fit === 'blur'
          ? 'contain'
          : (item.fit ?? 'contain');
    const layer: Layer = { element, key, lifetime };
    let done: Promise<void>;

    if (item.kind === 'widget') {
      element.classList.add('widget');
      element.dataset.widget = item.widget.type;
      this.widgets.mount(item.widget, element, lifetime.signal);
      done = wait(item.durationMs, signal);
    } else if (isVideo && url) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = 'auto';
      video.src = url;
      video.setAttribute('aria-hidden', 'true');
      const startAt = item.startAtMs;
      if (startAt !== undefined && startAt > 0) {
        // Join the wall mid-video at the same point as the other screens.
        video.addEventListener(
          'loadedmetadata',
          () => {
            if (startAt / 1000 < video.duration) video.currentTime = startAt / 1000;
          },
          { once: true },
        );
      }
      element.append(video);
      lifetime.signal.addEventListener('abort', () => {
        video.pause();
      });
      done = new Promise<void>((resolve) => {
        let started = false;
        const finish = () => {
          resolve();
        };
        video.addEventListener('playing', () => (started = true), { once: true });
        video.addEventListener('ended', finish, { once: true });
        video.addEventListener('error', finish, { once: true });
        // Watchdog: skip videos that never start; cap at the planned duration (+ slack).
        setTimeout(() => {
          if (!started) finish();
        }, VIDEO_START_TIMEOUT_MS);
        // In a wall the next item starts on the clock, so no slack.
        setTimeout(finish, item.durationMs + (startAt === undefined ? 2000 : 0));
        signal.addEventListener('abort', finish, { once: true });
      });
      void video.play().catch(() => undefined);
    } else {
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.className = 'media';
      if (url) img.src = url;
      // "blur": the whole image over a blurred, zoomed copy instead of black bars.
      if (item.fit === 'blur' && url) {
        const backdrop = document.createElement('img');
        backdrop.alt = '';
        backdrop.className = 'backdrop';
        backdrop.src = url;
        element.append(backdrop);
      }
      element.append(img);
      // decode() is missing on some older TV browsers.
      if (typeof img.decode === 'function') await img.decode().catch(() => undefined);
      done = wait(item.durationMs, signal);
    }

    // The zone may have been replaced while the image was decoding.
    if (this.#zones.get(zoneId) !== zone) {
      lifetime.abort();
      return;
    }
    const previous = zone.current;
    zone.element.append(element);
    zone.current = layer;
    requestAnimationFrame(() => {
      element.classList.add('visible');
    });
    if (previous) {
      setTimeout(
        () => {
          previous.lifetime.abort();
          previous.element.remove();
        },
        item.transition === 'none' ? 0 : FADE_MS,
      );
    }
    await done;
    if (isVideo) element.querySelector('video')?.pause();
  }
}

const SVG = 'http://www.w3.org/2000/svg';

/** The Rubinny mark (the same drawing as the dashboard's icon) and name. */
/** A warning triangle (emergency) or an information circle (notice), decorative. */
function alertIcon(style: ManifestAlert['style']): SVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'alert-icon');
  const shape = document.createElementNS(SVG, 'path');
  shape.setAttribute('d', style === 'emergency' ? 'M32 4 62 58H2Z' : 'M32 2a30 30 0 1 0 0.01 0Z');
  shape.setAttribute('fill', '#fff');
  const mark = document.createElementNS(SVG, 'path');
  mark.setAttribute(
    'd',
    style === 'emergency' ? 'M29 22h6l-1 20h-4ZM29 46h6v6h-6Z' : 'M29 14h6v6h-6ZM29 26h6v24h-6Z',
  );
  mark.setAttribute('fill', style === 'emergency' ? '#991b1b' : '#92400e');
  svg.append(shape, mark);
  return svg;
}

function brandMark(): HTMLElement {
  const brand = document.createElement('div');
  brand.className = 'brand';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  const shapes: [number, number, number, number, number, string][] = [
    [0, 0, 64, 64, 12, '#4f46e5'],
    [12, 16, 40, 26, 3, '#fff'],
    [28, 42, 8, 8, 0, '#fff'],
    [20, 48, 24, 4, 2, '#fff'],
  ];
  for (const [x, y, width, height, radius, fill] of shapes) {
    const rect = document.createElementNS(SVG, 'rect');
    for (const [name, value] of Object.entries({ x, y, width, height, rx: radius, fill })) {
      rect.setAttribute(name, String(value));
    }
    svg.append(rect);
  }
  const name = document.createElement('span');
  name.textContent = 'Rubinny';
  brand.append(svg, name);
  return brand;
}
