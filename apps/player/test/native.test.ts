import { describe, expect, it, vi } from 'vitest';
import { captureBytes, detectNative } from '../src/native';

describe('native bridge', () => {
  it('accepts only well-formed wrapper bridges', () => {
    expect(detectNative({})).toBeNull();
    expect(detectNative({ RubinnyNative: 'nope' })).toBeNull();
    expect(detectNative({ RubinnyNative: { platform: 'web' } })).toBeNull();
    expect(detectNative({ RubinnyNative: { platform: 'tizen' } })).toBeNull();

    const capture = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const bridge = detectNative({
      RubinnyNative: {
        platform: 'electron',
        version: '1.2.3',
        capabilities: ['screenshot', 'format-disk'],
        capture,
      },
    });
    expect(bridge).toMatchObject({
      platform: 'electron',
      version: '1.2.3',
      capabilities: ['screenshot'],
    });
    // Claiming "screenshot" without a capture function does not count.
    expect(
      detectNative({ RubinnyNative: { platform: 'android', capabilities: ['screenshot'] } }),
    ).toMatchObject({ platform: 'android', version: 'unknown', capabilities: [] });
  });

  it('turns base64 (Android) and buffers (Electron) into bytes', () => {
    expect([...captureBytes('data:image/jpeg;base64,/9j/')]).toEqual([0xff, 0xd8, 0xff]);
    expect([...captureBytes('/9j/')]).toEqual([0xff, 0xd8, 0xff]);
    expect([...captureBytes(new Uint8Array([1, 2]).buffer)]).toEqual([1, 2]);
  });
});
