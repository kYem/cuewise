import {
  configurePlatform,
  DEFAULT_SETTINGS,
  type KeyValueStore,
  logger,
  type StorageArea,
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
  getCalendarState,
  getCollections,
  getConceptCards,
  getCurrentQuote,
  getCustomYoutubePlaylists,
  getGoals,
  getGoalsRaw,
  getPomodoroSessions,
  getPostureStats,
  getQuickLinks,
  getQuotes,
  getQuotesRaw,
  getReminders,
  getSettings,
  getWeatherState,
  getYoutubeProgress,
  setGoals,
  setGoalsRaw,
  setQuotes,
  setQuotesRaw,
  setRemindersRaw,
  setSettings,
  setSettingsRaw,
} from './storage-helpers';

/**
 * A store that hands back whatever was put on "disk", however malformed — and round-trips
 * it through JSON first, because both real adapters mint fresh objects on every read
 * (chrome structured-clones, localStorage parses). A fake that returns the same reference
 * makes reference-identity bugs invisible, which is how one shipped into this file.
 */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function storeHolding(values: Record<string, unknown>): KeyValueStore {
  return {
    supportsSync: true,
    get: async (key: string) => (key in values ? (clone(values[key]) as never) : null),
    set: async () => ({ success: true }),
    remove: async () => true,
    getUsage: async () => ({ bytesInUse: 0, quota: 10_000_000 }),
  };
}

/**
 * The one write-side fake. Records per AREA as well as per key, and round-trips through JSON
 * like the real adapters.
 *
 * Both properties are load-bearing, and both were learned the hard way. A single-map fake let
 * a write to the wrong area pass — `setGoals` to 'local' while `getGoals` reads
 * `getStorageArea()` is total goal loss for every sync-enabled user — and a
 * reference-returning fake hid an identity comparison that can never match in production.
 *
 * There is deliberately no area-blind accessor, and every read of `disk` demands an area.
 * An assertion that cannot name the area cannot catch a write that went to the wrong one,
 * which is the entire reason this exists.
 */
function capturingStore(initial: Record<string, unknown> = {}, seedArea: StorageArea = 'local') {
  const disk = new Map<string, unknown>();
  for (const [key, value] of Object.entries(initial)) {
    disk.set(`${seedArea}:${key}`, value);
  }
  const writes: { key: string; area: StorageArea }[] = [];
  return {
    /** What a reader of that exact area would find. */
    at: (key: string, area: StorageArea = 'local') => clone(disk.get(`${area}:${key}`)),
    /** Whether that exact area was ever written — distinct from `at`, which also sees seed. */
    wroteTo: (key: string, area: StorageArea) =>
      writes.some((w) => w.key === key && w.area === area),
    store: {
      supportsSync: true,
      get: async (key: string, readArea: StorageArea = 'local') =>
        (clone(disk.get(`${readArea}:${key}`)) ?? null) as never,
      set: async (key: string, value: unknown, writeArea: StorageArea = 'local') => {
        disk.set(`${writeArea}:${key}`, clone(value));
        writes.push({ key, area: writeArea });
        return { success: true as const };
      },
      remove: async () => true,
      getUsage: async () => ({ bytesInUse: 0, quota: 10_000_000 }),
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// The failure this exists to prevent is not one bad render. The same blob is read back on
// every open, so a shape the UI cannot handle is a page that is broken every single time —
// which is exactly how ENG-18 lost the whole new tab.
describe('a stored value that no longer matches its shape', () => {
  it('is discarded rather than handed to the caller', async () => {
    configurePlatform({
      storage: storeHolding({ goals: [{ id: 'g1', text: 'no completed flag' }] }),
    });

    await expect(getGoals()).resolves.toEqual([]);
  });

  // This used to assert that one bad item discards the whole list, which is the behaviour
  // the changeset promises against ("that one item is skipped... nothing else is touched").
  // It matters because the stores reload-then-rewrite the whole array: the user's next edit
  // would have persisted the emptiness, turning one malformed row into total loss.
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
    const warn = vi.spyOn(logger, 'warn');
    const goals = [
      { id: 'g1', text: 'fine', completed: false, createdAt: 'x', date: '2026-07-26' },
      { id: 'g2', text: 'a private goal', completed: 'nope', createdAt: 'x', date: '2026-07-26' },
    ];
    configurePlatform({ storage: storeHolding({ goals }) });

    await getGoals();

    expect(warn).toHaveBeenCalledWith(
      'Dropped unreadable items from a stored list',
      expect.objectContaining({ key: 'goals', dropped: 1, of: 2, at: [1] })
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('a private goal');
  });

  it('discards a stored value that is not a list at all', async () => {
    configurePlatform({ storage: storeHolding({ goals: { nope: true } }) });

    await expect(getGoals()).resolves.toEqual([]);
  });

  it('says where it failed, without ever logging the value', async () => {
    const warn = vi.spyOn(logger, 'warn');
    configurePlatform({
      storage: storeHolding({
        currentQuote: { id: 'q1', text: 'a private note', viewCount: 'no' },
      }),
    });

    await getCurrentQuote();

    expect(warn).toHaveBeenCalledWith(
      'Discarded an unreadable stored value',
      expect.objectContaining({ key: 'currentQuote' })
    );
    // The blob holds the user's own quotes, goals and reminders — the path is enough to
    // diagnose a shape change, and the value is never anyone's business.
    expect(JSON.stringify(warn.mock.calls)).not.toContain('a private note');
  });

  // The weather store already salvages location, snapshot and timestamp independently.
  // Validating the whole blob in the read made that unreachable, so a reading this build
  // could not parse took the user's saved city with it — and re-picking one overwrote it.
  it('leaves the weather blob for the store to salvage per field', async () => {
    const stored = { location: { id: 'l1' }, snapshot: 'unreadable', lastFetch: null };
    configurePlatform({ storage: storeHolding({ weather: stored }) });

    await expect(getWeatherState()).resolves.toEqual(stored);
  });

  // Settings is the exception to the discard rule, and this test used to assert the
  // opposite: that a partial blob is thrown away wholesale. That is precisely the bug —
  // a partial blob is what every upgrade produces, and discarding it resets the lot.
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

// Settings is only rewritten when the user changes something, and there is no upgrade
// migration, so a blob written by any earlier release legitimately lacks every field added
// since. Rejecting it wholesale resets every preference — and `syncEnabled` decides the
// storage *area*, so the user's synced goals and quotes would read as empty and the next
// write would persist that as fact.
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
    const areas: string[] = [];
    configurePlatform({
      storage: {
        supportsSync: true,
        get: async (key: string, area: string) => {
          areas.push(`${key}@${area}`);
          if (key === 'settings') {
            return v118 as never;
          }
          return (key === 'goals' && area === 'sync' ? goals : null) as never;
        },
        set: async () => ({ success: true }),
        remove: async () => true,
        getUsage: async () => ({ bytesInUse: 0, quota: 10_000_000 }),
      },
    });

    await expect(getGoals()).resolves.toEqual(goals);
    expect(areas).toContain('goals@sync');
  });

  // One unreadable field must cost that field, not the other 67.
  it('drops only the field it cannot read', async () => {
    configurePlatform({ storage: storeHolding({ settings: { ...v118, theme: 42 } }) });

    const settings = await getSettings();

    expect(settings.theme).toBe('auto');
    expect(settings.colorTheme).toBe('forest');
  });
});

// The same rule the goals read follows: validating is a check, never an edit. Settings is
// the blob most likely to gain fields, and the store rewrites the whole object on every
// change, so dropping an unknown key here deletes it permanently on the next toggle.
describe('a settings blob from a newer build', () => {
  it('keeps the settings this build has never heard of', async () => {
    const stored = { theme: 'dark', somethingAddedLater: 'chosen-by-the-user' };
    configurePlatform({ storage: storeHolding({ settings: stored }) });

    const settings = (await getSettings()) as unknown as Record<string, unknown>;

    expect(settings.somethingAddedLater).toBe('chosen-by-the-user');
    expect(settings.theme).toBe('dark');
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
      lastSync: '2026-07-26',
    });
  });
});

// Sync moves opaque user data between devices and never renders it. If it read through the
// validating helpers, an item this build cannot parse would be invisible to `readAll` —
// and `writeOne` rewrites the whole array, so the next pull would delete it from disk,
// while the cycle would read its absence as a tombstone and delete it on every other
// device too. One device's parse failure must not become a fleet-wide erase.
describe('the raw view sync reads through', () => {
  const unreadable = { id: 'g2', text: 'from a newer build', completed: 'nope' };

  it('still contains an item the rendering read hides', async () => {
    const good = { id: 'g1', text: 'fine', completed: false, createdAt: 'x', date: '2026-07-26' };
    configurePlatform({ storage: storeHolding({ goals: [good, unreadable] }) });

    await expect(getGoals()).resolves.toEqual([good]);
    await expect(getGoalsRaw()).resolves.toEqual([good, unreadable]);
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

// The reader hides what it cannot parse, but every store reloads and writes the whole array
// back — on the first edit, and on load via rollDueTasks and the recurring-reminder
// advance. Without this, opening a tab was enough to erase a quarantined item, taking with
// it the raw copy that export, sync and a future build were meant to recover from.
describe('a whole-list write', () => {
  const readable = { id: 'g1', text: 'fine', completed: false, createdAt: 'x', date: '2026-07-26' };
  const quarantined = { id: 'g2', text: 'from a newer build', completed: 'nope' };

  it('carries the items the caller never saw', async () => {
    const { at, store } = capturingStore({ goals: [readable, quarantined] });
    configurePlatform({ storage: store });

    const visible = await getGoals();
    await setGoals(visible);

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

// A validated reader must get back what it never saw; a raw reader must not, because its
// omissions are deliberate. That split is expressed by which SETTER each one uses, not by
// shared state — an earlier attempt kept a per-key map, and a per-key map cannot express a
// per-caller property: one component's raw read disarmed the guarantee for every other.
describe('who gets their hidden items back', () => {
  const readable = { id: 'g1', text: 'fine', completed: false, createdAt: 'x', date: '2026-07-26' };
  const unreadable = { id: 'g2', text: 'from a newer build', completed: 'nope' };
  const idless = { text: 'no id at all', completed: 'nope' };

  it('gives a validated reader back what it never saw', async () => {
    const { at, store } = capturingStore({ goals: [readable, unreadable] });
    configurePlatform({ storage: store });

    await setGoals(await getGoals());

    expect(at('goals')).toEqual([readable, unreadable]);
  });

  // Every assertion here stands alone: no test depends on state another one left behind.
  it('keeps doing so on a later edit that never re-read', async () => {
    const { at, store } = capturingStore({ goals: [readable, unreadable] });
    configurePlatform({ storage: store });

    const visible = await getGoals();
    await setGoals([...visible, { ...readable, id: 'g3' }]);
    await setGoals(visible);

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

  // The preserve step must not re-append a row the caller already passed in, or the array
  // doubles on every write until it blows the storage quota.
  // Driven through a MIXED caller — a raw read handed to the validated setter — because
  // that is the only path that reaches the guard: a validated read filters the row out, so
  // it is never in `items` and the check is never consulted. Without the guard the row is
  // appended beside itself and doubles on every write until the quota stops all saving.
  it('never duplicates a row the caller already passed in', async () => {
    const { at, store } = capturingStore({ goals: [readable, idless] });
    configurePlatform({ storage: store });

    await setGoals(await getGoalsRaw());
    await setGoals((at('goals') as (typeof readable)[]) ?? []);

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
    const { at, store } = capturingStore({ seedQuotes: [], customQuotes: [goodQuote, badQuote] });
    configurePlatform({ storage: store });

    await setQuotes(await getQuotes());

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

// The lists got a preserving write; settings is the same shape and had not. A known key
// whose value this build cannot parse is defaulted on read, and the store rewrites the whole
// object on any change — so the user's choice was replaced by our default and pushed to the
// device that made it.
describe('a settings value this build cannot parse', () => {
  const stored = { theme: 'dark', colorTheme: 'aurora', somethingAddedLater: 'kept' };

  const settingsWritten = (at: (key: string) => unknown) =>
    at('settings') as Record<string, unknown>;

  it('survives a write of an unrelated setting', async () => {
    const { at, store } = capturingStore({ settings: stored });
    configurePlatform({ storage: store });

    await setSettings({ ...(await getSettings()), theme: 'light' });

    expect(settingsWritten(at).colorTheme).toBe('aurora');
    expect(settingsWritten(at).theme).toBe('light');
  });

  it('still yields to an explicit change of that same setting', async () => {
    const { at, store } = capturingStore({ settings: stored });
    configurePlatform({ storage: store });

    await setSettings({ ...(await getSettings()), colorTheme: 'rose' });

    expect(settingsWritten(at).colorTheme).toBe('rose');
  });
});

// Settings has a raw reader, so it needs a raw writer — the same split the lists use. The
// preserving write cannot tell "the caller reset this to the default" from "the caller
// never saw it", so callers that mean the default use the raw setter.
describe('a settings write that means the default', () => {
  const stored = { theme: 'dark', colorTheme: 'aurora', somethingAddedLater: 'kept' };

  // The one action whose entire job is to clear everything must actually clear the field
  // this build cannot read — otherwise Reset visibly does nothing for that setting.
  it('clears an unreadable field when written raw', async () => {
    const { at, store } = capturingStore({ settings: stored });
    configurePlatform({ storage: store });

    await setSettingsRaw({ ...DEFAULT_SETTINGS });

    expect((at('settings') as Record<string, unknown>).colorTheme).toBe(
      DEFAULT_SETTINGS.colorTheme
    );
  });

  // Sync reads raw and applies a remote value; if that value happens to equal our default,
  // the preserving write would drop it and the pull would be a silent no-op.
  it('lands a remote value that happens to equal our default', async () => {
    const { at, store } = capturingStore({ settings: stored });
    configurePlatform({ storage: store });

    await setSettingsRaw({ ...DEFAULT_SETTINGS, theme: DEFAULT_SETTINGS.theme });

    const written = at('settings') as Record<string, unknown>;
    expect(written.theme).toBe(DEFAULT_SETTINGS.theme);
    // And it does not quietly restore the neighbour it cannot read, which is the whole
    // difference between this setter and the preserving one.
    expect(written.colorTheme).toBe(DEFAULT_SETTINGS.colorTheme);
  });
});

// Two settings default to arrays, and `quote-store` rebuilds one of them with `.filter()`
// on every filter toggle — so an identity comparison against the default is always false
// and the stored value is overwritten. The same identity-vs-value mistake the list writer
// had, one function away.
describe('an unreadable setting whose default is an array', () => {
  const stored = {
    theme: 'dark',
    quoteFilterActiveCollectionIds: [{ id: 'c1', name: 'Stoics' }],
  };

  it('survives a caller that rebuilt the array rather than passing our reference', async () => {
    const { at, store } = capturingStore({ settings: stored });
    configurePlatform({ storage: store });

    const current = await getSettings();
    // A fresh array with the same contents as the default — what `.filter()` produces.
    await setSettings({
      ...current,
      quoteFilterActiveCollectionIds: [...current.quoteFilterActiveCollectionIds],
    });

    expect((at('settings') as Record<string, unknown>).quoteFilterActiveCollectionIds).toEqual(
      stored.quoteFilterActiveCollectionIds
    );
  });
});

/**
 * Every key is wired to a schema by hand, and until this existed most of those wirings were
 * unfalsifiable: swapping `getQuickLinks` onto `conceptCardSchema` — or `getPostureStats`
 * onto `goalSchema` — left the whole monorepo green. The failure is not a type error, it is
 * a collection that reads as empty and is then persisted empty by the next whole-list write.
 *
 * Two directions per key, because one alone proves little: the right row must survive (the
 * schema is not something stricter) and a foreign row must not (it is not something looser).
 * `goal` is the foreign row everywhere except goals, which use `quickLink` instead.
 */
describe('each key is read through its own schema', () => {
  const goal = goalFactory.build();
  const quickLink = { id: 'ql1', title: 'Docs', url: 'https://example.com' };

  const cases: [string, string, unknown, unknown, () => Promise<unknown[]>][] = [
    ['goals', 'goals', goal, quickLink, getGoals],
    ['reminders', 'reminders', reminderFactory.build(), goal, getReminders],
    ['pomodoro sessions', 'pomodoroSessions', pomodoroFactory.build(), goal, getPomodoroSessions],
    ['custom quotes', 'customQuotes', quoteFactory.build(), goal, getQuotes],
    ['concept cards', 'conceptCards', conceptCardFactory.build(), goal, getConceptCards],
    ['quick links', 'quickLinks', quickLink, goal, getQuickLinks],
    [
      'collections',
      'collections',
      { id: 'c1', name: 'Stoics', createdAt: '2026-07-26T00:00:00.000Z' },
      goal,
      getCollections,
    ],
    [
      'posture stats',
      'postureStats',
      { date: '2026-07-26', counts: { good: 1, mild: 0, poor: 0, absent: 0 } },
      goal,
      getPostureStats,
    ],
    [
      'youtube playlists',
      'customYoutubePlaylists',
      { id: 'p1', name: 'Focus', playlistId: 'PL1', isCustom: true },
      goal,
      getCustomYoutubePlaylists,
    ],
    [
      'youtube progress',
      'youtubeProgress',
      { playlistId: 'PL1', videoProgress: [] },
      goal,
      getYoutubeProgress,
    ],
  ];

  it.each(cases)('keeps a valid %s row', async (_label, key, own, _foreign, read) => {
    configurePlatform({ storage: storeHolding({ [key]: [own] }) });

    await expect(read()).resolves.toEqual([own]);
  });

  it.each(
    cases
  )('drops a foreign row stored under %s', async (_label, key, _own, foreign, read) => {
    configurePlatform({ storage: storeHolding({ [key]: [foreign] }) });

    await expect(read()).resolves.toEqual([]);
  });
});

// A single-map fake cannot tell one area from another, so a write aimed at the wrong one
// looks identical to a correct write. For a sync-enabled user that is every goal, gone.
describe('writes land in the area their reader uses', () => {
  const goal = { id: 'g1', text: 'synced', completed: false, createdAt: 'x', date: '2026-07-26' };

  it('writes goals to the sync area when sync is on', async () => {
    const { at, wroteTo, store } = capturingStore({ settings: { syncEnabled: true } });
    configurePlatform({ storage: store });

    await setGoals([goal]);

    expect(at('goals', 'sync')).toEqual([goal]);
    expect(wroteTo('goals', 'local')).toBe(false);
  });

  it('keeps settings in the local area regardless', async () => {
    const { wroteTo, store } = capturingStore({ settings: { syncEnabled: true } });
    configurePlatform({ storage: store });

    await setSettingsRaw({ ...DEFAULT_SETTINGS, syncEnabled: true });

    expect(wroteTo('settings', 'local')).toBe(true);
    expect(wroteTo('settings', 'sync')).toBe(false);
  });

  // The raw setters are the sync write path, so an area mistake there is every synced edit
  // landing where no reader looks. `setGoals` was pinned above and these were not, which is
  // the same gap one function over.
  it.each([
    ['goals', () => setGoalsRaw([goal])],
    ['reminders', () => setRemindersRaw([])],
  ])('sends %s written raw to the sync area too', async (key, write) => {
    const { wroteTo, store } = capturingStore({ settings: { syncEnabled: true } });
    configurePlatform({ storage: store });

    await write();

    expect(wroteTo(key, 'sync')).toBe(true);
    expect(wroteTo(key, 'local')).toBe(false);
  });

  // Quotes split across two keys and only the custom half follows the sync area; the seed
  // half is local by design, so this pins both halves rather than just the one.
  it('sends custom quotes raw to the sync area and keeps seed quotes local', async () => {
    const { wroteTo, store } = capturingStore({ settings: { syncEnabled: true } });
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
    const { store } = capturingStore({ settings: { syncEnabled: true } });
    configurePlatform({ storage: store });

    await setQuotesRaw([quote]);

    await expect(getQuotesRaw()).resolves.toEqual([quote]);
  });
});
