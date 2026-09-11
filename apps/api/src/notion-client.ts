import type { Env } from './env';
import { type CompletionProperty, isRowDone, type NotionPage, rowTitle } from './notion-schema';

/**
 * Pinned deliberately. `2025-09-03` is the floor — the release that split a database into a
 * container plus data sources — and an implicit "latest" would migrate that model under us.
 */
export const NOTION_VERSION = '2026-03-11';
const NOTION_API = 'https://api.notion.com/v1';
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 100;
// 5 pages = 500 rows. Notion rate-limits around 3 req/s, so this also bounds how much of that
// budget one read can spend.
const MAX_QUERY_PAGES = 5;

/** The user's grant is unusable — revoked, expired, or never valid. The route answers 401. */
export class NotionAuthError extends Error {}
/** Our client id or secret is wrong. Loud: no action by the user can fix it. */
export class NotionConfigError extends Error {}
/** Notion is down, rate-limiting, or unreadable. Retryable, and not a fault of ours. */
export class NotionUnavailableError extends Error {}

export interface NotionItem {
  pageId: string;
  text: string;
  done: boolean;
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
  listDataSources(accessToken: string, databaseId: string): Promise<NotionDataSource[]>;
  /**
   * The tables the user shared during consent. Needed because the token response names none of
   * them — page access is granted in Notion's own UI, so candidates are only discoverable after
   * the grant exists. This is what makes connecting two phases rather than one.
   */
  searchDataSources(accessToken: string): Promise<NotionDataSource[]>;
  getDataSource(accessToken: string, dataSourceId: string): Promise<Record<string, unknown>>;
  queryRows(
    accessToken: string,
    dataSourceId: string,
    property: CompletionProperty
  ): Promise<NotionItem[]>;
  setCompletion(
    accessToken: string,
    pageId: string,
    done: boolean,
    property: CompletionProperty
  ): Promise<void>;
}

type NotionEnv = Pick<Env, 'NOTION_CLIENT_ID' | 'NOTION_CLIENT_SECRET' | 'PUBLIC_BASE_URL'>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * A searched data source names itself in a rich-text `title` array, not a plain string.
 * Verified against the live API (2026-09-11): results carry `object: 'data_source'`, a string
 * `id`, and `title[].plain_text`.
 */
function dataSourceTitle(item: Record<string, unknown>): string {
  if (!Array.isArray(item.title)) {
    return typeof item.id === 'string' ? item.id : '';
  }
  const text = item.title
    .map((piece) => {
      const part = asRecord(piece);
      if (part === null || typeof part.plain_text !== 'string') {
        return '';
      }
      return part.plain_text;
    })
    .join('');
  if (text === '') {
    return typeof item.id === 'string' ? item.id : '';
  }
  return text;
}

/**
 * Classifies a failure by shape, never by content: no message here may carry the code, the
 * access token or the client secret, since these reach the logger.
 */
function classify(status: number, body: unknown): Error {
  const record = asRecord(body);
  const raw = record === null ? '' : (record.error ?? record.code);
  const code = typeof raw === 'string' ? raw : '';
  if (code === 'invalid_client' || code === 'unauthorized_client' || status === 403) {
    return new NotionConfigError(`notion rejected our client (${status}, ${code || 'no code'})`);
  }
  if (status === 401 || code === 'invalid_grant' || code === 'unauthorized') {
    return new NotionAuthError(`notion grant is unusable (${status}, ${code || 'no code'})`);
  }
  return new NotionUnavailableError(`notion answered ${status} (${code || 'no code'})`);
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
    } catch {
      // A network fault or timeout. Deliberately not reported as a config fault: retrying is
      // the right response, and the cause carries nothing a log should hold.
      throw new NotionUnavailableError('notion request did not complete');
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      throw classify(response.status, body);
    }
    return body;
  }

  function basicAuth(): string {
    return `Basic ${btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`)}`;
  }

  function toGrant(body: unknown): NotionGrant {
    const record = asRecord(body);
    const accessToken = record === null ? null : record.access_token;
    if (typeof accessToken !== 'string' || accessToken === '') {
      throw new NotionUnavailableError('notion returned no access token');
    }
    const rawRefresh = record === null ? null : record.refresh_token;
    return {
      accessToken,
      refreshToken: typeof rawRefresh === 'string' && rawRefresh !== '' ? rawRefresh : null,
      workspace:
        record !== null && typeof record.workspace_name === 'string' ? record.workspace_name : null,
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

    async listDataSources(accessToken, databaseId) {
      const body = await call(`/databases/${databaseId}`, `Bearer ${accessToken}`);
      const record = asRecord(body);
      const dataSources = record === null ? null : record.data_sources;
      if (!Array.isArray(dataSources)) {
        return [];
      }
      return dataSources.flatMap((entry) => {
        const item = asRecord(entry);
        if (item === null || typeof item.id !== 'string') {
          return [];
        }
        const name = typeof item.name === 'string' ? item.name : item.id;
        return [{ id: item.id, name }];
      });
    },

    async searchDataSources(accessToken) {
      const body = await call('/search', `Bearer ${accessToken}`, {
        method: 'POST',
        body: JSON.stringify({
          filter: { property: 'object', value: 'data_source' },
          page_size: PAGE_SIZE,
        }),
      });
      const record = asRecord(body);
      const results = record === null ? null : record.results;
      if (!Array.isArray(results)) {
        return [];
      }
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
        return [{ id: item.id, name: dataSourceTitle(item) }];
      });
    },

    async getDataSource(accessToken, dataSourceId) {
      const body = await call(`/data_sources/${dataSourceId}`, `Bearer ${accessToken}`);
      const record = asRecord(body);
      const properties = record === null ? null : asRecord(record.properties);
      if (properties === null) {
        throw new NotionUnavailableError('notion data source carried no readable schema');
      }
      return properties;
    },

    async queryRows(accessToken, dataSourceId, property) {
      const items: NotionItem[] = [];
      let cursor: string | null = null;
      // Bounded rather than "until has_more is false": a table with 50k rows must not be able to
      // hold a Worker invocation open, and a task list past this many is not a task list.
      for (let page = 0; page < MAX_QUERY_PAGES; page += 1) {
        const body = await call(`/data_sources/${dataSourceId}/query`, `Bearer ${accessToken}`, {
          method: 'POST',
          body: JSON.stringify({
            page_size: PAGE_SIZE,
            // Without this a wiki returns its nested data sources alongside its pages, and a
            // data source carries `id` and `properties` too — so it would mirror as a task.
            result_type: 'page',
            ...(cursor === null ? {} : { start_cursor: cursor }),
          }),
        });
        const record = asRecord(body);
        const results = record === null ? null : record.results;
        if (!Array.isArray(results)) {
          break;
        }
        for (const entry of results) {
          const row = asRecord(entry);
          if (row === null || typeof row.id !== 'string' || asRecord(row.properties) === null) {
            continue;
          }
          const notionPage = row as unknown as NotionPage;
          items.push({
            pageId: notionPage.id,
            text: rowTitle(notionPage),
            done: isRowDone(notionPage, property),
          });
        }
        const next = record === null ? null : record.next_cursor;
        if (record?.has_more !== true || typeof next !== 'string') {
          break;
        }
        cursor = next;
      }
      return items;
    },

    async setCompletion(accessToken, pageId, done, property) {
      let value: Record<string, unknown>;
      if (property.kind === 'checkbox') {
        value = { [property.name]: { checkbox: done } };
      } else {
        // Writing a null option id would clear the status instead of moving it, which reads as
        // "no status" rather than "not done" — so refuse rather than silently mangle their row.
        const optionId = done ? property.firstCompleteOptionId : property.firstTodoOptionId;
        if (optionId === null) {
          throw new NotionConfigError('data source has no To-do group to un-complete into');
        }
        value = { [property.name]: { status: { id: optionId } } };
      }
      await call(`/pages/${pageId}`, `Bearer ${accessToken}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: value }),
      });
    },
  };
}
