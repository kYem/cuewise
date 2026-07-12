import { logger } from '@cuewise/shared';
import type { ProblemBody } from './types';

export interface ApiErrorOptions {
  detail?: string;
  retryAfter?: number;
  errors?: ProblemBody['errors'];
  cause?: unknown;
}

/** Reads a positive numeric (seconds) Retry-After header; ignores the HTTP-date form and non-positive values. */
function retryAfterFromHeader(res: Response): number | undefined {
  const header = res.headers.get('Retry-After');
  if (header === null) {
    return undefined;
  }
  const seconds = Number(header);
  // Non-positive (empty → 0, negative) would collapse backoff into a tight retry loop.
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return seconds;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfter?: number;
  readonly errors?: ProblemBody['errors'];

  constructor(code: string, status: number, options: ApiErrorOptions = {}) {
    super(options.detail ?? code, { cause: options.cause });
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryable = status === 0 || status === 429 || status >= 500;
    this.retryAfter = options.retryAfter;
    this.errors = options.errors;
  }

  /** Tolerates non-problem+json bodies (e.g. an upstream 502 HTML page) by falling back to 'internal'. */
  static async fromResponse(res: Response): Promise<ApiError> {
    let body: Partial<ProblemBody> = {};
    try {
      const parsed = await res.json();
      // Guard against valid-but-non-object JSON (null, array, primitive): reading `.code` off
      // `null` throws here and the caller would mis-report it as a retryable network_error.
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        body = parsed as Partial<ProblemBody>;
      } else {
        logger.warn(`ApiError.fromResponse: non-object problem body (status ${res.status})`);
      }
    } catch {
      logger.warn(`ApiError.fromResponse: failed to parse problem body (status ${res.status})`);
    }
    const code = typeof body.code === 'string' ? body.code : 'internal';
    // Prefer the body's retryAfter; fall back to the Retry-After header, which an edge 429/503
    // (non-problem+json body) may carry on its own.
    const retryAfter =
      typeof body.retryAfter === 'number' ? body.retryAfter : retryAfterFromHeader(res);
    return new ApiError(code, res.status, {
      detail: body.detail,
      retryAfter,
      errors: body.errors,
    });
  }
}
