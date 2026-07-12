import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { record } from './__fixtures__/api-test-helpers.fixtures';
import { D1SyncStore } from './d1-store';
import worker from './worker';

describe('worker scheduled tombstone purge', () => {
  it('scheduled() reclaims tombstones past the retention window and leaves live rows', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await store.findOrCreateUser({ provider: 'dev', providerSub: 'worker-purge' });
    // A tombstone stamped in the deep past (well beyond the 90-day retention)...
    await env.DB.prepare(
      'INSERT INTO records (user_id, collection, entity_id, seq, ciphertext, deleted, client_updated_at, server_received_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
    )
      .bind(userId, 'quotes', 'ancient', 1, 'c', 1000, 1000)
      .run();
    // ...and a live record stamped ~now.
    await store.applyChanges(userId, [record({ entityId: 'live' })]);

    const controller = createScheduledController();
    const ctx = createExecutionContext();
    await worker.scheduled?.(controller, env, ctx);
    await waitOnExecutionContext(ctx);

    const remaining = await env.DB.prepare('SELECT entity_id FROM records WHERE user_id = ?')
      .bind(userId)
      .all<{ entity_id: string }>();
    expect(remaining.results.map((r) => r.entity_id)).toEqual(['live']);
  });
});
