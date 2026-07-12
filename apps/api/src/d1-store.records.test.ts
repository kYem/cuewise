import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { record } from './__fixtures__/api-test-helpers.fixtures';
import { D1SyncStore } from './d1-store';
import { StorageQuotaExceededError } from './store';

async function newUser(store: D1SyncStore, providerSub: string): Promise<string> {
  return store.findOrCreateUser({ provider: 'dev', providerSub });
}

/** A store with tiny caps (page size 2, per-user cap 3) so the bounds are exercisable in-test. */
function cappedStore(): D1SyncStore {
  return new D1SyncStore(env.DB, Date.now, { maxRecordsPerUser: 3, changesPageSize: 2 });
}

describe('D1SyncStore records', () => {
  it('pushing 2 records returns cursor 2 and listChanges(0) returns both in seq order', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u1');
    const cursor = await store.applyChanges(userId, [
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
    const cursor = await store.applyChanges(userId, [
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
    await store.applyChanges(userId, [
      record({ entityId: 'a' }),
      record({ entityId: 'b' }),
      record({ entityId: 'c' }),
    ]);
    const { records } = await store.exportUser(userId);
    expect(records.map((r) => r.seq)).toEqual([1, 2, 3]);
  });

  it('accepts a push that lands exactly on the per-user cap', async () => {
    const store = cappedStore();
    const userId = await newUser(store, 'u-quota-exact');
    await store.applyChanges(userId, [record({ entityId: 'a' }), record({ entityId: 'b' })]);
    // 2 existing + 1 = 3 == cap: must succeed (guard is `> cap`, not `>= cap`).
    const cursor = await store.applyChanges(userId, [record({ entityId: 'c' })]);
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

  it('applyChanges with an empty array returns the current cursor and writes nothing', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'u1');
    await store.applyChanges(userId, [record({ entityId: 'a' })]);
    const cursor = await store.applyChanges(userId, []);
    expect(cursor).toBe(1);
    const countRow = await env.DB.prepare('SELECT COUNT(*) as count FROM records WHERE user_id = ?')
      .bind(userId)
      .first<{ count: number }>();
    if (countRow === null) {
      throw new Error('expected a count row');
    }
    expect(countRow.count).toBe(1);
  });
});
