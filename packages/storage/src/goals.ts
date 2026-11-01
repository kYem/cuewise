import { type Goal, goalSchema, STORAGE_KEYS } from '@cuewise/shared';
import {
  keepValidListItems,
  type StorageResult,
  setInStorage,
  setValidatedListInStorage,
} from './chrome-storage';
import { withCollectionLock } from './collection-lock';
import { getListRaw } from './raw-list';
import { getStorageArea } from './settings';

/**
 * Raw-then-validate, like getQuotes: every writer rewrites the whole array from what this read
 * answered, so reporting a failed read as `[]` is how a wedged read becomes a fleet-wide erase.
 * A failed read and an unusable stored value both throw; a row the schema rejects is dropped
 * here but carried through on write, so it is not deleted either.
 */
export async function getGoals(): Promise<Goal[]> {
  const area = await getStorageArea();
  const raw = await getListRaw<unknown>(STORAGE_KEYS.GOALS, area);
  return keepValidListItems<Goal>(raw, goalSchema, STORAGE_KEYS.GOALS, area);
}

export async function setGoals(goals: Goal[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setValidatedListInStorage(STORAGE_KEYS.GOALS, goals, goalSchema, area);
}

/**
 * Changes the goal list. Reads inside the lock rather than trusting a caller's snapshot: the pull
 * applies its writes from the service worker while the page writes from a `get()` taken before its
 * own await, and whichever lands last carries the whole array with it — reverting an edit, or
 * dropping one already pulled from another device.
 */
export async function updateGoals(
  mutate: (goals: Goal[]) => Goal[]
): Promise<{ result: StorageResult; goals: Goal[] }> {
  return withCollectionLock('goals', async () => {
    const goals = mutate(await getGoals());
    return { result: await setGoals(goals), goals };
  });
}

export async function getGoalsRaw(): Promise<Goal[]> {
  return getListRaw<Goal>(STORAGE_KEYS.GOALS, await getStorageArea());
}

/** Counterpart to the raw reads: this caller saw everything, so its omissions must land. */
export async function setGoalsRaw(goals: Goal[]): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.GOALS, goals, await getStorageArea());
}
