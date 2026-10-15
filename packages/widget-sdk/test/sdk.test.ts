import { describe, expect, it, vi } from 'vitest';
import { defineWidget, el, every, textDirection } from '../src/index.js';

describe('widget-sdk', () => {
  it('validates widget types', () => {
    expect(() =>
      defineWidget({
        type: 'Bad Type',
        parseConfig: (c: unknown) => c,
        render: () => ({ destroy() {} }),
      }),
    ).toThrow();
    expect(
      defineWidget({
        type: 'count-down',
        parseConfig: (c: unknown) => c,
        render: () => ({ destroy() {} }),
      }).type,
    ).toBe('count-down');
  });

  it('el() sets text, never HTML', () => {
    const node = el('p', { text: '<img src=x onerror=alert(1)>', dir: 'auto' });
    expect(node.innerHTML).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(node.querySelector('img')).toBeNull();
  });

  it('every() stops when the signal aborts', () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const task = vi.fn();
    every(1000, controller.signal, task);
    vi.advanceTimersByTime(3000);
    controller.abort();
    vi.advanceTimersByTime(3000);
    expect(task).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('detects text direction from the first strong character', () => {
    expect(textDirection('שלום world')).toBe('rtl');
    expect(textDirection('123 Hello שלום')).toBe('ltr');
    expect(textDirection('مرحبا')).toBe('rtl');
    expect(textDirection('2026')).toBe('ltr');
  });
});
