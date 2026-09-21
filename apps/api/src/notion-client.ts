import type { Env } from './env';
import { ERROR_CODE_RE } from './http';
import {
  asRecord,
  type CompletionProperty,
  type CompletionWrite,
  isRowDone,
  type NotionPage,
  type PropertySchemas,
  type PropertyValues,
  plainText,
  rowTitle,
} from './notion-schema';

// Must stay >= 2025-09-03, the release that split a database into a container plus data
// sources; this code assumes that model.
export const NOTION_VERSION = '2026-03-11';
const NOTION_API = 'https://api.notion.com/v1';
const REQUEST_TIMEOUT_MS = 15_000;
export const PAGE_SIZE = 100;
// Bounded so a 50k-row table cannot hold a Worker invocation open; 500 rows is past any task list.
export const MAX_QUERY_PAGES = 5;

// Each sets `name` so a log line can tell them apart; `extends Error {}` alone reports "Error".
/** The user's grant is unusable — revoked, expired, or never valid. */
export class NotionAuthError extends Error {
  override readonly name = 'NotionAuthError';
}
/** Our client id, secret or request shape is wrong. Loud: no action by the user can fix it. */
export class NotionConfigError extends Error {
  override readonly name = 'NotionConfigError';
}
/** Notion is down, rate-limiting, unreadable, or the row changed under a write. Retryable, not ours. */
export class NotionUnavailableError extends Error {
  override readonly name = 'NotionUnavailableError';
  /** The HTTP status, or null when no response arrived. */
  readonly status: number | null;
  /** Seconds, from a 429's Retry-After; null when Notion named none. */
  readonly retryAfter: number | null;

  constructor(
    message: string,
    details: { status?: number | null; retryAfter?: number | null } = {}
  ) {
    super(message);
    this.status = details.status ?? null;
    this.retryAfter = details.retryAfter ?? null;
  }
}
/** The table or page is gone, un-shared, or not the user's to write. The user re-picks or moves on. */
export class NotionResourceError extends Error {
  override readonly name = 'NotionResourceError';
  readonly status: 403 | 404;

  constructor(status: 403 | 404, message: string) {
    super(message);
    this.status = status;
  }
}

export interface NotionItem {
  pageId: string;
  text: string;
  done: boolean;
}

export interface NotionRows {
  items: NotionItem[];
  // True when the read stopped before the table ended — the page bound, or a has_more Notion
  // gave no cursor for — so the client can say "and more" rather than present a partial list.
  truncated: boolean;
}

export interface NotionDataSource {
  id: string;
  name: string;
}

export interface NotionGrant {
  accessToken: string;
  // `string | null` because that is exactly how Notion's token response declares it, with no
  // expires_in. We treat null as a grant that does not expire, and a value as the way to renew one.
  refreshToken: string | null;
  workspace: string | null;
}

export interface NotionClient {
  exchangeCode(code: string): Promise<NotionGrant>;
  /** Trades a refresh token for a fresh grant; Notion issues a new refresh token with it. */
  refreshGrant(refreshToken: string): Promise<NotionGrant>;
  /** Tells Notion to forget the grant, so disconnecting is not just local. */
  revokeToken(accessToken: string): Promise<void>;
  /** The tables shared with the integration; the token response names none, so this is a second phase. */
  searchDataSources(accessToken: string): Promise<NotionDataSource[]>;
  getPropertySchemas(accessToken: string, dataSourceId: string): Promise<PropertySchemas>;
  queryRows(
    accessToken: string,
    dataSourceId: string,
    property: CompletionProperty
  ): Promise<NotionRows>;
  setCompletion(accessToken: string, pageId: string, write: CompletionWrite): Promise<void>;
}

type NotionEnv = Pick<Env, 'NOTION_CLIENT_ID' | 'NOTION_CLIENT_SECRET' | 'PUBLIC_BASE_URL'>;

/**
 * Classifies a failure by shape, never by content: no message here may carry the authorization
 * code, the access token or the client secret, since these reach the logger.
 */
function classify(status: number, body: unknown, retryAfter: number | null): Error {
  const record = asRecord(body) ?? {};
  const raw = record.error ?? record.code;
  const code =
    typeof raw === 'string' ? (ERROR_CODE_RE.test(raw) ? raw : 'unrecognised') : 'no code';
  if (code === 'invalid_client' || code === 'unauthorized_client') {
    return new NotionConfigError(`notion rejected our client (${status}, ${code})`);
  }
  if (status === 401 || code === 'invalid_grant' || code === 'unauthorized') {
    return new NotionAuthError(`notion grant is unusable (${status}, ${code})`);
  }
  // 403 restricted_resource is a capability we lack; 404 object_not_found is a table deleted or
  // un-shared. Neither clears on retry.
  if (status === 403 || status === 404) {
    return new NotionResourceError(status, `notion resource unreachable (${status}, ${code})`);
  }
  // 409 is Notion's retryable collision; validation_error is retryable by our policy, since a
  // property renamed under a write causes it. Any other 4xx is a request only we could have malformed.
  if (
    status >= 400 &&
    status < 500 &&
    status !== 429 &&
    status !== 409 &&
    code !== 'validation_error'
  ) {
    return new NotionConfigError(`notion rejected our request (${status}, ${code})`);
  }
  return new NotionUnavailableError(`notion answered ${status} (${code})`, { status, retryAfter });
}

// Clamped: an absurd upstream value would reach the client as a malformed header.
const MAX_RETRY_AFTER_SECONDS = 3600;

function retryAfterOf(response: Response): number | null {
  const seconds = Number(response.headers.get('Retry-After'));
  if (!Number.isInteger(seconds) || seconds <= 0) {
    return null;
  }
  return Math.min(seconds, MAX_RETRY_AFTER_SECONDS);
}

export function createNotionClient(env: NotionEnv, fetchImpl: typeof fetch = fetch): NotionClient {
  async function call(
    path: string,
    authorization: string,
    init: RequestInit = {}
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${NOTION_API}${path}`, {
        ...init,
        headers: {
          Authorization: authorization,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // error.name separates a timeout from a DNS fault from a TypeError we caused; none carry a secret.
      const name = error instanceof Error ? error.name : 'unknown';
      throw new NotionUnavailableError(`notion request did not complete (${name})`);
    }
    let body: unknown = null;
    let readable = true;
    try {
      body = await response.json();
    } catch {
      readable = false;
    }
    if (!response.ok) {
      throw classify(response.status, body, retryAfterOf(response));
    }
    // A 200 we cannot parse is an outage, not an empty result — reporting it as "no rows" would
    // tell the user they have nothing to do.
    if (!readable) {
      throw new NotionUnavailableError('notion answered 200 with an unreadable body');
    }
    return body;
  }

  // For endpoints that name no user resource: a 403/404 there is our integration's capabilities
  // or our URL, never a table the user un-shared, so the picker cannot fix it.
  async function callOurs(
    path: string,
    authorization: string,
    init: RequestInit
  ): Promise<unknown> {
    try {
      return await call(path, authorization, init);
    } catch (error) {
      if (error instanceof NotionResourceError) {
        throw new NotionConfigError(`notion refused our endpoint (${error.message})`);
      }
      throw error;
    }
  }

  async function isInTrash(path: string, accessToken: string): Promise<boolean> {
    let page: unknown;
    try {
      page = await call(path, `Bearer ${accessToken}`);
    } catch {
      return false;
    }
    const record = asRecord(page);
    return record !== null && (record.in_trash === true || record.archived === true);
  }

  function basicAuth(): string {
    return `Basic ${btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`)}`;
  }

  function toGrant(body: unknown): NotionGrant {
    const record = asRecord(body) ?? {};
    const accessToken = record.access_token;
    if (typeof accessToken !== 'string' || accessToken === '') {
      throw new NotionUnavailableError('notion returned no access token');
    }
    const refreshToken = record.refresh_token;
    const workspace = record.workspace_name;
    return {
      accessToken,
      refreshToken: typeof refreshToken === 'string' && refreshToken !== '' ? refreshToken : null,
      workspace: typeof workspace === 'string' ? workspace : null,
    };
  }

  return {
    async exchangeCode(code) {
      return toGrant(
        await callOurs('/oauth/token', basicAuth(), {
          method: 'POST',
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            // Required here because it was set in the authorize URL.
            redirect_uri: `${env.PUBLIC_BASE_URL}/v1/integrations/notion/callback`,
          }),
        })
      );
    },

    async refreshGrant(refreshToken) {
      return toGrant(
        await callOurs('/oauth/token', basicAuth(), {
          method: 'POST',
          body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken }),
        })
      );
    },

    async revokeToken(accessToken) {
      await callOurs('/oauth/revoke', basicAuth(), {
        method: 'POST',
        body: JSON.stringify({ token: accessToken }),
      });
    },

    async searchDataSources(accessToken) {
      const body = await callOurs('/search', `Bearer ${accessToken}`, {
        method: 'POST',
        body: JSON.stringify({
          filter: { property: 'object', value: 'data_source' },
          page_size: PAGE_SIZE,
        }),
      });
      const results = asRecord(body)?.results;
      if (!Array.isArray(results)) {
        throw new NotionUnavailableError('notion search answered without a results array');
      }
      return results.flatMap((entry) => {
        const item = asRecord(entry);
        if (item === null || typeof item.id !== 'string') {
          return [];
        }
        // Defensive: a table on its way to deletion must not be offered.
        if (item.in_trash === true) {
          return [];
        }
        const title = plainText(item.title);
        return [{ id: item.id, name: title === '' ? item.id : title }];
      });
    },

    async getPropertySchemas(accessToken, dataSourceId) {
      const body = await call(
        `/data_sources/${encodeURIComponent(dataSourceId)}`,
        `Bearer ${accessToken}`
      );
      const properties = asRecord(asRecord(body)?.properties);
      if (properties === null) {
        throw new NotionUnavailableError('notion data source carried no readable schema');
      }
      return properties as PropertySchemas;
    },

    async queryRows(accessToken, dataSourceId, property) {
      const items: NotionItem[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < MAX_QUERY_PAGES; page += 1) {
        const path = `/data_sources/${encodeURIComponent(dataSourceId)}/query`;
        const body = await call(path, `Bearer ${accessToken}`, {
          method: 'POST',
          body: JSON.stringify({
            page_size: PAGE_SIZE,
            // Without this a wiki returns its nested data sources alongside its pages, and a
            // data source carries `id` and `properties` too — so it would mirror as a task.
            result_type: 'page',
            ...(cursor === null ? {} : { start_cursor: cursor }),
          }),
        });
        const record = asRecord(body) ?? {};
        const results = record.results;
        if (!Array.isArray(results)) {
          throw new NotionUnavailableError('notion query answered without a results array');
        }
        for (const entry of results) {
          const row = asRecord(entry);
          const properties = row === null ? null : asRecord(row.properties);
          if (row === null || typeof row.id !== 'string' || properties === null) {
            continue;
          }
          const notionPage: NotionPage = { id: row.id, properties: properties as PropertyValues };
          items.push({
            pageId: notionPage.id,
            text: rowTitle(notionPage),
            done: isRowDone(notionPage, property),
          });
        }
        const hasMore = record.has_more === true;
        const next = record.next_cursor;
        if (!hasMore || typeof next !== 'string') {
          return { items, truncated: hasMore };
        }
        cursor = next;
      }
      return { items, truncated: true };
    },

    async setCompletion(accessToken, pageId, write) {
      const value =
        write.kind === 'checkbox'
          ? { [write.name]: { checkbox: write.checkbox } }
          : { [write.name]: { status: { id: write.optionId } } };
      const path = `/pages/${encodeURIComponent(pageId)}`;
      try {
        await call(path, `Bearer ${accessToken}`, {
          method: 'PATCH',
          body: JSON.stringify({ properties: value }),
        });
      } catch (error) {
        // A write to a trashed page answers 400, not 404. Looking once turns a stale list's toggle
        // into "that page is gone" rather than an outage the client retries.
        if (error instanceof NotionUnavailableError && error.status === 400) {
          if (await isInTrash(path, accessToken)) {
            throw new NotionResourceError(
              404,
              'notion page is in the trash (400, validation_error)'
            );
          }
        }
        throw error;
      }
    },
  };
}
