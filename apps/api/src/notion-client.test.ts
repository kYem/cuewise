import { describe, expect, it, vi } from 'vitest';
import { checkboxSchema } from './__fixtures__/notion.fixtures';
import {
  createNotionClient,
  MAX_QUERY_PAGES,
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
const WRITE = { kind: 'checkbox', name: 'Done', checkbox: true } as const;

/** True when the rejection's message carries none of `secrets`. */
function messageOmits(...secrets: string[]) {
  return (error: unknown) => secrets.every((secret) => !String(error).includes(secret));
}

describe('exchangeCode', () => {
  it('pins the api version and authenticates as a confidential client', async () => {
    const notion = client((url, init) => {
      expect(url).toBe('https://api.notion.com/v1/oauth/token');
      const headers = new Headers(init.headers);
      expect(headers.get('Notion-Version')).toBe('2026-03-11');
      expect(headers.get('Authorization')).toBe(`Basic ${btoa('cid:csecret')}`);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ access_token: 'tok', workspace_name: 'Acme' });
    });

    await expect(notion.exchangeCode('code-1')).resolves.toEqual({
      accessToken: 'tok',
      refreshToken: null,
      workspace: 'Acme',
    });
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

    const failing = notion.exchangeCode('code-secret');

    await expect(failing).rejects.toBeInstanceOf(NotionAuthError);
    await expect(failing).rejects.toSatisfy(messageOmits('code-secret', 'csecret'));
  });

  it('treats a 404 from any oauth endpoint as our fault, never as a lost table', async () => {
    const notion = client(() => Response.json({ code: 'object_not_found' }, { status: 404 }));

    await expect(notion.exchangeCode('c')).rejects.toBeInstanceOf(NotionConfigError);
    await expect(notion.refreshGrant('r')).rejects.toBeInstanceOf(NotionConfigError);
    await expect(notion.revokeToken('t')).rejects.toBeInstanceOf(NotionConfigError);
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

  it('refuses a 200 whose access token is the empty string', async () => {
    const notion = client(() => Response.json({ access_token: '' }));

    await expect(notion.exchangeCode('c')).rejects.toBeInstanceOf(NotionUnavailableError);
  });

  it('treats an empty-string refresh token as none', async () => {
    const notion = client(() => Response.json({ access_token: 'tok', refresh_token: '' }));

    await expect(notion.exchangeCode('c')).resolves.toMatchObject({ refreshToken: null });
  });

  it('treats an explicitly null refresh token as none', async () => {
    const notion = client(() => Response.json({ access_token: 'tok', refresh_token: null }));

    await expect(notion.exchangeCode('c')).resolves.toMatchObject({ refreshToken: null });
  });
});

describe('failure classification', () => {
  it('names each error class, so a log line can tell them apart', () => {
    expect(new NotionAuthError('x').name).toBe('NotionAuthError');
    expect(new NotionConfigError('x').name).toBe('NotionConfigError');
    expect(new NotionUnavailableError('x').name).toBe('NotionUnavailableError');
    expect(new NotionResourceError(404, 'x').name).toBe('NotionResourceError');
  });

  it('maps a network fault to retryable, naming the fault class but nothing sensitive', async () => {
    const failingFetch = vi.fn(() =>
      Promise.reject(new TypeError('bad url'))
    ) as unknown as typeof fetch;
    const notion = createNotionClient(ENV, failingFetch);

    const failing = notion.exchangeCode('code-secret');

    await expect(failing).rejects.toBeInstanceOf(NotionUnavailableError);
    await expect(failing).rejects.toThrow('TypeError');
    await expect(failing).rejects.toSatisfy(messageOmits('code-secret'));
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

  it('treats any other 4xx as our request being wrong, not as an outage to retry', async () => {
    const notion = client(() => Response.json({ code: 'invalid_request_url' }, { status: 400 }));

    await expect(notion.exchangeCode('c')).rejects.toBeInstanceOf(NotionConfigError);
  });

  it('keeps a 409 collision retryable, since a concurrent edit to the page causes it', async () => {
    const notion = client(() => Response.json({ code: 'conflict_error' }, { status: 409 }));

    await expect(notion.setCompletion('tok', 'pg1', WRITE)).rejects.toBeInstanceOf(
      NotionUnavailableError
    );
  });

  it('treats a 401 with no readable code as the grant being unusable, not our config', async () => {
    const notion = client(() => new Response('', { status: 401 }));

    await expect(notion.queryRows('tok', 'ds1', checkboxProperty)).rejects.toBeInstanceOf(
      NotionAuthError
    );
  });

  it('keeps validation_error retryable, since a renamed property causes it mid-write', async () => {
    const notion = client(() => Response.json({ code: 'validation_error' }, { status: 400 }));

    await expect(notion.exchangeCode('c')).rejects.toBeInstanceOf(NotionUnavailableError);
  });

  it('logs only an enum-shaped error code, never whatever the body carried', async () => {
    const notion = client(() => Response.json({ code: 'tok <secret>' }, { status: 400 }));

    const failing = notion.exchangeCode('c');

    await expect(failing).rejects.toThrow('unrecognised');
    await expect(failing).rejects.toSatisfy(messageOmits('secret'));
  });

  it('maps rate limiting to retryable, carrying Retry-After', async () => {
    const notion = client(() => new Response('', { status: 429, headers: { 'Retry-After': '7' } }));

    const failing = notion.queryRows('tok', 'ds1', checkboxProperty);

    await expect(failing).rejects.toBeInstanceOf(NotionUnavailableError);
    await expect(failing).rejects.toHaveProperty('retryAfter', 7);
    await expect(failing).rejects.toHaveProperty('status', 429);
  });

  it('carries no Retry-After when notion named none', async () => {
    const notion = client(() => new Response('', { status: 503 }));

    const failing = notion.queryRows('tok', 'ds1', checkboxProperty);

    await expect(failing).rejects.toBeInstanceOf(NotionUnavailableError);
    await expect(failing).rejects.toHaveProperty('retryAfter', null);
  });

  it('clamps an absurd Retry-After rather than relaying it', async () => {
    const notion = client(
      () => new Response('', { status: 429, headers: { 'Retry-After': '99999999' } })
    );

    await expect(notion.queryRows('tok', 'ds1', checkboxProperty)).rejects.toHaveProperty(
      'retryAfter',
      3600
    );
  });

  it('drops an HTTP-date Retry-After rather than relaying NaN', async () => {
    const notion = client(
      () =>
        new Response('', {
          status: 429,
          headers: { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' },
        })
    );

    await expect(notion.queryRows('tok', 'ds1', checkboxProperty)).rejects.toHaveProperty(
      'retryAfter',
      null
    );
  });

  it('records the status of an unusable 200, so a caller can tell it from a transport fault', async () => {
    const notion = client(() => Response.json({ object: 'list' }));

    await expect(notion.searchDataSources('tok')).rejects.toHaveProperty('status', 200);
  });
});

describe('refresh and revoke', () => {
  it('treats an unauthorized client as our configuration even on a 401, never as a dead grant', async () => {
    const notion = client(() => Response.json({ error: 'unauthorized_client' }, { status: 401 }));

    await expect(notion.refreshGrant('r')).rejects.toBeInstanceOf(NotionConfigError);
  });

  it('treats any 401 on a basic-auth call as our credentials, whatever the body says', async () => {
    const notion = client(() => new Response('', { status: 401 }));

    await expect(notion.refreshGrant('r')).rejects.toBeInstanceOf(NotionConfigError);
    await expect(notion.exchangeCode('c')).rejects.toBeInstanceOf(NotionConfigError);
    await expect(notion.revokeToken('t')).rejects.toBeInstanceOf(NotionConfigError);
  });

  it('counts a revoke answered 200 with no body as done', async () => {
    const notion = client(() => new Response('', { status: 200 }));

    await expect(notion.revokeToken('tok')).resolves.toBeUndefined();
  });

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

  it('treats a forbidden search as our configuration, since search names nothing the user could un-share', async () => {
    const notion = client(() => Response.json({ code: 'restricted_resource' }, { status: 403 }));

    await expect(notion.searchDataSources('tok')).rejects.toBeInstanceOf(NotionConfigError);
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

  it('skips a result with no string id rather than offering an undefined table', async () => {
    const notion = client(() =>
      Response.json({ results: [{ title: [{ plain_text: 'orphan' }] }, { id: 'ds1', title: [] }] })
    );

    await expect(notion.searchDataSources('tok')).resolves.toEqual([{ id: 'ds1', name: 'ds1' }]);
  });

  it('falls back to the id when a result carries no title at all', async () => {
    const notion = client(() => Response.json({ results: [{ id: 'ds1' }] }));

    await expect(notion.searchDataSources('tok')).resolves.toEqual([{ id: 'ds1', name: 'ds1' }]);
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
    expect(bodies[0]).toMatchObject({ result_type: 'page' });
    expect(bodies[0]).not.toHaveProperty('start_cursor');
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

  it('stops when has_more is true but no cursor came back, and still says the list is partial', async () => {
    let calls = 0;
    const notion = client(() => {
      calls += 1;
      return Response.json({ results: [], has_more: true, next_cursor: null });
    });

    const rows = await notion.queryRows('tok', 'ds1', checkboxProperty);

    expect(calls).toBe(1);
    expect(rows.truncated).toBe(true);
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
  it('keeps a 403 on the write as a resource fault carrying its status — the user may lack edit access', async () => {
    const notion = client(() => Response.json({ code: 'restricted_resource' }, { status: 403 }));

    const failing = notion.setCompletion('tok', 'pg1', WRITE);

    await expect(failing).rejects.toBeInstanceOf(NotionResourceError);
    await expect(failing).rejects.toHaveProperty('status', 403);
  });

  it('keeps a 404 on the write as the page being gone', async () => {
    const notion = client(() => Response.json({ code: 'object_not_found' }, { status: 404 }));

    await expect(notion.setCompletion('tok', 'pg1', WRITE)).rejects.toBeInstanceOf(
      NotionResourceError
    );
  });

  it('answers a write to a trashed page as the page being gone, after one look', async () => {
    const calls: string[] = [];
    const notion = client((url, init) => {
      calls.push(`${init.method ?? 'GET'} ${url}`);
      if (init.method === 'PATCH') {
        return Response.json({ code: 'validation_error' }, { status: 400 });
      }
      return Response.json({ object: 'page', id: 'pg1', in_trash: true });
    });

    const failing = notion.setCompletion('tok', 'pg1', WRITE);

    await expect(failing).rejects.toBeInstanceOf(NotionResourceError);
    await expect(failing).rejects.toHaveProperty('status', 404);
    expect(calls).toEqual([
      'PATCH https://api.notion.com/v1/pages/pg1',
      'GET https://api.notion.com/v1/pages/pg1',
    ]);
  });

  it('treats an archived page the same as a trashed one', async () => {
    const notion = client((_url, init) => {
      if (init.method === 'PATCH') {
        return Response.json({ code: 'validation_error' }, { status: 400 });
      }
      return Response.json({ object: 'page', id: 'pg1', archived: true });
    });

    await expect(notion.setCompletion('tok', 'pg1', WRITE)).rejects.toHaveProperty('status', 404);
  });

  it('answers the page as gone when the look itself finds it gone', async () => {
    const notion = client((_url, init) => {
      if (init.method === 'PATCH') {
        return Response.json({ code: 'validation_error' }, { status: 400 });
      }
      return Response.json({ code: 'object_not_found' }, { status: 404 });
    });

    await expect(notion.setCompletion('tok', 'pg1', WRITE)).rejects.toHaveProperty('status', 404);
  });

  it('keeps the 400 retryable when the look itself fails, rather than calling the page gone', async () => {
    const notion = client((_url, init) => {
      if (init.method === 'PATCH') {
        return Response.json({ code: 'validation_error' }, { status: 400 });
      }
      return new Response('', { status: 502 });
    });

    const failing = notion.setCompletion('tok', 'pg1', WRITE);

    await expect(failing).rejects.toBeInstanceOf(NotionUnavailableError);
    await expect(failing).rejects.toHaveProperty('status', 400);
  });

  it('keeps the 400 when the look is refused: a 403 does not say the page is gone', async () => {
    const notion = client((_url, init) => {
      if (init.method === 'PATCH') {
        return Response.json({ code: 'validation_error' }, { status: 400 });
      }
      return Response.json({ code: 'restricted_resource' }, { status: 403 });
    });

    const failing = notion.setCompletion('tok', 'pg1', WRITE);

    await expect(failing).rejects.toBeInstanceOf(NotionUnavailableError);
    await expect(failing).rejects.toHaveProperty('status', 400);
  });

  it('does not look at the page on any failure but a 400', async () => {
    let calls = 0;
    const notion = client(() => {
      calls += 1;
      return new Response('', { status: 502 });
    });

    await expect(notion.setCompletion('tok', 'pg1', WRITE)).rejects.toBeInstanceOf(
      NotionUnavailableError
    );
    expect(calls).toBe(1);
  });

  it('keeps a 400 on a live page retryable, so schema drift under a write is not called deletion', async () => {
    const notion = client((_url, init) => {
      if (init.method === 'PATCH') {
        return Response.json({ code: 'validation_error' }, { status: 400 });
      }
      return Response.json({ object: 'page', id: 'pg1', in_trash: false });
    });

    await expect(notion.setCompletion('tok', 'pg1', WRITE)).rejects.toBeInstanceOf(
      NotionUnavailableError
    );
  });

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

    await notion.setCompletion('tok', 'pg1', WRITE);
  });
});
