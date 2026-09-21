import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { spyOnLoggerError, spyOnLoggerWarn } from '../__fixtures__/logger.fixtures';
import {
  checkboxSchema,
  connectedNotionUser,
  FailingWriteStore,
  noTodoStatusSchema,
  notionEnv,
  sealRefreshUnderForeignKey,
  signedInWithoutNotion,
  statusSchema,
  storedNotionTokens,
  stubNotionClient,
  TEST_ACCESS_TOKEN,
  TEST_DATA_SOURCE_ID,
  TEST_FOREIGN_PROVIDER_KEY,
  TEST_PAGE_ID,
  TEST_PROVIDER_KEY,
  TEST_REFRESH_TOKEN,
  TEST_REFRESHED_TOKEN,
  TEST_ROTATED_REFRESH_TOKEN,
  titleOnlySchema,
} from '../__fixtures__/notion.fixtures';
import { encryptSecret } from '../crypto-utils';
import { D1SyncStore } from '../d1-store';
import { createApp } from '../index';
import {
  NotionAuthError,
  NotionConfigError,
  NotionResourceError,
  NotionUnavailableError,
} from '../notion-client';

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

    const res = await getItems(headers, stubNotionClient({ queryRows }));

    await expect(res.json()).resolves.toMatchObject({ truncated: false });
    expect(queryRows).toHaveBeenCalledWith(
      TEST_ACCESS_TOKEN,
      TEST_DATA_SOURCE_ID,
      expect.anything()
    );
  });

  it('drops the grant when notion reports it revoked and nothing can renew it', async () => {
    const warnSpy = spyOnLoggerWarn();
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('revoked');
    });
    const { headers, store, userId } = await connectedNotionUser();

    const res = await getItems(headers, stubNotionClient({ queryRows }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(401);
    expect(body.code).toBe('provider_reauth_required');
    expect(warnSpy).toHaveBeenCalledWith('Notion auth fault', { userId, reason: 'revoked' });
    expect(warnSpy).toHaveBeenCalledWith('Dropped the Notion grant after an auth fault', {
      userId,
    });
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('answers 404 table_unavailable when the table was deleted or un-shared', async () => {
    const queryRows = vi.fn(async () => {
      throw new NotionResourceError(404, 'gone');
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
      notionEnv({ PROVIDER_TOKEN_KEY: TEST_FOREIGN_PROVIDER_KEY })
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
    const warnSpy = spyOnLoggerWarn();
    const { headers, store, userId } = await connectedNotionUser();
    const queryRows = vi.fn(async () => {
      await store.takeProviderConnection(userId, 'notion');
      throw new NotionAuthError('revoked');
    });

    const res = await getItems(headers, stubNotionClient({ queryRows }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('provider_not_connected');
    expect(warnSpy).toHaveBeenCalledWith('Notion auth fault on a grant already disconnected', {
      userId,
    });
  });

  it('answers 500 and keeps the grant when the client throws something that is not a notion fault', async () => {
    const errorSpy = spyOnLoggerError();
    const queryRows = vi.fn(async () => {
      throw new TypeError('our bug');
    });
    const { headers, store, userId } = await connectedNotionUser();

    const res = await getItems(headers, stubNotionClient({ queryRows }));

    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledWith('Unhandled API error', expect.any(TypeError));
    await expect(store.getProviderConnection(userId, 'notion')).resolves.not.toBeNull();
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

    const res = await getItems(headers, stubNotionClient({ queryRows, refreshGrant }));

    expect(res.status).toBe(200);
    await expect(storedNotionTokens(store, userId)).resolves.toEqual({
      accessToken: TEST_REFRESHED_TOKEN,
      refreshToken: TEST_REFRESH_TOKEN,
    });
  });

  it('keeps the workspace name across a renewal', async () => {
    const { queryRows } = expiringQuery();
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    const res = await getItems(headers, stubNotionClient({ queryRows }));

    expect(res.status).toBe(200);
    await expect(storedNotionTokens(store, userId)).resolves.toMatchObject({
      accessToken: TEST_REFRESHED_TOKEN,
    });
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

  it('keeps the grant when the renewal itself hits an outage, answering 503 and saying so', async () => {
    const warnSpy = spyOnLoggerWarn();
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('expired');
    });
    const refreshGrant = vi.fn(async () => {
      throw new NotionUnavailableError('down');
    });
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    const res = await getItems(headers, stubNotionClient({ queryRows, refreshGrant }));

    expect(res.status).toBe(503);
    expect(warnSpy).toHaveBeenCalledWith('Notion grant renewal failed', { userId, reason: 'down' });
    await expect(store.getProviderConnection(userId, 'notion')).resolves.not.toBeNull();
  });

  it('still answers the outage when the claim cannot be released after it', async () => {
    const warnSpy = spyOnLoggerWarn();
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('expired');
    });
    const refreshGrant = vi.fn(async () => {
      throw new NotionUnavailableError('down');
    });
    const { headers, userId } = await connectedNotionUser({ withRefreshToken: true });

    const res = await createApp({
      notionClientFactory: () => stubNotionClient({ queryRows, refreshGrant }),
      storeFactory: () => new FailingWriteStore('releaseProviderRenewal'),
    }).request(ITEMS, { headers }, notionEnv());

    expect(res.status).toBe(503);
    expect(warnSpy).toHaveBeenCalledWith(
      'Could not release the Notion renewal claim; it goes stale in 30s',
      { userId, reason: 'D1 write failed' }
    );
  });

  it('hands notion the stored refresh token, not the access token it just rejected', async () => {
    const { queryRows } = expiringQuery();
    const client = stubNotionClient({ queryRows });
    const { headers } = await connectedNotionUser({ withRefreshToken: true });

    await getItems(headers, client);

    expect(client.refreshGrant).toHaveBeenCalledWith(TEST_REFRESH_TOKEN);
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
    await sealRefreshUnderForeignKey(store, userId);

    const res = await getItems(headers, stubNotionClient({ queryRows, refreshGrant }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(401);
    expect(body.code).toBe('provider_reauth_required');
    expect(queryRows).toHaveBeenCalledTimes(1);
    expect(refreshGrant).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      'Stored Notion refresh token does not decrypt under the current key',
      { userId, reason: 'OperationError' }
    );
    await expect(store.getProviderConnection(userId, 'notion')).resolves.not.toBeNull();
  });

  it('revokes the renewed token when storing it fails, and says so before the 500', async () => {
    const errorSpy = spyOnLoggerError();
    const revokeToken = vi.fn(async () => undefined);
    const { queryRows } = expiringQuery();
    const { headers, userId } = await connectedNotionUser({ withRefreshToken: true });

    const res = await createApp({
      notionClientFactory: () => stubNotionClient({ queryRows, revokeToken }),
      storeFactory: () => new FailingWriteStore('updateProviderTokens'),
    }).request(ITEMS, { headers }, notionEnv());

    expect(res.status).toBe(500);
    expect(revokeToken).toHaveBeenCalledWith(TEST_REFRESHED_TOKEN);
    expect(errorSpy).toHaveBeenCalledWith(
      'Notion renewal could not be stored; revoked the new token',
      expect.any(Error),
      { userId }
    );
    // The claim is released too, so the next request is not told to retry for 30s.
    const row = await new D1SyncStore(env.DB).getProviderConnection(userId, 'notion');
    if (row === null) {
      throw new Error('expected the grant to survive');
    }
    await expect(
      new D1SyncStore(env.DB).claimProviderRenewal(userId, 'notion', row, 30_000)
    ).resolves.not.toBeNull();
  });

  it('revokes the renewed token when sealing it fails, naming the fault but not its message', async () => {
    const errorSpy = spyOnLoggerError();
    const revokeToken = vi.fn(async () => undefined);
    const { queryRows } = expiringQuery();
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });
    vi.spyOn(crypto.subtle, 'encrypt').mockRejectedValueOnce(new Error('WebCrypto fault'));

    const res = await getItems(headers, stubNotionClient({ queryRows, revokeToken }));

    expect(res.status).toBe(500);
    expect(revokeToken).toHaveBeenCalledWith(TEST_REFRESHED_TOKEN);
    expect(errorSpy).toHaveBeenCalledWith(
      'Notion renewal could not be sealed; revoked the new token',
      { userId, reason: 'Error' }
    );
    await expect(storedNotionTokens(store, userId)).resolves.toEqual({
      accessToken: TEST_ACCESS_TOKEN,
      refreshToken: TEST_REFRESH_TOKEN,
    });
    const row = await store.getProviderConnection(userId, 'notion');
    if (row === null) {
      throw new Error('expected the grant to survive');
    }
    await expect(store.claimProviderRenewal(userId, 'notion', row, 30_000)).resolves.not.toBeNull();
  });

  it('answers retry, without calling notion, while another request holds the renewal', async () => {
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('expired');
    });
    const refreshGrant = vi.fn(async () => {
      throw new Error('must not renew while another request holds the claim');
    });
    const warnSpy = spyOnLoggerWarn();
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });
    const row = await store.getProviderConnection(userId, 'notion');
    if (row === null) {
      throw new Error('expected a stored grant');
    }
    await expect(store.claimProviderRenewal(userId, 'notion', row, 30_000)).resolves.not.toBeNull();

    const res = await getItems(headers, stubNotionClient({ queryRows, refreshGrant }));
    const body = (await res.json()) as { code: string; detail: string };

    expect(res.status).toBe(503);
    expect(body.code).toBe('upstream_unavailable');
    expect(body.detail).toBe('Please retry.');
    expect(refreshGrant).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('Notion renewal held or overtaken by another request', {
      userId,
    });
    await expect(store.getProviderConnection(userId, 'notion')).resolves.not.toBeNull();
  });

  it('releases the renewal claim after a failed refresh, so the next request may try', async () => {
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('expired');
    });
    const refreshGrant = vi.fn(async () => {
      throw new NotionUnavailableError('down');
    });
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });

    await getItems(headers, stubNotionClient({ queryRows, refreshGrant }));

    expect(refreshGrant).toHaveBeenCalledTimes(1);
    const row = await store.getProviderConnection(userId, 'notion');
    if (row === null) {
      throw new Error('expected the grant to survive');
    }
    await expect(store.claimProviderRenewal(userId, 'notion', row, 30_000)).resolves.not.toBeNull();
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

  it('mints nothing when the grant was disconnected before renewal could start', async () => {
    const warnSpy = spyOnLoggerWarn();
    const refreshGrant = vi.fn(async () => {
      throw new Error('must not renew a grant that is already gone');
    });
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });
    const queryRows = vi.fn(async () => {
      await store.takeProviderConnection(userId, 'notion');
      throw new NotionAuthError('expired');
    });

    const res = await getItems(headers, stubNotionClient({ queryRows, refreshGrant }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('provider_not_connected');
    expect(refreshGrant).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('Notion grant was disconnected before renewal', {
      userId,
    });
  });

  it('answers retry and revokes its token when a reconnect replaced the grant during renewal', async () => {
    const warnSpy = spyOnLoggerWarn();
    const revokeToken = vi.fn(async () => undefined);
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });
    const replacement = await encryptSecret('reconnected-token', TEST_PROVIDER_KEY);
    const refreshGrant = vi.fn(async () => {
      await store.putProviderGrant(userId, 'notion', {
        ciphertext: replacement.ciphertext,
        iv: replacement.iv,
        refreshCiphertext: null,
        refreshIv: null,
        workspace: 'Other',
      });
      return { accessToken: TEST_REFRESHED_TOKEN, refreshToken: null, workspace: null };
    });
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('expired');
    });

    const res = await getItems(headers, stubNotionClient({ queryRows, refreshGrant, revokeToken }));
    const body = (await res.json()) as { code: string; detail: string };

    expect(res.status).toBe(503);
    expect(body.detail).toBe('Please retry.');
    expect(revokeToken).toHaveBeenCalledWith(TEST_REFRESHED_TOKEN);
    expect(warnSpy).toHaveBeenCalledWith(
      'Notion grant was replaced during renewal; revoked the new token',
      { userId }
    );
    await expect(storedNotionTokens(store, userId)).resolves.toEqual({
      accessToken: 'reconnected-token',
      refreshToken: null,
    });
  });

  it('never re-renews from a stale view: a token the row no longer holds cannot claim', async () => {
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });
    const refreshGrant = vi.fn(async () => {
      throw new Error('must not refresh with a token the row no longer holds');
    });
    const renewedElsewhere = await encryptSecret(TEST_REFRESHED_TOKEN, TEST_PROVIDER_KEY);
    const queryRows = vi.fn(async () => {
      const row = await store.getProviderConnection(userId, 'notion');
      if (row === null) {
        throw new Error('expected a stored grant');
      }
      await store.updateProviderTokens(
        userId,
        'notion',
        {
          ciphertext: renewedElsewhere.ciphertext,
          iv: renewedElsewhere.iv,
          refreshCiphertext: null,
          refreshIv: null,
        },
        row
      );
      throw new NotionAuthError('expired');
    });

    const res = await getItems(headers, stubNotionClient({ queryRows, refreshGrant }));

    expect(res.status).toBe(503);
    expect(refreshGrant).not.toHaveBeenCalled();
  });

  it('does not drop a grant a concurrent request already renewed', async () => {
    const { store, userId, headers } = await connectedNotionUser();
    const renewed = await encryptSecret(TEST_REFRESHED_TOKEN, TEST_PROVIDER_KEY);
    const queryRows = vi.fn(async () => {
      const row = await store.getProviderConnection(userId, 'notion');
      if (row === null) {
        throw new Error('expected a stored grant');
      }
      await store.updateProviderTokens(
        userId,
        'notion',
        {
          ciphertext: renewed.ciphertext,
          iv: renewed.iv,
          refreshCiphertext: null,
          refreshIv: null,
        },
        row
      );
      throw new NotionAuthError('expired');
    });
    const warnSpy = spyOnLoggerWarn();

    const res = await getItems(headers, stubNotionClient({ queryRows }));
    const body = (await res.json()) as { code: string; detail: string };

    expect(res.status).toBe(503);
    expect(body.code).toBe('upstream_unavailable');
    expect(body.detail).toBe('Please retry.');
    expect(warnSpy).toHaveBeenCalledWith(
      'Notion grant was renewed by a concurrent request; not dropping it',
      { userId }
    );
    await expect(storedNotionTokens(store, userId)).resolves.toMatchObject({
      accessToken: TEST_REFRESHED_TOKEN,
    });
  });

  it('revokes the token minted for a grant that was disconnected during renewal, and logs it', async () => {
    const warnSpy = spyOnLoggerWarn();
    const revokeToken = vi.fn(async () => undefined);
    const { headers, store, userId } = await connectedNotionUser({ withRefreshToken: true });
    const refreshGrant = vi.fn(async () => {
      await store.takeProviderConnection(userId, 'notion');
      return { accessToken: TEST_REFRESHED_TOKEN, refreshToken: null, workspace: null };
    });
    const queryRows = vi.fn(async () => {
      throw new NotionAuthError('expired');
    });

    const res = await getItems(headers, stubNotionClient({ queryRows, refreshGrant, revokeToken }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('provider_not_connected');
    expect(revokeToken).toHaveBeenCalledWith(TEST_REFRESHED_TOKEN);
    expect(warnSpy).toHaveBeenCalledWith(
      'Notion grant was disconnected during renewal; revoked the new token',
      { userId }
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

  it('rejects a page id that is not a Notion id, before anything reaches upstream', async () => {
    const getPropertySchemas = vi.fn(async () => checkboxSchema);
    const { headers } = await connectedNotionUser();

    const res = await app(stubNotionClient({ getPropertySchemas })).request(
      '/v1/integrations/notion/items/x%2F..%2F..%2Fusers',
      { method: 'PATCH', headers, body: JSON.stringify({ done: true }) },
      notionEnv()
    );

    expect(res.status).toBe(400);
    expect(getPropertySchemas).not.toHaveBeenCalled();
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

  it('answers not_found for a deleted page, without un-picking the table, and logs it', async () => {
    const warnSpy = spyOnLoggerWarn();
    const setCompletion = vi.fn(async () => {
      throw new NotionResourceError(404, 'page gone');
    });
    const { headers, store, userId } = await connectedNotionUser();

    const res = await patchDone(headers, true, stubNotionClient({ setCompletion }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('not_found');
    expect(warnSpy).toHaveBeenCalledWith('Notion refused the page write', {
      userId,
      reason: 'page gone',
    });
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      dataSourceId: TEST_DATA_SOURCE_ID,
    });
  });

  it('answers 503, not success, when the write itself hits an outage', async () => {
    const setCompletion = vi.fn(async () => {
      throw new NotionUnavailableError('down');
    });
    const { headers } = await connectedNotionUser();

    const res = await patchDone(headers, true, stubNotionClient({ setCompletion }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(503);
    expect(body.code).toBe('upstream_unavailable');
  });

  it('renews the grant and re-runs the write when the write is what 401s', async () => {
    const tokens: string[] = [];
    const setCompletion = vi.fn(async (token: string) => {
      tokens.push(token);
      if (tokens.length === 1) {
        throw new NotionAuthError('expired');
      }
    });
    const { headers } = await connectedNotionUser({ withRefreshToken: true });

    const res = await patchDone(headers, true, stubNotionClient({ setCompletion }));

    expect(res.status).toBe(204);
    expect(tokens).toEqual([TEST_ACCESS_TOKEN, TEST_REFRESHED_TOKEN]);
  });

  it('answers write_forbidden, keeping the table, when the user can read it but not edit it', async () => {
    const warnSpy = spyOnLoggerWarn();
    const setCompletion = vi.fn(async () => {
      throw new NotionResourceError(403, 'notion resource unreachable (403, restricted_resource)');
    });
    const { headers, store, userId } = await connectedNotionUser();

    const res = await patchDone(headers, true, stubNotionClient({ setCompletion }));
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(403);
    expect(body.code).toBe('provider_write_forbidden');
    expect(warnSpy).toHaveBeenCalledWith('Notion refused the page write', {
      userId,
      reason: 'notion resource unreachable (403, restricted_resource)',
    });
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      dataSourceId: TEST_DATA_SOURCE_ID,
    });
  });

  it('answers 500 and keeps the table when the write is refused as our configuration', async () => {
    const errorSpy = spyOnLoggerError();
    const setCompletion = vi.fn(async () => {
      throw new NotionConfigError('notion rejected our request (400, missing_version)');
    });
    const { headers, store, userId } = await connectedNotionUser();

    const res = await patchDone(headers, true, stubNotionClient({ setCompletion }));

    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledWith(
      'Notion rejected our client or request',
      expect.any(NotionConfigError),
      { userId }
    );
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      dataSourceId: TEST_DATA_SOURCE_ID,
    });
  });

  it('answers table_unavailable when the table itself is gone', async () => {
    const getPropertySchemas = vi.fn(async () => {
      throw new NotionResourceError(404, 'table gone');
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
