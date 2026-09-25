import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clockedStore, record } from './__fixtures__/api-test-helpers.fixtures';
import { spyOnLoggerError } from './__fixtures__/logger.fixtures';
import { mintParkedGrant, notionEnv } from './__fixtures__/notion.fixtures';
import { D1SyncStore } from './d1-store';
import worker from './worker';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('worker scheduled parked-grant purge', () => {
  it('scheduled() revokes an expired parked notion grant upstream and drops its code', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
        return Response.json({});
      })
    );
    const { store: clocked } = clockedStore(1_000);
    await mintParkedGrant(clocked);

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController(), notionEnv(), ctx);
    await waitOnExecutionContext(ctx);

    expect(calls).toEqual(['POST https://api.notion.com/v1/oauth/revoke']);
    const remaining = await env.DB.prepare('SELECT COUNT(*) AS count FROM auth_codes').first<{
      count: number;
    }>();
    expect(remaining?.count).toBe(0);
  });
});

describe('worker scheduled job isolation', () => {
  it('a failing tombstone purge still lets the parked-grant sweep run, then fails the cron', async () => {
    spyOnLoggerError();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return Response.json({});
      })
    );
    vi.spyOn(D1SyncStore.prototype, 'purgeTombstones').mockRejectedValue(new Error('D1 timeout'));
    const { store: clocked } = clockedStore(1_000);
    await mintParkedGrant(clocked);

    const ctx = createExecutionContext();
    await expect(
      worker.scheduled(createScheduledController(), notionEnv(), ctx)
    ).rejects.toBeInstanceOf(AggregateError);
    await waitOnExecutionContext(ctx);

    expect(calls).toEqual(['https://api.notion.com/v1/oauth/revoke']);
  });
});

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
