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
  invalid_key_envelope: { status: 400, title: 'Invalid key envelope' },
  key_envelope_exists: { status: 409, title: 'Key envelope already exists' },
  resync_required: { status: 409, title: 'Resync required' },
  not_found: { status: 404, title: 'Not found' },
  pairing_not_found: { status: 404, title: 'No such pairing request.' },
  pairing_conflict: { status: 409, title: 'The pairing request was already answered.' },
  provider_not_connected: { status: 404, title: 'No connection for that provider.' },
  // Never 401: clients read any 401 as a dead session and sign out; the session here is fine.
  provider_reauth_required: { status: 409, title: 'The provider connection is no longer valid.' },
  provider_claim_invalid: {
    status: 400,
    title: 'That connect link has expired or was already used; connect again.',
  },
  provider_schema_unusable: {
    status: 422,
    title: 'That table has no status with a Complete group, and no Done checkbox.',
  },
  // Notion refused the page write for this token: permission, or a workspace block limit.
  provider_write_forbidden: { status: 403, title: 'Notion refused the write for that table.' },
  // The table is usable for reading and completing; only "not done" has nowhere to go.
  provider_todo_group_missing: {
    status: 422,
    title: "That table's status has no To-do group, so a task cannot be marked not done.",
  },
  // Connected, but the picker step has not happened. Distinct from not_connected so the client
  // shows the table picker rather than the connect button.
  provider_table_unselected: { status: 409, title: 'No table has been chosen yet.' },
  // The chosen table was deleted, un-shared, or the token lost permission on it. Terminal for
  // that selection — retrying will not clear it, so the client sends the user back to the picker.
  provider_table_unavailable: { status: 404, title: 'The connected table is no longer reachable.' },
  internal: { status: 500, title: 'Internal error' },
  // Distinct from `internal` so a client can tell "provider is down, retry later" from
  // "we're broken".
  upstream_unavailable: { status: 503, title: 'Upstream service unavailable' },
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
