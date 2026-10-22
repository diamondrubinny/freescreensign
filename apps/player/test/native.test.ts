// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it, vi } from 'vitest';
import { ANDROID_CAPTURE_TIMEOUT_MS, captureBytes, detectNative } from '../src/native';

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

  describe('Android channel', () => {
    function fakeChannel(answer: (message: { type: string; id: number }) => unknown) {
      const listeners: ((event: { data: unknown }) => void)[] = [];
      const sent: string[] = [];
      const channel = {
        postMessage(message: string) {
          sent.push(message);
          const reply = answer(JSON.parse(message) as { type: string; id: number });
          if (reply !== undefined) {
            queueMicrotask(() => {
              for (const l of listeners) l({ data: reply });
            });
          }
        },
        addEventListener(_type: string, listener: (event: { data: unknown }) => void) {
          listeners.push(listener);
        },
      };
      return {
        channel,
        sent,
        emit: (data: unknown) => {
          for (const l of listeners) l({ data });
        },
      };
    }
    const scope = (channel: unknown, userAgent = 'Mozilla/5.0 RubinnyAndroid/0.1.0') => ({
      RubinnyAndroid: channel,
      navigator: { userAgent },
    });

    it('builds the bridge from the channel and answers captures', async () => {
      const { channel, sent, emit } = fakeChannel(({ id }) => JSON.stringify({ id, jpeg: '/9j/' }));
      const bridge = detectNative(scope(channel));
      expect(bridge).toMatchObject({
        platform: 'android',
        version: '0.1.0',
        capabilities: ['screenshot'],
      });
      // Unrelated, malformed or unknown replies are ignored.
      emit('not json');
      emit(JSON.stringify({ id: 999, jpeg: 'x' }));
      emit({ id: 1 });
      const jpeg = await bridge!.capture!();
      expect([...captureBytes(jpeg)]).toEqual([0xff, 0xd8, 0xff]);
      expect(JSON.parse(sent[0]!)).toEqual({ type: 'capture', id: 1 });
    });

    it('rejects on an error reply and on a timeout', async () => {
      const failing = detectNative(
        scope(fakeChannel(({ id }) => JSON.stringify({ id, error: 'PixelCopy failed' })).channel),
      );
      await expect(failing!.capture!()).rejects.toThrow('PixelCopy failed');

      vi.useFakeTimers();
      try {
        const silent = detectNative(scope(fakeChannel(() => undefined).channel, 'Mozilla/5.0'));
        expect(silent?.version).toBe('unknown');
        const result = silent!.capture!();
        const assertion = expect(result).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(ANDROID_CAPTURE_TIMEOUT_MS);
        await assertion;
      } finally {
        vi.useRealTimers();
      }
    });

    it('ignores anything that is not a channel', () => {
      expect(detectNative(scope({ postMessage: 'x' }))).toBeNull();
      expect(detectNative(scope({ postMessage: () => undefined }))).toBeNull();
    });
  });
});
