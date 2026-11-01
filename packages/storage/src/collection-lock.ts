import { canLock, getStorage } from '@cuewise/shared';

/**
 * Every writer of one whole-array collection, page or service worker, names its lock from here —
 * a rename is then a type error rather than two literals silently drifting apart.
 */
export const COLLECTION_LOCKS = [
  'goals',
  'quotes',
  'collections',
  'reminders',
  'conceptCards', // not synced — locked for the two realms, not the pull
  'reminderActivity', // device-local, never synced — locked for the two realms, not the pull
  'reminderPrompts', // device-local, never synced — locked for the two realms, not the pull
  'habitHistory', // always local, cloud sync only — locked for the two realms and the pull
] as const;

export type CollectionLock = (typeof COLLECTION_LOCKS)[number];

/**
 * Serialises a read-modify-write against every other writer of the same collection. The unlocked
 * branch is not a safe single-realm case — the one backend that reaches it is Chrome without
 * `navigator.locks`, which is exactly the two-realm one — it is just better than refusing to write.
 */
export function withCollectionLock<T>(lock: CollectionLock, apply: () => Promise<T>): Promise<T> {
  const store = getStorage();
  return canLock(store) ? store.withLock(lock, apply) : apply();
}
