import type { ManifestLayout } from '@rubinny/shared';
import { itemKey, type PlayableItem } from './sequence';
import type { WidgetRuntime } from './widgets/runtime';

export interface Renderer {
  setOrientation(orientation: string): void;
  showMessage(message: { title: string; lines: string[]; code?: string }): void;
  /** Prepares the stage for a layout. Zones that did not change keep their content. */
  mountLayout(layout: ManifestLayout): void;
  /** Shows one item in a zone; resolves when it should be replaced. `url` is set for media. */
  play(zoneId: string, item: PlayableItem, url: string | null, signal: AbortSignal): Promise<void>;
  clear(): void;
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

  constructor(
    root: HTMLElement,
    private readonly widgets: WidgetRuntime,
  ) {
    this.#stage = document.createElement('div');
    this.#stage.className = 'stage';
    root.replaceChildren(this.#stage);
    window.addEventListener('resize', () => {
      this.#resize();
    });
  }

  setOrientation(orientation: string) {
    if (this.#stage.dataset.orientation === orientation) return;
    this.#stage.dataset.orientation = orientation;
    this.#resize();
  }

  showMessage(message: { title: string; lines: string[]; code?: string }) {
    this.clear();
    const panel = document.createElement('section');
    panel.className = 'message';
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

  mountLayout(layout: ManifestLayout) {
    if (this.#message) this.clear();
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
      if (existing?.geometry === geometry) continue;
      if (existing) {
        existing.current?.lifetime.abort();
        existing.element.remove();
      }
      const element = document.createElement('div');
      element.className = 'zone';
      element.dataset.zone = spec.id;
      element.style.zIndex = String(spec.z);
      this.#canvas.append(element);
      this.#zones.set(spec.id, { element, geometry, current: null });
    }
    this.#resize();
  }

  /** Scales the canvas into the stage and positions zones in pixels. */
  #resize() {
    const layout = this.#layout;
    const canvas = this.#canvas;
    if (!layout || !canvas) return;
    const stageWidth = this.#stage.clientWidth;
    const stageHeight = this.#stage.clientHeight;
    const scale = Math.min(stageWidth / layout.width, stageHeight / layout.height) || 0;
    const width = layout.width * scale;
    const height = layout.height * scale;
    Object.assign(canvas.style, {
      width: px(width),
      height: px(height),
      left: px((stageWidth - width) / 2),
      top: px((stageHeight - height) / 2),
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
        setTimeout(finish, item.durationMs + 2000);
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
