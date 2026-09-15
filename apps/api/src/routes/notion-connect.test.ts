import { describe, expect, it, vi } from 'vitest';
import {
  asSchemas,
  connectedNotionUser,
  notionEnv,
  signedInWithoutNotion,
  statusSchema,
  stubNotionClient,
  TEST_ACCESS_TOKEN,
  TEST_CODE_VERIFIER,
  TEST_DATA_SOURCE_ID,
  TEST_PROVIDER_KEY,
  TEST_REFRESH_TOKEN,
  TEST_REFRESHED_TOKEN,
  testCodeChallenge,
} from '../__fixtures__/notion.fixtures';
import { base64UrlDecodeString, decryptSecret, signState } from '../crypto-utils';
import { createApp } from '../index';
import { NotionAuthError, NotionConfigError } from '../notion-client';

function app(client = stubNotionClient()) {
  return createApp({ notionClientFactory: () => client });
}

async function signedState(returnUri = 'cuewise://auth') {
  return signState(
    { returnUri, codeChallenge: await testCodeChallenge(), nonce: 'n-1' },
    notionEnv().STATE_SIGNING_KEY as unknown as string
  );
}

/** Runs the callback and pulls the one-time code off the interstitial's deep link. */
async function parkedCode(client = stubNotionClient(), returnUri?: string): Promise<string> {
  const state = await signedState(returnUri);
  const res = await app(client).request(
    `/v1/integrations/notion/callback?code=c&state=${encodeURIComponent(state)}`,
    {},
    notionEnv()
  );
  const html = await res.text();
  const match = html.match(/location\.replace\((".*?")\);/);
  if (match === null) {
    throw new Error('expected a deep link in the interstitial');
  }
  const code = new URL(JSON.parse(match[1])).searchParams.get('code');
  if (code === null) {
    throw new Error(`expected a one-time code on the deep link, got ${html.slice(0, 200)}`);
  }
  return code;
}

function claim(code: string, headers: Record<string, string>, codeVerifier = TEST_CODE_VERIFIER) {
  return app().request(
    '/v1/integrations/notion/claim',
    { method: 'POST', headers, body: JSON.stringify({ code, codeVerifier }) },
    notionEnv()
  );
}

describe('GET /v1/integrations/notion/start', () => {
  it('401s without a session', async () => {
    const res = await app().request('/v1/integrations/notion/start', {}, notionEnv());

    expect(res.status).toBe(401);
  });

  it('refuses a return_uri outside the allowlist', async () => {
    const { headers } = await signedInWithoutNotion();

    const res = await app().request(
      `/v1/integrations/notion/start?return_uri=https://evil.test&code_challenge=${await testCodeChallenge()}`,
      { headers },
      notionEnv()
    );

    expect(res.status).toBe(400);
  });

  it('refuses a malformed code_challenge', async () => {
    const { headers } = await signedInWithoutNotion();

    const res = await app().request(
      '/v1/integrations/notion/start?return_uri=cuewise://auth&code_challenge=short',
      { headers },
      notionEnv()
    );

    expect(res.status).toBe(400);
  });

  it('answers the authorize url as json, with a state that names no account', async () => {
    const { headers, userId } = await signedInWithoutNotion();

    const res = await app().request(
      `/v1/integrations/notion/start?return_uri=cuewise://auth&code_challenge=${await testCodeChallenge()}`,
      { headers },
      notionEnv()
    );
    const body = (await res.json()) as { authorizeUrl: string };

    expect(res.status).toBe(200);
    const url = new URL(body.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://api.notion.com/v1/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.example.test/v1/integrations/notion/callback'
    );
    const state = url.searchParams.get('state') ?? '';
    const decoded = JSON.parse(base64UrlDecodeString(state.split('.')[0])) as Record<
      string,
      unknown
    >;
    // The account is decided at /claim by a session, so a leaked link can never name one.
    expect(decoded).not.toHaveProperty('userId');
    expect(JSON.stringify(decoded)).not.toContain(userId);
  });

  it('fails closed when the integration is not configured', async () => {
    const { headers } = await signedInWithoutNotion();

    const res = await app().request(
      `/v1/integrations/notion/start?return_uri=cuewise://auth&code_challenge=${await testCodeChallenge()}`,
      { headers },
      notionEnv({ NOTION_CLIENT_ID: '' })
    );

    expect(res.status).toBe(500);
  });
});

describe('GET /v1/integrations/notion/callback', () => {
  it('refuses a forged state without exchanging the code', async () => {
    const exchangeCode = vi.fn(async () => ({
      accessToken: 'tok',
      refreshToken: null,
      workspace: null,
    }));

    const res = await app(stubNotionClient({ exchangeCode })).request(
      '/v1/integrations/notion/callback?code=c&state=forged',
      {},
      notionEnv()
    );

    expect(res.status).toBe(400);
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it('requires a state at all', async () => {
    const res = await app().request('/v1/integrations/notion/callback?code=c', {}, notionEnv());

    expect(res.status).toBe(400);
  });

  it('re-checks the allowlist, so tightening it retires states minted before', async () => {
    const state = await signedState('cuewise://auth');

    const res = await app().request(
      `/v1/integrations/notion/callback?code=c&state=${encodeURIComponent(state)}`,
      {},
      notionEnv({ ALLOWED_RETURN_URIS: 'cuewise://other' })
    );

    expect(res.status).toBe(400);
  });

  it('parks the grant behind a one-time code and stores nothing against any account', async () => {
    const { store, userId } = await signedInWithoutNotion();

    const code = await parkedCode();

    expect(code).not.toBe('');
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('returns through the deep link with no-store, since the page carries the code', async () => {
    const state = await signedState();

    const res = await app().request(
      `/v1/integrations/notion/callback?code=c&state=${encodeURIComponent(state)}`,
      {},
      notionEnv()
    );

    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toContain('code=');
  });

  it('relays a user cancel as access_denied', async () => {
    const state = await signedState();

    const res = await app().request(
      `/v1/integrations/notion/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      {},
      notionEnv()
    );

    expect(await res.text()).toContain('error=access_denied');
  });

  it('relays any other authorize error as ours, not as a cancel', async () => {
    const state = await signedState();

    const res = await app().request(
      `/v1/integrations/notion/callback?error=invalid_request&state=${encodeURIComponent(state)}`,
      {},
      notionEnv()
    );

    expect(await res.text()).toContain('error=server_error');
  });

  it('relays a failed exchange to the app instead of stranding its pending flow', async () => {
    const exchangeCode = vi.fn(async () => {
      throw new NotionAuthError('bad code');
    });
    const state = await signedState();

    const res = await app(stubNotionClient({ exchangeCode })).request(
      `/v1/integrations/notion/callback?code=c&state=${encodeURIComponent(state)}`,
      {},
      notionEnv()
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('error=connect_failed');
  });

  it('distinguishes our own misconfiguration from a bad code', async () => {
    const exchangeCode = vi.fn(async () => {
      throw new NotionConfigError('invalid_client');
    });
    const state = await signedState();

    const res = await app(stubNotionClient({ exchangeCode })).request(
      `/v1/integrations/notion/callback?code=c&state=${encodeURIComponent(state)}`,
      {},
      notionEnv()
    );

    expect(await res.text()).toContain('error=server_error');
  });
});

describe('POST /v1/integrations/notion/claim', () => {
  it('401s without a session', async () => {
    const res = await app().request(
      '/v1/integrations/notion/claim',
      { method: 'POST', body: JSON.stringify({ code: 'c', codeVerifier: TEST_CODE_VERIFIER }) },
      notionEnv()
    );

    expect(res.status).toBe(401);
  });

  it('rejects a malformed verifier before the code is ever looked up', async () => {
    const { headers } = await signedInWithoutNotion();
    const code = await parkedCode();

    const res = await claim(code, headers, 'short');

    expect(res.status).toBe(400);
    // The code survives a malformed request, so a typo does not burn it.
    await expect(claim(code, headers)).resolves.toMatchObject({ status: 200 });
  });

  it('binds the grant to the session that claims it — the account is never in the link', async () => {
    // A second account exists so "landed somewhere" and "landed on the claimer" differ.
    const bystander = await signedInWithoutNotion();
    const { headers, store, userId } = await signedInWithoutNotion();
    const code = await parkedCode();

    const res = await claim(code, headers);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ workspace: 'Acme' });
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      workspace: 'Acme',
      dataSourceId: null,
    });
    await expect(
      bystander.store.getProviderConnection(bystander.userId, 'notion')
    ).resolves.toBeNull();
  });

  it('rejects an empty code before looking anything up', async () => {
    const { headers } = await signedInWithoutNotion();

    const res = await claim('', headers);
    const body = (await res.json()) as { errors: Array<{ pointer: string }> };

    expect(res.status).toBe(400);
    expect(body.errors[0]?.pointer).toBe('/code');
  });

  it('rejects a body that is not json', async () => {
    const { headers } = await signedInWithoutNotion();

    const res = await app().request(
      '/v1/integrations/notion/claim',
      { method: 'POST', headers, body: 'not json' },
      notionEnv()
    );

    expect(res.status).toBe(400);
  });

  it('revokes and reports when the grant cannot be saved after the code is burned', async () => {
    const revokeToken = vi.fn(async () => undefined);
    const { headers, store, userId } = await signedInWithoutNotion();
    const code = await parkedCode(stubNotionClient({ revokeToken }));
    const failing = new Proxy(store, {
      get(target, key) {
        if (key === 'putProviderGrant') {
          return async () => {
            throw new Error('D1 write failed');
          };
        }
        return Reflect.get(target, key);
      },
    });

    const res = await createApp({
      notionClientFactory: () => stubNotionClient({ revokeToken }),
      storeFactory: () => failing,
    }).request(
      '/v1/integrations/notion/claim',
      { method: 'POST', headers, body: JSON.stringify({ code, codeVerifier: TEST_CODE_VERIFIER }) },
      notionEnv()
    );
    const body = (await res.json()) as { detail: string };

    expect(res.status).toBe(500);
    expect(body.detail).toContain('connect again');
    expect(revokeToken).toHaveBeenCalledWith(TEST_ACCESS_TOKEN);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('stores both tokens encrypted, and the refresh token really is there', async () => {
    const { headers, store, userId } = await signedInWithoutNotion();
    const code = await parkedCode();

    await claim(code, headers);

    const stored = await store.getProviderConnection(userId, 'notion');
    if (stored === null || stored.refreshCiphertext === null || stored.refreshIv === null) {
      throw new Error('expected a stored grant with a refresh token');
    }
    expect(stored.ciphertext).not.toContain(TEST_ACCESS_TOKEN);
    await expect(decryptSecret(stored.ciphertext, stored.iv, TEST_PROVIDER_KEY)).resolves.toBe(
      TEST_ACCESS_TOKEN
    );
    await expect(
      decryptSecret(stored.refreshCiphertext, stored.refreshIv, TEST_PROVIDER_KEY)
    ).resolves.toBe(TEST_REFRESH_TOKEN);
  });

  it('is single-use: a second claim fails and cannot land the grant on another account', async () => {
    const first = await signedInWithoutNotion();
    const second = await signedInWithoutNotion();
    const code = await parkedCode();

    await claim(code, first.headers);
    const replay = await claim(code, second.headers);

    expect(replay.status).toBe(401);
    await expect(second.store.getProviderConnection(second.userId, 'notion')).resolves.toBeNull();
  });

  it('burns the code on a wrong verifier, failing closed', async () => {
    const { headers, store, userId } = await signedInWithoutNotion();
    const code = await parkedCode();

    const wrong = await claim(code, headers, `${TEST_CODE_VERIFIER.slice(0, -1)}X`);
    const retry = await claim(code, headers);

    expect(wrong.status).toBe(401);
    expect(retry.status).toBe(401);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('refuses a sign-in code presented as a grant', async () => {
    const { headers, store } = await signedInWithoutNotion();
    const signInCode = await store.mintAuthCode(
      { provider: 'google', providerSub: 'g-1' },
      await testCodeChallenge()
    );

    const res = await claim(signInCode, headers);

    expect(res.status).toBe(401);
  });

  it('keeps the chosen table across a reconnect, and replaces the tokens', async () => {
    const { headers, store, userId } = await connectedNotionUser();
    const before = await store.getProviderConnection(userId, 'notion');
    const code = await parkedCode();

    await claim(code, headers);

    const after = await store.getProviderConnection(userId, 'notion');
    expect(after?.dataSourceId).toBe(TEST_DATA_SOURCE_ID);
    expect(after?.ciphertext).not.toBe(before?.ciphertext);
  });

  it('keeps a selection made while the reconnect was in flight', async () => {
    const { headers, store, userId } = await connectedNotionUser({ dataSourceId: null });
    const code = await parkedCode();
    await store.setProviderDataSource(userId, 'notion', TEST_DATA_SOURCE_ID);

    await claim(code, headers);

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      dataSourceId: TEST_DATA_SOURCE_ID,
    });
  });
});

describe('a parked grant cannot be redeemed as a sign-in', () => {
  it('POST /v1/auth/token refuses it', async () => {
    const code = await parkedCode();

    const res = await app().request(
      '/v1/auth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          credential: code,
          codeVerifier: TEST_CODE_VERIFIER,
          deviceName: 'attacker',
        }),
      },
      notionEnv()
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /v1/integrations/notion/tables', () => {
  it('401s without a session', async () => {
    const res = await app().request('/v1/integrations/notion/tables', {}, notionEnv());

    expect(res.status).toBe(401);
  });

  it('404s when the account has no grant', async () => {
    const { headers } = await signedInWithoutNotion();

    const res = await app().request('/v1/integrations/notion/tables', { headers }, notionEnv());
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe('provider_not_connected');
  });

  it('lists the tables the user shared, using the decrypted grant', async () => {
    const searchDataSources = vi.fn(async () => [
      { id: 'ds1', name: 'Tasks' },
      { id: 'ds2', name: 'Reading' },
    ]);
    const { headers } = await connectedNotionUser({ dataSourceId: null });

    const res = await app(stubNotionClient({ searchDataSources })).request(
      '/v1/integrations/notion/tables',
      { headers },
      notionEnv()
    );

    await expect(res.json()).resolves.toEqual({
      workspace: 'Acme',
      tables: [
        { id: 'ds1', name: 'Tasks' },
        { id: 'ds2', name: 'Reading' },
      ],
    });
    expect(searchDataSources).toHaveBeenCalledWith(TEST_ACCESS_TOKEN);
  });
});

describe('PUT /v1/integrations/notion/selection', () => {
  function select(
    headers: Record<string, string>,
    dataSourceId: unknown,
    client?: ReturnType<typeof stubNotionClient>
  ) {
    return app(client).request(
      '/v1/integrations/notion/selection',
      { method: 'PUT', headers, body: JSON.stringify({ dataSourceId }) },
      notionEnv()
    );
  }

  it('401s without a session', async () => {
    const res = await app().request(
      '/v1/integrations/notion/selection',
      { method: 'PUT', body: JSON.stringify({ dataSourceId: TEST_DATA_SOURCE_ID }) },
      notionEnv()
    );

    expect(res.status).toBe(401);
  });

  it('rejects anything that is not a Notion id, so nothing odd reaches an upstream path', async () => {
    const { headers } = await connectedNotionUser({ dataSourceId: null });

    expect((await select(headers, 'x/../../users')).status).toBe(400);
    expect((await select(headers, '')).status).toBe(400);
  });

  it('refuses a table with no usable completion property, naming the requirement', async () => {
    const getPropertySchemas = vi.fn(async () => asSchemas({ Name: { type: 'title', title: [] } }));
    const { headers, store, userId } = await connectedNotionUser({ dataSourceId: null });

    const res = await select(
      headers,
      TEST_DATA_SOURCE_ID,
      stubNotionClient({ getPropertySchemas })
    );
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(422);
    expect(body.code).toBe('provider_schema_unusable');
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      dataSourceId: null,
    });
  });

  it('accepts a status property with a Complete group and remembers the table', async () => {
    const getPropertySchemas = vi.fn(async () => statusSchema);
    const { headers, store, userId } = await connectedNotionUser({ dataSourceId: null });

    const res = await select(
      headers,
      TEST_DATA_SOURCE_ID,
      stubNotionClient({ getPropertySchemas })
    );

    await expect(res.json()).resolves.toEqual({
      dataSourceId: TEST_DATA_SOURCE_ID,
      completion: 'status',
    });
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      dataSourceId: TEST_DATA_SOURCE_ID,
    });
  });

  it('keeps a grant renewed mid-request, rather than writing the expired one back', async () => {
    let attempt = 0;
    const getPropertySchemas = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new NotionAuthError('expired');
      }
      return statusSchema;
    });
    const { headers, store, userId } = await connectedNotionUser({
      dataSourceId: null,
      withRefreshToken: true,
    });

    const res = await select(
      headers,
      TEST_DATA_SOURCE_ID,
      stubNotionClient({ getPropertySchemas })
    );

    expect(res.status).toBe(200);
    const stored = await store.getProviderConnection(userId, 'notion');
    if (stored === null) {
      throw new Error('expected the grant to survive');
    }
    await expect(decryptSecret(stored.ciphertext, stored.iv, TEST_PROVIDER_KEY)).resolves.toBe(
      TEST_REFRESHED_TOKEN
    );
    expect(stored.dataSourceId).toBe(TEST_DATA_SOURCE_ID);
  });

  it('answers not_connected, not success, when the grant vanished mid-request', async () => {
    const { headers, store, userId } = await connectedNotionUser({ dataSourceId: null });
    const getPropertySchemas = vi.fn(async () => {
      await store.deleteProviderConnection(userId, 'notion');
      return statusSchema;
    });

    const res = await select(
      headers,
      TEST_DATA_SOURCE_ID,
      stubNotionClient({ getPropertySchemas })
    );

    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/integrations/notion', () => {
  it('401s without a session', async () => {
    const res = await app().request('/v1/integrations/notion', { method: 'DELETE' }, notionEnv());

    expect(res.status).toBe(401);
  });

  it('404s when nothing is connected', async () => {
    const { headers } = await signedInWithoutNotion();

    const res = await app().request(
      '/v1/integrations/notion',
      { method: 'DELETE', headers },
      notionEnv()
    );

    expect(res.status).toBe(404);
  });

  it('revokes at notion as well as dropping our copy', async () => {
    const revokeToken = vi.fn(async () => undefined);
    const { headers, store, userId } = await connectedNotionUser();

    const res = await app(stubNotionClient({ revokeToken })).request(
      '/v1/integrations/notion',
      { method: 'DELETE', headers },
      notionEnv()
    );

    expect(res.status).toBe(204);
    expect(revokeToken).toHaveBeenCalledWith(TEST_ACCESS_TOKEN);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('still disconnects when revocation fails, so notion being down cannot trap the user', async () => {
    const revokeToken = vi.fn(async () => {
      throw new Error('notion unreachable');
    });
    const { headers, store, userId } = await connectedNotionUser();

    const res = await app(stubNotionClient({ revokeToken })).request(
      '/v1/integrations/notion',
      { method: 'DELETE', headers },
      notionEnv()
    );

    expect(res.status).toBe(204);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('still disconnects when the stored token cannot be decrypted', async () => {
    const { headers, store, userId } = await connectedNotionUser();

    const res = await app().request(
      '/v1/integrations/notion',
      { method: 'DELETE', headers },
      notionEnv({ PROVIDER_TOKEN_KEY: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' })
    );

    expect(res.status).toBe(204);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });
});
