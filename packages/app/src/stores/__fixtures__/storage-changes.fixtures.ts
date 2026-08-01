import type { ObservableKeyValueStore, StorageArea, StorageChangeHandler } from '@cuewise/shared';

export interface FakeObservableStore {
  store: ObservableKeyValueStore;
  emit: (keys: string[], area?: StorageArea) => void;
  readonly subscriberCount: number;
}

export interface FakeObservableStoreOptions {
  /** Subscribe attempts that throw before the first one takes. */
  failedSubscribes?: number;
  /** Unsubscribing throws before detaching, as an invalidated MV3 context does — the listener stays. */
  throwOnUnsubscribe?: boolean;
}

/** Tests install this as the whole registry, so an unmocked read must name itself, not undefined. */
function unserved(method: string): () => never {
  return () => {
    throw new Error(`fakeObservableStore does not serve ${method}`);
  };
}

/** A backend that only observes: consumers reach storage itself through mocked helpers. */
export function fakeObservableStore(options: FakeObservableStoreOptions = {}): FakeObservableStore {
  const { failedSubscribes = 0, throwOnUnsubscribe = false } = options;
  const subscribers = new Set<StorageChangeHandler>();
  let remainingFailures = failedSubscribes;
  return {
    store: {
      supportsSync: false,
      get: unserved('get'),
      set: unserved('set'),
      remove: unserved('remove'),
      getMany: unserved('getMany'),
      keys: unserved('keys'),
      setMany: unserved('setMany'),
      removeMany: unserved('removeMany'),
      getUsage: unserved('getUsage'),
      onChanged(handler: StorageChangeHandler) {
        if (remainingFailures > 0) {
          remainingFailures -= 1;
          throw new Error('addListener unavailable');
        }
        subscribers.add(handler);
        return () => {
          if (throwOnUnsubscribe) {
            throw new Error('removeListener unavailable');
          }
          subscribers.delete(handler);
        };
      },
    },
    emit(keys: string[], area: StorageArea = 'local') {
      for (const subscriber of [...subscribers]) {
        subscriber(keys, area);
      }
    },
    get subscriberCount() {
      return subscribers.size;
    },
  };
}
