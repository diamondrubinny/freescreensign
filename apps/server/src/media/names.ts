/**
 * Sanitizes user-supplied file names for display and Content-Disposition:
 * strips paths, control characters and Unicode bidi overrides (which can disguise
 * extensions, e.g. "invoice\u202Egpj.exe"), and limits the length.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const BIDI_AND_CONTROL = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export function sanitizeFilename(input: string | undefined, fallback = 'file'): string {
  const base = (input ?? '').split(/[\\/]/).pop() ?? '';
  const clean = base.replace(BIDI_AND_CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, 255);
  return clean || fallback;
}

/** Display name: the sanitized file name without its extension. */
export function displayName(filename: string): string {
  const withoutExt = filename.replace(/\.[A-Za-z0-9]{1,8}$/, '').trim();
  return (withoutExt || filename).slice(0, 200);
}

/** RFC 6266 / RFC 5987 Content-Disposition value with an ASCII fallback. */
export function contentDisposition(
  filename: string,
  type: 'inline' | 'attachment' = 'inline',
): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
