import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { clockedStore, newUser } from './__fixtures__/api-test-helpers.fixtures';
import { D1SyncStore } from './d1-store';
import type { ProviderConnection, SealedGrant } from './store';

const REFRESH_PAIR = { refreshCiphertext: 'r-ct', refreshIv: 'r-iv' };

function grant(overrides: Partial<SealedGrant> = {}): SealedGrant {
  return {
    ciphertext: 'ct',
    iv: 'iv',
    refreshCiphertext: null,
    refreshIv: null,
    workspace: 'Acme',
    ...overrides,
  };
}

function connection(overrides: Partial<ProviderConnection> = {}): ProviderConnection {
  return { provider: 'notion', ...grant(), dataSourceId: null, ...overrides };
}

describe('provider connections', () => {
  let store: D1SyncStore;
  let userId: string;

  beforeEach(async () => {
    store = new D1SyncStore(env.DB);
    userId = await newUser(store, 'provider-tokens-user');
  });

  it('answers null before anything is stored', async () => {
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('putProviderGrant creates a connection with no table chosen', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toEqual(
      connection(REFRESH_PAIR)
    );
  });

  it('keeps the nullable columns null rather than coercing them to strings', async () => {
    await store.putProviderGrant(userId, 'notion', grant({ workspace: null }));

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toEqual(
      connection({ workspace: null })
    );
  });

  it('putProviderGrant replaces the tokens but keeps the chosen table, in one statement', async () => {
    await store.putProviderGrant(userId, 'notion', grant());
    await store.setProviderDataSource(userId, 'notion', 'ds-kept');

    await store.putProviderGrant(
      userId,
      'notion',
      grant({ ciphertext: 'ct-2', iv: 'iv-2', workspace: 'Renamed' })
    );

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toEqual(
      connection({ ciphertext: 'ct-2', iv: 'iv-2', workspace: 'Renamed', dataSourceId: 'ds-kept' })
    );
  });

  it('scopes reads to the owning user, so another account cannot see the grant', async () => {
    const other = await newUser(store, 'provider-tokens-other');
    await store.putProviderGrant(userId, 'notion', grant());

    await expect(store.getProviderConnection(other, 'notion')).resolves.toBeNull();
  });

  it('keeps providers independent', async () => {
    await store.putProviderGrant(userId, 'notion', grant());

    await expect(store.getProviderConnection(userId, 'outlook')).resolves.toBeNull();
  });

  it('deletes one connection', async () => {
    await store.putProviderGrant(userId, 'notion', grant());
    await store.deleteProviderConnection(userId, 'notion');

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('treats deleting an absent connection as a no-op', async () => {
    await expect(store.deleteProviderConnection(userId, 'notion')).resolves.toBeUndefined();
  });

  it('takes the connection with the account, so a delete leaves no grant behind', async () => {
    await store.putProviderGrant(userId, 'notion', grant());
    await store.deleteUser(userId);

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('updateProviderTokens replaces the access pair and keeps a refresh pair the renewal omitted', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));
    await store.setProviderDataSource(userId, 'notion', 'ds1');

    await store.updateProviderTokens(userId, 'notion', {
      ciphertext: 'ct-2',
      iv: 'iv-2',
      refreshCiphertext: null,
      refreshIv: null,
    });

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toEqual(
      connection({ ...REFRESH_PAIR, ciphertext: 'ct-2', iv: 'iv-2', dataSourceId: 'ds1' })
    );
  });

  it('updateProviderTokens rotates the refresh pair when the renewal carried one', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));

    await store.updateProviderTokens(userId, 'notion', {
      ciphertext: 'ct-2',
      iv: 'iv-2',
      refreshCiphertext: 'r-ct-2',
      refreshIv: 'r-iv-2',
    });

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      refreshCiphertext: 'r-ct-2',
      refreshIv: 'r-iv-2',
    });
  });

  it('setProviderDataSource touches only the selection, never the tokens', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));

    await store.setProviderDataSource(userId, 'notion', 'ds9');

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toEqual(
      connection({ ...REFRESH_PAIR, dataSourceId: 'ds9' })
    );
  });

  it('narrow writers answer false for an account with no grant, and write nothing', async () => {
    await expect(store.setProviderDataSource(userId, 'notion', 'ds1')).resolves.toBe(false);
    await expect(
      store.updateProviderTokens(userId, 'notion', {
        ciphertext: 'ct',
        iv: 'iv',
        refreshCiphertext: null,
        refreshIv: null,
      })
    ).resolves.toBe(false);

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('narrow writers answer true when a row was touched', async () => {
    await store.putProviderGrant(userId, 'notion', grant());

    await expect(store.setProviderDataSource(userId, 'notion', 'ds9')).resolves.toBe(true);
  });

  it('stamps created_at from the injected clock, not wall time', async () => {
    const { store: clocked } = clockedStore(1_700_000_000_000);
    const clockedUser = await newUser(clocked, 'provider-tokens-clocked');
    await clocked.putProviderGrant(clockedUser, 'notion', grant());

    const row = await env.DB.prepare(
      'SELECT created_at FROM provider_tokens WHERE user_id = ? AND provider = ?'
    )
      .bind(clockedUser, 'notion')
      .first<{ created_at: number }>();

    expect(row?.created_at).toBe(1_700_000_000_000);
  });
});
