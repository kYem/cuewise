import { env } from 'cloudflare:test';
import { vi } from 'vitest';
import { decryptSecret, encryptSecret, sha256Base64Url, sha256Hex } from '../crypto-utils';
import { D1SyncStore } from '../d1-store';
import type { Env } from '../env';
import { type NotionClient, type NotionGrant, NotionUnavailableError } from '../notion-client';
import type { CompletionProperty, PropertySchemas } from '../notion-schema';
import type {
  AuthCodePayload,
  FingerprintedToken,
  ProviderConnection,
  RenewalClaim,
  ReplacedGrant,
  SealedGrant,
  SealedTokens,
  SyncStore,
} from '../store';
import { signedInToken } from './api-test-helpers.fixtures';
import { TEST_CODE_VERIFIER } from './bounce.fixtures';

/** 43 base64url chars decode to the 32 bytes AES-GCM needs. */
export const TEST_PROVIDER_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
/** Well-formed but not the key anything was sealed under: what a rotation looks like. */
export const TEST_FOREIGN_PROVIDER_KEY = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
export const TEST_STATE_SIGNING_KEY = 'notion-signing-key-for-tests';
export const TEST_ACCESS_TOKEN = 'notion-access-token';
export const TEST_REFRESH_TOKEN = 'notion-refresh-token';
export const TEST_REFRESHED_TOKEN = 'notion-access-token-v2';
export const TEST_ROTATED_REFRESH_TOKEN = 'notion-refresh-token-v2';
export const TEST_DATA_SOURCE_ID = '3f9a855f-8bd8-4d4c-a3a4-caf40bac8df2';
export const TEST_PAGE_ID = '6bcd9e9c72457244f19ab98fb56fdbfa';
/** What exchangeCode answers for a grant Notion issued without a refresh token. */
export const GRANT_WITHOUT_REFRESH: NotionGrant = {
  accessToken: TEST_ACCESS_TOKEN,
  refreshToken: null,
  workspace: 'Acme',
};

export function asSchemas(value: Record<string, unknown>): PropertySchemas {
  return value as PropertySchemas;
}

export const checkboxSchema = asSchemas({ Done: { id: 'p', type: 'checkbox', checkbox: {} } });
export const checkboxCompletion: CompletionProperty = { kind: 'checkbox', name: 'Done' };

/** The Complete group holds custom option names, so a name match on options would fail. */
export const statusSchema = asSchemas({
  Status: {
    id: 'p1',
    type: 'status',
    status: {
      options: [
        { id: 'o1', name: 'Not started', color: 'default' },
        { id: 'o2', name: 'In progress', color: 'blue' },
        { id: 'o3', name: 'Shipped', color: 'green' },
        { id: 'o4', name: 'Archived', color: 'gray' },
      ],
      groups: [
        { id: 'g1', name: 'To-do', color: 'default', option_ids: ['o1'] },
        { id: 'g2', name: 'In Progress', color: 'blue', option_ids: ['o2'] },
        { id: 'g3', name: 'Complete', color: 'green', option_ids: ['o3', 'o4'] },
      ],
    },
  },
});

/** `statusSchema` as selection stores it: option ids `o3`/`o4` complete a row, `o1` reopens it. */
export const statusCompletion: Extract<CompletionProperty, { kind: 'status' }> = {
  kind: 'status',
  name: 'Status',
  completeOptionIds: ['o3', 'o4'],
  todoOptionIds: ['o1'],
};

/** Two status properties that both have a Complete group; which one a write hits must not depend on key order. */
export const twoStatusSchema = asSchemas({
  First: {
    type: 'status',
    status: {
      options: [
        { id: 'a1', name: 'Todo' },
        { id: 'a2', name: 'Done' },
      ],
      groups: [
        { id: 'ga1', name: 'To-do', option_ids: ['a1'] },
        { id: 'ga2', name: 'Complete', option_ids: ['a2'] },
      ],
    },
  },
  Second: {
    type: 'status',
    status: {
      options: [
        { id: 'b1', name: 'Open' },
        { id: 'b2', name: 'Closed' },
      ],
      groups: [
        { id: 'gb1', name: 'To-do', option_ids: ['b1'] },
        { id: 'gb2', name: 'Complete', option_ids: ['b2'] },
      ],
    },
  },
});

export const secondStatusCompletion: CompletionProperty = {
  kind: 'status',
  name: 'Second',
  completeOptionIds: ['b2'],
  todoOptionIds: ['b1'],
};

/** A status with a Complete group but no To-do group, as `noTodoStatusSchema` stores it. */
export const noTodoStatusCompletion: CompletionProperty = {
  kind: 'status',
  name: 'Status',
  completeOptionIds: ['o3'],
  todoOptionIds: [],
};

/** What Notion answers a page write when the property or option under it changed. */
export function validationRejection(): NotionUnavailableError {
  return new NotionUnavailableError('notion answered 400 (validation_error)', { status: 400 });
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

export function notionEnv(overrides: Partial<Env> = {}): typeof env {
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

/** Every method stubbed so a test overrides only the call it is about. */
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
    searchDataSources: vi.fn(async () => ({
      tables: [{ id: TEST_DATA_SOURCE_ID, name: 'Tasks' }],
      truncated: false,
    })),
    getPageDataSource: vi.fn(async () => TEST_DATA_SOURCE_ID),
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

/** The compare-and-set handle of whatever access token the account currently holds. */
export async function currentToken(store: SyncStore, userId: string): Promise<FingerprintedToken> {
  const row = await store.getProviderConnection(userId, 'notion');
  if (row === null || row.tokenFingerprint === null) {
    throw new Error('expected a stored Notion grant with a fingerprint');
  }
  return { tokenFingerprint: row.tokenFingerprint };
}

/**
 * A signed-in account with a stored Notion grant. `dataSourceId: null` models the state between
 * claiming the grant and picking a table; `completion` is the property that pick stored.
 */
export async function connectedNotionUser(
  options: {
    dataSourceId?: string | null;
    withRefreshToken?: boolean;
    completion?: CompletionProperty;
  } = {}
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
    tokenFingerprint: await sha256Hex(TEST_ACCESS_TOKEN),
  });
  const dataSourceId =
    options.dataSourceId === undefined ? TEST_DATA_SOURCE_ID : options.dataSourceId;
  if (dataSourceId !== null) {
    await user.store.setProviderSelection(user.userId, 'notion', {
      dataSourceId,
      completionProperty: JSON.stringify(options.completion ?? checkboxCompletion),
    });
  }
  return user;
}

/** Re-encrypts the refresh pair under a foreign key: the access token opens, the refresh cannot. */
export async function sealRefreshUnderForeignKey(store: SyncStore, userId: string): Promise<void> {
  const row = await currentToken(store, userId);
  const stored = await store.getProviderConnection(userId, 'notion');
  if (stored === null) {
    throw new Error('expected a stored Notion grant');
  }
  const foreign = await encryptSecret(TEST_REFRESH_TOKEN, TEST_FOREIGN_PROVIDER_KEY);
  await store.updateProviderTokens(
    userId,
    'notion',
    {
      ciphertext: stored.ciphertext,
      iv: stored.iv,
      refreshCiphertext: foreign.ciphertext,
      refreshIv: foreign.iv,
      tokenFingerprint: row.tokenFingerprint,
    },
    row
  );
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
  const accessToken = await decryptSecret(stored, TEST_PROVIDER_KEY);
  if (stored.refreshCiphertext === null || stored.refreshIv === null) {
    return { accessToken, refreshToken: null };
  }
  const refreshToken = await decryptSecret(
    { ciphertext: stored.refreshCiphertext, iv: stored.refreshIv },
    TEST_PROVIDER_KEY
  );
  return { accessToken, refreshToken };
}

type FailingWrite =
  | 'mintAuthCode'
  | 'putProviderGrant'
  | 'updateProviderTokens'
  | 'releaseProviderRenewal'
  | 'deleteUser';

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
  ): Promise<ReplacedGrant | null> {
    if (this.failing === 'putProviderGrant') {
      throw new Error('D1 write failed');
    }
    return super.putProviderGrant(userId, provider, grant);
  }

  override async deleteUser(userId: string): Promise<ProviderConnection[]> {
    if (this.failing === 'deleteUser') {
      throw new Error('D1 write failed');
    }
    return super.deleteUser(userId);
  }

  override async updateProviderTokens(
    userId: string,
    provider: string,
    tokens: SealedTokens,
    used: FingerprintedToken
  ): Promise<boolean> {
    if (this.failing === 'updateProviderTokens') {
      throw new Error('D1 write failed');
    }
    return super.updateProviderTokens(userId, provider, tokens, used);
  }

  override async releaseProviderRenewal(
    userId: string,
    provider: string,
    claim: RenewalClaim
  ): Promise<void> {
    if (this.failing === 'releaseProviderRenewal') {
      throw new Error('D1 write failed');
    }
    return super.releaseProviderRenewal(userId, provider, claim);
  }
}

/** Parks an access-only grant sealed under the test key, as an unclaimed callback leaves one. */
export async function mintParkedGrant(
  store: D1SyncStore,
  key: string = TEST_PROVIDER_KEY
): Promise<void> {
  const sealed = await encryptSecret(TEST_ACCESS_TOKEN, key);
  await store.mintAuthCode(
    {
      provider: 'notion',
      grant: {
        ...sealed,
        refreshCiphertext: null,
        refreshIv: null,
        workspace: null,
        tokenFingerprint: await sha256Hex(TEST_ACCESS_TOKEN),
      },
    },
    'c1'
  );
}
