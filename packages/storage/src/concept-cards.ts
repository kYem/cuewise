import { type ConceptCard, conceptCardSchema, STORAGE_KEYS } from '@cuewise/shared';
import {
  keepValidListItems,
  type StorageResult,
  setValidatedListInStorage,
} from './chrome-storage';
import { withCollectionLock } from './collection-lock';
import { getListRaw } from './raw-list';
import { getStorageArea } from './settings';

// Concept Cards (spaced-repetition learning cards)
/** Raw-then-validate for the same reason as getGoals. */
export async function getConceptCards(): Promise<ConceptCard[]> {
  const area = await getStorageArea();
  const raw = await getListRaw<unknown>(STORAGE_KEYS.CONCEPT_CARDS, area);
  return keepValidListItems<ConceptCard>(raw, conceptCardSchema, STORAGE_KEYS.CONCEPT_CARDS, area);
}

export async function setConceptCards(cards: ConceptCard[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setValidatedListInStorage(STORAGE_KEYS.CONCEPT_CARDS, cards, conceptCardSchema, area);
}

/** Changes the concept deck, reading inside the lock. See `updateGoals` for why. */
export async function updateConceptCards(
  mutate: (cards: ConceptCard[]) => ConceptCard[]
): Promise<{ result: StorageResult; cards: ConceptCard[] }> {
  return withCollectionLock('conceptCards', async () => {
    const cards = mutate(await getConceptCards());
    return { result: await setConceptCards(cards), cards };
  });
}
