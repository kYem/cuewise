import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { clockedStore, newUser } from './__fixtures__/api-test-helpers.fixtures';
import { D1SyncStore } from './d1-store';
import type { ProviderConnection, SealedGrant } from './store';

const REFRESH_PAIR = { refreshCiphertext: 'r-ct', refreshIv: 'r-iv' };
/** The fingerprint `grant()` stores, as the object the conditional writers take. */
const FP = { tokenFingerprint: 'fp' };
const TOKENS_2 = {
  ciphertext: 'ct-2',
  iv: 'iv-2',
  refreshCiphertext: null,
  refreshIv: null,
  tokenFingerprint: 'fp-2',
};

function grant(overrides: Partial<SealedGrant> = {}): SealedGrant {
  return {
    ciphertext: 'ct',
    iv: 'iv',
    refreshCiphertext: null,
    refreshIv: null,
    workspace: 'Acme',
    tokenFingerprint: 'fp',
    ...overrides,
  };
}

function connection(overrides: Partial<ProviderConnection> = {}): ProviderConnection {
  return {
    provider: 'notion',
    ...grant(),
    dataSourceId: null,
    completionProperty: null,
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
    await store.setProviderSelection(userId, 'notion', {
      dataSourceId: 'ds-kept',
      completionProperty: 'prop-kept',
    });

    await store.putProviderGrant(
      userId,
      'notion',
      grant({ ciphertext: 'ct-2', iv: 'iv-2', workspace: 'Renamed', tokenFingerprint: 'fp-2' })
    );

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toEqual(
      connection({
        ciphertext: 'ct-2',
        iv: 'iv-2',
        workspace: 'Renamed',
        tokenFingerprint: 'fp-2',
        dataSourceId: 'ds-kept',
        completionProperty: 'prop-kept',
      })
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

  it('deleteProviderConnectionIfUnchanged drops the row only while it holds that token', async () => {
    await store.putProviderGrant(userId, 'notion', grant({ tokenFingerprint: 'fp-1' }));

    await expect(
      store.deleteProviderConnectionIfUnchanged(userId, 'notion', { tokenFingerprint: 'fp-other' })
    ).resolves.toBe(false);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.not.toBeNull();
    await expect(
      store.deleteProviderConnectionIfUnchanged(userId, 'notion', { tokenFingerprint: 'fp-1' })
    ).resolves.toBe(true);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('putProviderGrant clears the refresh pair when the new grant carries none', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));

    await store.putProviderGrant(userId, 'notion', grant());

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      refreshCiphertext: null,
      refreshIv: null,
    });
  });

  it('refuses a half refresh pair, so a ciphertext can never sit beside the wrong iv', async () => {
    await expect(
      store.putProviderGrant(
        userId,
        'notion',
        grant({ refreshCiphertext: 'r-ct', refreshIv: null })
      )
    ).rejects.toThrow(/CHECK constraint/);
    await expect(
      store.putProviderGrant(
        userId,
        'notion',
        grant({ refreshCiphertext: null, refreshIv: 'r-iv' })
      )
    ).rejects.toThrow(/CHECK constraint/);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('takeProviderConnection returns the row it deleted, and null when there was none', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));

    await expect(store.takeProviderConnection(userId, 'notion')).resolves.toEqual(
      connection(REFRESH_PAIR)
    );
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
    await expect(store.takeProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('hands the renewal claim to one caller until that caller releases it', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));

    const claim = await store.claimProviderRenewal(userId, 'notion', FP, 30_000);
    if (claim === null) {
      throw new Error('expected the first claim to be taken');
    }
    await expect(store.claimProviderRenewal(userId, 'notion', FP, 30_000)).resolves.toBeNull();
    await store.releaseProviderRenewal(userId, 'notion', claim);
    await expect(store.claimProviderRenewal(userId, 'notion', FP, 30_000)).resolves.not.toBeNull();
  });

  it('refuses a renewal claim from a request that opened a token the row no longer holds', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));

    await expect(
      store.claimProviderRenewal(userId, 'notion', { tokenFingerprint: 'stale' }, 30_000)
    ).resolves.toBeNull();
  });

  it('lets a stale renewal claim be taken over, so a crashed renewal cannot block forever', async () => {
    const { store: clocked, tick } = clockedStore(1_000_000);
    const clockedUser = await newUser(clocked, 'provider-tokens-renewal');
    await clocked.putProviderGrant(clockedUser, 'notion', grant(REFRESH_PAIR));
    await expect(clocked.claimProviderRenewal(clockedUser, 'notion', FP, 30_000)).resolves.toBe(
      1_000_000
    );

    tick(29_000);
    await expect(
      clocked.claimProviderRenewal(clockedUser, 'notion', FP, 30_000)
    ).resolves.toBeNull();
    tick(2_000);
    await expect(clocked.claimProviderRenewal(clockedUser, 'notion', FP, 30_000)).resolves.toBe(
      1_031_000
    );
  });

  it('releases only the claim it was handed, so a crashed renewal cannot release its successor', async () => {
    const { store: clocked, tick } = clockedStore(1_000_000);
    const clockedUser = await newUser(clocked, 'provider-tokens-release');
    await clocked.putProviderGrant(clockedUser, 'notion', grant(REFRESH_PAIR));
    const first = await clocked.claimProviderRenewal(clockedUser, 'notion', FP, 30_000);
    expect(first).toBe(1_000_000);
    if (first === null) {
      throw new Error('expected the first claim to be taken');
    }
    tick(31_000);
    await clocked.claimProviderRenewal(clockedUser, 'notion', FP, 30_000);

    await clocked.releaseProviderRenewal(clockedUser, 'notion', first);

    await expect(
      clocked.claimProviderRenewal(clockedUser, 'notion', FP, 30_000)
    ).resolves.toBeNull();
  });

  it('updateProviderTokens releases the renewal claim with the tokens it stores', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));
    await store.claimProviderRenewal(userId, 'notion', FP, 30_000);

    await expect(store.updateProviderTokens(userId, 'notion', TOKENS_2, FP)).resolves.toBe(true);

    await expect(
      store.claimProviderRenewal(userId, 'notion', { tokenFingerprint: 'fp-2' }, 30_000)
    ).resolves.not.toBeNull();
  });

  it('updateProviderTokens writes only while the row still holds the token the renewal opened', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));

    await expect(
      store.updateProviderTokens(userId, 'notion', TOKENS_2, { tokenFingerprint: 'stale' })
    ).resolves.toBe(false);

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toEqual(
      connection(REFRESH_PAIR)
    );
  });

  it('putProviderGrant clears a held renewal claim, since the claim belonged to the old grant', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));
    await store.claimProviderRenewal(userId, 'notion', FP, 30_000);

    await store.putProviderGrant(
      userId,
      'notion',
      grant({ ciphertext: 'ct-2', iv: 'iv-2', tokenFingerprint: 'fp-2' })
    );

    await expect(
      store.claimProviderRenewal(userId, 'notion', { tokenFingerprint: 'fp-2' }, 30_000)
    ).resolves.not.toBeNull();
  });

  it('claimProviderRenewal answers null for an account with no grant', async () => {
    await expect(store.claimProviderRenewal(userId, 'notion', FP, 30_000)).resolves.toBeNull();
  });

  it('deleteUser takes the connection with the account and returns it for revocation', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));

    const removed = await store.deleteUser(userId);

    expect(removed).toEqual([connection(REFRESH_PAIR)]);
    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('updateProviderTokens clears a refresh pair the renewal omitted, since Notion has rotated it away', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));
    await store.setProviderSelection(userId, 'notion', {
      dataSourceId: 'ds1',
      completionProperty: 'prop1',
    });

    await store.updateProviderTokens(userId, 'notion', TOKENS_2, FP);

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toEqual(
      connection({
        ciphertext: 'ct-2',
        iv: 'iv-2',
        tokenFingerprint: 'fp-2',
        dataSourceId: 'ds1',
        completionProperty: 'prop1',
      })
    );
  });

  it('updateProviderTokens rotates the refresh pair when the renewal carried one', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));

    await store.updateProviderTokens(
      userId,
      'notion',
      { ...TOKENS_2, refreshCiphertext: 'r-ct-2', refreshIv: 'r-iv-2' },
      FP
    );

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      refreshCiphertext: 'r-ct-2',
      refreshIv: 'r-iv-2',
    });
  });

  it('setProviderSelection stores the table and its property together, never touching the tokens', async () => {
    await store.putProviderGrant(userId, 'notion', grant(REFRESH_PAIR));

    await store.setProviderSelection(userId, 'notion', {
      dataSourceId: 'ds9',
      completionProperty: 'prop9',
    });

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toEqual(
      connection({ ...REFRESH_PAIR, dataSourceId: 'ds9', completionProperty: 'prop9' })
    );
  });

  it('recordTokenFingerprint heals a missing or stale fingerprint, keyed on the ciphertext', async () => {
    await store.putProviderGrant(userId, 'notion', grant({ tokenFingerprint: null }));

    await expect(store.recordTokenFingerprint(userId, 'notion', 'other-ct', 'fp-x')).resolves.toBe(
      false
    );
    await expect(store.recordTokenFingerprint(userId, 'notion', 'ct', 'fp-healed')).resolves.toBe(
      true
    );

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toMatchObject({
      tokenFingerprint: 'fp-healed',
    });
  });

  it('never matches a compare-and-set against a row with no fingerprint', async () => {
    await store.putProviderGrant(userId, 'notion', grant({ tokenFingerprint: null }));

    await expect(store.claimProviderRenewal(userId, 'notion', FP, 30_000)).resolves.toBeNull();
    await expect(store.updateProviderTokens(userId, 'notion', TOKENS_2, FP)).resolves.toBe(false);
    await expect(store.deleteProviderConnectionIfUnchanged(userId, 'notion', FP)).resolves.toBe(
      false
    );
  });

  it('narrow writers answer false for an account with no grant', async () => {
    await expect(
      store.setProviderSelection(userId, 'notion', { dataSourceId: 'ds1', completionProperty: 'p' })
    ).resolves.toBe(false);
    await expect(store.updateProviderTokens(userId, 'notion', TOKENS_2, FP)).resolves.toBe(false);

    await expect(store.getProviderConnection(userId, 'notion')).resolves.toBeNull();
  });

  it('narrow writers answer true when a row was touched', async () => {
    await store.putProviderGrant(userId, 'notion', grant());

    await expect(
      store.setProviderSelection(userId, 'notion', { dataSourceId: 'ds9', completionProperty: 'p' })
    ).resolves.toBe(true);
    await expect(store.updateProviderTokens(userId, 'notion', TOKENS_2, FP)).resolves.toBe(true);
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
