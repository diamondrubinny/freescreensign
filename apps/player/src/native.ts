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
  const candidate = (scope as { RubinnyNative?: unknown }).RubinnyNative;
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
