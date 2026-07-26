import { configurePlatform, type KeyValueStore, logger } from '@cuewise/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCalendarState,
  getCurrentQuote,
  getGoals,
  getSettings,
  getWeatherState,
} from './storage-helpers';

/** A store that hands back whatever was put on "disk", however malformed. */
function storeHolding(values: Record<string, unknown>): KeyValueStore {
  return {
    supportsSync: true,
    get: async (key: string) => (key in values ? (values[key] as never) : null),
    set: async () => ({ success: true }),
    remove: async () => true,
    getUsage: async () => ({ bytesInUse: 0, quota: 10_000_000 }),
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
