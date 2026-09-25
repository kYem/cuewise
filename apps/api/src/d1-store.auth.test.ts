import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { clockedStore } from './__fixtures__/api-test-helpers.fixtures';
import { spyOnLoggerError } from './__fixtures__/logger.fixtures';
import { SESSION_TTL_MS } from './d1-store';
import type { SealedGrant } from './store';

const parkedSealedGrant: SealedGrant = {
  ciphertext: 'ct',
  iv: 'iv',
  refreshCiphertext: null,
  refreshIv: null,
  workspace: null,
};

describe('D1SyncStore auth', () => {
  it('findOrCreateUser returns the same user for the same identity', async () => {
    const { store } = clockedStore(1_000);
    const a = await store.findOrCreateUser({
      provider: 'google',
      providerSub: 's1',
      email: 'a@b.c',
    });
    const b = await store.findOrCreateUser({ provider: 'google', providerSub: 's1' });
    expect(b).toBe(a);
  });

  it('different providers with the same sub are different users', async () => {
    const { store } = clockedStore(1_000);
    const a = await store.findOrCreateUser({ provider: 'google', providerSub: 'same' });
    const b = await store.findOrCreateUser({ provider: 'apple', providerSub: 'same' });
    expect(b).not.toBe(a);
  });

  it('createSession/lookupSession round-trips and stores only a hash', async () => {
    const { store } = clockedStore(1_000);
    const userId = await store.findOrCreateUser({ provider: 'google', providerSub: 's1' });
    const token = await store.createSession(userId, 'Chrome on macOS');
    const session = await store.lookupSession(token);
    expect(session?.userId).toBe(userId);
    const row = await env.DB.prepare('SELECT token_hash FROM tokens').first<{
      token_hash: string;
    }>();
    expect(row?.token_hash).not.toBe(token);
  });

  it('lookupSession rejects expired and revoked tokens', async () => {
    const { store, tick } = clockedStore(1_000);
    const userId = await store.findOrCreateUser({ provider: 'google', providerSub: 's1' });
    const expired = await store.createSession(userId, 'd1');
    tick(91 * 24 * 60 * 60 * 1000);
    expect(await store.lookupSession(expired)).toBeNull();
    const revoked = await store.createSession(userId, 'd2');
    await store.revokeSession(revoked);
    expect(await store.lookupSession(revoked)).toBeNull();
  });

  it('auth codes are single-use and expire after 60s', async () => {
    const { store, tick } = clockedStore(1_000);
    const code = await store.mintAuthCode(
      {
        provider: 'apple',
        providerSub: 'as1',
        email: 'x@y.z',
      },
      'challenge-1'
    );
    expect(await store.consumeAuthCode(code)).toEqual({
      payload: { provider: 'apple', providerSub: 'as1', email: 'x@y.z' },
      codeChallenge: 'challenge-1',
    });
    expect(await store.consumeAuthCode(code)).toBeNull();
    const stale = await store.mintAuthCode(
      { provider: 'apple', providerSub: 'as2' },
      'challenge-2'
    );
    tick(61_000);
    expect(await store.consumeAuthCode(stale)).toBeNull();
  });

  it('physically deletes a redeemed code so its payload PII does not linger for the sweep', async () => {
    const { store } = clockedStore(1_000);
    const code = await store.mintAuthCode(
      { provider: 'apple', providerSub: 'as4', email: 'q@r.s' },
      'c4'
    );
    await store.consumeAuthCode(code);
    const row = await env.DB.prepare('SELECT COUNT(*) as count FROM auth_codes').first<{
      count: number;
    }>();
    if (row === null) {
      throw new Error('expected a count row');
    }
    expect(row.count).toBe(0);
  });

  it('treats a legacy row with no stored code_challenge as unredeemable, and logs the invariant break', async () => {
    const errorSpy = spyOnLoggerError();
    const { store } = clockedStore(1_000);
    const code = await store.mintAuthCode({ provider: 'apple', providerSub: 'as3' }, 'irrelevant');
    await env.DB.prepare('UPDATE auth_codes SET code_challenge = NULL').run();
    expect(await store.consumeAuthCode(code)).toBeNull();
    // Fail-closed AND loud: the error log is the whole point (else Apple sign-in 401s silently).
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects a session lookup exactly at its expiry boundary (expires_at > ? is strict)', async () => {
    const { store, tick } = clockedStore(1_000);
    const userId = await store.findOrCreateUser({ provider: 'google', providerSub: 's-boundary' });
    const token = await store.createSession(userId, 'boundary-device');
    tick(SESSION_TTL_MS);
    expect(await store.lookupSession(token)).toBeNull();
  });

  it('slides expiry forward on lookup, extending the session past its original TTL', async () => {
    const { store, tick } = clockedStore(1_000);
    const userId = await store.findOrCreateUser({ provider: 'google', providerSub: 's-sliding' });
    const token = await store.createSession(userId, 'sliding-device');

    tick(89 * 24 * 60 * 60 * 1000);
    expect(await store.lookupSession(token)).not.toBeNull();

    // Would already be past the original 90-day TTL (89 + 89 > 90) if the prior
    // lookup had not slid expires_at forward.
    tick(89 * 24 * 60 * 60 * 1000);
    expect(await store.lookupSession(token)).not.toBeNull();

    tick(91 * 24 * 60 * 60 * 1000);
    expect(await store.lookupSession(token)).toBeNull();
  });

  it('mintAuthCode purges expired rows so PII does not outlive the code TTL', async () => {
    const { store, tick } = clockedStore(1_000);
    await store.mintAuthCode({ provider: 'apple', providerSub: 'purge1', email: 'p1@e.c' }, 'c1');
    tick(61_000);
    await store.mintAuthCode({ provider: 'apple', providerSub: 'purge2', email: 'p2@e.c' }, 'c2');
    const row = await env.DB.prepare('SELECT COUNT(*) as count FROM auth_codes').first<{
      count: number;
    }>();
    if (row === null) {
      throw new Error('expected a count row');
    }
    expect(row.count).toBe(1);
  });

  it('mintAuthCode leaves an expired parked notion grant for the purge that revokes it', async () => {
    const { store, tick } = clockedStore(1_000);
    await store.mintAuthCode({ provider: 'notion', grant: parkedSealedGrant }, 'c1');
    await store.mintAuthCode({ provider: 'apple', providerSub: 'purge3', email: 'p3@e.c' }, 'c2');
    tick(61_000);
    await store.mintAuthCode({ provider: 'apple', providerSub: 'purge4', email: 'p4@e.c' }, 'c3');
    const row = await env.DB.prepare('SELECT COUNT(*) as count FROM auth_codes').first<{
      count: number;
    }>();
    if (row === null) {
      throw new Error('expected a count row');
    }
    expect(row.count).toBe(2);

    const parked = await store.listExpiredParkedGrants(62_000, 10, null);

    expect(parked.map((p) => p.grant)).toEqual([parkedSealedGrant]);
  });

  it('purgeExpiredSignInCodes leaves an expired parked grant for its revoke', async () => {
    const { store, tick } = clockedStore(1_000);
    await store.mintAuthCode({ provider: 'notion', grant: parkedSealedGrant }, 'c1');
    await store.mintAuthCode({ provider: 'apple', providerSub: 'purge6', email: 'p6@e.c' }, 'c2');
    tick(61_000);

    const purged = await store.purgeExpiredSignInCodes(62_000);

    expect(purged).toBe(1);
    expect(await store.listExpiredParkedGrants(62_000, 10, null)).toHaveLength(1);
  });

  it('listExpiredParkedGrants skips unexpired grants and honours the limit, oldest first', async () => {
    const { store, tick } = clockedStore(1_000);
    await store.mintAuthCode({ provider: 'notion', grant: parkedSealedGrant }, 'c1');
    tick(1_000);
    await store.mintAuthCode(
      { provider: 'notion', grant: { ...parkedSealedGrant, iv: 'iv2' } },
      'c2'
    );
    tick(100_000);
    await store.mintAuthCode(
      { provider: 'notion', grant: { ...parkedSealedGrant, iv: 'iv3' } },
      'c3'
    );

    const parked = await store.listExpiredParkedGrants(102_000, 1, null);

    expect(parked.map((p) => p.grant.iv)).toEqual(['iv']);
    expect(parked[0]?.expiresAt).toBe(61_000);
  });

  it('listExpiredParkedGrants resumes after the cursor it is given', async () => {
    const { store, tick } = clockedStore(1_000);
    await store.mintAuthCode({ provider: 'notion', grant: parkedSealedGrant }, 'c1');
    tick(1_000);
    await store.mintAuthCode(
      { provider: 'notion', grant: { ...parkedSealedGrant, iv: 'iv2' } },
      'c2'
    );
    tick(100_000);
    const [first] = await store.listExpiredParkedGrants(102_000, 1, null);
    if (first === undefined) {
      throw new Error('expected a parked grant');
    }

    const rest = await store.listExpiredParkedGrants(102_000, 10, first);

    expect(rest.map((p) => p.grant.iv)).toEqual(['iv2']);
  });

  it('deleteAuthCode removes only the named parked grant', async () => {
    const { store, tick } = clockedStore(1_000);
    await store.mintAuthCode({ provider: 'notion', grant: parkedSealedGrant }, 'c1');
    await store.mintAuthCode(
      { provider: 'notion', grant: { ...parkedSealedGrant, iv: 'iv2' } },
      'c2'
    );
    tick(61_000);
    const [first] = await store.listExpiredParkedGrants(62_000, 1, null);
    if (first === undefined) {
      throw new Error('expected a parked grant');
    }

    await store.deleteAuthCode(first.codeHash);

    const left = await store.listExpiredParkedGrants(62_000, 10, null);
    expect(left).toHaveLength(1);
    expect(left[0]?.codeHash).not.toBe(first.codeHash);
  });

  it('mintAuthCode still sweeps an expired row whose payload names no provider', async () => {
    const { store, tick } = clockedStore(1_000);
    await env.DB.prepare(
      'INSERT INTO auth_codes (code_hash, payload, expires_at, code_challenge) VALUES (?, ?, ?, ?)'
    )
      .bind('legacy-hash', JSON.stringify({ legacy: true }), 2_000, 'c0')
      .run();
    tick(61_000);

    await store.mintAuthCode({ provider: 'apple', providerSub: 'purge5', email: 'p5@e.c' }, 'c5');

    const row = await env.DB.prepare('SELECT COUNT(*) as count FROM auth_codes').first<{
      count: number;
    }>();
    expect(row?.count).toBe(1);
  });

  it('refreshes identities.email and users.email when a later sign-in has a new email', async () => {
    const { store } = clockedStore(1_000);
    const identity = {
      provider: 'google' as const,
      providerSub: 'refresh-sub',
      email: 'old@example.com',
    };
    const userId = await store.findOrCreateUser(identity);

    const secondUserId = await store.findOrCreateUser({ ...identity, email: 'new@example.com' });
    expect(secondUserId).toBe(userId);

    const identityRow = await env.DB.prepare(
      'SELECT email FROM identities WHERE provider = ? AND provider_sub = ?'
    )
      .bind('google', 'refresh-sub')
      .first<{ email: string | null }>();
    if (identityRow === null) {
      throw new Error('expected an identities row for refresh-sub');
    }
    expect(identityRow.email).toBe('new@example.com');

    const userRow = await env.DB.prepare('SELECT email FROM users WHERE id = ?')
      .bind(userId)
      .first<{ email: string | null }>();
    if (userRow === null) {
      throw new Error('expected a users row for refresh-sub');
    }
    expect(userRow.email).toBe('new@example.com');
  });
});
