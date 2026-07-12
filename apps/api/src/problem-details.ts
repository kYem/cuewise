const PROBLEM_DEFS = {
  unauthorized: { status: 401, title: 'Authentication required' },
  invalid_token: { status: 401, title: 'Invalid or expired credential' },
  rate_limited: { status: 429, title: 'Too many requests' },
  batch_too_large: { status: 422, title: 'Batch too large' },
  invalid_record: { status: 422, title: 'Batch rejected' },
  storage_quota_exceeded: { status: 422, title: 'Storage quota exceeded' },
  payload_too_large: { status: 413, title: 'Payload too large' },
  invalid_cursor: { status: 400, title: 'Invalid cursor' },
  invalid_request: { status: 400, title: 'Malformed request' },
  not_found: { status: 404, title: 'Not found' },
  internal: { status: 500, title: 'Internal error' },
} as const;

export type ProblemCode = keyof typeof PROBLEM_DEFS;

export interface ValidationIssue {
  index?: number;
  pointer?: string;
  detail: string;
}

const encoder = new TextEncoder();

export interface StringLengthBounds {
  /** UTF-8 byte length, not character count. */
  maxLength?: number;
  /** UTF-8 byte length, not character count. */
  minLength?: number;
  index?: number;
}

/** Pushes a required-non-empty-string (and optional min/max byte-length) violation onto `issues`. */
export function requireNonEmptyString(
  value: unknown,
  pointer: string,
  issues: ValidationIssue[],
  bounds: StringLengthBounds = {}
): void {
  const { maxLength, minLength, index } = bounds;
  const base = index === undefined ? { pointer } : { index, pointer };
  if (typeof value !== 'string' || value === '') {
    issues.push({ ...base, detail: 'required non-empty string' });
    return;
  }
  // Byte length, not value.length (UTF-16 code units), for both bounds — a single metric so
  // a multi-byte-heavy string can't pass a check sized for its serialized/storage cost.
  const byteLength = encoder.encode(value).length;
  if (maxLength !== undefined && byteLength > maxLength) {
    issues.push({ ...base, detail: `must not exceed ${maxLength} bytes` });
  }
  if (minLength !== undefined && byteLength < minLength) {
    issues.push({ ...base, detail: `must be at least ${minLength} bytes` });
  }
}

export interface ProblemExtras {
  detail?: string;
  retryAfter?: number;
  errors?: ValidationIssue[];
}

export function problem(code: ProblemCode, extras: ProblemExtras = {}): Response {
  const def = PROBLEM_DEFS[code];
  const headers = new Headers({ 'Content-Type': 'application/problem+json' });
  if (extras.retryAfter !== undefined) {
    headers.set('Retry-After', String(extras.retryAfter));
  }
  const body: Record<string, unknown> = {
    type: `https://cuewise.app/problems/${code.replace(/_/g, '-')}`,
    title: def.title,
    status: def.status,
    code,
  };
  if (extras.detail !== undefined) {
    body.detail = extras.detail;
  }
  if (extras.retryAfter !== undefined) {
    body.retryAfter = extras.retryAfter;
  }
  if (extras.errors !== undefined) {
    body.errors = extras.errors;
  }
  return new Response(JSON.stringify(body), { status: def.status, headers });
}
