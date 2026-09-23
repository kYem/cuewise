import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { record } from './__fixtures__/api-test-helpers.fixtures';
import { hashSessionToken } from './crypto-utils';
import { D1SyncStore } from './d1-store';

describe('D1SyncStore concurrency', () => {
  it('two concurrent applyChanges batches for one user yield 20 records with seqs 1..20, no dup/gaps', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await store.findOrCreateUser({
      provider: 'dev',
      providerSub: 'concurrency-batches',
    });
    const batchA = Array.from({ length: 10 }, (_, i) => record({ entityId: `a-${i}` }));
    const batchB = Array.from({ length: 10 }, (_, i) => record({ entityId: `b-${i}` }));

    await Promise.all([store.applyChanges(userId, batchA), store.applyChanges(userId, batchB)]);

    const { records } = await store.listChanges(userId, 0);
    expect(records).toHaveLength(20);
    const seqs = records.map((r) => r.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(seqs).size).toBe(20);
  });

  it('two concurrent pushes of one entity from the same base: exactly one lands, the other gets its row', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await store.findOrCreateUser({
      provider: 'dev',
      providerSub: 'concurrency-cas',
    });
    await store.applyChanges(userId, [record({ entityId: 'a', ciphertext: 'v1' })]);

    const [first, second] = await Promise.all([
      store.applyChanges(userId, [record({ entityId: 'a', ciphertext: 'from-A', baseSeq: 1 })]),
      store.applyChanges(userId, [record({ entityId: 'a', ciphertext: 'from-B', baseSeq: 1 })]),
    ]);

    const results = [first, second];
    const landed = results.filter((r) => r.applied.length === 1);
    const refused = results.filter((r) => r.conflicts.length === 1);
    expect(landed).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0].conflicts[0].seq).toBe(landed[0].applied[0].seq);
    // The winner's row, not the loser's own echo: which one won is knowable from the order.
    const winner = first.applied.length === 1 ? 'from-A' : 'from-B';
    expect(refused[0].conflicts[0].ciphertext).toBe(winner);
  });

  it('two concurrent consumeAuthCode calls on the same code: exactly one resolves non-null', async () => {
    const store = new D1SyncStore(env.DB);
    const code = await store.mintAuthCode(
      { provider: 'apple', providerSub: 'concurrency-code' },
      'challenge-concurrency'
    );

    const [a, b] = await Promise.all([store.consumeAuthCode(code), store.consumeAuthCode(code)]);

    expect([a, b].filter((result) => result !== null)).toHaveLength(1);
  });

  it('10 concurrent bumpRateWindow calls on one token: observed counts are a permutation of 1..10', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await store.findOrCreateUser({
      provider: 'dev',
      providerSub: 'concurrency-rate',
    });
    const token = await store.createSession(userId, 'rate-device');
    const tokenHash = await hashSessionToken(token);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.bumpRateWindow(tokenHash, 60_000))
    );

    const counts = results.map((r) => {
      if (r === null) {
        throw new Error('expected bumpRateWindow to find the freshly created token');
      }
      return r.count;
    });
    expect(counts).toHaveLength(10);
    expect(new Set(counts).size).toBe(10);
    expect(Math.max(...counts)).toBe(10);
  });

  it('two concurrent findOrCreateUser calls for the same new identity both resolve to the same userId', async () => {
    const store = new D1SyncStore(env.DB);
    const identity = { provider: 'dev' as const, providerSub: 'concurrency-identity' };

    const [a, b] = await Promise.all([
      store.findOrCreateUser(identity),
      store.findOrCreateUser(identity),
    ]);

    expect(a).toBe(b);
  });
});
