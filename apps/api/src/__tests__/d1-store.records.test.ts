import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { D1SyncStore } from '../d1-store';
import type { PushRecord } from '../store';

function record(overrides: Partial<PushRecord> = {}): PushRecord {
  return {
    collection: 'quotes',
    entityId: 'entity-1',
    ciphertext: 'cipher-1',
    clientUpdatedAt: 1_000,
    deleted: false,
    ...overrides,
  };
}

async function newUser(store: D1SyncStore, providerSub: string): Promise<string> {
  return store.findOrCreateUser({ provider: 'dev', providerSub });
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
