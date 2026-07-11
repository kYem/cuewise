import type { ProblemBody } from '../../types';

export interface StubResponseSpec {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface FetchCall {
  url: string;
  init: RequestInit;
}

/** Queues responses in declaration order; each fetchFn call pops the next one. */
export function stubFetch(responses: StubResponseSpec[]): {
  fetchFn: typeof fetch;
  calls: FetchCall[];
} {
  const queue = [...responses];
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init: init ?? {} });
    const next = queue.shift();
    if (next === undefined) {
      throw new Error('stubFetch: no more responses queued');
    }
    const headers = new Headers(next.headers);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return new Response(next.status === 204 ? null : JSON.stringify(next.body), {
      status: next.status,
      headers,
    });
  };
  return { fetchFn, calls };
}

/** Builds a problem+json stub response matching the server's RFC 9457 shape. */
export function problemResponse(
  code: string,
  status: number,
  extras: Pick<ProblemBody, 'detail' | 'retryAfter' | 'errors'> = {}
): StubResponseSpec {
  const body: ProblemBody = {
    type: `https://cuewise.app/problems/${code.replace(/_/g, '-')}`,
    title: code,
    status,
    code,
    ...extras,
  };
  const headers: Record<string, string> = { 'Content-Type': 'application/problem+json' };
  if (extras.retryAfter !== undefined) {
    headers['Retry-After'] = String(extras.retryAfter);
  }
  return { status, body, headers };
}
