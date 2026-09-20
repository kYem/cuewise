import { describe, expect, it, vi } from 'vitest';
import { spyOnLoggerError } from '../__fixtures__/logger.fixtures';
import {
  connectedNotionUser,
  FailingWriteStore,
  noTodoStatusSchema,
  notionEnv,
  signedInWithoutNotion,
  statusSchema,
  storedNotionTokens,
  stubNotionClient,
  TEST_ACCESS_TOKEN,
  TEST_DATA_SOURCE_ID,
  TEST_PAGE_ID,
  TEST_PROVIDER_KEY,
  TEST_REFRESH_TOKEN,
  TEST_REFRESHED_TOKEN,
  TEST_ROTATED_REFRESH_TOKEN,
  titleOnlySchema,
} from '../__fixtures__/notion.fixtures';
import { encryptSecret } from '../crypto-utils';
import { createApp } from '../index';
import { NotionAuthError, NotionResourceError, NotionUnavailableError } from '../notion-client';

function app(client = stubNotionClient()) {
  return createApp({ notionClientFactory: () => client });
}

const ITEMS = '/v1/integrations/notion/items';
const PAGE = `/v1/integrations/notion/items/${TEST_PAGE_ID}`;

function getItems(headers: Record<string, string>, client?: ReturnType<typeof stubNotionClient>) {
  return app(client).request(ITEMS, { headers }, notionEnv());
}

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

    const res = await getItems(headers);
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('provider_not_connected');
  });

  it('409s when connected but no table has been picked, so the client shows the picker', async () => {
    const { headers } = await connectedNotionUser({ dataSourceId: null });

    const res = await getItems(headers);
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

    const res = await getItems(headers, stubNotionClient({ queryRows }));

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

    await getItems(headers, stubNotionClient({ queryRows }));

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

    const res = await getItems(headers, stubNotionClient({ queryRows }));
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

    const res = await getItems(headers, stubNotionClient({ queryRows }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('provider_table_unavailable');
    // The grant itself is fine; only the selection needs redoing.
    await expect(store.getProviderConnection(userId, 'notion')).resolves.not.toBeNull();
  });

  it('asks to reconnect when the grant no longer decrypts, but keeps it — a key put back must find it', async () => {
    const { headers, store, userId } = await connectedNotionUser();

    const res = await app().request(
      ITEMS,
      { headers },
      notionEnv({ PROVIDER_TOKEN_KEY: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' })
    );
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(401);
    expect(body.code).toBe('provider_reauth_required');
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      dataSourceId: TEST_DATA_SOURCE_ID,
    });
  });

  it('fails closed on a malformed key without touching the stored grant', async () => {
    const { headers, store, userId } = await connectedNotionUser();

    const res = await app().request(ITEMS, { headers }, notionEnv({ PROVIDER_TOKEN_KEY: 'short' }));

    expect(res.status).toBe(500);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.not.toBeNull();
  });

  it('fails closed on a key longer than 32 bytes too, which AES-GCM would refuse at decrypt', async () => {
    const { headers, store, userId } = await connectedNotionUser();

    const res = await app().request(
      ITEMS,
      { headers },
      notionEnv({ PROVIDER_TOKEN_KEY: 'A'.repeat(44) })
    );

    expect(res.status).toBe(500);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.not.toBeNull();
  });

  it('answers not_connected, not reconnect, when the grant was disconnected during the request', async () => {
    const { headers, store, userId } = await connectedNotionUser();
    const queryRows = vi.fn(async () => {
      await store.deleteProviderConnection(userId, 'notion');
      throw new NotionAuthError('revoked');
    });

    const res = await getItems(headers, stubNotionClient({ queryRows }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('provider_not_connected');
  });

  it('prompts to re-validate when the completion property has gone', async () => {
    const getPropertySchemas = vi.fn(async () => titleOnlySchema);
    const { headers } = await connectedNotionUser();

    const res = await getItems(headers, stubNotionClient({ getPropertySchemas }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(422);
    expect(body.code).toBe('provider_schema_unusable');
  });
});

describe('token renewal', () => {
  it('retries with the renewed token, not the one notion just rejected', async () => {
    const { queryRows, tokens } = expiringQuery();
    const { headers } = await connectedNotionUser({ withRefreshToken: true });

    const res = await getItems(headers, stubNotionClient({ queryRows }));

    expect(res.status).toBe(200);
    expect(tokens).toEqual([TEST_ACCESS_TOKEN, TEST_REFRESHED_TOKEN]);
  });

  it('persists the renewed grant, rotating the refresh token notion returned', async () => {
    const { queryRows } = expiringQuery();
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    await getItems(headers, stubNotionClient({ queryRows }));

    await expect(storedNotionTokens(store, userId)).resolves.toEqual({
      accessToken: TEST_REFRESHED_TOKEN,
      refreshToken: TEST_ROTATED_REFRESH_TOKEN,
    });
  });

  it('keeps the stored refresh token when the renewal did not rotate it', async () => {
    const { queryRows } = expiringQuery();
    const refreshGrant = vi.fn(async () => ({
      accessToken: TEST_REFRESHED_TOKEN,
      refreshToken: null,
      workspace: null,
    }));
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    await getItems(headers, stubNotionClient({ queryRows, refreshGrant }));

    await expect(storedNotionTokens(store, userId)).resolves.toMatchObject({
      refreshToken: TEST_REFRESH_TOKEN,
    });
  });

  it('keeps the workspace name, which a refresh response never carries', async () => {
    const { queryRows } = expiringQuery();
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    await getItems(headers, stubNotionClient({ queryRows }));

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

    const res = await getItems(headers, stubNotionClient({ queryRows, refreshGrant }));

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

    const res = await getItems(headers, stubNotionClient({ queryRows, refreshGrant }));

    expect(res.status).toBe(401);
    expect(refreshGrant).not.toHaveBeenCalled();
  });

  it('keeps the grant when the renewal itself hits an outage, answering 503', async () => {
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('expired');
    });
    const refreshGrant = vi.fn(async () => {
      throw new NotionUnavailableError('down');
    });
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    const res = await getItems(headers, stubNotionClient({ queryRows, refreshGrant }));

    expect(res.status).toBe(503);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.not.toBeNull();
  });

  it('asks to reconnect when the refresh token no longer decrypts, keeping the row', async () => {
    const errorSpy = spyOnLoggerError();
    const refreshGrant = vi.fn(async () => {
      throw new Error('must not be called with a token that did not decrypt');
    });
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('expired');
    });
    const { headers, store, userId } = await connectedNotionUser();
    // The access pair decrypts; the refresh pair was sealed under some other key.
    const foreign = await encryptSecret(TEST_REFRESH_TOKEN, 'B'.repeat(43));
    const current = await storedNotionTokens(store, userId);
    const access = await encryptSecret(current.accessToken, TEST_PROVIDER_KEY);
    await store.updateProviderTokens(userId, 'notion', {
      ciphertext: access.ciphertext,
      iv: access.iv,
      refreshCiphertext: foreign.ciphertext,
      refreshIv: foreign.iv,
    });

    const res = await getItems(headers, stubNotionClient({ queryRows, refreshGrant }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(401);
    expect(body.code).toBe('provider_reauth_required');
    expect(refreshGrant).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    await expect(store.getProviderConnection(userId, 'notion')).resolves.not.toBeNull();
  });

  it('revokes the renewed token when storing it fails, so nothing live is orphaned', async () => {
    const revokeToken = vi.fn(async () => undefined);
    const { queryRows } = expiringQuery();
    const { headers } = await connectedNotionUser({ withRefreshToken: true });

    const res = await createApp({
      notionClientFactory: () => stubNotionClient({ queryRows, revokeToken }),
      storeFactory: () => new FailingWriteStore('updateProviderTokens'),
    }).request(ITEMS, { headers }, notionEnv());

    expect(res.status).toBe(500);
    expect(revokeToken).toHaveBeenCalledWith(TEST_REFRESHED_TOKEN);
  });

  it('drops the grant when the renewal itself is rejected', async () => {
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('expired');
    });
    const refreshGrant = vi.fn(async () => {
      throw new NotionAuthError('refresh token no longer valid');
    });
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    const res = await getItems(headers, stubNotionClient({ queryRows, refreshGrant }));

    expect(res.status).toBe(401);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('drops the grant when even the renewed token is rejected — its own renewal is not a race', async () => {
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('rejected again');
    });
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    const res = await getItems(headers, stubNotionClient({ queryRows }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(401);
    expect(body.code).toBe('provider_reauth_required');
    expect(queryRows).toHaveBeenCalledTimes(2);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('revokes a token minted for a grant that was disconnected during renewal', async () => {
    const revokeToken = vi.fn(async () => undefined);
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });
    const queryRows = vi.fn(async () => {
      await store.deleteProviderConnection(userId, 'notion');
      throw new NotionAuthError('expired');
    });

    const res = await getItems(headers, stubNotionClient({ queryRows, revokeToken }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('provider_not_connected');
    expect(revokeToken).toHaveBeenCalledWith(TEST_REFRESHED_TOKEN);
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

    const res = await getItems(headers, stubNotionClient({ queryRows }));

    expect(res.status).toBe(503);
    await expect(storedNotionTokens(store, userId)).resolves.toMatchObject({
      accessToken: TEST_REFRESHED_TOKEN,
    });
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

  it('names the missing To-do group when un-completing, rather than calling the table unusable', async () => {
    const setCompletion = vi.fn(async () => undefined);
    const getPropertySchemas = vi.fn(async () => noTodoStatusSchema);
    const { headers } = await connectedNotionUser();

    const res = await patchDone(
      headers,
      false,
      stubNotionClient({ setCompletion, getPropertySchemas })
    );
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(422);
    expect(body.code).toBe('provider_todo_group_missing');
    expect(setCompletion).not.toHaveBeenCalled();
  });

  it('answers not_found for a deleted page, without un-picking the table', async () => {
    const setCompletion = vi.fn(async () => {
      throw new NotionResourceError('page gone');
    });
    const { headers, store, userId } = await connectedNotionUser();

    const res = await patchDone(headers, true, stubNotionClient({ setCompletion }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('not_found');
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      dataSourceId: TEST_DATA_SOURCE_ID,
    });
  });

  it('answers table_unavailable when the table itself is gone', async () => {
    const getPropertySchemas = vi.fn(async () => {
      throw new NotionResourceError('table gone');
    });
    const { headers } = await connectedNotionUser();

    const res = await patchDone(headers, true, stubNotionClient({ getPropertySchemas }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('provider_table_unavailable');
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
    const getPropertySchemas = vi.fn(async () => titleOnlySchema);
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
