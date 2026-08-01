import {
  configurePlatform,
  type KeyValueStore,
  logger,
  type ObservableKeyValueStore,
  resetPlatform,
  type StorageArea,
} from '@cuewise/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observableStorage, safeSubscribe } from './storage-changes';

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
