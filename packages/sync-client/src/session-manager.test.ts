import { describe, expect, it } from 'vitest';
import {
  createInMemoryKeyValueStore,
  createRecordingScheduler,
} from './__fixtures__/ports.fixtures';
import { SessionManager, SYNC_SESSION_KEY } from './session-manager';
import { armSyncPull, SYNC_PULL_WAKE_ID } from './sync-schedule';

describe('SessionManager', () => {
  it('round-trips a token through saveToken and getToken', async () => {
    const store = createInMemoryKeyValueStore();
    const manager = new SessionManager(store);

    await manager.saveToken('session-token-123');

    expect(await manager.getToken()).toBe('session-token-123');
  });

  it('reports isSignedIn as false initially, true after save, false after clear', async () => {
    const store = createInMemoryKeyValueStore();
    const manager = new SessionManager(store);

    expect(await manager.isSignedIn()).toBe(false);

    await manager.saveToken('session-token-123');
    expect(await manager.isSignedIn()).toBe(true);

    await manager.clear();
    expect(await manager.isSignedIn()).toBe(false);
  });

  it('stores the token under SYNC_SESSION_KEY in the local area', async () => {
    const store = createInMemoryKeyValueStore();
    const manager = new SessionManager(store);

    await manager.saveToken('session-token-123');

    expect(store.data.get(`local:${SYNC_SESSION_KEY}`)).toBe('session-token-123');
    expect(store.data.has(`sync:${SYNC_SESSION_KEY}`)).toBe(false);
  });

  // The token is a live credential: a caller that cannot tell it survived goes on reporting a
  // disconnected account as signed in.
  it('reports a token that survived the clear', async () => {
    const store = createInMemoryKeyValueStore({ failRemoves: true });
    const manager = new SessionManager(store);
    await manager.saveToken('session-token-123');

    expect(await manager.clear()).toBe(false);
    expect(await manager.isSignedIn()).toBe(true);
  });

  it('reports a cleared token, and a clear with nothing to remove, alike', async () => {
    const store = createInMemoryKeyValueStore();
    const manager = new SessionManager(store);

    expect(await manager.clear()).toBe(true);

    await manager.saveToken('session-token-123');
    expect(await manager.clear()).toBe(true);
  });

  it('saveToken propagates a failed StorageResult to the caller', async () => {
    const store = createInMemoryKeyValueStore({ failWrites: true });
    const manager = new SessionManager(store);

    const result = await manager.saveToken('session-token-123');

    expect(result).toEqual({
      success: false,
      error: { type: 'quota_exceeded', message: 'simulated quota failure' },
    });
  });
});

describe('armSyncPull', () => {
  it('schedules SYNC_PULL_WAKE_ID exactly delayMinutes from the injected now', async () => {
    const scheduler = createRecordingScheduler();
    const T0 = 1_700_000_000_000;

    await armSyncPull(scheduler, 5, () => T0);

    expect(scheduler.scheduled).toEqual([{ id: SYNC_PULL_WAKE_ID, when: new Date(T0 + 300_000) }]);
  });
});
