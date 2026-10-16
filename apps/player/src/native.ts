import {
  PLAYER_CAPABILITIES,
  PLAYER_PLATFORMS,
  type PlayerCapability,
  type RubinnyNativeBridge,
} from '@rubinny/shared';

/**
 * The native wrapper bridge (`window.RubinnyNative`), if the player runs inside one of
 * the Rubinny wrappers (Electron, Android). Anything malformed is ignored.
 */
export function detectNative(scope: unknown = globalThis): RubinnyNativeBridge | null {
  const candidate = (scope as { RubinnyNative?: unknown }).RubinnyNative ?? androidBridge(scope);
  if (!candidate || typeof candidate !== 'object') return null;
  const bridge = candidate as Record<string, unknown>;
  const platform = PLAYER_PLATFORMS.find((p) => p !== 'web' && p === bridge.platform);
  if (platform === undefined || platform === 'web') return null;
  const listed: unknown[] = Array.isArray(bridge.capabilities) ? bridge.capabilities : [];
  const declared = PLAYER_CAPABILITIES.filter((c) => listed.includes(c));
  const capture =
    typeof bridge.capture === 'function'
      ? (bridge.capture as () => Promise<Uint8Array | ArrayBuffer | string>).bind(bridge)
      : undefined;
  // A capability without its function is not a capability (today, all of them need capture).
  const capabilities: PlayerCapability[] = capture ? declared : [];
  return {
    platform,
    version: typeof bridge.version === 'string' ? bridge.version.slice(0, 40) : 'unknown',
    capabilities,
    ...(capture ? { capture } : {}),
  };
}

/** Bytes of a capture result (Electron passes bytes, Android base64). */
export function captureBytes(result: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (typeof result === 'string') {
    const base64 = result.replace(/^data:image\/[a-z]+;base64,/, '');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return result instanceof Uint8Array ? result : new Uint8Array(result);
}

/** How long the Android app may take to answer a capture. */
export const ANDROID_CAPTURE_TIMEOUT_MS = 15_000;

interface AndroidChannel {
  postMessage(message: string): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

/**
 * The Android app (apps/android) cannot define `RubinnyNative` itself without exposing it to
 * every frame. Instead it injects a message channel, `RubinnyAndroid`, that the WebView gives
 * only to pages of the configured server; this turns it into the standard bridge.
 * Protocol: page → app `{"type":"capture","id":n}`; app → page `{"id":n,"jpeg":"<base64>"}`
 * or `{"id":n,"error":"…"}`. The app version comes from the user agent ("RubinnyAndroid/x").
 */
function androidBridge(scope: unknown): RubinnyNativeBridge | null {
  const channel = (scope as { RubinnyAndroid?: unknown }).RubinnyAndroid as
    Partial<AndroidChannel> | undefined;
  if (
    !channel ||
    typeof channel.postMessage !== 'function' ||
    typeof channel.addEventListener !== 'function'
  ) {
    return null;
  }
  const android = channel as AndroidChannel;
  const userAgent = (scope as { navigator?: { userAgent?: unknown } }).navigator?.userAgent;
  const version =
    typeof userAgent === 'string'
      ? (/RubinnyAndroid\/([\w.-]{1,40})/.exec(userAgent)?.[1] ?? 'unknown')
      : 'unknown';

  const pending = new Map<
    number,
    { resolve: (jpeg: string) => void; reject: (e: Error) => void }
  >();
  let nextId = 1;
  android.addEventListener('message', (event) => {
    let reply: unknown;
    try {
      reply = typeof event.data === 'string' ? JSON.parse(event.data) : null;
    } catch {
      return;
    }
    const { id, jpeg, error } = (reply ?? {}) as { id?: unknown; jpeg?: unknown; error?: unknown };
    const waiting = typeof id === 'number' ? pending.get(id) : undefined;
    if (!waiting) return;
    pending.delete(id as number);
    if (typeof jpeg === 'string') waiting.resolve(jpeg);
    else waiting.reject(new Error(typeof error === 'string' ? error : 'Capture failed'));
  });

  return {
    platform: 'android',
    version,
    capabilities: ['screenshot'],
    capture: () =>
      new Promise<string>((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Capture timed out'));
        }, ANDROID_CAPTURE_TIMEOUT_MS);
        pending.set(id, {
          resolve: (jpeg) => {
            clearTimeout(timer);
            resolve(jpeg);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        android.postMessage(JSON.stringify({ type: 'capture', id }));
      }),
  };
}
