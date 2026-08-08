import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { clockedStore, newUser } from './__fixtures__/api-test-helpers.fixtures';
import { hashSessionToken, sessionIdFromParam } from './crypto-utils';
import { D1SyncStore } from './d1-store';

describe('session ids', () => {
  it('gives every created session a distinct non-empty id', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    await store.createSession(userId, 'laptop');
    await store.createSession(userId, 'desktop');

    const rows = await env.DB.prepare('SELECT id, token_hash FROM tokens WHERE user_id = ?')
      .bind(userId)
      .all<{ id: string; token_hash: string }>();

    const ids = rows.results.map((r) => r.id);
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(2);
    // The id must never be the auth lookup key — that is the whole reason the column exists.
    expect(rows.results.every((r) => r.id !== r.token_hash)).toBe(true);
  });

  // Run against a probe table, not `tokens`: the harness migrates an empty DB, so the real
  // backfill never meets a pre-existing row. Replays 0007's three statements in order.
  it('backfills a distinct id per legacy row', async () => {
    await env.DB.prepare('CREATE TABLE backfill_probe (a TEXT)').run();
    await env.DB.prepare("INSERT INTO backfill_probe (a) VALUES ('x'), ('y'), ('z')").run();

    await env.DB.prepare("ALTER TABLE backfill_probe ADD COLUMN id TEXT NOT NULL DEFAULT ''").run();
    await env.DB.prepare(
      "UPDATE backfill_probe SET id = lower(hex(randomblob(16))) WHERE id = ''"
    ).run();
    await env.DB.prepare(
      "CREATE UNIQUE INDEX idx_probe_id ON backfill_probe (id) WHERE id != ''"
    ).run();

    const rows = await env.DB.prepare('SELECT id FROM backfill_probe').all<{ id: string }>();
    const ids = rows.results.map((r) => r.id);
    await env.DB.prepare('DROP TABLE backfill_probe').run();

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  // Against the REAL tokens table, not a copy of the DDL: the harness applies migration 0007, so
  // making its index total again fails here. The rollback case is two rows at the '' default.
  it('tolerates repeated default ids on tokens while rejecting a duplicate real one', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const legacyRow = (hash: string) =>
      env.DB.prepare(
        "INSERT INTO tokens (token_hash, user_id, device_name, expires_at, created_at, id) VALUES (?, ?, 'legacy', 9e12, 0, '')"
      ).bind(hash, userId);

    await legacyRow(`legacy-a-${crypto.randomUUID()}`).run();
    await legacyRow(`legacy-b-${crypto.randomUUID()}`).run();

    const token = await store.createSession(userId, 'laptop');
    const [session] = await store.listSessions(userId, await hashSessionToken(token));
    const duplicateReal = env.DB.prepare(
      "INSERT INTO tokens (token_hash, user_id, device_name, expires_at, created_at, id) VALUES (?, ?, 'dupe', 9e12, 0, ?)"
    )
      .bind(`dupe-${crypto.randomUUID()}`, userId, session.id)
      .run();

    await expect(duplicateReal).rejects.toThrow();
  });
});

describe('SyncStore session management', () => {
  it('lists only live sessions and marks the caller current', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const mine = await store.createSession(userId, 'laptop');
    const other = await store.createSession(userId, 'desktop');
    await store.revokeSession(other);

    const sessions = await store.listSessions(userId, await hashSessionToken(mine));

    expect(sessions).toHaveLength(1);
    expect(sessions[0].deviceName).toBe('laptop');
    expect(sessions[0].current).toBe(true);
  });

  it('omits expired sessions from the list', async () => {
    const { store, tick } = clockedStore(1_000);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const stale = await store.createSession(userId, 'old-laptop');
    tick(91 * 24 * 60 * 60 * 1000);
    const fresh = await store.createSession(userId, 'new-laptop');

    const sessions = await store.listSessions(userId, await hashSessionToken(fresh));

    expect(sessions.map((s) => s.deviceName)).toEqual(['new-laptop']);
    expect(await store.lookupSession(stale)).toBeNull();
  });

  // Rows a pre-0007 Worker wrote have no addressable handle, so listing them would offer a
  // Revoke that 404s. revoke-others still cuts them.
  it('omits un-migrated rows that carry no id', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const mine = await store.createSession(userId, 'laptop');
    await env.DB.prepare(
      "INSERT INTO tokens (token_hash, user_id, device_name, expires_at, created_at, id) VALUES (?, ?, 'legacy', 9e12, 0, '')"
    )
      .bind(`legacy-${crypto.randomUUID()}`, userId)
      .run();

    const sessions = await store.listSessions(userId, await hashSessionToken(mine));

    expect(sessions.map((s) => s.deviceName)).toEqual(['laptop']);
  });

  it('does not revoke a session belonging to another user', async () => {
    const store = new D1SyncStore(env.DB);
    const victim = await newUser(store, `u-${crypto.randomUUID()}`);
    const attacker = await newUser(store, `u-${crypto.randomUUID()}`);
    const victimToken = await store.createSession(victim, 'victim-laptop');
    const victimHash = await hashSessionToken(victimToken);
    const [victimSession] = await store.listSessions(victim, victimHash);

    const revoked = await store.revokeSessionById(attacker, sessionIdFromParam(victimSession.id));

    expect(revoked).toBe(false);
    expect(await store.lookupSession(victimToken)).not.toBeNull();
  });

  it('revoking twice keeps the original revocation time', async () => {
    const { store, tick } = clockedStore(1_000);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const token = await store.createSession(userId, 'laptop');
    const [session] = await store.listSessions(userId, await hashSessionToken(token));

    expect(await store.revokeSessionById(userId, sessionIdFromParam(session.id))).toBe(true);
    tick(5_000);
    expect(await store.revokeSessionById(userId, sessionIdFromParam(session.id))).toBe(true);

    const row = await env.DB.prepare('SELECT revoked_at FROM tokens WHERE id = ?')
      .bind(session.id)
      .first<{ revoked_at: number }>();
    expect(row?.revoked_at).toBe(1_000);
  });

  it('revokes every other session and reports the count', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const mine = await store.createSession(userId, 'laptop');
    await store.createSession(userId, 'desktop');
    await store.createSession(userId, 'phone');

    const count = await store.revokeOtherSessions(userId, await hashSessionToken(mine));

    expect(count).toBe(2);
    expect(await store.lookupSession(mine)).not.toBeNull();
  });

  it('does not count expired sessions the list never showed', async () => {
    const { store, tick } = clockedStore(1_000);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    await store.createSession(userId, 'retired-laptop');
    tick(91 * 24 * 60 * 60 * 1000);
    const mine = await store.createSession(userId, 'laptop');
    await store.createSession(userId, 'desktop');
    const hash = await hashSessionToken(mine);

    const listed = await store.listSessions(userId, hash);
    const count = await store.revokeOtherSessions(userId, hash);

    // With no un-migrated rows present, the toasted count matches the visible list exactly.
    expect(count).toBe(listed.filter((s) => !s.current).length);
    expect(count).toBe(1);
  });

  it('renames the caller own session', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const token = await store.createSession(userId, 'laptop');
    const hash = await hashSessionToken(token);
    const [session] = await store.listSessions(userId, hash);

    expect(await store.renameSession(userId, sessionIdFromParam(session.id), 'Work MacBook')).toBe(
      true
    );

    const [renamed] = await store.listSessions(userId, hash);
    expect(renamed.deviceName).toBe('Work MacBook');
  });

  it('does not rename a session belonging to another user', async () => {
    const store = new D1SyncStore(env.DB);
    const victim = await newUser(store, `u-${crypto.randomUUID()}`);
    const attacker = await newUser(store, `u-${crypto.randomUUID()}`);
    const victimToken = await store.createSession(victim, 'victim-laptop');
    const victimHash = await hashSessionToken(victimToken);
    const [victimSession] = await store.listSessions(victim, victimHash);

    const renamed = await store.renameSession(
      attacker,
      sessionIdFromParam(victimSession.id),
      'pwned'
    );

    // false, not true: a 204 here would also let an attacker probe which ids exist.
    expect(renamed).toBe(false);
    expect((await store.listSessions(victim, victimHash))[0].deviceName).toBe('victim-laptop');
  });

  it('still revokes un-migrated rows through revoke-others', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const mine = await store.createSession(userId, 'laptop');
    const legacyHash = `legacy-${crypto.randomUUID()}`;
    await env.DB.prepare(
      "INSERT INTO tokens (token_hash, user_id, device_name, expires_at, created_at, id) VALUES (?, ?, 'legacy', 9e12, 0, '')"
    )
      .bind(legacyHash, userId)
      .run();

    await store.revokeOtherSessions(userId, await hashSessionToken(mine));

    // Un-migrated rows can't be listed or addressed individually, so this is their only cut.
    const row = await env.DB.prepare('SELECT revoked_at FROM tokens WHERE token_hash = ?')
      .bind(legacyHash)
      .first<{ revoked_at: number | null }>();
    expect(row?.revoked_at).not.toBeNull();
  });
});
