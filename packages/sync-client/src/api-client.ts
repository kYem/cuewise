import { ApiError } from './api-error';
import type { ExchangeTokenRequest, KeyEnvelopeRecord, PushRecord, SyncRecord } from './types';

const MAX_RETRIES = 3;

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export type { ExchangeTokenRequest };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ApiClient {
  private readonly opts: ApiClientOptions;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: ApiClientOptions) {
    this.opts = opts;
    // Bind to the global scope: calling the bare `fetch` reference as `this.fetchFn(...)` sets its
    // receiver to this ApiClient, which a WorkerGlobalScope (the extension service worker) rejects
    // with "Illegal invocation". A caller-supplied fetchFn is used as-is.
    this.fetchFn = opts.fetchFn ?? fetch.bind(globalThis);
    this.sleep = opts.sleep ?? defaultSleep;
  }

  // Only Apple's credential is a one-time server-burned code; retrying after a lost response
  // or a post-burn 5xx would replay it. Google/dev exchanges are idempotent and keep retrying.
  async exchangeToken(req: ExchangeTokenRequest): Promise<{ token: string }> {
    const res = await this.request(
      '/v1/auth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      },
      { auth: false, retry: req.provider !== 'apple' }
    );
    return this.parseSuccessBody<{ token: string }>(res);
  }

  async getChanges(since: number): Promise<{ records: SyncRecord[]; cursor: number }> {
    const res = await this.request(`/v1/changes?since=${since}`, { method: 'GET' }, { auth: true });
    return this.parseSuccessBody<{ records: SyncRecord[]; cursor: number }>(res);
  }

  async pushChanges(records: PushRecord[]): Promise<{ cursor: number }> {
    const res = await this.request(
      '/v1/changes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      },
      { auth: true }
    );
    return this.parseSuccessBody<{ cursor: number }>(res);
  }

  async logout(): Promise<void> {
    await this.request('/v1/auth/logout', { method: 'POST' }, { auth: true });
  }

  async exportData(): Promise<{ records: SyncRecord[] }> {
    const res = await this.request('/v1/export', { method: 'GET' }, { auth: true });
    return this.parseSuccessBody<{ records: SyncRecord[] }>(res);
  }

  async deleteAccount(): Promise<void> {
    await this.request('/v1/account', { method: 'DELETE' }, { auth: true });
  }

  // 404 means "signed in but keys never initialized" — a valid state, not an error; every
  // other non-2xx still surfaces as the normal typed ApiError.
  async getRecoveryEnvelope(): Promise<KeyEnvelopeRecord | null> {
    try {
      const res = await this.request('/v1/keys/recovery', { method: 'GET' }, { auth: true });
      return await this.parseSuccessBody<KeyEnvelopeRecord>(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  // ifAbsent maps to a create-only PUT (server 409s `key_envelope_exists` if a blob exists) —
  // closes the "two devices both generate a key" race on first enable.
  async putRecoveryEnvelope(envelope: string, opts?: { ifAbsent?: boolean }): Promise<void> {
    const body: { envelope: string; ifAbsent?: boolean } = { envelope };
    if (opts?.ifAbsent === true) {
      body.ifAbsent = true;
    }
    await this.request(
      '/v1/keys/recovery',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      { auth: true }
    );
  }

  private async request(
    path: string,
    init: RequestInit,
    opts: { auth: boolean; retry?: boolean }
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (opts.auth) {
      const token = await this.opts.getToken();
      if (token !== null) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }
    let lastError: ApiError | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const res = await this.fetchFn(`${this.opts.baseUrl}${path}`, { ...init, headers });
        if (res.ok) {
          return res;
        }
        lastError = await ApiError.fromResponse(res);
      } catch (cause) {
        // Offline/DNS rejects have no Response; fold into the retryable path, keeping the original
        // error as `cause` so a programming bug (e.g. a bad-URL TypeError) stays debuggable.
        lastError = new ApiError('network_error', 0, {
          detail: cause instanceof Error ? cause.message : undefined,
          cause,
        });
      }
      if (opts.retry === false || !lastError.retryable || attempt === MAX_RETRIES) {
        throw lastError;
      }
      const delayMs =
        lastError.retryAfter !== undefined ? lastError.retryAfter * 1000 : 2 ** attempt * 500;
      await this.sleep(delayMs);
    }
    throw lastError ?? new ApiError('internal', 0);
  }

  /** Centralizes success-body JSON parsing so a malformed 2xx body fails predictably. */
  private async parseSuccessBody<T>(res: Response): Promise<T> {
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError('invalid_response', res.status);
    }
  }
}
