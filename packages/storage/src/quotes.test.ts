import { configurePlatform, STORAGE_KEYS } from '@cuewise/shared';
import { quoteFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageKeyValueStore } from './local-storage-key-value-store';
import { getQuotes, isCustomQuote, setQuotes, setQuotesRaw, updateQuotes } from './quotes';
import { resetSettingsMigration } from './settings';

// The migration memo lives at module scope, so an earlier test's run would satisfy a later one.
beforeEach(() => {
  vi.restoreAllMocks();
  resetSettingsMigration();
});

describe('setQuotes across the seed and custom keys', () => {
  const writers = { setQuotes, setQuotesRaw };
  const failures = {
    'reports failure': () =>
      Promise.resolve({
        success: false as const,
        error: { type: 'quota_exceeded' as const, message: 'full' },
      }),
    throws: () => Promise.reject(new Error('storage unavailable')),
  };

  it.each([
    ['setQuotes' as const, 'reports failure' as const],
    ['setQuotes' as const, 'throws' as const],
    ['setQuotesRaw' as const, 'reports failure' as const],
    ['setQuotesRaw' as const, 'throws' as const],
  ])('%s puts a moved quote back when the custom write %s', async (writer, mode) => {
    const store = new LocalStorageKeyValueStore();
    configurePlatform({ storage: store });
    const seed = quoteFactory.build({ id: 'seed-1', isCustom: false, isFavorite: false });
    await setQuotes([seed]);

    const original = store.set.bind(store);
    vi.spyOn(store, 'set').mockImplementation(async (key, value, area) => {
      if (key === STORAGE_KEYS.CUSTOM_QUOTES) {
        return failures[mode]();
      }
      return original(key, value, area);
    });

    const result = await writers[writer]([{ ...seed, isFavorite: true }]);
    vi.restoreAllMocks();

    expect(result.success).toBe(false);
    const stored = await getQuotes();
    expect(stored.map((q) => q.id)).toEqual(['seed-1']);
    // The pre-write copy, not the favourited one the failed write was carrying: a rollback that
    // restored the incoming list would land the favourite while reporting failure.
    expect(stored[0]?.isFavorite).toBe(false);
  });
});

describe('updateQuotes', () => {
  it('lets two concurrent writers both land', async () => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    const [first, second] = quoteFactory.buildList(2, { isCustom: true });
    await setQuotes([]);

    await Promise.all([
      updateQuotes((current) => [...current, first]),
      updateQuotes((current) => [...current, second]),
    ]);

    const stored = await getQuotes();
    expect(stored.map((quote) => quote.id).sort()).toEqual([first.id, second.id].sort());
  });

  // Seed and custom quotes live under separate keys, so a writer touching one must still see
  // a concurrent writer's changes to the other.
  it('serialises writers that touch different quote kinds', async () => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    const seed = quoteFactory.build({ id: 'seed-1', isCustom: false });
    const custom = quoteFactory.build({ id: 'custom-1', isCustom: true });
    await setQuotes([seed]);

    await Promise.all([
      updateQuotes((current) => [...current, custom]),
      updateQuotes((current) => current.map((q) => (q.isCustom ? q : { ...q, isFavorite: true }))),
    ]);

    const stored = await getQuotes();
    expect(stored.map((quote) => quote.id).sort()).toEqual(['custom-1', 'seed-1']);
    expect(stored.find((quote) => quote.id === 'seed-1')?.isFavorite).toBe(true);
  });
});

// Pinned directly because the insights-store export mock reimplements this predicate: narrowing
// the original to `isCustom` alone would leave that suite green while a favourited quote silently
// vanished from a "complete" export.
describe('isCustomQuote', () => {
  it.each([
    ['user-created', { isCustom: true }],
    ['a favourited seed quote', { isFavorite: true }],
    ['a hidden seed quote', { isHidden: true }],
  ])("treats %s as the user's", (_label, overrides) => {
    expect(isCustomQuote(quoteFactory.build({ isCustom: false, ...overrides }))).toBe(true);
  });

  it('leaves an untouched seed quote with the seed set', () => {
    const seed = quoteFactory.build({ isCustom: false, isFavorite: false, isHidden: false });

    expect(isCustomQuote(seed)).toBe(false);
  });
});
