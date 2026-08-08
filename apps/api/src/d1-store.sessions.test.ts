import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { newUser } from './__fixtures__/api-test-helpers.fixtures';
import { D1SyncStore } from './d1-store';

describe('session ids', () => {
  it('gives every created session a distinct non-empty id', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    await store.createSession(userId, 'laptop');
    await store.createSession(userId, 'desktop');

    const rows = await env.DB.prepare('SELECT id FROM tokens WHERE user_id = ?')
      .bind(userId)
      .all<{ id: string }>();

    const ids = rows.results.map((r) => r.id);
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });

  // The migration's backfill cannot run against `tokens` here — the harness applies every
  // migration to an empty DB, so idx_tokens_id already forbids the two ''-id rows that would
  // stand in for legacy ones. What matters is that randomblob() is evaluated per row rather than
  // once for the statement; evaluated once, the deploy's CREATE UNIQUE INDEX would fail.
  it('assigns a distinct id per row in one backfill statement', async () => {
    await env.DB.prepare("CREATE TABLE backfill_probe (id TEXT NOT NULL DEFAULT '')").run();
    await env.DB.prepare("INSERT INTO backfill_probe (id) VALUES (''), (''), ('')").run();

    await env.DB.prepare(
      "UPDATE backfill_probe SET id = lower(hex(randomblob(16))) WHERE id = ''"
    ).run();

    const rows = await env.DB.prepare('SELECT id FROM backfill_probe').all<{ id: string }>();
    const ids = rows.results.map((r) => r.id);
    await env.DB.prepare('DROP TABLE backfill_probe').run();

    expect(ids).toHaveLength(3);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(3);
  });
});
