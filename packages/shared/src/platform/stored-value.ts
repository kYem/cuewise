/**
 * The result shape of a batch read. A stored value this build could not read is its own arm of a
 * union rather than a missing entry or a sentinel, so the type system — not the reader's memory —
 * is what stops it being mistaken for "nothing is stored here". A caller cannot reach `.value`
 * without narrowing on `readable`, and the narrowing forces a decision about the other arm.
 */
export type StoredValue = { readable: true; value: unknown } | { readable: false };

/** Keys absent from the map were never written; that absence is meaningful to callers. */
export type StoredValues = Record<string, StoredValue>;

export const UNREADABLE_VALUE: StoredValue = { readable: false };

export function storedValue(value: unknown): StoredValue {
  return { readable: true, value };
}

/** Wraps a backend's plain result, for adapters whose reads cannot fail per key. */
export function toStoredValues(values: Record<string, unknown>): StoredValues {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, storedValue(value)])
  );
}

/** The readable values alone. Only for callers that have handled the unreadable keys. */
export function readableOnly(batch: StoredValues): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(batch)) {
    if (entry.readable) {
      values[key] = entry.value;
    }
  }
  return values;
}

/** The keys that are stored but unreadable, of those asked for. */
export function unreadableKeys(batch: StoredValues): string[] {
  return Object.entries(batch)
    .filter(([, entry]) => !entry.readable)
    .map(([key]) => key);
}
