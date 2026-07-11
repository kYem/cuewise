import type { ProblemBody } from './types';

export interface ApiErrorOptions {
  detail?: string;
  retryAfter?: number;
  errors?: ProblemBody['errors'];
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfter?: number;
  readonly errors?: ProblemBody['errors'];

  constructor(code: string, status: number, options: ApiErrorOptions = {}) {
    super(options.detail ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryable = status === 429 || status >= 500;
    this.retryAfter = options.retryAfter;
    this.errors = options.errors;
  }

  /** Tolerates non-problem+json bodies (e.g. an upstream 502 HTML page) by falling back to 'internal'. */
  static async fromResponse(res: Response): Promise<ApiError> {
    let body: Partial<ProblemBody> = {};
    try {
      body = (await res.json()) as Partial<ProblemBody>;
    } catch {
      body = {};
    }
    const code = typeof body.code === 'string' ? body.code : 'internal';
    return new ApiError(code, res.status, {
      detail: body.detail,
      retryAfter: body.retryAfter,
      errors: body.errors,
    });
  }
}
