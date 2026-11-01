import { configurePlatform, logger, STORAGE_KEYS } from '@cuewise/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordingStore } from './__fixtures__/recording-store.fixtures';
import {
  getHabitHistory,
  recordHabitDone,
  removeHabitDays,
  removeHabitDaysBefore,
} from './habit-history';
import { LocalStorageKeyValueStore } from './local-storage-key-value-store';
import { resetSettingsMigration, setSettingsPatch } from './settings';

// The migration memo lives at module scope, so an earlier test's run would satisfy a later one.
beforeEach(() => {
  vi.restoreAllMocks();
  resetSettingsMigration();
});

describe('habit history', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records a done in the local area even with Chrome sync on', async () => {
    const { store, areas } = recordingStore();
    configurePlatform({ storage: store });
    await setSettingsPatch({ syncEnabled: true });

    const { result, changedId } = await recordHabitDone('r1', '2026-10-05');

    expect(result.success).toBe(true);
    expect(changedId).toBe('r1:2026-10-05');
    expect(areas.local[STORAGE_KEYS.HABIT_HISTORY]).toEqual([
      { id: 'r1:2026-10-05', reminderId: 'r1', date: '2026-10-05', count: 1 },
    ]);
    expect(areas.sync[STORAGE_KEYS.HABIT_HISTORY]).toBeUndefined();
  });

  it('lets two concurrent dones both land', async () => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });

    await Promise.all([recordHabitDone('r1', '2026-10-05'), recordHabitDone('r1', '2026-10-05')]);

    await expect(getHabitHistory()).resolves.toEqual([
      { id: 'r1:2026-10-05', reminderId: 'r1', date: '2026-10-05', count: 2 },
    ]);
  });

  it('names the expired days it prunes', async () => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    await recordHabitDone('r1', '2025-01-01');

    const { prunedIds } = await recordHabitDone('r1', '2026-10-05');

    expect(prunedIds).toEqual(['r1:2025-01-01']);
    expect((await getHabitHistory()).map((entry) => entry.id)).toEqual(['r1:2026-10-05']);
  });

  it('keeps a stored row this build cannot validate when recording', async () => {
    const newerRow = { id: 'r9:2026-10-01', reminderId: 'r9', date: '2026-10-01', count: 'many' };
    const { store, areas } = recordingStore({
      local: { [STORAGE_KEYS.HABIT_HISTORY]: [newerRow] },
    });
    configurePlatform({ storage: store });

    await recordHabitDone('r1', '2026-10-05');

    expect(areas.local[STORAGE_KEYS.HABIT_HISTORY]).toEqual([
      newerRow,
      { id: 'r1:2026-10-05', reminderId: 'r1', date: '2026-10-05', count: 1 },
    ]);
    expect((await getHabitHistory()).map((entry) => entry.id)).toEqual(['r1:2026-10-05']);
  });

  it.each([
    ['corrupt bytes', '{not json', 'unparseable'],
    ['a value that is not a list', JSON.stringify({ days: [] }), 'object'],
    ['null', JSON.stringify(null), 'null'],
  ])('starts afresh over history stored as %s, so days record', async (_label, item, kind) => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    localStorage.setItem(STORAGE_KEYS.HABIT_HISTORY, item);
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const { result, prunedIds } = await recordHabitDone('r1', '2026-10-05');

    expect(result.success).toBe(true);
    expect(prunedIds).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('afresh'), {
      key: STORAGE_KEYS.HABIT_HISTORY,
      area: 'local',
      kind,
    });
    await expect(getHabitHistory()).resolves.toEqual([
      { id: 'r1:2026-10-05', reminderId: 'r1', date: '2026-10-05', count: 1 },
    ]);
  });

  it('still refuses to record when the history read itself fails', async () => {
    const { store, areas } = recordingStore();
    configurePlatform({ storage: { ...store, getMany: async () => null } });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(recordHabitDone('r1', '2026-10-05')).rejects.toThrow(/could not read/i);
    expect(areas.local[STORAGE_KEYS.HABIT_HISTORY]).toBeUndefined();
  });

  it.each([
    ['removing a habit', () => removeHabitDays('r1')],
    ['sweeping expired days', () => removeHabitDaysBefore('2026-01-01')],
  ])('leaves unreadable history for the next tick when %s', async (_label, remove) => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    localStorage.setItem(STORAGE_KEYS.HABIT_HISTORY, '{not json');
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(remove()).rejects.toThrow(/unreadable/i);
    expect(localStorage.getItem(STORAGE_KEYS.HABIT_HISTORY)).toBe('{not json');
  });

  it.each([
    ['an unpadded date', { id: 'r1:2026-1-5', reminderId: 'r1', date: '2026-1-5', count: 1 }],
    ['an id off its key', { id: 'x', reminderId: 'r1', date: '2026-10-04', count: 1 }],
    ['a zero count', { id: 'r1:2026-10-04', reminderId: 'r1', date: '2026-10-04', count: 0 }],
  ])('hides a stored day with %s from the typed read', async (_label, row) => {
    const { store } = recordingStore({ local: { [STORAGE_KEYS.HABIT_HISTORY]: [row] } });
    configurePlatform({ storage: store });

    await expect(getHabitHistory()).resolves.toEqual([]);
  });

  it('removes every day of one habit and names them', async () => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    await recordHabitDone('r1', '2026-10-04');
    await recordHabitDone('r1', '2026-10-05');
    await recordHabitDone('r2', '2026-10-05');

    const { removedIds } = await removeHabitDays('r1');

    expect(removedIds).toEqual(['r1:2026-10-04', 'r1:2026-10-05']);
    expect((await getHabitHistory()).map((entry) => entry.id)).toEqual(['r2:2026-10-05']);
  });

  it('writes nothing when the habit has no days', async () => {
    const { store, areas } = recordingStore();
    configurePlatform({ storage: store });

    const { result, removedIds } = await removeHabitDays('r1');

    expect(result.success).toBe(true);
    expect(removedIds).toEqual([]);
    expect(areas.local[STORAGE_KEYS.HABIT_HISTORY]).toBeUndefined();
  });

  it('removes every habit’s days before the cutoff and names them', async () => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    await recordHabitDone('r1', '2025-10-04');
    await recordHabitDone('r2', '2025-10-04');
    await recordHabitDone('r2', '2025-10-05');

    const { removedIds } = await removeHabitDaysBefore('2025-10-05');

    expect(removedIds).toEqual(['r1:2025-10-04', 'r2:2025-10-04']);
    expect((await getHabitHistory()).map((entry) => entry.id)).toEqual(['r2:2025-10-05']);
  });

  it('writes nothing when no day is before the cutoff', async () => {
    const day = { id: 'r1:2026-10-05', reminderId: 'r1', date: '2026-10-05', count: 1 };
    const { store, areas } = recordingStore({ local: { [STORAGE_KEYS.HABIT_HISTORY]: [day] } });
    configurePlatform({ storage: store });
    const write = vi.spyOn(store, 'set');

    const { removedIds } = await removeHabitDaysBefore('2025-10-05');

    expect(removedIds).toEqual([]);
    expect(write).not.toHaveBeenCalled();
    expect(areas.local[STORAGE_KEYS.HABIT_HISTORY]).toEqual([day]);
  });
});
