const PROBLEM_DEFS = {
  unauthorized: { status: 401, title: 'Authentication required' },
  invalid_token: { status: 401, title: 'Invalid or expired credential' },
  rate_limited: { status: 429, title: 'Too many requests' },
  payload_too_large: { status: 422, title: 'Record too large' },
  batch_too_large: { status: 422, title: 'Batch too large' },
  invalid_record: { status: 422, title: 'Batch rejected' },
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
