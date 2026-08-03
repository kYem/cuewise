import {
  configurePlatform,
  type KeyValueStore,
  logger,
  type ObservableKeyValueStore,
  resetPlatform,
  type StorageArea,
} from '@cuewise/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeObservableStore } from './__fixtures__/storage-changes.fixtures';
import {
  createStorageObserver,
  observableStorage,
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

  it('re-reads when a watched key is written elsewhere', async () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const refresh = vi.fn().mockResolvedValue(undefined);
    createStorageObserver('goals', ['goals'], refresh).ensureSubscribed();

    fake.emit(['goals']);

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('ignores a key it does not watch', async () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const refresh = vi.fn().mockResolvedValue(undefined);
    createStorageObserver('goals', ['goals'], refresh).ensureSubscribed();

    fake.emit(['quotes']);

    await Promise.resolve();
    expect(refresh).not.toHaveBeenCalled();
  });

  // Goals move between areas when sync is enabled, so an area filter would go deaf on the move.
  it('converges on a watched key announced in either area', async () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const refresh = vi.fn().mockResolvedValue(undefined);
    createStorageObserver('goals', ['goals'], refresh).ensureSubscribed();

    fake.emit(['goals'], 'sync');

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('coalesces a pull burst into one re-read, then one more for what landed mid-read', async () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    let release = (): void => {};
    const refresh = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      )
      .mockResolvedValue(undefined);
    createStorageObserver('goals', ['goals'], refresh).ensureSubscribed();

    fake.emit(['goals']);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    fake.emit(['goals']);
    fake.emit(['goals']);
    expect(refresh).toHaveBeenCalledTimes(1);

    release();

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it('names a rejected re-read instead of leaving an unhandled rejection', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const refresh = vi.fn().mockRejectedValue(new Error('storage unreachable'));
    createStorageObserver('goals', ['goals'], refresh).ensureSubscribed();

    fake.emit(['goals']);

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not apply goals changed elsewhere'),
        expect.anything()
      )
    );
  });

  it('subscribes once however often initialize runs', () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const observer = createStorageObserver(
      'goals',
      ['goals'],
      vi.fn().mockResolvedValue(undefined)
    );

    observer.ensureSubscribed();
    observer.ensureSubscribed();

    expect(fake.subscriberCount).toBe(1);
  });

  it('retries a subscribe that failed rather than believing it is observing', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const fake = fakeObservableStore({ failedSubscribes: 1 });
    configurePlatform({ storage: fake.store });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const observer = createStorageObserver('goals', ['goals'], refresh);

    observer.ensureSubscribed();
    expect(fake.subscriberCount).toBe(0);
    observer.ensureSubscribed();

    fake.emit(['goals']);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});
