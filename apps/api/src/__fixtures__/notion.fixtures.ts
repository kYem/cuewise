import { env } from 'cloudflare:test';
import { vi } from 'vitest';
import { encryptSecret } from '../crypto-utils';
import { D1SyncStore } from '../d1-store';
import type { NotionClient } from '../notion-client';
import { signedInToken } from './api-test-helpers.fixtures';

/** 43 base64url chars decode to the 32 bytes AES-GCM needs. */
export const TEST_PROVIDER_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
export const TEST_ACCESS_TOKEN = 'notion-access-token';

export function notionEnv(overrides: Record<string, string> = {}) {
  return {
    ...env,
    PROVIDER_TOKEN_KEY: TEST_PROVIDER_KEY,
    NOTION_CLIENT_ID: 'cid',
    NOTION_CLIENT_SECRET: 'csecret',
    STATE_SIGNING_KEY: 'notion-signing-key-for-tests',
    PUBLIC_BASE_URL: 'https://api.example.test',
    ALLOWED_RETURN_URIS: 'cuewise://auth',
    ...overrides,
  };
}

/** Every method stubbed so a test overrides only the call it is about. */
export function stubNotionClient(overrides: Partial<NotionClient> = {}): NotionClient {
  return {
    exchangeCode: vi.fn(async () => ({ accessToken: TEST_ACCESS_TOKEN, workspace: 'Acme' })),
    listDataSources: vi.fn(async () => [{ id: 'ds1', name: 'Tasks' }]),
    searchDataSources: vi.fn(async () => [{ id: 'ds1', name: 'Tasks' }]),
    getDataSource: vi.fn(async () => ({ Done: { id: 'p', type: 'checkbox', checkbox: {} } })),
    queryRows: vi.fn(async () => []),
    setCompletion: vi.fn(async () => undefined),
    ...overrides,
  };
}

interface ConnectedUser {
  store: D1SyncStore;
  userId: string;
  token: string;
  headers: Record<string, string>;
}

/**
 * A signed-in account with a stored Notion grant. `dataSourceId: null` models the state between
 * the callback landing and the user picking a table.
 */
export async function connectedNotionUser(
  options: { dataSourceId?: string | null } = {}
): Promise<ConnectedUser> {
  const store = new D1SyncStore(env.DB);
  const { token, userId } = await signedInToken(store);
  const sealed = await encryptSecret(TEST_ACCESS_TOKEN, TEST_PROVIDER_KEY);
  await store.putProviderConnection(userId, {
    provider: 'notion',
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    workspace: 'Acme',
    databaseId: null,
    dataSourceId: options.dataSourceId === undefined ? 'ds1' : options.dataSourceId,
  });
  return {
    store,
    userId,
    token,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
}

/** A signed-in account with no grant at all. */
export async function signedInWithoutNotion(): Promise<ConnectedUser> {
  const store = new D1SyncStore(env.DB);
  const { token, userId } = await signedInToken(store);
  return {
    store,
    userId,
    token,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
}
