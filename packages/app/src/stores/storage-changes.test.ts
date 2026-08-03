import {
  configurePlatform,
  type KeyValueStore,
  logger,
  type ObservableKeyValueStore,
  resetPlatform,
  type StorageArea,
} from '@cuewise/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FakeObservableStore,
  type FakeObservableStoreOptions,
  fakeObservableStore,
  settleQueuedWork,
} from './__fixtures__/storage-changes.fixtures';
import {
  createStaleLatch,
  createStorageObserver,
  observableStorage,
  type StaleReport,
  type StorageObserver,
  safeSubscribe,
  sameEntities,
} from './storage-changes';

function storeWith(onChanged?: KeyValueStore['onChanged']): ObservableKeyValueStore {
  return { onChanged } as unknown as ObservableKeyValueStore;
}

describe('observableStorage', () => {
  // Explicit, not inherited: the unconfigured cases below must not depend on whether some other
  // module in this run has already self-registered a backend.
  beforeEach(() => {
    resetPlatform();
  });

  afterEach(() => {
    resetPlatform();
  });

  it('answers null rather than throwing when no storage is configured', () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    expect(observableStorage()).toBeNull();
  });

  it('says so when there is no backend at all', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    observableStorage();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No storage backend to observe'),
      expect.anything()
    );
  });

  it('stays quiet on a backend that simply cannot observe writes', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    configurePlatform({ storage: storeWith(undefined) });

    expect(observableStorage()).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('answers the store when it can', () => {
    const store = storeWith(() => () => {});
    configurePlatform({ storage: store });

    expect(observableStorage()).toBe(store);
  });
});

describe('safeSubscribe', () => {
  it('answers null and names the consumer that stopped converging', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const store = storeWith(() => {
      throw new Error('addListener unavailable');
    });

    expect(safeSubscribe(store, 'settings', () => {})).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('storage changes for settings'),
      expect.anything()
    );
  });

  it('passes the handler through and tears down through the one it was given', () => {
    let torndown = false;
    const handlers: ((keys: string[], area: StorageArea) => void)[] = [];
    const store = storeWith((handler) => {
      handlers.push(handler);
      return () => {
        torndown = true;
      };
    });
    const handler = () => {};

    const unsubscribe = safeSubscribe(store, 'settings', handler);
    unsubscribe?.();

    expect(handlers).toEqual([handler]);
    expect(torndown).toBe(true);
  });

  it('contains a teardown that throws, which React would otherwise take the tree down for', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const store = storeWith(() => () => {
      throw new Error('removeListener unavailable');
    });

    const unsubscribe = safeSubscribe(store, 'the pomodoro timer', () => {});

    expect(() => unsubscribe?.()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('stop observing storage changes for the pomodoro timer'),
      expect.anything()
    );
  });
});

describe('sameEntities', () => {
  it('reports no change for a list that only differs by identity', () => {
    expect(sameEntities([{ id: 'a', text: 'one' }], [{ id: 'a', text: 'one' }])).toBe(true);
  });

  it('reports a change for a value a whole-array write would otherwise clobber', () => {
    expect(sameEntities([{ id: 'a', done: false }], [{ id: 'a', done: true }])).toBe(false);
  });
});

describe('createStorageObserver', () => {
  afterEach(() => {
    resetPlatform();
  });

  /** Subscribes and settles the reconcile pass, so each test counts only what it triggers. */
  async function observing(
    refresh: () => Promise<void>,
    options?: FakeObservableStoreOptions
  ): Promise<{ fake: FakeObservableStore; observer: StorageObserver }> {
    const fake = fakeObservableStore(options);
    configurePlatform({ storage: fake.store });
    const observer = createStorageObserver('goals', ['goals'], refresh);
    observer.reconcile();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    return { fake, observer };
  }

  // What recovers a pull that landed between initialize's read and this call; without it that
  // change is never announced to anyone and the store keeps a pre-pull snapshot.
  it('reconciles once on subscribing, with no change announced', async () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const refresh = vi.fn().mockResolvedValue(undefined);

    createStorageObserver('goals', ['goals'], refresh).reconcile();

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('re-reads when a watched key is written elsewhere', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { fake } = await observing(refresh);

    fake.emit(['goals']);

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it('ignores a key it does not watch', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { fake } = await observing(refresh);

    fake.emit(['quotes']);

    await settleQueuedWork();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // These collections move area with the syncEnabled setting, so an area filter goes deaf on the move.
  it('converges on a watched key announced in either area', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { fake } = await observing(refresh);

    fake.emit(['goals'], 'sync');

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it('coalesces a pull burst into one re-read, then one more for what landed mid-read', async () => {
    let release = (): void => {};
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { fake } = await observing(refresh);
    refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );

    fake.emit(['goals']);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    fake.emit(['goals']);
    fake.emit(['goals']);
    expect(refresh).toHaveBeenCalledTimes(2);

    release();

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(3));
  });

  it('names a rejected re-read instead of leaving an unhandled rejection', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const refresh = vi.fn().mockRejectedValue(new Error('storage unreachable'));
    createStorageObserver('goals', ['goals'], refresh).reconcile();

    fake.emit(['goals']);

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not apply goals changed elsewhere'),
        expect.anything()
      )
    );
  });

  // A synchronous throw would otherwise escape into the backend's listener dispatch.
  it('contains a refresh that throws before it returns a promise', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const refresh = vi.fn(() => {
      throw new Error('read threw synchronously');
    });
    createStorageObserver('goals', ['goals'], refresh).reconcile();

    expect(() => fake.emit(['goals'])).not.toThrow();
    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not apply goals changed elsewhere'),
        expect.anything()
      )
    );
  });

  it('subscribes once however often initialize runs', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { fake, observer } = await observing(refresh);

    observer.reconcile();

    expect(fake.subscriberCount).toBe(1);
  });

  it('stops observing a backend the platform replaced', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { fake: first, observer } = await observing(refresh);
    const second = fakeObservableStore();
    configurePlatform({ storage: second.store });

    observer.reconcile();

    expect(first.subscriberCount).toBe(0);
    expect(second.subscriberCount).toBe(1);
  });

  it('retries a subscribe that failed rather than believing it is observing', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { fake, observer } = await observing(refresh, { failedSubscribes: 1 });
    expect(fake.subscriberCount).toBe(0);

    await observer.reconcile();
    fake.emit(['goals']);

    await vi.waitFor(() => expect(fake.subscriberCount).toBe(1));
    await vi.waitFor(() => expect(refresh.mock.calls.length).toBeGreaterThan(2));
  });

  // ReminderWidget chains a whole-array write off initialize(); an unawaited reconcile would
  // hand it pre-reconcile state to write back.
  it('resolves reconcile only once the re-read has been applied', async () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    let applied = false;
    const observer = createStorageObserver('goals', ['goals'], async () => {
      await Promise.resolve();
      applied = true;
    });

    await observer.reconcile();

    expect(applied).toBe(true);
  });

  it('subscribes without re-reading, so a load can observe before its own first read', async () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const refresh = vi.fn().mockResolvedValue(undefined);

    createStorageObserver('goals', ['goals'], refresh).subscribe();

    await settleQueuedWork();
    expect(refresh).not.toHaveBeenCalled();
    expect(fake.subscriberCount).toBe(1);
  });

  it('reports a failed re-read as stale, and takes it back on the next good one', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const refresh = vi.fn().mockRejectedValueOnce(new Error('storage unreachable'));
    const report = { stale: vi.fn(), fresh: vi.fn() };
    const observer = createStorageObserver('goals', ['goals'], refresh, report);

    await observer.reconcile();
    expect(report.stale).toHaveBeenCalledTimes(1);
    expect(report.fresh).not.toHaveBeenCalled();

    refresh.mockResolvedValue(undefined);
    fake.emit(['goals']);

    await vi.waitFor(() => expect(report.fresh).toHaveBeenCalledTimes(1));
  });
});

describe('createStaleLatch', () => {
  function latchOver(initial: string | null): {
    latch: StaleReport;
    read: () => string | null;
    write: (next: string | null) => void;
  } {
    let error = initial;
    const write = (next: string | null): void => {
      error = next;
    };
    return { latch: createStaleLatch('stale', () => error, write), read: () => error, write };
  }

  it('takes back its own complaint', () => {
    const { latch, read } = latchOver(null);

    latch.stale();
    expect(read()).toBe('stale');
    latch.fresh();

    expect(read()).toBeNull();
  });

  // A write that failed while the view was stale owns the field once it sets it.
  it('leaves a different complaint standing', () => {
    const { latch, read, write } = latchOver(null);

    latch.stale();
    write('Storage is full — could not save.');
    latch.fresh();

    expect(read()).toBe('Storage is full — could not save.');
  });

  it('clears nothing when it never complained', () => {
    const { latch, read } = latchOver('could not save');

    latch.fresh();

    expect(read()).toBe('could not save');
  });
});
