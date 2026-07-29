import { describe, expect, it } from 'vitest';
import {
  type StoredValues,
  storedValue,
  toStoredValues,
  UNREADABLE_VALUE,
  unreadableKeys,
} from './stored-value';

describe('batch read values', () => {
  it('omits absent keys and keeps a key stored as null', () => {
    const batch = toStoredValues({ nulled: null });

    expect(batch).toEqual({ nulled: storedValue(null) });
    expect(batch.missing).toBeUndefined();
  });

  it('names an unreadable key', () => {
    const batch = { a: storedValue(1), corrupt: UNREADABLE_VALUE };

    expect(unreadableKeys(batch)).toEqual(['corrupt']);
  });

  // The point of the union. A reader that forgets the unreadable arm sees a present entry
  // holding something no value check accepts, so it lands on its refusal/default path — never
  // on "this key was never written", which is what makes a caller seal a tombstone or reseed.
  it('gives a reader that ignores the arm something it cannot mistake for absent', () => {
    const batch = { 'settings.syncEnabled': UNREADABLE_VALUE, goals: UNREADABLE_VALUE };

    const syncEnabled: unknown = batch['settings.syncEnabled'];
    const goals: unknown = batch.goals;

    expect(syncEnabled).toBeDefined();
    expect(typeof syncEnabled).not.toBe('boolean');
    expect(Array.isArray(goals)).toBe(false);
    expect('value' in batch.goals).toBe(false);
  });

  // The other half of the guard: without `| undefined` on the value type, an index read is typed
  // as always present and the two-arm `if (entry.readable) ... else absent` compiles clean.
  it('refuses to compile a reader that indexes without narrowing absence', () => {
    const batch: StoredValues = {};
    const entry = batch['settings.autoRollDueTasks'];

    // @ts-expect-error the absent arm has to be narrowed before `readable` is reachable
    const naive = () => entry.readable;

    expect(naive).toThrow(TypeError);
  });
});
