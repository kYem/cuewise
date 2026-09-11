import { describe, expect, it, vi } from 'vitest';
import {
  connectedNotionUser,
  notionEnv,
  signedInWithoutNotion,
  stubNotionClient,
  TEST_ACCESS_TOKEN,
} from '../__fixtures__/notion.fixtures';
import { signState } from '../crypto-utils';
import { createApp } from '../index';
import { NotionAuthError, NotionConfigError } from '../notion-client';

function app(client = stubNotionClient()) {
  return createApp({ notionClientFactory: () => client });
}

async function signedState(userId: string, returnUri = 'cuewise://auth') {
  return signState(
    { userId, returnUri, nonce: 'n-1' },
    notionEnv().STATE_SIGNING_KEY as unknown as string
  );
}

describe('GET /v1/integrations/notion/start', () => {
  it('401s without a session, so a state can never name an unproven account', async () => {
    const res = await app().request('/v1/integrations/notion/start', {}, notionEnv());

    expect(res.status).toBe(401);
  });

  it('refuses a return_uri outside the allowlist', async () => {
    const { headers } = await signedInWithoutNotion();

    const res = await app().request(
      '/v1/integrations/notion/start?return_uri=https://evil.test',
      { headers },
      notionEnv()
    );

    expect(res.status).toBe(400);
  });

  it('answers the authorize url as json rather than redirecting', async () => {
    const { headers } = await signedInWithoutNotion();

    const res = await app().request(
      '/v1/integrations/notion/start?return_uri=cuewise://auth',
      { headers },
      notionEnv()
    );
    const body = (await res.json()) as { authorizeUrl: string };

    expect(res.status).toBe(200);
    const url = new URL(body.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://api.notion.com/v1/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.example.test/v1/integrations/notion/callback'
    );
    expect(url.searchParams.get('state')).not.toBeNull();
  });

  it('never puts the session token in the authorize url', async () => {
    const { headers, token } = await signedInWithoutNotion();

    const res = await app().request(
      '/v1/integrations/notion/start?return_uri=cuewise://auth',
      { headers },
      notionEnv()
    );
    const body = (await res.json()) as { authorizeUrl: string };

    expect(body.authorizeUrl).not.toContain(token);
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

  it('stores the grant against the account named in the signed state', async () => {
    const { store, userId } = await signedInWithoutNotion();
    const state = await signedState(userId);

    const res = await app().request(
      `/v1/integrations/notion/callback?code=c&state=${encodeURIComponent(state)}`,
      {},
      notionEnv()
    );

    expect(res.status).toBe(200);
    const stored = await store.getProviderConnection(userId, 'notion');
    expect(stored?.workspace).toBe('Acme');
    // No table yet: choosing one is a separate step, because the token response names none.
    expect(stored?.dataSourceId).toBeNull();
  });

  it('stores the token encrypted, never in the clear', async () => {
    const { store, userId } = await signedInWithoutNotion();
    const state = await signedState(userId);

    await app().request(
      `/v1/integrations/notion/callback?code=c&state=${encodeURIComponent(state)}`,
      {},
      notionEnv()
    );

    const stored = await store.getProviderConnection(userId, 'notion');
    expect(stored?.ciphertext).not.toContain(TEST_ACCESS_TOKEN);
    expect(stored?.iv).not.toBe('');
  });

  it('returns through the deep link with no-store, since the page is credential-bearing', async () => {
    const { userId } = await signedInWithoutNotion();
    const state = await signedState(userId);

    const res = await app().request(
      `/v1/integrations/notion/callback?code=c&state=${encodeURIComponent(state)}`,
      {},
      notionEnv()
    );
    const html = await res.text();

    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(html).toContain('connected=notion');
  });

  it('relays a user cancel as access_denied rather than a failure', async () => {
    const { userId, store } = await signedInWithoutNotion();
    const state = await signedState(userId);

    const res = await app().request(
      `/v1/integrations/notion/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      {},
      notionEnv()
    );

    expect(await res.text()).toContain('error=access_denied');
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('relays a failed exchange to the app instead of stranding its pending flow', async () => {
    const exchangeCode = vi.fn(async () => {
      throw new NotionAuthError('bad code');
    });
    const { userId } = await signedInWithoutNotion();
    const state = await signedState(userId);

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
    const { userId } = await signedInWithoutNotion();
    const state = await signedState(userId);

    const res = await app(stubNotionClient({ exchangeCode })).request(
      `/v1/integrations/notion/callback?code=c&state=${encodeURIComponent(state)}`,
      {},
      notionEnv()
    );

    expect(await res.text()).toContain('error=server_error');
  });
});

describe('GET /v1/integrations/notion/tables', () => {
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
  it('rejects a body with no dataSourceId', async () => {
    const { headers } = await connectedNotionUser({ dataSourceId: null });

    const res = await app().request(
      '/v1/integrations/notion/selection',
      { method: 'PUT', headers, body: JSON.stringify({}) },
      notionEnv()
    );

    expect(res.status).toBe(400);
  });

  it('refuses a table with no usable completion property, naming the requirement', async () => {
    const getDataSource = vi.fn(async () => ({ Name: { type: 'title', title: [] } }));
    const { headers, store, userId } = await connectedNotionUser({ dataSourceId: null });

    const res = await app(stubNotionClient({ getDataSource })).request(
      '/v1/integrations/notion/selection',
      { method: 'PUT', headers, body: JSON.stringify({ dataSourceId: 'ds1' }) },
      notionEnv()
    );
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(422);
    expect(body.code).toBe('provider_schema_unusable');
    const stored = await store.getProviderConnection(userId, 'notion');
    expect(stored?.dataSourceId).toBeNull();
  });

  it('accepts a status property with a Complete group and remembers the table', async () => {
    const getDataSource = vi.fn(async () => ({
      Status: {
        type: 'status',
        status: {
          options: [{ id: 'o3', name: 'Shipped' }],
          groups: [{ id: 'g3', name: 'Complete', option_ids: ['o3'] }],
        },
      },
    }));
    const { headers, store, userId } = await connectedNotionUser({ dataSourceId: null });

    const res = await app(stubNotionClient({ getDataSource })).request(
      '/v1/integrations/notion/selection',
      { method: 'PUT', headers, body: JSON.stringify({ dataSourceId: 'ds9' }) },
      notionEnv()
    );

    await expect(res.json()).resolves.toEqual({ dataSourceId: 'ds9', completion: 'status' });
    const stored = await store.getProviderConnection(userId, 'notion');
    expect(stored?.dataSourceId).toBe('ds9');
  });

  it('accepts a Done checkbox as the simple case', async () => {
    const { headers } = await connectedNotionUser({ dataSourceId: null });

    const res = await app().request(
      '/v1/integrations/notion/selection',
      { method: 'PUT', headers, body: JSON.stringify({ dataSourceId: 'ds1' }) },
      notionEnv()
    );

    await expect(res.json()).resolves.toEqual({ dataSourceId: 'ds1', completion: 'checkbox' });
  });
});

describe('DELETE /v1/integrations/notion', () => {
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
    const { headers } = await connectedNotionUser();

    const res = await app(stubNotionClient({ revokeToken })).request(
      '/v1/integrations/notion',
      { method: 'DELETE', headers },
      notionEnv()
    );

    expect(res.status).toBe(204);
    expect(revokeToken).toHaveBeenCalledWith(TEST_ACCESS_TOKEN);
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

  it('drops the stored grant', async () => {
    const { headers, store, userId } = await connectedNotionUser();

    const res = await app().request(
      '/v1/integrations/notion',
      { method: 'DELETE', headers },
      notionEnv()
    );

    expect(res.status).toBe(204);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });
});
