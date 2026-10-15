import type { PlayableItem } from './sequence';

export interface Renderer {
  setOrientation(orientation: string): void;
  showMessage(message: { title: string; lines: string[]; code?: string }): void;
  /** Shows one item; resolves when it should be replaced. */
  play(item: PlayableItem, url: string, signal: AbortSignal): Promise<void>;
  clear(): void;
}

const VIDEO_START_TIMEOUT_MS = 10_000;
const FADE_MS = 600;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
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

/** DOM renderer: two stacked layers cross-fade between items. */
export class DomRenderer implements Renderer {
  readonly #stage: HTMLElement;
  #current: HTMLElement | null = null;

  constructor(private readonly root: HTMLElement) {
    this.#stage = document.createElement('div');
    this.#stage.className = 'stage';
    root.replaceChildren(this.#stage);
  }

  setOrientation(orientation: string) {
    this.#stage.dataset.orientation = orientation;
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
    this.#current = panel;
  }

  clear() {
    this.#stage.replaceChildren();
    this.#current = null;
  }

  async play(item: PlayableItem, url: string, signal: AbortSignal): Promise<void> {
    const layer = document.createElement('div');
    layer.className = `layer${item.transition === 'none' ? '' : ' fade'}`;
    const isVideo = item.media.mime.startsWith('video/');
    let done: Promise<void>;

    if (isVideo) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = 'auto';
      video.src = url;
      video.setAttribute('aria-hidden', 'true');
      layer.append(video);
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
      img.src = url;
      layer.append(img);
      await img.decode().catch(() => undefined);
      done = wait(item.durationMs, signal);
    }

    const previous = this.#current;
    this.#stage.append(layer);
    this.#current = layer;
    requestAnimationFrame(() => {
      layer.classList.add('visible');
    });
    if (previous) {
      setTimeout(
        () => {
          previous.remove();
        },
        item.transition === 'none' ? 0 : FADE_MS,
      );
    }
    await done;
    if (isVideo) layer.querySelector('video')?.pause();
  }
}
