import { afterEach, describe, expect, it, vi } from 'vitest';

describe('built-ins for older engines', () => {
  const original = Object.getOwnPropertyDescriptor(Object, 'fromEntries');

  afterEach(() => {
    if (original) Object.defineProperty(Object, 'fromEntries', original);
    vi.resetModules();
  });

  it('adds Object.fromEntries where it is missing', async () => {
    Reflect.deleteProperty(Object, 'fromEntries');
    expect(typeof Object.fromEntries).toBe('undefined');
    await import('../src/legacy');
    expect(
      Object.fromEntries([
        ['a', 1],
        ['b', 2],
      ]),
    ).toEqual({ a: 1, b: 2 });
    expect(Object.fromEntries(new Map([['c', 3]]))).toEqual({ c: 3 });
  });

  it('keeps the native one', async () => {
    const native = Object.fromEntries;
    await import('../src/legacy');
    expect(Object.fromEntries).toBe(native);
  });
});
