import { describe, expect, it, vi } from 'vitest';
import {
  connectedNotionUser,
  notionEnv,
  signedInWithoutNotion,
  stubNotionClient,
  TEST_ACCESS_TOKEN,
} from '../__fixtures__/notion.fixtures';
import { createApp } from '../index';
import { NotionAuthError, NotionUnavailableError } from '../notion-client';

function app(client = stubNotionClient()) {
  return createApp({ notionClientFactory: () => client });
}

const statusSchema = {
  Status: {
    type: 'status',
    status: {
      options: [
        { id: 'o1', name: 'Not started' },
        { id: 'o3', name: 'Shipped' },
      ],
      groups: [
        { id: 'g1', name: 'To-do', option_ids: ['o1'] },
        { id: 'g3', name: 'Complete', option_ids: ['o3'] },
      ],
    },
  },
};

describe('GET /v1/integrations/notion/items', () => {
  it('401s without a session', async () => {
    const res = await app().request('/v1/integrations/notion/items', {}, notionEnv());

    expect(res.status).toBe(401);
  });

  it('404s when the account has no grant', async () => {
    const { headers } = await signedInWithoutNotion();

    const res = await app().request('/v1/integrations/notion/items', { headers }, notionEnv());
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('provider_not_connected');
  });

  it('404s when connected but no table has been picked yet', async () => {
    const { headers } = await connectedNotionUser({ dataSourceId: null });

    const res = await app().request('/v1/integrations/notion/items', { headers }, notionEnv());

    expect(res.status).toBe(404);
  });

  it('returns normalized items, never raw notion json', async () => {
    const queryRows = vi.fn(async () => [{ pageId: 'pg1', text: 'Ship it', done: false }]);
    const { headers } = await connectedNotionUser();

    const res = await app(stubNotionClient({ queryRows })).request(
      '/v1/integrations/notion/items',
      { headers },
      notionEnv()
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      workspace: 'Acme',
      items: [{ pageId: 'pg1', text: 'Ship it', done: false }],
    });
  });

  it('queries with the decrypted grant, not the stored ciphertext', async () => {
    const queryRows = vi.fn(async () => []);
    const { headers } = await connectedNotionUser();

    await app(stubNotionClient({ queryRows })).request(
      '/v1/integrations/notion/items',
      { headers },
      notionEnv()
    );

    expect(queryRows).toHaveBeenCalledWith(TEST_ACCESS_TOKEN, 'ds1', expect.anything());
  });

  it('drops the grant when notion reports it revoked, so the ui stops offering it', async () => {
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('revoked');
    });
    const { headers, store, userId } = await connectedNotionUser();

    const res = await app(stubNotionClient({ queryRows })).request(
      '/v1/integrations/notion/items',
      { headers },
      notionEnv()
    );
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(401);
    expect(body.code).toBe('provider_reauth_required');
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('keeps the grant when notion is merely unavailable', async () => {
    const queryRows = vi.fn(async () => {
      throw new NotionUnavailableError('down');
    });
    const { headers, store, userId } = await connectedNotionUser();

    const res = await app(stubNotionClient({ queryRows })).request(
      '/v1/integrations/notion/items',
      { headers },
      notionEnv()
    );

    expect(res.status).toBe(503);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.not.toBeNull();
  });

  it('prompts to re-validate when the completion property has gone', async () => {
    const getDataSource = vi.fn(async () => ({ Name: { type: 'title', title: [] } }));
    const { headers } = await connectedNotionUser();

    const res = await app(stubNotionClient({ getDataSource })).request(
      '/v1/integrations/notion/items',
      { headers },
      notionEnv()
    );
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(422);
    expect(body.code).toBe('provider_schema_unusable');
  });
});

describe('PATCH /v1/integrations/notion/items/:pageId', () => {
  it('401s without a session', async () => {
    const res = await app().request(
      '/v1/integrations/notion/items/pg1',
      { method: 'PATCH', body: JSON.stringify({ done: true }) },
      notionEnv()
    );

    expect(res.status).toBe(401);
  });

  it('writes completion and answers 204', async () => {
    const setCompletion = vi.fn(async () => undefined);
    const { headers } = await connectedNotionUser();

    const res = await app(stubNotionClient({ setCompletion })).request(
      '/v1/integrations/notion/items/pg1',
      { method: 'PATCH', headers, body: JSON.stringify({ done: true }) },
      notionEnv()
    );

    expect(res.status).toBe(204);
    expect(setCompletion).toHaveBeenCalledWith(TEST_ACCESS_TOKEN, 'pg1', true, {
      kind: 'checkbox',
      name: 'Done',
    });
  });

  it('passes the status property through when the table uses one', async () => {
    const setCompletion = vi.fn(async () => undefined);
    const getDataSource = vi.fn(async () => statusSchema);
    const { headers } = await connectedNotionUser();

    await app(stubNotionClient({ setCompletion, getDataSource })).request(
      '/v1/integrations/notion/items/pg1',
      { method: 'PATCH', headers, body: JSON.stringify({ done: true }) },
      notionEnv()
    );

    expect(setCompletion).toHaveBeenCalledWith(
      TEST_ACCESS_TOKEN,
      'pg1',
      true,
      expect.objectContaining({ kind: 'status', firstCompleteOptionId: 'o3' })
    );
  });

  it('rejects a done that is not a boolean rather than coercing it', async () => {
    const setCompletion = vi.fn(async () => undefined);
    const { headers } = await connectedNotionUser();

    const res = await app(stubNotionClient({ setCompletion })).request(
      '/v1/integrations/notion/items/pg1',
      { method: 'PATCH', headers, body: JSON.stringify({ done: 'yes' }) },
      notionEnv()
    );

    expect(res.status).toBe(400);
    expect(setCompletion).not.toHaveBeenCalled();
  });

  it('rejects a body that is not json', async () => {
    const { headers } = await connectedNotionUser();

    const res = await app().request(
      '/v1/integrations/notion/items/pg1',
      { method: 'PATCH', headers, body: 'not json' },
      notionEnv()
    );

    expect(res.status).toBe(400);
  });

  it('404s when no table has been picked', async () => {
    const { headers } = await connectedNotionUser({ dataSourceId: null });

    const res = await app().request(
      '/v1/integrations/notion/items/pg1',
      { method: 'PATCH', headers, body: JSON.stringify({ done: true }) },
      notionEnv()
    );

    expect(res.status).toBe(404);
  });

  it('refuses to write when the completion property has gone', async () => {
    const setCompletion = vi.fn(async () => undefined);
    const getDataSource = vi.fn(async () => ({ Name: { type: 'title', title: [] } }));
    const { headers } = await connectedNotionUser();

    const res = await app(stubNotionClient({ setCompletion, getDataSource })).request(
      '/v1/integrations/notion/items/pg1',
      { method: 'PATCH', headers, body: JSON.stringify({ done: true }) },
      notionEnv()
    );

    expect(res.status).toBe(422);
    expect(setCompletion).not.toHaveBeenCalled();
  });
});
