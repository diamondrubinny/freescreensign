// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { ApiErrorCode, ApiFieldError } from '@rubinny/shared';

/** Error thrown for every non-2xx API response (or network failure). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'NETWORK' | 'APPROVAL_PENDING',
    message: string,
    readonly fields: ApiFieldError[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Not a failure: the change was checked and now waits for an admin's approval (HTTP 202).
 * Thrown so that forms keep their state and show the message instead of moving on.
 */
export class ApprovalPendingError extends ApiError {
  constructor(readonly approval: { id: string }) {
    super(202, 'APPROVAL_PENDING', 'Waiting for approval');
    this.name = 'ApprovalPendingError';
  }
}

interface ErrorBody {
  error?: { code?: ApiErrorCode; message?: string; fields?: ApiFieldError[]; requestId?: string };
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Minimal JSON client. Cookies are sent automatically (same-origin); the session
 * cookie is HttpOnly so JavaScript never sees credentials.
 */
export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers:
        body === undefined
          ? { accept: 'application/json' }
          : { 'content-type': 'application/json', accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network error');
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (response.status === 202 && data && typeof data === 'object' && 'approval' in data) {
    throw new ApprovalPendingError((data as { approval: { id: string } }).approval);
  }
  if (!response.ok) {
    const error = (data as ErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? response.statusText,
      error?.fields ?? [],
      error?.requestId,
    );
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body: unknown = {}) => api<T>('POST', path, body);
export const patch = <T>(path: string, body: unknown) => api<T>('PATCH', path, body);
export const put = <T>(path: string, body: unknown) => api<T>('PUT', path, body);
export const del = <T = void>(path: string, body?: unknown) => api<T>('DELETE', path, body);
