import { type QuoteCollection, quoteCollectionSchema, STORAGE_KEYS } from '@cuewise/shared';
import {
  keepValidListItems,
  type StorageResult,
  setInStorage,
  setValidatedListInStorage,
} from './chrome-storage';
import { withCollectionLock } from './collection-lock';
import { getListRaw } from './raw-list';
import { getStorageArea } from './settings';

/** Raw-then-validate for the same reason as getGoals. */
export async function getCollections(): Promise<QuoteCollection[]> {
  const area = await getStorageArea();
  const raw = await getListRaw<unknown>(STORAGE_KEYS.COLLECTIONS, area);
  return keepValidListItems<QuoteCollection>(
    raw,
    quoteCollectionSchema,
    STORAGE_KEYS.COLLECTIONS,
    area
  );
}

export async function setCollections(collections: QuoteCollection[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setValidatedListInStorage(
    STORAGE_KEYS.COLLECTIONS,
    collections,
    quoteCollectionSchema,
    area
  );
}

/** Changes the collection list, reading inside the lock. See `updateGoals` for why. */
export async function updateCollections(
  mutate: (collections: QuoteCollection[]) => QuoteCollection[]
): Promise<{ result: StorageResult; collections: QuoteCollection[] }> {
  return withCollectionLock('collections', async () => {
    const collections = mutate(await getCollections());
    return { result: await setCollections(collections), collections };
  });
}

export async function getCollectionsRaw(): Promise<QuoteCollection[]> {
  return getListRaw<QuoteCollection>(STORAGE_KEYS.COLLECTIONS, await getStorageArea());
}

export async function setCollectionsRaw(collections: QuoteCollection[]): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.COLLECTIONS, collections, await getStorageArea());
}
