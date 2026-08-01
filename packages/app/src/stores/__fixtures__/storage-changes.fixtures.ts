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

/** A backend that only observes: consumers reach storage itself through mocked helpers. */
export function fakeObservableStore(options: FakeObservableStoreOptions = {}): FakeObservableStore {
  const { failedSubscribes = 0, throwOnUnsubscribe = false } = options;
  const subscribers = new Set<StorageChangeHandler>();
  let remainingFailures = failedSubscribes;
  return {
    store: {
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
    } as unknown as ObservableKeyValueStore,
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
