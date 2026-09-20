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
/** The user's grant is unusable — revoked, expired, or never valid. The route answers 401. */
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
}
/** The table or page is gone or un-shared. Not retryable; the user re-picks or moves on. */
export class NotionResourceError extends Error {
  override readonly name = 'NotionResourceError';
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
  // `string | null` because that is exactly how Notion's token response declares it. Null means
  // the access token is long-lived; a value means it can expire and this is how to renew it.
  refreshToken: string | null;
  workspace: string | null;
}

export interface NotionClient {
  exchangeCode(code: string): Promise<NotionGrant>;
  /** Trades a refresh token for a fresh grant. Notion may rotate the refresh token too. */
  refreshGrant(refreshToken: string): Promise<NotionGrant>;
  /** Best-effort: tells Notion to forget the grant, so disconnecting is not just local. */
  revokeToken(accessToken: string): Promise<void>;
  /**
   * The tables the user shared during consent. Needed because the token response names none of
   * them — page access is granted in Notion's own UI, so candidates are only discoverable after
   * the grant exists. This is what makes connecting two phases rather than one.
   */
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
 * Classifies a failure by shape, never by content: no message here may carry the code, the
 * access token or the client secret, since these reach the logger.
 */
function classify(status: number, body: unknown): Error {
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
  // 403 restricted_resource is the user un-sharing; 404 object_not_found is a deleted table.
  // Neither is ours to fix and neither clears on retry.
  if (status === 403 || status === 404) {
    return new NotionResourceError(`notion resource unreachable (${status}, ${code})`);
  }
  // validation_error (schema drift under a write) and a 409 collision are Notion's retryable 4xx;
  // any other is a request only we could have malformed (Notion-Version, invalid_json).
  if (
    status >= 400 &&
    status < 500 &&
    status !== 429 &&
    status !== 409 &&
    code !== 'validation_error'
  ) {
    return new NotionConfigError(`notion rejected our request (${status}, ${code})`);
  }
  return new NotionUnavailableError(`notion answered ${status} (${code})`);
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
      // error.name separates a timeout from a DNS fault from a TypeError we caused; none of
      // those carry a secret. weather.ts logs the same field for the same reason.
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
      throw classify(response.status, body);
    }
    // A 200 we cannot parse is an outage, not an empty result — reporting it as "no rows" would
    // tell the user they have nothing to do.
    if (!readable) {
      throw new NotionUnavailableError('notion answered 200 with an unreadable body');
    }
    return body;
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
        await call('/oauth/token', basicAuth(), {
          method: 'POST',
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            // Required here: it was set in the authorize URL, and the connection has more than
            // one redirect URI registered.
            redirect_uri: `${env.PUBLIC_BASE_URL}/v1/integrations/notion/callback`,
          }),
        })
      );
    },

    async refreshGrant(refreshToken) {
      return toGrant(
        await call('/oauth/token', basicAuth(), {
          method: 'POST',
          body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken }),
        })
      );
    },

    async revokeToken(accessToken) {
      await call('/oauth/revoke', basicAuth(), {
        method: 'POST',
        body: JSON.stringify({ token: accessToken }),
      });
    },

    async searchDataSources(accessToken) {
      let body: unknown;
      try {
        body = await call('/search', `Bearer ${accessToken}`, {
          method: 'POST',
          body: JSON.stringify({
            filter: { property: 'object', value: 'data_source' },
            page_size: PAGE_SIZE,
          }),
        });
      } catch (error) {
        // Search names no resource the user could un-share: a 403 here is our integration's
        // capabilities (a 404 would be our URL), and the picker cannot fix either.
        if (error instanceof NotionResourceError) {
          throw new NotionConfigError(`notion search is forbidden (${error.message})`);
        }
        throw error;
      }
      const results = asRecord(body)?.results;
      if (!Array.isArray(results)) {
        throw new NotionUnavailableError('notion search answered without a results array');
      }
      // Verified against the live API (2026-09-11): results carry a string `id`, a rich-text
      // `title[].plain_text`, and `in_trash`.
      return results.flatMap((entry) => {
        const item = asRecord(entry);
        if (item === null || typeof item.id !== 'string') {
          return [];
        }
        // Search returns trashed tables too; offering one would let someone connect a table
        // that is on its way to deletion.
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
      await call(`/pages/${encodeURIComponent(pageId)}`, `Bearer ${accessToken}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: value }),
      });
    },
  };
}
