import { ApiError } from './api-error';
import type { PushRecord, SyncRecord } from './types';

const MAX_RETRIES = 3;

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface ExchangeTokenRequest {
  provider: 'google' | 'apple' | 'dev';
  credential: string;
  deviceName: string;
  // Required by the server when provider === 'apple' (PKCE); no client-side PKCE logic here.
  codeVerifier?: string;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ApiClient {
  private readonly opts: ApiClientOptions;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: ApiClientOptions) {
    this.opts = opts;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  // The server burns Apple's one-time PKCE code before building the response, so retrying
  // after a lost response or a post-burn 5xx would present an already-spent code and 401 forever.
  async exchangeToken(req: ExchangeTokenRequest): Promise<{ token: string }> {
    const res = await this.request(
      '/v1/auth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      },
      { auth: false, retry: false }
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
        // Offline/DNS failures reject before a Response exists; fold them into the
        // same retry/backoff path below as a retryable server error.
        lastError = new ApiError('network_error', 0, {
          detail: cause instanceof Error ? cause.message : undefined,
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
