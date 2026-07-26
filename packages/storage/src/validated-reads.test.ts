import { configurePlatform, type KeyValueStore, logger } from '@cuewise/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGoals, getSettings, getWeatherState } from './storage-helpers';

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

  it('is discarded when only one item in the list is broken', async () => {
    const goals = [
      { id: 'g1', text: 'fine', completed: false, createdAt: 'x', date: '2026-07-26' },
      { id: 'g2', text: 'broken', completed: 'nope', createdAt: 'x', date: '2026-07-26' },
    ];
    configurePlatform({ storage: storeHolding({ goals }) });

    await expect(getGoals()).resolves.toEqual([]);
  });

  it('says where it failed, without ever logging the value', async () => {
    const warn = vi.spyOn(logger, 'warn');
    configurePlatform({
      storage: storeHolding({
        weather: { location: null, snapshot: 'not an object', lastFetch: null },
      }),
    });

    await getWeatherState();

    expect(warn).toHaveBeenCalledWith(
      'Discarded an unreadable stored value',
      expect.objectContaining({ key: 'weather', paths: ['snapshot'] })
    );
    // The blob holds the user's own quotes, goals and reminders elsewhere — the path is
    // enough to diagnose a shape change, and the value is never anyone's business.
    expect(JSON.stringify(warn.mock.calls)).not.toContain('not an object');
  });

  it('falls back to defaults rather than a half-broken settings object', async () => {
    configurePlatform({ storage: storeHolding({ settings: { theme: 'dark' } }) });

    const settings = await getSettings();

    expect(settings.theme).toBe('auto');
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
