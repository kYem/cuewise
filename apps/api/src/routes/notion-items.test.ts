import { describe, expect, it, vi } from 'vitest';
import {
  asSchemas,
  connectedNotionUser,
  notionEnv,
  signedInWithoutNotion,
  statusSchema,
  stubNotionClient,
  TEST_ACCESS_TOKEN,
  TEST_DATA_SOURCE_ID,
  TEST_PAGE_ID,
  TEST_PROVIDER_KEY,
  TEST_REFRESH_TOKEN,
  TEST_REFRESHED_TOKEN,
  TEST_ROTATED_REFRESH_TOKEN,
} from '../__fixtures__/notion.fixtures';
import { decryptSecret, encryptSecret } from '../crypto-utils';
import { createApp } from '../index';
import { NotionAuthError, NotionResourceError, NotionUnavailableError } from '../notion-client';

function app(client = stubNotionClient()) {
  return createApp({ notionClientFactory: () => client });
}

const ITEMS = '/v1/integrations/notion/items';
const PAGE = `/v1/integrations/notion/items/${TEST_PAGE_ID}`;

function patchDone(
  headers: Record<string, string>,
  done: unknown,
  client?: ReturnType<typeof stubNotionClient>
) {
  return app(client).request(
    PAGE,
    { method: 'PATCH', headers, body: JSON.stringify({ done }) },
    notionEnv()
  );
}

/** A queryRows stub that 401s once, then answers — and records every token it was handed. */
function expiringQuery() {
  const tokens: string[] = [];
  const queryRows = vi.fn(async (token: string) => {
    tokens.push(token);
    if (tokens.length === 1) {
      throw new NotionAuthError('expired');
    }
    return { items: [{ pageId: 'pg1', text: 'after refresh', done: false }], truncated: false };
  });
  return { queryRows, tokens };
}

describe('GET /v1/integrations/notion/items', () => {
  it('401s without a session', async () => {
    const res = await app().request(ITEMS, {}, notionEnv());

    expect(res.status).toBe(401);
  });

  it('404s when the account has no grant', async () => {
    const { headers } = await signedInWithoutNotion();

    const res = await app().request(ITEMS, { headers }, notionEnv());
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('provider_not_connected');
  });

  it('409s when connected but no table has been picked, so the client shows the picker', async () => {
    const { headers } = await connectedNotionUser({ dataSourceId: null });

    const res = await app().request(ITEMS, { headers }, notionEnv());
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(409);
    expect(body.code).toBe('provider_table_unselected');
  });

  it('returns normalized items and the truncation flag, never raw notion json', async () => {
    const queryRows = vi.fn(async () => ({
      items: [{ pageId: 'pg1', text: 'Ship it', done: false }],
      truncated: true,
    }));
    const { headers } = await connectedNotionUser();

    const res = await app(stubNotionClient({ queryRows })).request(ITEMS, { headers }, notionEnv());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      workspace: 'Acme',
      items: [{ pageId: 'pg1', text: 'Ship it', done: false }],
      truncated: true,
    });
  });

  it('queries with the decrypted grant, not the stored ciphertext', async () => {
    const queryRows = vi.fn(async () => ({ items: [], truncated: false }));
    const { headers } = await connectedNotionUser();

    await app(stubNotionClient({ queryRows })).request(ITEMS, { headers }, notionEnv());

    expect(queryRows).toHaveBeenCalledWith(
      TEST_ACCESS_TOKEN,
      TEST_DATA_SOURCE_ID,
      expect.anything()
    );
  });

  it('drops the grant when notion reports it revoked and nothing can renew it', async () => {
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('revoked');
    });
    const { headers, store, userId } = await connectedNotionUser();

    const res = await app(stubNotionClient({ queryRows })).request(ITEMS, { headers }, notionEnv());
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(401);
    expect(body.code).toBe('provider_reauth_required');
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('answers 404 table_unavailable when the table was deleted or un-shared', async () => {
    const queryRows = vi.fn(async () => {
      throw new NotionResourceError('gone');
    });
    const { headers, store, userId } = await connectedNotionUser();

    const res = await app(stubNotionClient({ queryRows })).request(ITEMS, { headers }, notionEnv());
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('provider_table_unavailable');
    // The grant itself is fine; only the selection needs redoing.
    await expect(store.getProviderConnection(userId, 'notion')).resolves.not.toBeNull();
  });

  it('prompts to re-validate when the completion property has gone', async () => {
    const getPropertySchemas = vi.fn(async () => asSchemas({ Name: { type: 'title', title: [] } }));
    const { headers } = await connectedNotionUser();

    const res = await app(stubNotionClient({ getPropertySchemas })).request(
      ITEMS,
      { headers },
      notionEnv()
    );
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(422);
    expect(body.code).toBe('provider_schema_unusable');
  });
});

describe('token renewal', () => {
  it('retries with the renewed token, not the one notion just rejected', async () => {
    const { queryRows, tokens } = expiringQuery();
    const { headers } = await connectedNotionUser({ withRefreshToken: true });

    const res = await app(stubNotionClient({ queryRows })).request(ITEMS, { headers }, notionEnv());

    expect(res.status).toBe(200);
    expect(tokens).toEqual([TEST_ACCESS_TOKEN, TEST_REFRESHED_TOKEN]);
  });

  it('persists the renewed grant, rotating the refresh token notion returned', async () => {
    const { queryRows } = expiringQuery();
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    await app(stubNotionClient({ queryRows })).request(ITEMS, { headers }, notionEnv());

    const stored = await store.getProviderConnection(userId, 'notion');
    if (stored === null || stored.refreshCiphertext === null || stored.refreshIv === null) {
      throw new Error('expected the renewed grant to be stored with its refresh token');
    }
    await expect(decryptSecret(stored.ciphertext, stored.iv, TEST_PROVIDER_KEY)).resolves.toBe(
      TEST_REFRESHED_TOKEN
    );
    await expect(
      decryptSecret(stored.refreshCiphertext, stored.refreshIv, TEST_PROVIDER_KEY)
    ).resolves.toBe(TEST_ROTATED_REFRESH_TOKEN);
  });

  it('keeps the stored refresh token when the renewal did not rotate it', async () => {
    const { queryRows } = expiringQuery();
    const refreshGrant = vi.fn(async () => ({
      accessToken: TEST_REFRESHED_TOKEN,
      refreshToken: null,
      workspace: null,
    }));
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    await app(stubNotionClient({ queryRows, refreshGrant })).request(
      ITEMS,
      { headers },
      notionEnv()
    );

    const stored = await store.getProviderConnection(userId, 'notion');
    if (stored === null || stored.refreshCiphertext === null || stored.refreshIv === null) {
      throw new Error('the refresh token must survive a renewal that omitted one');
    }
    await expect(
      decryptSecret(stored.refreshCiphertext, stored.refreshIv, TEST_PROVIDER_KEY)
    ).resolves.toBe(TEST_REFRESH_TOKEN);
  });

  it('keeps the workspace name, which a refresh response never carries', async () => {
    const { queryRows } = expiringQuery();
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    await app(stubNotionClient({ queryRows })).request(ITEMS, { headers }, notionEnv());

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      workspace: 'Acme',
    });
  });

  it('does not renew on a mere outage, even when a refresh token is held', async () => {
    const queryRows = vi.fn(async () => {
      throw new NotionUnavailableError('down');
    });
    const refreshGrant = vi.fn(async () => {
      throw new Error('must not renew for a non-auth fault');
    });
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    const res = await app(stubNotionClient({ queryRows, refreshGrant })).request(
      ITEMS,
      { headers },
      notionEnv()
    );

    expect(res.status).toBe(503);
    expect(refreshGrant).not.toHaveBeenCalled();
    await expect(store.getProviderConnection(userId, 'notion')).resolves.not.toBeNull();
  });

  it('gives up when there is no refresh token to renew with', async () => {
    const refreshGrant = vi.fn(async () => {
      throw new Error('must not be called without a stored refresh token');
    });
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('revoked');
    });
    const { headers } = await connectedNotionUser();

    const res = await app(stubNotionClient({ queryRows, refreshGrant })).request(
      ITEMS,
      { headers },
      notionEnv()
    );

    expect(res.status).toBe(401);
    expect(refreshGrant).not.toHaveBeenCalled();
  });

  it('drops the grant when the renewal itself is rejected', async () => {
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('expired');
    });
    const refreshGrant = vi.fn(async () => {
      throw new NotionAuthError('refresh token no longer valid');
    });
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    const res = await app(stubNotionClient({ queryRows, refreshGrant })).request(
      ITEMS,
      { headers },
      notionEnv()
    );

    expect(res.status).toBe(401);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('does not drop a grant a concurrent request already renewed', async () => {
    // This request's token 401s, but by the time it reacts another request has stored a fresh one.
    const { store, userId, headers } = await connectedNotionUser();
    const renewed = await encryptSecret(TEST_REFRESHED_TOKEN, TEST_PROVIDER_KEY);
    const queryRows = vi.fn(async () => {
      await store.updateProviderTokens(userId, 'notion', {
        ciphertext: renewed.ciphertext,
        iv: renewed.iv,
        refreshCiphertext: null,
        refreshIv: null,
      });
      throw new NotionAuthError('expired');
    });

    const res = await app(stubNotionClient({ queryRows })).request(ITEMS, { headers }, notionEnv());

    expect(res.status).toBe(503);
    const stored = await store.getProviderConnection(userId, 'notion');
    if (stored === null) {
      throw new Error("the winner's renewed grant must survive the loser's auth fault");
    }
    await expect(decryptSecret(stored.ciphertext, stored.iv, TEST_PROVIDER_KEY)).resolves.toBe(
      TEST_REFRESHED_TOKEN
    );
  });
});

describe('PATCH /v1/integrations/notion/items/:pageId', () => {
  it('401s without a session', async () => {
    const res = await app().request(
      PAGE,
      { method: 'PATCH', body: JSON.stringify({ done: true }) },
      notionEnv()
    );

    expect(res.status).toBe(401);
  });

  it('rejects a page id that is not a Notion id', async () => {
    const { headers } = await connectedNotionUser();

    const res = await app().request(
      '/v1/integrations/notion/items/x%2F..%2F..%2Fusers',
      { method: 'PATCH', headers, body: JSON.stringify({ done: true }) },
      notionEnv()
    );

    expect(res.status).toBe(400);
  });

  it('writes completion and answers 204', async () => {
    const setCompletion = vi.fn(async () => undefined);
    const { headers } = await connectedNotionUser();

    const res = await patchDone(headers, true, stubNotionClient({ setCompletion }));

    expect(res.status).toBe(204);
    expect(setCompletion).toHaveBeenCalledWith(TEST_ACCESS_TOKEN, TEST_PAGE_ID, {
      kind: 'checkbox',
      name: 'Done',
      checkbox: true,
    });
  });

  it('writes the first Complete option when the table uses a status property', async () => {
    const setCompletion = vi.fn(async () => undefined);
    const getPropertySchemas = vi.fn(async () => statusSchema);
    const { headers } = await connectedNotionUser();

    await patchDone(headers, true, stubNotionClient({ setCompletion, getPropertySchemas }));

    expect(setCompletion).toHaveBeenCalledWith(TEST_ACCESS_TOKEN, TEST_PAGE_ID, {
      kind: 'status',
      name: 'Status',
      optionId: 'o3',
    });
  });

  it('answers 422, not 500, when un-completing a table with no To-do group', async () => {
    const setCompletion = vi.fn(async () => undefined);
    const noTodo = asSchemas({
      Status: {
        type: 'status',
        status: {
          options: [{ id: 'o3', name: 'Shipped' }],
          groups: [{ id: 'g3', name: 'Complete', option_ids: ['o3'] }],
        },
      },
    });
    const getPropertySchemas = vi.fn(async () => noTodo);
    const { headers } = await connectedNotionUser();

    const res = await patchDone(
      headers,
      false,
      stubNotionClient({ setCompletion, getPropertySchemas })
    );
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(422);
    expect(body.code).toBe('provider_schema_unusable');
    expect(setCompletion).not.toHaveBeenCalled();
  });

  it('rejects a done that is not a boolean rather than coercing it', async () => {
    const setCompletion = vi.fn(async () => undefined);
    const { headers } = await connectedNotionUser();

    const res = await patchDone(headers, 'yes', stubNotionClient({ setCompletion }));

    expect(res.status).toBe(400);
    expect(setCompletion).not.toHaveBeenCalled();
  });

  it('rejects a body that is not json', async () => {
    const { headers } = await connectedNotionUser();

    const res = await app().request(
      PAGE,
      { method: 'PATCH', headers, body: 'not json' },
      notionEnv()
    );

    expect(res.status).toBe(400);
  });

  it('409s when no table has been picked', async () => {
    const { headers } = await connectedNotionUser({ dataSourceId: null });

    const res = await patchDone(headers, true);

    expect(res.status).toBe(409);
  });

  it('refuses to write when the completion property has gone', async () => {
    const setCompletion = vi.fn(async () => undefined);
    const getPropertySchemas = vi.fn(async () => asSchemas({ Name: { type: 'title', title: [] } }));
    const { headers } = await connectedNotionUser();

    const res = await patchDone(
      headers,
      true,
      stubNotionClient({ setCompletion, getPropertySchemas })
    );

    expect(res.status).toBe(422);
    expect(setCompletion).not.toHaveBeenCalled();
  });
});
