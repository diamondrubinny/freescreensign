import type { ApiErrorCode } from '@rubinny/shared';

/** An error that is safe to show to API clients. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
