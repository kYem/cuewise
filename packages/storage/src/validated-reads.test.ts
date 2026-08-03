import {
  configurePlatform,
  DEFAULT_SETTINGS,
  type KeyValueStore,
  logger,
  type Settings,
  type StorageArea,
  storedValue,
  UNREADABLE_VALUE,
} from '@cuewise/shared';
import {
  conceptCardFactory,
  goalFactory,
  pomodoroFactory,
  quoteFactory,
  reminderFactory,
} from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSettings,
  getCalendarState,
  getCollections,
  getCollectionsRaw,
  getConceptCards,
  getCurrentQuote,
  getCustomYoutubePlaylists,
  getGoals,
  getGoalsRaw,
  getPomodoroSessions,
  getPomodoroSessionsRaw,
  getPostureStats,
  getQuickLinks,
  getQuotes,
  getQuotesRaw,
  getReminders,
  getRemindersRaw,
  getSettings,
  getSettingsForSync,
  getWeatherState,
  getYoutubeProgress,
  migrateStorageData,
  resetSettingsMigration,
  setCollections,
  setCollectionsRaw,
  setConceptCards,
  setCurrentQuote,
  setGoals,
  setGoalsRaw,
  setPomodoroSessions,
  setPomodoroSessionsRaw,
  setQuickLinks,
  setQuotes,
  setQuotesRaw,
  setReminders,
  setRemindersRaw,
  setSettingsPatch,
  setSettingsPatchRaw,
  settingsStorageKey,
} from './storage-helpers';

/** JSON round-trip on read, like both real adapters: a shared reference hides identity bugs. */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** Seeds `local` only. Area-aware, or every read test built on it is blind to the area. */
function storeHolding(values: Record<string, unknown>, area: StorageArea = 'local'): KeyValueStore {
  return capturingStore(values, area).store;
}

/** Settings as the store holds them: one entry per key, under the `settings.` prefix. */
function settingsEntries(values: Partial<Settings>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [settingsStorageKey(key), value])
  );
}

/**
 * The one write-side fake, keyed per area as well as per key. Do not add an accessor that
 * merges areas: an assertion that cannot name the area cannot catch a write to the wrong one.
 */
function capturingStore(initial: Record<string, unknown> = {}, seedArea: StorageArea = 'local') {
  const disk = new Map<string, unknown>();
  for (const [key, value] of Object.entries(initial)) {
    disk.set(`${seedArea}:${key}`, value);
  }
  const writes: { key: string; area: StorageArea }[] = [];
  const read = (key: string, area: StorageArea) => clone(disk.get(`${area}:${key}`));
  const write = (key: string, value: unknown, area: StorageArea) => {
    disk.set(`${area}:${key}`, clone(value));
    writes.push({ key, area });
  };
  return {
    /** What a reader of that exact area would find. */
    at: (key: string, area: StorageArea = 'local') => read(key, area),
    /** Whether that exact area was ever written — distinct from `at`, which also sees seed. */
    wroteTo: (key: string, area: StorageArea) =>
      writes.some((w) => w.key === key && w.area === area),
    store: {
      supportsSync: true,
      get: async (key: string, readArea: StorageArea = 'local') =>
        (read(key, readArea) ?? null) as never,
      set: async (key: string, value: unknown, writeArea: StorageArea = 'local') => {
        write(key, value, writeArea);
        return { success: true as const };
      },
      remove: async (key: string, removeArea: StorageArea = 'local') => {
        disk.delete(`${removeArea}:${key}`);
        return true;
      },
      getMany: async (keys: string[], readArea: StorageArea = 'local') =>
        Object.fromEntries(
          keys
            .filter((key) => disk.has(`${readArea}:${key}`))
            .map((key) => [key, storedValue(read(key, readArea))])
        ),
      keys: async (prefix: string, readArea: StorageArea = 'local') =>
        [...disk.keys()]
          .filter((key) => key.startsWith(`${readArea}:`))
          .map((key) => key.slice(readArea.length + 1))
          .filter((key) => key.startsWith(prefix)),
      setMany: async (entries: Record<string, unknown>, writeArea: StorageArea = 'local') => {
        for (const [key, value] of Object.entries(entries)) {
          write(key, value, writeArea);
        }
        return { success: true as const };
      },
      removeMany: async (keys: string[], removeArea: StorageArea = 'local') => {
        for (const key of keys) {
          disk.delete(`${removeArea}:${key}`);
        }
        return true;
      },
      getUsage: async () => ({ bytesInUse: 0, quota: 10_000_000 }),
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Module-scoped memo: without this, only the first test in the file runs the migration.
  resetSettingsMigration();
});

// The same blob is read back on every open, so an unhandled shape breaks the page every time.
describe('a stored value that no longer matches its shape', () => {
  it('is discarded rather than handed to the caller', async () => {
    configurePlatform({
      storage: storeHolding({ goals: [{ id: 'g1', text: 'no completed flag' }] }),
    });

    await expect(getGoals()).resolves.toEqual([]);
  });

  // The stores reload-then-rewrite, so emptying the list makes the next edit persist that.
  it('costs the list one item, not all of them', async () => {
    const good = { id: 'g1', text: 'fine', completed: false, createdAt: 'x', date: '2026-07-26' };
    const goals = [
      good,
      { id: 'g2', text: 'broken', completed: 'nope', createdAt: 'x', date: '2026-07-26' },
    ];
    configurePlatform({ storage: storeHolding({ goals }) });

    await expect(getGoals()).resolves.toEqual([good]);
  });

  it('reports how many it dropped and where, never what they held', async () => {
    const error = vi.spyOn(logger, 'error');
    const goals = [
      { id: 'g1', text: 'fine', completed: false, createdAt: 'x', date: '2026-07-26' },
      { id: 'g2', text: 'a private goal', completed: 'nope', createdAt: 'x', date: '2026-07-26' },
    ];
    configurePlatform({ storage: storeHolding({ goals }) });

    await getGoals();

    expect(error).toHaveBeenCalledWith(
      'Dropped unreadable items from a stored list',
      expect.objectContaining({ key: 'goals', dropped: 1, of: 2, at: [1] })
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('a private goal');
  });

  // Not discarded to `[]`, unlike a single bad row: the caller rewrites the whole array from what
  // this answered, so an empty answer is a fleet-wide erase. A wedged list is recoverable.
  it('refuses a stored value that is not a list at all', async () => {
    configurePlatform({ storage: storeHolding({ goals: { nope: true } }) });

    await expect(getGoals()).rejects.toThrow('The stored goals list is unreadable');
  });

  it('names the key it refused, at a level the shipped log level shows', async () => {
    const error = vi.spyOn(logger, 'error');
    configurePlatform({ storage: storeHolding({ goals: { nope: true } }) });

    await expect(getGoals()).rejects.toThrow();

    expect(error).toHaveBeenCalledWith('Refusing to read a stored list this build cannot use', {
      key: 'goals',
      area: 'local',
    });
  });

  it('says where it failed, without ever logging the value', async () => {
    const error = vi.spyOn(logger, 'error');
    configurePlatform({
      storage: storeHolding({
        currentQuote: { id: 'q1', text: 'a private note', viewCount: 'no' },
      }),
    });

    await getCurrentQuote();

    expect(error).toHaveBeenCalledWith(
      'Discarded an unreadable stored value',
      expect.objectContaining({ key: 'currentQuote' })
    );
    // The blob holds the user's own quotes and goals; the path alone diagnoses a shape change.
    expect(JSON.stringify(error.mock.calls)).not.toContain('a private note');
  });

  // The store salvages location, snapshot and timestamp independently; validating the
  // wrapper here would take the saved city with a bad reading.
  it('leaves the weather blob for the store to salvage per field', async () => {
    const stored = { location: { id: 'l1' }, snapshot: 'unreadable', lastFetch: null };
    configurePlatform({ storage: storeHolding({ weather: stored }) });

    await expect(getWeatherState()).resolves.toEqual(stored);
  });

  // A partial blob is what every upgrade produces; discarding it resets every preference.
  it('keeps the settings a partial blob does carry, and defaults the rest', async () => {
    configurePlatform({ storage: storeHolding({ settings: { theme: 'dark' } }) });

    const settings = await getSettings();

    expect(settings.theme).toBe('dark');
    expect(settings.pomodoroWorkDuration).toBe(25);
  });
});

describe('a stored value that still matches', () => {
  it('is returned untouched', async () => {
    const goals = [
      { id: 'g1', text: 'ship it', completed: false, createdAt: 'x', date: '2026-07-26' },
    ];
    configurePlatform({ storage: storeHolding({ goals }) });

    await expect(getGoals()).resolves.toEqual(goals);
  });

  // A newer version may have written fields this build has never heard of. Validating must
  // not become editing: returning zod's stripped copy would delete them, and the next write
  // would persist that deletion — silent data loss on a downgrade or across two synced
  // devices running different versions.
  it('preserves fields the schema does not know about', async () => {
    const goals = [
      {
        id: 'g1',
        text: 'from a newer build',
        completed: false,
        createdAt: 'x',
        date: '2026-07-26',
        somethingAddedLater: { nested: true },
      },
    ];
    configurePlatform({ storage: storeHolding({ goals }) });

    await expect(getGoals()).resolves.toEqual(goals);
  });

  // The same rule as the list read, on the single-value path: zod strips keys the schema
  // does not name, so returning the parsed copy would delete a field a newer build wrote —
  // and `setCurrentQuote`/`setCalendarState` rewrite the whole object, making it permanent.
  it('preserves unknown fields on a single stored object too', async () => {
    const stored = {
      id: 'q1',
      text: 'a quote',
      author: 'A',
      category: 'learning',
      isCustom: true,
      isFavorite: false,
      isHidden: false,
      viewCount: 0,
      somethingAddedLater: 'from v1.21',
    };
    configurePlatform({ storage: storeHolding({ currentQuote: stored }) });

    await expect(getCurrentQuote()).resolves.toEqual(stored);
  });

  it('keeps an optional field that is simply absent', async () => {
    const goals = [
      { id: 'g1', text: 'no subtasks', completed: true, createdAt: 'x', date: '2026-07-26' },
    ];
    configurePlatform({ storage: storeHolding({ goals }) });

    await expect(getGoals()).resolves.toEqual(goals);
  });
});

// A blob from any earlier release legitimately lacks every field added since, and `syncEnabled`
// decides the storage *area* — rejecting it wholesale reads the user's synced data as empty.
describe('a settings blob written by an older release', () => {
  const v118 = {
    theme: 'dark',
    colorTheme: 'forest',
    syncEnabled: true,
    hasSeenOnboarding: true,
    pomodoroWorkDuration: 50,
  };

  it('keeps every choice the user actually made', async () => {
    configurePlatform({ storage: storeHolding({ settings: v118 }) });

    const settings = await getSettings();

    expect(settings.theme).toBe('dark');
    expect(settings.colorTheme).toBe('forest');
    expect(settings.hasSeenOnboarding).toBe(true);
    expect(settings.pomodoroWorkDuration).toBe(50);
  });

  it('fills fields it has never heard of from the defaults', async () => {
    configurePlatform({ storage: storeHolding({ settings: v118 }) });

    const settings = await getSettings();

    expect(settings.showWeather).toBe(false);
    expect(settings.backgroundDim).toBe(0);
  });

  // The worst consequence of an all-or-nothing reject: syncEnabled falls back to false,
  // every subsequent read switches to the local area, and the synced data looks gone.
  it('still reads the sync area, so synced data does not vanish', async () => {
    const goals = [
      { id: 'g1', text: 'synced', completed: false, createdAt: 'x', date: '2026-07-26' },
    ];
    const { store } = capturingStore({ goals }, 'sync');
    await store.set('settings', v118, 'local');
    configurePlatform({ storage: store });

    await expect(getGoals()).resolves.toEqual(goals);
  });

  // One unreadable field must cost that field, not the other 67.
  it('drops only the field it cannot read', async () => {
    configurePlatform({ storage: storeHolding({ settings: { ...v118, theme: 42 } }) });

    const settings = await getSettings();

    expect(settings.theme).toBe('auto');
    expect(settings.colorTheme).toBe('forest');
  });
});

// The same rule the goals read follows: migrating is a move, never an edit. The blob is
// deleted once its keys are across, so a setting dropped on the way has nowhere left to live.
describe('a settings blob from a newer build', () => {
  const stored = { theme: 'dark', somethingAddedLater: 'chosen-by-the-user' };

  it('carries a setting this build has never heard of into its own key', async () => {
    const { at, store } = capturingStore({ settings: stored });
    configurePlatform({ storage: store });

    await getSettings();

    expect(at(settingsStorageKey('somethingAddedLater'))).toBe('chosen-by-the-user');
    expect(at(settingsStorageKey('theme'))).toBe('dark');
  });

  it('leaves that key alone when another setting is written', async () => {
    const { at, store } = capturingStore({
      [settingsStorageKey('somethingAddedLater')]: 'chosen-by-the-user',
    });
    configurePlatform({ storage: store });

    await setSettingsPatch({ theme: 'dark' });

    expect(at(settingsStorageKey('somethingAddedLater'))).toBe('chosen-by-the-user');
  });
});

// `connected` is not recoverable from a bad cache: the store bails when it is false, so the
// user would have to run Google's consent flow again for a connection they never lost.
describe('a calendar cache with one unreadable event', () => {
  it('keeps the connection and drops only that event', async () => {
    const good = { id: 'e1', title: 'Standup', allDay: false, start: 'x', end: 'y' };
    configurePlatform({
      storage: storeHolding({
        calendar: { connected: true, events: [good, { id: 'e2' }], lastSync: '2026-07-26' },
      }),
    });

    await expect(getCalendarState()).resolves.toEqual({
      connected: true,
      events: [good],
      lastSync: null,
    });
  });

  it('clears lastSync, so the store refetches instead of reading the gap as today', async () => {
    const today = new Date().toISOString();
    configurePlatform({
      storage: storeHolding({
        calendar: { connected: true, events: [{ id: 'e2' }], lastSync: today },
      }),
    });

    const state = await getCalendarState();

    expect(state?.lastSync).toBeNull();
  });

  it('leaves lastSync alone when every cached event is readable', async () => {
    const good = { id: 'e1', title: 'Standup', allDay: false, start: 'x', end: 'y' };
    configurePlatform({
      storage: storeHolding({
        calendar: { connected: true, events: [good], lastSync: '2026-07-26' },
      }),
    });

    const state = await getCalendarState();

    expect(state?.lastSync).toBe('2026-07-26');
  });

  // `events` must be an array before the per-item filter, or the read throws a TypeError
  // that no caller catches.
  it.each([
    ['events is not a list', { connected: true, events: 'nope', lastSync: null }],
    ['connected is not a boolean', { connected: 'yes', events: [], lastSync: null }],
    ['lastSync is neither string nor null', { connected: true, events: [], lastSync: 42 }],
  ])('discards the whole cache when %s, without throwing', async (_label, calendar) => {
    configurePlatform({ storage: storeHolding({ calendar }) });

    await expect(getCalendarState()).resolves.toBeNull();
  });

  // Timed fields with the all-day flag set: only the literal discriminator keeps it out.
  it('drops an event whose allDay flag contradicts its date fields', async () => {
    configurePlatform({
      storage: storeHolding({
        calendar: {
          connected: true,
          events: [{ id: 'e1', title: 'Offsite', allDay: true, start: 'x', end: 'y' }],
          lastSync: null,
        },
      }),
    });

    await expect(getCalendarState()).resolves.toEqual({
      connected: true,
      events: [],
      lastSync: null,
    });
  });
});

// One device's parse failure must not become a fleet-wide erase: an item invisible to
// `readAll` is deleted by the next `writeOne` and read as a tombstone everywhere else.
describe('the raw view sync reads through', () => {
  const unreadable = { id: 'g2', text: 'from a newer build', completed: 'nope' };

  it('still contains an item the rendering read hides', async () => {
    const good = { id: 'g1', text: 'fine', completed: false, createdAt: 'x', date: '2026-07-26' };
    configurePlatform({ storage: storeHolding({ goals: [good, unreadable] }) });

    await expect(getGoals()).resolves.toEqual([good]);
    await expect(getGoalsRaw()).resolves.toEqual([good, unreadable]);
  });

  // Shape only. A null row carries no id, so nothing can key it, and every caller spreads the
  // list and reads `.id` off each entry — the whole list would throw for one unusable row.
  it('drops a row with no usable shape and keeps the rest readable', async () => {
    const good = { id: 'g1', text: 'fine', completed: false, createdAt: 'x', date: '2026-07-26' };
    configurePlatform({ storage: storeHolding({ goals: [good, null, 'nope'] }) });

    await expect(getGoalsRaw()).resolves.toEqual([good]);
  });

  // Empty is what the cycle reads as "every id was deleted". A stalled collection is
  // recoverable; a tombstone pushed to every device is not.
  it('refuses a stored list that is not an array rather than reading it as empty', async () => {
    configurePlatform({ storage: storeHolding({ goals: { nope: true } }) });

    await expect(getGoalsRaw()).rejects.toThrow(/unreadable/i);
  });

  it('refuses a list whose read failed', async () => {
    const { store } = capturingStore();
    configurePlatform({
      storage: {
        ...store,
        getMany: async (keys: string[], area: StorageArea = 'local') => {
          if (keys.includes('goals')) {
            return null;
          }
          return store.getMany(keys, area);
        },
      },
    });

    await expect(getGoalsRaw()).rejects.toThrow(/could not read/i);
  });

  it('still reads a list that was never written as empty', async () => {
    configurePlatform({ storage: storeHolding({}) });

    await expect(getGoalsRaw()).resolves.toEqual([]);
  });

  // Both halves, deliberately: custom quotes are the user-authored ones, and if that read
  // regressed to validating, a quote this build cannot parse would vanish from sync's
  // `readAll` — which infers a tombstone from absence and deletes it on every device.
  it('reports it for quotes too, across both the seed and custom lists', async () => {
    const unreadableCustom = { id: 'q3', text: 'user wrote this', category: 'philosophy' };
    configurePlatform({
      storage: storeHolding({ seedQuotes: [unreadable], customQuotes: [unreadableCustom] }),
    });

    await expect(getQuotes()).resolves.toEqual([]);
    await expect(getQuotesRaw()).resolves.toEqual([unreadable, unreadableCustom]);
  });
});

// `[]` is what the quote store seeds on, and seeding rewrites both keys — so a read that
// failed answered as empty erases every custom quote the user wrote.
describe('getQuotes on a read it could not make', () => {
  it('refuses rather than reporting an empty library', async () => {
    const { store } = capturingStore({ customQuotes: [quoteFactory.build()] });
    configurePlatform({
      storage: {
        ...store,
        getMany: async (keys: string[], area: StorageArea = 'local') => {
          if (keys.includes('customQuotes')) {
            return null;
          }
          return store.getMany(keys, area);
        },
      },
    });

    await expect(getQuotes()).rejects.toThrow(/could not read/i);
  });

  it('refuses a stored quotes list that is not an array', async () => {
    configurePlatform({ storage: storeHolding({ customQuotes: { nope: true } }) });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getQuotes()).rejects.toThrow(/unreadable/i);
  });

  it('still reads a library that was never written as empty', async () => {
    configurePlatform({ storage: storeHolding({}) });

    await expect(getQuotes()).resolves.toEqual([]);
  });

  // The three validated list reads that back a whole-array writer. Goals had this alone; a
  // simplification pass that put any of them back on the tolerant helper would restore the erase.
  describe.each([
    ['goals', 'goals', getGoals],
    ['reminders', 'reminders', getReminders],
    ['collections', 'collections', getCollections],
  ] as const)('%s, read through its store', (_name, key, read) => {
    it('refuses a read that failed rather than reporting an empty list', async () => {
      const { store } = capturingStore();
      configurePlatform({
        storage: {
          ...store,
          getMany: async (keys: string[], area: StorageArea = 'local') => {
            if (keys.includes(key)) {
              return null;
            }
            return store.getMany(keys, area);
          },
        },
      });

      await expect(read()).rejects.toThrow(/could not read/i);
    });

    it('refuses a stored value that is not a list', async () => {
      vi.spyOn(logger, 'error').mockImplementation(() => {});
      configurePlatform({ storage: storeHolding({ [key]: { nope: true } }) });

      await expect(read()).rejects.toThrow(/unreadable/i);
    });

    it('still reads a key that was never written as empty', async () => {
      configurePlatform({ storage: storeHolding({}) });

      await expect(read()).resolves.toEqual([]);
    });
  });

  // The legacy key gates the migration. The single-key read answers null for a failed read and
  // for a key that was never written alike, so the gate skips, getQuotes answers [] positively,
  // and the store seeds over the very library the migration was about to move.
  it('refuses when the legacy quotes key is the read that failed', async () => {
    const { store } = capturingStore({ quotes: [quoteFactory.build()] });
    configurePlatform({
      storage: {
        ...store,
        // Both reads, as the real adapters behave: get() has nowhere to report a failure.
        get: async (key: string, area: StorageArea = 'local') => {
          if (key === 'quotes') {
            return null as never;
          }
          return store.get(key, area);
        },
        getMany: async (keys: string[], area: StorageArea = 'local') => {
          if (keys.includes('quotes')) {
            return null;
          }
          return store.getMany(keys, area);
        },
      },
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getQuotes()).rejects.toThrow(/legacy quotes/i);
  });

  it('refuses a legacy quotes key that is stored but unreadable', async () => {
    const { store } = capturingStore({ quotes: [quoteFactory.build()] });
    configurePlatform({
      storage: {
        ...store,
        get: async (key: string, area: StorageArea = 'local') => {
          if (key === 'quotes') {
            return null as never;
          }
          return store.get(key, area);
        },
        getMany: async (keys: string[], area: StorageArea = 'local') => {
          const seen = await store.getMany(keys, area);
          if (seen !== null && keys.includes('quotes')) {
            seen.quotes = UNREADABLE_VALUE;
          }
          return seen;
        },
      },
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getQuotes()).rejects.toThrow(/unreadable/i);
  });
});

// The legacy key is the only copy of those quotes, so it may only be deleted once the copies
// have provably landed.
describe('the legacy quotes migration', () => {
  it('keeps the legacy key when the copy cannot be written', async () => {
    const legacy = [quoteFactory.build({ id: 'q1', isCustom: false })];
    const { store, at } = capturingStore({ quotes: legacy });
    configurePlatform({
      storage: {
        ...store,
        set: async (key: string, value: unknown, area: StorageArea = 'local') => {
          if (key === 'seedQuotes') {
            return {
              success: false as const,
              error: { type: 'quota_exceeded' as const, message: 'Storage full' },
            };
          }
          return store.set(key, value, area);
        },
      },
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getQuotes()).rejects.toThrow(/could not migrate/i);

    expect(at('quotes')).toEqual(legacy);
  });

  it('deletes the legacy key once the copy has landed', async () => {
    const legacy = [quoteFactory.build({ id: 'q1', isCustom: false })];
    const { store, at } = capturingStore({ quotes: legacy });
    configurePlatform({ storage: store });

    await expect(getQuotes()).resolves.toHaveLength(1);

    expect(at('quotes')).toBeUndefined();
  });

  // Sync stands in only for a local key that was never written. Standing in for a local read that
  // FAILED migrates the wrong list and then deletes both — the local one never seen.
  it('refuses rather than migrating from sync when its own local read fails', async () => {
    const { store, at } = capturingStore({ quotes: [quoteFactory.build({ id: 'local-1' })] });
    await store.set('quotes', [quoteFactory.build({ id: 'sync-1' })], 'sync');
    // The gate's read lands; the migration's own read of the same key does not.
    let localReads = 0;
    const localQuotesRead = (area: StorageArea) => {
      if (area !== 'local') {
        return true;
      }
      localReads += 1;
      return localReads === 1;
    };
    configurePlatform({
      storage: {
        ...store,
        get: async (key: string, area: StorageArea = 'local') => {
          if (key === 'quotes' && !localQuotesRead(area)) {
            return null as never;
          }
          return store.get(key, area);
        },
        getMany: async (keys: string[], area: StorageArea = 'local') => {
          if (keys.includes('quotes') && !localQuotesRead(area)) {
            return null;
          }
          return store.getMany(keys, area);
        },
      },
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getQuotes()).rejects.toThrow(/legacy quotes/i);

    expect(at('quotes', 'sync')).toHaveLength(1);
    expect(at('seedQuotes')).toBeUndefined();
  });
});

// Every store reloads and writes the whole array back, on edit and on load, so without this
// opening a tab erases a quarantined item along with the raw copy export and sync need.
describe('a whole-list write', () => {
  const readable = { id: 'g1', text: 'fine', completed: false, createdAt: 'x', date: '2026-07-26' };
  const quarantined = { id: 'g2', text: 'from a newer build', completed: 'nope' };

  // `wroteTo` first, here and below: the expectation equals the seed, so a write that never
  // happened is indistinguishable from one that preserved everything.
  it('carries the items the caller never saw', async () => {
    const { at, wroteTo, store } = capturingStore({ goals: [readable, quarantined] });
    configurePlatform({ storage: store });

    const visible = await getGoals();
    await setGoals(visible);

    expect(wroteTo('goals', 'local')).toBe(true);
    expect(at('goals')).toEqual([readable, quarantined]);
  });

  it('still deletes an item the caller did remove', async () => {
    const { at, store } = capturingStore({ goals: [readable, quarantined] });
    configurePlatform({ storage: store });

    await setGoals([]);

    // The readable one is gone because the caller dropped it; the unreadable one stays,
    // since the caller could not have chosen to delete something it never saw.
    expect(at('goals')).toEqual([quarantined]);
  });
});

// The split is expressed by which SETTER the caller uses, not by shared state: a per-key map
// cannot express a per-caller property.
describe('who gets their hidden items back', () => {
  const readable = { id: 'g1', text: 'fine', completed: false, createdAt: 'x', date: '2026-07-26' };
  const unreadable = { id: 'g2', text: 'from a newer build', completed: 'nope' };
  const idless = { text: 'no id at all', completed: 'nope' };

  it('gives a validated reader back what it never saw', async () => {
    const { at, wroteTo, store } = capturingStore({ goals: [readable, unreadable] });
    configurePlatform({ storage: store });

    await setGoals(await getGoals());

    expect(wroteTo('goals', 'local')).toBe(true);
    expect(at('goals')).toEqual([readable, unreadable]);
  });

  // Every assertion here stands alone: no test depends on state another one left behind.
  it('keeps doing so on a later edit that never re-read', async () => {
    const { at, wroteTo, store } = capturingStore({ goals: [readable, unreadable] });
    configurePlatform({ storage: store });

    const visible = await getGoals();
    await setGoals([...visible, { ...readable, id: 'g3' }]);
    await setGoals(visible);

    expect(wroteTo('goals', 'local')).toBe(true);
    expect(at('goals')).toEqual([readable, unreadable]);
  });

  // Sync reads raw, so the item was in its hands; leaving it out is a deliberate delete and
  // must land, or a pulled tombstone never applies and the goal resurrects on every device.
  it('lets a raw reader delete the very same item', async () => {
    const { at, store } = capturingStore({ goals: [readable, unreadable] });
    configurePlatform({ storage: store });

    const all = await getGoalsRaw();
    await setGoalsRaw(all.filter((goal) => goal.id !== 'g2'));

    expect(at('goals')).toEqual([readable]);
  });

  // The quarantined row is invisible to its own id-keyed reads, so keeping it alongside the
  // replacement would hand every later lookup the broken one.
  it('lets the user re-create an item under a quarantined id, once', async () => {
    const recreated = { ...readable, id: 'g2' };
    const { at, wroteTo, store } = capturingStore({ goals: [unreadable] });
    configurePlatform({ storage: store });

    await setGoals([recreated]);

    expect(wroteTo('goals', 'local')).toBe(true);
    expect(at('goals')).toEqual([recreated]);
  });

  // Driven through a MIXED caller — raw read into the validated setter — because that is the
  // only path reaching the guard: a validated read filters the row out of `items` entirely.
  it('never duplicates a row the caller already passed in', async () => {
    const { at, wroteTo, store } = capturingStore({ goals: [readable, idless] });
    configurePlatform({ storage: store });

    await setGoals(await getGoalsRaw());
    await setGoals((at('goals') as (typeof readable)[]) ?? []);

    expect(wroteTo('goals', 'local')).toBe(true);
    expect(at('goals')).toHaveLength(2);
  });

  it('covers quotes too, which write two keys of their own', async () => {
    const badQuote = { id: 'q2', text: 'newer build', category: 'philosophy' };
    const goodQuote = {
      id: 'q1',
      text: 'fine',
      author: 'A',
      category: 'learning',
      isCustom: true,
      isFavorite: false,
      isHidden: false,
      viewCount: 0,
    };
    const { at, wroteTo, store } = capturingStore({
      seedQuotes: [],
      customQuotes: [goodQuote, badQuote],
    });
    configurePlatform({ storage: store });

    await setQuotes(await getQuotes());

    expect(wroteTo('customQuotes', 'local')).toBe(true);
    expect(at('customQuotes')).toEqual([goodQuote, badQuote]);
  });
});

// The raw setters are what make a delete land. `setQuotesRaw` duplicates `setQuotes`'s
// seed/custom split, so the two can disagree — and it is the one that must NOT preserve.
describe('setQuotesRaw', () => {
  const custom = {
    id: 'q1',
    text: 'mine',
    author: 'A',
    category: 'learning' as const,
    isCustom: true,
    isFavorite: false,
    isHidden: false,
    viewCount: 0,
  };
  const unreadable = { id: 'q2', text: 'newer build', category: 'philosophy', isCustom: true };

  // Sync saw the unreadable quote through the raw read, so omitting it is a deliberate
  // delete. Preserving it here would resurrect a quote deleted on another device.
  it('deletes what the caller left out, on both keys', async () => {
    const { at, store } = capturingStore({ seedQuotes: [], customQuotes: [custom, unreadable] });
    configurePlatform({ storage: store });

    await setQuotesRaw([custom]);

    expect(at('customQuotes')).toEqual([custom]);
    expect(at('seedQuotes')).toEqual([]);
  });

  // It must route each quote to the same key `setQuotes` would, or a round trip through
  // sync would silently move quotes between the seed and custom lists.
  it('splits seed from custom the same way the validated setter does', async () => {
    const seedish = { ...custom, id: 'q3', isCustom: false, isFavorite: false, isHidden: false };
    const { at, store } = capturingStore({ seedQuotes: [], customQuotes: [] });
    configurePlatform({ storage: store });

    await setQuotesRaw([custom, seedish]);

    expect(at('customQuotes')).toEqual([custom]);
    expect(at('seedQuotes')).toEqual([seedish]);
  });
});

// Both quote keys are written by one call, so preservation has to be judged against every id the
// call covers. Per-key it is not: favouriting moves a quote to the sibling key, and the seed
// write's own slice never names it.
describe('setQuotes across the seed/custom split', () => {
  const readable = {
    id: 'q1',
    text: 'mine',
    author: 'A',
    category: 'learning' as const,
    isCustom: false,
    isFavorite: true,
    isHidden: false,
    viewCount: 0,
  };

  it('drops a quarantined row whose replacement landed in the sibling key', async () => {
    const quarantined = { id: 'q1', text: 'older build', category: 'philosophy' };
    const { at, store } = capturingStore({ seedQuotes: [quarantined], customQuotes: [] });
    configurePlatform({ storage: store });

    // Favouriting makes it the user's, so it routes to customQuotes and leaves seedQuotes empty.
    await setQuotes([readable]);

    expect(at('customQuotes')).toEqual([readable]);
    expect(at('seedQuotes')).toEqual([]);
  });

  it('still preserves a quarantined row this write does not replace', async () => {
    const unrelated = { id: 'q9', text: 'older build', category: 'philosophy' };
    const { at, store } = capturingStore({ seedQuotes: [unrelated], customQuotes: [] });
    configurePlatform({ storage: store });

    await setQuotes([readable]);

    expect(at('seedQuotes')).toEqual([unrelated]);
  });
});

// Failing to delete the legacy key is not fatal, so the app keeps running with it in place — and
// the next read would migrate the same quotes over whatever the user did in between.
describe('the legacy quote migration when the legacy key cannot be deleted', () => {
  const seedShape = {
    text: 't',
    author: 'A',
    category: 'learning' as const,
    isCustom: false,
    isFavorite: false,
    isHidden: false,
    viewCount: 0,
  };

  it('empties the key instead, so a retry cannot resurrect a deleted quote', async () => {
    const legacy = { ...seedShape, id: 'q1' };
    const { at, store } = capturingStore({ quotes: [legacy], seedQuotes: [] });
    configurePlatform({ storage: { ...store, remove: async () => false } });

    await getQuotes();

    expect(at('quotes')).toEqual([]);
  });
});

// Deleting the legacy key is allowed to fail, so the migration runs again on the next read.
describe('the legacy quote migration running a second time', () => {
  const seedShape = {
    text: 't',
    author: 'A',
    category: 'learning' as const,
    isCustom: false,
    isFavorite: false,
    isHidden: false,
    viewCount: 0,
  };

  it('merges into the destination instead of overwriting what is already there', async () => {
    const legacy = { ...seedShape, id: 'q1' };
    const addedSince = { ...seedShape, id: 'q2' };
    const { at, store } = capturingStore({ quotes: [legacy], seedQuotes: [addedSince] });
    configurePlatform({ storage: store });

    await getQuotes();

    const ids = (at('seedQuotes') as { id: string }[]).map((quote) => quote.id).sort();
    expect(ids).toEqual(['q1', 'q2']);
  });
});

// A key this build cannot parse is defaulted on read, and that default must never be mistaken
// for the user's choice and written back over what they actually picked.
describe('a settings value this build cannot parse', () => {
  const stored = {
    [settingsStorageKey('theme')]: 'dark',
    [settingsStorageKey('colorTheme')]: 'aurora',
  };

  it('survives a write of an unrelated setting', async () => {
    const { at, store } = capturingStore(stored);
    configurePlatform({ storage: store });

    await setSettingsPatch({ theme: 'light' });

    expect(at(settingsStorageKey('colorTheme'))).toBe('aurora');
    expect(at(settingsStorageKey('theme'))).toBe('light');
  });

  it('still yields to an explicit change of that same setting', async () => {
    const { at, store } = capturingStore(stored);
    configurePlatform({ storage: store });

    await setSettingsPatch({ colorTheme: 'rose' });

    expect(at(settingsStorageKey('colorTheme'))).toBe('rose');
  });

  it('is refused as a write, so no read has to default it again', async () => {
    const { at, store } = capturingStore();
    configurePlatform({ storage: store });

    const result = await setSettingsPatch({ colorTheme: 'aurora' as never });

    expect(result.success).toBe(false);
    expect(at(settingsStorageKey('colorTheme'))).toBeUndefined();
  });

  // Sync applies what a peer on another version chose; dropping it here would lose a value
  // this build simply cannot name yet.
  it('is stored anyway when sync applies it, and defaulted on the way out', async () => {
    const { at, store } = capturingStore();
    configurePlatform({ storage: store });

    await setSettingsPatchRaw({ colorTheme: 'aurora' as never });

    expect(at(settingsStorageKey('colorTheme'))).toBe('aurora');
    await expect(getSettings()).resolves.toMatchObject({
      colorTheme: DEFAULT_SETTINGS.colorTheme,
    });
  });
});

describe('a settings write that means the default', () => {
  const stored = {
    [settingsStorageKey('theme')]: 'dark',
    [settingsStorageKey('colorTheme')]: 'aurora',
  };

  // The one action whose entire job is to clear everything must actually clear the field
  // this build cannot read — otherwise Reset visibly does nothing for that setting.
  it('clears an unreadable field on a reset', async () => {
    const { at, store } = capturingStore(stored);
    configurePlatform({ storage: store });

    await clearSettings();

    expect(at(settingsStorageKey('colorTheme'))).toBeUndefined();
    await expect(getSettings()).resolves.toMatchObject({
      colorTheme: DEFAULT_SETTINGS.colorTheme,
    });
  });

  // Absence is how a default is expressed, so a pulled default has to be written rather than
  // skipped as "already what we have".
  it('lands a remote value that happens to equal our default', async () => {
    const { at, store } = capturingStore(stored);
    configurePlatform({ storage: store });

    await setSettingsPatch({ theme: DEFAULT_SETTINGS.theme });

    expect(at(settingsStorageKey('theme'))).toBe(DEFAULT_SETTINGS.theme);
  });
});

// Two settings default to arrays and `quote-store` rebuilds one with `.filter()` per toggle,
// so an identity comparison against the default never matches.
describe('an unreadable setting whose default is an array', () => {
  const stored = {
    [settingsStorageKey('quoteFilterActiveCollectionIds')]: [{ id: 'c1', name: 'Stoics' }],
  };

  it('survives a caller that rebuilt the other array rather than passing our reference', async () => {
    const { at, wroteTo, store } = capturingStore(stored);
    configurePlatform({ storage: store });

    const current = await getSettings();
    // A fresh array with the same contents as the default — what `.filter()` produces.
    await setSettingsPatch({
      quoteFilterEnabledCategories: [...current.quoteFilterEnabledCategories],
    });

    expect(wroteTo(settingsStorageKey('quoteFilterEnabledCategories'), 'local')).toBe(true);
    expect(at(settingsStorageKey('quoteFilterActiveCollectionIds'))).toEqual(
      stored[settingsStorageKey('quoteFilterActiveCollectionIds')]
    );
  });
});

/**
 * A key on the wrong schema is not a type error — it is a collection that reads as empty and
 * is then persisted empty by the next whole-list write.
 *
 * Three directions per key. The near-miss is the load-bearing one: a foreign row differs in
 * too many fields for any single widening to let it through, so only a row that is valid
 * except for one field can pin what the schema still checks.
 */
describe('each key is read through its own schema', () => {
  const goal = goalFactory.build();
  const quickLink = { id: 'ql1', title: 'Docs', url: 'https://example.com' };
  const card = conceptCardFactory.build();
  const collection = { id: 'c1', name: 'Stoics', createdAt: '2026-07-26T00:00:00.000Z' };
  const posture = { date: '2026-07-26', counts: { good: 1, mild: 0, poor: 0, absent: 0 } };
  const playlist = { id: 'p1', name: 'Focus', playlistId: 'PL1', isCustom: true };
  const progress = { playlistId: 'PL1', videoProgress: [] };

  type Case = [string, string, unknown, unknown, unknown, () => Promise<unknown[]>];
  const cases: Case[] = [
    ['goals', 'goals', goal, quickLink, { ...goal, subtasks: 'not a list' }, getGoals],
    [
      'reminders',
      'reminders',
      reminderFactory.build(),
      goal,
      { ...reminderFactory.build(), recurring: 'weekly-ish' },
      getReminders,
    ],
    [
      'pomodoro sessions',
      'pomodoroSessions',
      pomodoroFactory.build(),
      goal,
      { ...pomodoroFactory.build(), type: 'meditation' },
      getPomodoroSessions,
    ],
    [
      'custom quotes',
      'customQuotes',
      quoteFactory.build(),
      goal,
      { ...quoteFactory.build(), category: 'philosophy' },
      getQuotes,
    ],
    ['concept cards', 'conceptCards', card, goal, { ...card, schedule: 'soon' }, getConceptCards],
    ['quick links', 'quickLinks', quickLink, goal, { ...quickLink, url: 42 }, getQuickLinks],
    [
      'collections',
      'collections',
      collection,
      goal,
      { ...collection, createdAt: 1_700_000_000 },
      getCollections,
    ],
    ['posture stats', 'postureStats', posture, goal, { ...posture, counts: 4 }, getPostureStats],
    [
      'youtube playlists',
      'customYoutubePlaylists',
      playlist,
      goal,
      { ...playlist, isCustom: 'yes' },
      getCustomYoutubePlaylists,
    ],
    [
      'youtube progress',
      'youtubeProgress',
      progress,
      goal,
      { ...progress, videoProgress: [{ videoId: 'v1', timestamp: 'start', updatedAt: 'x' }] },
      getYoutubeProgress,
    ],
  ];

  it.each(cases)('keeps a valid %s row', async (_label, key, own, _foreign, _near, read) => {
    configurePlatform({ storage: storeHolding({ [key]: [own] }) });

    await expect(read()).resolves.toEqual([own]);
  });

  it.each(
    cases
  )('drops a foreign row stored under %s', async (_label, key, _own, foreign, _near, read) => {
    configurePlatform({ storage: storeHolding({ [key]: [foreign] }) });

    await expect(read()).resolves.toEqual([]);
  });

  it.each(
    cases
  )('drops a %s row with one field wrong', async (_label, key, _own, _foreign, near, read) => {
    configurePlatform({ storage: storeHolding({ [key]: [near] }) });

    await expect(read()).resolves.toEqual([]);
  });

  // One level down: a valid parent carrying exactly one bad child.
  it.each([
    [
      'a subtask that is not shaped like one',
      'goals',
      { ...goal, subtasks: [{ id: 's1', text: 'walk', completed: 'nope' }] },
      getGoals,
    ],
    [
      'a non-string collection id',
      'customQuotes',
      { ...quoteFactory.build(), collectionIds: [42] },
      getQuotes,
    ],
    [
      'one non-numeric count among three good ones',
      'postureStats',
      { ...posture, counts: { ...posture.counts, good: 'lots' } },
      getPostureStats,
    ],
  ])('drops a row carrying %s', async (_label, key, row, read) => {
    configurePlatform({ storage: storeHolding({ [key]: [row] }) });

    await expect(read()).resolves.toEqual([]);
  });
});

// A write aimed at the wrong area is every goal gone, for a sync-enabled user.
describe('writes land in the area their reader uses', () => {
  const goal = { id: 'g1', text: 'synced', completed: false, createdAt: 'x', date: '2026-07-26' };
  const reminder = reminderFactory.build();
  const session = pomodoroFactory.build();
  const card = conceptCardFactory.build();
  const collection = { id: 'c1', name: 'Stoics', createdAt: '2026-07-26T00:00:00.000Z' };
  const quickLink = { id: 'ql1', title: 'Docs', url: 'https://example.com' };
  const quote = quoteFactory.build({ isCustom: true });

  /** Both polarities: one alone lets a helper hardcoded to the other side pass. */
  async function expectFollowsSyncToggle(
    key: string,
    entity: unknown,
    write: () => Promise<unknown>,
    read: () => Promise<unknown>,
    { list = true }: { list?: boolean } = {}
  ): Promise<void> {
    for (const syncEnabled of [true, false]) {
      const expectedArea: StorageArea = syncEnabled ? 'sync' : 'local';
      const otherArea: StorageArea = syncEnabled ? 'local' : 'sync';
      const { wroteTo, store } = capturingStore(settingsEntries({ syncEnabled }));
      configurePlatform({ storage: store });

      await write();

      expect({ syncEnabled, wrote: wroteTo(key, expectedArea) }).toEqual({
        syncEnabled,
        wrote: true,
      });
      expect({ syncEnabled, wroteElsewhere: wroteTo(key, otherArea) }).toEqual({
        syncEnabled,
        wroteElsewhere: false,
      });
      await expect(read()).resolves.toEqual(list ? [entity] : entity);
    }
  }

  it('writes goals to the sync area when sync is on', async () => {
    const { at, wroteTo, store } = capturingStore(settingsEntries({ syncEnabled: true }));
    configurePlatform({ storage: store });

    await setGoals([goal]);

    expect(at('goals', 'sync')).toEqual([goal]);
    expect(wroteTo('goals', 'local')).toBe(false);
  });

  it('keeps settings in the local area regardless', async () => {
    const { wroteTo, store } = capturingStore(settingsEntries({ syncEnabled: true }));
    configurePlatform({ storage: store });

    await setSettingsPatch({ theme: 'dark' });

    expect(wroteTo(settingsStorageKey('theme'), 'local')).toBe(true);
    expect(wroteTo(settingsStorageKey('theme'), 'sync')).toBe(false);
  });

  /**
   * Both sides, both paths. The raw readers are the sync engine's `readAll`, and one pointed
   * at the wrong area returns `[]` — which the cycle reads as a tombstone for every entity.
   */
  describe.each([
    [
      'goals',
      'goals',
      goal,
      () => setGoals([goal as never]),
      getGoals,
      () => setGoalsRaw([goal as never]),
      getGoalsRaw,
    ],
    [
      'reminders',
      'reminders',
      reminder,
      () => setReminders([reminder as never]),
      getReminders,
      () => setRemindersRaw([reminder as never]),
      getRemindersRaw,
    ],
    [
      'collections',
      'collections',
      collection,
      () => setCollections([collection as never]),
      getCollections,
      () => setCollectionsRaw([collection as never]),
      getCollectionsRaw,
    ],
    [
      'pomodoro sessions',
      'pomodoroSessions',
      session,
      () => setPomodoroSessions([session as never]),
      getPomodoroSessions,
      () => setPomodoroSessionsRaw([session as never]),
      getPomodoroSessionsRaw,
    ],
  ])('%s', (_label, key, entity, setValidated, getValidated, setRaw, getRaw) => {
    it.each([
      ['validated', setValidated, getValidated],
      ['raw', setRaw, getRaw],
    ])('follows the sync toggle on the %s path', async (_path, write, read) => {
      await expectFollowsSyncToggle(key, entity, write, read);
    });
  });

  // No raw counterpart — neither is synced — but both had their area line rewritten by this
  // branch, and both are read back through `getStorageArea()` on the very next page load.
  it.each([
    ['quickLinks', quickLink, () => setQuickLinks([quickLink as never]), getQuickLinks],
    ['conceptCards', card, () => setConceptCards([card as never]), getConceptCards],
  ])('%s follows the sync toggle', async (key, entity, write, read) => {
    await expectFollowsSyncToggle(key, entity, write, read);
  });

  // The custom half follows the toggle; the seed half is local forever.
  it('sends custom quotes with the toggle and pins seed quotes to local', async () => {
    await expectFollowsSyncToggle(
      'customQuotes',
      quote,
      () => setQuotes([quote as never]),
      async () => (await getQuotes()).filter((q) => q.isCustom)
    );
  });

  // A real seed quote, not an empty seed list: otherwise the seed-half read can be flipped
  // to `sync` and still find the nothing it expected.
  it.each([
    ['raw', (q: unknown[]) => setQuotesRaw(q as never), getQuotesRaw],
    ['validated', (q: unknown[]) => setQuotes(q as never), getQuotes],
  ])('keeps seed quotes local on the %s path even with sync on', async (_path, write, read) => {
    const seedQuote = quoteFactory.build({ id: 'seed-1', isCustom: false });
    const { wroteTo, store } = capturingStore(settingsEntries({ syncEnabled: true }));
    configurePlatform({ storage: store });

    await write([seedQuote, quote]);

    expect(wroteTo('seedQuotes', 'local')).toBe(true);
    expect(wroteTo('seedQuotes', 'sync')).toBe(false);
    await expect(read()).resolves.toEqual([seedQuote, quote]);
  });

  // A single value, so it misses every table above, and it is written on every new tab open.
  it('lets currentQuote follow the sync toggle', async () => {
    await expectFollowsSyncToggle(
      'currentQuote',
      quote,
      () => setCurrentQuote(quote as never),
      getCurrentQuote,
      { list: false }
    );
  });

  // Settings cannot follow the area it decides. The writer is pinned above; this is the reader.
  it('reads settings for sync out of the local area, never the synced one', async () => {
    const { store } = capturingStore(settingsEntries({ ...DEFAULT_SETTINGS, syncEnabled: true }));
    configurePlatform({ storage: store });

    await expect(getSettingsForSync()).resolves.toMatchObject({ syncEnabled: true });
  });

  // Quotes split across two keys and only the custom half follows the sync area; the seed
  // half is local by design, so this pins both halves rather than just the one.
  it('sends custom quotes raw to the sync area and keeps seed quotes local', async () => {
    const { wroteTo, store } = capturingStore(settingsEntries({ syncEnabled: true }));
    configurePlatform({ storage: store });

    await setQuotesRaw([]);

    expect(wroteTo('customQuotes', 'sync')).toBe(true);
    expect(wroteTo('seedQuotes', 'local')).toBe(true);
    expect(wroteTo('seedQuotes', 'sync')).toBe(false);
  });

  it('reads custom quotes back from the area it wrote them to', async () => {
    const quote = {
      id: 'q1',
      text: 'synced',
      author: 'A',
      category: 'learning' as const,
      isCustom: true,
      isFavorite: false,
      isHidden: false,
      viewCount: 0,
    };
    const { store } = capturingStore(settingsEntries({ syncEnabled: true }));
    configurePlatform({ storage: store });

    await setQuotesRaw([quote]);

    await expect(getQuotesRaw()).resolves.toEqual([quote]);
  });
});

// The one path that moves every collection at once, run on a sync toggle. `null` covers both
// "the source never wrote this" and "the read failed", and the second copied emptiness across.
describe('migrateStorageData', () => {
  it('writes nothing when the source area cannot be read', async () => {
    const destination = [goalFactory.build({ id: 'g1' })];
    const { store, wroteTo } = capturingStore({ goals: destination }, 'sync');
    configurePlatform({ storage: { ...store, getMany: async () => null } });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    const result = await migrateStorageData('local', 'sync');

    expect(result.success).toBe(false);
    expect(wroteTo('goals', 'sync')).toBe(false);
  });

  it('refuses when a source value is stored but unreadable', async () => {
    const { store, wroteTo } = capturingStore({ goals: [] }, 'local');
    configurePlatform({
      storage: {
        ...store,
        getMany: async (keys: string[], area: StorageArea = 'local') => {
          const seen = await store.getMany(keys, area);
          if (seen !== null && keys.includes('goals')) {
            seen.goals = UNREADABLE_VALUE;
          }
          return seen;
        },
      },
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    const result = await migrateStorageData('local', 'sync');

    expect(result.success).toBe(false);
    expect(wroteTo('goals', 'sync')).toBe(false);
  });

  it('leaves a destination key alone when the source never wrote it', async () => {
    const { store, wroteTo } = capturingStore({ customQuotes: [] }, 'local');
    configurePlatform({ storage: store });

    const result = await migrateStorageData('local', 'sync');

    expect(result.success).toBe(true);
    expect(wroteTo('customQuotes', 'sync')).toBe(true);
    expect(wroteTo('goals', 'sync')).toBe(false);
  });

  it('copies what the source does hold', async () => {
    const goals = goalFactory.buildList(2);
    const { store, at } = capturingStore({ goals }, 'local');
    configurePlatform({ storage: store });

    await expect(migrateStorageData('local', 'sync')).resolves.toEqual({ success: true });

    expect(at('goals', 'sync')).toEqual(goals);
  });
});
