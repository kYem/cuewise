import { describe, expect, it, vi } from 'vitest';
import { checkboxSchema } from './__fixtures__/notion.fixtures';
import {
  createNotionClient,
  MAX_QUERY_PAGES,
  NOTION_VERSION,
  NotionAuthError,
  NotionConfigError,
  NotionResourceError,
  NotionUnavailableError,
} from './notion-client';
import type { CompletionProperty } from './notion-schema';

const ENV = {
  NOTION_CLIENT_ID: 'cid',
  NOTION_CLIENT_SECRET: 'csecret',
  PUBLIC_BASE_URL: 'https://api.example.test',
};

/** A fetch stand-in that asserts on the request and answers with whatever the case needs. */
function withFetch(handler: (url: string, init: RequestInit) => Response) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {}))
  ) as unknown as typeof fetch;
}

function client(handler: (url: string, init: RequestInit) => Response) {
  return createNotionClient(ENV, withFetch(handler));
}

function checkboxRow(id: string, done: boolean) {
  return { id, properties: { Done: { type: 'checkbox', checkbox: done } } };
}

const checkboxProperty: CompletionProperty = { kind: 'checkbox', name: 'Done' };

describe('exchangeCode', () => {
  it('pins the api version and authenticates as a confidential client', async () => {
    const notion = client((url, init) => {
      expect(url).toBe('https://api.notion.com/v1/oauth/token');
      const headers = new Headers(init.headers);
      expect(headers.get('Notion-Version')).toBe('2026-03-11');
      expect(headers.get('Authorization')).toBe(`Basic ${btoa('cid:csecret')}`);
      return Response.json({ access_token: 'tok', workspace_name: 'Acme' });
    });

    await expect(notion.exchangeCode('code-1')).resolves.toEqual({
      accessToken: 'tok',
      refreshToken: null,
      workspace: 'Acme',
    });
    expect(NOTION_VERSION).toBe('2026-03-11');
  });

  it('sends the callback url notion will have validated the code against', async () => {
    const notion = client((_url, init) => {
      expect(JSON.parse(String(init.body))).toMatchObject({
        grant_type: 'authorization_code',
        code: 'code-1',
        redirect_uri: 'https://api.example.test/v1/integrations/notion/callback',
      });
      return Response.json({ access_token: 'tok' });
    });

    await notion.exchangeCode('code-1');
  });

  it('keeps the code and the client secret out of any thrown message', async () => {
    const notion = client(() => Response.json({ error: 'invalid_grant' }, { status: 400 }));

    const error = await notion.exchangeCode('code-secret').catch((thrown: unknown) => thrown);

    expect(String(error)).not.toContain('code-secret');
    expect(String(error)).not.toContain('csecret');
  });

  it('treats a bad code as an auth fault', async () => {
    const notion = client(() => Response.json({ error: 'invalid_grant' }, { status: 400 }));

    await expect(notion.exchangeCode('c')).rejects.toBeInstanceOf(NotionAuthError);
  });

  it('treats a rejected client as our own configuration fault', async () => {
    const notion = client(() => Response.json({ error: 'invalid_client' }, { status: 401 }));

    await expect(notion.exchangeCode('c')).rejects.toBeInstanceOf(NotionConfigError);
  });

  it('treats a 5xx as retryable', async () => {
    const notion = client(() => new Response('', { status: 502 }));

    await expect(notion.exchangeCode('c')).rejects.toBeInstanceOf(NotionUnavailableError);
  });

  it('refuses a 200 that carries no access token', async () => {
    const notion = client(() => Response.json({ workspace_name: 'Acme' }));

    await expect(notion.exchangeCode('c')).rejects.toBeInstanceOf(NotionUnavailableError);
  });

  it('reads a refresh token when notion issues one', async () => {
    const notion = client(() =>
      Response.json({ access_token: 'tok', refresh_token: 'refresh-1', workspace_name: 'Acme' })
    );

    await expect(notion.exchangeCode('c')).resolves.toEqual({
      accessToken: 'tok',
      refreshToken: 'refresh-1',
      workspace: 'Acme',
    });
  });

  it('treats an explicitly null refresh token as none', async () => {
    const notion = client(() => Response.json({ access_token: 'tok', refresh_token: null }));

    await expect(notion.exchangeCode('c')).resolves.toMatchObject({ refreshToken: null });
  });
});

describe('failure classification', () => {
  it('maps a network fault to retryable, naming the fault class but nothing sensitive', async () => {
    const failing = vi.fn(() =>
      Promise.reject(new TypeError('bad url'))
    ) as unknown as typeof fetch;
    const notion = createNotionClient(ENV, failing);

    const error = await notion.exchangeCode('code-secret').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NotionUnavailableError);
    expect(String(error)).toContain('TypeError');
    expect(String(error)).not.toContain('code-secret');
  });

  it('treats a 200 with an unreadable body as an outage, never as an empty table list', async () => {
    const notion = client(() => new Response('<html>edge interstitial</html>', { status: 200 }));

    await expect(notion.searchDataSources('tok')).rejects.toBeInstanceOf(NotionUnavailableError);
    await expect(notion.queryRows('tok', 'ds1', checkboxProperty)).rejects.toBeInstanceOf(
      NotionUnavailableError
    );
  });

  it('treats 403 restricted_resource as the resource being gone, not our config', async () => {
    const notion = client(() => Response.json({ code: 'restricted_resource' }, { status: 403 }));

    await expect(notion.getPropertySchemas('tok', 'ds1')).rejects.toBeInstanceOf(
      NotionResourceError
    );
  });

  it('treats 404 object_not_found as the resource being gone, not retryable', async () => {
    const notion = client(() => Response.json({ code: 'object_not_found' }, { status: 404 }));

    await expect(notion.getPropertySchemas('tok', 'ds1')).rejects.toBeInstanceOf(
      NotionResourceError
    );
  });

  it('maps rate limiting to retryable', async () => {
    const notion = client(() => new Response('', { status: 429 }));

    await expect(notion.queryRows('tok', 'ds1', checkboxProperty)).rejects.toBeInstanceOf(
      NotionUnavailableError
    );
  });
});

describe('refresh and revoke', () => {
  it('renews a grant with basic auth and the refresh grant type', async () => {
    const notion = client((url, init) => {
      expect(url).toBe('https://api.notion.com/v1/oauth/token');
      expect(new Headers(init.headers).get('Authorization')).toBe(`Basic ${btoa('cid:csecret')}`);
      expect(JSON.parse(String(init.body))).toEqual({
        grant_type: 'refresh_token',
        refresh_token: 'refresh-1',
      });
      return Response.json({ access_token: 'tok-2', refresh_token: 'refresh-2' });
    });

    await expect(notion.refreshGrant('refresh-1')).resolves.toEqual({
      accessToken: 'tok-2',
      refreshToken: 'refresh-2',
      workspace: null,
    });
  });

  it('revokes with basic auth and the token in the body', async () => {
    const notion = client((url, init) => {
      expect(url).toBe('https://api.notion.com/v1/oauth/revoke');
      expect(new Headers(init.headers).get('Authorization')).toBe(`Basic ${btoa('cid:csecret')}`);
      expect(JSON.parse(String(init.body))).toEqual({ token: 'tok' });
      return Response.json({ request_id: 'r1' });
    });

    await expect(notion.revokeToken('tok')).resolves.toBeUndefined();
  });
});

// Shapes checked against the live API on 2026-09-11: results carry `object: 'data_source'`,
// a string `id`, `title[].plain_text`, and `in_trash`.
describe('searchDataSources', () => {
  it('filters for data sources and reads the rich-text title', async () => {
    const notion = client((url, init) => {
      expect(url).toBe('https://api.notion.com/v1/search');
      expect(JSON.parse(String(init.body))).toMatchObject({
        filter: { property: 'object', value: 'data_source' },
      });
      return Response.json({
        results: [
          {
            object: 'data_source',
            id: 'ds1',
            title: [{ plain_text: 'Current ' }, { plain_text: 'Goals' }],
            in_trash: false,
          },
        ],
      });
    });

    await expect(notion.searchDataSources('tok')).resolves.toEqual([
      { id: 'ds1', name: 'Current Goals' },
    ]);
  });

  it('treats a search answer with no results array as an outage, not an empty list', async () => {
    const notion = client(() => Response.json({ object: 'list' }));

    await expect(notion.searchDataSources('tok')).rejects.toBeInstanceOf(NotionUnavailableError);
  });

  it('omits trashed tables, so the picker cannot offer one on its way out', async () => {
    const notion = client(() =>
      Response.json({
        results: [
          { id: 'ds1', title: [{ plain_text: 'Live' }], in_trash: false },
          { id: 'ds2', title: [{ plain_text: 'Binned' }], in_trash: true },
        ],
      })
    );

    await expect(notion.searchDataSources('tok')).resolves.toEqual([{ id: 'ds1', name: 'Live' }]);
  });

  it('falls back to the id for an untitled table', async () => {
    const notion = client(() => Response.json({ results: [{ id: 'ds1', title: [] }] }));

    await expect(notion.searchDataSources('tok')).resolves.toEqual([{ id: 'ds1', name: 'ds1' }]);
  });
});

describe('getPropertySchemas', () => {
  it('returns the property schema, url-encoding the id', async () => {
    const notion = client((url) => {
      expect(url).toBe('https://api.notion.com/v1/data_sources/ds%2F1');
      return Response.json({ properties: checkboxSchema });
    });

    await expect(notion.getPropertySchemas('tok', 'ds/1')).resolves.toEqual(checkboxSchema);
  });

  it('refuses a data source with no readable schema', async () => {
    const notion = client(() => Response.json({ id: 'ds1' }));

    await expect(notion.getPropertySchemas('tok', 'ds1')).rejects.toBeInstanceOf(
      NotionUnavailableError
    );
  });
});

describe('queryRows', () => {
  it('queries the data source endpoint for pages only, one full page at a time', async () => {
    const notion = client((url, init) => {
      expect(url).toBe('https://api.notion.com/v1/data_sources/ds1/query');
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toMatchObject({
        result_type: 'page',
        page_size: 100,
      });
      return Response.json({
        results: [
          {
            id: 'pg1',
            properties: {
              Name: { type: 'title', title: [{ plain_text: 'Write the plan' }] },
              Done: { type: 'checkbox', checkbox: true },
            },
          },
        ],
        has_more: false,
      });
    });

    await expect(notion.queryRows('tok', 'ds1', checkboxProperty)).resolves.toEqual({
      items: [{ pageId: 'pg1', text: 'Write the plan', done: true }],
      truncated: false,
    });
  });

  it('follows next_cursor and keeps asking for pages only on every page', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    const notion = client((_url, init) => {
      bodies.push(JSON.parse(String(init.body)));
      call += 1;
      if (call === 1) {
        return Response.json({
          results: [checkboxRow('pg1', false)],
          has_more: true,
          next_cursor: 'cursor-2',
        });
      }
      return Response.json({ results: [checkboxRow('pg2', true)], has_more: false });
    });

    const rows = await notion.queryRows('tok', 'ds1', checkboxProperty);

    expect(rows.items.map((i) => i.pageId)).toEqual(['pg1', 'pg2']);
    expect(rows.truncated).toBe(false);
    expect(bodies[1]).toMatchObject({ start_cursor: 'cursor-2', result_type: 'page' });
  });

  it('stops at the page bound and says so, rather than presenting a partial list as whole', async () => {
    let calls = 0;
    const notion = client(() => {
      calls += 1;
      return Response.json({
        results: [checkboxRow(`pg${calls}`, false)],
        has_more: true,
        next_cursor: `cursor-${calls + 1}`,
      });
    });

    const rows = await notion.queryRows('tok', 'ds1', checkboxProperty);

    expect(calls).toBe(MAX_QUERY_PAGES);
    expect(rows.items).toHaveLength(MAX_QUERY_PAGES);
    expect(rows.truncated).toBe(true);
  });

  it('stops when has_more is true but no cursor came back', async () => {
    let calls = 0;
    const notion = client(() => {
      calls += 1;
      return Response.json({ results: [], has_more: true, next_cursor: null });
    });

    await notion.queryRows('tok', 'ds1', checkboxProperty);

    expect(calls).toBe(1);
  });

  it('reports a malformed later page as an outage rather than returning the earlier pages', async () => {
    let call = 0;
    const notion = client(() => {
      call += 1;
      if (call === 1) {
        return Response.json({
          results: [checkboxRow('pg1', false)],
          has_more: true,
          next_cursor: 'c2',
        });
      }
      return Response.json({ results: 'not-an-array' });
    });

    await expect(notion.queryRows('tok', 'ds1', checkboxProperty)).rejects.toBeInstanceOf(
      NotionUnavailableError
    );
  });

  it('skips a row with no properties, which is the shape of a nested data source', async () => {
    const notion = client(() =>
      Response.json({
        results: [{ id: 'ds-nested', object: 'data_source' }, checkboxRow('pg1', false)],
        has_more: false,
      })
    );

    const rows = await notion.queryRows('tok', 'ds1', checkboxProperty);

    expect(rows.items.map((i) => i.pageId)).toEqual(['pg1']);
  });

  it('maps a revoked grant to an auth fault', async () => {
    const notion = client(() => Response.json({ code: 'unauthorized' }, { status: 401 }));

    await expect(notion.queryRows('tok', 'ds1', checkboxProperty)).rejects.toBeInstanceOf(
      NotionAuthError
    );
  });

  it('authenticates with the stored grant, not basic auth', async () => {
    const notion = client((_url, init) => {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
      return Response.json({ results: [], has_more: false });
    });

    await notion.queryRows('tok', 'ds1', checkboxProperty);
  });
});

describe('setCompletion', () => {
  it('patches the status option, url-encoding the page id', async () => {
    const notion = client((url, init) => {
      expect(url).toBe('https://api.notion.com/v1/pages/pg%2F1');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(String(init.body))).toEqual({
        properties: { Status: { status: { id: 'o3' } } },
      });
      return Response.json({ id: 'pg1' });
    });

    await notion.setCompletion('tok', 'pg/1', { kind: 'status', name: 'Status', optionId: 'o3' });
  });

  it('writes a boolean for a checkbox property', async () => {
    const notion = client((_url, init) => {
      expect(JSON.parse(String(init.body))).toEqual({
        properties: { Done: { checkbox: true } },
      });
      return Response.json({ id: 'pg1' });
    });

    await notion.setCompletion('tok', 'pg1', { kind: 'checkbox', name: 'Done', checkbox: true });
  });
});
