import type { KeyValueStore, StorageArea } from '@cuewise/shared';

export interface FakeObservableStore {
  store: KeyValueStore;
  emit: (keys: string[], area?: StorageArea) => void;
  readonly subscriberCount: number;
}

export interface FakeObservableStoreOptions {
  /** Subscribe attempts that throw before the first one takes. */
  failedSubscribes?: number;
  /** Unsubscribing throws, as it does on an invalidated MV3 context. */
  throwOnUnsubscribe?: boolean;
}

/** A backend that only observes: consumers reach storage itself through mocked helpers. */
export function fakeObservableStore(
  options: number | FakeObservableStoreOptions = {}
): FakeObservableStore {
  const { failedSubscribes = 0, throwOnUnsubscribe = false } =
    typeof options === 'number' ? { failedSubscribes: options } : options;
  const subscribers = new Set<(keys: string[], area: StorageArea) => void>();
  let remainingFailures = failedSubscribes;
  return {
    store: {
      onChanged(handler: (keys: string[], area: StorageArea) => void) {
        if (remainingFailures > 0) {
          remainingFailures -= 1;
          throw new Error('addListener unavailable');
        }
        subscribers.add(handler);
        return () => {
          subscribers.delete(handler);
          if (throwOnUnsubscribe) {
            throw new Error('removeListener unavailable');
          }
        };
      },
    } as unknown as KeyValueStore,
    emit(keys: string[], area: StorageArea = 'local') {
      for (const subscriber of subscribers) {
        subscriber(keys, area);
      }
    },
    get subscriberCount() {
      return subscribers.size;
    },
  };
}
