import {
  configurePlatform,
  type KeyValueStore,
  logger,
  resetPlatform,
  type StorageArea,
} from '@cuewise/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observableStorage, safeSubscribe } from './storage-changes';

function storeWith(onChanged?: KeyValueStore['onChanged']): KeyValueStore {
  return { onChanged } as unknown as KeyValueStore;
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
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    expect(observableStorage()).toBeNull();

    errorSpy.mockRestore();
  });

  it('says so when there is no backend at all, since the hooks that ask do no other read', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    observableStorage();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No storage backend to observe'),
      expect.anything()
    );
    errorSpy.mockRestore();
  });

  it('stays quiet on a backend that simply cannot observe writes', () => {
    // A platform limit, not a wiring bug: logging it would cry wolf on every macOS launch.
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    configurePlatform({ storage: storeWith(undefined) });

    expect(observableStorage()).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
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
    errorSpy.mockRestore();
  });

  it('passes the handler through and returns its unsubscribe', () => {
    const unsubscribe = () => {};
    const handlers: ((keys: string[], area: StorageArea) => void)[] = [];
    const store = storeWith((handler) => {
      handlers.push(handler);
      return unsubscribe;
    });
    const handler = () => {};

    expect(safeSubscribe(store, 'settings', handler)).toBe(unsubscribe);
    expect(handlers).toEqual([handler]);
  });
});
