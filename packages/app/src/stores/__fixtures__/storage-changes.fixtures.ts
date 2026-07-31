import type { KeyValueStore, StorageArea } from '@cuewise/shared';

export interface FakeObservableStore {
  store: KeyValueStore;
  emit: (keys: string[], area?: StorageArea) => void;
  readonly subscriberCount: number;
}

/**
 * A backend that only observes: consumers reach storage itself through mocked helpers.
 * `failedSubscribes` makes that many subscribe attempts throw before the first one takes.
 */
export function fakeObservableStore(failedSubscribes = 0): FakeObservableStore {
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
        return () => subscribers.delete(handler);
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
