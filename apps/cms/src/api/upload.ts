import { ApiError } from './client';
import type { ApiErrorCode, ApiFieldError } from '@rubinny/shared';

/**
 * Uploads one file as multipart/form-data. Uses XMLHttpRequest because fetch()
 * cannot report upload progress. Cookies are sent (same-origin); the browser adds
 * the Origin header used by the server's CSRF check.
 */
export function uploadFile<T>(
  url: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as T);
        return;
      }
      const body = xhr.response as {
        error?: {
          code?: ApiErrorCode;
          message?: string;
          fields?: ApiFieldError[];
          requestId?: string;
        };
      } | null;
      reject(
        new ApiError(
          xhr.status,
          body?.error?.code ?? (xhr.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR'),
          body?.error?.message ?? 'Upload failed',
          body?.error?.fields ?? [],
          body?.error?.requestId,
        ),
      );
    };
    xhr.onerror = () => {
      reject(new ApiError(0, 'NETWORK', 'Network error'));
    };
    signal?.addEventListener('abort', () => {
      xhr.abort();
    });
    const form = new FormData();
    form.append('file', file, file.name);
    xhr.send(form);
  });
}
