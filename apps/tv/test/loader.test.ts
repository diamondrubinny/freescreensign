import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startLoader } from '../src/loader';
import type { ServerStore } from '../src/storage';
import { localServerStore } from '../src/storage';

// Vitest runs in the package directory.
const page = readFileSync(resolve('static/index.html'), 'utf8');

function memoryStore(initial: string | null = null): ServerStore & { value: string | null } {
  return {
    value: initial,
    read() {
      return this.value;
    },
    write(origin) {
      this.value = origin;
      return true;
    },
  };
}

/** A fake clock: timers run when the test says so. */
function timers() {
  let next = 1;
  const pending = new Map<number, () => void>();
  return {
    setTimer: (callback: () => void) => {
      const id = next++;
      pending.set(id, callback);
      return id;
    },
    clearTimer: (id: number) => {
      pending.delete(id);
    },
    tick() {
      const [id, callback] = [...pending][0] ?? [];
      if (id === undefined || !callback) return false;
      pending.delete(id);
      callback();
      return true;
    },
    get count() {
      return pending.size;
    },
  };
}

const byId = (id: string) => document.getElementById(id)!;
const form = () => byId('setup') as HTMLFormElement;
const field = () => byId('server') as HTMLInputElement;
const press = (key: string, keyCode = 0) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true }));

describe('TV loader', () => {
  beforeEach(() => {
    const parsed = new DOMParser().parseFromString(page, 'text/html').documentElement;
    document.documentElement.innerHTML = parsed.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '');
    for (const { name, value } of parsed.attributes) {
      document.documentElement.setAttribute(name, value);
    }
  });

  it('asks for the server on first start, refuses http and opens the player', () => {
    const store = memoryStore();
    const navigate = vi.fn();
    startLoader(document, { store, navigate, ...timers() });

    expect(byId('setup').hidden).toBe(false);
    expect(byId('starting').hidden).toBe(true);
    const input = field();
    expect(document.activeElement).toBe(input);

    input.value = 'http://signage.example.com';
    form().requestSubmit();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(byId('error').textContent).toContain('https');
    expect(navigate).not.toHaveBeenCalled();
    expect(store.value).toBeNull();

    input.value = 'signage.example.com';
    form().requestSubmit();
    expect(store.value).toBe('https://signage.example.com');
    expect(navigate).toHaveBeenCalledWith('https://signage.example.com/player/');
  });

  it('opens the saved server after the countdown', () => {
    const clock = timers();
    const navigate = vi.fn();
    startLoader(document, {
      store: memoryStore('https://signage.example.com'),
      navigate,
      countdownSeconds: 3,
      ...clock,
    });

    expect(byId('starting').hidden).toBe(false);
    expect(byId('starting-server').textContent).toBe('https://signage.example.com');
    expect(byId('countdown').textContent).toContain('3');
    expect(document.activeElement).toBe(byId('start-now'));
    clock.tick();
    clock.tick();
    expect(navigate).not.toHaveBeenCalled();
    clock.tick();
    expect(navigate).toHaveBeenCalledWith('https://signage.example.com/player/');
  });

  it('stops the countdown on any key, so the installer has time to choose', () => {
    const clock = timers();
    const navigate = vi.fn();
    startLoader(document, {
      store: memoryStore('https://signage.example.com'),
      navigate,
      ...clock,
    });
    press('ArrowDown');
    expect(clock.count).toBe(0);
    expect(byId('countdown').textContent).toContain('Countdown stopped');
    expect(document.activeElement).toBe(byId('change'));
    expect(navigate).not.toHaveBeenCalled();

    byId('start-now').click();
    expect(navigate).toHaveBeenCalledWith('https://signage.example.com/player/');
  });

  it('changes the server, and Back on the remote returns to the saved one', () => {
    const store = memoryStore('https://old.example.com');
    const navigate = vi.fn();
    startLoader(document, { store, navigate, ...timers() });

    byId('change').click();
    expect(byId('setup').hidden).toBe(false);
    const input = field();
    expect(input.value).toBe('https://old.example.com');
    expect(document.activeElement).toBe(input);

    press('', 10009); // Back on a Samsung remote.
    expect(byId('starting').hidden).toBe(false);
    expect(byId('countdown').textContent).toBe('');

    byId('change').click();
    input.value = 'https://new.example.com';
    form().requestSubmit();
    expect(store.value).toBe('https://new.example.com');
    expect(navigate).toHaveBeenCalledWith('https://new.example.com/player/');
  });

  it('arrow keys move between the visible controls, in reading order for right to left', () => {
    startLoader(document, {
      store: memoryStore('https://a.example.com'),
      navigate: vi.fn(),
      ...timers(),
    });
    expect(document.activeElement).toBe(byId('start-now'));
    press('ArrowLeft');
    expect(document.activeElement).toBe(byId('change'));
    press('ArrowRight');
    expect(document.activeElement).toBe(byId('start-now'));
    press('ArrowUp');
    expect(document.activeElement).toBe(byId('change'));
  });

  it('asks again when the saved address is not valid any more', () => {
    startLoader(document, {
      store: memoryStore('http://old.example.com'),
      navigate: vi.fn(),
      ...timers(),
    });
    expect(byId('setup').hidden).toBe(false);
  });

  it('works without storage', () => {
    const store = localServerStore(() => {
      throw new Error('storage is off');
    });
    expect(store.read()).toBeNull();
    expect(store.write('https://a.example.com')).toBe(false);
  });

  it('names every control and keeps the page bilingual', () => {
    startLoader(document, { store: memoryStore(), navigate: vi.fn(), ...timers() });
    const input = field();
    expect(document.querySelector(`label[for="${input.id}"]`)?.textContent).toContain('Server');
    expect(input.dir).toBe('ltr');
    expect(byId('error').getAttribute('role')).toBe('alert');
    expect(document.documentElement.lang).toBe('he');
    for (const button of document.querySelectorAll('button')) {
      expect(button.textContent.trim()).not.toBe('');
    }
  });
});
