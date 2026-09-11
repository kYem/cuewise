import { describe, expect, it, vi } from 'vitest';
import {
  createNotionClient,
  NOTION_VERSION,
  NotionAuthError,
  NotionConfigError,
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

const checkboxProperty: CompletionProperty = { kind: 'checkbox', name: 'Done' };

describe('exchangeCode', () => {
  it('pins the api version and authenticates as a confidential client', async () => {
    const notion = client((url, init) => {
      expect(url).toBe('https://api.notion.com/v1/oauth/token');
      const headers = new Headers(init.headers);
      expect(headers.get('Notion-Version')).toBe(NOTION_VERSION);
      expect(headers.get('Authorization')).toBe(`Basic ${btoa('cid:csecret')}`);
      return Response.json({ access_token: 'tok', workspace_name: 'Acme' });
    });

    await expect(notion.exchangeCode('code-1')).resolves.toEqual({
      accessToken: 'tok',
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

  it('answers a null workspace rather than inventing one', async () => {
    const notion = client(() => Response.json({ access_token: 'tok' }));

    await expect(notion.exchangeCode('c')).resolves.toEqual({
      accessToken: 'tok',
      workspace: null,
    });
  });
});

describe('listDataSources', () => {
  it('reads the child data sources of a database', async () => {
    const notion = client((url) => {
      expect(url).toBe('https://api.notion.com/v1/databases/db1');
      return Response.json({
        data_sources: [
          { id: 'ds1', name: 'Tasks' },
          { id: 'ds2', name: 'Archive' },
        ],
      });
    });

    await expect(notion.listDataSources('tok', 'db1')).resolves.toEqual([
      { id: 'ds1', name: 'Tasks' },
      { id: 'ds2', name: 'Archive' },
    ]);
  });

  it('skips entries with no id instead of emitting undefined ones', async () => {
    const notion = client(() => Response.json({ data_sources: [{ name: 'no id' }] }));

    await expect(notion.listDataSources('tok', 'db1')).resolves.toEqual([]);
  });

  it('falls back to the id when a data source has no name', async () => {
    const notion = client(() => Response.json({ data_sources: [{ id: 'ds1' }] }));

    await expect(notion.listDataSources('tok', 'db1')).resolves.toEqual([
      { id: 'ds1', name: 'ds1' },
    ]);
  });
});

// Shapes here were checked against the live API on 2026-09-11: results carry
// `object: 'data_source'`, a string `id`, `title[].plain_text`, and `in_trash`.
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

  it('maps a revoked grant to an auth fault', async () => {
    const notion = client(() => Response.json({ code: 'unauthorized' }, { status: 401 }));

    await expect(notion.searchDataSources('tok')).rejects.toBeInstanceOf(NotionAuthError);
  });
});

describe('getDataSource', () => {
  it('returns the property schema', async () => {
    const notion = client((url) => {
      expect(url).toBe('https://api.notion.com/v1/data_sources/ds1');
      return Response.json({ properties: { Done: { type: 'checkbox', checkbox: {} } } });
    });

    await expect(notion.getDataSource('tok', 'ds1')).resolves.toEqual({
      Done: { type: 'checkbox', checkbox: {} },
    });
  });

  it('refuses a data source with no readable schema', async () => {
    const notion = client(() => Response.json({ id: 'ds1' }));

    await expect(notion.getDataSource('tok', 'ds1')).rejects.toBeInstanceOf(NotionUnavailableError);
  });
});

describe('queryRows', () => {
  it('queries the data source endpoint, not the database one', async () => {
    const notion = client((url, init) => {
      expect(url).toBe('https://api.notion.com/v1/data_sources/ds1/query');
      expect(init.method).toBe('POST');
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
      });
    });

    await expect(notion.queryRows('tok', 'ds1', checkboxProperty)).resolves.toEqual([
      { pageId: 'pg1', text: 'Write the plan', done: true },
    ]);
  });

  it('answers an empty list when notion returns no results array', async () => {
    const notion = client(() => Response.json({}));

    await expect(notion.queryRows('tok', 'ds1', checkboxProperty)).resolves.toEqual([]);
  });

  it('maps a revoked grant to an auth fault', async () => {
    const notion = client(() => Response.json({ code: 'unauthorized' }, { status: 401 }));

    await expect(notion.queryRows('tok', 'ds1', checkboxProperty)).rejects.toBeInstanceOf(
      NotionAuthError
    );
  });

  it('maps rate limiting to retryable rather than to a fault of ours', async () => {
    const notion = client(() => new Response('', { status: 429 }));

    await expect(notion.queryRows('tok', 'ds1', checkboxProperty)).rejects.toBeInstanceOf(
      NotionUnavailableError
    );
  });

  it('authenticates with the stored grant, not basic auth', async () => {
    const notion = client((_url, init) => {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
      return Response.json({ results: [] });
    });

    await notion.queryRows('tok', 'ds1', checkboxProperty);
  });
});

describe('setCompletion', () => {
  const statusProperty: CompletionProperty = {
    kind: 'status',
    name: 'Status',
    completeOptionIds: ['o3', 'o4'],
    firstCompleteOptionId: 'o3',
    firstTodoOptionId: 'o1',
  };

  it('writes the first Complete option, keeping the user their own vocabulary', async () => {
    const notion = client((url, init) => {
      expect(url).toBe('https://api.notion.com/v1/pages/pg1');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(String(init.body))).toEqual({
        properties: { Status: { status: { id: 'o3' } } },
      });
      return Response.json({ id: 'pg1' });
    });

    await notion.setCompletion('tok', 'pg1', true, statusProperty);
  });

  it('writes the first To-do option when un-completing', async () => {
    const notion = client((_url, init) => {
      expect(JSON.parse(String(init.body))).toEqual({
        properties: { Status: { status: { id: 'o1' } } },
      });
      return Response.json({ id: 'pg1' });
    });

    await notion.setCompletion('tok', 'pg1', false, statusProperty);
  });

  it('refuses to un-complete a schema with no To-do group rather than writing null', async () => {
    const notion = client(() => Response.json({ id: 'pg1' }));

    await expect(
      notion.setCompletion('tok', 'pg1', false, { ...statusProperty, firstTodoOptionId: null })
    ).rejects.toThrow(/To-do/);
  });

  it('writes a boolean for a checkbox property', async () => {
    const notion = client((_url, init) => {
      expect(JSON.parse(String(init.body))).toEqual({
        properties: { Done: { checkbox: true } },
      });
      return Response.json({ id: 'pg1' });
    });

    await notion.setCompletion('tok', 'pg1', true, checkboxProperty);
  });
});
