import type { ApiErrorCode, ApiFieldError } from '@rubinny/shared';

/** An error that is safe to show to API clients. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: ApiFieldError[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
