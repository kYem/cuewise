import { env } from 'cloudflare:test';
import { vi } from 'vitest';
import { encryptSecret, sha256Base64Url } from '../crypto-utils';
import { D1SyncStore } from '../d1-store';
import type { NotionClient } from '../notion-client';
import type { PropertySchemas } from '../notion-schema';
import { signedInToken } from './api-test-helpers.fixtures';

/** 43 base64url chars decode to the 32 bytes AES-GCM needs. */
export const TEST_PROVIDER_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
export const TEST_ACCESS_TOKEN = 'notion-access-token';
export const TEST_REFRESH_TOKEN = 'notion-refresh-token';
export const TEST_REFRESHED_TOKEN = 'notion-access-token-v2';
export const TEST_ROTATED_REFRESH_TOKEN = 'notion-refresh-token-v2';
export const TEST_DATA_SOURCE_ID = '3f9a855f-8bd8-4d4c-a3a4-caf40bac8df2';
export const TEST_PAGE_ID = '6bcd9e9c72457244f19ab98fb56fdbfa';
// 43 unreserved chars, the minimum RFC 7636 accepts.
export const TEST_CODE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

export const checkboxSchema = {
  Done: { id: 'p', type: 'checkbox', checkbox: {} },
} as unknown as PropertySchemas;

export const statusSchema = {
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
} as unknown as PropertySchemas;

export function asSchemas(value: Record<string, unknown>): PropertySchemas {
  return value as PropertySchemas;
}

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

export async function testCodeChallenge(): Promise<string> {
  return sha256Base64Url(TEST_CODE_VERIFIER);
}

/**
 * Every method stubbed so a test overrides only the call it is about. The refresh stub answers
 * `workspace: null`, as the real API does — the route's fallback to the stored name is then
 * exercised by every renewal test rather than hidden by a generous stub.
 */
export function stubNotionClient(overrides: Partial<NotionClient> = {}): NotionClient {
  return {
    exchangeCode: vi.fn(async () => ({
      accessToken: TEST_ACCESS_TOKEN,
      refreshToken: TEST_REFRESH_TOKEN,
      workspace: 'Acme',
    })),
    refreshGrant: vi.fn(async () => ({
      accessToken: TEST_REFRESHED_TOKEN,
      refreshToken: TEST_ROTATED_REFRESH_TOKEN,
      workspace: null,
    })),
    revokeToken: vi.fn(async () => undefined),
    searchDataSources: vi.fn(async () => [{ id: TEST_DATA_SOURCE_ID, name: 'Tasks' }]),
    getPropertySchemas: vi.fn(async () => checkboxSchema),
    queryRows: vi.fn(async () => ({ items: [], truncated: false })),
    setCompletion: vi.fn(async () => undefined),
    ...overrides,
  };
}

export interface ConnectedUser {
  store: D1SyncStore;
  userId: string;
  token: string;
  headers: Record<string, string>;
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

/**
 * A signed-in account with a stored Notion grant. `dataSourceId: null` models the state between
 * claiming the grant and picking a table.
 */
export async function connectedNotionUser(
  options: { dataSourceId?: string | null; withRefreshToken?: boolean } = {}
): Promise<ConnectedUser> {
  const user = await signedInWithoutNotion();
  const sealed = await encryptSecret(TEST_ACCESS_TOKEN, TEST_PROVIDER_KEY);
  const refresh =
    options.withRefreshToken === true
      ? await encryptSecret(TEST_REFRESH_TOKEN, TEST_PROVIDER_KEY)
      : null;
  await user.store.putProviderConnection(user.userId, {
    provider: 'notion',
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    refreshCiphertext: refresh === null ? null : refresh.ciphertext,
    refreshIv: refresh === null ? null : refresh.iv,
    workspace: 'Acme',
    dataSourceId: options.dataSourceId === undefined ? TEST_DATA_SOURCE_ID : options.dataSourceId,
  });
  return user;
}
