/**
 * Navigation and IPC guards. The kiosk window may only show the configured Rubinny
 * server (and the local setup page); everything else is refused.
 */

/** Whether `target` is on the allowed origin. */
export function isSameOrigin(target: string, origin: string): boolean {
  try {
    return new URL(target).origin === origin;
  } catch {
    return false;
  }
}

/** Whether `url` is the bundled setup page (file URL inside the app). */
export function isSetupPage(url: string, setupUrl: string): boolean {
  try {
    const actual = new URL(url);
    const expected = new URL(setupUrl);
    return (
      actual.protocol === 'file:' &&
      expected.protocol === 'file:' &&
      actual.pathname === expected.pathname
    );
  } catch {
    return false;
  }
}

/** Largest side of a captured screenshot (the server scales it again anyway). */
export const CAPTURE_MAX_SIZE = 1920;

/** Scale factor so that the larger side fits CAPTURE_MAX_SIZE (never enlarges). */
export function captureScale(width: number, height: number): number {
  const largest = Math.max(width, height);
  return largest > CAPTURE_MAX_SIZE ? CAPTURE_MAX_SIZE / largest : 1;
}
