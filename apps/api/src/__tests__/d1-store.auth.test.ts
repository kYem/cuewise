import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { D1SyncStore } from '../d1-store';

function storeAt(now: number): { store: D1SyncStore; tick: (ms: number) => void } {
  let current = now;
  const store = new D1SyncStore(env.DB, () => current);
  return {
    store,
    tick: (ms) => {
      current += ms;
    },
  };
}

describe('D1SyncStore auth', () => {
  it('findOrCreateUser returns the same user for the same identity', async () => {
    const { store } = storeAt(1_000);
    const a = await store.findOrCreateUser({
      provider: 'google',
      providerSub: 's1',
      email: 'a@b.c',
    });
    const b = await store.findOrCreateUser({ provider: 'google', providerSub: 's1' });
    expect(b).toBe(a);
  });

  it('different providers with the same sub are different users', async () => {
    const { store } = storeAt(1_000);
    const a = await store.findOrCreateUser({ provider: 'google', providerSub: 'same' });
    const b = await store.findOrCreateUser({ provider: 'apple', providerSub: 'same' });
    expect(b).not.toBe(a);
  });

  it('createSession/lookupSession round-trips and stores only a hash', async () => {
    const { store } = storeAt(1_000);
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
    const { store, tick } = storeAt(1_000);
    const userId = await store.findOrCreateUser({ provider: 'google', providerSub: 's1' });
    const expired = await store.createSession(userId, 'd1');
    tick(91 * 24 * 60 * 60 * 1000);
    expect(await store.lookupSession(expired)).toBeNull();
    const revoked = await store.createSession(userId, 'd2');
    await store.revokeSession(revoked);
    expect(await store.lookupSession(revoked)).toBeNull();
  });

  it('auth codes are single-use and expire after 60s', async () => {
    const { store, tick } = storeAt(1_000);
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

  it('treats a legacy row with no stored code_challenge as unredeemable', async () => {
    const { store } = storeAt(1_000);
    const code = await store.mintAuthCode({ provider: 'apple', providerSub: 'as3' }, 'irrelevant');
    await env.DB.prepare('UPDATE auth_codes SET code_challenge = NULL').run();
    expect(await store.consumeAuthCode(code)).toBeNull();
  });

  it('mintAuthCode purges expired rows so PII does not outlive the code TTL', async () => {
    const { store, tick } = storeAt(1_000);
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
});
