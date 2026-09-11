import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { clockedStore, newUser } from './__fixtures__/api-test-helpers.fixtures';
import { D1SyncStore } from './d1-store';

function connection(overrides: Partial<Parameters<D1SyncStore['putProviderConnection']>[1]> = {}) {
  return {
    provider: 'notion',
    ciphertext: 'ct',
    iv: 'iv',
    workspace: 'Acme',
    databaseId: 'db1',
    dataSourceId: 'ds1',
    ...overrides,
  };
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

  it('round-trips a connection', async () => {
    await store.putProviderConnection(userId, connection());

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toEqual(connection());
  });

  it('keeps the nullable columns null rather than coercing them to strings', async () => {
    await store.putProviderConnection(
      userId,
      connection({ workspace: null, databaseId: null, dataSourceId: null })
    );

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toEqual(
      connection({ workspace: null, databaseId: null, dataSourceId: null })
    );
  });

  it('replaces on reconnect instead of erroring on the primary key', async () => {
    await store.putProviderConnection(userId, connection({ ciphertext: 'first' }));
    await store.putProviderConnection(
      userId,
      connection({ ciphertext: 'second', workspace: 'New' })
    );

    const found = await store.getProviderConnection(userId, 'notion');

    expect(found?.ciphertext).toBe('second');
    expect(found?.workspace).toBe('New');
  });

  it('scopes reads to the owning user, so another account cannot see the grant', async () => {
    const other = await newUser(store, 'provider-tokens-other');
    await store.putProviderConnection(userId, connection());

    await expect(store.getProviderConnection(other, 'notion')).resolves.toBeNull();
  });

  it('keeps providers independent', async () => {
    await store.putProviderConnection(userId, connection());

    await expect(store.getProviderConnection(userId, 'outlook')).resolves.toBeNull();
  });

  it('deletes one connection', async () => {
    await store.putProviderConnection(userId, connection());
    await store.deleteProviderConnection(userId, 'notion');

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('treats deleting an absent connection as a no-op', async () => {
    await expect(store.deleteProviderConnection(userId, 'notion')).resolves.toBeUndefined();
  });

  it('takes the connection with the account, so a delete leaves no grant behind', async () => {
    await store.putProviderConnection(userId, connection());
    await store.deleteUser(userId);

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('stamps created_at from the injected clock, not wall time', async () => {
    const { store: clocked } = clockedStore(1_700_000_000_000);
    const clockedUser = await newUser(clocked, 'provider-tokens-clocked');
    await clocked.putProviderConnection(clockedUser, connection());

    const row = await env.DB.prepare(
      'SELECT created_at FROM provider_tokens WHERE user_id = ? AND provider = ?'
    )
      .bind(clockedUser, 'notion')
      .first<{ created_at: number }>();

    expect(row?.created_at).toBe(1_700_000_000_000);
  });
});
