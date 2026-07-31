import {
  configurePlatform,
  type KeyValueStore,
  logger,
  resetPlatform,
  type StorageArea,
} from '@cuewise/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { observableStorage, safeSubscribe } from './storage-changes';

function storeWith(onChanged?: KeyValueStore['onChanged']): KeyValueStore {
  return { onChanged } as unknown as KeyValueStore;
}

describe('observableStorage', () => {
  afterEach(() => {
    resetPlatform();
  });

  it('answers null rather than throwing when no storage is configured', () => {
    // Its callers are React effects and a store initializer; a throw there crashes the render
    // tree, where the reads that follow already report the misconfiguration.
    expect(observableStorage()).toBeNull();
  });

  it('answers null on a backend that cannot observe writes', () => {
    configurePlatform({ storage: storeWith(undefined) });

    expect(observableStorage()).toBeNull();
  });

  it('answers the store when it can', () => {
    const store = storeWith(() => () => {});
    configurePlatform({ storage: store });

    expect(observableStorage()).toBe(store);
  });
});

describe('safeSubscribe', () => {
  it('answers null and says why when subscribing throws', () => {
    // Silent, this stops convergence for the life of the process with nothing to explain it.
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const store = storeWith(() => {
      throw new Error('addListener unavailable');
    });

    expect(safeSubscribe(store, () => {})).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Could not observe storage changes'),
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

    expect(safeSubscribe(store, () => {})).toBe(unsubscribe);
    expect(handlers).toHaveLength(1);
  });
});
