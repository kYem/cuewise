import { env } from 'cloudflare:test';
import { vi } from 'vitest';
import { decryptSecret, encryptSecret, sha256Base64Url } from '../crypto-utils';
import { D1SyncStore } from '../d1-store';
import type { NotionClient } from '../notion-client';
import type { PropertySchemas } from '../notion-schema';
import type { AuthCodePayload, SealedGrant, SyncStore } from '../store';
import { signedInToken } from './api-test-helpers.fixtures';

/** 43 base64url chars decode to the 32 bytes AES-GCM needs. */
export const TEST_PROVIDER_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
export const TEST_STATE_SIGNING_KEY = 'notion-signing-key-for-tests';
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

/** No completion property at all: what a table looks like after the user removed it. */
export const titleOnlySchema = asSchemas({ Name: { type: 'title', title: [] } });

/** A status property with a Complete group but no To-do group, so "not done" has nowhere to go. */
export const noTodoStatusSchema = asSchemas({
  Status: {
    type: 'status',
    status: {
      options: [{ id: 'o3', name: 'Shipped' }],
      groups: [{ id: 'g3', name: 'Complete', option_ids: ['o3'] }],
    },
  },
});

export function notionEnv(overrides: Record<string, string> = {}): typeof env {
  return {
    ...env,
    PROVIDER_TOKEN_KEY: TEST_PROVIDER_KEY,
    NOTION_CLIENT_ID: 'cid',
    NOTION_CLIENT_SECRET: 'csecret',
    STATE_SIGNING_KEY: TEST_STATE_SIGNING_KEY,
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
 * `workspace: null`, as the real API does.
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
  await user.store.putProviderGrant(user.userId, 'notion', {
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    refreshCiphertext: refresh === null ? null : refresh.ciphertext,
    refreshIv: refresh === null ? null : refresh.iv,
    workspace: 'Acme',
  });
  const dataSourceId =
    options.dataSourceId === undefined ? TEST_DATA_SOURCE_ID : options.dataSourceId;
  if (dataSourceId !== null) {
    await user.store.setProviderDataSource(user.userId, 'notion', dataSourceId);
  }
  return user;
}

export interface StoredNotionTokens {
  accessToken: string;
  refreshToken: string | null;
}

/** The stored grant, decrypted under the test key; throws when the account holds none. */
export async function storedNotionTokens(
  store: SyncStore,
  userId: string
): Promise<StoredNotionTokens> {
  const stored = await store.getProviderConnection(userId, 'notion');
  if (stored === null) {
    throw new Error('expected a stored Notion grant');
  }
  const accessToken = await decryptSecret(stored.ciphertext, stored.iv, TEST_PROVIDER_KEY);
  if (stored.refreshCiphertext === null || stored.refreshIv === null) {
    return { accessToken, refreshToken: null };
  }
  const refreshToken = await decryptSecret(
    stored.refreshCiphertext,
    stored.refreshIv,
    TEST_PROVIDER_KEY
  );
  return { accessToken, refreshToken };
}

type FailingWrite = 'mintAuthCode' | 'putProviderGrant';

/** A real store whose one named write throws, so a route's cleanup path runs against real rows. */
export class FailingWriteStore extends D1SyncStore {
  private readonly failing: FailingWrite;

  constructor(failing: FailingWrite) {
    super(env.DB);
    this.failing = failing;
  }

  override async mintAuthCode(payload: AuthCodePayload, codeChallenge: string): Promise<string> {
    if (this.failing === 'mintAuthCode') {
      throw new Error('D1 write failed');
    }
    return super.mintAuthCode(payload, codeChallenge);
  }

  override async putProviderGrant(
    userId: string,
    provider: string,
    grant: SealedGrant
  ): Promise<void> {
    if (this.failing === 'putProviderGrant') {
      throw new Error('D1 write failed');
    }
    return super.putProviderGrant(userId, provider, grant);
  }
}
