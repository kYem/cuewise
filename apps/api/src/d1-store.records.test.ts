import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { clockedStore, newUser, record } from './__fixtures__/api-test-helpers.fixtures';
import { D1SyncStore } from './d1-store';
import { StorageQuotaExceededError } from './store';

/** A store with tiny caps (page size 2, per-user cap 3) so the bounds are exercisable in-test. */
function cappedStore(): D1SyncStore {
  return new D1SyncStore(env.DB, Date.now, { maxRecordsPerUser: 3, changesPageSize: 2 });
}

describe('D1SyncStore records', () => {
  it('pushing 2 records returns cursor 2 and listChanges(0) returns both in seq order', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u1');
    const { cursor } = await store.applyChanges(userId, [
      record({ entityId: 'a' }),
      record({ entityId: 'b' }),
    ]);
    expect(cursor).toBe(2);
    const { records, cursor: listCursor } = await store.listChanges(userId, 0);
    expect(records.map((r) => r.seq)).toEqual([1, 2]);
    expect(listCursor).toBe(2);
  });

  it('listChanges(1) returns only the second record', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u1');
    await store.applyChanges(userId, [record({ entityId: 'a' }), record({ entityId: 'b' })]);
    const { records, cursor } = await store.listChanges(userId, 1);
    expect(records).toHaveLength(1);
    expect(records[0]?.entityId).toBe('b');
    expect(cursor).toBe(2);
  });

  it('re-pushing the same entity replaces it in place', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u1');
    await store.applyChanges(userId, [record({ entityId: 'a', ciphertext: 'first' })]);
    const { cursor } = await store.applyChanges(userId, [
      record({ entityId: 'a', ciphertext: 'second' }),
    ]);
    expect(cursor).toBe(2);
    const countRow = await env.DB.prepare('SELECT COUNT(*) as count FROM records WHERE user_id = ?')
      .bind(userId)
      .first<{ count: number }>();
    if (countRow === null) {
      throw new Error('expected a count row');
    }
    expect(countRow.count).toBe(1);
    const { records } = await store.listChanges(userId, 0);
    expect(records).toHaveLength(1);
    expect(records[0]?.seq).toBe(2);
    expect(records[0]?.ciphertext).toBe('second');
  });

  it('round-trips a tombstone with deleted: true', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u1');
    await store.applyChanges(userId, [record({ entityId: 'a', deleted: true })]);
    const { records } = await store.listChanges(userId, 0);
    expect(records[0]?.deleted).toBe(true);
  });

  it('never crosses two users changes', async () => {
    const store = new D1SyncStore(env.DB);
    const userA = await newUser(store, 'u1');
    const userB = await newUser(store, 'u2');
    await store.applyChanges(userA, [record({ entityId: 'a' })]);
    const { records } = await store.listChanges(userB, 0);
    expect(records).toEqual([]);
  });

  it('assigns strictly increasing seqs with no gaps across two sequential batches', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u1');
    await store.applyChanges(userId, [record({ entityId: 'a' }), record({ entityId: 'b' })]);
    await store.applyChanges(userId, [record({ entityId: 'c' })]);
    const { records } = await store.listChanges(userId, 0);
    expect(records.map((r) => r.seq)).toEqual([1, 2, 3]);
  });

  it('listChanges caps a page at changesPageSize and the cursor lets the caller pull the rest', async () => {
    const store = cappedStore();
    const userId = await newUser(store, 'u-page');
    await store.applyChanges(userId, [
      record({ entityId: 'a' }),
      record({ entityId: 'b' }),
      record({ entityId: 'c' }),
    ]);
    const firstPage = await store.listChanges(userId, 0);
    expect(firstPage.records.map((r) => r.seq)).toEqual([1, 2]);
    expect(firstPage.cursor).toBe(2);
    const secondPage = await store.listChanges(userId, firstPage.cursor);
    expect(secondPage.records.map((r) => r.seq)).toEqual([3]);
  });

  it('exportUser pages internally and returns every record past a single page', async () => {
    const store = cappedStore();
    const userId = await newUser(store, 'u-export');
    await store.putKeyEnvelope(userId, 'recovery', 'v1.dk-1.aaaa.bbbb');
    await store.applyChanges(userId, [
      record({ entityId: 'a' }),
      record({ entityId: 'b' }),
      record({ entityId: 'c' }),
    ]);
    const { records, keyEnvelopes } = await store.exportUser(userId);
    expect(records.map((r) => r.seq)).toEqual([1, 2, 3]);
    // Two pages: the envelope must appear once, not once per page.
    expect(keyEnvelopes).toHaveLength(1);
  });

  it('accepts a push that lands exactly on the per-user cap', async () => {
    const store = cappedStore();
    const userId = await newUser(store, 'u-quota-exact');
    await store.applyChanges(userId, [record({ entityId: 'a' }), record({ entityId: 'b' })]);
    // 2 existing + 1 = 3 == cap: must succeed (guard is `> cap`, not `>= cap`).
    const { cursor } = await store.applyChanges(userId, [record({ entityId: 'c' })]);
    expect(cursor).toBe(3);
  });

  it('rejects a push that would exceed the per-user record cap with StorageQuotaExceededError', async () => {
    const store = cappedStore();
    const userId = await newUser(store, 'u-quota');
    await store.applyChanges(userId, [record({ entityId: 'a' }), record({ entityId: 'b' })]);
    await expect(
      store.applyChanges(userId, [record({ entityId: 'c' }), record({ entityId: 'd' })])
    ).rejects.toBeInstanceOf(StorageQuotaExceededError);
    // The rejected batch must not have partially written.
    const countRow = await env.DB.prepare('SELECT COUNT(*) as count FROM records WHERE user_id = ?')
      .bind(userId)
      .first<{ count: number }>();
    if (countRow === null) {
      throw new Error('expected a count row');
    }
    expect(countRow.count).toBe(2);
  });

  it('purgeTombstones deletes only tombstones older than the retention window, keeping live rows', async () => {
    const retention = 100_000;
    const { store, tick } = clockedStore(1_000);
    const userId = await store.findOrCreateUser({ provider: 'dev', providerSub: 'u-purge' });
    // An old tombstone + a live record at t=1000, then a fresh tombstone past the retention window.
    await store.applyChanges(userId, [
      record({ entityId: 'old', deleted: true }),
      record({ entityId: 'keep', deleted: false }),
    ]);
    tick(retention + 1);
    await store.applyChanges(userId, [record({ entityId: 'recent', deleted: true })]);

    const purged = await store.purgeTombstones(retention);
    expect(purged).toBe(1);

    const { records } = await store.exportUser(userId);
    expect(records.map((r) => r.entityId).sort()).toEqual(['keep', 'recent']);
  });

  it('keeps a tombstone whose age is exactly the retention window (boundary is exclusive)', async () => {
    const retention = 100_000;
    const { store, tick } = clockedStore(1_000);
    const userId = await store.findOrCreateUser({ provider: 'dev', providerSub: 'u-boundary' });
    await store.applyChanges(userId, [record({ entityId: 'edge', deleted: true })]); // server_received_at = 1000
    tick(retention); // now = 101_000; cutoff = 101_000 - 100_000 = 1_000, exactly the row's stamp
    expect(await store.purgeTombstones(retention)).toBe(0);
    const { records } = await store.exportUser(userId);
    expect(records.map((r) => r.entityId)).toEqual(['edge']);
  });

  it('purges old tombstones across all users without touching any live row', async () => {
    const retention = 100_000;
    const { store, tick } = clockedStore(1_000);
    const userA = await store.findOrCreateUser({ provider: 'dev', providerSub: 'purge-a' });
    const userB = await store.findOrCreateUser({ provider: 'dev', providerSub: 'purge-b' });
    await store.applyChanges(userA, [
      record({ entityId: 'a-old', deleted: true }),
      record({ entityId: 'a-live' }),
    ]);
    await store.applyChanges(userB, [
      record({ entityId: 'b-old', deleted: true }),
      record({ entityId: 'b-live' }),
    ]);
    tick(retention + 1);

    expect(await store.purgeTombstones(retention)).toBe(2);
    expect((await store.exportUser(userA)).records.map((r) => r.entityId)).toEqual(['a-live']);
    expect((await store.exportUser(userB)).records.map((r) => r.entityId)).toEqual(['b-live']);
  });

  it('purgeTombstones is a no-op (returns 0) when no tombstone is past the window', async () => {
    const { store } = clockedStore(1_000);
    const userId = await store.findOrCreateUser({ provider: 'dev', providerSub: 'u-purge-noop' });
    await store.applyChanges(userId, [record({ entityId: 'fresh', deleted: true })]);
    expect(await store.purgeTombstones(100_000)).toBe(0);
  });

  it('getPurgedSeq is 0 for a user who has never had a tombstone purged', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u-never-purged');
    expect(await store.getPurgedSeq(userId)).toBe(0);
  });

  it('purgeTombstones advances the user watermark to the purged tombstone highest seq', async () => {
    const retention = 100_000;
    const { store, tick } = clockedStore(1_000);
    const userId = await store.findOrCreateUser({ provider: 'dev', providerSub: 'u-watermark' });
    // Live record keeps a low seq forever; the tombstone at the higher seq is what
    // must set the watermark (MIN(seq) over survivors would stay pinned at 1 instead).
    await store.applyChanges(userId, [
      record({ entityId: 'live', deleted: false }),
      record({ entityId: 'gone', deleted: true }),
    ]);
    tick(retention + 1);

    expect(await store.purgeTombstones(retention)).toBe(1);
    expect(await store.getPurgedSeq(userId)).toBe(2);
  });

  it('purgeTombstones does not bump the watermark for a user with no purged tombstone', async () => {
    const retention = 100_000;
    const { store, tick } = clockedStore(1_000);
    const userId = await store.findOrCreateUser({ provider: 'dev', providerSub: 'u-no-tombstone' });
    await store.applyChanges(userId, [record({ entityId: 'live', deleted: false })]);
    tick(retention + 1);

    expect(await store.purgeTombstones(retention)).toBe(0);
    expect(await store.getPurgedSeq(userId)).toBe(0);
  });

  it('applyChanges with an empty array returns the current cursor and writes nothing', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u1');
    await store.applyChanges(userId, [record({ entityId: 'a' })]);
    const { cursor } = await store.applyChanges(userId, []);
    expect(cursor).toBe(1);
    const countRow = await env.DB.prepare('SELECT COUNT(*) as count FROM records WHERE user_id = ?')
      .bind(userId)
      .first<{ count: number }>();
    if (countRow === null) {
      throw new Error('expected a count row');
    }
    expect(countRow.count).toBe(1);
  });

  it('lands an update whose baseSeq matches and answers its new seq under applied', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u-cas-ok');
    await store.applyChanges(userId, [record({ entityId: 'a', ciphertext: 'v1' })]);

    const result = await store.applyChanges(userId, [
      record({ entityId: 'a', ciphertext: 'v2', baseSeq: 1 }),
    ]);

    expect(result).toEqual({
      cursor: 2,
      applied: [{ collection: 'quotes', entityId: 'a', seq: 2 }],
      conflicts: [],
    });
    const { records } = await store.listChanges(userId, 0);
    expect(records[0]?.ciphertext).toBe('v2');
  });

  it('refuses an update whose baseSeq is stale and returns the current row as a conflict', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u-cas-stale');
    await store.applyChanges(userId, [record({ entityId: 'a', ciphertext: 'v1' })]);
    await store.applyChanges(userId, [record({ entityId: 'a', ciphertext: 'v2', baseSeq: 1 })]);

    const result = await store.applyChanges(userId, [
      record({ entityId: 'a', ciphertext: 'stale', baseSeq: 1 }),
    ]);

    expect(result.applied).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      collection: 'quotes',
      entityId: 'a',
      current: { collection: 'quotes', entityId: 'a', seq: 2, ciphertext: 'v2', deleted: false },
    });
    const { records } = await store.listChanges(userId, 0);
    expect(records[0]?.ciphertext).toBe('v2');
  });

  it('upserts unconditionally when baseSeq is omitted, as a client that predates it would', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u-cas-legacy');
    await store.applyChanges(userId, [record({ entityId: 'a', ciphertext: 'v1' })]);
    await store.applyChanges(userId, [record({ entityId: 'a', ciphertext: 'v2', baseSeq: 1 })]);

    const result = await store.applyChanges(userId, [record({ entityId: 'a', ciphertext: 'v3' })]);

    expect(result.conflicts).toEqual([]);
    expect(result.applied).toEqual([{ collection: 'quotes', entityId: 'a', seq: 3 }]);
  });

  it('inserts when baseSeq names a row that no longer exists', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u-cas-missing');

    const result = await store.applyChanges(userId, [record({ entityId: 'a', baseSeq: 5 })]);

    expect(result.applied).toEqual([{ collection: 'quotes', entityId: 'a', seq: 1 }]);
    expect(result.conflicts).toEqual([]);
  });

  it('conflicts against a live tombstone, handing the tombstone back as current', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u-cas-tombstone');
    await store.applyChanges(userId, [record({ entityId: 'a' })]);
    await store.applyChanges(userId, [record({ entityId: 'a', deleted: true, baseSeq: 1 })]);

    const result = await store.applyChanges(userId, [record({ entityId: 'a', baseSeq: 1 })]);

    expect(result.conflicts[0]?.current).toMatchObject({ seq: 2, deleted: true });
  });

  it('applies the fresh rows of a mixed batch, leaves seq gaps for the refused ones, and pages across them', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u-cas-mixed');
    await store.applyChanges(userId, [record({ entityId: 'a' }), record({ entityId: 'b' })]); // seqs 1, 2
    await store.applyChanges(userId, [record({ entityId: 'a', baseSeq: 1 })]); // a -> 3

    const result = await store.applyChanges(userId, [
      record({ entityId: 'a', baseSeq: 1 }), // stale: reserved seq 4 goes unused
      record({ entityId: 'b', baseSeq: 2 }), // fresh: seq 5
      record({ entityId: 'c' }), // new: seq 6
    ]);

    expect(result.cursor).toBe(6);
    expect(result.applied).toEqual([
      { collection: 'quotes', entityId: 'b', seq: 5 },
      { collection: 'quotes', entityId: 'c', seq: 6 },
    ]);
    expect(result.conflicts.map((c) => c.entityId)).toEqual(['a']);
    const page = await store.listChanges(userId, 3);
    expect(page.records.map((r) => r.seq)).toEqual([5, 6]);
    expect(page.cursor).toBe(6);
  });
});
